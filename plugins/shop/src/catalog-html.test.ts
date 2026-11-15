import { describe, expect, it } from 'vitest';
import { catalogPage, type Filters } from './catalog-html';
import type { CatalogResult, ProductCard } from './catalog-query';
import { orderNumberOf } from './order-tracking';
import { moneyFormatter } from './pages';
import { translator } from './strings';

const t = translator('en');
const card = (n: number): ProductCard => ({
  id: `00000000-0000-0000-0000-00000000000${n}`,
  title: `Product ${n}`,
  slug: `product-${n}`,
  kind: 'simple',
  imageUrl: null,
  excerpt: '',
  price: '10',
  priceMax: '10',
  regularPrice: '10',
  onSale: false,
  stockStatus: 'instock',
  rating: 0,
  ratingCount: 0,
  featured: false,
});
const filters: Filters = {
  q: '',
  brands: [],
  min: '',
  max: '',
  sale: false,
  stock: false,
  attributes: {},
  sort: 'default',
  page: 2,
};
const result: CatalogResult = {
  cards: [card(1), card(2)],
  total: 10,
  brands: [],
  categories: [],
  attributeFacets: [],
  priceRange: null,
};
const render = (extra: Partial<Parameters<typeof catalogPage>[0]> = {}) =>
  catalogPage({
    t,
    money: moneyFormatter('en', 'EUR'),
    crumbs: [{ name: 'Shop', url: '/shop' }],
    description: null,
    base: '/shop',
    filters,
    result,
    perPage: 2,
    brands: new Map(),
    subcategories: new Map(),
    cards: {
      t,
      money: moneyFormatter('en', 'EUR'),
      url: (c) => `/product/${c.slug}`,
      addAction: '/cart/add',
    },
    css: '',
    ...extra,
  });

describe('the catalog page', () => {
  it('closes links right after their text (no `</a >`)', () => {
    const page = render();
    expect(page).toMatch(/rel="prev"\s*>←<span class="shop-sr"> Previous<\/span><\/a>/);
    expect(page).toMatch(/rel="next"\s*><span class="shop-sr">Next <\/span>→<\/a>/);
    expect(page).not.toMatch(/<\/a\s+>/);
  });

  it('shows "Load more" instead of the numbered pages when chosen', () => {
    const page = render({ loadMore: { script: '/plugins/shop/load-more.js' } });
    expect(page).toContain(
      '<a class="shop-button shop-button--secondary" href="/shop?page=3" rel="next" data-shop-more="">Load more</a>',
    );
    expect(page).toContain('<script src="/plugins/shop/load-more.js" defer></script>');
    expect(page).not.toContain('class="shop-pages"');
    // On the last page, nothing to load.
    const last = render({
      loadMore: { script: '/x.js' },
      filters: { ...filters, page: 5 },
    });
    expect(last).not.toContain('data-shop-more');
  });

  it('shows subcategory tiles and no products for a category that lists its subcategories', () => {
    const page = render({
      tiles: [
        { name: 'Lamps & co', url: '/product-category/home/lamps', imageUrl: null, count: 3 },
      ],
    });
    expect(page).toContain(
      '<a href="/product-category/home/lamps">Lamps &amp; co <span class="shop-count">(3)</span></a>',
    );
    expect(page).not.toContain('Product 1');
    expect(page).not.toContain('shop-filters');
  });
});

describe('order tracking', () => {
  it('reads order numbers as customers write them', () => {
    expect(orderNumberOf('1234')).toBe(1234);
    expect(orderNumberOf(' #77 ')).toBe(77);
    expect(orderNumberOf('0')).toBeNull();
    expect(orderNumberOf('12a')).toBeNull();
    expect(orderNumberOf('')).toBeNull();
    expect(orderNumberOf(5)).toBeNull();
  });
});
