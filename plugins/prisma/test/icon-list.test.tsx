import { describe, expect, it } from 'vitest';
import { iconList, iconListItem, savedInner } from '../src/blocks/icon-list';
import type { SpectraSource } from '../src/lib/types';
import { renderBlock, text } from './render';

const source = (html = '', children: SpectraSource['children'] = []): SpectraSource => ({
  html,
  children,
  block: (n, a, c) => ({
    id: 'x',
    type: `prisma/${n}`,
    v: 1,
    attrs: a,
    ...(c ? { children: c } : {}),
  }),
  rich: (h) => [{ text: h.replace(/<[^>]+>/g, '') }],
  inner: () => '',
  innerAny: () => '',
});

describe('icon list', () => {
  it('wraps its items', () => {
    const { html } = renderBlock(iconList, {}, { children: '<p>item</p>' });
    expect(html).toBe(
      '<div class="wp-block-prisma-icon-list pr-icon-list pr-block-test0001"><div class="pr-icon-list__wrap"><div><p>item</p></div></div></div>',
    );
  });

  it('stacks the items by default, with the gap below each', () => {
    const { css } = renderBlock(iconList, {});
    const R = '.pr-block-test0001.pr-icon-list';
    expect(css).toContain(
      `${R} .pr-icon-list__wrap{display:flex;flex-direction:column;justify-content:center;align-items:flex-start}`,
    );
    expect(css).toContain(
      `${R} .pr-icon-list-item{margin-left:0;margin-right:0;margin-bottom:10px}`,
    );
    expect(css).toContain(`${R} .pr-icon-list__source-wrap{margin-right:15px}`);
  });

  it('lays the items in a row on desktop and stacks them on mobile', () => {
    const { css } = renderBlock(iconList, {
      icon_layout: 'horizontal',
      iconLayoutMobile: 'vertical',
      gap: 20,
      align: 'center',
      iconPlacement: 'after',
      border: 2,
      iconBorderColor: '#000',
    });
    const R = '.pr-block-test0001.pr-icon-list';
    expect(css).toContain(
      `${R} .pr-icon-list-item{margin-left:10px;margin-right:10px;display:inline-flex;text-align:center;flex-direction:row-reverse}`,
    );
    expect(css).toContain(`${R} .pr-icon-list-item:last-child{margin-right:0}`);
    expect(css).toContain('justify-content:center;align-items:center');
    expect(css).toContain(`${R} .pr-icon-list__source-wrap{margin-left:15px}`);
    expect(css).toContain(
      'border-color:#000;padding:0px;border-radius:0px;border-style:solid;border-width:2px',
    );
    expect(css).toMatch(
      /@media \(max-width: ?767px\)\{[^@]*\.pr-icon-list-item\{margin-left:0;margin-right:0;margin-bottom:20px\}/,
    );
  });

  it('turns Spectra lists into a list of items, the oldest ones from their attributes', () => {
    const child = { id: 'c', type: 'prisma/icon-list-item', v: 1, attrs: {} };
    const [b] = iconList.spectra!['uagb/icon-list']!({ gap: 5 }, source('', [child]));
    expect(b).toMatchObject({ attrs: { gap: 5 }, children: [child] });
    const [old] = iconList.spectra!['uagb/icon-list']!(
      {
        icon_count: 1,
        icons: [
          { label: 'One', icon: 'fab fa-facebook', link: '/a' },
          { label: 'Two', icon: 'star' },
        ],
      },
      source(),
    );
    expect(old!.attrs).not.toHaveProperty('icons');
    expect(old!.children).toHaveLength(1);
    expect(old!.children![0]).toMatchObject({
      type: 'prisma/icon-list-item',
      attrs: { label: 'One', icon: 'fab fa-facebook', link: '/a', disableLink: true },
    });
  });
});

describe('icon list item', () => {
  it('draws the list icon when it has none of its own, and its label', () => {
    const { html } = renderBlock(iconListItem, { label: text('Coffee'), fromParentIcon: 'star' });
    expect(html).toContain(
      '<div class="wp-block-prisma-icon-list-item pr-icon-list-item pr-block-test0001"><span class="pr-icon-list__source-wrap"><svg',
    );
    expect(html).toContain('<span class="pr-icon-list__label">Coffee</span>');
    expect(html).not.toContain('<a ');
  });

  it('covers the item with its link, and draws an image or nothing', () => {
    const linked = renderBlock(iconListItem, {
      label: text('Go'),
      disableLink: true,
      link: 'https://example.com',
      target: true,
    }).html;
    expect(linked).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer" aria-label="Go"> </a>',
    );
    const image = renderBlock(iconListItem, {
      image_icon: 'image',
      image: { url: '/m/a.png', alt: 'A' },
      imageSizeChild: 16,
      hideLabel: true,
    }).html;
    expect(image).toContain(
      '<img class="pr-icon-list__source-image" src="/m/a.png" width="16" loading="lazy" alt="A"/>',
    );
    expect(image).not.toContain('pr-icon-list__label');
    expect(renderBlock(iconListItem, { image_icon: 'none' }).html).not.toContain('source-wrap');
  });

  it('writes its own colors and spacing', () => {
    const { css } = renderBlock(iconListItem, { icon_color: '#f00', childTopMarginTablet: 4 });
    const R = '.pr-block-test0001.pr-icon-list-item';
    expect(css).toContain(
      `${R} .pr-icon-list__source-wrap svg{fill:#f00 !important;color:#f00 !important}`,
    );
    expect(css).toMatch(
      /@media \(max-width: ?976px\)\{[^@]*\.pr-icon-list-item\.pr-icon-list-item\.pr-icon-list-item\{margin-top:4px\}/,
    );
    expect(css).not.toContain('background');
  });

  it('imports Spectra items with the label of the saved HTML', () => {
    const html =
      '<div class="wp-block-uagb-icon-list-child uagb-block-1"><span class="uagb-icon-list__source-wrap"><svg></svg></span><span class="uagb-icon-list__label">Hot <span class="x">tea</span></span></div>';
    expect(savedInner(html, 'uagb-icon-list__label')).toBe('Hot <span class="x">tea</span>');
    const [b] = iconListItem.spectra!['uagb/icon-list-child']!({ icon: 'mug-hot' }, source(html));
    expect(b).toMatchObject({
      type: 'prisma/icon-list-item',
      attrs: { icon: 'mug-hot', label: 'Hot <span class="x">tea</span>' },
    });
    const [empty] = iconListItem.spectra!['uagb/icon-list-child']!({}, source('<div></div>'));
    expect(empty!.attrs.label).toBe('');
  });
});
