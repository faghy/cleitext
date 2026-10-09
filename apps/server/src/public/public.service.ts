import {
  entries,
  entryTerms,
  redirects,
  sites,
  taxonomies,
  terms,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import {
  documentExcerpt,
  firstImage,
  renderHtmlDocument,
  type RenderMedia,
} from '@cleitext/renderer';
import type { CoreSettings } from '@cleitext/shared';
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
import { theme as aurora } from '@cleitext/theme-aurora';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createElement } from 'react';
import { SESSION_COOKIE } from '../auth/cookies.js';
import { DATABASE } from '../database/database.module.js';
import { PageCacheService } from './page-cache.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  documentMedia,
  isPublished,
  loadMenus,
  loadPublished,
  loadSiteData,
  summarize,
  type PublishedEntry,
  type SiteData,
} from './site-data.js';
import { matchPermalink } from './urls.js';

/** Installed themes. Loaded from packages; plugin-style installation comes with M4. */
const THEMES = new Map<string, ThemeDefinition>([[aurora.slug, aurora]]);
const DEFAULT_THEME = 'aurora';

export interface PublicResponse {
  status: number;
  html?: string;
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
}

/** Public site: routing, data loading and theme rendering (docs/ARCHITECTURE.md §12). */
@Injectable()
export class PublicService {
  private readonly logger = new Logger('Public');

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly settingsService: SettingsService,
    private readonly cache: PageCacheService,
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
      .header('x-frame-options', 'SAMEORIGIN');
    try {
      const url = new URL(request.url, 'http://local');
      // Signed-in users bypass the cache (they will see editing tools later).
      const cacheable = !request.cookies[SESSION_COOKIE] && !url.pathname.startsWith('/search');
      const key = this.cache.key(site.id, request.host, request.url);

      if (cacheable) {
        const hit = this.cache.get(key);
        if (hit) {
          await this.sendPage(request, reply, hit.status, hit.html, hit.etag, 'HIT');
          return;
        }
      }

      const response = await this.respond(
        site.id,
        `${request.protocol}://${request.host}`,
        url.pathname,
        url.searchParams,
      );
      if (response.redirect) {
        await reply.redirect(response.redirect, response.status);
        return;
      }
      const html = response.html ?? '';
      if (cacheable && (response.status === 200 || response.status === 404)) {
        const stored = this.cache.set(key, site.id, {
          status: response.status,
          html,
          tags: response.tags,
        });
        await this.sendPage(request, reply, response.status, html, stored.etag, 'MISS');
      } else {
        await this.sendPage(request, reply, response.status, html, null, 'BYPASS');
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
    await reply.code(status).type('text/html; charset=utf-8').send(html);
  }

  async respond(
    siteId: string,
    origin: string,
    rawPath: string,
    query: URLSearchParams,
  ): Promise<PublicResponse> {
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

      const data = await loadSiteData(tx);
      const settings = await this.settingsService.core(tx);
      const [site] = await tx
        .select({ name: sites.name, theme: sites.themeSlug })
        .from(sites)
        .where(eq(sites.id, siteId));
      const theme = THEMES.get(site?.theme ?? DEFAULT_THEME) ?? THEMES.get(DEFAULT_THEME)!;
      const { locale, rest } = data.urls.splitLocale(path);
      const scope: RequestScope = {
        tx,
        siteId,
        data,
        settings,
        theme,
        siteTitle: settings.title || site?.name || 'Cleitext',
        origin,
        locale,
        path,
        tags: new Set(['site']),
      };

      if (redirect?.status === 410) return this.notFound(scope, 410);
      return (await this.route(scope, rest, query)) ?? this.notFound(scope, 404);
    });
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
    const [entry] = await loadPublished(
      scope.tx,
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
    const [entry] = await loadPublished(
      scope.tx,
      and(eq(entries.translationGroup, group), eq(entries.locale, scope.locale)),
      { limit: 1 },
    );
    return entry ?? null;
  }

  // ---- Pages ------------------------------------------------------------------------

  private async renderEntry(
    scope: RequestScope,
    entry: PublishedEntry,
    options: { isFrontPage: boolean; status?: number },
  ): Promise<PublicResponse> {
    const { tx, data } = scope;
    scope.tags.add(`entry:${entry.row.id}`);
    const media = await documentMedia(tx, entry.document, scope.locale);

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

    const translationRows = await loadPublished(
      tx,
      eq(entries.translationGroup, entry.row.translationGroup),
    );
    const translations = translationRows
      .filter((t) => t.row.id !== entry.row.id)
      .map((t) => ({ locale: t.row.locale, url: data.urls.entry(t.row), title: t.row.title }));

    const image = firstImage(entry.document);
    const publicEntry: PublicEntry = {
      id: entry.row.id,
      type: entry.row.typeSlug,
      locale: entry.row.locale,
      slug: entry.row.slug,
      title: entry.row.title,
      url: options.isFrontPage ? data.urls.home(scope.locale) : data.urls.entry(entry.row),
      publishedAt: entry.row.publishedAt?.toISOString() ?? null,
      excerpt: documentExcerpt(entry.document),
      author: entry.authorName ? { displayName: entry.authorName } : null,
      image: image?.id ? (media.get(image.id) ?? null) : null,
      document: entry.document,
      terms: entryTermsMap,
      translations,
    };

    const alternates = [
      { locale: entry.row.locale, url: publicEntry.url },
      ...translations.map((t) => ({ locale: t.locale, url: t.url })),
    ];
    const head = this.head(scope, {
      title: options.isFrontPage
        ? this.homeTitle(scope)
        : `${entry.row.title} – ${scope.siteTitle}`,
      description: publicEntry.excerpt,
      path: publicEntry.url,
      alternates,
      type: entry.row.typeSlug === 'article' ? 'article' : 'website',
      image: publicEntry.image,
      noindex: options.status === 404,
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
    const total = await this.count(tx, where);
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    if (options.page > totalPages || options.page < 1) return null;
    const list = await loadPublished(tx, where, {
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
        : [],
      type: 'website',
      image: null,
      noindex: false,
    });
    const candidates = templateCandidates(props, {
      type: 'article',
      ...(options.term ? { taxonomy: options.term.taxonomy, termSlug: options.term.slug } : {}),
    });
    return this.render(scope, props, candidates, head, media, [], 200);
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
    return this.renderArchive(scope, {
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
      total = await this.count(tx, where);
      list = await loadPublished(tx, where, { limit: perPage, offset: (current - 1) * perPage });
    }
    const { summaries, media } = await summarize(tx, list, data.urls, scope.locale);
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
    const menus = await loadMenus(scope.tx, locale, data.urls, scope.path);
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
      },
      locale,
      locales,
      menus,
      urls: { home: data.urls.home(locale), search: data.urls.search(locale) },
      media,
    };
    const Template = resolveTemplate(theme, candidates);
    const html = renderHtmlDocument(
      createElement(PageProvider, {
        value: context,
        children: createElement(theme.Layout, {
          head,
          css: theme.css,
          children: createElement(Template, props),
        }),
      }),
    );
    return { status, html, tags: [...scope.tags] };
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
    if (input.description) og['og:description'] = input.description;
    if (input.image) og['og:image'] = absolute(input.image.url);
    const noindex = input.noindex || scope.settings.discourageSearchEngines;
    return {
      title: input.title,
      description: input.description,
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

  private async count(tx: SiteTransaction, where: ReturnType<typeof and>): Promise<number> {
    const [row] = await tx.select({ n: count() }).from(entries).where(and(isPublished, where));
    return Number(row?.n ?? 0);
  }
}
