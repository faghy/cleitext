import type { PluginContext, PluginTerm, RouteRequest, RouteResponse } from '@cleitext/plugin-sdk';
import {
  breadcrumbData,
  CATALOG_CSS,
  catalogPage,
  type CardOptions,
  type Crumb,
  type Filters,
} from './catalog-html';
import { CATALOG_TAG } from './buy-box';
import { queryCatalog, SORTS, type ProductCard, type Sort } from './catalog-query';
import { moneyFormatter, SHOP_CSS } from './pages';
import { translator } from './strings';
import { BRAND, CATEGORY } from './sync';

/**
 * The public catalog: the shop page (`/shop`) and the archives of product
 * categories and brands, with filters. Cached pages, refreshed when products
 * change (`CATALOG_TAG`), shown to search engines.
 */

const PER_PAGE = 24;

/** The language prefix of a public address: `/it` for `/it/shop`. */
export const prefixOf = (request: Pick<RouteRequest, 'locale' | 'path'>) =>
  request.locale && request.path.startsWith(`/${request.locale}/`) ? `/${request.locale}` : '';

const slugs = (values: string[] | undefined) =>
  (values ?? [])
    .flatMap((v) => v.split(','))
    .map((v) => v.trim().toLowerCase())
    .filter((v) => /^[a-z0-9-]{1,100}$/.test(v))
    .slice(0, 30);

const amount = (value: string | undefined) => {
  const n = Number((value ?? '').replace(',', '.'));
  return value && Number.isFinite(n) && n >= 0 ? String(Math.floor(n)) : '';
};

export function readFilters(request: Pick<RouteRequest, 'query' | 'queryAll'>): Filters {
  const attributes: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(request.queryAll)) {
    const match = /^filter_([a-z0-9-]{1,60})$/.exec(key);
    if (match) attributes[match[1]!] = slugs(values);
  }
  const sort = request.query.orderby as Sort;
  return {
    brands: slugs(request.queryAll.brand),
    min: amount(request.query.min_price),
    max: amount(request.query.max_price),
    sale: request.query.on_sale === '1',
    stock: request.query.in_stock === '1',
    attributes,
    sort: SORTS.includes(sort) ? sort : 'default',
    page: Math.min(500, Math.max(1, Math.floor(Number(request.query.page)) || 1)),
  };
}

/** Product addresses by id, as the core builds them (language, permalink). */
export async function productUrls(
  ctx: PluginContext,
  siteId: string,
  cards: Pick<ProductCard, 'id'>[],
): Promise<Map<string, string>> {
  if (!cards.length) return new Map();
  const entries = await ctx.content.find(siteId, { ids: cards.map((c) => c.id), limit: 200 });
  return new Map(entries.map((e) => [e.id, e.url]));
}

export function registerCatalog(
  ctx: PluginContext,
  settings: (siteId: string) => Promise<{ currency: string }>,
): void {
  const render = async (
    request: RouteRequest,
    scope: { taxonomy: typeof CATEGORY | typeof BRAND; slug: string } | null,
  ): Promise<RouteResponse> => {
    const t = translator(request.locale);
    const locale = request.locale;
    const prefix = prefixOf(request);
    const store = await settings(request.siteId);
    const money = moneyFormatter(locale, store.currency);
    const [categories, brands] = await Promise.all([
      ctx.terms.find(request.siteId, { taxonomy: CATEGORY, locale, limit: 500 }),
      ctx.terms.find(request.siteId, { taxonomy: BRAND, locale, limit: 500 }),
    ]);
    const term = scope
      ? (scope.taxonomy === CATEGORY ? categories : brands).find((x) => x.slug === scope.slug)
      : null;
    if (scope && !term)
      return {
        status: 404,
        page: { title: t('Not found'), html: `<p>${t('This page does not exist.')}</p>` },
      };

    const filters = readFilters(request);
    const brandBySlug = new Map(brands.map((b) => [b.slug, b]));
    const chosenBrands = filters.brands.flatMap((s) =>
      brandBySlug.has(s) ? [brandBySlug.get(s)!.id] : [],
    );
    const shopUrl = `${prefix}/shop`;
    const base = term ? term.url.replace(/^https?:\/\/[^/]+/, '') : shopUrl;
    const result = await ctx.db.transaction(request.siteId, (tx) =>
      queryCatalog(
        tx,
        {
          locale,
          categoryId: scope?.taxonomy === CATEGORY ? term!.id : null,
          brandIds: scope?.taxonomy === BRAND ? [term!.id] : chosenBrands,
          minPrice: filters.min ? Number(filters.min) : null,
          maxPrice: filters.max ? Number(filters.max) : null,
          onSale: filters.sale,
          inStock: filters.stock,
          attributes: filters.attributes,
          sort: filters.sort,
          page: filters.page,
          perPage: PER_PAGE,
        },
        categories,
      ),
    );
    const urls = await productUrls(ctx, request.siteId, result.cards);

    // Shop › parent categories › the category (or the brand).
    const crumbs: Crumb[] = [
      { name: t('Home'), url: `${prefix}/` },
      { name: t('Shop'), url: shopUrl },
    ];
    if (term && scope?.taxonomy === CATEGORY) {
      const chain: PluginTerm[] = [];
      for (let at: PluginTerm | undefined = term; at && chain.length < 20;) {
        chain.unshift(at);
        at = at.parentId ? categories.find((c) => c.id === at!.parentId) : undefined;
      }
      for (const c of chain)
        crumbs.push({ name: c.name, url: c.url.replace(/^https?:\/\/[^/]+/, '') });
    } else if (term) crumbs.push({ name: term.name, url: base });

    const cards: CardOptions = {
      t,
      money,
      url: (card) => urls.get(card.id) ?? `${prefix}/product/${card.slug}`,
      addAction: `${prefix}/cart/add`,
    };
    const title = term ? term.name : t('Shop');
    return {
      // Product entries refresh `type:product`, their prices and stock CATALOG_TAG; terms the whole site.
      cacheTags: [CATALOG_TAG, 'type:product'],
      page: {
        title: filters.page > 1 ? `${title} – ${t('Page {n}', { n: filters.page })}` : title,
        description: term?.description?.slice(0, 300) ?? '',
        // Filtered pages are variations of the same page: only the plain ones are indexed.
        index:
          filters.brands.length === 0 &&
          !filters.min &&
          !filters.max &&
          !filters.sale &&
          !filters.stock &&
          Object.keys(filters.attributes).length === 0 &&
          filters.sort === 'default',
        head: [{ tag: 'json-ld', data: breadcrumbData(request.origin, crumbs) }],
        html: catalogPage({
          t,
          money,
          crumbs,
          description: term?.description ?? null,
          base,
          filters,
          result,
          perPage: PER_PAGE,
          brands: new Map(brands.map((b) => [b.id, { name: b.name, slug: b.slug }])),
          subcategories: new Map(
            categories.map((c) => [
              c.id,
              { name: c.name, url: c.url.replace(/^https?:\/\/[^/]+/, '') },
            ]),
          ),
          cards,
          css: SHOP_CSS + CATALOG_CSS,
        }),
      },
    };
  };

  ctx.routes.public({ method: 'GET', path: '/shop', handler: (request) => render(request, null) });
  ctx.routes.public({
    method: 'GET',
    path: '/product-category/:slug',
    handler: (request) => render(request, { taxonomy: CATEGORY, slug: request.params.slug ?? '' }),
  });
  ctx.routes.public({
    method: 'GET',
    path: '/brand/:slug',
    handler: (request) => render(request, { taxonomy: BRAND, slug: request.params.slug ?? '' }),
  });
}
