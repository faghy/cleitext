import type { CatalogResult, ProductCard, Sort } from './catalog-query';
import { SORTS } from './catalog-query';
import { html, raw, type Html } from './html';
import type { Money } from './pages';
import type { Translate } from './strings';

/**
 * The catalog's markup: product cards, the filters (a plain GET form, no
 * JavaScript), sorting, pages and breadcrumbs. Classes `shop-*`, styled by
 * CATALOG_CSS with the theme's fonts and colours.
 */

export const CATALOG_CSS = `
.shop-lightbox{border:0;padding:0;margin:0;width:100vw;height:100vh;max-width:none;max-height:none;background:rgba(0,0,0,.9);color:#fff;overflow:hidden}
.shop-lightbox::backdrop{background:rgba(0,0,0,.9)}
.shop-lightbox[open]{display:flex;align-items:center;justify-content:center}
.shop-lightbox__image{max-width:calc(100vw - 7rem);max-height:calc(100vh - 6rem);object-fit:contain;box-shadow:0 10px 40px rgba(0,0,0,.5)}
@media(max-width:600px){.shop-lightbox__image{max-width:100vw}}
.shop-lightbox button{position:absolute;display:flex;align-items:center;justify-content:center;width:3rem;height:3rem;border:0;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font:2rem/1 system-ui,sans-serif;cursor:pointer}
.shop-lightbox button:hover,.shop-lightbox button:focus-visible{background:rgba(255,255,255,.28);outline:2px solid #fff;outline-offset:2px}
.shop-lightbox__close{top:1rem;right:1rem}
.shop-lightbox__nav--prev{left:1rem;top:50%;transform:translateY(-50%)}
.shop-lightbox__nav--next{right:1rem;top:50%;transform:translateY(-50%)}
.shop-lightbox__count{position:absolute;bottom:1rem;left:0;right:0;margin:0;text-align:center;font-size:.9rem;opacity:.8}
.shop-crumbs{font-size:.9em;margin:0 0 1rem}.shop-crumbs ol{display:flex;flex-wrap:wrap;gap:.25rem .5rem;list-style:none;margin:0;padding:0}
.shop-crumbs li+li::before{content:"›";margin-right:.5rem;opacity:.6}
.shop-wide{width:min(76rem,calc(100vw - 2rem));position:relative;left:50%;transform:translateX(-50%)}
.shop-catalog{display:grid;gap:2rem}
@media(min-width:900px){.shop-catalog{grid-template-columns:13rem minmax(0,1fr)}}
.shop-filters fieldset{border:0;padding:0;margin:0 0 1.25rem}
.shop-filters legend{font-weight:700;margin-bottom:.4rem}
.shop-filters ul{list-style:none;margin:0;padding:0}.shop-filters li{margin:.25rem 0}
.shop-filters label{display:flex;gap:.45rem;align-items:center;cursor:pointer}
.shop-filters .shop-count{opacity:.65;font-size:.85em}
.shop-filters .shop-prices{display:flex;gap:.5rem;align-items:center}
.shop-filters input[type=number]{width:5.5rem;font:inherit;padding:.4rem;border:1px solid rgba(127,127,127,.4);border-radius:6px;background:transparent;color:inherit}
.shop-filters details>summary{cursor:pointer;font-weight:700;margin-bottom:1rem}
@supports selector(::details-content){@media(min-width:900px){.shop-filters details::details-content{content-visibility:visible;display:contents}.shop-filters details>summary{display:none}}}
.shop-toolbar{display:flex;flex-wrap:wrap;gap:.75rem;justify-content:space-between;align-items:center;margin:0 0 1.25rem}
.shop-toolbar select{font:inherit;padding:.45rem .6rem;border:1px solid rgba(127,127,127,.4);border-radius:6px;background:transparent;color:inherit}
.shop-toolbar select option{color:#111;background:#fff}
.shop-grid{display:grid;gap:1.75rem 1.25rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,var(--shop-card,11rem)),1fr));list-style:none;margin:0 0 2rem;padding:0}
@media(max-width:600px){.shop-grid{--shop-card:9rem;gap:1.25rem .9rem}}
.shop-card{display:flex;flex-direction:column;gap:.4rem;position:relative}
.shop-card__image{display:block;aspect-ratio:1;border-radius:8px;overflow:hidden;background:rgba(127,127,127,.08)}
.shop-card__image img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
.shop-card__image:hover img{transform:scale(1.03)}
.shop-card__title{font-size:1em;font-weight:600;margin:.25rem 0 0;line-height:1.35}
.shop-card__title a{color:inherit;text-decoration:none}.shop-card__title a:hover{text-decoration:underline}
.shop-card__price{margin:0;font-weight:700}.shop-card__price del{opacity:.6;font-weight:400;margin-right:.35rem}.shop-card__price ins{text-decoration:none}
.shop-card__badge{position:absolute;top:.5rem;left:.5rem;font-size:.75em;font-weight:700;padding:.15rem .55rem;border-radius:999px;background:#b42318;color:#fff}
.shop-card__out{margin:0;font-size:.85em;color:#b42318;font-weight:600}
.shop-card form{margin:auto 0 0}.shop-card .shop-button{padding:.5rem 1rem;font-size:.9em}
.shop-stars{color:#b54708;letter-spacing:.05em;font-size:.9em}
.shop-pages{display:flex;flex-wrap:wrap;gap:.4rem;justify-content:center;list-style:none;margin:0;padding:0}
.shop-pages a,.shop-pages span{display:inline-block;min-width:2.4rem;text-align:center;padding:.4rem .6rem;border:1px solid rgba(127,127,127,.35);border-radius:6px;text-decoration:none;color:inherit}
.shop-pages [aria-current=page]{background:var(--shop-accent-bg,#1f2937);color:var(--shop-accent-fg,#fff);border-color:var(--shop-accent-bg,#1f2937)}
.shop-subcats{display:flex;flex-wrap:wrap;gap:.5rem;list-style:none;margin:0 0 1.5rem;padding:0}
.shop-subcats a{display:inline-block;padding:.35rem .8rem;border:1px solid rgba(127,127,127,.35);border-radius:999px;text-decoration:none;color:inherit}
.shop-gallery{display:grid;gap:.5rem;grid-template-columns:repeat(auto-fill,minmax(5.5rem,1fr));list-style:none;margin:1rem 0;padding:0}
.shop-gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;display:block}
.shop-related h2{font-size:1.3em;margin:2.5rem 0 1rem}
.shop-cart-link{display:inline-flex;gap:.35rem;align-items:center;text-decoration:none;color:inherit;font-weight:600}
.shop-cart-link__count{display:inline-grid;place-items:center;min-width:1.4rem;height:1.4rem;padding:0 .3rem;border-radius:999px;background:var(--shop-accent,var(--cx-accent,#1f2937));color:var(--shop-on-accent,var(--cx-on-accent,#fff));font-size:.75em}
.shop-cart-link__count:empty{display:none}
`;

/** A thumbnail of an image of the media library (300 px), the original otherwise. */
export function thumbnail(url: string | null): { src: string; srcset?: string } | null {
  if (!url) return null;
  const resizable = /^\/media\/.+\.(jpe?g|png|webp|avif)$/i.test(url);
  if (!resizable) return { src: url };
  const base = url.replace(/\.[a-z0-9]+$/i, '');
  return { src: `${base}-thumb.webp`, srcset: `${base}-thumb.webp 300w, ${url} 1200w` };
}

export function stars(t: Translate, rating: number, count: number): Html | string {
  if (count === 0) return '';
  const full = Math.round(rating);
  return html`<span
    class="shop-stars"
    title="${t('Rated {rating} out of 5', { rating: rating.toFixed(1) })}"
    ><span aria-hidden="true">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span
    ><span class="shop-sr"
      >${t('Rated {rating} out of 5', { rating: rating.toFixed(1) })}</span
    ></span
  >`;
}

export function priceHtml(card: ProductCard, money: Money): Html | string {
  if (card.price === null) return '';
  if (card.kind === 'variable' && card.priceMax !== null && card.priceMax !== card.price)
    return html`${money.of(card.price)} – ${money.of(card.priceMax)}`;
  if (card.onSale && card.kind === 'simple' && card.regularPrice)
    return html`<del>${money.of(card.regularPrice)}</del><ins>${money.of(card.price)}</ins>`;
  return money.of(card.price);
}

export interface CardOptions {
  t: Translate;
  money: Money;
  url: (card: ProductCard) => string;
  /** Where "Add to cart" posts, e.g. `/it/cart/add`. */
  addAction: string;
  /** For the product names in the headings: h2 on the catalog, h3 in blocks. */
  heading?: 'h2' | 'h3';
}

export function productCards(cards: ProductCard[], options: CardOptions): Html {
  const { t, money } = options;
  const heading = options.heading ?? 'h2';
  return html`<ul class="shop-grid">
    ${cards.map((card) => {
      const image = thumbnail(card.imageUrl);
      const url = options.url(card);
      const out = card.stockStatus === 'outofstock';
      const action =
        card.price === null || out
          ? ''
          : card.kind === 'variable'
            ? html`<a class="shop-button shop-button--secondary" href="${url}"
                >${t('Choose options')}</a
              >`
            : html`<form method="post" action="${options.addAction}">
                <input type="hidden" name="product" value="${card.id}" />
                <button class="shop-button" type="submit">
                  ${t('Add to cart')}<span class="shop-sr">: ${card.title}</span>
                </button>
              </form>`;
      return html`<li class="shop-card">
        <a class="shop-card__image" href="${url}" tabindex="-1" aria-hidden="true"
          >${image ? html`<img src="${image.src}" ${image.srcset ? raw(` srcset="${image.srcset}" sizes="(min-width: 900px) 18rem, 50vw"`) : ''} alt="" loading="lazy" decoding="async" />` : ''}</a
        >
        ${card.onSale ? html`<span class="shop-card__badge">${t('Sale!')}</span>` : ''}
        ${raw(`<${heading} class="shop-card__title">`)}<a href="${url}">${card.title}</a
        >${raw(`</${heading}>`)} ${stars(t, card.rating, card.ratingCount)}
        <p class="shop-card__price">${priceHtml(card, money)}</p>
        ${out ? html`<p class="shop-card__out">${t('Out of stock')}</p>` : ''} ${action}
      </li>`;
    })}
  </ul>`;
}

export interface Crumb {
  name: string;
  url: string;
}

export function breadcrumbs(t: Translate, crumbs: Crumb[]): Html {
  return html`<nav class="shop-crumbs" aria-label="${t('Breadcrumb')}">
    <ol>
      ${crumbs.map((c, i) =>
        i === crumbs.length - 1
          ? html`<li><span aria-current="page">${c.name}</span></li>`
          : html`<li><a href="${c.url}">${c.name}</a></li>`,
      )}
    </ol>
  </nav>`;
}

/** BreadcrumbList structured data, with absolute addresses. */
export function breadcrumbData(origin: string, crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url.startsWith('http') ? c.url : `${origin}${c.url}`,
    })),
  };
}

export interface Filters {
  brands: string[];
  min: string;
  max: string;
  sale: boolean;
  stock: boolean;
  attributes: Record<string, string[]>;
  sort: Sort;
  page: number;
}

/** The address of the catalog with these filters (empty ones left out). */
export function filterUrl(base: string, f: Filters, changes: Partial<Filters> = {}): string {
  const next = { ...f, ...changes };
  const params = new URLSearchParams();
  for (const brand of next.brands) params.append('brand', brand);
  if (next.min) params.set('min_price', next.min);
  if (next.max) params.set('max_price', next.max);
  if (next.sale) params.set('on_sale', '1');
  if (next.stock) params.set('in_stock', '1');
  for (const [slug, values] of Object.entries(next.attributes))
    for (const value of values) params.append(`filter_${slug}`, value);
  if (next.sort !== 'default') params.set('orderby', next.sort);
  if (next.page > 1) params.set('page', String(next.page));
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function catalogPage(options: {
  t: Translate;
  money: Money;
  crumbs: Crumb[];
  description: string | null;
  base: string;
  filters: Filters;
  result: CatalogResult;
  perPage: number;
  /** Names and addresses of the terms in the facets. */
  brands: Map<string, { name: string; slug: string }>;
  subcategories: Map<string, { name: string; url: string }>;
  cards: CardOptions;
  css: string;
}): string {
  const { t, filters: f, result, base } = options;
  const pages = Math.max(1, Math.ceil(result.total / options.perPage));
  const from = result.total === 0 ? 0 : (f.page - 1) * options.perPage + 1;
  const to = Math.min(result.total, f.page * options.perPage);
  const active =
    f.brands.length > 0 ||
    !!f.min ||
    !!f.max ||
    f.sale ||
    f.stock ||
    Object.values(f.attributes).some((v) => v.length > 0);
  const brandList = result.brands
    .flatMap((b) => {
      const brand = options.brands.get(b.id);
      return brand ? [{ ...brand, count: b.count }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const sidebar = html`<details ${active ? raw(' open') : ''}>
    <summary>${t('Filters')}</summary>
    ${
      brandList.length > 0
        ? html`<fieldset>
            <legend>${t('Brand')}</legend>
            <ul>
              ${brandList.map(
                (b) =>
                  html`<li>
                    <label
                      ><input
                        form="shop-filters"
                        type="checkbox"
                        name="brand"
                        value="${b.slug}"
                        ${f.brands.includes(b.slug) ? raw(' checked') : ''}
                      />
                      ${b.name} <span class="shop-count">(${b.count})</span></label
                    >
                  </li>`,
              )}
            </ul>
          </fieldset>`
        : ''
    }
    ${result.attributeFacets.map(
      (attribute) =>
        html`<fieldset>
          <legend>${attribute.name}</legend>
          <ul>
            ${attribute.values.map(
              (value) =>
                html`<li>
                  <label
                    ><input
                      form="shop-filters"
                      type="checkbox"
                      name="filter_${attribute.slug}"
                      value="${value.slug}"
                      ${(f.attributes[attribute.slug] ?? []).includes(value.slug) ? raw(' checked') : ''}
                    />
                    ${value.name}</label
                  >
                </li>`,
            )}
          </ul>
        </fieldset>`,
    )}
    <fieldset>
      <legend>${t('Price')}</legend>
      <div class="shop-prices">
        <label class="shop-sr" for="shop-min">${t('Minimum price')}</label>
        <input
          form="shop-filters"
          id="shop-min"
          type="number"
          name="min_price"
          min="0"
          step="1"
          inputmode="numeric"
          value="${f.min}"
          placeholder="${result.priceRange ? String(result.priceRange.min) : ''}"
        />
        –
        <label class="shop-sr" for="shop-max">${t('Maximum price')}</label>
        <input
          form="shop-filters"
          id="shop-max"
          type="number"
          name="max_price"
          min="0"
          step="1"
          inputmode="numeric"
          value="${f.max}"
          placeholder="${result.priceRange ? String(result.priceRange.max) : ''}"
        />
      </div>
    </fieldset>
    <fieldset>
      <legend>${t('Availability')}</legend>
      <ul>
        <li>
          <label
            ><input
              form="shop-filters"
              type="checkbox"
              name="on_sale"
              value="1"
              ${f.sale ? raw(' checked') : ''}
            />
            ${t('On sale')}</label
          >
        </li>
        <li>
          <label
            ><input
              form="shop-filters"
              type="checkbox"
              name="in_stock"
              value="1"
              ${f.stock ? raw(' checked') : ''}
            />
            ${t('In stock')}</label
          >
        </li>
      </ul>
    </fieldset>
    <p><button class="shop-button" type="submit" form="shop-filters">${t('Filter')}</button></p>
    ${active ? html`<p><a href="${base}">${t('Clear filters')}</a></p>` : ''}
  </details>`;

  const sortLabels: Record<Sort, string> = {
    default: t('Default sorting'),
    popularity: t('Sort by popularity'),
    rating: t('Sort by rating'),
    date: t('Sort by latest'),
    price: t('Sort by price: low to high'),
    'price-desc': t('Sort by price: high to low'),
    title: t('Sort by name'),
  };
  const toolbar = html`<div class="shop-toolbar">
    <p style="margin:0">
      ${
        result.total === 0
          ? ''
          : result.total === 1
            ? t('Showing the only product')
            : pages === 1
              ? t('Showing all {n} products', { n: result.total })
              : t('Showing {from}–{to} of {n} products', { from, to, n: result.total })
      }
    </p>
    <p style="margin:0;display:flex;gap:.5rem">
      <label class="shop-sr" for="shop-orderby">${t('Sort')}</label>
      <select id="shop-orderby" name="orderby" form="shop-filters">
        ${SORTS.map((s) => html`<option value="${s}" ${s === f.sort ? raw(' selected') : ''}>${sortLabels[s]}</option>`)}
      </select>
      <button class="shop-button shop-button--secondary" type="submit" form="shop-filters">
        ${t('Sort')}
      </button>
    </p>
  </div>`;

  const pageLinks =
    pages > 1
      ? html`<nav aria-label="${t('Pages')}">
          <ul class="shop-pages">
            ${
              f.page > 1
                ? html`<li>
                    <a href="${filterUrl(base, f, { page: f.page - 1 })}" rel="prev"
                      >←<span class="shop-sr"> ${t('Previous')}</span></a
                    >
                  </li>`
                : ''
            }
            ${Array.from({ length: pages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === pages || Math.abs(p - f.page) <= 2)
              .map(
                (p, i, list) =>
                  html`${i > 0 && p - list[i - 1]! > 1 ? html`<li><span>…</span></li>` : ''}
                    <li>
                      ${p === f.page ? html`<span aria-current="page">${p}</span>` : html`<a href="${filterUrl(base, f, { page: p })}">${p}</a>`}
                    </li>`,
              )}
            ${
              f.page < pages
                ? html`<li>
                    <a href="${filterUrl(base, f, { page: f.page + 1 })}" rel="next"
                      ><span class="shop-sr">${t('Next')} </span>→</a
                    >
                  </li>`
                : ''
            }
          </ul>
        </nav>`
      : '';

  const subcategories = result.categories.flatMap((c) => {
    const term = options.subcategories.get(c.id);
    return term ? [{ ...term, count: c.count }] : [];
  });

  return html`<style>
      ${raw(options.css)}
    </style>
    <div class="shop-page shop-wide">
      ${breadcrumbs(t, options.crumbs)}
      ${options.description ? html`<div class="shop-intro">${options.description}</div>` : ''}
      ${
        subcategories.length
          ? html`<ul class="shop-subcats">
              ${subcategories.map(
                (c) =>
                  html`<li>
                    <a href="${c.url}">${c.name} <span class="shop-count">(${c.count})</span></a>
                  </li>`,
              )}
            </ul>`
          : ''
      }
      <form id="shop-filters" method="get" action="${base}"></form>
      <div class="shop-catalog">
        <aside class="shop-filters">${sidebar}</aside>
        <div>
          ${toolbar}
          ${
            result.cards.length
              ? productCards(result.cards, options.cards)
              : html`<p>${t('No products match these filters.')}</p>`
          }
          ${pageLinks}
        </div>
      </div>
    </div>`.value;
}
