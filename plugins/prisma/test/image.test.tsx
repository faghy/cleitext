import { expect, it } from 'vitest';
import { image } from '../src/blocks/image';
import { fromSpectra } from '../src/import';
import { renderBlock } from './render';

it('on tablets and phones without their own height, a picture keeps its proportions', () => {
  // A room photo boxed at 400×500 on computers (Spectra: height only on desktop, cover).
  const [block] = fromSpectra(
    'uagb/image',
    {
      block_id: '94a7b009',
      url: 'https://old.example/wp-content/uploads/2025/04/18-1024x768.webp',
      urlMobile: 'https://old.example/wp-content/uploads/2025/04/18.webp',
      id: 43,
      width: 400,
      height: 500,
      naturalWidth: 1024,
      naturalHeight: 683,
      objectFit: 'cover',
      customHeightSetDesktop: true,
    },
    '<div class="wp-block-uagb-image uagb-block-94a7b009"><figure class="wp-block-uagb-image__figure"><img src="https://old.example/wp-content/uploads/2025/04/18-1024x768.webp" alt=""/></figure></div>',
    [],
  )!;
  const { css } = renderBlock(image, block!.attrs);
  const img = '.pr-block-test0001 .pr-image__figure img';
  // Computers: the box of the attributes, cropped.
  expect(css).toContain(
    `${img}{box-shadow:0px 0px 0 #00000070;object-fit:cover;width:400px;height:500px;aspect-ratio:400 / 500}`,
  );
  // Tablets and phones: automatic height and the file's own proportions, not 4:5.
  const mobile = css.slice(css.indexOf('@media (max-width:767px)'));
  expect(mobile).toContain(`${img}{width:400px;height:auto;aspect-ratio:auto 1024 / 683}`);
});

it('keeps the box on phones with their own height, and the attributes when none is set', () => {
  const boxed = renderBlock(image, {
    url: '/a.webp',
    width: 400,
    height: 500,
    heightMobile: 300,
    customHeightSetDesktop: true,
    customHeightSetMobile: true,
  }).css;
  // Phones: their own box (an explicit height wins over any ratio).
  expect(boxed).toContain(
    '@media (max-width:767px){.pr-block-test0001 .pr-image__figure img{width:400px;height:300px}}',
  );
  const plain = renderBlock(image, { url: '/a.webp', width: 600, height: 500 }).css;
  expect(plain).toContain('aspect-ratio:600 / 500');
  expect(plain).not.toContain('aspect-ratio:auto');
});
