import { expect, it } from 'vitest';
import { lottie, lottieConfig } from '../src/blocks/lottie';
import type { SpectraSource } from '../src/lib/types';
import { renderBlock } from './render';

it('marks the animation for the site’s player, with its settings', () => {
  const { html } = renderBlock(lottie, {
    lottieURl: 'https://example.com/a.json',
    align: 'right',
    loop: true,
    reverse: true,
    speed: 2,
    playOn: 'hover',
  });
  expect(html).toContain(
    'class="wp-block-prisma-lottie pr-lottie pr-block-test0001 pr-lottie--right"',
  );
  expect(html).toContain(
    'data-pr-lottie="{&quot;src&quot;:&quot;https://example.com/a.json&quot;,&quot;loop&quot;:true,&quot;speed&quot;:2,&quot;reverse&quot;:true,&quot;playOn&quot;:&quot;hover&quot;}"',
  );
});

it('plays backwards only when looping, and keeps only safe addresses', () => {
  expect(lottieConfig({ lottieURl: '/a.json', loop: false, reverse: true }).reverse).toBe(false);
  expect(lottieConfig({ jsonLottie: { url: '/b.json' }, lottieURl: '' }).src).toBe('/b.json');
  expect(lottieConfig({ lottieURl: 'javascript:alert(1)', playOn: 'x' })).toMatchObject({
    src: '',
    playOn: 'none',
  });
  const { html } = renderBlock(lottie, { lottieURl: '' });
  expect(html).not.toContain('data-pr-lottie');
});

it('writes size, background and alignment by device', () => {
  const { css } = renderBlock(lottie, {
    width: 300,
    height: 200,
    widthMob: 150,
    backgroundColor: '#eee',
    backgroundHColor: '#ddd',
  });
  const R = '.pr-block-test0001.pr-lottie';
  expect(css).toContain(
    `${R}{width:300px;height:200px;overflow:hidden;outline:none;background-color:#eee}`,
  );
  expect(css).toContain(`${R}:hover{background:#ddd}`);
  expect(css).toMatch(
    /@media \(max-width: ?767px\)\{\.pr-block-test0001\.pr-lottie\{width:150px\}/,
  );
});

it('imports a Spectra Lottie block', () => {
  const src = {
    html: '',
    children: [],
    block: (n: string, a: Record<string, unknown>) => ({
      id: 'x',
      type: `prisma/${n}`,
      v: 1,
      attrs: a,
    }),
    rich: (h: string) => [{ text: h }],
    inner: () => '',
    innerAny: () => '',
  } as unknown as SpectraSource;
  const [block] = lottie.spectra!['uagb/lottie']!(
    { lottieURl: 'https://example.com/x.json', playOn: 'scroll', heightMob: 100 },
    src,
  );
  expect(block).toMatchObject({
    type: 'prisma/lottie',
    attrs: { lottieURl: 'https://example.com/x.json', playOn: 'scroll', heightMob: 100 },
  });
});
