import { defineBlock, type PluginContext } from '@cleitext/plugin-sdk';
import { eq } from 'drizzle-orm';
import {
  BuyBoxView,
  CATALOG_TAG,
  loadBuyBox,
  productTag,
  type BuyBoxData,
  type BuyBoxSettings,
} from './buy-box';
import {
  breadcrumbData,
  breadcrumbs,
  CATALOG_CSS,
  productCards,
  thumbnail,
  type Crumb,
} from './catalog-html';
import { queryCatalog, type ProductCard, type Sort } from './catalog-query';
import { productUrls } from './catalog-routes';
import { currentPrice } from './pricing';
import { moneyFormatter, SHOP_CSS } from './pages';
import { products, variations } from './schema';
import { translator } from './strings';
import { BRAND, CATEGORY, PRODUCT } from './sync';

/**
 * Blocks of the storefront: a grid of products for any page, the cart link
 * with its count, and on product pages the breadcrumbs, the gallery and
 * related products; plus the product's structured data.
 */

const SUMMARY_CSS = `
.shop-summary{display:grid;gap:1.5rem 2rem;margin:1.5rem 0 2rem;align-items:start}
@media(min-width:760px){.shop-summary{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.shop-summary__main{display:block;border-radius:10px;overflow:hidden;background:rgba(127,127,127,.08)}
.shop-summary__main img{display:block;width:100%;aspect-ratio:1;object-fit:contain}
.shop-summary .shop-gallery{margin:.75rem 0 0}
.shop-summary .shop-buy{margin:0}
`;

/** The language prefix of the page, from its home address (`/it`). */
const prefixOf = (home: string) => home.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '');

/** The script that fills the cart's count on cached pages. */
const CART_JS = `(()=>{const els=document.querySelectorAll('[data-shop-count]');if(!els.length)return;
fetch('/cart/count',{credentials:'same-origin',headers:{accept:'application/json'}}).then(r=>r.ok?r.json():null).then(d=>{if(!d)return;
for(const el of els){el.textContent=d.count>0?String(d.count):'';const a=el.closest('a');if(a&&d.label)a.setAttribute('aria-label',d.label);}}).catch(()=>{});})();`;
export const CART_JS_PATH = `/shop-assets/cart-${Buffer.from(CART_JS).length.toString(36)}.js`;

const Raw = ({ markup, className }: { markup: string; className?: string }) => (
  <div className={className} dangerouslySetInnerHTML={{ __html: markup }} />
);

interface GridData {
  cards: ProductCard[];
  urls: Record<string, string>;
  currency: string;
  prefix: string;
}

export function registerStorefrontBlocks(
  ctx: PluginContext,
  settings: (siteId: string) => Promise<{ currency: string }>,
  buyBoxSettings: (siteId: string) => Promise<BuyBoxSettings>,
): void {
  const cardsMarkup = (data: GridData, locale: string, heading: 'h2' | 'h3' = 'h3') =>
    productCards(data.cards, {
      t: translator(locale),
      money: moneyFormatter(locale, data.currency),
      url: (card) => data.urls[card.id] ?? `${data.prefix}/product/${card.slug}`,
      addAction: `${data.prefix}/cart/add`,
      heading,
    }).value;

  const grid = async (
    siteId: string,
    locale: string,
    prefix: string,
    query: Partial<Parameters<typeof queryCatalog>[1]>,
  ): Promise<GridData> => {
    const categories = await ctx.terms.find(siteId, { taxonomy: CATEGORY, locale, limit: 500 });
    const result = await ctx.db.transaction(siteId, (tx) =>
      queryCatalog(tx, { locale, sort: 'default', page: 1, perPage: 8, ...query }, categories),
    );
    const urls = await productUrls(ctx, siteId, result.cards);
    return {
      cards: result.cards,
      urls: Object.fromEntries(urls),
      currency: (await settings(siteId)).currency,
      prefix,
    };
  };

  // Product pictures open enlarged in a window that closes (not the bare file).
  ctx.assets.enqueue({
    file: 'lightbox.js',
    when: ({ html }) =>
      html.includes('shop-summary__main') || html.includes('class="shop-gallery"'),
  });

  // ---- Products: a grid for any page ------------------------------------------------

  ctx.blocks.register(
    defineBlock<
      { heading: string; show: string; category: string; brand: string; limit: number },
      GridData
    >({
      type: 'shop/products',
      title: { en: 'Products', it: 'Prodotti' },
      description: {
        en: 'A grid of products: latest, featured, on sale, best sellers or top rated.',
        it: 'Una griglia di prodotti: ultimi, in evidenza, in offerta, più venduti o più votati.',
      },
      icon: 'cart',
      attributes: [
        { name: 'heading', type: 'text', label: { en: 'Heading', it: 'Titolo' } },
        {
          name: 'show',
          type: 'select',
          label: { en: 'Show', it: 'Mostra' },
          options: [
            { value: 'latest', label: { en: 'Latest', it: 'Ultimi' } },
            { value: 'featured', label: { en: 'Featured', it: 'In evidenza' } },
            { value: 'sale', label: { en: 'On sale', it: 'In offerta' } },
            { value: 'popular', label: { en: 'Best sellers', it: 'Più venduti' } },
            { value: 'rated', label: { en: 'Top rated', it: 'Più votati' } },
          ],
          default: 'latest',
        },
        {
          name: 'category',
          type: 'text',
          label: { en: 'Category (its slug, optional)', it: 'Categoria (slug, facoltativa)' },
        },
        {
          name: 'brand',
          type: 'text',
          label: { en: 'Brand (its slug, optional)', it: 'Marchio (slug, facoltativo)' },
        },
        {
          name: 'limit',
          type: 'number',
          label: { en: 'How many', it: 'Quanti' },
          min: 1,
          max: 48,
          default: 8,
        },
      ],
      async load(attrs, context) {
        context.tag(CATALOG_TAG);
        context.tag(`type:${PRODUCT}`);
        const locale = context.locale;
        const bySlug = async (taxonomy: string, slug: string) =>
          slug
            ? (await ctx.terms.find(context.siteId, { taxonomy, locale, limit: 500 })).find(
                (term) => term.slug === slug.trim().toLowerCase(),
              )
            : undefined;
        const category = await bySlug(CATEGORY, attrs.category);
        const brand = await bySlug(BRAND, attrs.brand);
        const sort: Sort =
          attrs.show === 'popular' ? 'popularity' : attrs.show === 'rated' ? 'rating' : 'date';
        return grid(context.siteId, locale, prefixOf(context.page.site.home), {
          sort,
          perPage: Math.min(48, Math.max(1, Number(attrs.limit) || 8)),
          categoryId: category?.id ?? null,
          brandIds: brand ? [brand.id] : [],
          featured: attrs.show === 'featured',
          onSale: attrs.show === 'sale',
        });
      },
      css: () => SHOP_CSS + CATALOG_CSS,
      render({ attrs, data, context }) {
        if (!data.cards.length) return null;
        return (
          <section className="shop-page shop-products">
            {attrs.heading && <h2>{attrs.heading}</h2>}
            <Raw markup={cardsMarkup(data, context.locale)} />
          </section>
        );
      },
    }),
  );

  // ---- The cart link, for headers and menus ------------------------------------------

  ctx.blocks.register(
    defineBlock<{ label: string }, { prefix: string }>({
      type: 'shop/cart-link',
      title: { en: 'Cart link', it: 'Link al carrello' },
      description: {
        en: 'A link to the cart with the number of items, for the header.',
        it: 'Un link al carrello con il numero di articoli, per l’intestazione.',
      },
      icon: 'cart',
      attributes: [{ name: 'label', type: 'text', label: { en: 'Label', it: 'Etichetta' } }],
      load: async (_attrs, context) => ({ prefix: prefixOf(context.page.site.home) }),
      css: () => CATALOG_CSS,
      render({ attrs, data, context }) {
        const t = translator(context.locale);
        return (
          <>
            <a className="shop-cart-link" href={`${data.prefix}/cart`}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 8h14l-1.2 12H6.2z M9 8V6a3 3 0 0 1 6 0v2" />
              </svg>
              <span>{attrs.label || t('Cart')}</span>
              <span className="shop-cart-link__count" data-shop-count="" />
            </a>
            <script src={CART_JS_PATH} defer />
          </>
        );
      },
    }),
  );

  // ---- Product search, for headers ---------------------------------------------------

  ctx.blocks.register(
    defineBlock<{ placeholder: string }, { prefix: string }>({
      type: 'shop/search',
      title: { en: 'Product search', it: 'Ricerca prodotti' },
      description: {
        en: 'A search box that looks among the products only, for the header.',
        it: 'Un campo di ricerca che cerca solo tra i prodotti, per l’intestazione.',
      },
      icon: 'search',
      attributes: [
        { name: 'placeholder', type: 'text', label: { en: 'Placeholder', it: 'Testo di esempio' } },
      ],
      load: async (_attrs, context) => ({ prefix: prefixOf(context.page.site.home) }),
      css: () => CATALOG_CSS,
      render({ attrs, data, context }) {
        const t = translator(context.locale);
        const label = attrs.placeholder || t('Search products');
        return (
          <form className="shop-search" role="search" method="get" action={`${data.prefix}/search`}>
            <input type="search" name="q" placeholder={label} aria-label={label} />
            <input type="hidden" name="type" value={PRODUCT} />
            <button type="submit" aria-label={t('Search')}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
          </form>
        );
      },
    }),
  );

  ctx.routes.public({
    method: 'GET',
    path: CART_JS_PATH,
    handler: () => ({
      body: CART_JS,
      contentType: 'text/javascript; charset=utf-8',
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    }),
  });

  // ---- Product pages: breadcrumbs, gallery, related ----------------------------------

  /** Home › Shop › the deepest of the product's categories › the product. */
  async function productCrumbs(
    siteId: string,
    locale: string,
    prefix: string,
    entryId: string,
    title: string | undefined,
    url: string | undefined,
  ): Promise<Crumb[] | null> {
    const t = translator(locale);
    const [row] = await ctx.db.transaction(siteId, (tx) =>
      tx
        .select({ categoryIds: products.categoryIds, title: products.title })
        .from(products)
        .where(eq(products.entryId, entryId)),
    );
    if (!row) return null;
    const categories = await ctx.terms.find(siteId, {
      taxonomy: CATEGORY,
      locale: locale,
      limit: 500,
    });
    const crumbs: Crumb[] = [
      { name: t('Home'), url: `${prefix}/` },
      { name: t('Shop'), url: `${prefix}/shop` },
    ];
    // The deepest of its categories, with the ones above it.
    const chains = row.categoryIds.map((cid) => {
      const chain = [];
      for (let at = categories.find((c) => c.id === cid); at && chain.length < 20;) {
        chain.unshift(at);
        const parent: string | null = at.parentId;
        at = parent ? categories.find((c) => c.id === parent) : undefined;
      }
      return chain;
    });
    const longest = chains.sort((a, b) => b.length - a.length)[0] ?? [];
    for (const c of longest)
      crumbs.push({ name: c.name, url: c.url.replace(/^https?:\/\/[^/]+/, '') });
    crumbs.push({
      name: title ?? row.title,
      url: url ?? '',
    });
    return crumbs;
  }

  interface ProductPageData {
    crumbs: Crumb[];
  }

  ctx.blocks.register(
    defineBlock<Record<string, never>, ProductPageData | null>({
      type: 'shop/breadcrumbs',
      title: { en: 'Shop breadcrumbs', it: 'Percorso del negozio' },
      icon: 'cart',
      attributes: [],
      async load(_attrs, context) {
        const id = context.entry?.id;
        if (!id) return null;
        context.tag(productTag(id));
        const crumbs = await productCrumbs(
          context.siteId,
          context.locale,
          prefixOf(context.page.site.home),
          id,
          context.page.entry?.title,
          context.page.entry?.url,
        );
        return crumbs ? { crumbs } : null;
      },
      css: () => CATALOG_CSS,
      render({ data, context }) {
        if (!data) return null;
        const t = translator(context.locale);
        return <Raw markup={breadcrumbs(t, data.crumbs).value} />;
      },
    }),
  );

  /**
   * The top of a product page, as shops lay it out: the pictures (the main
   * one, then the gallery) beside the buy box. Themes hide their own big
   * featured image when the page has it (`.shop-summary`).
   */
  interface Picture {
    url: string;
    alt: string;
    srcset?: string;
  }
  ctx.blocks.register(
    defineBlock<Record<string, never>, { buy: BuyBoxData | null; pictures: Picture[] } | null>({
      type: 'shop/summary',
      title: { en: 'Product summary', it: 'Riepilogo del prodotto' },
      icon: 'cart',
      attributes: [],
      async load(_attrs, context) {
        const id = context.entry?.id;
        if (!id) return null;
        context.tag(productTag(id));
        const buy = await loadBuyBox(ctx, buyBoxSettings, context);
        const [row] = await ctx.db.transaction(context.siteId, (tx) =>
          tx.select({ gallery: products.gallery }).from(products).where(eq(products.entryId, id)),
        );
        const pictures: Picture[] = [];
        const main = context.page.entry?.featuredImage;
        if (main) {
          const webp = main.variants
            .filter((v) => v.format === 'webp')
            .sort((a, b) => a.width - b.width);
          pictures.push({
            url: main.url,
            alt: main.alt || (context.page.entry?.title ?? ''),
            ...(webp.length ? { srcset: webp.map((v) => `${v.url} ${v.width}w`).join(', ') } : {}),
          });
        }
        for (const image of row?.gallery ?? [])
          pictures.push({ url: image.url, alt: image.caption });
        return { buy, pictures };
      },
      css: () => SHOP_CSS + CATALOG_CSS + SUMMARY_CSS,
      render({ data, context }) {
        if (!data) return null;
        const t = translator(context.locale);
        const [main, ...more] = data.pictures;
        return (
          <div className={`shop-summary${main ? '' : ' shop-summary--text'}`}>
            {main && (
              <div className="shop-summary__media">
                <a href={main.url} className="shop-summary__main">
                  <img
                    src={main.url}
                    {...(main.srcset
                      ? { srcSet: main.srcset, sizes: '(min-width: 760px) 50vw, 100vw' }
                      : {})}
                    alt={main.alt}
                    fetchPriority="high"
                  />
                </a>
                {more.length > 0 && (
                  <ul className="shop-gallery" aria-label={t('Product images')}>
                    {more.map((image) => {
                      const thumb = thumbnail(image.url);
                      return (
                        <li key={image.url}>
                          <a href={image.url}>
                            <img
                              src={thumb?.src ?? image.url}
                              alt={image.alt}
                              loading="lazy"
                              decoding="async"
                            />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
            <div className="shop-summary__info">
              <BuyBoxView data={data.buy} locale={context.locale} />
            </div>
          </div>
        );
      },
    }),
  );

  ctx.blocks.register(
    defineBlock<Record<string, never>, { images: { url: string; caption: string }[] } | null>({
      type: 'shop/gallery',
      title: { en: 'Product gallery', it: 'Galleria del prodotto' },
      icon: 'image',
      attributes: [],
      async load(_attrs, context) {
        const id = context.entry?.id;
        if (!id) return null;
        context.tag(productTag(id));
        const [row] = await ctx.db.transaction(context.siteId, (tx) =>
          tx.select({ gallery: products.gallery }).from(products).where(eq(products.entryId, id)),
        );
        return row?.gallery.length
          ? { images: row.gallery.map((g) => ({ url: g.url, caption: g.caption })) }
          : null;
      },
      css: () => CATALOG_CSS,
      render({ data, context }) {
        if (!data) return null;
        const t = translator(context.locale);
        return (
          <ul className="shop-gallery" aria-label={t('Product images')}>
            {data.images.map((image) => {
              const thumb = thumbnail(image.url);
              return (
                <li key={image.url}>
                  <a href={image.url}>
                    <img
                      src={thumb?.src ?? image.url}
                      alt={image.caption}
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        );
      },
    }),
  );

  ctx.blocks.register(
    defineBlock<Record<string, never>, GridData | null>({
      type: 'shop/related',
      title: { en: 'Related products', it: 'Prodotti correlati' },
      icon: 'cart',
      attributes: [],
      async load(_attrs, context) {
        const id = context.entry?.id;
        if (!id) return null;
        context.tag(productTag(id));
        context.tag(CATALOG_TAG);
        const [row] = await ctx.db.transaction(context.siteId, (tx) =>
          tx
            .select({ upsellIds: products.upsellIds, categoryIds: products.categoryIds })
            .from(products)
            .where(eq(products.entryId, id)),
        );
        if (!row) return null;
        const prefix = prefixOf(context.page.site.home);
        // The up-sells chosen in the product, or else products of its first category.
        const data = row.upsellIds.length
          ? await grid(context.siteId, context.locale, prefix, { ids: row.upsellIds, perPage: 4 })
          : row.categoryIds[0]
            ? await grid(context.siteId, context.locale, prefix, {
                categoryId: row.categoryIds[0],
                perPage: 5,
                sort: 'popularity',
              })
            : null;
        if (!data) return null;
        data.cards = data.cards.filter((c) => c.id !== id).slice(0, 4);
        return data.cards.length ? data : null;
      },
      css: () => SHOP_CSS + CATALOG_CSS,
      render({ data, context }) {
        if (!data) return null;
        const t = translator(context.locale);
        return (
          <section className="shop-page shop-related">
            <h2>{t('You may also like')}</h2>
            <Raw markup={cardsMarkup(data, context.locale)} />
          </section>
        );
      },
    }),
  );

  // ---- Structured data of product pages (Product, Offer) -----------------------------

  ctx.hooks.filter(
    'render.head',
    async (head, context) => {
      const entry = context.entry;
      if (!entry || entry.type !== PRODUCT) return head;
      context.tag(productTag(entry.id));
      const store = await settings(context.siteId);
      const found = await ctx.db.transaction(context.siteId, async (tx) => {
        const [product] = await tx.select().from(products).where(eq(products.entryId, entry.id));
        if (!product) return null;
        const own =
          product.kind === 'variable'
            ? await tx.select().from(variations).where(eq(variations.productId, entry.id))
            : [];
        return { product, variations: own };
      });
      if (!found) return head;
      const { product } = found;
      const brands = product.brandId
        ? await ctx.terms.find(context.siteId, { taxonomy: BRAND, ids: [product.brandId] })
        : [];
      const url = head.canonical ?? '';
      const availability = (status: string) =>
        `https://schema.org/${status === 'outofstock' ? 'OutOfStock' : status === 'onbackorder' ? 'BackOrder' : 'InStock'}`;
      const prices = found.variations
        .filter((v) => v.enabled)
        .map((v) => currentPrice(v))
        .filter((p): p is string => p !== null)
        .map(Number);
      const price = currentPrice(product);
      const offers =
        product.kind === 'variable'
          ? prices.length
            ? {
                '@type': 'AggregateOffer',
                priceCurrency: store.currency,
                lowPrice: Math.min(...prices).toFixed(2),
                highPrice: Math.max(...prices).toFixed(2),
                offerCount: prices.length,
                availability: availability(
                  found.variations.some((v) => v.enabled && v.stockStatus !== 'outofstock')
                    ? 'instock'
                    : 'outofstock',
                ),
              }
            : undefined
          : price !== null
            ? {
                '@type': 'Offer',
                url,
                priceCurrency: store.currency,
                price: Number(price).toFixed(2),
                availability: availability(product.stockStatus),
                itemCondition: `https://schema.org/${product.condition === 'used' ? 'UsedCondition' : product.condition === 'refurbished' ? 'RefurbishedCondition' : 'NewCondition'}`,
              }
            : undefined;
      const origin = url.replace(/^(https?:\/\/[^/]+).*$/, '$1');
      const data = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: entry.title,
        ...(entry.excerpt ? { description: entry.excerpt } : {}),
        ...(product.imageUrl
          ? {
              image: [product.imageUrl, ...product.gallery.map((g) => g.url)].map((u) =>
                u.startsWith('http') ? u : `${origin}${u}`,
              ),
            }
          : {}),
        ...(product.sku ? { sku: product.sku } : {}),
        ...(product.gtin ? { gtin: product.gtin } : {}),
        ...(brands[0] ? { brand: { '@type': 'Brand', name: brands[0].name } } : {}),
        ...(offers ? { offers } : {}),
        ...(product.ratingCount > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: Number(product.rating).toFixed(1),
                reviewCount: product.ratingCount,
              },
            }
          : {}),
      };
      const tags = [...(head.tags ?? []), { tag: 'json-ld' as const, data }];
      // The breadcrumbs, with absolute addresses (blocks only know the relative ones).
      if (url) {
        const address = new URL(url);
        const prefix = address.pathname.startsWith(`/${context.locale}/`)
          ? `/${context.locale}`
          : '';
        const crumbs = await productCrumbs(
          context.siteId,
          context.locale,
          prefix,
          entry.id,
          entry.title,
          address.pathname,
        );
        if (crumbs) {
          const list = breadcrumbData(address.origin, crumbs);
          // An SEO plugin's schema graph (run before this filter) gets the shop's trail in its
          // own BreadcrumbList, so the page has one; otherwise the shop adds it.
          const node = tags
            .flatMap((tag) =>
              tag.tag === 'json-ld' && Array.isArray((tag.data as { '@graph'?: unknown })['@graph'])
                ? ((tag.data as { '@graph': Record<string, unknown>[] })['@graph'] ?? [])
                : [],
            )
            .find((n) => n['@type'] === 'BreadcrumbList');
          if (node) node.itemListElement = list.itemListElement;
          else tags.push({ tag: 'json-ld', data: list });
        }
      }
      return { ...head, tags };
    },
    { priority: 20 },
  );
}
