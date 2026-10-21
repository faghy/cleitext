import type { PluginContext } from '@cleitext/plugin-sdk';
import type { TranslationsResponse } from './schema';

/**
 * Multilingual for Cleitext's AI assistants (plugin API 1.40; `ctx.ai` is
 * missing on older cores): how translations work with the core tools, and a
 * tool that finds the versions of an entry in the other languages.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const AI_CONTEXT = `The site has several languages (get_site: \`languages\`; the default one is
the original of every translation). Each entry has one language (\`locale\`), and the versions of a
page in the other languages are linked to it.

- **Find the versions** of an entry with multilingual_translations: its language, whether it is
  the original, and the linked entries by language (\`needsUpdate\`: the original changed since).
  Update an existing translation with update_entry instead of creating a second one: each
  language has at most one version of a page.
- **Translate** with create_entry, \`translation_of\` (the original's id) and \`locale\`. The new
  draft starts as a copy of the original (same editor, layout, images and fields), linked to it.
  Send the translated body too: read the original with get_entry and send it back with every text
  translated, keeping its structure (for Fresco pages, the same \`native\` tree with translated
  texts). Without a body, the copy keeps the original's text.
- Give the translation its own \`title\`, \`slug\` (words of that language), \`excerpt\` and SEO
  fields. Its address gets the language's prefix (or domain) by itself: never add it to the slug.
- Links inside the text should point to the pages of the same language.
- Fields the site keeps the same in every language follow the original when it is saved.`;

export function registerAi(ctx: PluginContext): void {
  ctx.ai?.addContext({ title: 'Languages and translations (Multilingual)', markdown: AI_CONTEXT });

  ctx.ai?.registerTool({
    name: 'translations',
    title: 'Translations of an entry',
    description:
      'The language of an entry, whether it is the original, and its versions in the other languages (id, locale, title, status, needsUpdate).',
    scope: 'read',
    capability: 'edit_entries',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The entry id.', pattern: UUID_RE.source },
      },
      required: ['id'],
      additionalProperties: false,
    },
    async run(args, { api }) {
      const id = typeof args.id === 'string' ? args.id : '';
      if (!UUID_RE.test(id)) throw exposed('Give the id of an entry (a UUID).');
      const { status, data } = await api(
        'GET',
        `/ext/multilingual/translations?kind=entry&ids=${encodeURIComponent(id)}`,
      );
      if (status !== 200) throw exposed('The translations could not be read.');
      const view = (data as TranslationsResponse)[id];
      if (!view) throw exposed('No entry with this id.');
      return { id, ...view };
    },
  });
}

/** An error whose message the assistant gets. */
function exposed(message: string): Error {
  return Object.assign(new Error(message), { expose: true });
}
