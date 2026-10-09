import { definePlugin } from '@cleitext/plugin-sdk';

interface SeoFields {
  title?: string | null;
  description?: string | null;
  noindex?: boolean | null;
}

const SEPARATORS = ['–', '|', '·', '—'] as const;

/** `/` or a language home such as `/it`. */
const isHome = (path: string) => /^\/([a-z]{2,3}(-[a-z]{2})?)?$/i.test(path);

/**
 * SEO (official plugin): per-entry search title, description and indexing,
 * a default description, social cards and schema.org structured data.
 */
export default definePlugin({
  setup(ctx) {
    ctx.content.registerFieldGroup({
      id: 'seo',
      title: 'SEO',
      types: ['page', 'article'],
      fields: [
        {
          name: 'title',
          type: 'text',
          label: { en: 'Search title', it: 'Titolo per i motori di ricerca' },
          help: {
            en: 'Shown in search results instead of the title.',
            it: 'Mostrato nei risultati al posto del titolo.',
          },
          maxLength: 70,
        },
        {
          name: 'description',
          type: 'text',
          label: { en: 'Search description', it: 'Descrizione per i motori di ricerca' },
          help: { en: 'About 150 characters.', it: 'Circa 150 caratteri.' },
          multiline: true,
          maxLength: 160,
        },
        {
          name: 'noindex',
          type: 'boolean',
          label: { en: 'Hide from search engines', it: 'Nascondi ai motori di ricerca' },
        },
      ],
    });

    ctx.settings.define(
      [
        {
          name: 'separator',
          type: 'select',
          label: { en: 'Title separator', it: 'Separatore del titolo' },
          options: SEPARATORS.map((s) => ({ value: s, label: `Page ${s} Site` })),
          default: '–',
        },
        {
          name: 'defaultDescription',
          type: 'text',
          label: { en: 'Default description', it: 'Descrizione predefinita' },
          help: {
            en: 'Used by pages without a description of their own.',
            it: 'Usata dalle pagine senza una descrizione propria.',
          },
          multiline: true,
          maxLength: 160,
        },
        {
          name: 'twitterSite',
          type: 'text',
          label: { en: 'X (Twitter) account', it: 'Account X (Twitter)' },
          help: { en: 'For example @example.', it: 'Per esempio @esempio.' },
          maxLength: 50,
        },
      ],
      { title: 'SEO' },
    );

    ctx.hooks.filter(
      'render.head',
      async (head, context) => {
        const settings = await ctx.settings.get(context.siteId);
        const siteName = head.og['og:site_name'] ?? '';
        const next = { ...head, og: { ...head.og }, tags: [...(head.tags ?? [])] };
        const separator = String(settings.separator ?? '–');
        const entry = context.entry;
        const seo = (entry?.fields.seo ?? {}) as SeoFields;

        // Title: "<page> <separator> <site>", except on the home page.
        if (entry && !isHome(entry.url)) {
          const pageTitle = seo.title?.trim() || entry.title;
          next.title = `${pageTitle} ${separator} ${siteName}`;
          next.og['og:title'] = pageTitle;
        } else if (separator !== '–') {
          next.title = head.title.replace(' – ', ` ${separator} `);
        }

        const description =
          seo.description?.trim() || head.description || String(settings.defaultDescription ?? '');
        if (description) {
          next.description = description;
          next.og['og:description'] = description;
        }

        if (seo.noindex) {
          next.robots = 'noindex, follow';
          next.canonical = null;
        }

        const twitter = String(settings.twitterSite ?? '').trim();
        if (twitter) {
          next.tags.push({
            tag: 'meta',
            attrs: {
              name: 'twitter:site',
              content: twitter.startsWith('@') ? twitter : `@${twitter}`,
            },
          });
        }

        // Structured data.
        if (entry?.type === 'article') {
          next.tags.push({
            tag: 'json-ld',
            data: {
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: seo.title?.trim() || entry.title,
              ...(entry.publishedAt ? { datePublished: entry.publishedAt } : {}),
              ...(entry.author
                ? { author: { '@type': 'Person', name: entry.author.displayName } }
                : {}),
              ...(entry.image ? { image: [head.og['og:image']].filter(Boolean) } : {}),
              ...(description ? { description } : {}),
            },
          });
        } else if (isHome(context.path)) {
          next.tags.push({
            tag: 'json-ld',
            data: {
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: siteName,
              url: head.canonical ?? undefined,
              ...(description ? { description } : {}),
            },
          });
        }
        return next;
      },
      { priority: 20 },
    );
  },
});
