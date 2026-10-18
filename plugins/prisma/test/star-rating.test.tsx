import type { CxdBlock } from '@cleitext/plugin-sdk';
import { expect, it } from 'vitest';
import { starRating } from '../src/blocks/star-rating';
import type { Attrs, SpectraSource } from '../src/lib/types';
import { renderBlock, text } from './render';

it('draws the stars with the title and the partial fill', () => {
  const { html, css } = renderBlock(starRating, { title: text('Rating'), rating: 3.5 });
  expect(html).toContain(
    '<div class="wp-block-prisma-star-rating pr-star-rating pr-block-test0001"><p class="pr-star-rating__title">Rating</p><div class="pr-star-rating__stars" title="3.5/5"><span class="pr-star-rating__star">★</span>',
  );
  expect(html.match(/pr-star-rating__star"/g)).toHaveLength(5);
  expect(css).toContain('.pr-star-rating__star:nth-child(-n+3){color:#f0ad4e}');
  expect(css).toContain(
    ".pr-star-rating__star:nth-child(4)::before{color:#f0ad4e;width:50%;position:absolute;content:'★';overflow:hidden}",
  );
  expect(css).toContain(
    '.pr-block-test0001.pr-star-rating{flex-direction:row;justify-content:flex-start}',
  );
  expect(css).toContain('.pr-block-test0001 .pr-star-rating__title{margin-right:10px}');
  expect(css).toContain('.pr-block-test0001 .pr-star-rating__stars{font-size:18px}');
});

it('stacks and aligns by device, the gap on the side facing the stars', () => {
  const { css } = renderBlock(starRating, {
    layout: 'stack',
    starPosition: 'before',
    align: 'center',
    layoutMobile: 'stack',
    alignMobile: 'right',
  });
  expect(css).toContain(
    '.pr-block-test0001.pr-star-rating{flex-direction:column-reverse;align-items:center}',
  );
  expect(css).toContain('.pr-star-rating__title{margin-top:10px}');
  expect(css).toMatch(/767px\)\{[^@]*flex-direction:column;align-items:flex-end/);
  const reversed = renderBlock(starRating, { starPosition: 'before', align: 'left' }).css;
  expect(reversed).toContain('flex-direction:row-reverse;justify-content:flex-end');
});

it('imports a Spectra star rating with its title', () => {
  const html =
    '<div class="wp-block-uagb-star-rating uagb-block-1"><p class="uag-star-rating__title">Voto</p><div class="uag-star-rating" title="4/5"></div></div>';
  const src: SpectraSource = {
    html,
    children: [],
    block: (n: string, a: Attrs, c?: CxdBlock[]) => ({
      id: 'x',
      type: `prisma/${n}`,
      v: 1,
      attrs: a,
      ...(c ? { children: c } : {}),
    }),
    rich: (h: string) => [{ text: h.replace(/<[^>]+>/g, '') }],
    inner: () => 'Voto',
    innerAny: () => '',
  };
  const [block] = starRating.spectra!['uagb/star-rating']!({ rating: 4, size: 24 }, src);
  expect(block).toMatchObject({
    type: 'prisma/star-rating',
    attrs: { rating: 4, size: 24, title: 'Voto' },
  });
});
