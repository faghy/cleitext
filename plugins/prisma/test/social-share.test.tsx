import { describe, expect, it } from 'vitest';
import { shareHref, socialShare, socialShareItem } from '../src/blocks/social-share';
import type { Attrs } from '../src/lib/types';
import { renderBlock } from './render';

const source = (html = '', children: unknown[] = []) => ({
  html,
  children,
  block: (n: string, a: Attrs, c?: unknown[]) => ({
    id: 'x',
    type: 'prisma/' + n,
    v: 1,
    attrs: a,
    ...(c ? { children: c } : {}),
  }),
  rich: (h: string) => [{ text: h.replace(/<[^>]+>/g, '') }],
  inner: () => '',
  innerAny: () => '',
});

describe('social share', () => {
  it('draws the group with its layout and the items inside', () => {
    const { html } = renderBlock(
      socialShare,
      { social_layout: 'vertical' },
      { children: '<i>items</i>' },
    );
    expect(html).toContain(
      'class="wp-block-prisma-social-share pr-social-share pr-social-share--layout-vertical pr-block-test0001"',
    );
    expect(html).toContain('<i>items</i>');
  });

  it('writes sizes, gaps, colors and alignment by device', () => {
    const { css } = renderBlock(socialShare, {
      gap: 20,
      gapMobile: 6,
      sizeTablet: 24,
      alignMobile: 'left',
      borderRadius: 50,
    });
    const B = '.pr-block-test0001';
    expect(css).toContain(`${B} .pr-social-share-item .pr-social-share-item__link{color:#3a3a3a}`);
    expect(css).toContain(
      `${B}.pr-social-share--layout-horizontal .pr-social-share-item{margin-left:10px;margin-right:10px}`,
    );
    expect(css).toContain(
      `${B} .pr-social-share-item__source-icon{width:30px;height:30px;font-size:30px}`,
    );
    expect(css).toContain(`${B} .pr-social-share-item{border-radius:50px}`);
    expect(css).toMatch(
      /max-width: ?976px\)\{[^@]*source-wrap\{width:24px;height:24px;line-height:24px\}/,
    );
    expect(css).toMatch(
      /max-width: ?767px\)\{[^@]*layout-horizontal \.pr-social-share-item\{margin-left:3px;margin-right:3px\}/,
    );
    expect(css).toMatch(
      /max-width: ?767px\)\{[^@]*\.pr-social-share\{justify-content:flex-start;align-items:flex-start\}/,
    );
  });

  it('stacks horizontal links from the chosen device', () => {
    const { css } = renderBlock(socialShare, { stack: 'tablet', gapTablet: 8 });
    expect(css).toMatch(
      /max-width: ?976px\)\{[^@]*\.pr-social-share\{flex-direction:column;justify-content:center;align-items:center\}/,
    );
    expect(css).toMatch(/max-width: ?976px\)\{[^@]*margin-left:0;margin-right:0;margin-bottom:8px/);
    expect(css.split('@media')[0]).not.toContain('flex-direction:column');
  });

  it('draws an item as a share link of the page', () => {
    const { html } = renderBlock(socialShareItem, { type: 'linkedin', icon: 'linkedin' });
    expect(html).toContain(
      'class="wp-block-prisma-social-share-item pr-social-share-item pr-block-test0001"',
    );
    expect(html).toContain('href="https://www.linkedin.com/sharing/share-offsite/?url="');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('aria-label="Share on LinkedIn"');
    expect(html).toContain('<span class="pr-social-share-item__source-icon"><svg');
    expect(html).not.toContain('uagb');
  });

  it('builds the share addresses with the page address', () => {
    expect(shareHref('facebook', { url: 'https://e.com/a b', image: '' })).toBe(
      'https://www.facebook.com/sharer.php?u=https%3A%2F%2Fe.com%2Fa%20b',
    );
    expect(shareHref('pinterest', { url: '/p', image: '/i.jpg' })).toBe(
      'https://pinterest.com/pin/create/link/?url=%2Fp&media=%2Fi.jpg',
    );
    expect(shareHref('email', { url: '/p', image: '' })).toBe('mailto:?body=%2Fp');
  });

  it('opens email in the same window and shows an image when chosen', () => {
    const { html } = renderBlock(socialShareItem, {
      type: 'email',
      image_icon: 'image',
      image: { url: 'https://e.com/m.png', alt: 'Mail' },
    });
    expect(html).not.toContain('target=');
    expect(html).toContain(
      '<img class="pr-social-share-item__source-image" src="https://e.com/m.png" alt="Mail" width="30"',
    );
  });

  it('writes the item colors inside the group', () => {
    const { css } = renderBlock(socialShareItem, {
      icon_color: '#f00',
      icon_bg_hover_color: '#00f',
    });
    expect(css).toContain(
      '.pr-social-share .pr-block-test0001.pr-social-share-item .pr-social-share-item__link{color:#f00}',
    );
    expect(css).toContain(
      '.pr-social-share .pr-block-test0001.pr-social-share-item:hover{background:#00f}',
    );
  });

  it('imports the group, turning an older list of networks into items', () => {
    const [group] = socialShare.spectra!['uagb/social-share']!(
      {
        social_count: 2,
        socials: [
          { type: 'facebook', image_icon: 'icon', icon: 'facebook' },
          { type: 'twitter', image_icon: 'icon', icon: 'twitter', icon_color: '#000' },
          { type: 'email', image_icon: 'icon', icon: 'envelope' },
        ],
      },
      source() as never,
    );
    expect(group!.type).toBe('prisma/social-share');
    expect((group!.attrs as Attrs).socials).toBeUndefined();
    expect(group!.children).toHaveLength(2);
    expect((group!.children![1]!.attrs as Attrs).icon_color).toBe('#000');
    const [item] = socialShareItem.spectra!['uagb/social-share-child']!(
      { type: 'whatsapp', icon: 'whatsapp' },
      source() as never,
    );
    expect(item!.type).toBe('prisma/social-share-item');
    expect((item!.attrs as Attrs).type).toBe('whatsapp');
  });
});
