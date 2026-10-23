import { describe, expect, it, vi } from 'vitest';
import { CART_CHANGED_EVENT, EMBED_JS } from './cart-api';
import {
  cartAddUrl,
  LINK_HEADERS,
  LINK_MAX_QUANTITY,
  limiter,
  linkQuantity,
  sharedLimiter,
  linkRefusal,
  readCartLink,
} from './cart-link';
import { cartUrls } from './public-api';

const ID = '0b6c2f5e-1d1a-4c7e-9a43-2f0f4c1e9b10';

describe('add-to-cart links', () => {
  it('builds the link in a language, with a capped quantity', () => {
    expect(cartAddUrl('', ID)).toBe(`/cart/add?product=${ID}`);
    expect(cartAddUrl('/it', ID, { quantity: 3, to: 'product' })).toBe(
      `/it/cart/add?product=${ID}&quantity=3&to=product`,
    );
    expect(cartAddUrl('', ID, { quantity: 500 })).toContain(`quantity=${LINK_MAX_QUANTITY}`);
    expect(cartAddUrl('//evil.example', ID)).toBe(`/cart/add?product=${ID}`);
    expect(cartAddUrl('', '42')).toBe('');
    expect(cartAddUrl('', `${ID}&coupon=x`)).toBe('');
    expect(cartUrls('/it').add).toBe('/it/cart/add');
  });

  it('reads the link, and WooCommerce’s add-to-cart', () => {
    expect(readCartLink({ product: ID })).toEqual({ productId: ID, quantity: 1, to: 'cart' });
    expect(readCartLink({ 'add-to-cart': ID.toUpperCase(), quantity: '4', to: 'product' })).toEqual(
      { productId: ID, quantity: 4, to: 'product' },
    );
    expect(readCartLink({ product: ID, to: 'https://evil.example' })?.to).toBe('cart');
    expect(readCartLink({ product: '123' })).toBeNull();
    expect(readCartLink({})).toBeNull();
  });

  it('adds 1 to 10 pieces per link', () => {
    expect(linkQuantity(undefined)).toBe(1);
    expect(linkQuantity('')).toBe(1);
    expect(linkQuantity('0')).toBe(1);
    expect(linkQuantity('-5')).toBe(1);
    expect(linkQuantity('abc')).toBe(1);
    expect(linkQuantity('2.9')).toBe(2);
    expect(linkQuantity('9999')).toBe(LINK_MAX_QUANTITY);
  });

  it('adds only from a page the visitor opens', () => {
    const page = {
      'sec-fetch-site': 'cross-site',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
      'user-agent': 'Mozilla/5.0 Firefox/140',
    };
    expect(linkRefusal('GET', page)).toBeNull();
    expect(linkRefusal('GET', {})).toBeNull();
    expect(
      linkRefusal('GET', { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' }),
    ).toBeNull();
    expect(linkRefusal('HEAD', page)).toBe('method');
    expect(
      linkRefusal('GET', { ...page, 'sec-fetch-dest': 'image', 'sec-fetch-mode': 'no-cors' }),
    ).toBe('cross-site');
    expect(
      linkRefusal('GET', { ...page, 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' }),
    ).toBe('cross-site');
    expect(linkRefusal('GET', { ...page, 'sec-purpose': 'prefetch;prerender' })).toBe('prefetch');
    expect(linkRefusal('GET', { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' })).toBe(
      'bot',
    );
    expect(linkRefusal('GET', { 'user-agent': 'facebookexternalhit/1.1' })).toBe('bot');
  });

  it('is never cached nor indexed', () => {
    expect(LINK_HEADERS['cache-control']).toContain('no-store');
    expect(LINK_HEADERS['x-robots-tag']).toContain('noindex');
  });

  it('limits the links of each visitor', () => {
    let now = 0;
    const allowed = limiter(2, 1000, () => now);
    expect(allowed('a')).toBe(true);
    expect(allowed('a')).toBe(true);
    expect(allowed('a')).toBe(false);
    expect(allowed('b')).toBe(true);
    now = 1001;
    expect(allowed('a')).toBe(true);
  });

  it('keeps the counts when the plugin is loaded again', () => {
    const first = sharedLimiter('test-reload', 1, 60_000);
    expect(first('a')).toBe(true);
    const again = sharedLimiter('test-reload', 1, 60_000);
    expect(again).toBe(first);
    expect(again('a')).toBe(false);
  });
});

describe('the cart blocks follow other scripts', () => {
  it('reads the cart again on cleishop:cart-changed', async () => {
    expect(CART_CHANGED_EVENT).toBe('cleishop:cart-changed');
    const listeners: Record<string, (() => void)[]> = {};
    const cart = {
      dataset: { shopEmbed: '/cart/data', shopKind: 'cart' } as Record<string, string>,
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      addEventListener: vi.fn(),
    };
    const document = {
      querySelectorAll: (selector: string) =>
        selector.includes('data-shop-kind') || selector === '[data-shop-embed]' ? [cart] : [],
      addEventListener: (name: string, fn: () => void) => (listeners[name] ??= []).push(fn),
    };
    const fetch = vi.fn(() => new Promise(() => {}));
    const window: Record<string, unknown> = {};
    const run = new Function('document', 'window', 'fetch', 'location', EMBED_JS);
    run(document, window, fetch, { href: 'https://shop.test/page' });
    run(document, window, fetch, { href: 'https://shop.test/page' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(listeners[CART_CHANGED_EVENT]).toHaveLength(1);
    listeners[CART_CHANGED_EVENT]![0]!();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String((fetch.mock.calls[1] as unknown[])[0])).toBe(
      'https://shop.test/cart/data?html=1',
    );
  });
});
