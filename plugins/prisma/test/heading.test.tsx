import { expect, it } from 'vitest';
import { heading } from '../src/blocks/heading';
import { fromSpectra } from '../src/import';
import { renderBlock, text } from './render';

it('draws a heading with its description and CSS (example of a block test)', () => {
  const { html, css } = renderBlock(heading, {
    headingTitle: text('Hello'),
    headingDesc: text('World'),
    headingDescToggle: true,
    headingAlign: 'center',
  });
  expect(html).toContain('<h2 class="pr-heading__text">Hello</h2>');
  expect(html).toContain('World');
  expect(css).toContain('.pr-block-test0001');
});

it("keeps Spectra's highlighted words with their colors, background and spacing", () => {
  const [block] = fromSpectra(
    'uagb/advanced-heading',
    {
      block_id: 'abc12345',
      headingDescToggle: true,
      highLightColor: '#111111',
      highLightBackground: '#ffee00',
      highLightTopPaddingMobile: 2,
      highLightPaddingUnitMobile: 'px',
    },
    '<div class="wp-block-uagb-advanced-heading uagb-block-abc12345"><h2 class="uagb-heading-text">Benvenuti <mark class="uagb-highlight">da Milly</mark></h2><p class="uagb-desc-text">A due <mark class="uagb-highlight">passi</mark> dal mare</p></div>',
    [],
  )!;
  expect(block!.attrs.headingTitle).toEqual([
    { text: 'Benvenuti ' },
    { text: 'da Milly', marks: ['highlight'] },
  ]);
  const { html, css } = renderBlock(heading, block!.attrs);
  expect(html).toContain('<h2 class="pr-heading__text">Benvenuti <mark>da Milly</mark></h2>');
  expect(html).toContain('A due <mark>passi</mark> dal mare');
  expect(css).toContain(
    '.pr-block-test0001.pr-heading mark:not(.has-inline-color){background:#ffee00;color:#111111;-webkit-text-fill-color:#111111',
  );
  expect(css).toMatch(
    /@media \(max-width:767px\)\{[^@]*mark:not\(\.has-inline-color\)\{padding-top:2px/,
  );
});
