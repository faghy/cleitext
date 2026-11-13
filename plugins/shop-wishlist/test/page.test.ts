import { describe, expect, it } from 'vitest';
import { escapeHtml, listPage, shareLinks } from '../src/page';
import { strings } from '../src/strings';

describe('the wishlist page', () => {
  const t = strings('it');

  it('says when the list is empty, and links back to the shop', () => {
    const html = listPage({
      t,
      cards: '',
      count: 0,
      shared: false,
      prefix: '/it',
      share: '',
      shop: true,
    });
    expect(html).toContain('La tua lista desideri è vuota.');
    expect(html).toContain('href="/it/shop"');
    expect(
      listPage({ t, cards: '', count: 0, shared: true, prefix: '', share: '', shop: true }),
    ).toContain('data-wishlist-shared');
  });

  it('shows the cards with the count and the share box', () => {
    const html = listPage({
      t,
      cards: '<ul class="shop-grid"></ul>',
      count: 2,
      shared: false,
      prefix: '',
      share: shareLinks(t, 'https://shop.test/wishlist/shared/abc'),
      shop: true,
    });
    expect(html).toContain('2 prodotti');
    expect(html).toContain('Condividi la tua lista');
    expect(html).toContain('https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fshop.test');
    expect(html).toContain('data-wishlist-copy="https://shop.test/wishlist/shared/abc"');
  });

  it('escapes text', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
    expect(strings('en')('{n} products', { n: 3 })).toBe('3 products');
  });
});
