import type { CxdBlock, CxdDocument } from './cxd.js';
import type { CxdInline } from './marks.js';
import { htmlToInline } from './inline.js';

/**
 * Block bindings (plugin API 1.48): an attribute of a core block (a
 * paragraph's text, an image, a button's link…) shows a dynamic source (an
 * entry's field, an option, the site's title…) instead of what was typed,
 * as WordPress's Block Bindings: `attrs.metadata.bindings[<attribute>] =
 * { source: 'cleitext/field', args: { key: '<source id>' } }`. What was
 * typed stays as the fallback, shown when the source has no value. The
 * Field block shows a source formatted; Field rows repeats its blocks for
 * each row of a list (or each related entry, term or member).
 */

export const BINDING_SOURCE = 'cleitext/field';
export const FIELD_BLOCK = 'cleitext/field';
export const FIELD_ROWS_BLOCK = 'cleitext/field-rows';
/** One row of a Field rows block, made when rendering (never stored). */
export const FIELD_ROW_BLOCK = 'cleitext/field-row';
/** At most this many rows are repeated. */
export const MAX_FIELD_ROWS = 200;

export interface BlockBinding {
  source: string;
  args?: { key?: string };
}

/**
 * What can be bound, by block type and attribute (as WordPress names them):
 * `text` takes any value shown as text, `url` an address, `media` an image.
 */
export const BINDABLE_ATTRIBUTES: Record<string, Record<string, 'text' | 'url' | 'media'>> = {
  'core/paragraph': { content: 'text' },
  'core/heading': { content: 'text' },
  'core/list-item': { content: 'text' },
  'core/button': { text: 'text', url: 'url' },
  'core/image': { id: 'media', url: 'media', alt: 'text', caption: 'text', href: 'url' },
  'core/embed': { url: 'url' },
};

/** A source's value as resolved for a binding. */
export interface BoundValue {
  value: unknown;
  /** What it is (`text`, `richtext`, `media`, `list`…): a field's kind, when known. */
  kind?: string;
  /** Lists: what each row is (rows of fields, or related entries, terms, members). */
  rowKind?: 'fields' | 'entry' | 'term' | 'user';
}

/** What a binding is resolved against: the page by default, a row inside Field rows. */
export interface BindingScope {
  /** The row of a list of fields shown (`row.field:<name>` sources read it). */
  row?: Record<string, unknown>;
  /** The source of the rows, inside Field rows. */
  rowSource?: string;
  entry?: { id: string };
  term?: { id: string };
  user?: { id: string };
}

export type BindingResolver = (
  key: string,
  scope: BindingScope,
) => Promise<BoundValue | undefined> | BoundValue | undefined;

/**
 * The resolved value given to the Field and Field rows blocks when
 * rendering: a symbol, so stored attributes can never pretend to have one.
 */
export const BOUND = Symbol.for('cleitext.bound');

export interface BoundBlockData extends BoundValue {
  /** The page's language, for dates. */
  locale: string;
}

/** The bindings of a block, by attribute (only the core's source, with a key). */
export function blockBindings(block: CxdBlock): Record<string, string> {
  const metadata = block.attrs.metadata as { bindings?: Record<string, BlockBinding> } | undefined;
  const bindings = metadata?.bindings;
  const out: Record<string, string> = {};
  if (!bindings || typeof bindings !== 'object') return out;
  for (const [attribute, binding] of Object.entries(bindings)) {
    const key = binding?.args?.key;
    if (binding?.source === BINDING_SOURCE && typeof key === 'string' && key) out[attribute] = key;
  }
  return out;
}

/** Whether a document has bindings, Field or Field rows blocks (nothing to resolve otherwise). */
export function hasBindings(document: CxdDocument | null | undefined): boolean {
  const walk = (blocks: CxdBlock[]): boolean =>
    blocks.some(
      (block) =>
        block.type === FIELD_BLOCK ||
        block.type === FIELD_ROWS_BLOCK ||
        Object.keys(blockBindings(block)).length > 0 ||
        (block.children ? walk(block.children) : false),
    );
  return !!document && walk(document.blocks);
}

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : null;

/** A date (`YYYY-MM-DD`) or date and time (ISO) in a language, as people read it. */
export function formatBoundDate(value: string, locale: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'long',
      ...(dateOnly ? { timeZone: 'UTC' } : { timeStyle: 'short' }),
    }).format(date);
  } catch {
    return value;
  }
}

/** A value as plain text (a link's label, an entry's title, a list's items joined). */
export function boundText(bound: BoundValue, locale = 'en'): string {
  const { value, kind } = bound;
  if (isEmpty(value)) return '';
  if (typeof value === 'string') {
    if (kind === 'date' && /^\d{4}-\d{2}-\d{2}/.test(value)) return formatBoundDate(value, locale);
    return value;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '✓' : '';
  if (Array.isArray(value)) {
    return value
      .map((item) => boundText({ value: item }, locale))
      .filter(Boolean)
      .join(', ');
  }
  const object = rec(value);
  if (!object) return '';
  for (const key of ['label', 'title', 'name', 'alt', 'filename', 'text', 'url']) {
    const text = object[key];
    if (typeof text === 'string' && text) return text;
  }
  return '';
}

/** A value as an address (a link's, an entry's, a media file's); undefined without one. */
export function boundUrl(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  const object = rec(value);
  const url = object?.url;
  return typeof url === 'string' && url ? url : undefined;
}

/** A value as an image of the library (`{ id, url, alt }`); undefined otherwise. */
export function boundMedia(
  value: unknown,
): { id: string | null; url: string; alt: string; mime?: string } | undefined {
  const object = rec(value);
  if (!object || typeof object.url !== 'string' || !object.url) return undefined;
  if (typeof object.mime === 'string' && !object.mime.startsWith('image/')) return undefined;
  return {
    id: typeof object.id === 'string' ? object.id : null,
    url: object.url,
    alt: typeof object.alt === 'string' ? object.alt : '',
    ...(typeof object.mime === 'string' ? { mime: object.mime } : {}),
  };
}

/** Rich text (HTML, already cleaned) or text as the inline content of a text block. */
function inlineOf(bound: BoundValue, locale: string): CxdInline[] {
  if (bound.kind === 'richtext' && typeof bound.value === 'string') {
    // One block holds one paragraph: paragraphs and items become line breaks.
    const html = bound.value
      .replace(/<\/(p|li|h[1-6]|blockquote)>\s*(?=<)/gi, '</$1><br>')
      .replace(/(<br>\s*)+$/i, '');
    return htmlToInline(html);
  }
  const text = boundText(bound, locale);
  return text ? [{ text }] : [];
}

/** A copy of a block with its bound attributes filled in. */
function applyToBlock(block: CxdBlock, values: Record<string, BoundValue>, locale: string) {
  const out: CxdBlock = { ...block, attrs: { ...block.attrs } };
  const spec = BINDABLE_ATTRIBUTES[block.type] ?? {};
  for (const [attribute, bound] of Object.entries(values)) {
    const role = spec[attribute];
    if (!role || isEmpty(bound.value)) continue;
    if (role === 'media') {
      const media = boundMedia(bound.value);
      if (!media) continue;
      if (media.id) out.attrs.id = media.id;
      else delete out.attrs.id;
      out.attrs.url = media.url;
      if (!values.alt && media.alt) out.attrs.alt = media.alt;
      continue;
    }
    if (role === 'url') {
      const url = boundUrl(bound.value);
      if (!url) continue;
      out.attrs[attribute] = url;
      // A link field's "new tab" goes with its address.
      if (block.type === 'core/button' && rec(bound.value)?.target === '_blank') {
        out.attrs.linkTarget = '_blank';
      }
      continue;
    }
    const inline = inlineOf(bound, locale);
    if (inline.length === 0) continue;
    if (attribute === 'content' || attribute === 'text') out.content = inline;
    else if (attribute === 'caption') out.attrs.caption = inline;
    else out.attrs[attribute] = boundText(bound, locale);
  }
  return out;
}

/** Options of `applyBindings`. */
export interface ApplyBindingsOptions {
  resolve: BindingResolver;
  /** The page's language (dates). */
  locale: string;
  /**
   * What the document is resolved against at its top (plugin API 1.49):
   * e.g. a plugin block's own data as the row, for a template it renders.
   */
  scope?: BindingScope;
}

/**
 * The document with its bindings resolved (an async pass before rendering,
 * which is synchronous): bound attributes filled in (what was typed stays
 * when the source has no value), Field blocks given their value, Field rows
 * repeated for each row. Unchanged documents keep their blocks.
 */
export async function applyBindings(
  document: CxdDocument,
  options: ApplyBindingsOptions,
): Promise<CxdDocument> {
  if (!hasBindings(document)) return document;
  const { resolve, locale } = options;
  const resolveSafe = async (key: string, scope: BindingScope) => {
    try {
      return await resolve(key, scope);
    } catch {
      return undefined;
    }
  };

  const walk = async (blocks: CxdBlock[], scope: BindingScope): Promise<CxdBlock[]> =>
    Promise.all(blocks.map((block) => one(block, scope)));

  const one = async (block: CxdBlock, scope: BindingScope): Promise<CxdBlock> => {
    if (block.type === FIELD_ROWS_BLOCK) return rows(block, scope);
    let out: CxdBlock = block;
    const bindings = blockBindings(block);
    if (Object.keys(bindings).length > 0) {
      const values: Record<string, BoundValue> = {};
      await Promise.all(
        Object.entries(bindings).map(async ([attribute, key]) => {
          const bound = await resolveSafe(key, scope);
          if (bound) values[attribute] = bound;
        }),
      );
      out = applyToBlock(block, values, locale);
    }
    if (block.type === FIELD_BLOCK) {
      const key = typeof block.attrs.source === 'string' ? block.attrs.source : '';
      const bound = key ? await resolveSafe(key, scope) : undefined;
      out = { ...out, attrs: { ...out.attrs } };
      (out as unknown as Record<symbol, BoundBlockData>)[BOUND] = {
        value: bound?.value,
        ...(bound?.kind ? { kind: bound.kind } : {}),
        locale,
      };
    }
    if (out.children) out = { ...out, children: await walk(out.children, scope) };
    return out;
  };

  const rows = async (block: CxdBlock, scope: BindingScope): Promise<CxdBlock> => {
    const key = typeof block.attrs.source === 'string' ? block.attrs.source : '';
    const bound = key ? await resolveSafe(key, scope) : undefined;
    const list = Array.isArray(bound?.value) ? bound.value : [];
    const limit =
      typeof block.attrs.limit === 'number' && block.attrs.limit > 0
        ? Math.min(block.attrs.limit, MAX_FIELD_ROWS)
        : MAX_FIELD_ROWS;
    const template = block.children ?? [];
    const children = await Promise.all(
      list.slice(0, limit).map(async (item, index) => {
        const row = rowScope(item, bound?.rowKind, key, scope);
        const id = rec(item)?._id ?? rec(item)?.id;
        const suffix = typeof id === 'string' ? id : String(index);
        return {
          id: `${block.id}-${suffix}`,
          type: FIELD_ROW_BLOCK,
          v: 1,
          attrs: { index },
          // Each row's blocks get ids of their own (plugin blocks load data by id).
          children: withIds(await walk(template, row), `~${suffix}`),
        } satisfies CxdBlock;
      }),
    );
    const out: CxdBlock = { ...block, attrs: { ...block.attrs }, children };
    (out as unknown as Record<symbol, BoundBlockData>)[BOUND] = {
      value: list.length,
      kind: 'rows',
      locale,
    };
    return out;
  };

  return { ...document, blocks: await walk(document.blocks, options.scope ?? {}) };
}

/** Blocks with a suffix added to their ids (and their children's), keeping resolved values. */
function withIds(blocks: CxdBlock[], suffix: string): CxdBlock[] {
  return blocks.map((block) => {
    const out: CxdBlock = { ...block, id: `${block.id}${suffix}` };
    const data = (block as unknown as Record<symbol, unknown>)[BOUND];
    if (data !== undefined) (out as unknown as Record<symbol, unknown>)[BOUND] = data;
    if (block.children) out.children = withIds(block.children, suffix);
    return out;
  });
}

/** The scope of one row: a row of fields, or a related entry, term or member. */
function rowScope(
  item: unknown,
  rowKind: BoundValue['rowKind'],
  source: string,
  parent: BindingScope,
): BindingScope {
  const object = rec(item);
  const id = typeof object?.id === 'string' ? object.id : undefined;
  const kind =
    rowKind ??
    (object && typeof object.taxonomy === 'string'
      ? 'term'
      : object && 'avatarUrl' in object
        ? 'user'
        : object && typeof object.type === 'string' && id
          ? 'entry'
          : 'fields');
  if (kind === 'entry' && id) return { ...parent, entry: { id } };
  if (kind === 'term' && id) return { ...parent, term: { id } };
  if (kind === 'user' && id) return { ...parent, user: { id } };
  return { ...parent, row: object ?? { value: item }, rowSource: source };
}

/** Media ids a document shows after its bindings were resolved (images bound to fields). */
export function boundMediaIds(document: CxdDocument): string[] {
  const ids = new Set<string>();
  const walk = (blocks: CxdBlock[]) => {
    for (const block of blocks) {
      const data = (block as unknown as Record<symbol, BoundBlockData | undefined>)[BOUND];
      const media = data ? boundMedia(data.value) : undefined;
      if (media?.id) ids.add(media.id);
      if (block.children) walk(block.children);
    }
  };
  walk(document.blocks);
  return [...ids];
}
