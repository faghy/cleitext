import { describe, expect, it } from 'vitest';
import { restaurantMenu, restaurantMenuItem } from '../src/blocks/restaurant-menu';
import type { Attrs } from '../src/lib/types';
import { renderBlock, text } from './render';

const source = (html = '') => ({
  html,
  children: [],
  block: (n: string, a: Attrs, c?: unknown[]) => ({
    id: 'x',
    type: 'prisma/' + n,
    v: 1,
    attrs: a,
    ...(c ? { children: c } : {}),
  }),
  rich: (h: string) => [{ text: h.replace(/<[^>]+>/g, '') }],
  inner: (tag: string, className: string) =>
    new RegExp(`<${tag}\\b[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)</${tag}>`).exec(
      html,
    )?.[1] ?? '',
  innerAny: (className: string) =>
    new RegExp(
      `<(h[1-6]|p|div|span)\\b[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)</\\1>`,
    ).exec(html)?.[2] ?? '',
});

describe('price list', () => {
  it('draws the grid with its columns by device', () => {
    const { html } = renderBlock(restaurantMenu, { columns: 3 }, { children: '<i>items</i>' });
    expect(html).toContain(
      'class="wp-block-prisma-restaurant-menu pr-restaurant-menu pr-block-test0001 pr-restaurant-menu--desktop-3 pr-restaurant-menu--tablet-2 pr-restaurant-menu--mobile-1"',
    );
    expect(html).toContain('<i>items</i>');
  });

  it('writes the CSS of the defaults', () => {
    const { css } = renderBlock(restaurantMenu, {});
    const B = '.pr-block-test0001';
    expect(css).toContain(
      `${B}.pr-restaurant-menu{column-gap:10px;row-gap:10px;grid-template-columns:auto auto}`,
    );
    expect(css).toContain(
      `${B} .pr-restaurant-menu-item img{padding-left:10px;padding-right:10px;width:100px;max-width:100px}`,
    );
    expect(css).toContain(
      `${B} .pr-restaurant-menu-item .pr-restaurant-menu-item__separator{border-top-color:#b2b4b5;border-top-style:dashed;border-top-width:1px;width:100%}`,
    );
    expect(css).toContain(
      `${B} .pr-restaurant-menu-item .pr-restaurant-menu-item__content{align-items:flex-start;display:inline-flex}`,
    );
    expect(css).toContain(`${B} .pr-restaurant-menu-item__details{text-align:left}`);
    expect(css).toContain(`${B} .pr-restaurant-menu-item__title{line-height:1em}`);
    expect(css).toContain(
      `${B} .pr-restaurant-menu-item__desc{line-height:1em;color:#333;margin-bottom:15px}`,
    );
    // Stacked from tablets: the picture above the text.
    expect(css).toMatch(/max-width: ?976px\)\{[^@]*__content\{display:block;text-align:left\}/);
    expect(css).toMatch(/max-width: ?976px\)\{[^@]*row-gap:10px;grid-template-columns:auto auto\}/);
    expect(css).toMatch(
      /max-width: ?767px\)\{[^@]*padding-bottom:10px;width:100px;max-width:100px/,
    );
  });

  it('centers the items with the picture on top', () => {
    const { css } = renderBlock(restaurantMenu, { imgAlign: 'top', headingAlign: 'center' });
    const I = '.pr-block-test0001 .pr-restaurant-menu-item';
    expect(css).toContain(`${I}{text-align:center;display:block}`);
    expect(css).toContain(
      `${I} .pr-restaurant-menu-item__separator{border-top-color:#b2b4b5;border-top-style:dashed;border-top-width:1px;width:100%;margin:0 auto}`,
    );
  });

  it('draws an item with the picture on the side and the price after the text', () => {
    const { html } = renderBlock(restaurantMenuItem, {
      title: text('Pizza'),
      description: text('Tomato'),
      price: text('€8'),
      image: {
        url: 'https://e.com/p.jpg',
        alt: 'Pizza',
        sizes: { medium: { url: 'https://e.com/p-300.jpg' } },
      },
    });
    expect(html).toBe(
      '<div class="wp-block-prisma-restaurant-menu-item pr-restaurant-menu-item pr-block-test0001"><div class="pr-restaurant-menu-item__content"><img class="pr-restaurant-menu-item__image" src="https://e.com/p-300.jpg" alt="Pizza" width="100" loading="lazy"/><div class="pr-restaurant-menu-item__details"><h4 class="pr-restaurant-menu-item__title">Pizza</h4><div class="pr-restaurant-menu-item__desc">Tomato</div></div><span class="pr-restaurant-menu-item__price">€8</span></div><div class="pr-restaurant-menu-item__separator"></div></div>',
    );
  });

  it('orders the parts by the layout', () => {
    const right = renderBlock(restaurantMenuItem, {
      imagePosition: 'right',
      image: { url: 'https://e.com/p.jpg' },
    }).html;
    expect(right.indexOf('__price')).toBeLessThan(right.indexOf('__details'));
    expect(right.indexOf('__details')).toBeLessThan(right.indexOf('<img'));
    const top = renderBlock(restaurantMenuItem, {
      imgAlign: 'top',
      headingAlign: 'center',
      image: { url: 'https://e.com/p.jpg' },
      showImage: false,
    }).html;
    expect(top).not.toContain('<img');
    expect(top).toMatch(
      /__details">.*__price.*<\/div><\/div><div class="pr-restaurant-menu-item__separator/,
    );
  });

  it('imports Spectra price lists and their items with the texts of the page', () => {
    const [group] = restaurantMenu.spectra!['uagb/restaurant-menu']!(
      { columns: 3 },
      source() as never,
    );
    expect(group!.type).toBe('prisma/restaurant-menu');
    expect((group!.attrs as Attrs).columns).toBe(3);
    const html =
      '<div class="wp-block-uagb-restaurant-menu-child uagb-rest_menu__wrap"><div class="uagb-rm__content"><img class="" src="https://e.com/p-300x200.jpg" alt=""/><div class="uagb-rm-details"><h3 class="uagb-rm__title">Pasta</h3><div class="uagb-rm__desc">With <em>sauce</em></div></div><span class="uagb-rm__price">€9</span></div><div class="uagb-rm__separator"></div></div>';
    const [item] = restaurantMenuItem.spectra!['uagb/restaurant-menu-child']!(
      { headingTag: 'h3', image: { id: 5, url: 'https://e.com/p.jpg' } },
      source(html) as never,
    );
    const attrs = item!.attrs as Attrs;
    expect(item!.type).toBe('prisma/restaurant-menu-item');
    expect(attrs.title).toBe('Pasta');
    expect(attrs.description).toBe('With <em>sauce</em>');
    expect(attrs.price).toBe('€9');
    expect(attrs.image).toEqual({ id: 5, url: 'https://e.com/p-300x200.jpg' });
  });

  it('leaves Spectra placeholder pictures behind', () => {
    const html = '<img src="https://e.com/wp-content/plugins/x/uag-placeholder.svg"/>';
    const [item] = restaurantMenuItem.spectra!['uagb/restaurant-menu-child']!(
      {},
      source(html) as never,
    );
    expect((item!.attrs as Attrs).image).toBe('');
  });
});
