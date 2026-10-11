import { definePlugin, type PluginContext } from '@cleitext/plugin-sdk';
import { withDefaults, type SeoConfig } from './config';

interface SeoFields {
  title?: string | null;
  description?: string | null;
  noindex?: boolean | null;
  canonical?: string | null;
}

const SEPARATORS = ['–', '|', '·', '—'] as const;
/** As Yoast SEO: large image previews and full snippets for indexed pages. */
const INDEX_ROBOTS = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

/** `/` or a language home such as `/it`. */
const isHome = (path: string) => /^\/([a-z]{2,3}(-[a-z]{2,4})?)?\/?$/i.test(path);

async function config(ctx: PluginContext, siteId: string): Promise<SeoConfig> {
  return withDefaults(await ctx.storage.get<Partial<SeoConfig>>(siteId, 'config'));
}

/** The canonical address of an entry, when its author set one. */
function canonicalOf(seo: SeoFields): string | null {
  const value = seo.canonical?.trim();
  return value && /^https?:\/\/[^\s"'<>]+$/.test(value) ? value : null;
}

const sameUrl = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

/**
 * SEO (official plugin), in the spirit of Yoast SEO: per-entry search title,
 * description, indexing and canonical; content types and taxonomies kept out
 * of search results; XML sitemaps that follow all of it; social cards; and a
 * schema.org graph (WebSite, Organization or Person, WebPage, Article).
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
        {
          name: 'canonical',
          type: 'text',
          label: { en: 'Canonical address', it: 'Indirizzo canonico' },
          help: {
            en: 'Only when this content is a copy of a page elsewhere: its full address. The page then leaves the sitemap.',
            it: 'Solo se questo contenuto è una copia di una pagina altrove: il suo indirizzo completo. La pagina esce dalla sitemap.',
          },
          maxLength: 500,
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

    // ---- XML sitemaps: what is kept out of search stays out of them ------------------

    ctx.hooks.filter('sitemap.sources', async (sources, { siteId }) => {
      const cfg = await config(ctx, siteId);
      return sources.filter((s) =>
        s.kind === 'type'
          ? !cfg.hiddenTypes.includes(s.slug)
          : !cfg.hiddenTaxonomies.includes(s.slug),
      );
    });

    ctx.hooks.filter('sitemap.urls', async (urls, { siteId }) => {
      const cfg = await config(ctx, siteId);
      return urls
        .filter((url) => {
          const seo = (url.entry?.fields.seo ?? {}) as SeoFields;
          if (seo.noindex) return false;
          const canonical = canonicalOf(seo);
          return !canonical || sameUrl(canonical, url.loc);
        })
        .map((url) => (cfg.sitemapImages ? url : { ...url, images: [] }));
    });

    // ---- The <head> of public pages ---------------------------------------------------

    ctx.hooks.filter(
      'render.head',
      async (head, context) => {
        const settings = await ctx.settings.get(context.siteId);
        const cfg = await config(ctx, context.siteId);
        const siteName = head.og['og:site_name'] ?? '';
        const next = { ...head, og: { ...head.og }, tags: [...(head.tags ?? [])] };
        const separator = String(settings.separator ?? '–');
        const entry = context.entry;
        const seo = (entry?.fields.seo ?? {}) as SeoFields;
        context.tag('seo');

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

        // Indexing: the entry, its content type, or the taxonomy of an archive.
        const taxonomyArchive =
          context.route === 'archive' &&
          cfg.hiddenTaxonomies.some((t) =>
            new RegExp(`^(/[a-z]{2,3}(-[a-z]{2,4})?)?/${t}/[^/]+`).test(context.path),
          );
        const hidden =
          Boolean(seo.noindex) ||
          Boolean(entry && cfg.hiddenTypes.includes(entry.type)) ||
          taxonomyArchive;
        if (hidden) {
          next.robots = 'noindex, follow';
          next.canonical = null;
        } else if (!head.robots) {
          next.robots = INDEX_ROBOTS;
        }
        const canonical = canonicalOf(seo);
        if (canonical && !hidden) next.canonical = canonical;

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

        // Structured data: one schema.org graph, linked by @id, as Yoast SEO does.
        const graph = schemaGraph({
          cfg,
          head: next,
          siteName,
          description,
          locale: context.locale,
          isHome: isHome(context.path),
          entry: entry
            ? {
                type: entry.type,
                title: seo.title?.trim() || entry.title,
                publishedAt: entry.publishedAt,
                author: entry.author?.displayName ?? null,
                sections: Object.values(entry.terms ?? {})
                  .flat()
                  .map((t) => t.name),
              }
            : null,
        });
        if (graph) next.tags.push({ tag: 'json-ld', data: graph });
        return next;
      },
      { priority: 20 },
    );

    // ---- Admin: the SEO page ----------------------------------------------------------

    ctx.routes.api({
      method: 'GET',
      path: '/config',
      capability: 'manage_settings',
      async handler(request) {
        return { body: await config(ctx, request.siteId) };
      },
    });

    ctx.routes.api({
      method: 'PUT',
      path: '/config',
      capability: 'manage_settings',
      async handler(request) {
        const body = (request.body ?? {}) as Partial<SeoConfig>;
        const slugs = (value: unknown) =>
          Array.isArray(value)
            ? [
                ...new Set(
                  value.filter(
                    (v): v is string => typeof v === 'string' && /^[a-z0-9_-]{1,64}$/.test(v),
                  ),
                ),
              ]
            : [];
        const rep = (body.representation ?? {}) as Partial<SeoConfig['representation']>;
        const url = (value: unknown) =>
          typeof value === 'string' && /^https?:\/\/[^\s"'<>]+$/.test(value.trim())
            ? value.trim()
            : '';
        const next: SeoConfig = {
          hiddenTypes: slugs(body.hiddenTypes),
          hiddenTaxonomies: slugs(body.hiddenTaxonomies),
          sitemapImages: body.sitemapImages !== false,
          representation: {
            kind: rep.kind === 'person' ? 'person' : 'organization',
            name: typeof rep.name === 'string' ? rep.name.trim().slice(0, 200) : '',
            logo: url(rep.logo),
            sameAs: Array.isArray(rep.sameAs)
              ? rep.sameAs.map(url).filter(Boolean).slice(0, 20)
              : [],
          },
        };
        await ctx.storage.set(request.siteId, 'config', next);
        // Every page carries the head; sitemaps carry the site tag.
        await ctx.cache.invalidate(request.siteId, ['site', 'seo']);
        return { body: next };
      },
    });
  },
});

interface GraphInput {
  cfg: SeoConfig;
  head: { canonical: string | null; og: Record<string, string>; title: string };
  siteName: string;
  description: string;
  locale: string;
  isHome: boolean;
  entry: {
    type: string;
    title: string;
    publishedAt: string | null;
    author: string | null;
    sections: string[];
  } | null;
}

/** WebSite, Organization or Person, WebPage, primary image and Article, linked by @id. */
export function schemaGraph(input: GraphInput): Record<string, unknown> | null {
  const pageUrl = input.head.canonical ?? input.head.og['og:url'];
  if (!pageUrl) return null;
  const origin = new URL(pageUrl).origin;
  const rep = input.cfg.representation;
  const websiteId = `${origin}/#website`;
  const repId =
    rep.name &&
    (rep.kind === 'person' ? `${origin}/#/schema/person/site` : `${origin}/#organization`);
  const graph: Record<string, unknown>[] = [];

  graph.push({
    '@type': 'WebSite',
    '@id': websiteId,
    url: `${origin}/`,
    name: input.siteName,
    inLanguage: input.locale,
    ...(repId ? { publisher: { '@id': repId } } : {}),
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${origin}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  });

  if (repId) {
    const logoId = `${origin}/#/schema/logo/image/`;
    const logo = rep.logo
      ? {
          '@type': 'ImageObject',
          '@id': logoId,
          url: rep.logo,
          contentUrl: rep.logo,
          caption: rep.name,
        }
      : null;
    graph.push({
      '@type': rep.kind === 'person' ? 'Person' : 'Organization',
      '@id': repId,
      name: rep.name,
      ...(rep.kind === 'organization' ? { url: `${origin}/` } : {}),
      ...(logo
        ? rep.kind === 'person'
          ? { image: logo }
          : { logo, image: { '@id': logoId } }
        : {}),
      ...(rep.sameAs.length > 0 ? { sameAs: rep.sameAs } : {}),
    });
  }

  const image = input.head.og['og:image'];
  const imageId = `${pageUrl}#primaryimage`;
  if (image) graph.push({ '@type': 'ImageObject', '@id': imageId, url: image, contentUrl: image });

  graph.push({
    '@type': input.entry || input.isHome ? 'WebPage' : 'CollectionPage',
    '@id': pageUrl,
    url: pageUrl,
    name: input.head.title,
    isPartOf: { '@id': websiteId },
    inLanguage: input.locale,
    ...(input.description ? { description: input.description } : {}),
    ...(input.entry?.publishedAt ? { datePublished: input.entry.publishedAt } : {}),
    ...(image ? { primaryImageOfPage: { '@id': imageId }, image: { '@id': imageId } } : {}),
    ...(input.isHome && repId ? { about: { '@id': repId } } : {}),
  });

  if (input.entry?.type === 'article') {
    graph.push({
      '@type': 'Article',
      '@id': `${pageUrl}#article`,
      headline: input.entry.title,
      isPartOf: { '@id': pageUrl },
      mainEntityOfPage: { '@id': pageUrl },
      inLanguage: input.locale,
      ...(input.entry.publishedAt ? { datePublished: input.entry.publishedAt } : {}),
      ...(input.entry.author ? { author: { '@type': 'Person', name: input.entry.author } } : {}),
      ...(repId ? { publisher: { '@id': repId } } : {}),
      ...(image ? { image: { '@id': imageId } } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.entry.sections.length > 0 ? { articleSection: input.entry.sections } : {}),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}
