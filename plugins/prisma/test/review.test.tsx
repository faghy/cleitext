import type { CxdBlock } from '@cleitext/plugin-sdk';
import { expect, it } from 'vitest';
import { review } from '../src/blocks/review';
import type { Attrs, SpectraSource } from '../src/lib/types';
import { renderBlock, text } from './render';

const source = (html: string): SpectraSource => ({
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
  inner: (tag: string, cls: string) =>
    new RegExp(`<${tag}\\b[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)</${tag}>`).exec(
      html,
    )?.[1] ?? '',
  innerAny: (cls: string) =>
    new RegExp(`<(h[1-6]|p|div|span)\\b[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)</\\1>`).exec(
      html,
    )?.[2] ?? '',
});

it('draws the review with title link, texts, ratings, summary and partial stars', () => {
  const { html } = renderBlock(review, {
    rTitle: text('Great <place>'),
    rAuthor: text('– Anna'),
    ctaLink: 'https://example.com/r',
    ctaTarget: true,
    parts: [
      { label: 'Food', value: 5 },
      { label: 'Service', value: 4 },
    ],
  });
  expect(html).toContain(
    'class="wp-block-prisma-review pr-review pr-block-test0001 pr-review--multi"',
  );
  expect(html).toContain(
    '<a href="https://example.com/r" class="pr-review__link" target="_blank" rel="noopener noreferrer"><h3 class="pr-review__title">',
  );
  expect(html).toContain('<p class="pr-review__author">– Anna</p>');
  expect(html).toContain('<div class="pr-review__entry-label">Service</div>');
  expect(html).toContain('<span class="pr-review__rating">4.5</span>');
  // The fifth average star is half filled.
  expect(html).toMatch(/id="pr-review-test0001-average-4"><rect height="150" width="75"/);
  expect(html).toContain('class="pr-review__stars pr-review__average-stars"');
  expect(html).not.toContain('uagb');
});

it('writes the structured data as JSON-LD, with < escaped', () => {
  const { html } = renderBlock(review, {
    rTitle: text('A </script><b>'),
    brand: 'Acme',
    reviewPublisher: 'Blog',
    parts: [{ label: 'x', value: 3 }],
    mainimage: { url: '/media/a.jpg' },
  });
  const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
  expect(json).not.toContain('<');
  const data = JSON.parse(json);
  expect(data['@type']).toBe('Review');
  expect(data.itemReviewed).toMatchObject({
    '@type': 'Product',
    name: 'A </script><b>',
    brand: { '@type': 'Brand', name: 'Acme' },
    image: '/media/a.jpg',
  });
  expect(data.reviewRating).toEqual({
    '@type': 'Rating',
    ratingValue: 3,
    worstRating: 0,
    bestRating: 5,
  });
  expect(data.publisher).toEqual({ '@type': 'Organization', name: 'Blog' });
  expect(data.url).toBeUndefined();
  expect(renderBlock(review, { enableSchema: false }).html).not.toContain('ld+json');
});

it('pads the box like the page it replaces, per device', () => {
  const { css } = renderBlock(review, {
    topPadding: 0,
    bottomPadding: 0,
    paddingLeftMobile: 20,
    paddingRightMobile: 20,
    paddingTopMobile: 10,
    paddingBottomMobile: 0,
    titleColor: '#3f4344',
  });
  expect(css).toContain(
    '.pr-block-test0001 .pr-review__block{padding-top:0px;padding-bottom:0px;text-align:left}',
  );
  expect(css).toMatch(
    /@media[^{]*767px\)\{[^@]*\.pr-block-test0001 \.pr-review__block\{padding-left:20px;padding-right:20px;padding-top:10px;padding-bottom:0px\}/,
  );
  expect(css).toContain('.pr-block-test0001 .pr-review__block .pr-review__title{color:#3f4344}');
  expect(css).toContain('.pr-review__average-stars .pr-review__star{fill:#f0ad4e}');
  expect(css).toContain('path{stroke:#000000;fill:#ccd6df}');
  // The shared horizontal padding is the fallback of each side.
  expect(renderBlock(review, { contentHrPadding: 30 }).css).toContain('padding-left:30px');
});

it('imports a Spectra review with the texts of its saved HTML', () => {
  const html =
    '<div class="wp-block-uagb-review uagb-ratings__outer-wrap uagb-block-257527ec"><script type="application/ld+json">{}</script><div class="uagb_review_block"><a href="https://t.it" class="uagb-rating-link-wrapper" target="_blank" rel="noopener noreferrer"><h3 class="uagb-rating-title">Fenomenale!</h3></a><p class="uagb-rating-desc">Lo staff</p><p class="uagb-rating-author"><strong>–</strong> <strong>Giovanni A</strong></p><div class="uagb_review_summary"><p class="uagb_review_summary_title"></p><div class="uagb_review_overall_value"><p class="uagb_review_summary_desc"></p></div></div></div></div>';
  const [block] = review.spectra!['uagb/review']!(
    {
      parts: [{ label: '<b>Cibo</b>', value: 5 }],
      schema: '{}',
      enableImage: false,
      ctaLink: 'https://t.it',
    },
    source(html),
  );
  expect(block!.type).toBe('prisma/review');
  expect(block!.attrs).toMatchObject({
    rTitle: 'Fenomenale!',
    rAuthor: '<strong>–</strong> <strong>Giovanni A</strong>',
    summaryTitle: '',
    summaryDescription: '',
    parts: [{ label: 'Cibo', value: 5 }],
    mainimage: { url: '' },
  });
  expect(block!.attrs.schema).toBeUndefined();
});
