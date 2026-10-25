/**
 * Vetta SEO on the server: the per-entry fields, the <head> of every page,
 * the schema.org graph, sitemaps, robots.txt, llms.txt, the 404 log,
 * IndexNow, link attributes and image texts, the breadcrumbs block and the
 * admin's endpoints.
 */
import { randomBytes } from 'node:crypto';
import { defineBlock, definePlugin, type PluginContext } from '@cleitext/plugin-sdk';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { parseDocument } from './analysis.js';
import {
  entrySeo,
  flag,
  keywordsOf,
  lines,
  moduleOn,
  sanitizeConfig,
  taxonomyValue,
  text,
  typeValue,
  value,
  type Config,
} from './config.js';
import { buildHead } from './head.js';
import { schemaGraph, type Crumb } from './jsonld.js';
import { indexnowLog, notFound } from './schema.js';
import {
  excluded,
  imageTexts,
  linkAttributes,
  llmsText,
  NOISE,
  robotsText,
  type LlmsSection,
} from './tools.js';

const CACHE_TAG = 'vetta';
const configs = new Map<string, { config: Config; at: number }>();
const origins = new Map<string, string>();

async function configFor(ctx: PluginContext, siteId: string): Promise<Config> {
  const hit = configs.get(siteId);
  if (hit && Date.now() - hit.at < 30_000) return hit.config;
  const config = ((await ctx.storage.get(siteId, 'config')) ?? {}) as Config;
  configs.set(siteId, { config, at: Date.now() });
  return config;
}

/** The site's public address, as last seen by a page or the admin (for IndexNow and llms.txt). */
async function rememberOrigin(
  ctx: PluginContext,
  siteId: string,
  origin: string | null | undefined,
) {
  if (!origin || !/^https?:\/\/[^/\s]+$/.test(origin) || origins.get(siteId) === origin) return;
  origins.set(siteId, origin);
  if ((await ctx.storage.get(siteId, 'origin')) !== origin)
    await ctx.storage.set(siteId, 'origin', origin);
}

async function originOf(ctx: PluginContext, siteId: string): Promise<string | null> {
  return (
    origins.get(siteId) ?? (((await ctx.storage.get(siteId, 'origin')) as string | null) || null)
  );
}

const homeLabel = (config: Config, locale: string) =>
  text(config, 'breadcrumbs_home_label') || (locale.startsWith('it') ? 'Home' : 'Home');

const languageHome = (url: string, locale: string) => {
  const prefix = `/${locale.toLowerCase()}`;
  return url === prefix || url.startsWith(`${prefix}/`) ? prefix : '/';
};

/** Home › (first category, or the published ancestors) › the entry. */
async function trail(
  ctx: PluginContext,
  siteId: string,
  config: Config,
  entry: {
    id: string;
    type: string;
    title: string;
    url: string;
    locale: string;
    terms?: Record<string, { name: string; url: string }[]>;
    crumbTitle?: string | null;
  },
): Promise<Crumb[]> {
  const middle: Crumb[] = [];
  const category = entry.terms?.category?.[0];
  if (entry.type !== 'page' && category) {
    middle.push({ title: category.name, url: category.url });
  } else {
    let current = await ctx.content.get(siteId, entry.id);
    for (let depth = 0; current?.parentId && depth < 10; depth++) {
      const parent = await ctx.content.get(siteId, current.parentId);
      if (!parent || parent.status !== 'published') break;
      const parentSeo = entrySeo(parent.fields);
      middle.unshift({ title: parentSeo.breadcrumbTitle || parent.title, url: parent.url });
      current = parent;
    }
  }
  const home = languageHome(entry.url, entry.locale);
  return [
    ...(value(config, 'breadcrumbs_home') !== false
      ? [{ title: homeLabel(config, entry.locale), url: home }]
      : []),
    ...middle,
    ...(entry.url === home ? [] : [{ title: entry.crumbTitle || entry.title, url: entry.url }]),
  ];
}

/** Sends addresses to the search engines that share IndexNow (Bing, Yandex, Seznam…). */
async function indexNow(
  ctx: PluginContext,
  siteId: string,
  urls: string[],
  manual: boolean,
): Promise<{ status: number; message: string }> {
  const config = await configFor(ctx, siteId);
  const key = text(config, 'indexnow_key');
  const origin = await originOf(ctx, siteId);
  if (!key || !origin) return { status: 0, message: 'No key or no site address yet.' };
  const list = [
    ...new Set(
      urls
        .map((u) => (u.startsWith('http') ? u : `${origin}${u}`))
        .filter((u) => u.startsWith(origin)),
    ),
  ].slice(0, 1000);
  if (list.length === 0) return { status: 0, message: 'No address of this site.' };
  let status = 0;
  let message = '';
  try {
    const response = await ctx.http.send({
      url: 'https://api.indexnow.org/indexnow',
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: new URL(origin).host,
        key,
        keyLocation: `${origin}/indexnow-key/${key}`,
        urlList: list,
      }),
      timeoutMs: 10_000,
    });
    status = response.status;
    message =
      {
        200: 'Submitted.',
        202: 'Received: the key is being checked.',
        204: 'Submitted.',
        400: 'Bad request.',
        403: 'The key was not accepted: check that the key address opens.',
        422: 'Addresses of another site, or a key that does not match.',
        429: 'Too many requests: try again later.',
      }[status] ?? `Answer ${status}.`;
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  await ctx.db.transaction(siteId, async (tx) => {
    await tx.insert(indexnowLog).values({ siteId, urls: list, status, manual, message });
    // The last 100 only.
    const old = await tx
      .select({ id: indexnowLog.id })
      .from(indexnowLog)
      .where(eq(indexnowLog.siteId, siteId))
      .orderBy(desc(indexnowLog.createdAt))
      .offset(100);
    if (old.length)
      await tx.delete(indexnowLog).where(
        inArray(
          indexnowLog.id,
          old.map((r) => r.id),
        ),
      );
  });
  return { status, message };
}

const lastSent = new Map<string, number>();

/** How assistants fill Vetta's fields (create_entry and update_entry, `fields.vetta`). */
const AI_CONTEXT = `Every content type has the field group \`vetta\`; send it in \`fields\`, e.g.
\`{"vetta": {"keywords": "…", "title": "…", "description": "…"}}\` (only the given fields change).
Longer values are refused.

- \`vetta.keywords\` (max 300): the main keyword first, then up to four more, separated by commas.
  Use the main one in the search title, the description, the address (\`slug\`), the first
  paragraph, a subheading and an image's alt text: the editor's analysis scores the page on it.
  Give each page its own main keyword.
- \`vetta.title\` (max 200): the whole search title as written, with variables such as
  \`%title%\`, \`%sep%\` and \`%sitename%\`, e.g. \`"Fresh bread every day %sep% %sitename%"\`.
  About 60 characters once filled in. Empty: the content type's template (usually
  \`%title% %sep% %sitename%\`), so leave it empty when the title already works.
- \`vetta.description\` (max 400): about 150 characters, one or two sentences with the main
  keyword; empty uses the excerpt.
- \`vetta.ogTitle\`, \`vetta.ogDescription\` (social cards) and \`vetta.ogImage\` (a media id,
  1200×630 is best): only when sharing should differ from search.
- \`vetta.breadcrumbTitle\` (max 100): a shorter name in breadcrumbs, when the title is long.
- Leave alone unless asked: \`noindex\`, \`nofollow\`, \`noarchive\`, \`noimageindex\`,
  \`nosnippet\`, \`canonical\` (only for copies of a page elsewhere), \`schema\` ("auto",
  "Article", "BlogPosting", "NewsArticle", "none") and \`pillar\`.

Write them in the entry's language; a translation gets its own.`;

export default definePlugin({
  setup(ctx) {
    ctx.access.defineCapability('manage_vetta', {
      label: {
        en: 'Manage the SEO settings (Vetta SEO)',
        it: 'Gestire le impostazioni SEO (Vetta SEO)',
      },
      roles: ['administrator'],
    });

    // ---- Fields of every entry -------------------------------------------------------
    const l = (en: string, it: string) => ({ en, it });
    ctx.content.registerFieldGroup({
      id: 'vetta',
      title: 'SEO',
      types: ['*'],
      fields: [
        {
          name: 'keywords',
          type: 'text',
          maxLength: 300,
          label: l('Keywords', 'Parole chiave'),
          help: l(
            'What people search to find this page; the first is the main one, then up to four more, separated by commas. The analysis checks the page against them.',
            'Ciò che le persone cercano per trovare questa pagina: la prima è la principale, poi fino a quattro altre, separate da virgole. L’analisi controlla la pagina su queste.',
          ),
        },
        {
          name: 'title',
          type: 'text',
          maxLength: 200,
          label: l('Search title', 'Titolo per i motori di ricerca'),
          help: l(
            'Empty: from the template of the content type. Variables such as %title% %sep% %sitename% work.',
            'Vuoto: dal modello del tipo di contenuto. Funzionano variabili come %title% %sep% %sitename%.',
          ),
        },
        {
          name: 'description',
          type: 'text',
          multiline: true,
          maxLength: 400,
          label: l('Search description', 'Descrizione per i motori di ricerca'),
          help: l(
            'About 150 characters. Empty: from the template (the excerpt by default).',
            'Circa 150 caratteri. Vuota: dal modello (il riassunto, normalmente).',
          ),
        },
        {
          name: 'noindex',
          type: 'boolean',
          group: l('Advanced', 'Avanzate'),
          label: l('Hide from search engines (noindex)', 'Nascondi ai motori di ricerca (noindex)'),
        },
        {
          name: 'nofollow',
          type: 'boolean',
          group: l('Advanced', 'Avanzate'),
          label: l('Do not follow its links (nofollow)', 'Non seguire i suoi link (nofollow)'),
        },
        {
          name: 'noarchive',
          type: 'boolean',
          group: l('Advanced', 'Avanzate'),
          label: l('No cached copy (noarchive)', 'Nessuna copia in cache (noarchive)'),
        },
        {
          name: 'noimageindex',
          type: 'boolean',
          group: l('Advanced', 'Avanzate'),
          label: l('Do not index its images', 'Non indicizzare le sue immagini'),
        },
        {
          name: 'nosnippet',
          type: 'boolean',
          group: l('Advanced', 'Avanzate'),
          label: l(
            'No text preview in results (nosnippet)',
            'Nessuna anteprima nei risultati (nosnippet)',
          ),
        },
        {
          name: 'canonical',
          type: 'url',
          group: l('Advanced', 'Avanzate'),
          label: l('Canonical address', 'Indirizzo canonico'),
          help: l(
            'Only when this content is a copy of a page elsewhere: its full address.',
            'Solo se questo contenuto è una copia di una pagina altrove: il suo indirizzo completo.',
          ),
        },
        {
          name: 'breadcrumbTitle',
          type: 'text',
          maxLength: 100,
          group: l('Advanced', 'Avanzate'),
          label: l('Name in the breadcrumbs', 'Nome nelle briciole di pane'),
        },
        {
          name: 'schema',
          type: 'select',
          group: l('Advanced', 'Avanzate'),
          label: l('Structured data', 'Dati strutturati'),
          default: 'auto',
          options: [
            { value: 'auto', label: l('As the content type', 'Come il tipo di contenuto') },
            { value: 'Article', label: l('Article', 'Articolo') },
            { value: 'BlogPosting', label: l('Blog post', 'Articolo di blog') },
            { value: 'NewsArticle', label: l('News article', 'Notizia') },
            { value: 'none', label: l('None', 'Nessuno') },
          ],
        },
        {
          name: 'pillar',
          type: 'boolean',
          group: l('Advanced', 'Avanzate'),
          label: l(
            'Pillar content (one of the main pages of the site)',
            'Contenuto pilastro (una delle pagine principali del sito)',
          ),
        },
        {
          name: 'ogTitle',
          type: 'text',
          maxLength: 200,
          group: l('Social networks', 'Social network'),
          label: l('Title when shared', 'Titolo quando è condivisa'),
        },
        {
          name: 'ogDescription',
          type: 'text',
          multiline: true,
          maxLength: 400,
          group: l('Social networks', 'Social network'),
          label: l('Description when shared', 'Descrizione quando è condivisa'),
        },
        {
          name: 'ogImage',
          type: 'media',
          group: l('Social networks', 'Social network'),
          label: l('Image when shared', 'Immagine quando è condivisa'),
          help: l(
            '1200×630 pixels is best. Empty: the featured image, then the site’s.',
            '1200×630 pixel è l’ideale. Vuota: l’immagine in evidenza, poi quella del sito.',
          ),
        },
      ],
    });

    // ---- AI assistants (plugin API 1.40; missing on older cores) -----------------------
    ctx.ai?.addContext({ title: 'SEO fields (Vetta SEO)', markdown: AI_CONTEXT });

    // ---- The <head> ---------------------------------------------------------------------
    ctx.hooks.filter(
      'render.head',
      async (head, context) => {
        context.tag(CACHE_TAG);
        const config = await configFor(ctx, context.siteId);
        const entry = context.entry;
        const seo = entrySeo(entry?.fields);
        const pageUrl = head.canonical ?? head.og['og:url'] ?? null;
        if (pageUrl) await rememberOrigin(ctx, context.siteId, new URL(pageUrl).origin);

        // The social image: the entry's own, the featured image, then the site's.
        let image: {
          url: string;
          width?: number | null;
          height?: number | null;
          alt?: string;
        } | null = null;
        const mediaUrl = async (id: unknown) => {
          if (typeof id !== 'string' || !id) return null;
          const media = await ctx.media.get(context.siteId, id);
          return media && media.mime.startsWith('image/') && pageUrl
            ? {
                url: new URL(media.url, pageUrl).href,
                width: media.width ?? null,
                height: media.height ?? null,
                alt: '',
              }
            : null;
        };
        if (moduleOn(config, 'social')) {
          image =
            (await mediaUrl(seo.ogImage)) ??
            (head.og['og:image']
              ? {
                  url: head.og['og:image'],
                  width: Number(head.og['og:image:width']) || null,
                  height: Number(head.og['og:image:height']) || null,
                }
              : null) ??
            (await mediaUrl(value(config, 'og_image')));
        }
        // The tagline, read only by titles that show it (plugin API 1.47; missing on older cores).
        const tagline = async (locale: string) => {
          try {
            const v = await ctx.dynamic?.resolve(context.siteId, 'site.tagline', { locale });
            return typeof v === 'string' ? v : '';
          } catch {
            return '';
          }
        };
        const words = entry
          ? parseDocument(entry.document as never)
              .text.split(/\s+/)
              .filter(Boolean).length
          : 0;
        const next = buildHead({
          head: head as never,
          config,
          locale: context.locale,
          route: context.route,
          path: context.path,
          isFrontPage: context.isFrontPage === true,
          ...(context.archive ? { archive: context.archive } : {}),
          ...(entry
            ? {
                entry: {
                  id: entry.id,
                  type: entry.type,
                  title: entry.title,
                  url: entry.url,
                  excerpt: entry.excerpt ?? '',
                  publishedAt: entry.publishedAt,
                  author: entry.author ? { displayName: entry.author.displayName } : null,
                  terms: entry.terms,
                  fields: entry.fields,
                  words,
                },
              }
            : {}),
          seo,
          image,
          ...(seo.title?.includes('sitedesc') ? { sitedesc: await tagline(context.locale) } : {}),
        });

        if (moduleOn(config, 'schema') && next.canonical !== null) {
          const crumbs =
            entry && moduleOn(config, 'breadcrumbs')
              ? await trail(ctx, context.siteId, config, {
                  id: entry.id,
                  type: entry.type,
                  title: entry.title,
                  url: entry.url,
                  locale: entry.locale,
                  terms: entry.terms as Record<string, { name: string; url: string }[]>,
                  crumbTitle: seo.breadcrumbTitle ?? null,
                })
              : [];
          const logo = await mediaUrl(value(config, 'knowledge_logo'));
          const graph = schemaGraph({
            config,
            pageUrl: next.canonical ?? pageUrl,
            title: next.title,
            description: next.description,
            siteName: head.og['og:site_name'] ?? '',
            locale: context.locale,
            isHome: context.isFrontPage === true || context.archive?.home === true,
            route: context.route,
            image: next.og['og:image'] ?? null,
            logo: logo?.url ?? null,
            crumbs,
            entry: entry
              ? {
                  type: entry.type,
                  title: next.og['og:title'] ?? entry.title,
                  publishedAt: entry.publishedAt,
                  author: entry.author?.displayName ?? null,
                  keywords: keywordsOf(seo),
                  sections: (entry.terms.category ?? []).map((t) => t.name),
                  schema: seo.schema ?? null,
                }
              : null,
          });
          // One graph: the core's or another plugin's is replaced.
          next.tags = (next.tags ?? []).filter(
            (t) =>
              !(
                t.tag === 'json-ld' &&
                JSON.stringify((t as { data: unknown }).data).includes('"@graph"')
              ),
          );
          if (graph) next.tags.push({ tag: 'json-ld', data: graph });
        }
        return next as typeof head;
      },
      { priority: 20 },
    );

    // ---- Links and images in the page --------------------------------------------------
    ctx.hooks.filter('render.html', async (html, context) => {
      if (context.editorFrame) return html;
      const config = await configFor(ctx, context.siteId);
      let out = html;
      // Only inside the page's content: the theme's menus and footer are its own.
      const start = out.search(/<main\b/i);
      const end = out.search(/<\/main>/i);
      if (start < 0 || end < start) return html;
      let main = out.slice(start, end);
      if (moduleOn(config, 'links')) {
        const host = (() => {
          const m =
            /<link rel="canonical" href="https?:\/\/([^/"]+)/i.exec(out) ??
            /property="og:url" content="https?:\/\/([^/"]+)/i.exec(out);
          return m?.[1] ?? '';
        })();
        if (host) {
          main = linkAttributes(main, {
            host,
            nofollowExternal: flag(config, 'links_nofollow_external'),
            newWindowExternal: value(config, 'links_new_window_external') === true,
            nofollowImages: flag(config, 'links_nofollow_images'),
            nofollowDomains: lines(text(config, 'links_nofollow_domains')).map((d) =>
              d.toLowerCase().replace(/^www\./, ''),
            ),
            followDomains: lines(text(config, 'links_follow_domains')).map((d) =>
              d.toLowerCase().replace(/^www\./, ''),
            ),
          });
        }
      }
      if (moduleOn(config, 'imageSeo')) {
        main = imageTexts(main, {
          addAlt: flag(config, 'image_add_alt'),
          altFormat: text(config, 'image_alt_format'),
          addTitle: flag(config, 'image_add_title'),
          titleFormat: text(config, 'image_title_format'),
          title: context.entry?.title ?? '',
          sitename: '',
        });
      }
      out = out.slice(0, start) + main + out.slice(end);
      return out;
    });

    // ---- Sitemaps ------------------------------------------------------------------------
    ctx.hooks.filter('sitemap.sources', async (sources, { siteId }) => {
      const config = await configFor(ctx, siteId);
      if (!moduleOn(config, 'sitemap')) return sources;
      return sources.filter((s) =>
        s.kind === 'type'
          ? typeValue(config, s.slug, 'sitemap') !== false &&
            !(
              typeValue(config, s.slug, 'custom_robots') === true &&
              typeValue(config, s.slug, 'robots_noindex') === true
            )
          : taxonomyValue(config, s.slug, 'sitemap') !== false &&
            !(
              taxonomyValue(config, s.slug, 'custom_robots') === true &&
              taxonomyValue(config, s.slug, 'robots_noindex') === true
            ),
      );
    });
    ctx.hooks.filter('sitemap.urls', async (urls, { siteId }) => {
      const config = await configFor(ctx, siteId);
      if (!moduleOn(config, 'sitemap')) return urls;
      const exclude = new Set(lines(text(config, 'sitemap_exclude').replace(/,/g, '\n')));
      const images = value(config, 'sitemap_images') !== false;
      return urls
        .filter((url) => {
          if (url.entry && exclude.has(url.entry.id)) return false;
          if (url.term && exclude.has(url.term.id)) return false;
          const seo = entrySeo(url.entry?.fields);
          if (seo.noindex) return false;
          const canonical = seo.canonical?.trim();
          return !canonical || canonical.replace(/\/+$/, '') === url.loc.replace(/\/+$/, '');
        })
        .map((url) => (images ? url : { ...url, images: [] }));
    });

    // ---- robots.txt and llms.txt ------------------------------------------------------
    ctx.hooks.filter('robots.txt', async (base, { siteId, sitemap }) => {
      const config = await configFor(ctx, siteId);
      const custom = text(config, 'robots_txt');
      return moduleOn(config, 'robotsTxt') && custom.trim() ? robotsText(custom, sitemap) : base;
    });

    ctx.routes.public({
      method: 'GET',
      path: '/llms.txt',
      async handler(request) {
        const config = await configFor(ctx, request.siteId);
        if (!moduleOn(config, 'llms'))
          return { status: 404, body: 'Not Found', contentType: 'text/plain; charset=utf-8' };
        await rememberOrigin(ctx, request.siteId, request.origin);
        const site = await ctx.site(request.siteId);
        const limit = Math.min(Math.max(Number(value(config, 'llms_limit')) || 50, 1), 200);
        const types = lines(text(config, 'llms_types').replace(/,/g, '\n'));
        const sections: LlmsSection[] = [];
        for (const type of types.length ? types : ['page', 'article']) {
          if (typeValue(config, type, 'llms') === false) continue;
          const entries = await ctx.content.find(request.siteId, {
            type,
            locale: site.defaultLocale,
            limit,
          });
          sections.push({
            title: type === 'page' ? 'Pages' : type === 'article' ? 'Posts' : type,
            items: entries
              .filter((e) => !entrySeo(e.fields).noindex)
              .map((e) => ({
                title: e.title,
                url: e.url,
                excerpt: entrySeo(e.fields).description ?? '',
              })),
          });
        }
        return {
          body: llmsText({
            name: site.name,
            summary: text(config, 'llms_summary'),
            origin: request.origin,
            sections,
            extra: text(config, 'llms_extra'),
          }),
          contentType: 'text/plain; charset=utf-8',
          headers: { 'x-robots-tag': 'noindex, nofollow' },
          cacheTags: ['type:page', 'type:article', CACHE_TAG],
        };
      },
    });

    // ---- IndexNow -------------------------------------------------------------------------
    ctx.routes.public({
      method: 'GET',
      path: '/indexnow-key/:key',
      async handler(request) {
        const config = await configFor(ctx, request.siteId);
        const key = text(config, 'indexnow_key');
        return key && request.params.key === key && moduleOn(config, 'indexNow')
          ? {
              body: key,
              contentType: 'text/plain; charset=utf-8',
              headers: { 'x-robots-tag': 'noindex' },
            }
          : { status: 404, body: 'Not Found', contentType: 'text/plain; charset=utf-8' };
      },
    });

    ctx.hooks.on('entry.published', async ({ entry }, { siteId }) => {
      const config = await configFor(ctx, siteId);
      if (
        !moduleOn(config, 'indexNow') ||
        value(config, 'indexnow_auto') === false ||
        !text(config, 'indexnow_key')
      )
        return;
      if (typeValue(config, entry.type, 'indexnow') === false) return;
      const full = await ctx.content.get(siteId, entry.id);
      if (!full || entrySeo(full.fields).noindex) return;
      // The same address at most once every 5 seconds (several saves in a row).
      const key = `${siteId}:${full.url}`;
      if (Date.now() - (lastSent.get(key) ?? 0) < 5000) return;
      lastSent.set(key, Date.now());
      await indexNow(ctx, siteId, [full.url], false);
    });

    // ---- 404 log --------------------------------------------------------------------------
    ctx.hooks.on('request.notFound', async (event, { siteId }) => {
      const config = await configFor(ctx, siteId);
      if (!moduleOn(config, 'monitor404')) return;
      if (NOISE.test(event.path) || excluded(event.path, text(config, 'monitor_exclude'))) return;
      const path = (
        value(config, 'monitor_ignore_query') === false && event.query
          ? `${event.path}?${event.query}`
          : event.path
      ).slice(0, 1000);
      const limit = Math.min(Math.max(Number(value(config, 'monitor_limit')) || 500, 10), 5000);
      await ctx.db.transaction(siteId, async (tx) => {
        await tx
          .insert(notFound)
          .values({ siteId, path, referrer: event.referrer, userAgent: event.userAgent })
          .onConflictDoUpdate({
            target: [notFound.siteId, notFound.path],
            set: {
              hits: sql`${notFound.hits} + 1`,
              lastSeen: new Date(),
              ...(event.referrer ? { referrer: event.referrer } : {}),
              ...(event.userAgent ? { userAgent: event.userAgent } : {}),
            },
          });
        // Over the limit: the addresses not seen for longest go.
        const [{ count } = { count: 0 }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(notFound)
          .where(eq(notFound.siteId, siteId));
        if (count > limit) {
          const old = await tx
            .select({ id: notFound.id })
            .from(notFound)
            .where(eq(notFound.siteId, siteId))
            .orderBy(notFound.lastSeen)
            .limit(count - limit);
          await tx.delete(notFound).where(
            inArray(
              notFound.id,
              old.map((r) => r.id),
            ),
          );
        }
      });
    });

    // ---- Breadcrumbs block --------------------------------------------------------------
    ctx.blocks.register(
      defineBlock<
        Record<string, never>,
        { crumbs: Crumb[]; separator: string; prefix: string; hideLast: boolean }
      >({
        type: 'vetta/breadcrumbs',
        title: { en: 'Breadcrumbs', it: 'Briciole di pane' },
        description: {
          en: 'Home › Category › This page: where the page sits in the site.',
          it: 'Home › Categoria › Questa pagina: dove si trova la pagina nel sito.',
        },
        icon: 'arrow-right-alt2',
        category: 'widgets',
        async load(_attrs, context) {
          context.tag(CACHE_TAG);
          const config = await configFor(ctx, context.siteId);
          const separator = text(config, 'breadcrumbs_separator') || '›';
          const prefix = text(config, 'breadcrumbs_prefix');
          const hideLast = flag(config, 'breadcrumbs_hide_title');
          if (!context.entry) return { crumbs: [], separator, prefix, hideLast };
          const entry = await ctx.content.get(context.siteId, context.entry.id);
          if (!entry) return { crumbs: [], separator, prefix, hideLast };
          const page = context.entry as unknown as {
            terms?: Record<string, { name: string; url: string }[]>;
          };
          const crumbs = await trail(ctx, context.siteId, config, {
            id: entry.id,
            type: entry.type,
            title: entry.title,
            url: entry.url,
            locale: entry.locale,
            ...(page.terms ? { terms: page.terms } : {}),
            crumbTitle: entrySeo(entry.fields).breadcrumbTitle ?? null,
          });
          return { crumbs, separator, prefix, hideLast };
        },
        render({ data, context }) {
          if (!data || data.crumbs.length < 2) return null;
          const it = context.locale.toLowerCase().startsWith('it');
          const crumbs = data.hideLast ? data.crumbs.slice(0, -1) : data.crumbs;
          return (
            <nav className="vetta-breadcrumbs" aria-label={it ? 'Briciole di pane' : 'Breadcrumbs'}>
              <style>
                {'.vetta-breadcrumbs ol{display:flex;flex-wrap:wrap;gap:.35rem;list-style:none;margin:0 0 1rem;padding:0;font-size:.9em}' +
                  '.vetta-breadcrumbs li+li::before{content:attr(data-sep);margin-right:.35rem;opacity:.6}' +
                  '.vetta-breadcrumbs [aria-current]{opacity:.75}'}
              </style>
              <ol>
                {data.prefix && <li>{data.prefix}</li>}
                {crumbs.map((crumb, i) =>
                  i === data.crumbs.length - 1 ? (
                    <li key={crumb.url} data-sep={data.separator} aria-current="page">
                      {crumb.title}
                    </li>
                  ) : (
                    <li key={crumb.url} data-sep={data.separator}>
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

    // ---- Admin endpoints ---------------------------------------------------------------
    ctx.routes.api({
      method: 'GET',
      path: '/config',
      capability: 'manage_vetta',
      async handler(request) {
        await rememberOrigin(ctx, request.siteId, request.origin);
        return { body: { config: await configFor(ctx, request.siteId), origin: request.origin } };
      },
    });

    ctx.routes.api({
      method: 'PUT',
      path: '/config',
      capability: 'manage_vetta',
      async handler(request) {
        const next = sanitizeConfig((request.body as { config?: unknown } | null)?.config);
        // IndexNow needs a key: one is made when the module is on and none is set.
        if (!text(next, 'indexnow_key') && next.module_indexNow !== false)
          next.indexnow_key = randomBytes(16).toString('hex');
        await ctx.storage.set(request.siteId, 'config', next);
        configs.delete(request.siteId);
        await ctx.cache.invalidate(request.siteId, ['site', CACHE_TAG]);
        return { body: { config: next } };
      },
    });

    // What the editor's analysis needs to preview titles: templates, separator, modules (nothing secret).
    ctx.routes.api({
      method: 'GET',
      path: '/editor-config',
      capability: 'edit_entries',
      async handler(request) {
        const config = await configFor(ctx, request.siteId);
        const site = await ctx.site(request.siteId);
        const shown = Object.fromEntries(
          Object.entries(config).filter(
            ([k]) =>
              k === 'separator' ||
              k.startsWith('module_') ||
              /^pt_[a-z0-9_]+_(title|description)$/.test(k) ||
              k === 'home_title',
          ),
        );
        return { body: { config: shown, siteName: site.name } };
      },
    });

    // The main keyword used elsewhere already (the analysis tells the editor).
    ctx.routes.api({
      method: 'GET',
      path: '/keyword-used',
      capability: 'edit_entries',
      async handler(request) {
        const keyword = String(request.query.keyword ?? '')
          .trim()
          .toLowerCase();
        const id = String(request.query.id ?? '');
        if (!keyword) return { body: null };
        const entries = await ctx.content.find(request.siteId, {
          limit: 200,
          ...(request.query.locale ? { locale: String(request.query.locale) } : {}),
        });
        const found = entries.find(
          (e) => e.id !== id && keywordsOf(entrySeo(e.fields))[0]?.toLowerCase() === keyword,
        );
        return { body: found ? { title: found.title, url: found.url } : null };
      },
    });

    ctx.routes.api({
      method: 'GET',
      path: '/not-found',
      capability: 'manage_vetta',
      async handler(request) {
        const rows = await ctx.db.transaction(request.siteId, (tx) =>
          tx
            .select()
            .from(notFound)
            .where(eq(notFound.siteId, request.siteId))
            .orderBy(desc(notFound.lastSeen))
            .limit(500),
        );
        return { body: rows };
      },
    });

    ctx.routes.api({
      method: 'DELETE',
      path: '/not-found',
      capability: 'manage_vetta',
      async handler(request) {
        const ids = Array.isArray((request.body as { ids?: unknown } | null)?.ids)
          ? ((request.body as { ids: unknown[] }).ids.filter(
              (i) => typeof i === 'string' && /^[0-9a-f-]{36}$/.test(i),
            ) as string[])
          : null;
        await ctx.db.transaction(request.siteId, (tx) =>
          tx
            .delete(notFound)
            .where(
              ids
                ? and(eq(notFound.siteId, request.siteId), inArray(notFound.id, ids))
                : eq(notFound.siteId, request.siteId),
            ),
        );
        return { body: { ok: true } };
      },
    });

    ctx.routes.api({
      method: 'GET',
      path: '/indexnow',
      capability: 'manage_vetta',
      async handler(request) {
        const rows = await ctx.db.transaction(request.siteId, (tx) =>
          tx
            .select()
            .from(indexnowLog)
            .where(eq(indexnowLog.siteId, request.siteId))
            .orderBy(desc(indexnowLog.createdAt))
            .limit(100),
        );
        return { body: rows };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/indexnow',
      capability: 'manage_vetta',
      async handler(request) {
        await rememberOrigin(ctx, request.siteId, request.origin);
        const urls = String((request.body as { urls?: unknown } | null)?.urls ?? '')
          .split(/\s+/)
          .map((u) => u.trim())
          .filter((u) => /^(https?:\/\/|\/)[^\s"'<>]*$/.test(u))
          .slice(0, 1000);
        if (urls.length === 0)
          return { status: 400, body: { error: 'Write one or more addresses of this site.' } };
        return { body: await indexNow(ctx, request.siteId, urls, true) };
      },
    });

    // Old IndexNow rows go after 30 days anyway.
    ctx.schedule.every('vetta-cleanup', 24 * 60, async (siteId) => {
      await ctx.db.transaction(siteId, (tx) =>
        tx
          .delete(indexnowLog)
          .where(
            and(
              eq(indexnowLog.siteId, siteId),
              lt(indexnowLog.createdAt, new Date(Date.now() - 30 * 86_400_000)),
            ),
          ),
      );
    });
  },
});
