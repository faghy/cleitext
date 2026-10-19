/**
 * Moving an entry's content from one editor to another: the editor that made
 * it turns it into block editor content (`toBlocks`), the target editor
 * turns that into its own (`fromBlocks`). The block editor is the common
 * language, so any two editors with converters can exchange pages.
 *
 * Pure functions, without React or the network, so they can be tested.
 */
import type { SiteEditor } from '@cleitext/admin-sdk';
import type { CxdBlock, CxdDocument } from '@cleitext/blocks';

/** The block editor's id among the site's editors (plugin API 1.26). */
export const BLOCK_EDITOR = 'blocks';

/** The editor that made a document: `blocks` for the block editor. */
export function editorOf(document: CxdDocument | null | undefined): string {
  const id = document?.editor?.id;
  return id && id !== BLOCK_EDITOR ? id : BLOCK_EDITOR;
}

/** Elements of a document, nested ones included. */
export function countNodes(blocks: readonly CxdBlock[] | undefined): number {
  return (blocks ?? []).reduce((sum, block) => sum + 1 + countNodes(block.children), 0);
}

/** Every node of a document, depth first. */
function* walk(blocks: readonly CxdBlock[] | undefined): Generator<CxdBlock> {
  for (const block of blocks ?? []) {
    yield block;
    yield* walk(block.children);
  }
}

const namespaceOf = (type: string) => type.slice(0, type.indexOf('/'));

/** Keys whose values are text people wrote (titles, texts, captions…). */
const TEXT_KEY =
  /^(_?title|text|content|heading|label|caption|description|name|job|question|answer|excerpt|quote|code|prefix|suffix|inner|caption_text|subtitle|alt)$/i;
/** Keys that hold media, links and styles: nothing to read there. */
const SKIP_KEY =
  /(icon|image|media|link|url|href|src|style|color|background|border|shadow|font|class|css|anchor)/i;

/** The words of a value: HTML tags and entities dropped, letters only, lower case. */
function wordsIn(value: string, into: Set<string>): void {
  const text = value
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, ' ');
  for (const word of text.toLowerCase().match(/\p{L}{3,}/gu) ?? []) into.add(word);
}

function collect(value: unknown, key: string, into: Set<string>): void {
  if (typeof value === 'string') {
    if (TEXT_KEY.test(key)) wordsIn(value, into);
    return;
  }
  if (SKIP_KEY.test(key) && key !== 'content') return;
  if (Array.isArray(value)) {
    for (const item of value) collect(item, key, into);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collect(v, k, into);
  }
}

/** The words people can read in a document: rich text, and texts in the elements' settings. */
export function documentWords(document: CxdDocument): Set<string> {
  const words = new Set<string>();
  for (const block of walk(document.blocks)) {
    collect(block.content ?? [], 'content', words);
    collect(block.attrs, '', words);
  }
  return words;
}

export type ConversionError =
  /** It already uses the target editor. */
  | 'same-editor'
  /** The editor that made it is not active (or the user may not use it). */
  | 'source-missing'
  /** That editor cannot give its content back as blocks. */
  | 'no-to-blocks'
  /** The target editor cannot take block editor content. */
  | 'no-from-blocks'
  /** The target editor is not for this content type. */
  | 'type-not-supported'
  /** A converter failed (the message is in `detail`). */
  | 'failed';

export interface ConversionPlan {
  source: string;
  target: string;
  error?: ConversionError;
  detail?: string;
  /** The converted document, when there is no error. */
  document?: CxdDocument;
  /** Elements before and after. */
  before: number;
  after: number;
  /**
   * Blocks the target editor keeps as they are, without an element of its
   * own (e.g. a table inside a page builder's block element), by type.
   */
  keptAsBlocks: string[];
  /** Custom HTML blocks in the result: content that did not become native blocks. */
  htmlBlocks: number;
  /** Elements of the source editor left in the result (it cannot show them). */
  leftover: string[];
  /** Words of the original that are not in the result (a sample). */
  missingWords: string[];
  /** Share of the original's words found in the result, from 0 to 1. */
  textKept: number;
}

/**
 * Plans the conversion of one document to the target editor, without saving
 * anything: the converted document and what changes on the way.
 */
export function planConversion(
  document: CxdDocument,
  entryType: string,
  editors: readonly SiteEditor[],
  targetId: string,
): ConversionPlan {
  const source = editorOf(document);
  const plan: ConversionPlan = {
    source,
    target: targetId,
    before: countNodes(document.blocks),
    after: 0,
    keptAsBlocks: [],
    htmlBlocks: 0,
    leftover: [],
    missingWords: [],
    textKept: 1,
  };
  const fail = (error: ConversionError, detail?: string): ConversionPlan => ({
    ...plan,
    error,
    ...(detail ? { detail } : {}),
  });
  if (source === targetId) return fail('same-editor');
  const from = editors.find((e) => e.id === source);
  const to = editors.find((e) => e.id === targetId);
  if (!to) return fail('type-not-supported');
  if (to.types && !to.types.includes(entryType)) return fail('type-not-supported');
  if (source !== BLOCK_EDITOR && !from) return fail('source-missing');
  if (source !== BLOCK_EDITOR && !from?.toBlocks) return fail('no-to-blocks');
  if (targetId !== BLOCK_EDITOR && !to.fromBlocks) return fail('no-from-blocks');

  let result: CxdDocument;
  try {
    // Converters may change what they get: each works on its own copy.
    const blocks =
      source === BLOCK_EDITOR
        ? { schema: document.schema, blocks: structuredClone(document.blocks) }
        : from!.toBlocks!(structuredClone(document));
    const plain: CxdDocument = { schema: blocks.schema, blocks: blocks.blocks };
    if (targetId === BLOCK_EDITOR) {
      result = plain;
    } else {
      const converted = to.fromBlocks!(plain);
      // Documents of a plugin editor carry its id, so they open with it.
      result = {
        schema: converted.schema,
        blocks: converted.blocks,
        editor: { ...converted.editor, id: targetId },
      };
    }
  } catch (error) {
    return fail('failed', error instanceof Error ? error.message : String(error));
  }

  const kept = new Set<string>();
  const leftover = new Set<string>();
  let html = 0;
  const inspect = (blocks: readonly CxdBlock[] | undefined, insideKept: boolean) => {
    for (const node of blocks ?? []) {
      const namespace = namespaceOf(node.type);
      if (node.type === 'core/html') html++;
      if (source !== BLOCK_EDITOR && namespace === source) leftover.add(node.type);
      // Inside a page builder, blocks that are not its own elements are kept as they are
      // (only the outermost one is named).
      const foreign = targetId !== BLOCK_EDITOR && namespace !== targetId;
      if (foreign && !insideKept) kept.add(node.type);
      inspect(node.children, insideKept || foreign);
    }
  };
  inspect(result.blocks, false);
  const original = documentWords(document);
  const now = documentWords(result);
  const missing = [...original].filter((word) => !now.has(word));
  return {
    ...plan,
    document: result,
    after: countNodes(result.blocks),
    keptAsBlocks: [...kept].sort(),
    htmlBlocks: html,
    leftover: [...leftover].sort(),
    missingWords: missing.slice(0, 12),
    textKept: original.size === 0 ? 1 : (original.size - missing.length) / original.size,
  };
}

/** The title of a copy: the original's, with the target editor's name. */
export function copyTitle(title: string, editorTitle: string): string {
  return `${title.trim() || '—'} (${editorTitle})`.slice(0, 300);
}
