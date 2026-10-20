import { promisify } from 'node:util';
import zlib from 'node:zlib';
import {
  comments,
  entries,
  entryTerms,
  patterns,
  redirects,
  revisions,
  siteDomains,
  sites,
  taxonomies,
  terms,
  users,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import { cxdDocumentSchema, documentText, type CxdBlock, type CxdDocument } from '@cleitext/blocks';
import type {
  BlockPage,
  PluginPageContent,
  PublicQuery,
  RenderHookContext,
  RouteResponse,
} from '@cleitext/plugin-sdk';
import {
  Block,
  Blocks,
  collectMediaIds,
  collectPatternIds,
  documentExcerpt,
  firstImage,
  renderHtmlDocument,
  withCoreBlockCss,
  type BlockRenderer,
  type RenderMedia,
} from '@cleitext/renderer';
import { ADMIN_PATH, type CoreSettings, fieldDefaults } from '@cleitext/shared';
import {
  type AccountAttrs,
  COMMUNITY_CSS,
  COMMUNITY_JS,
  Location,
  PageProvider,
  resolveTemplate,
  templateCandidates,
  type HeadData,
  type LocaleLink,
  type EntryComments,
  type PageContext,
  type PublicComment,
  type PublicEntry,
  type PublicEntrySummary,
  type Viewer,
  type MenuItemView,
  type ThemeLocation,
  type TemplateProps,
  type ThemeDefinition,
} from '@cleitext/theme-sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AccountsService } from '../community/accounts.service.js';
import { CommentsService } from '../community/comments.service.js';
import { CommunityPublic, safePath, withQuery } from '../community/community-public.js';
import { setSessionCookie } from '../auth/cookies.js';
import { createHash } from 'node:crypto';
import { and, count, desc, eq, gt, inArray, lt, ne, notInArray, or, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SESSION_COOKIE } from '../auth/cookies.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { withBackToTop } from './back-to-top.js';
import { avatarUrl } from '../profile/avatar.js';
import { adminBarEditLink, withAdminBar } from './admin-bar.js';
import { LanguagesService } from '../content/languages.service.js';
import { PageCacheService } from './page-cache.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  loadMedia,
  isVisible,
  loadMenus,
  loadPublished,
  loadSiteData,
  summarize,
  addSummaryTerms,
  entryAuthor,
  type PublishedEntry,
  type SiteData,
} from './site-data.js';
import { verifySameOrigin } from '../auth/auth.guard.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { routeRequest, sendRouteResponse, setPluginCookies } from '../plugins/plugin-routes.js';
import { pluginPageBlock } from './plugin-page.js';
import { pluginAssetUrl } from '../plugins/plugin-assets.js';
import { verifyPreviewToken } from './preview.js';
import { themeFor } from './themes.js';
import { PUBLIC_CSP } from '../common/security-headers.js';
import { themeAreas, themeMediaIds, themeSettings } from './theme-data.js';
import { SITEMAP_RE, SITEMAP_XSL, sitemap, sitemapIndex, type SitemapContext } from './sitemaps.js';
import { matchPermalinks } from './urls.js';

const HTML = 'text/html; charset=utf-8';
/** Hook points a theme marks with `<Location name="hook:…">` (plugin API 1.33). */
const HOOK_LOCATION = /^hook:[A-Za-z0-9_-]{1,64}$/;
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
  /** For the toolbar of signed-in users. */
  siteTitle?: string;
  entry?: { id: string; type: string; editor?: string };
  /** The account and sign-out addresses in the page's language, for the toolbar. */
  account?: { url: string; logout: string };
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
  /** The address's query parameters (e.g. a loop's page), for plugin blocks. */
  params?: Record<string, string>;
  tags: Set<string>;
  /** Plugins active on the site. */
  activePlugins: ReadonlySet<string>;
  /** Signed-in visitor allowed to read private entries (never cached). */
  includePrivate: boolean;
  /** The signed-in visitor (pages for them are never cached). */
  viewer?: Viewer | null;
  /** Renderers of plugin blocks for the entry being rendered. */
  blockRenderers?: ReadonlyMap<string, BlockRenderer>;
  /** Unsaved theme settings shown by the Customize preview (RF-THM-03). */
  themeSettings?: Record<string, unknown>;
  /** Preview for a visual editor: the content is left to the editor (`PageContext.editorFrame`). */
  editorFrame?: boolean;
  /** CSS of the plugin blocks on the page (`css`), added to `<head>`. */
  blockCss?: string[];
  /** A plugin page that lists entries like an archive (`PluginPageContent.archive`). */
  pluginArchive?: NonNullable<PluginPageContent['archive']> & {
    title: string;
    description: string;
    html: string;
  };
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
    private readonly languages: LanguagesService,
    private readonly comments: CommentsService,
    private readonly community: CommunityPublic,
    private readonly accounts: AccountsService,
  ) {}

  /** The site's default language and every language code (for public forms). */
  private async localesOf(siteId: string): Promise<{ defaultLocale: string; codes: string[] }> {
    const defaultLocale = await withContext(this.database.db, { siteId }, async (tx) => {
      const [row] = await tx
        .select({ locale: sites.defaultLocale })
        .from(sites)
        .where(eq(sites.id, siteId));
      return row?.locale ?? 'en';
    });
    const locales = await this.languages.locales(siteId, defaultLocale);
    return { defaultLocale, codes: locales.map((l) => l.code) };
  }

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

      // Email confirmation links of new accounts (RF-USR-11): they sign in.
      const verify = /^(\/[a-z]{2}(?:-[a-z]{2,4})?)?\/account\/verify$/i.exec(url.pathname);
      if (verify) {
        const base = `${verify[1] ?? ''}/account`;
        const { defaultLocale } = await this.localesOf(site.id);
        const locale = verify[1]?.slice(1) ?? defaultLocale;
        try {
          const result = await this.accounts.verify(site.id, url.searchParams.get('token') ?? '', {
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
            origin: `${request.protocol}://${request.host}`,
            locale,
          });
          setSessionCookie(request, reply, result.token, {
            remember: false,
            expiresAt: result.expiresAt,
          });
          await reply
            .header('cache-control', 'private, no-store')
            .redirect(`${base}?verified=1`, 303);
        } catch (error) {
          const text = error instanceof Error ? error.message : 'This link is invalid.';
          await reply
            .header('cache-control', 'private, no-store')
            .redirect(withQuery(`${base}/login`, { error: text }), 303);
        }
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
          if (hit.status === 404) this.notFoundEvent(site.id, request, url);
          for (const [name, value] of Object.entries(hit.headers ?? {}))
            void reply.header(name, value);
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
          {
            plugin: pluginRoute.plugin.slug,
            name: `GET ${pluginRoute.route.path}`,
            siteId: site.id,
          },
          () =>
            pluginRoute.route.handler(
              routeRequest(request, site.id, url.pathname, pluginRoute.params, {
                plugin: pluginRoute.plugin.slug,
                locale: pluginRoute.locale,
              }),
            ),
        );
        if (!outcome.ok) {
          await reply.code(500).type('text/plain; charset=utf-8').send('Internal Server Error');
          return;
        }
        const result = outcome.value;
        const status = result.status ?? 200;
        if (
          cacheable &&
          status === 200 &&
          result.cacheTags &&
          !result.cookies?.length &&
          (typeof result.body === 'string' || result.page)
        ) {
          // A page in the theme (a shop's catalog) is cached like the theme's own pages.
          const rendered = result.page
            ? await this.renderPluginPage(
                site.id,
                `${request.protocol}://${request.host}`,
                url.pathname,
                null,
                result.page,
                status,
                true,
              )
            : null;
          const body = rendered ? (rendered.html ?? '') : (result.body as string);
          const contentType = rendered
            ? (rendered.contentType ?? HTML)
            : (result.contentType ?? 'text/plain; charset=utf-8');
          const tags = ['site', ...result.cacheTags, ...(rendered?.tags ?? [])];
          const headers = {
            ...rendered?.headers,
            ...result.headers,
            ...(await this.cacheHeaders(site.id, request.hostname, url.pathname, status, tags)),
          };
          const stored = this.cache.set(key, site.id, {
            status,
            html: body,
            contentType,
            tags,
            headers,
          });
          for (const [name, value] of Object.entries(headers)) void reply.header(name, value);
          await this.sendPage(
            request,
            reply,
            status,
            body,
            stored.etag,
            'MISS',
            contentType,
            stored,
          );
        } else {
          void reply.header('x-cache', 'BYPASS').header('cache-control', 'private, no-cache');
          await this.sendPluginResult(
            request,
            reply,
            site.id,
            pluginRoute.plugin.slug,
            url.pathname,
            result,
          );
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
      if (response.status === 404) this.notFoundEvent(site.id, request, url);
      const store = cacheable && (response.status === 200 || response.status === 404);
      const headers = {
        ...response.headers,
        ...(store
          ? await this.cacheHeaders(
              site.id,
              request.hostname,
              url.pathname,
              response.status,
              response.tags,
            )
          : {}),
      };
      for (const [name, value] of Object.entries(headers)) void reply.header(name, value);
      if (store) {
        const stored = this.cache.set(key, site.id, {
          status: response.status,
          html,
          contentType,
          tags: response.tags,
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
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
        // Signed-in visitors (never cached) get the toolbar leading to the admin,
        // except inside a visual editor's frame.
        const frame = /^\/__preview\/[^?]+\?(?:.*&)?frame=1(?:&|$)/.test(request.url);
        const toolbar = Boolean(
          request.auth &&
          !request.auth.apiToken &&
          contentType === HTML &&
          response.siteTitle &&
          !frame,
        );
        // Plugins may name the edit link, e.g. "Edit with" a page builder.
        const edit =
          toolbar && request.auth && response.entry
            ? await this.plugins.applyFilter(
                'render.adminBarEdit',
                adminBarEditLink(request.auth, response.entry),
                { siteId: site.id, locale: request.auth.locale, entry: response.entry },
                site.id,
              )
            : undefined;
        const page =
          toolbar && request.auth && response.siteTitle
            ? withAdminBar(html, {
                auth: request.auth,
                siteName: response.siteTitle,
                ...(response.entry ? { entry: response.entry } : {}),
                ...(edit !== undefined ? { edit } : {}),
                ...(response.account
                  ? { accountUrl: response.account.url, logoutUrl: response.account.logout }
                  : {}),
              })
            : html;
        await this.sendPage(request, reply, response.status, page, null, 'BYPASS', contentType);
      }
    } catch (error) {
      this.logger.error(error);
      await reply.code(500).type('text/plain; charset=utf-8').send('Internal Server Error');
    }
  }

  /** Tells plugins about a "not found" page (a 404 log), after the response, never failing it. */
  private notFoundEvent(siteId: string, request: FastifyRequest, url: URL): void {
    if (request.method !== 'GET') return;
    const header = (name: string, max: number) => {
      const value = request.headers[name];
      return typeof value === 'string' && value ? value.slice(0, max) : null;
    };
    setImmediate(() => {
      void this.plugins
        .emit(
          'request.notFound',
          {
            path: url.pathname.slice(0, 1000),
            query: url.search.slice(1, 501),
            referrer: header('referer', 500),
            userAgent: header('user-agent', 300),
          },
          siteId,
        )
        .catch(() => {});
    });
  }

  /**
   * Headers that plugins add to a public response the page cache keeps
   * (`cache.headers`): computed once, stored with the page, sent on every hit.
   */
  private async cacheHeaders(
    siteId: string,
    host: string,
    path: string,
    status: number,
    tags: string[],
  ): Promise<Record<string, string>> {
    const headers = await this.plugins.applyFilter(
      'cache.headers',
      {},
      { siteId, host, path, status, tags: [...new Set(tags)] },
      siteId,
    );
    const out: Record<string, string> = {};
    if (!headers || typeof headers !== 'object') return out;
    for (const [name, value] of Object.entries(headers)) {
      if (!/^[A-Za-z0-9-]{1,64}$/.test(name) || typeof value !== 'string') continue;
      if (/^(set-cookie|content-(type|length|encoding)|etag|x-cache)$/i.test(name)) continue;
      if (/[\r\n]/.test(value) || value.length > 8000) continue;
      out[name.toLowerCase()] = value;
    }
    return out;
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
      // Browsers revalidate every time; unchanged pages answer 304. A plugin
      // may have set its own (`cache.headers`), e.g. with s-maxage for a proxy.
      void reply.header('etag', etag);
      if (!reply.hasHeader('cache-control')) {
        void reply.header('cache-control', 'public, max-age=0, must-revalidate');
      }
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
    viewer: {
      capabilities: readonly string[];
      userId?: string;
      displayName?: string;
      avatarUrl?: string | null;
    } | null = null,
    /**
     * Previews (never cached): theme settings instead of the saved ones, or
     * another installed theme instead of the active one (Live Preview).
     */
    customize?: { themeSettings?: Record<string, unknown>; theme?: string },
  ): Promise<PublicResponse> {
    const includePrivate = viewer?.capabilities.includes('read_private_entries') ?? false;
    let path: string;
    try {
      path = decodeURIComponent(rawPath);
    } catch {
      return { status: 400, html: 'Bad Request', tags: [] };
    }
    // One canonical form: no trailing slash (except the root).
    const slashed = path.length > 1 && path.endsWith('/');
    const canonical = slashed ? path.replace(/\/+$/, '') || '/' : path;

    return withContext(this.database.db, { siteId }, async (tx) => {
      // Old addresses may have a query, as WordPress's /?p=123: that exact one first.
      // With a trailing slash, the redirect of either form is taken at once (one hop).
      const search = query.toString();
      const forms = slashed ? [path, canonical] : [path];
      const candidates = forms.flatMap((p) => (search ? [`${p}?${search}`, p] : [p]));
      const found = await tx
        .select()
        .from(redirects)
        .where(inArray(redirects.fromPath, candidates));
      const redirect = found.sort(
        (a, b) => candidates.indexOf(a.fromPath) - candidates.indexOf(b.fromPath),
      )[0];
      if (redirect) {
        await tx
          .update(redirects)
          .set({ hits: sql`${redirects.hits} + 1` })
          .where(eq(redirects.id, redirect.id));
        if (redirect.status !== 410) {
          return { status: redirect.status, redirect: redirect.toPath, tags: [] };
        }
      }
      if (slashed) {
        return {
          status: 301,
          redirect: `${encodeURI(canonical)}${search ? `?${search}` : ''}`,
          tags: [],
        };
      }

      const { scope, rest } = await this.scope(tx, siteId, origin, path, includePrivate);
      if (viewer?.userId) {
        scope.viewer = {
          id: viewer.userId,
          displayName: viewer.displayName ?? '',
          avatarUrl: viewer.avatarUrl ?? null,
          capabilities: viewer.capabilities,
        };
      }
      scope.params = Object.fromEntries(
        [...query].slice(0, 20).map(([k, v]) => [k.slice(0, 64), v.slice(0, 200)]),
      );
      if (customize?.theme) {
        scope.theme = await this.plugins.effectiveTheme(siteId, themeFor(customize.theme));
      }
      if (customize?.themeSettings) scope.themeSettings = customize.themeSettings;

      if (redirect?.status === 410) return this.notFound(scope, 410);
      if (path === '/robots.txt') return await this.robots(scope);
      // The addresses of WordPress and Yoast SEO, for sites moved from there.
      if (path === '/sitemap_index.xml' || path === '/wp-sitemap.xml') {
        return { status: 301, redirect: '/sitemap.xml', tags: [] };
      }
      if (path === '/sitemap.xsl') {
        return {
          status: 200,
          html: SITEMAP_XSL,
          contentType: 'text/xsl; charset=utf-8',
          tags: ['site'],
        };
      }
      if (path === '/sitemap.xml') {
        return this.sitemapResponse(scope, await sitemapIndex(await this.sitemapContext(scope)));
      }
      const sitemapMatch = SITEMAP_RE.exec(path);
      if (sitemapMatch) {
        const body = await sitemap(
          await this.sitemapContext(scope),
          sitemapMatch[1] ? 'taxonomy' : 'type',
          sitemapMatch[2]!,
          sitemapMatch[3]!,
          Number(sitemapMatch[4] ?? 1),
        );
        return body ? this.sitemapResponse(scope, body) : this.notFound(scope, 404);
      }
      const preview = /^\/__preview\/([0-9a-f-]{36})$/.exec(path);
      if (preview) {
        return (
          (await this.preview(
            scope,
            preview[1]!,
            query.get('token') ?? '',
            query.get('frame') === '1',
          )) ?? this.notFound(scope, 404)
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
    const [site] = await tx
      .select({ name: sites.name, theme: sites.themeSlug, defaultLocale: sites.defaultLocale })
      .from(sites)
      .where(eq(sites.id, siteId));
    const locales = await this.languages.locales(siteId, site?.defaultLocale ?? 'en');
    const data = await loadSiteData(tx, activePlugins, locales);
    // Languages with their own domain: addresses on other domains are absolute.
    if (locales.some((l) => l.host)) {
      const [primary] = await tx
        .select({ host: siteDomains.host })
        .from(siteDomains)
        .where(and(eq(siteDomains.siteId, siteId), eq(siteDomains.isPrimary, true)));
      const url = new URL(origin);
      data.urls.at({
        host: url.hostname,
        primaryHost: primary?.host ?? url.hostname,
        scheme: url.protocol.replace(':', ''),
      });
    }
    let settings = await this.settingsService.core(tx);
    const { locale, rest } = data.urls.splitLocale(path);
    // Title and tagline of the other languages (language plugin); the default needs nothing.
    if (locale !== data.locales[0]?.code) {
      const strings = await this.plugins.applyFilter(
        'site.strings',
        { title: settings.title || site?.name || '', tagline: settings.tagline },
        { siteId, locale },
        siteId,
      );
      settings = { ...settings, title: strings.title, tagline: strings.tagline };
    }
    return {
      rest,
      scope: {
        tx,
        siteId,
        data,
        settings,
        // With what the active plugins add to it (`ctx.themes.extend`).
        theme: await this.plugins.effectiveTheme(siteId, themeFor(site?.theme)),
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
    frame = false,
  ): Promise<PublicResponse | null> {
    if (!verifyPreviewToken(this.config.appSecret, entryId, token)) return null;
    if (frame) scope.editorFrame = true;
    const [row] = await scope.tx
      .select({
        entry: entries,
        title: revisions.title,
        document: revisions.document,
        fields: revisions.fields,
        excerpt: revisions.excerpt,
        featuredMediaId: revisions.featuredMediaId,
        authorName: users.displayName,
        authorSlug: users.slug,
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
        authorSlug: row.authorSlug,
      },
      { isFrontPage: false, preview: true },
    );
    return { ...response, headers: { 'x-robots-tag': 'noindex, nofollow' } };
  }

  private async robots(scope: RequestScope): Promise<PublicResponse> {
    const discourage = Boolean(scope.settings.discourageSearchEngines);
    const sitemap = `${scope.origin}/sitemap.xml`;
    const lines = discourage
      ? ['User-agent: *', 'Disallow: /']
      : [
          'User-agent: *',
          'Allow: /',
          `Disallow: ${ADMIN_PATH}`,
          'Disallow: /api/',
          'Disallow: /__preview/',
          'Disallow: /search',
          '',
          `Sitemap: ${sitemap}`,
        ];
    const base = `${lines.join('\n')}\n`;
    // A site kept out of search stays out, whatever plugins write.
    const text = discourage
      ? base
      : await this.plugins
          .applyFilter(
            'robots.txt',
            base,
            { siteId: scope.siteId, origin: scope.origin, sitemap, discourageSearchEngines: false },
            scope.siteId,
          )
          .then((value) =>
            typeof value === 'string' && value.trim() ? value.slice(0, 100_000) : base,
          )
          .catch(() => base);
    return {
      status: 200,
      html: text.endsWith('\n') ? text : `${text}\n`,
      contentType: 'text/plain; charset=utf-8',
      tags: ['site'],
    };
  }

  /** What the sitemaps need: the request's data and the plugins' filters (RF-THM-07). */
  private async sitemapContext(scope: RequestScope): Promise<SitemapContext> {
    const front = await this.frontPageIds(scope);
    const errorPage = scope.settings.errorPage;
    const hiddenLinks = errorPage
      ? await this.languages.translations(scope.siteId, 'entry', [errorPage])
      : new Map<string, { id: string }[]>();
    return {
      tx: scope.tx,
      siteId: scope.siteId,
      origin: scope.origin,
      data: scope.data,
      front,
      hidden: new Set(
        errorPage ? [errorPage, ...(hiddenLinks.get(errorPage) ?? []).map((l) => l.id)] : [],
      ),
      translations: (ids) => this.languages.translations(scope.siteId, 'entry', ids),
      filterSources: (sources) =>
        this.plugins.applyFilter(
          'sitemap.sources',
          sources,
          { siteId: scope.siteId },
          scope.siteId,
        ),
      filterUrls: (urls, context) =>
        this.plugins.applyFilter(
          'sitemap.urls',
          urls,
          { siteId: scope.siteId, ...context },
          scope.siteId,
        ),
    };
  }

  private sitemapResponse(scope: RequestScope, body: string): PublicResponse {
    return {
      status: 200,
      html: body,
      contentType: 'application/xml; charset=utf-8',
      // Like Yoast SEO: the sitemaps are followed, not shown in results.
      headers: { 'x-robots-tag': 'noindex, follow' },
      tags: ['site', ...scope.data.types.map((t) => `type:${t.slug}`)],
    };
  }

  /**
   * RSS 2.0 feed of the latest public posts in the current language, or of a
   * term's posts. Private entries never appear, even for signed-in users.
   */
  private async feed(
    scope: RequestScope,
    term: { taxonomy: string; slug: string } | null,
  ): Promise<PublicResponse | null> {
    const { tx, data, settings, locale } = scope;
    let where = and(eq(entries.typeSlug, 'article'), await this.listedIn(scope));
    let title = scope.siteTitle;
    let named: { taxonomy: string; slug: string; name: string } | null = null;
    let link = data.urls.home(locale);
    let self = data.urls.feed(locale);
    const tags = ['type:article'];
    if (term) {
      const [row] = await tx
        .select({ term: terms })
        .from(terms)
        .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
        .where(
          and(
            eq(taxonomies.slug, term.taxonomy),
            eq(terms.slug, term.slug),
            eq(terms.locale, locale),
          ),
        );
      if (!row) return null;
      const ids = tx
        .select({ id: entryTerms.entryId })
        .from(entryTerms)
        .where(eq(entryTerms.termId, row.term.id));
      where = and(where, inArray(entries.id, ids));
      title = `${row.term.name} – ${scope.siteTitle}`;
      named = { ...term, name: row.term.name };
      link = data.urls.term(term.taxonomy, term.slug, locale);
      self = `${link}/feed`;
      tags.push(`term:${row.term.id}`);
    }
    title = await this.plugins.applyFilter(
      'feed.title',
      title,
      { siteId: scope.siteId, locale, siteTitle: scope.siteTitle, term: named },
      scope.siteId,
    );
    const list = await loadPublished(tx, where, { limit: Math.max(settings.postsPerPage, 20) });
    const { summaries } = await summarize(tx, list, data.urls, locale);
    const absolute = (path: string) =>
      /^https?:\/\//.test(path) ? path : `${scope.origin}${path}`;
    const items = summaries
      .map((entry) =>
        [
          '<item>',
          `<title>${xml(entry.title)}</title>`,
          `<link>${xml(absolute(entry.url))}</link>`,
          `<guid isPermaLink="false">${xml(entry.id)}</guid>`,
          entry.publishedAt
            ? `<pubDate>${new Date(entry.publishedAt).toUTCString()}</pubDate>`
            : '',
          entry.author ? `<dc:creator>${xml(entry.author.displayName)}</dc:creator>` : '',
          `<description>${xml(entry.excerpt)}</description>`,
          '</item>',
        ].join(''),
      )
      .join('');
    const updated = summaries[0]?.publishedAt;
    return {
      status: 200,
      html:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        '<channel>' +
        `<title>${xml(title)}</title>` +
        `<link>${xml(absolute(link))}</link>` +
        `<atom:link href="${xml(absolute(self))}" rel="self" type="application/rss+xml"/>` +
        `<description>${xml(settings.tagline || scope.siteTitle)}</description>` +
        `<language>${xml(locale)}</language>` +
        (updated ? `<lastBuildDate>${new Date(updated).toUTCString()}</lastBuildDate>` : '') +
        items +
        '</channel></rss>',
      contentType: 'application/rss+xml; charset=utf-8',
      tags: ['site', ...tags],
    };
  }

  /** The latest approved comments on the site's published posts (RF-COM), as in WordPress. */
  private async commentsFeed(scope: RequestScope): Promise<PublicResponse | null> {
    const { tx, data, settings, locale } = scope;
    const listed = and(isVisible(false), await this.listedIn(scope));
    const rows = await tx
      .select({
        id: comments.id,
        authorName: comments.authorName,
        content: comments.content,
        createdAt: comments.createdAt,
        entry: entries,
      })
      .from(comments)
      .innerJoin(entries, eq(entries.id, comments.entryId))
      .where(and(eq(comments.status, 'approved'), listed))
      .orderBy(desc(comments.createdAt))
      .limit(Math.max(settings.postsPerPage, 20));
    const absolute = (path: string) =>
      /^https?:\/\//.test(path) ? path : `${scope.origin}${path}`;
    const t = locale.startsWith('it')
      ? { title: 'Commenti', on: (post: string, name: string) => `${name} su ${post}` }
      : { title: 'Comments', on: (post: string, name: string) => `Comment on ${post} by ${name}` };
    const items = rows
      .map((row) =>
        [
          '<item>',
          `<title>${xml(t.on(row.entry.title, row.authorName))}</title>`,
          `<link>${xml(absolute(`${data.urls.entry(row.entry)}#comment-${row.id}`))}</link>`,
          `<guid isPermaLink="false">${xml(row.id)}</guid>`,
          `<pubDate>${row.createdAt.toUTCString()}</pubDate>`,
          `<dc:creator>${xml(row.authorName)}</dc:creator>`,
          `<description>${xml(row.content.slice(0, 2000))}</description>`,
          '</item>',
        ].join(''),
      )
      .join('');
    const self = `${data.urls.home(locale).replace(/\/$/, '')}/comments/feed`;
    return {
      status: 200,
      html:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        '<channel>' +
        `<title>${xml(`${t.title} – ${scope.siteTitle}`)}</title>` +
        `<link>${xml(absolute(data.urls.home(locale)))}</link>` +
        `<atom:link href="${xml(absolute(self))}" rel="self" type="application/rss+xml"/>` +
        `<description>${xml(settings.tagline || scope.siteTitle)}</description>` +
        `<language>${xml(locale)}</language>` +
        (rows[0] ? `<lastBuildDate>${rows[0].createdAt.toUTCString()}</lastBuildDate>` : '') +
        items +
        '</channel></rss>',
      contentType: 'application/rss+xml; charset=utf-8',
      tags: ['site', 'comments'],
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
        const front = await this.settingPage(scope, settings.frontPage);
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

    // Visitors' accounts (RF-USR-11).
    const account = /^\/account(?:\/(login|register|lost-password|reset-password))?$/.exec(rest);
    if (account) return this.renderAccount(scope, account[1] ?? '', query);

    // RSS feeds (RF-THM-08): latest posts, latest comments, and per category or tag.
    if (rest === '/feed') return this.feed(scope, null);
    if (rest === '/comments/feed') return this.commentsFeed(scope);

    if (rest === '/search') {
      return this.renderSearch(
        scope,
        (query.get('q') ?? '').trim().slice(0, 200),
        Number(query.get('page') ?? 1),
        // One content type only, e.g. products from a shop's search box.
        /^[a-z][a-z0-9_-]{0,63}$/.test(query.get('type') ?? '') ? query.get('type')! : null,
      );
    }

    // Author archives: /author/{slug}[/page/N]
    const author = /^\/author\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/page\/(\d+))?$/.exec(rest);
    if (author) return this.renderAuthorArchive(scope, author[1]!, Number(author[2] ?? 1));

    // Category and tag archives and feeds: /{base}/{parents…}/{slug}[/page/N | /feed].
    // The base is the taxonomy's slug unless it has another.
    const base = /^\/([a-z][a-z0-9_-]*)(\/.+)$/.exec(rest);
    const byBase = base ? data.taxonomyByBase.get(base[1]!) : undefined;
    if (byBase?.length) {
      const archive = await this.termRoute(scope, byBase, base![2]!);
      if (archive) return archive;
    }

    // Later pages of the page that lists the posts: /{postsPage}/page/N.
    const paged = /^(.+)\/page\/(\d+)$/.exec(rest);
    if (paged && settings.postsPage) {
      const posts = await this.settingPage(scope, settings.postsPage);
      const base = posts ? data.urls.entry(posts.row) : null;
      if (posts && base === scope.path.replace(/\/page\/\d+$/, '')) {
        const page = Number(paged[2]);
        if (page < 2) return null;
        return this.renderArchive(scope, {
          where: eq(entries.typeSlug, 'article'),
          title: posts.row.title,
          base,
          page,
          isHome: false,
          tag: 'type:article',
        });
      }
    }

    // Entries by permalink: of the types whose permalink matches, the entry that exists.
    let entry: PublishedEntry | undefined;
    for (const match of matchPermalinks(rest, data.types)) {
      const [found] = await this.published(
        scope,
        and(
          eq(entries.typeSlug, match.type),
          eq(entries.locale, locale),
          eq(entries.slug, match.slug),
        ),
        { limit: 1 },
      );
      // The full URL must match (parents, year): one canonical address per entry.
      if (found && data.urls.entry(found.row) === scope.path) {
        entry = found;
        break;
      }
    }
    if (!entry) return this.rootTermArchive(scope, rest);

    // The front page lives at the home address only (no duplicate at its slug).
    if (
      settings.frontPage &&
      entry.row.id === (await this.settingPage(scope, settings.frontPage))?.row.id
    ) {
      return { status: 301, redirect: data.urls.home(locale), tags: [] };
    }

    // The page that lists the posts, when a static front page is used.
    if (
      settings.postsPage &&
      entry.row.id === (await this.settingPage(scope, settings.postsPage))?.row.id
    ) {
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

  /**
   * Archives of taxonomies without a base (/news, /news/page/2, /news/feed, as
   * WordPress sites with the category base stripped): after the entries.
   */
  private async rootTermArchive(scope: RequestScope, rest: string): Promise<PublicResponse | null> {
    const taxonomies = scope.data.taxonomyByBase.get('') ?? [];
    if (taxonomies.length === 0) return null;
    return this.termRoute(scope, taxonomies, rest);
  }

  /**
   * A term's archive or feed from the address after the taxonomy's base:
   * /{parents…}/{slug}[/page/N | /feed]. Terms with parents live under them
   * (WordPress's /category/parent/child); other paths ending with the slug,
   * such as the old /category/child, redirect there.
   */
  private async termRoute(
    scope: RequestScope,
    taxonomies: string[],
    path: string,
  ): Promise<PublicResponse | null> {
    const match = /^((?:\/[a-z0-9]+(?:-[a-z0-9]+)*){1,10}?)(?:\/page\/(\d+)|\/(feed))?$/.exec(path);
    if (!match) return null;
    const slug = match[1]!.slice(match[1]!.lastIndexOf('/') + 1);
    const page = Number(match[2] ?? 1);
    const suffix = match[3] ? '/feed' : page > 1 ? `/page/${page}` : '';
    for (const taxonomy of taxonomies) {
      const found = match[3]
        ? await this.feed(scope, { taxonomy, slug })
        : await this.renderTermArchive(scope, taxonomy, slug, page);
      if (!found) continue;
      const canonical = scope.data.urls.term(taxonomy, slug, scope.locale);
      if (`${canonical}${suffix}` !== scope.path && found.status === 200) {
        const target = `${canonical}${suffix}`;
        // Redirects saved when terms lived elsewhere (0.31: /parent/child → /child)
        // would loop with this one, or chain to it: they go.
        await scope.tx.delete(redirects).where(eq(redirects.fromPath, target));
        await scope.tx
          .update(redirects)
          .set({ toPath: target })
          .where(eq(redirects.toPath, scope.path));
        return { status: 301, redirect: target, tags: [] };
      }
      return found;
    }
    return null;
  }

  /**
   * The page chosen in a setting (front, posts or error page), in the
   * language of the request: the page itself in its own language, or its
   * translation known to the language plugin.
   */
  private async settingPage(scope: RequestScope, pageId: string): Promise<PublishedEntry | null> {
    const [page] = await this.published(
      scope,
      and(eq(entries.id, pageId), eq(entries.locale, scope.locale)),
      { limit: 1 },
    );
    if (page || scope.data.locales.length < 2) return page ?? null;
    const link = (await this.languages.translations(scope.siteId, 'entry', [pageId]))
      .get(pageId)
      ?.find((l) => l.locale === scope.locale);
    if (!link) return null;
    const [translation] = await this.published(scope, eq(entries.id, link.id), { limit: 1 });
    return translation ?? null;
  }

  /**
   * Entries listed in the request's language: its own, plus the default
   * language's ones not translated into it when the language plugin says so
   * (like WPML's "display as translated"). They keep their own address.
   */
  private async listedIn(scope: RequestScope) {
    // Only types with public addresses (not private ones, not those of inactive plugins).
    const types = scope.data.types.map((t) => t.slug);
    const visible = types.length ? inArray(entries.typeSlug, types) : sql`false`;
    return and(visible, await this.languageFilter(scope))!;
  }

  private async languageFilter(scope: RequestScope) {
    const own = eq(entries.locale, scope.locale);
    const defaultLocale = scope.data.locales[0]?.code;
    if (!defaultLocale || scope.locale === defaultLocale) return own;
    const translated = await this.languages.fallback(scope.siteId, scope.locale);
    if (!translated) return own;
    return or(
      own,
      and(
        eq(entries.locale, defaultLocale),
        translated.length > 0 ? notInArray(entries.id, translated) : undefined,
      ),
    )!;
  }

  /** The front page and its translations: their address is the home of their language. */
  private async frontPageIds(scope: RequestScope): Promise<Set<string>> {
    const id = scope.settings.frontPage;
    if (!id) return new Set();
    const links = await this.languages.translations(scope.siteId, 'entry', [id]);
    return new Set([id, ...(links.get(id) ?? []).map((l) => l.id)]);
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

    // Other languages, from the language plugin (none without it).
    const links = (await this.languages.translations(scope.siteId, 'entry', [entry.row.id])).get(
      entry.row.id,
    );
    const translationRows = links?.length
      ? await this.published(
          scope,
          inArray(
            entries.id,
            links.map((l) => l.id),
          ),
        )
      : [];
    const enabled = new Set(data.locales.map((l) => l.code));
    const translations = translationRows
      .filter((t) => t.row.id !== entry.row.id && enabled.has(t.row.locale))
      .map((t) => ({
        locale: t.row.locale,
        url: options.isFrontPage ? data.urls.home(t.row.locale) : data.urls.entry(t.row),
        title: t.row.title,
      }));

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
      author: await this.fullAuthor(scope, entry),
      image: image?.id ? (media.get(image.id) ?? null) : null,
      fields: entry.fields,
      document: entry.document,
      terms: entryTermsMap,
      translations,
    };
    // Comments and likes of types that have them (not in previews).
    if (
      !options.preview &&
      data.types.find((t) => t.slug === entry.row.typeSlug)?.supports?.includes('comments')
    ) {
      await this.addCommunity(scope, entry.row, publicEntry);
    }
    // Related entries, for themes that show them (same categories, then same tags).
    const relatedWanted = Math.min(
      Math.max(Math.trunc(Number(scope.theme.relatedEntries) || 0), 0),
      12,
    );
    if (relatedWanted > 0 && !options.isFrontPage) {
      publicEntry.related = await this.relatedEntries(scope, publicEntry, relatedWanted);
    }
    if (scope.theme.adjacentEntries && !options.isFrontPage && !options.preview) {
      publicEntry.adjacent = await this.adjacentEntries(scope, entry);
    }
    if (scope.activePlugins.size > 0) {
      const blocks = await this.plugins.applyFilter(
        'render.blocks',
        publicEntry.document.blocks,
        { ...this.hookContext(scope, 'entry', publicEntry), entry: publicEntry },
        scope.siteId,
      );
      publicEntry.document = { ...publicEntry.document, blocks };
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
    const response = await this.render(
      scope,
      props,
      templateCandidates(props),
      head,
      media,
      alternates,
      options.status ?? 200,
    );
    const editor = publicEntry.document.editor?.id;
    return {
      ...response,
      entry: { id: entry.row.id, type: entry.row.typeSlug, ...(editor ? { editor } : {}) },
    };
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
      author?: NonNullable<Extract<TemplateProps, { kind: 'archive' }>['author']>;
    },
  ): Promise<PublicResponse | null> {
    const { tx, data, settings } = scope;
    scope.tags.add(options.tag);
    const perPage = settings.postsPerPage;
    const where = and(options.where, await this.listedIn(scope));
    const total = await this.count(scope, where);
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    if (options.page > totalPages || options.page < 1) return null;
    const list = await this.published(scope, where, {
      limit: perPage,
      offset: (options.page - 1) * perPage,
    });
    const { summaries, media } = await summarize(tx, list, data.urls, scope.locale);
    if (scope.theme.listTerms) await addSummaryTerms(tx, summaries, data.urls);
    for (const entry of list) scope.tags.add(`entry:${entry.row.id}`);

    const pagePath = data.urls.page(options.base, options.page);
    const props: TemplateProps = {
      kind: 'archive',
      title: options.title,
      ...(options.author
        ? {
            author: options.author,
            ...(options.author.bio ? { description: options.author.bio } : {}),
          }
        : options.term
          ? {
              term: {
                taxonomy: options.term.taxonomy,
                slug: options.term.slug,
                name: options.term.name,
                description: options.term.description,
              },
            }
          : options.tag.startsWith('type:')
            ? { contentType: options.tag.slice('type:'.length) }
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
      description: options.term?.description ?? options.author?.bio ?? scope.settings.tagline,
      path: pagePath,
      alternates: options.isHome
        ? data.locales.map((l) => ({ locale: l.code, url: data.urls.home(l.code) }))
        : (options.alternates ?? []),
      type: 'website',
      image: null,
      noindex: false,
      ...(options.term
        ? {
            feed: {
              title: `${options.term.name} – ${scope.siteTitle}`,
              href: `${options.base}/feed`,
            },
          }
        : {}),
    });
    const candidates = templateCandidates(props, {
      type: 'article',
      ...(options.term ? { taxonomy: options.term.taxonomy, termSlug: options.term.slug } : {}),
    });
    return this.render(scope, props, candidates, head, media, options.alternates ?? [], 200);
  }

  /** The posts of a person (RF-THM-11): only people with published entries have one. */
  private async renderAuthorArchive(
    scope: RequestScope,
    slug: string,
    page: number,
  ): Promise<PublicResponse | null> {
    const [person] = await scope.tx
      .select({
        id: users.id,
        displayName: users.displayName,
        slug: users.slug,
        bio: users.bio,
        website: users.website,
        email: users.email,
        avatarKey: users.avatarKey,
      })
      .from(users)
      .where(eq(users.slug, slug));
    if (!person?.slug) return null;
    // Their posts, as in WordPress (pages and other types are not listed).
    const where = and(eq(entries.authorId, person.id), eq(entries.typeSlug, 'article'));
    if ((await this.count(scope, and(where, await this.listedIn(scope)))) === 0) return null;
    const base = scope.data.urls.author(scope.locale, person.slug);
    return this.renderArchive(scope, {
      where,
      title: person.displayName,
      base,
      page,
      isHome: false,
      tag: `author:${person.id}`,
      alternates: scope.data.locales.map((l) => ({
        locale: l.code,
        url: scope.data.urls.author(l.code, person.slug!),
      })),
      author: {
        displayName: person.displayName,
        slug: person.slug,
        url: base,
        ...(person.bio ? { bio: person.bio } : {}),
        website: person.website,
        avatarUrl: avatarUrl(person.avatarKey) ?? this.avatar(scope, person.email),
      },
    });
  }

  /** A Gravatar picture when the site uses them, else null (initials). */
  private avatar(scope: RequestScope, email: string | null | undefined, size = 88): string | null {
    if (scope.settings.avatars !== 'gravatar' || !email) return null;
    const hash = createHash('md5').update(email.trim().toLowerCase()).digest('hex');
    return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=mp`;
  }

  /** The author of an entry's page, with the bio and picture for an author box. */
  private async fullAuthor(
    scope: RequestScope,
    entry: PublishedEntry,
  ): Promise<PublicEntry['author']> {
    const author = entryAuthor(entry, scope.data.urls, scope.locale);
    if (!author || !entry.row.authorId) return author;
    scope.tags.add(`author:${entry.row.authorId}`);
    const [person] = await scope.tx
      .select({
        bio: users.bio,
        website: users.website,
        email: users.email,
        avatarKey: users.avatarKey,
      })
      .from(users)
      .where(eq(users.id, entry.row.authorId));
    if (!person) return author;
    return {
      ...author,
      ...(person.bio ? { bio: person.bio } : {}),
      website: person.website,
      avatarUrl: avatarUrl(person.avatarKey) ?? this.avatar(scope, person.email),
    };
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
    // Translations of the term, from the language plugin (none without it).
    const links =
      (await this.languages.translations(scope.siteId, 'term', [row.term.id])).get(row.term.id) ??
      [];
    const translations = [
      { locale: row.term.locale, slug: row.term.slug },
      ...(links.length > 0
        ? await scope.tx
            .select({ locale: terms.locale, slug: terms.slug })
            .from(terms)
            .where(
              and(
                eq(terms.taxonomyId, row.term.taxonomyId),
                inArray(
                  terms.id,
                  links.map((l) => l.id),
                ),
              ),
            )
        : []),
    ];
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
    type: string | null = null,
  ): Promise<PublicResponse> {
    const { tx, data, settings } = scope;
    scope.tags.add('search');
    const perPage = settings.postsPerPage;
    const current = Number.isInteger(page) && page > 0 ? page : 1;
    let list: PublishedEntry[] = [];
    let total = 0;
    if (q) {
      const match = sql`${entries.search} @@ plainto_tsquery('simple', unaccent(${q}))`;
      const where = and(
        await this.listedIn(scope),
        match,
        type ? eq(entries.typeSlug, type) : undefined,
      );
      total = await this.count(scope, where);
      list = await this.published(scope, where, {
        limit: perPage,
        offset: (current - 1) * perPage,
      });
    }
    const { summaries, media } = await summarize(tx, list, data.urls, scope.locale);
    if (scope.theme.listTerms) await addSummaryTerms(tx, summaries, data.urls);
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
    const base = `${data.urls.search(scope.locale)}?q=${encodeURIComponent(q)}${type ? `&type=${type}` : ''}`;
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
      const page = await this.settingPage(scope, scope.settings.errorPage);
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
    const locations: Partial<Record<ThemeLocation, CxdDocument>> = {};
    if (scope.activePlugins.size > 0) {
      const hookContext = this.hookContext(
        scope,
        props.kind,
        props.kind === 'entry' ? props.entry : undefined,
        props,
      );
      candidates = await this.plugins.applyFilter(
        'theme.templateCandidates',
        candidates,
        hookContext,
        scope.siteId,
      );
      head = await this.plugins.applyFilter('render.head', head, hookContext, scope.siteId);
      // Theme builders: documents for the theme's locations (valid CXD only).
      const given = await this.plugins.applyFilter(
        'render.locations',
        {},
        hookContext,
        scope.siteId,
      );
      const names = new Set<ThemeLocation>(['header', 'footer', 'single', 'archive', 'overlay']);
      // Hook points the theme marks in its layout (plugin API 1.33).
      for (const name of Object.keys(given ?? {})) {
        if (HOOK_LOCATION.test(name)) names.add(name as ThemeLocation);
      }
      for (const name of names) {
        const parsed = cxdDocumentSchema.safeParse(given?.[name]);
        if (parsed.success) locations[name] = parsed.data;
      }
      // A plugin's listing renders as a page: its archive template goes where the entry goes.
      if (scope.pluginArchive) {
        if (locations.archive) locations.single = locations.archive;
        else delete locations.single;
        delete locations.archive;
      }
    }
    const menus = await loadMenus(
      scope.tx,
      locale,
      data.urls,
      scope.path,
      new Set(data.types.map((t) => t.slug)),
      theme.menuItemFields,
    );
    scope.tags.add(`menus:${locale}`);
    // Theme settings and block areas, with the media they use.
    const themeValues = scope.themeSettings ?? (await themeSettings(scope.tx, theme));
    const areas = await themeAreas(scope.tx, theme, locale);
    const locationDocs = Object.values(locations).filter((doc): doc is CxdDocument => !!doc);
    // Synced patterns used by the entry or the areas (RF-EDT-07).
    const patternIds = [
      ...new Set(
        [
          props.kind === 'entry' ? props.entry.document : null,
          ...Object.values(areas),
          ...locationDocs,
        ].flatMap((doc) => collectPatternIds(doc)),
      ),
    ];
    const patternDocs = new Map<string, CxdDocument>();
    if (patternIds.length > 0) {
      const rows = await scope.tx
        .select({ id: patterns.id, document: patterns.document })
        .from(patterns)
        .where(and(inArray(patterns.id, patternIds), eq(patterns.synced, true)));
      for (const row of rows) patternDocs.set(row.id, row.document as CxdDocument);
      scope.tags.add('patterns');
    }
    const extraMedia = [
      ...themeMediaIds(theme, themeValues, areas),
      ...locationDocs.flatMap((doc) => collectMediaIds(doc)),
      ...[...patternDocs.values()].flatMap((doc) => collectMediaIds(doc)),
    ].filter((id) => !media.has(id));
    if (extraMedia.length > 0) {
      for (const [id, item] of await loadMedia(scope.tx, extraMedia, locale)) media.set(id, item);
    }
    // Plugin blocks of the entry, the areas and the patterns.
    if (scope.activePlugins.size > 0) {
      scope.blockRenderers = await this.pluginBlockRenderers(
        scope,
        [
          ...(props.kind === 'entry' ? [props.entry.document] : []),
          ...Object.values(areas),
          ...locationDocs,
          ...patternDocs.values(),
        ],
        props,
        media,
        menus,
      );
    }
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
      urls: {
        home: data.urls.home(locale),
        search: data.urls.search(locale),
        login: data.urls.account(locale, 'login'),
        account: data.urls.account(locale),
        logout: data.urls.account(locale, 'logout'),
        ...(scope.settings.registration ? { register: data.urls.account(locale, 'register') } : {}),
      },
      viewer: scope.viewer ?? null,
      ...(props.kind === 'entry' ? { entry: props.entry } : {}),
      view: props,
      share: scope.settings.shareButtons,
      autoCommunity: theme.comments !== 'manual',
      media,
      ...(scope.blockRenderers ? { blockRenderers: scope.blockRenderers } : {}),
      themeSettings: themeValues,
      areas,
      patterns: patternDocs,
      ...(scope.editorFrame ? { editorFrame: true } : {}),
      ...(Object.keys(locations).length ? { locations } : {}),
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
    // The overlay location: at the end of <body>, whatever the theme.
    if (locations.overlay) {
      const overlay = renderToStaticMarkup(
        createElement(PageProvider, {
          value: context,
          children: createElement(Location, { name: 'overlay' }),
        }),
      );
      const at = html.lastIndexOf('</body>');
      html = at === -1 ? html + overlay : html.slice(0, at) + overlay + html.slice(at);
    }
    // Comments, likes and account forms: their default look and small script.
    if (html.includes('class="cx-')) {
      const headAt = html.indexOf('</head>');
      if (headAt !== -1)
        html = `${html.slice(0, headAt)}<style id="cx-community">${COMMUNITY_CSS}</style>${html.slice(headAt)}`;
      const bodyAt = html.lastIndexOf('</body>');
      if (bodyAt !== -1)
        html = `${html.slice(0, bodyAt)}<script data-cx-community>${COMMUNITY_JS}</script>${html.slice(bodyAt)}`;
    }
    if (scope.settings.backToTop) {
      html = withBackToTop(html, locale, {
        color: scope.settings.backToTopColor,
        position: scope.settings.backToTopPosition,
      });
    }
    if (scope.activePlugins.size > 0) {
      const hookContext = this.hookContext(
        scope,
        props.kind,
        props.kind === 'entry' ? props.entry : undefined,
        props,
      );
      html = await this.plugins.applyFilter('render.html', html, hookContext, scope.siteId);
      html = await this.withPluginAssets(scope, html, hookContext);
    }
    // Last in <head>: each block's own CSS overrides the plugins' stylesheets.
    // Base styles of tables and galleries, before the plugins' (themes may restyle them).
    html = withCoreBlockCss(html);
    if (scope.blockCss && scope.blockCss.length > 0) html = withBlockCss(html, scope.blockCss);
    return {
      status,
      html,
      tags: [...scope.tags],
      siteTitle: scope.siteTitle,
      account: {
        url: scope.data.urls.account(scope.locale),
        logout: scope.data.urls.account(scope.locale, 'logout'),
      },
    };
  }

  // ---- Plugins ----------------------------------------------------------------------

  private hookContext(
    scope: RequestScope,
    route: TemplateProps['kind'],
    entry?: PublicEntry,
    props?: TemplateProps,
  ): RenderHookContext {
    // Plugin pages that list entries are archives for the hooks (theme builders).
    const listing = scope.pluginArchive;
    if (listing) {
      return {
        siteId: scope.siteId,
        locale: scope.locale,
        route: 'archive',
        path: scope.path,
        archive: {
          ...(listing.term ? { taxonomy: listing.term.taxonomy, term: listing.term.slug } : {}),
          ...(listing.type ? { type: listing.type } : {}),
        },
        ...(scope.editorFrame ? { editorFrame: true } : {}),
        ...(scope.viewer ? { signedIn: true } : {}),
        tag: (tag: string) => {
          scope.tags.add(tag);
        },
      };
    }
    return {
      siteId: scope.siteId,
      locale: scope.locale,
      route: route as RenderHookContext['route'],
      path: scope.path,
      ...(entry ? { entry } : {}),
      ...(scope.editorFrame ? { editorFrame: true } : {}),
      ...(scope.viewer ? { signedIn: true } : {}),
      ...(props?.kind === 'entry' && props.isFrontPage ? { isFrontPage: true } : {}),
      ...(props?.kind === 'archive'
        ? {
            archive: {
              ...(props.term ? { taxonomy: props.term.taxonomy, term: props.term.slug } : {}),
              ...(props.contentType ? { type: props.contentType } : {}),
              ...(props.isHome ? { home: true } : {}),
            },
          }
        : {}),
      tag: (tag: string) => {
        scope.tags.add(tag);
      },
    };
  }

  /**
   * Plugin blocks are loaded, and leaf blocks rendered one by one, before
   * the page: a failing block renders nothing instead of breaking the page.
   * Containers (and blocks without wrapper) render inside the page, with
   * their children.
   */
  private async pluginBlockRenderers(
    scope: RequestScope,
    documents: CxdDocument[],
    props: TemplateProps,
    media: Map<string, RenderMedia>,
    menus: Record<string, MenuItemView[]>,
  ): Promise<Map<string, BlockRenderer> | undefined> {
    const definitions = new Map(
      (await this.plugins.activePlugins(scope.siteId)).flatMap((plugin) =>
        plugin.blocks.map((block) => [block.type, { plugin: plugin.slug, block }] as const),
      ),
    );
    if (definitions.size === 0) return undefined;
    const found = new Map<string, CxdBlock>();
    const walk = (blocks: CxdBlock[]) => {
      for (const block of blocks) {
        if (definitions.has(block.type)) found.set(block.id, block);
        if (block.children) walk(block.children);
      }
    };
    for (const document of documents) walk(document.blocks);
    if (found.size === 0) return undefined;

    const attrsOf = (instance: CxdBlock) => {
      const { block } = definitions.get(instance.type)!;
      return { ...fieldDefaults(block.attributes ?? []), ...instance.attrs };
    };
    // Media the blocks use, preloaded with the page's.
    const mediaIds = new Set<string>();
    for (const instance of found.values()) {
      const { plugin, block } = definitions.get(instance.type)!;
      if (!block.media) continue;
      try {
        for (const id of block.media(attrsOf(instance))) {
          if (typeof id === 'string' && !media.has(id)) mediaIds.add(id);
        }
      } catch (error) {
        this.logger.warn(`Block ${block.type} of ${plugin}: media() failed: ${String(error)}`);
      }
    }
    if (mediaIds.size > 0) {
      for (const [id, item] of await loadMedia(scope.tx, [...mediaIds], scope.locale)) {
        media.set(id, item);
      }
    }
    const entry =
      props.kind === 'entry' ? { id: props.entry.id, type: props.entry.type } : undefined;
    const page: BlockPage = {
      route: props.kind,
      site: {
        title: scope.siteTitle,
        tagline: scope.settings.tagline,
        home: scope.data.urls.home(scope.locale),
      },
      ...(props.kind === 'entry' ? { entry: props.entry } : {}),
      ...(scope.params ? { params: scope.params } : {}),
      ...(props.kind === 'archive'
        ? {
            archive: {
              title: props.title,
              ...(props.description ? { description: props.description } : {}),
              ...(props.term ? { term: props.term } : {}),
              ...(props.contentType ? { contentType: props.contentType } : {}),
              ...(props.author ? { author: props.author } : {}),
              entries: props.entries,
              pagination: props.pagination,
            },
          }
        : {}),
      ...(props.kind === 'search'
        ? { search: { query: props.query, entries: props.entries, pagination: props.pagination } }
        : {}),
    };
    if (scope.pluginArchive) {
      const { term, type, title, description, html } = scope.pluginArchive;
      page.route = 'archive';
      page.archive = {
        title,
        ...(description ? { description } : {}),
        ...(term
          ? {
              term: {
                taxonomy: term.taxonomy,
                slug: term.slug,
                name: term.name,
                description: term.description ?? null,
              },
            }
          : {}),
        ...(type ? { contentType: type } : {}),
        entries: [],
        pagination: { page: 1, totalPages: 1, prevUrl: null, nextUrl: null },
        html,
      };
    }
    const context = { siteId: scope.siteId, locale: scope.locale, media, menus, page };
    const inPage = (block: { container?: boolean; wrapper?: boolean }) =>
      block.container === true || block.wrapper === false;

    const markup = new Map<string, string>();
    const loaded = new Map<string, unknown>();
    const css: string[] = [];
    await Promise.all(
      [...found.values()].map(async (instance) => {
        const { plugin, block } = definitions.get(instance.type)!;
        const attrs = attrsOf(instance);
        const outcome = await this.plugins.runHook(
          { plugin, name: `block ${block.type}`, siteId: scope.siteId },
          async () => {
            const data = block.load
              ? await block.load(attrs, {
                  siteId: scope.siteId,
                  locale: scope.locale,
                  page,
                  ...(entry ? { entry } : {}),
                  tag: (tag) => {
                    scope.tags.add(tag);
                  },
                  query: (query) => this.queryEntries(scope, query),
                })
              : undefined;
            const style = block.css ? block.css({ attrs, block: instance, context }) : '';
            const html = inPage(block)
              ? null
              : renderToStaticMarkup(
                  createElement(
                    Fragment,
                    null,
                    block.render({ attrs, data, block: instance, context }),
                  ),
                );
            return { data, style, html };
          },
        );
        if (!outcome.ok) return;
        loaded.set(instance.id, outcome.value.data);
        if (outcome.value.style) css.push(outcome.value.style);
        if (outcome.value.html !== null) markup.set(instance.id, outcome.value.html);
      }),
    );
    if (css.length > 0) (scope.blockCss ??= []).push(...css);

    const renderer: BlockRenderer = ({ block: instance, children }) => {
      const { plugin, block } = definitions.get(instance.type)!;
      if (!inPage(block)) {
        const html = markup.get(instance.id);
        return html
          ? createElement('div', {
              className: `wp-block-${instance.type.replace('/', '-')}`,
              dangerouslySetInnerHTML: { __html: html },
            })
          : null;
      }
      if (!loaded.has(instance.id)) return null;
      try {
        const node = block.render({
          attrs: attrsOf(instance),
          data: loaded.get(instance.id),
          block: instance,
          context,
          ...(block.container
            ? {
                children,
                items: (instance.children ?? []).map((child) =>
                  createElement(Block, { key: child.id, block: child }),
                ),
              }
            : {}),
        });
        return block.wrapper === true
          ? createElement('div', { className: `wp-block-${instance.type.replace('/', '-')}` }, node)
          : node;
      } catch (error) {
        this.logger.warn(`Block ${block.type} of ${plugin} failed to render: ${String(error)}`);
        return null;
      }
    };
    return new Map([...definitions.keys()].map((type) => [type, renderer]));
  }

  /** Scripts and styles that active plugins add to the page (`ctx.assets.enqueue`). */
  private async withPluginAssets(
    scope: RequestScope,
    html: string,
    context: RenderHookContext,
  ): Promise<string> {
    const styles: string[] = [];
    const scripts: string[] = [];
    for (const plugin of await this.plugins.activePlugins(scope.siteId)) {
      for (const asset of plugin.assets) {
        if (asset.when) {
          const outcome = await this.plugins.runHook(
            { plugin: plugin.slug, name: `asset ${asset.file}`, siteId: scope.siteId },
            async () => Boolean(await asset.when!({ ...context, html })),
          );
          if (!outcome.ok || !outcome.value) continue;
        }
        // Slug, version and path parts are URL-encoded: nothing can break the attribute.
        const url = pluginAssetUrl(plugin.slug, plugin.version, asset.file);
        if (asset.file.endsWith('.css')) styles.push(`<link rel="stylesheet" href="${url}">`);
        else if (asset.file.endsWith('.mjs'))
          scripts.push(`<script type="module" src="${url}"></script>`);
        else scripts.push(`<script src="${url}" defer></script>`);
      }
    }
    if (styles.length > 0) {
      const at = html.indexOf('</head>');
      if (at !== -1) html = html.slice(0, at) + styles.join('') + html.slice(at);
    }
    if (scripts.length > 0) {
      const at = html.lastIndexOf('</body>');
      html =
        at === -1 ? html + scripts.join('') : html.slice(0, at) + scripts.join('') + html.slice(at);
    }
    return html;
  }

  /**
   * A public address of an active plugin (`ctx.routes.public`), also behind
   * a language prefix (`/it/cart` for `/cart`), with the address's language.
   */
  async matchPluginRoute(siteId: string, method: string, path: string) {
    if (this.plugins.list().length === 0) return null;
    const plugins = await this.plugins.activePlugins(siteId);
    const find = (candidate: string) => {
      for (const plugin of plugins) {
        for (const route of plugin.publicRoutes) {
          if (route.method !== method) continue;
          const params = route.compiled.match(candidate);
          if (params) return { plugin, route, params };
        }
      }
      return null;
    };
    const direct = find(path);
    const prefixed = /^\/([a-z]{2}(?:-[a-z]{2,4})?)(\/.*)$/i.exec(path);
    if (!direct && !prefixed) return null;
    const { defaultLocale, codes } = await this.localesOf(siteId);
    if (direct) return { ...direct, locale: defaultLocale };
    const locale = prefixed![1]!;
    if (locale === defaultLocale || !codes.includes(locale)) return null;
    const match = find(prefixed![2]!);
    return match ? { ...match, locale } : null;
  }

  /**
   * A plugin's page (cart, checkout…) in the active theme: not cached, unless
   * the route gave cache tags (`cached`, for visitors who are not signed in).
   */
  private async renderPluginPage(
    siteId: string,
    origin: string,
    path: string,
    viewer: FastifyRequest['auth'] | null,
    page: PluginPageContent,
    status: number,
    cached = false,
  ): Promise<PublicResponse> {
    return withContext(this.database.db, { siteId }, async (tx) => {
      const { scope } = await this.scope(tx, siteId, origin, path);
      if (page.archive) {
        scope.pluginArchive = {
          ...page.archive,
          title: page.title,
          description: page.description ?? '',
          html: page.html,
        };
      }
      if (viewer?.userId) {
        scope.viewer = {
          id: viewer.userId,
          displayName: viewer.displayName ?? '',
          avatarUrl: viewer.avatarUrl ?? null,
          capabilities: viewer.capabilities,
        };
      }
      const entry: PublicEntry = {
        id: `plugin-page:${path}`,
        type: 'page',
        locale: scope.locale,
        slug: path.split('/').filter(Boolean).at(-1) ?? 'page',
        title: page.title,
        url: path,
        publishedAt: null,
        excerpt: '',
        author: null,
        image: null,
        document: { schema: 1, blocks: [pluginPageBlock(page.html)] },
        terms: {},
        translations: [],
        fields: {},
        featuredImage: null,
      };
      const props: TemplateProps = { kind: 'entry', entry, isFrontPage: false };
      const head = this.head(scope, {
        title: `${page.title} – ${scope.siteTitle}`,
        description: page.description ?? '',
        path,
        alternates: [],
        type: 'website',
        image: null,
        noindex: !page.index,
      });
      if (page.head?.length) head.tags = [...(head.tags ?? []), ...page.head];
      const response = await this.render(
        scope,
        props,
        templateCandidates(props),
        head,
        new Map(),
        [],
        status,
      );
      return cached
        ? response
        : { ...response, headers: { ...response.headers, 'cache-control': 'private, no-store' } };
    });
  }

  /**
   * One plugin block rendered on its own, with the CSS of its instance: the
   * preview a visual editor shows for blocks it cannot draw itself (e.g. a
   * shop's product grid inside a Fresco page). `null` when the type is not a
   * block of an active plugin.
   */
  async renderBlock(
    siteId: string,
    origin: string,
    input: { block: CxdBlock; locale?: string; entryId?: string },
  ): Promise<{ html: string; css: string } | null> {
    const active = await this.plugins.activePlugins(siteId);
    if (!active.some((plugin) => plugin.blocks.some((b) => b.type === input.block.type))) {
      return null;
    }
    return withContext(this.database.db, { siteId }, async (tx) => {
      const { scope } = await this.scope(tx, siteId, origin, '/');
      if (input.locale && scope.data.locales.some((l) => l.code === input.locale)) {
        scope.locale = input.locale;
      }
      // The entry being edited, for blocks that show it (e.g. a product's summary).
      const [row] = input.entryId
        ? await tx
            .select({ id: entries.id, type: entries.typeSlug })
            .from(entries)
            .where(eq(entries.id, input.entryId))
        : [];
      const entry: PublicEntry = {
        id: row?.id ?? 'block-preview',
        type: row?.type ?? 'page',
        locale: scope.locale,
        slug: 'preview',
        title: '',
        url: '/',
        publishedAt: null,
        excerpt: '',
        author: null,
        image: null,
        document: { schema: 1, blocks: [] },
        terms: {},
        translations: [],
        fields: {},
        featuredImage: null,
      };
      const props: TemplateProps = { kind: 'entry', entry, isFrontPage: false };
      const document: CxdDocument = { schema: 1, blocks: [input.block] };
      const mediaIds = collectMediaIds(document);
      const media =
        mediaIds.length > 0
          ? await loadMedia(tx, mediaIds, scope.locale)
          : new Map<string, RenderMedia>();
      const menus = await loadMenus(
        tx,
        scope.locale,
        scope.data.urls,
        '/',
        new Set(scope.data.types.map((t) => t.slug)),
        scope.theme.menuItemFields,
      );
      const renderers = await this.pluginBlockRenderers(scope, [document], props, media, menus);
      const html = renderers
        ? renderToStaticMarkup(
            createElement(Blocks, {
              document,
              context: { media, locale: scope.locale, renderers },
            }),
          )
        : '';
      return { html, css: (scope.blockCss ?? []).join('\n') };
    });
  }

  /** Sends what a plugin's public route answered: cookies, then a page or its body. */
  private async sendPluginResult(
    request: FastifyRequest,
    reply: FastifyReply,
    siteId: string,
    plugin: string,
    path: string,
    result: RouteResponse,
  ): Promise<void> {
    setPluginCookies(request, reply, plugin, result.cookies);
    if (!result.page) return sendRouteResponse(reply, result);
    const response = await this.renderPluginPage(
      siteId,
      `${request.protocol}://${request.host}`,
      path,
      request.auth ?? null,
      result.page,
      result.status ?? 200,
    );
    for (const [name, value] of Object.entries({ ...response.headers, ...result.headers }))
      void reply.header(name, value);
    await reply
      .code(response.status)
      .type(response.contentType ?? 'text/html; charset=utf-8')
      .send(response.html ?? '');
  }

  /** POST to the public site: only plugin routes (e.g. form submissions) accept it. */
  async handlePost(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const site = request.site;
    const path = new URL(request.url, 'http://local').pathname;
    // Sign-in, sign-up, profile, comments and likes (RF-USR-11, RF-COM).
    if (
      site &&
      site.status !== 'maintenance' &&
      /\/(account\/[a-z0-9-]+|comments|likes)$/i.test(path)
    ) {
      const { defaultLocale, codes } = await this.localesOf(site.id);
      if (await this.community.handlePost(request, reply, site.id, defaultLocale, codes)) return;
    }
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
      { plugin: match.plugin.slug, name: `POST ${match.route.path}`, siteId: site.id },
      () =>
        match.route.handler(
          routeRequest(request, site.id, path, match.params, {
            plugin: match.plugin.slug,
            locale: match.locale,
          }),
        ),
    );
    void reply.header('cache-control', 'private, no-cache').header('x-cache', 'BYPASS');
    if (!outcome.ok) {
      await reply.code(500).type('text/plain; charset=utf-8').send('Internal Server Error');
      return;
    }
    await this.sendPluginResult(request, reply, site.id, match.plugin.slug, path, outcome.value);
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
      /** The feed of this page (term archives). */
      feed?: { title: string; href: string };
    },
  ): HeadData {
    const absolute = (path: string) =>
      /^https?:\/\//.test(path) ? path : `${scope.origin}${path}`;
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
    // Feed autodiscovery: the language's posts, and the term's on its archive.
    const feeds = [
      { title: scope.siteTitle, href: scope.data.urls.feed(scope.locale) },
      ...(input.feed ? [input.feed] : []),
    ];
    return {
      title: input.title,
      description,
      canonical: input.noindex ? null : absolute(input.path),
      alternates,
      og,
      ...(noindex ? { robots: 'noindex, follow' } : {}),
      tags: feeds.map((feed) => ({
        tag: 'link' as const,
        attrs: {
          rel: 'alternate',
          type: 'application/rss+xml',
          title: feed.title,
          href: absolute(feed.href),
        },
      })),
    };
  }

  private homeTitle(scope: RequestScope): string {
    return scope.settings.tagline
      ? `${scope.siteTitle} – ${scope.settings.tagline}`
      : scope.siteTitle;
  }

  /** Sign in, sign up, password and profile pages, inside the theme's layout. */
  private async renderAccount(
    scope: RequestScope,
    page: string,
    query: URLSearchParams,
  ): Promise<PublicResponse> {
    const { data, locale, settings } = scope;
    const base = data.urls.account(locale);
    const L = (en: string, it: string) => (locale.startsWith('it') ? it : en);
    const error = query.get('error')?.slice(0, 300);
    const notice = error
      ? { kind: 'error' as const, text: error }
      : query.get('notice')
        ? { kind: 'ok' as const, text: query.get('notice')!.slice(0, 300) }
        : undefined;
    const redirect = safePath(query.get('redirect') ?? '', base);
    let attrs: AccountAttrs;
    let title: string;
    if (page === '') {
      if (!scope.viewer)
        return {
          status: 303,
          redirect: withQuery(data.urls.account(locale, 'login'), { redirect: base }),
          tags: [],
        };
      const [profile] = await scope.tx.select().from(users).where(eq(users.id, scope.viewer.id));
      if (!profile) return { status: 303, redirect: data.urls.account(locale, 'login'), tags: [] };
      title = L('Your account', 'Il tuo account');
      // Pages of plugins (a shop's orders…), with well-formed local links only.
      const links = (
        await this.plugins.applyFilter(
          'account.links',
          [],
          { siteId: scope.siteId, locale, userId: scope.viewer.id, base },
          scope.siteId,
        )
      )
        .filter(
          (l) =>
            l &&
            typeof l.label === 'string' &&
            typeof l.url === 'string' &&
            l.url.startsWith('/') &&
            !l.url.startsWith('//'),
        )
        .slice(0, 20)
        .map((l) => ({ label: l.label.slice(0, 80), url: l.url.slice(0, 300) }));
      attrs = {
        view: query.get('verified') ? 'verified' : 'profile',
        locale,
        base,
        ...(links.length ? { links } : {}),
        ...(notice
          ? { notice }
          : query.get('welcome')
            ? {
                notice: {
                  kind: 'ok',
                  text: L('Welcome: your account is ready.', 'Benvenuto: il tuo account è pronto.'),
                },
              }
            : {}),
        profile: {
          displayName: profile.displayName,
          email: profile.email,
          bio: profile.bio,
          website: profile.website ?? '',
          authorUrl: profile.slug ? data.urls.author(locale, profile.slug) : null,
          canDelete: !scope.viewer.capabilities.includes('manage_users'),
        },
      };
      if (attrs.view === 'verified')
        attrs = {
          ...attrs,
          view: 'profile',
          notice: {
            kind: 'ok',
            text: L(
              'Your email address is confirmed: welcome!',
              'Il tuo indirizzo email è confermato: benvenuto!',
            ),
          },
        };
    } else if (page === 'login') {
      if (scope.viewer && query.get('step') !== '2fa') return { status: 303, redirect, tags: [] };
      const twofactor = query.get('step') === '2fa' && query.get('challenge');
      title = L('Sign in', 'Accedi');
      attrs = {
        view: twofactor ? 'twofactor' : 'login',
        locale,
        base,
        redirect,
        registration: settings.registration,
        ...(notice ? { notice } : {}),
        ...(query.get('email') ? { email: query.get('email')!.slice(0, 200) } : {}),
        ...(twofactor ? { challenge: query.get('challenge')!.slice(0, 200) } : {}),
      };
    } else if (page === 'register') {
      if (!settings.registration) return this.notFound(scope, 404);
      title = L('Create an account', 'Crea un account');
      const termsUrl = settings.termsPage ? await this.pageUrl(scope, settings.termsPage) : null;
      attrs = query.get('sent')
        ? { view: 'sent', locale, base }
        : {
            view: 'register',
            locale,
            base,
            termsUrl,
            ...(notice ? { notice } : {}),
            ...(query.get('email') ? { email: query.get('email')!.slice(0, 200) } : {}),
            ...(query.get('name') ? { name: query.get('name')!.slice(0, 80) } : {}),
          };
    } else if (page === 'lost-password') {
      title = L('Lost password', 'Password dimenticata');
      attrs = query.get('sent')
        ? { view: 'sent', locale, base }
        : { view: 'lost', locale, base, ...(notice ? { notice } : {}) };
    } else {
      title = L('Choose a new password', 'Scegli una nuova password');
      attrs = {
        view: 'reset',
        locale,
        base,
        token: (query.get('token') ?? '').slice(0, 200),
        ...(notice ? { notice } : {}),
      };
    }
    const path = page ? data.urls.account(locale, page) : base;
    const entry: PublicEntry = {
      id: `account-${page || 'profile'}`,
      type: 'page',
      locale,
      slug: 'account',
      title,
      url: path,
      publishedAt: null,
      excerpt: '',
      author: null,
      image: null,
      document: {
        schema: 1,
        blocks: [
          {
            id: 'account',
            type: 'cleitext/account',
            v: 1,
            attrs: attrs as unknown as Record<string, unknown>,
          },
        ],
      },
      terms: {},
      translations: [],
      fields: {},
      featuredImage: null,
    };
    const props: TemplateProps = { kind: 'entry', entry, isFrontPage: false };
    const head = this.head(scope, {
      title: `${title} – ${scope.siteTitle}`,
      description: '',
      path,
      alternates: [],
      type: 'website',
      image: null,
      noindex: true,
    });
    const response = await this.render(
      scope,
      props,
      templateCandidates(props),
      head,
      new Map(),
      [],
      200,
    );
    // Pages with a visitor's data are never cached.
    return { ...response, headers: { ...response.headers, 'cache-control': 'private, no-store' } };
  }

  /** Address of a page by id (terms, privacy), or null. */
  private async pageUrl(scope: RequestScope, id: string): Promise<string | null> {
    const [row] = await this.published(scope, eq(entries.id, id), { limit: 1 });
    return row ? scope.data.urls.entry(row.row) : null;
  }

  /** Comments, likes and their notices on an entry's page (RF-COM). */
  private async addCommunity(
    scope: RequestScope,
    row: {
      id: string;
      authorId: string | null;
      commentStatus: string;
      commentCount: number;
      likeCount: number;
    },
    publicEntry: PublicEntry,
  ): Promise<void> {
    const { settings, params = {} } = scope;
    const listed = await this.comments.forEntry(
      scope.tx,
      { id: row.id, authorId: row.authorId },
      settings,
      {
        page: Number(params['comments-page']) || 1,
        viewerId: scope.viewer?.id ?? null,
        ...(settings.avatars === 'gravatar'
          ? { gravatar: (email: string) => this.avatar(scope, email) }
          : {}),
      },
    );
    const { open } = await this.comments.openFor(scope.tx, row.id, settings);
    const notice: EntryComments['notice'] | undefined =
      params.comment === 'pending'
        ? { kind: 'pending' }
        : params.comment === 'posted'
          ? { kind: 'posted' }
          : params['comment-error']
            ? { kind: 'error', text: params['comment-error'].slice(0, 200) }
            : undefined;
    // `?replyto=<id>`: the form answers that comment (pages without JavaScript).
    const find = (list: PublicComment[], id: string): PublicComment | undefined => {
      for (const item of list) {
        if (item.id === id) return item;
        const found = find(item.replies, id);
        if (found) return found;
      }
      return undefined;
    };
    const answered = params.replyto ? find(listed.items, params.replyto) : undefined;
    publicEntry.comments = {
      ...(answered && !answered.pending
        ? { replyTo: { id: answered.id, authorName: answered.authorName } }
        : {}),
      open,
      count: row.commentCount,
      items: listed.items,
      page: listed.page,
      pages: listed.pages,
      registrationRequired: settings.commentRegistration,
      requireNameEmail: settings.commentRequireNameEmail,
      threadDepth: settings.commentThreadDepth,
      action: `${scope.data.urls.home(scope.locale).replace(/\/$/, '')}/comments`,
      ...(notice ? { notice } : {}),
    };
    if (settings.likes !== 'off') {
      publicEntry.likes = {
        count: row.likeCount,
        liked: false,
        action: `${scope.data.urls.home(scope.locale).replace(/\/$/, '')}/likes`,
        usersOnly: settings.likes === 'users',
      };
    }
  }

  /** The entries of the same type published just before and just after this one. */
  private async adjacentEntries(
    scope: RequestScope,
    entry: PublishedEntry,
  ): Promise<{ prev?: PublicEntrySummary; next?: PublicEntrySummary }> {
    const at = entry.row.publishedAt;
    if (!at) return {};
    const base = and(
      eq(entries.typeSlug, entry.row.typeSlug),
      ne(entries.id, entry.row.id),
      await this.languageFilter(scope),
    );
    const options = { limit: 1, includePrivate: scope.includePrivate };
    const [before, after] = await Promise.all([
      loadPublished(scope.tx, and(base, lt(entries.publishedAt, at)), {
        ...options,
        order: 'desc',
      }),
      loadPublished(scope.tx, and(base, gt(entries.publishedAt, at)), { ...options, order: 'asc' }),
    ]);
    const { summaries } = await summarize(
      scope.tx,
      [...before, ...after],
      scope.data.urls,
      scope.locale,
    );
    return {
      ...(before.length ? { prev: summaries[0]! } : {}),
      ...(after.length ? { next: summaries[before.length]! } : {}),
    };
  }

  /** Entries sharing the entry's terms: its categories first, then its tags and other taxonomies. */
  private async relatedEntries(
    scope: RequestScope,
    entry: PublicEntry,
    wanted: number,
  ): Promise<PublicEntrySummary[]> {
    const found: PublicEntry[] = [];
    const taxonomies = Object.keys(entry.terms).sort((a, b) =>
      a === 'category' ? -1 : b === 'category' ? 1 : a === 'tag' ? -1 : b === 'tag' ? 1 : 0,
    );
    for (const taxonomy of taxonomies) {
      if (found.length >= wanted) break;
      const slugs = (entry.terms[taxonomy] ?? []).map((t) => t.slug);
      if (!slugs.length) continue;
      const { entries } = await this.queryEntries(scope, {
        type: entry.type,
        terms: { taxonomy, slugs },
        exclude: [entry.id, ...found.map((e) => e.id)],
        limit: wanted - found.length,
      });
      found.push(...entries);
    }
    return found.map((e) => ({
      id: e.id,
      type: e.type,
      locale: e.locale,
      title: e.title,
      url: e.url,
      publishedAt: e.publishedAt,
      excerpt: e.excerpt,
      author: e.author,
      image: e.featuredImage ?? e.image,
    }));
  }

  /** Entries for plugin listings (BlockLoadContext.query), complete as on their own page. */
  private async queryEntries(
    scope: RequestScope,
    query: PublicQuery,
  ): Promise<{ entries: PublicEntry[]; total: number }> {
    const { tx, data } = scope;
    const listed = new Set(data.types.map((t) => t.slug));
    const asked = query.type === undefined ? [...listed] : [query.type].flat();
    const types = asked.filter((t) => listed.has(t));
    if (types.length === 0) return { entries: [], total: 0 };
    for (const type of types) scope.tags.add(`type:${type}`);
    const uuids = (list: unknown) =>
      Array.isArray(list)
        ? list
            .filter((id): id is string => typeof id === 'string' && UUID_RE.test(id))
            .slice(0, 200)
        : [];
    const ids = uuids(query.ids);
    const exclude = uuids(query.exclude);
    let termFilter: ReturnType<typeof and> | undefined;
    if (
      query.terms &&
      typeof query.terms.taxonomy === 'string' &&
      Array.isArray(query.terms.slugs)
    ) {
      const slugs = query.terms.slugs.filter((v) => typeof v === 'string').slice(0, 50);
      if (slugs.length === 0) return { entries: [], total: 0 };
      const tagged = tx
        .select({ id: entryTerms.entryId })
        .from(entryTerms)
        .innerJoin(terms, eq(terms.id, entryTerms.termId))
        .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
        .where(and(eq(taxonomies.slug, query.terms.taxonomy), inArray(terms.slug, slugs)));
      termFilter = inArray(entries.id, tagged);
    }
    const where = and(
      inArray(entries.typeSlug, types),
      await this.languageFilter(scope),
      ids.length ? inArray(entries.id, ids) : undefined,
      exclude.length ? notInArray(entries.id, exclude) : undefined,
      termFilter,
    );
    const limit = Math.min(Math.max(Math.trunc(Number(query.limit) || 10), 1), 100);
    const offset = Math.min(Math.max(Math.trunc(Number(query.offset) || 0), 0), 10_000);
    const [total, list] = await Promise.all([
      this.count(scope, where),
      loadPublished(tx, where, {
        limit,
        offset,
        includePrivate: scope.includePrivate,
        ...(query.orderBy ? { orderBy: query.orderBy } : {}),
        ...(query.order ? { order: query.order } : {}),
      }),
    ]);
    const media = await loadMedia(
      tx,
      list.flatMap((e) => {
        const first = e.featuredMediaId ? null : firstImage(e.document);
        return [e.featuredMediaId, first?.id].filter((id): id is string => Boolean(id));
      }),
      scope.locale,
    );
    const termRows = list.length
      ? await tx
          .select({ entryId: entryTerms.entryId, term: terms, taxonomy: taxonomies.slug })
          .from(entryTerms)
          .innerJoin(terms, eq(terms.id, entryTerms.termId))
          .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
          .where(
            inArray(
              entryTerms.entryId,
              list.map((e) => e.row.id),
            ),
          )
      : [];
    const entriesOut = list.map((entry): PublicEntry => {
      scope.tags.add(`entry:${entry.row.id}`);
      const entryTermsMap: PublicEntry['terms'] = {};
      for (const row of termRows) {
        if (row.entryId !== entry.row.id) continue;
        (entryTermsMap[row.taxonomy] ??= []).push({
          name: row.term.name,
          slug: row.term.slug,
          url: data.urls.term(row.taxonomy, row.term.slug, row.term.locale),
        });
      }
      const featured = entry.featuredMediaId ? (media.get(entry.featuredMediaId) ?? null) : null;
      const image = featured ? { id: featured.id } : firstImage(entry.document);
      return {
        id: entry.row.id,
        type: entry.row.typeSlug,
        locale: entry.row.locale,
        slug: entry.row.slug,
        title: entry.row.title,
        url: data.urls.entry(entry.row),
        publishedAt: entry.row.publishedAt?.toISOString() ?? null,
        excerpt: entry.excerpt || documentExcerpt(entry.document),
        featuredImage: featured,
        author: entryAuthor(entry, data.urls, scope.locale),
        image: image?.id ? (media.get(image.id) ?? null) : null,
        fields: entry.fields,
        document: entry.document,
        terms: entryTermsMap,
        translations: [],
      };
    });
    return { entries: entriesOut, total };
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** The CSS of the plugin blocks on a page, in one `<style>` at the end of `<head>`. */
export function withBlockCss(html: string, css: string[]): string {
  // The CSS cannot close the element.
  const style = `<style data-cx-blocks>${css.join('\n').replace(/<\/style/gi, '<\\/style')}</style>`;
  const at = html.indexOf('</head>');
  return at === -1 ? style + html : html.slice(0, at) + style + html.slice(at);
}
