import type { CxdBlock } from '@cleitext/plugin-sdk';
import { expect, it } from 'vitest';
import { separator } from '../src/blocks/separator';
import type { Attrs, SpectraSource } from '../src/lib/types';
import { renderBlock } from './render';

it('draws a plain line with its width, height and margins', () => {
  const { html, css } = renderBlock(separator, { separatorColor: '#333' });
  expect(html).toBe(
    '<div class="wp-block-prisma-separator pr-separator pr-block-test0001"><div class="pr-separator__inner"></div></div>',
  );
  expect(css).toContain(
    '.pr-block-test0001.pr-separator:not(.pr-separator--text):not(.pr-separator--icon) .pr-separator__inner{-webkit-mask-size:5px 100%;border-top-width:3px;width:100%;border-top-color:#333;border-top-style:solid;margin-top:5px;margin-bottom:5px}',
  );
  expect(css).toContain('.pr-block-test0001.pr-separator{text-align:center}');
});

it('patterns are masks over a solid line', () => {
  const { html, css } = renderBlock(separator, { separatorStyle: 'leaves', separatorSize: 20 });
  expect(html).toContain('pr-separator--leaves');
  expect(css).toContain('-webkit-mask-size:20px 100%');
  expect(css).toContain('border-top-style:solid');
});

it('puts a text between two lines, with spacing and a wrapper for paddings', () => {
  const { html, css } = renderBlock(separator, {
    elementType: 'text',
    separatorText: 'Or <b>',
    elementPosition: 'left',
    blockTopPadding: 10,
    separatorWidthTablet: 50,
  });
  expect(html).toContain(
    '<div class="pr-separator__spacing"><div class="pr-separator__inner"><div class="pr-separator__element"><h4 class="pr-separator__text">Or &lt;b&gt;</h4></div></div></div>',
  );
  expect(html).toContain('pr-separator--text');
  expect(css).toContain('.pr-separator__inner::before{display:none}');
  expect(css).toContain('.pr-separator__element{margin-right:15px}');
  expect(css).toContain('.pr-block-test0001 .pr-separator__spacing{padding-top:10px}');
  expect(css).toMatch(
    /976px\)\{[^@]*\.pr-separator__inner\{width:50%;margin-left:auto;margin-right:auto\}/,
  );
});

it('imports a Spectra separator, its text read from the saved HTML', () => {
  const html =
    '<div class="wp-block-uagb-separator uagb-block-1 wp-block-uagb-separator--text"><div class="wp-block-uagb-separator__inner" style="--my-background-image:"><div class="wp-block-uagb-separator-element"><h4 class="uagb-html-tag">Divisore</h4></div></div></div>';
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
    inner: () => '',
    innerAny: () => '',
  };
  const [block] = separator.spectra!['uagb/separator']!({ elementType: 'text' }, src);
  expect(block).toMatchObject({
    type: 'prisma/separator',
    attrs: { elementType: 'text', separatorText: 'Divisore' },
  });
});
