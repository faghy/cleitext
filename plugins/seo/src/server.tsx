import { Resolver, resolveTxt } from 'node:dns/promises';
import { defineBlock, definePlugin, type PluginContext } from '@cleitext/plugin-sdk';
import { applyTemplate, withDefaults, type SeoConfig } from './config';

interface SeoFields {
  title?: string | null;
  description?: string | null;
  noindex?: boolean | null;
  canonical?: string | null;
  keyphrase?: string | null;
  socialImage?: string | null;
}

interface Crumb {
  title: string;
  url: string;
}

const HOME_LABEL = (locale: string) => (locale.toLowerCase().startsWith('it') ? 'Home' : 'Home');

/**
 * TXT records as Google sees them: public resolvers first (the server's own
 * resolver may fail or keep an old answer), then the system one.
 */
async function txtRecords(domain: string): Promise<string[][]> {
  const resolver = new Resolver({ timeout: 1500, tries: 1 });
  resolver.setServers(['1.1.1.1', '8.8.8.8']);
  try {
    return await resolver.resolveTxt(domain);
  } catch {
    return within(resolveTxt(domain), 1500);
  }
}

/** Rejects when `promise` takes longer than `ms`: plugin routes have 5 seconds in all. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms).unref()),
  ]);
}

/** The home of a language, from the address of one of its pages. */
function homeOf(url: string, locale: string): string {
  const prefix = `/${locale.toLowerCase()}`;
  return url === prefix || url.startsWith(`${prefix}/`) ? prefix : '/';
}

/** Home, the published ancestors of an entry, and the entry itself. */
async function trail(
  ctx: PluginContext,
  siteId: string,
  entry: { id: string; title: string; url: string; locale: string },
): Promise<Crumb[]> {
  const ancestors: Crumb[] = [];
  let current = await ctx.content.get(siteId, entry.id);
  for (let depth = 0; current?.parentId && depth < 10; depth++) {
    const parent = await ctx.content.get(siteId, current.parentId);
    if (!parent || parent.status !== 'published') break;
    ancestors.unshift({ title: parent.title, url: parent.url });
    current = parent;
  }
  const home = homeOf(entry.url, entry.locale);
  return [
    { title: HOME_LABEL(entry.locale), url: home },
    ...ancestors,
    ...(entry.url === home ? [] : [{ title: entry.title, url: entry.url }]),
  ];
}

// As Yoast SEO and Rank Math offer them.
const SEPARATORS = ['–', '|', '·', '—', '-', '•', '*', '⋆', '~', '«', '»'] as const;
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
          name: 'keyphrase',
          type: 'text',
          label: { en: 'Focus keyphrase', it: 'Frase chiave' },
          help: {
            en: 'The words people search to find this page; the SEO analysis checks the text against it.',
            it: 'Le parole che le persone cercano per trovare questa pagina; l’analisi SEO controlla il testo su queste.',
          },
          maxLength: 100,
        },
        {
          name: 'socialImage',
          type: 'media',
          label: { en: 'Social image', it: 'Immagine social' },
          help: {
            en: 'Shown when the page is shared on social networks; the featured image otherwise.',
            it: 'Mostrata quando la pagina è condivisa sui social; altrimenti l’immagine in evidenza.',
          },
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

    // ---- Feeds: "<term> <separator> <site>", as the pages' titles -----------------------

    ctx.hooks.filter('feed.title', async (title, context) => {
      if (!context.term) return title;
      const separator = String((await ctx.settings.get(context.siteId)).separator ?? '–');
      return `${context.term.name} ${separator} ${context.siteTitle}`;
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

        // Title: the template of the content type, "<page> <separator> <site>" by default.
        if (entry && !isHome(entry.url)) {
          const pageTitle = seo.title?.trim() || entry.title;
          const template = cfg.titles[entry.type]?.trim();
          next.title = template
            ? applyTemplate(template, {
                title: pageTitle,
                sep: separator,
                sitename: siteName,
                excerpt: entry.excerpt ?? '',
                category: entry.terms?.category?.[0]?.name ?? '',
                currentyear: String(new Date().getFullYear()),
              })
            : `${pageTitle} ${separator} ${siteName}`;
          next.og['og:title'] = pageTitle;
        } else if (entry && seo.title?.trim()) {
          // The home page's own search title, as written (variables allowed).
          next.title = applyTemplate(seo.title.trim(), {
            title: entry.title,
            sep: separator,
            sitename: siteName,
            excerpt: entry.excerpt ?? '',
            category: '',
            currentyear: String(new Date().getFullYear()),
          });
          next.og['og:title'] = next.title;
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

        // Social image of the page, instead of the featured image.
        const pageUrl = next.canonical ?? next.og['og:url'];
        if (seo.socialImage && pageUrl) {
          const image = await ctx.media.get(context.siteId, seo.socialImage);
          if (image?.mime.startsWith('image/')) {
            next.og['og:image'] = new URL(image.url, pageUrl).href;
            if (image.width) next.og['og:image:width'] = String(image.width);
            if (image.height) next.og['og:image:height'] = String(image.height);
            next.tags.push({
              tag: 'meta',
              attrs: { name: 'twitter:card', content: 'summary_large_image' },
            });
          }
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

        // Structured data: one schema.org graph, linked by @id, as Yoast SEO does.
        const crumbs =
          entry && !isHome(context.path)
            ? await trail(ctx, context.siteId, {
                id: entry.id,
                title: seo.title?.trim() || entry.title,
                url: entry.url,
                locale: entry.locale,
              })
            : [];
        const graph = schemaGraph({
          cfg,
          crumbs,
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

    // ---- Breadcrumbs block -------------------------------------------------------------

    ctx.blocks.register(
      defineBlock<Record<string, never>, Crumb[]>({
        type: 'seo/breadcrumbs',
        title: { en: 'Breadcrumbs', it: 'Briciole di pane' },
        description: {
          en: 'Home › Parent page › This page: where the page sits in the site.',
          it: 'Home › Pagina madre › Questa pagina: dove si trova la pagina nel sito.',
        },
        icon: 'arrow-right-alt2',
        category: 'widgets',
        async load(_attrs, context) {
          if (!context.entry) return [];
          const entry = await ctx.content.get(context.siteId, context.entry.id);
          if (!entry) return [];
          return trail(ctx, context.siteId, entry);
        },
        render({ data, context }) {
          if (!data || data.length < 2) return null;
          const it = context.locale.toLowerCase().startsWith('it');
          return (
            <nav className="seo-breadcrumbs" aria-label={it ? 'Briciole di pane' : 'Breadcrumbs'}>
              <style>
                {'.seo-breadcrumbs ol{display:flex;flex-wrap:wrap;gap:.35rem;list-style:none;margin:0 0 1rem;padding:0;font-size:.9em}' +
                  '.seo-breadcrumbs li+li::before{content:"›";margin-right:.35rem;opacity:.6}' +
                  '.seo-breadcrumbs [aria-current]{opacity:.75}'}
              </style>
              <ol>
                {data.map((crumb, i) =>
                  i === data.length - 1 ? (
                    <li key={crumb.url} aria-current="page">
                      {crumb.title}
                    </li>
                  ) : (
                    <li key={crumb.url}>
                      <a href={crumb.url}>{crumb.title}</a>
                    </li>
                  ),
                )}
              </ol>
            </nav>
          );
        },
      }),
    );

    // ---- Admin: the SEO page ----------------------------------------------------------

    /**
     * How Search Console and Bing can see the site is verified: a DNS record
     * (domain properties: nothing to paste) or a meta tag on the home page.
     */
    ctx.routes.api({
      method: 'GET',
      path: '/verification',
      capability: 'manage_settings',
      async handler(request) {
        const host = (request.headers.host ?? '').split(':')[0]!.toLowerCase();
        const labels = host.split('.');
        const domains = labels
          .map((_, i) => labels.slice(i).join('.'))
          .filter((d) => d.includes('.'));
        // All at once, within the time a plugin route has (5 seconds).
        const lookups = domains.map(async (domain) => {
          try {
            const records = (await within(txtRecords(domain), 3500)).map((r) => r.join(''));
            const google = records.some((r) => r.startsWith('google-site-verification='));
            const bing = records.some((r) => /^MS=ms\d+/i.test(r));
            return google || bing ? { domain, google, bing } : null;
          } catch {
            return null; // No TXT records, or no DNS here.
          }
        });
        const page = (async () => {
          try {
            const origin = `${request.headers['x-forwarded-proto'] ?? 'https'}://${request.headers.host}`;
            const html = await (
              await fetch(`${origin}/`, { signal: AbortSignal.timeout(3500) })
            ).text();
            return {
              google: /<meta[^>]+name="google-site-verification"/i.test(html),
              bing: /<meta[^>]+name="msvalidate\.01"/i.test(html),
            };
          } catch {
            return { google: false, bing: false }; // The site could not be read from here.
          }
        })();
        const dns = (await Promise.all(lookups)).filter((d) => d !== null);
        const meta = await page;
        return { body: { host, dns, meta } };
      },
    });

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
          titles: Object.fromEntries(
            Object.entries((body.titles ?? {}) as Record<string, unknown>)
              .filter(([k, v]) => /^[a-z0-9_-]{1,64}$/.test(k) && typeof v === 'string' && v.trim())
              .map(([k, v]) => [k, String(v).trim().slice(0, 200)]),
          ),
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
  /** Home › ancestors › page, for the BreadcrumbList. */
  crumbs?: Crumb[];
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
    ...(input.crumbs && input.crumbs.length > 1
      ? { breadcrumb: { '@id': `${pageUrl}#breadcrumb` } }
      : {}),
  });

  if (input.crumbs && input.crumbs.length > 1) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${pageUrl}#breadcrumb`,
      itemListElement: input.crumbs.map((crumb, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: crumb.title,
        // As Yoast SEO: the last crumb is the page itself, without an address.
        ...(i < input.crumbs!.length - 1 ? { item: new URL(crumb.url, origin).href } : {}),
      })),
    });
  }

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
