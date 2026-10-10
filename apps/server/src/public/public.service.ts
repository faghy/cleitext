import { promisify } from 'node:util';
import zlib from 'node:zlib';
import {
  entries,
  entryTerms,
  redirects,
  revisions,
  sites,
  taxonomies,
  terms,
  users,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import { documentText, type CxdBlock, type CxdDocument } from '@cleitext/blocks';
import type { RenderHookContext } from '@cleitext/plugin-sdk';
import {
  collectMediaIds,
  documentExcerpt,
  firstImage,
  renderHtmlDocument,
  type BlockRenderer,
  type RenderMedia,
} from '@cleitext/renderer';
import { fieldDefaults, type CoreSettings } from '@cleitext/shared';
import {
  PageProvider,
  resolveTemplate,
  templateCandidates,
  type HeadData,
  type LocaleLink,
  type PageContext,
  type PublicEntry,
  type TemplateProps,
  type ThemeDefinition,
} from '@cleitext/theme-sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, eq, inArray, ne, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SESSION_COOKIE } from '../auth/cookies.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { PageCacheService } from './page-cache.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  loadMedia,
  isPublished,
  isVisible,
  loadMenus,
  loadPublished,
  loadSiteData,
  summarize,
  type PublishedEntry,
  type SiteData,
} from './site-data.js';
import { verifySameOrigin } from '../auth/auth.guard.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { routeRequest, sendRouteResponse } from '../plugins/plugin-routes.js';
import { verifyPreviewToken } from './preview.js';
import { themeFor } from './themes.js';
import { PUBLIC_CSP } from '../common/security-headers.js';
import { matchPermalink } from './urls.js';

const HTML = 'text/html; charset=utf-8';
/** ts_headline settings: matches between \u0001 and \u0002 (never found in text). */
const HEADLINE_OPTIONS =
  'StartSel=\u0001, StopSel=\u0002, MaxWords=30, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "';
const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

interface Compressed {
  br?: Buffer;
  gzip?: Buffer;
}

export interface PublicResponse {
  status: number;
  html?: string;
  /** Defaults to HTML. */
  contentType?: string;
  /** Extra response headers (e.g. Retry-After). */
  headers?: Record<string, string>;
  redirect?: string;
  /** Cache tags of the page (docs/ARCHITECTURE.md §15). */
  tags: string[];
}

interface RequestScope {
  tx: SiteTransaction;
  siteId: string;
  data: SiteData;
  settings: CoreSettings;
  theme: ThemeDefinition;
  siteTitle: string;
  origin: string;
  locale: string;
  path: string;
  tags: Set<string>;
  /** Plugins active on the site. */
  activePlugins: ReadonlySet<string>;
  /** Signed-in visitor allowed to read private entries (never cached). */
  includePrivate: boolean;
  /** Renderers of plugin blocks for the entry being rendered. */
  blockRenderers?: ReadonlyMap<string, BlockRenderer>;
}

/** Public site: routing, data loading and theme rendering (docs/ARCHITECTURE.md §12). */
@Injectable()
export class PublicService {
  private readonly logger = new Logger('Public');

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly settingsService: SettingsService,
    private readonly cache: PageCacheService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly plugins: PluginHost,
  ) {}

  /** Fastify handler for every public GET/HEAD request. */
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const site = request.site;
    if (!site) {
      await reply.code(404).send();
      return;
    }
    void reply
      .header('x-content-type-options', 'nosniff')
      .header('referrer-policy', 'strict-origin-when-cross-origin')
      .header('x-frame-options', 'SAMEORIGIN')
      .header('content-security-policy', PUBLIC_CSP);
    try {
      const url = new URL(request.url, 'http://local');
      // Maintenance mode (RF-SIT-06): visitors get a 503; signed-in users see the site.
      if (site.status === 'maintenance' && !request.auth) {
        const page = await this.maintenance(
          site.id,
          `${request.protocol}://${request.host}`,
          url.pathname,
        );
        void reply.header('retry-after', '3600');
        await this.sendPage(request, reply, page.status, page.html ?? '', null, 'BYPASS');
        return;
      }

      // Signed-in users bypass the cache (they will see editing tools later).
      const cacheable =
        !request.cookies[SESSION_COOKIE] &&
        !url.pathname.startsWith('/search') &&
        !url.pathname.startsWith('/__preview/');
      const key = this.cache.key(site.id, request.host, request.url);

      if (cacheable) {
        const hit = this.cache.get(key);
        if (hit) {
          await this.sendPage(
            request,
            reply,
            hit.status,
            hit.html,
            hit.etag,
            'HIT',
            hit.contentType,
            hit,
          );
          return;
        }
      }

      const pluginRoute =
        request.method === 'GET' || request.method === 'HEAD'
          ? await this.matchPluginRoute(site.id, 'GET', url.pathname)
          : null;
      if (pluginRoute) {
        const outcome = await this.plugins.runHook(
          { plugin: pluginRoute.plugin.slug, name: `GET ${pluginRoute.route.path}` },
          () =>
            pluginRoute.route.handler(
              routeRequest(request, site.id, url.pathname, pluginRoute.params),
            ),
        );
        if (!outcome.ok) {
          await reply.code(500).type('text/plain; charset=utf-8').send('Internal Server Error');
          return;
        }
        const result = outcome.value;
        const status = result.status ?? 200;
        if (cacheable && status === 200 && result.cacheTags && typeof result.body === 'string') {
          const contentType = result.contentType ?? 'text/plain; charset=utf-8';
          const stored = this.cache.set(key, site.id, {
            status,
            html: result.body,
            contentType,
            tags: ['site', ...result.cacheTags],
          });
          for (const [name, value] of Object.entries(result.headers ?? {}))
            void reply.header(name, value);
          await this.sendPage(
            request,
            reply,
            status,
            result.body,
            stored.etag,
            'MISS',
            contentType,
            stored,
          );
        } else {
          void reply.header('x-cache', 'BYPASS').header('cache-control', 'private, no-cache');
          await sendRouteResponse(reply, result);
        }
        return;
      }

      const response = await this.respond(
        site.id,
        `${request.protocol}://${request.host}`,
        url.pathname,
        url.searchParams,
        request.auth ?? null,
      );
      if (response.redirect) {
        await reply.redirect(response.redirect, response.status);
        return;
      }
      const html = response.html ?? '';
      const contentType = response.contentType ?? HTML;
      for (const [name, value] of Object.entries(response.headers ?? {}))
        void reply.header(name, value);
      if (cacheable && (response.status === 200 || response.status === 404)) {
        const stored = this.cache.set(key, site.id, {
          status: response.status,
          html,
          contentType,
          tags: response.tags,
        });
        await this.sendPage(
          request,
          reply,
          response.status,
          html,
          stored.etag,
          'MISS',
          contentType,
          stored,
        );
      } else {
        await this.sendPage(request, reply, response.status, html, null, 'BYPASS', contentType);
      }
    } catch (error) {
      this.logger.error(error);
      await reply.code(500).type('text/plain; charset=utf-8').send('Internal Server Error');
    }
  }

  private async sendPage(
    request: FastifyRequest,
    reply: FastifyReply,
    status: number,
    html: string,
    etag: string | null,
    cacheStatus: 'HIT' | 'MISS' | 'BYPASS',
    contentType: string = HTML,
    /** Cached page: keeps its compressed forms for the next requests. */
    compressed: Compressed = {},
  ): Promise<void> {
    void reply.header('x-cache', cacheStatus);
    if (etag) {
      // Browsers revalidate every time; unchanged pages answer 304.
      void reply.header('etag', etag).header('cache-control', 'public, max-age=0, must-revalidate');
      if (status === 200 && request.headers['if-none-match'] === etag) {
        await reply.code(304).send();
        return;
      }
    } else {
      void reply.header('cache-control', 'private, no-cache');
    }
    const body = await this.encode(request, reply, html, compressed);
    await reply.code(status).type(contentType).send(body);
  }

  /** Brotli or gzip for clients that accept it (RNF-01: smaller pages, faster LCP). */
  private async encode(
    request: FastifyRequest,
    reply: FastifyReply,
    html: string,
    compressed: Compressed,
  ): Promise<string | Buffer> {
    if (html.length < 1024) return html;
    void reply.header('vary', 'accept-encoding');
    const accepted = String(request.headers['accept-encoding'] ?? '');
    if (/\bbr\b/.test(accepted)) {
      compressed.br ??= await brotli(html, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: html.length,
        },
      });
      void reply.header('content-encoding', 'br');
      return compressed.br;
    }
    if (/\bgzip\b/.test(accepted)) {
      compressed.gzip ??= await gzip(html, { level: 6 });
      void reply.header('content-encoding', 'gzip');
      return compressed.gzip;
    }
    return html;
  }

  async respond(
    siteId: string,
    origin: string,
    rawPath: string,
    query: URLSearchParams,
    /** Signed-in visitor: private entries are shown to those who may read them. */
    viewer: { capabilities: readonly string[] } | null = null,
  ): Promise<PublicResponse> {
    const includePrivate = viewer?.capabilities.includes('read_private_entries') ?? false;
    let path: string;
    try {
      path = decodeURIComponent(rawPath);
    } catch {
      return { status: 400, html: 'Bad Request', tags: [] };
    }
    // One canonical form: no trailing slash (except the root).
    if (path.length > 1 && path.endsWith('/')) {
      const search = query.toString();
      return {
        status: 301,
        redirect: `${encodeURI(path.replace(/\/+$/, '') || '/')}${search ? `?${search}` : ''}`,
        tags: [],
      };
    }

    return withContext(this.database.db, { siteId }, async (tx) => {
      const [redirect] = await tx.select().from(redirects).where(eq(redirects.fromPath, path));
      if (redirect) {
        await tx
          .update(redirects)
          .set({ hits: sql`${redirects.hits} + 1` })
          .where(eq(redirects.id, redirect.id));
        if (redirect.status !== 410) {
          return { status: redirect.status, redirect: redirect.toPath, tags: [] };
        }
      }

      const { scope, rest } = await this.scope(tx, siteId, origin, path, includePrivate);

      if (redirect?.status === 410) return this.notFound(scope, 410);
      if (path === '/robots.txt') return this.robots(scope);
      if (path === '/sitemap.xml') return this.sitemapIndex(scope);
      const sitemap = /^\/sitemap-([a-z0-9-]+)-([a-z]{2,3}(?:-[a-z]{2})?)\.xml$/i.exec(path);
      if (sitemap) {
        return (await this.sitemap(scope, sitemap[1]!, sitemap[2]!)) ?? this.notFound(scope, 404);
      }
      const preview = /^\/__preview\/([0-9a-f-]{36})$/.exec(path);
      if (preview) {
        return (
          (await this.preview(scope, preview[1]!, query.get('token') ?? '')) ??
          this.notFound(scope, 404)
        );
      }
      return (await this.route(scope, rest, query)) ?? this.notFound(scope, 404);
    });
  }

  /** Data shared by every route of a request. */
  private async scope(
    tx: SiteTransaction,
    siteId: string,
    origin: string,
    path: string,
    includePrivate = false,
  ): Promise<{ scope: RequestScope; rest: string }> {
    const activePlugins = await this.plugins.activeSlugs(siteId);
    const data = await loadSiteData(tx, activePlugins);
    const settings = await this.settingsService.core(tx);
    const [site] = await tx
      .select({ name: sites.name, theme: sites.themeSlug })
      .from(sites)
      .where(eq(sites.id, siteId));
    const { locale, rest } = data.urls.splitLocale(path);
    return {
      rest,
      scope: {
        tx,
        siteId,
        data,
        settings,
        theme: themeFor(site?.theme),
        siteTitle: settings.title || site?.name || 'Cleitext',
        origin,
        locale,
        path,
        tags: new Set(['site']),
        activePlugins,
        includePrivate,
      },
    };
  }

  /** The theme's maintenance page, 503 (RF-SIT-06). */
  async maintenance(siteId: string, origin: string, path: string): Promise<PublicResponse> {
    return withContext(this.database.db, { siteId }, async (tx) => {
      const { scope } = await this.scope(tx, siteId, origin, path);
      const props: TemplateProps = { kind: 'maintenance' };
      const head = this.head(scope, {
        title: scope.siteTitle,
        description: '',
        path,
        alternates: [],
        type: 'website',
        image: null,
        noindex: true,
      });
      return this.render(scope, props, templateCandidates(props), head, new Map(), [], 503);
    });
  }

  // ---- Previews, robots.txt, sitemaps -------------------------------------------------

  /** Latest saved version of any entry, behind a signed link (RF-CNT-09). */
  private async preview(
    scope: RequestScope,
    entryId: string,
    token: string,
  ): Promise<PublicResponse | null> {
    if (!verifyPreviewToken(this.config.appSecret, entryId, token)) return null;
    const [row] = await scope.tx
      .select({
        entry: entries,
        title: revisions.title,
        document: revisions.document,
        fields: revisions.fields,
        excerpt: revisions.excerpt,
        featuredMediaId: revisions.featuredMediaId,
        authorName: users.displayName,
      })
      .from(entries)
      .innerJoin(revisions, eq(revisions.id, entries.currentRevisionId))
      .leftJoin(users, eq(users.id, entries.authorId))
      .where(and(eq(entries.id, entryId), ne(entries.status, 'trashed')));
    if (!row) return null;
    scope.locale = row.entry.locale;
    const response = await this.renderEntry(
      scope,
      {
        row: { ...row.entry, title: row.title },
        document: row.document as CxdDocument,
        fields: row.fields as Record<string, unknown>,
        excerpt: row.excerpt,
        featuredMediaId: row.featuredMediaId,
        authorName: row.authorName,
      },
      { isFrontPage: false, preview: true },
    );
    return { ...response, headers: { 'x-robots-tag': 'noindex, nofollow' } };
  }

  private robots(scope: RequestScope): PublicResponse {
    const lines = scope.settings.discourageSearchEngines
      ? ['User-agent: *', 'Disallow: /']
      : [
          'User-agent: *',
          'Allow: /',
          'Disallow: /admin',
          'Disallow: /api/',
          'Disallow: /__preview/',
          'Disallow: /search',
          '',
          `Sitemap: ${scope.origin}/sitemap.xml`,
        ];
    return {
      status: 200,
      html: `${lines.join('\n')}\n`,
      contentType: 'text/plain; charset=utf-8',
      tags: ['site'],
    };
  }

  /** Index of per-type, per-language sitemaps (RF-THM-07). */
  private async sitemapIndex(scope: RequestScope): Promise<PublicResponse> {
    const rows = await scope.tx
      .selectDistinct({ type: entries.typeSlug, locale: entries.locale })
      .from(entries)
      .where(isPublished);
    const items = rows
      .map(
        (r) =>
          `<sitemap><loc>${xml(`${scope.origin}/sitemap-${r.type}-${r.locale}.xml`)}</loc></sitemap>`,
      )
      .join('');
    return {
      status: 200,
      html: `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`,
      contentType: 'application/xml; charset=utf-8',
      tags: ['site', ...rows.map((r) => `type:${r.type}`)],
    };
  }

  private async sitemap(
    scope: RequestScope,
    type: string,
    locale: string,
  ): Promise<PublicResponse | null> {
    const { tx, data, settings } = scope;
    if (!data.types.some((t) => t.slug === type) || !data.locales.some((l) => l.code === locale))
      return null;
    const list = await loadPublished(
      tx,
      and(eq(entries.typeSlug, type), eq(entries.locale, locale)),
      {
        limit: 50_000,
      },
    );
    if (list.length === 0) return null;
    const groups = [...new Set(list.map((e) => e.row.translationGroup))];
    const siblings = await loadPublished(tx, inArray(entries.translationGroup, groups));
    const absolute = (path: string) => `${scope.origin}${path}`;
    const urlOf = (entry: PublishedEntry) =>
      settings.frontPage === entry.row.translationGroup
        ? data.urls.home(entry.row.locale)
        : data.urls.entry(entry.row);
    const urls = list
      .map((entry) => {
        const alternates = siblings.filter(
          (s) => s.row.translationGroup === entry.row.translationGroup,
        );
        const links =
          alternates.length > 1
            ? alternates
                .map(
                  (a) =>
                    `<xhtml:link rel="alternate" hreflang="${xml(a.row.locale)}" href="${xml(absolute(urlOf(a)))}"/>`,
                )
                .join('')
            : '';
        return `<url><loc>${xml(absolute(urlOf(entry)))}</loc><lastmod>${entry.row.updatedAt.toISOString()}</lastmod>${links}</url>`;
      })
      .join('');
    return {
      status: 200,
      html: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`,
      contentType: 'application/xml; charset=utf-8',
      tags: ['site', `type:${type}`],
    };
  }

  // ---- Routing --------------------------------------------------------------------

  private async route(
    scope: RequestScope,
    rest: string,
    query: URLSearchParams,
  ): Promise<PublicResponse | null> {
    const { data, locale, settings } = scope;

    // Home: static front page, or the latest posts (paginated).
    const home = /^\/(?:page\/(\d+))?$/.exec(rest);
    if (home) {
      const page = Number(home[1] ?? 1);
      if (!home[1] && settings.frontPage) {
        const front = await this.byGroup(scope, settings.frontPage);
        if (front) return this.renderEntry(scope, front, { isFrontPage: true });
      }
      if (home[1] && page < 2) return null;
      return this.renderArchive(scope, {
        where: eq(entries.typeSlug, 'article'),
        title: scope.siteTitle,
        base: data.urls.home(locale),
        page,
        isHome: true,
        tag: 'type:article',
      });
    }

    if (rest === '/search') {
      return this.renderSearch(
        scope,
        (query.get('q') ?? '').trim().slice(0, 200),
        Number(query.get('page') ?? 1),
      );
    }

    // Category and tag archives: /{taxonomy}/{slug}[/page/N]
    const taxonomy = /^\/([a-z0-9-]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/page\/(\d+))?$/.exec(rest);
    if (taxonomy && data.taxonomies.includes(taxonomy[1]!)) {
      return this.renderTermArchive(scope, taxonomy[1]!, taxonomy[2]!, Number(taxonomy[3] ?? 1));
    }

    // Entries by permalink.
    const match = matchPermalink(rest, data.types);
    if (!match) return null;
    const [entry] = await this.published(
      scope,
      and(
        eq(entries.typeSlug, match.type),
        eq(entries.locale, locale),
        eq(entries.slug, match.slug),
      ),
      { limit: 1 },
    );
    if (!entry) return null;
    // The full URL must match (parents, year): one canonical address per entry.
    if (data.urls.entry(entry.row) !== scope.path) return null;

    // The page that lists the posts, when a static front page is used.
    if (settings.postsPage && entry.row.translationGroup === settings.postsPage) {
      return this.renderArchive(scope, {
        where: eq(entries.typeSlug, 'article'),
        title: entry.row.title,
        base: data.urls.entry(entry.row),
        page: 1,
        isHome: false,
        tag: 'type:article',
      });
    }
    return this.renderEntry(scope, entry, { isFrontPage: false });
  }

  private async byGroup(scope: RequestScope, group: string): Promise<PublishedEntry | null> {
    const [entry] = await this.published(
      scope,
      and(eq(entries.translationGroup, group), eq(entries.locale, scope.locale)),
      { limit: 1 },
    );
    return entry ?? null;
  }

  // ---- Pages ------------------------------------------------------------------------

  private async renderEntry(
    scope: RequestScope,
    entry: PublishedEntry,
    options: { isFrontPage: boolean; status?: number; preview?: boolean },
  ): Promise<PublicResponse> {
    const { tx, data } = scope;
    scope.tags.add(`entry:${entry.row.id}`);
    const media = await loadMedia(
      tx,
      [
        ...collectMediaIds(entry.document),
        ...(entry.featuredMediaId ? [entry.featuredMediaId] : []),
      ],
      scope.locale,
    );

    const termRows = await tx
      .select({ term: terms, taxonomy: taxonomies.slug })
      .from(entryTerms)
      .innerJoin(terms, eq(terms.id, entryTerms.termId))
      .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
      .where(eq(entryTerms.entryId, entry.row.id));
    const entryTermsMap: PublicEntry['terms'] = {};
    for (const { term, taxonomy } of termRows) {
      scope.tags.add(`term:${term.id}`);
      (entryTermsMap[taxonomy] ??= []).push({
        name: term.name,
        slug: term.slug,
        url: data.urls.term(taxonomy, term.slug, term.locale),
      });
    }

    const translationRows = await this.published(
      scope,
      eq(entries.translationGroup, entry.row.translationGroup),
    );
    const translations = translationRows
      .filter((t) => t.row.id !== entry.row.id)
      .map((t) => ({ locale: t.row.locale, url: data.urls.entry(t.row), title: t.row.title }));

    const featured = entry.featuredMediaId ? (media.get(entry.featuredMediaId) ?? null) : null;
    const image = featured ? { id: featured.id } : firstImage(entry.document);
    const publicEntry: PublicEntry = {
      id: entry.row.id,
      type: entry.row.typeSlug,
      locale: entry.row.locale,
      slug: entry.row.slug,
      title: entry.row.title,
      url: options.isFrontPage ? data.urls.home(scope.locale) : data.urls.entry(entry.row),
      publishedAt: entry.row.publishedAt?.toISOString() ?? null,
      excerpt: entry.excerpt || documentExcerpt(entry.document),
      featuredImage: featured,
      author: entry.authorName ? { displayName: entry.authorName } : null,
      image: image?.id ? (media.get(image.id) ?? null) : null,
      fields: entry.fields,
      document: entry.document,
      terms: entryTermsMap,
      translations,
    };
    if (scope.activePlugins.size > 0) {
      const blocks = await this.plugins.applyFilter(
        'render.blocks',
        publicEntry.document.blocks,
        { ...this.hookContext(scope, 'entry', publicEntry), entry: publicEntry },
        scope.siteId,
      );
      publicEntry.document = { ...publicEntry.document, blocks };
      scope.blockRenderers = await this.pluginBlockRenderers(scope, publicEntry);
    }

    const alternates = [
      { locale: entry.row.locale, url: publicEntry.url },
      ...translations.map((t) => ({ locale: t.locale, url: t.url })),
    ];
    const head = this.head(scope, {
      title: options.isFrontPage
        ? this.homeTitle(scope)
        : `${options.preview ? 'Preview: ' : ''}${entry.row.title} – ${scope.siteTitle}`,
      description: publicEntry.excerpt,
      path: publicEntry.url,
      alternates,
      type: entry.row.typeSlug === 'article' ? 'article' : 'website',
      image: publicEntry.image,
      noindex: options.status === 404 || options.preview === true,
    });
    const props: TemplateProps = {
      kind: 'entry',
      entry: publicEntry,
      isFrontPage: options.isFrontPage,
    };
    return this.render(
      scope,
      props,
      templateCandidates(props),
      head,
      media,
      alternates,
      options.status ?? 200,
    );
  }

  private async renderArchive(
    scope: RequestScope,
    options: {
      where: ReturnType<typeof and>;
      title: string;
      base: string;
      page: number;
      isHome: boolean;
      tag: string;
      /** The same archive in the other languages (translated terms). */
      alternates?: { locale: string; url: string }[];
      term?: {
        taxonomy: string;
        slug: string;
        name: string;
        description: string | null;
        id: string;
      };
    },
  ): Promise<PublicResponse | null> {
    const { tx, data, settings } = scope;
    scope.tags.add(options.tag);
    const perPage = settings.postsPerPage;
    const where = and(options.where, eq(entries.locale, scope.locale));
    const total = await this.count(scope, where);
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    if (options.page > totalPages || options.page < 1) return null;
    const list = await this.published(scope, where, {
      limit: perPage,
      offset: (options.page - 1) * perPage,
    });
    const { summaries, media } = await summarize(tx, list, data.urls, scope.locale);
    for (const entry of list) scope.tags.add(`entry:${entry.row.id}`);

    const pagePath = data.urls.page(options.base, options.page);
    const props: TemplateProps = {
      kind: 'archive',
      title: options.title,
      ...(options.term
        ? {
            term: {
              taxonomy: options.term.taxonomy,
              name: options.term.name,
              description: options.term.description,
            },
          }
        : {}),
      entries: summaries,
      pagination: {
        page: options.page,
        totalPages,
        prevUrl: options.page > 1 ? data.urls.page(options.base, options.page - 1) : null,
        nextUrl: options.page < totalPages ? data.urls.page(options.base, options.page + 1) : null,
      },
      isHome: options.isHome,
    };
    const head = this.head(scope, {
      title: options.isHome ? this.homeTitle(scope) : `${options.title} – ${scope.siteTitle}`,
      description: options.term?.description ?? scope.settings.tagline,
      path: pagePath,
      alternates: options.isHome
        ? data.locales.map((l) => ({ locale: l.code, url: data.urls.home(l.code) }))
        : (options.alternates ?? []),
      type: 'website',
      image: null,
      noindex: false,
    });
    const candidates = templateCandidates(props, {
      type: 'article',
      ...(options.term ? { taxonomy: options.term.taxonomy, termSlug: options.term.slug } : {}),
    });
    return this.render(scope, props, candidates, head, media, options.alternates ?? [], 200);
  }

  private async renderTermArchive(
    scope: RequestScope,
    taxonomySlug: string,
    slug: string,
    page: number,
  ): Promise<PublicResponse | null> {
    const [row] = await scope.tx
      .select({ term: terms })
      .from(terms)
      .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
      .where(
        and(
          eq(taxonomies.slug, taxonomySlug),
          eq(terms.slug, slug),
          eq(terms.locale, scope.locale),
        ),
      );
    if (!row) return null;
    const ids = scope.tx
      .select({ id: entryTerms.entryId })
      .from(entryTerms)
      .where(eq(entryTerms.termId, row.term.id));
    // Translations of the term (RF-TAX-03), in the languages of the site.
    const translations = await scope.tx
      .select({ locale: terms.locale, slug: terms.slug })
      .from(terms)
      .where(
        and(
          eq(terms.taxonomyId, row.term.taxonomyId),
          eq(terms.translationGroup, row.term.translationGroup),
        ),
      );
    const enabled = new Set(scope.data.locales.map((l) => l.code));
    const alternates =
      translations.length > 1
        ? translations
            .filter((tr) => enabled.has(tr.locale))
            .map((tr) => ({
              locale: tr.locale,
              url: scope.data.urls.term(taxonomySlug, tr.slug, tr.locale),
            }))
        : [];
    return this.renderArchive(scope, {
      alternates,
      where: inArray(entries.id, ids),
      title: row.term.name,
      base: scope.data.urls.term(taxonomySlug, slug, scope.locale),
      page,
      isHome: false,
      tag: `term:${row.term.id}`,
      term: {
        taxonomy: taxonomySlug,
        slug,
        name: row.term.name,
        description: row.term.description,
        id: row.term.id,
      },
    });
  }

  /** Full-text search in the current language (RF-THM-10). */
  private async renderSearch(
    scope: RequestScope,
    q: string,
    page: number,
  ): Promise<PublicResponse> {
    const { tx, data, settings } = scope;
    scope.tags.add('search');
    const perPage = settings.postsPerPage;
    const current = Number.isInteger(page) && page > 0 ? page : 1;
    let list: PublishedEntry[] = [];
    let total = 0;
    if (q) {
      const match = sql`${entries.search} @@ plainto_tsquery('simple', unaccent(${q}))`;
      const where = and(eq(entries.locale, scope.locale), match);
      total = await this.count(scope, where);
      list = await this.published(scope, where, {
        limit: perPage,
        offset: (current - 1) * perPage,
      });
    }
    const { summaries, media } = await summarize(tx, list, data.urls, scope.locale);
    // The matching words in context, marked by PostgreSQL (RF-THM-10).
    await Promise.all(
      list.map(async (entry, index) => {
        const text = `${entry.row.title}. ${documentText(entry.document)}`.slice(0, 20_000);
        const [row] = await tx.execute<{ h: string }>(
          sql`select ts_headline('simple', ${text}, plainto_tsquery('simple', ${q}) || plainto_tsquery('simple', unaccent(${q})), ${HEADLINE_OPTIONS}) as h`,
        );
        if (row?.h && row.h.includes('\u0001')) summaries[index]!.highlight = splitHighlight(row.h);
      }),
    );
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const base = `${data.urls.search(scope.locale)}?q=${encodeURIComponent(q)}`;
    const props: TemplateProps = {
      kind: 'search',
      query: q,
      entries: summaries,
      pagination: {
        page: current,
        totalPages,
        prevUrl: current > 1 ? `${base}&page=${current - 1}` : null,
        nextUrl: current < totalPages ? `${base}&page=${current + 1}` : null,
      },
    };
    const head = this.head(scope, {
      title: `${q || 'Search'} – ${scope.siteTitle}`,
      description: '',
      path: data.urls.search(scope.locale),
      alternates: [],
      type: 'website',
      image: null,
      noindex: true,
    });
    return this.render(scope, props, templateCandidates(props), head, media, [], 200);
  }

  /** The configured error page, or the theme's 404 template. */
  private async notFound(scope: RequestScope, status: number): Promise<PublicResponse> {
    if (scope.settings.errorPage) {
      const page = await this.byGroup(scope, scope.settings.errorPage);
      if (page) return this.renderEntry(scope, page, { isFrontPage: false, status });
    }
    const props: TemplateProps = { kind: '404' };
    const head = this.head(scope, {
      title: `Not found – ${scope.siteTitle}`,
      description: '',
      path: scope.path,
      alternates: [],
      type: 'website',
      image: null,
      noindex: true,
    });
    return this.render(scope, props, templateCandidates(props), head, new Map(), [], status);
  }

  // ---- Rendering ----------------------------------------------------------------------

  private async render(
    scope: RequestScope,
    props: TemplateProps,
    candidates: string[],
    head: HeadData,
    media: Map<string, RenderMedia>,
    alternates: { locale: string; url: string }[],
    status: number,
  ): Promise<PublicResponse> {
    const { data, theme, locale } = scope;
    if (scope.activePlugins.size > 0) {
      const hookContext = this.hookContext(
        scope,
        props.kind,
        props.kind === 'entry' ? props.entry : undefined,
      );
      candidates = await this.plugins.applyFilter(
        'theme.templateCandidates',
        candidates,
        hookContext,
        scope.siteId,
      );
      head = await this.plugins.applyFilter('render.head', head, hookContext, scope.siteId);
    }
    const menus = await loadMenus(
      scope.tx,
      locale,
      data.urls,
      scope.path,
      new Set(data.types.map((t) => t.slug)),
    );
    scope.tags.add(`menus:${locale}`);
    const locales: LocaleLink[] = data.locales.map((l) => ({
      code: l.code,
      name: l.name,
      url: alternates.find((a) => a.locale === l.code)?.url ?? data.urls.home(l.code),
      current: l.code === locale,
    }));
    const context: PageContext = {
      site: {
        id: scope.siteId,
        title: scope.siteTitle,
        tagline: scope.settings.tagline,
        origin: scope.origin,
        timezone: scope.settings.timezone,
        dateStyle: scope.settings.dateStyle,
      },
      locale,
      locales,
      menus,
      urls: { home: data.urls.home(locale), search: data.urls.search(locale) },
      media,
      ...(scope.blockRenderers ? { blockRenderers: scope.blockRenderers } : {}),
    };
    const Template = resolveTemplate(theme, candidates);
    let html = renderHtmlDocument(
      createElement(PageProvider, {
        value: context,
        children: createElement(theme.Layout, {
          head,
          css: theme.css,
          children: createElement(Template, props),
        }),
      }),
    );
    if (scope.activePlugins.size > 0) {
      html = await this.plugins.applyFilter(
        'render.html',
        html,
        this.hookContext(scope, props.kind, props.kind === 'entry' ? props.entry : undefined),
        scope.siteId,
      );
    }
    return { status, html, tags: [...scope.tags] };
  }

  // ---- Plugins ----------------------------------------------------------------------

  private hookContext(
    scope: RequestScope,
    route: TemplateProps['kind'],
    entry?: PublicEntry,
  ): RenderHookContext {
    return {
      siteId: scope.siteId,
      locale: scope.locale,
      route: route as RenderHookContext['route'],
      path: scope.path,
      ...(entry ? { entry } : {}),
      tag: (tag: string) => {
        scope.tags.add(tag);
      },
    };
  }

  /**
   * Plugin blocks are loaded and rendered one by one before the page: a
   * failing block renders nothing instead of breaking the page.
   */
  private async pluginBlockRenderers(
    scope: RequestScope,
    entry: PublicEntry,
  ): Promise<Map<string, BlockRenderer> | undefined> {
    const definitions = new Map(
      (await this.plugins.activePlugins(scope.siteId)).flatMap((plugin) =>
        plugin.blocks.map((block) => [block.type, { plugin: plugin.slug, block }] as const),
      ),
    );
    if (definitions.size === 0) return undefined;
    const found: CxdBlock[] = [];
    const walk = (blocks: CxdBlock[]) => {
      for (const block of blocks) {
        if (definitions.has(block.type)) found.push(block);
        if (block.children) walk(block.children);
      }
    };
    walk(entry.document.blocks);
    if (found.length === 0) return undefined;

    const markup = new Map<string, string>();
    await Promise.all(
      found.map(async (instance) => {
        const { plugin, block } = definitions.get(instance.type)!;
        const attrs = { ...fieldDefaults(block.attributes ?? []), ...instance.attrs };
        const outcome = await this.plugins.runHook(
          { plugin, name: `block ${block.type}` },
          async () => {
            const data = block.load
              ? await block.load(attrs, {
                  siteId: scope.siteId,
                  locale: scope.locale,
                  entry: { id: entry.id, type: entry.type },
                  tag: (tag) => {
                    scope.tags.add(tag);
                  },
                })
              : undefined;
            return renderToStaticMarkup(
              createElement(
                Fragment,
                null,
                block.render({
                  attrs,
                  data,
                  block: instance,
                  context: { siteId: scope.siteId, locale: scope.locale },
                }),
              ),
            );
          },
        );
        if (outcome.ok) markup.set(instance.id, outcome.value);
      }),
    );
    const renderer: BlockRenderer = ({ block }) => {
      const html = markup.get(block.id);
      return html
        ? createElement('div', {
            className: `wp-block-${block.type.replace('/', '-')}`,
            dangerouslySetInnerHTML: { __html: html },
          })
        : null;
    };
    return new Map([...definitions.keys()].map((type) => [type, renderer]));
  }

  /** A public address of an active plugin (`ctx.routes.public`). */
  async matchPluginRoute(siteId: string, method: string, path: string) {
    if (this.plugins.list().length === 0) return null;
    for (const plugin of await this.plugins.activePlugins(siteId)) {
      for (const route of plugin.publicRoutes) {
        if (route.method !== method) continue;
        const params = route.compiled.match(path);
        if (params) return { plugin, route, params };
      }
    }
    return null;
  }

  /** POST to the public site: only plugin routes (e.g. form submissions) accept it. */
  async handlePost(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const site = request.site;
    const path = new URL(request.url, 'http://local').pathname;
    const match =
      site && site.status !== 'maintenance'
        ? await this.matchPluginRoute(site.id, 'POST', path)
        : null;
    if (!site || !match) {
      await reply.code(404).type('text/plain; charset=utf-8').send('Not Found');
      return;
    }
    try {
      verifySameOrigin(request);
    } catch {
      await reply.code(403).type('text/plain; charset=utf-8').send('Forbidden');
      return;
    }
    const outcome = await this.plugins.runHook(
      { plugin: match.plugin.slug, name: `POST ${match.route.path}` },
      () => match.route.handler(routeRequest(request, site.id, path, match.params)),
    );
    void reply.header('cache-control', 'private, no-cache').header('x-cache', 'BYPASS');
    if (!outcome.ok) {
      await reply.code(500).type('text/plain; charset=utf-8').send('Internal Server Error');
      return;
    }
    await sendRouteResponse(reply, outcome.value);
  }

  private head(
    scope: RequestScope,
    input: {
      title: string;
      description: string;
      path: string;
      alternates: { locale: string; url: string }[];
      type: 'website' | 'article';
      image: RenderMedia | null;
      noindex: boolean;
    },
  ): HeadData {
    const absolute = (path: string) => `${scope.origin}${path}`;
    const alternates =
      input.alternates.length > 1
        ? [
            ...input.alternates.map((a) => ({ hreflang: a.locale, href: absolute(a.url) })),
            ...(() => {
              const fallback = input.alternates.find(
                (a) => a.locale === scope.data.urls.defaultLocale,
              );
              return fallback ? [{ hreflang: 'x-default', href: absolute(fallback.url) }] : [];
            })(),
          ]
        : [];
    const og: Record<string, string> = {
      'og:title': input.title,
      'og:type': input.type,
      'og:url': absolute(input.path),
      'og:site_name': scope.siteTitle,
      'og:locale': scope.locale.replace('-', '_'),
    };
    // Pages without their own summary fall back to the tagline.
    const description = input.description || scope.settings.tagline;
    if (description) og['og:description'] = description;
    if (input.image) og['og:image'] = absolute(input.image.url);
    const noindex = input.noindex || scope.settings.discourageSearchEngines;
    return {
      title: input.title,
      description,
      canonical: input.noindex ? null : absolute(input.path),
      alternates,
      og,
      ...(noindex ? { robots: 'noindex, follow' } : {}),
    };
  }

  private homeTitle(scope: RequestScope): string {
    return scope.settings.tagline
      ? `${scope.siteTitle} – ${scope.settings.tagline}`
      : scope.siteTitle;
  }

  private async count(scope: RequestScope, where: ReturnType<typeof and>): Promise<number> {
    const [row] = await scope.tx
      .select({ n: count() })
      .from(entries)
      .where(and(isVisible(scope.includePrivate), where));
    return Number(row?.n ?? 0);
  }

  /** Entries the current visitor may see (private ones only with the capability). */
  private published(
    scope: RequestScope,
    where: ReturnType<typeof and>,
    options: { limit?: number; offset?: number } = {},
  ): Promise<PublishedEntry[]> {
    return loadPublished(scope.tx, where, { ...options, includePrivate: scope.includePrivate });
  }
}

function xml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** ts_headline output (matches between \u0001 and \u0002) → text segments. */
function splitHighlight(value: string): { text: string; match: boolean }[] {
  const parts: { text: string; match: boolean }[] = [];
  for (const chunk of value.split('\u0001')) {
    const [match, rest] = chunk.includes('\u0002') ? chunk.split('\u0002', 2) : [null, chunk];
    if (match) parts.push({ text: match, match: true });
    if (rest) parts.push({ text: rest, match: false });
  }
  return parts;
}
