import {
  htmlToInline,
  inlineToHtml,
  type CxdInline,
  type FieldDefinition,
} from '@cleitext/plugin-sdk';

/**
 * Machine translation with DeepL (https://developers.deepl.com). Rich text is
 * sent as HTML with tag handling, so bold, italics and links survive.
 * Nothing is sent unless an administrator saved an API key.
 */

/** Text attributes of blocks that people read (image alt text, captions…). */
const TEXT_ATTRS = new Set(['alt', 'caption', 'label', 'placeholder', 'citation']);
const BATCH = 50;

export interface MachineTranslator {
  translate(texts: string[], from: string, to: string): Promise<string[]>;
}

export class DeepL implements MachineTranslator {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Free API keys end with `:fx` and use their own host. */
  private get endpoint(): string {
    return this.apiKey.endsWith(':fx')
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';
  }

  async translate(texts: string[], from: string, to: string): Promise<string[]> {
    const result: string[] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          authorization: `DeepL-Auth-Key ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: texts.slice(i, i + BATCH),
          source_lang: sourceCode(from),
          target_lang: targetCode(to),
          tag_handling: 'html',
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? 'DeepL refused the API key.'
            : response.status === 456
              ? 'The DeepL quota is used up.'
              : `DeepL answered ${response.status}.`,
        );
      }
      const body = (await response.json()) as { translations?: { text: string }[] };
      result.push(...(body.translations ?? []).map((t) => t.text));
    }
    if (result.length !== texts.length) throw new Error('DeepL returned an incomplete answer.');
    return result;
  }
}

/** DeepL source languages have no variant (EN, PT). */
export function sourceCode(locale: string): string {
  return locale.split('-')[0]!.toUpperCase();
}

/** DeepL needs a variant for English and Portuguese targets. */
export function targetCode(locale: string): string {
  const [base, region] = locale.split('-');
  const upper = base!.toUpperCase();
  if (upper === 'EN') return region === 'GB' ? 'EN-GB' : 'EN-US';
  if (upper === 'PT') return region === 'BR' ? 'PT-BR' : 'PT-PT';
  return upper;
}

// ---- What gets translated -------------------------------------------------------------

export interface TranslatableContent {
  title: string;
  excerpt: string | null;
  document: unknown;
  fields: Record<string, unknown>;
}

interface Block {
  attrs?: Record<string, unknown>;
  content?: CxdInline[];
  children?: Block[];
  [key: string]: unknown;
}

/**
 * Collects every translatable text (title, excerpt, rich text of blocks,
 * readable attributes, text fields marked `translate`), translates them in
 * one go and puts them back in place.
 */
export async function translateContent(
  translator: MachineTranslator,
  content: TranslatableContent,
  fields: { own: FieldDefinition[]; groups: { id: string; fields: FieldDefinition[] }[] },
  from: string,
  to: string,
): Promise<TranslatableContent> {
  const texts: string[] = [];
  const setters: ((value: string) => void)[] = [];
  const add = (text: string, set: (value: string) => void) => {
    if (!text.trim()) return;
    texts.push(text);
    setters.push(set);
  };

  const result: TranslatableContent = structuredClone(content);
  add(escapeHtml(result.title), (v) => (result.title = unescapeHtml(stripTags(v))));
  if (result.excerpt) {
    add(escapeHtml(result.excerpt), (v) => (result.excerpt = unescapeHtml(stripTags(v))));
  }

  const walk = (blocks: Block[]) => {
    for (const block of blocks) {
      if (Array.isArray(block.content) && block.content.length > 0) {
        add(inlineToHtml(block.content), (v) => (block.content = htmlToInline(v)));
      }
      for (const [key, value] of Object.entries(block.attrs ?? {})) {
        if (TEXT_ATTRS.has(key) && typeof value === 'string') {
          add(escapeHtml(value), (v) => (block.attrs![key] = unescapeHtml(stripTags(v))));
        }
      }
      if (Array.isArray(block.children)) walk(block.children);
    }
  };
  const document = result.document as { blocks?: Block[] } | null;
  if (document && Array.isArray(document.blocks)) walk(document.blocks);

  const textFields = (defs: FieldDefinition[], values: Record<string, unknown>) => {
    for (const field of defs) {
      const value = values[field.name];
      if (
        field.type === 'text' &&
        (field.translation ?? 'translate') === 'translate' &&
        typeof value === 'string'
      ) {
        add(escapeHtml(value), (v) => (values[field.name] = unescapeHtml(stripTags(v))));
      }
    }
  };
  textFields(fields.own, result.fields);
  for (const group of fields.groups) {
    const values = result.fields[group.id];
    if (values && typeof values === 'object')
      textFields(group.fields, values as Record<string, unknown>);
  }

  if (texts.length === 0) return result;
  const translated = await translator.translate(texts, from, to);
  translated.forEach((text, index) => setters[index]!(text));
  return result;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function unescapeHtml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}
