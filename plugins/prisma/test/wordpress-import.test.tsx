import type { CxdBlock } from '@cleitext/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { container } from '../src/blocks/container';
import { convertAttrs, fromCover } from '../src/import';
import { renderBlock } from './render';

const paragraph: CxdBlock = {
  id: 'p',
  type: 'core/paragraph',
  v: 1,
  attrs: {},
  content: [{ text: 'Hello' }],
};
const image: CxdBlock = { id: 'i', type: 'core/image', v: 1, attrs: { url: '/a.webp' } };
const group = (children: CxdBlock[]): CxdBlock => ({
  id: 'g',
  type: 'core/group',
  v: 1,
  attrs: {},
  children,
});

describe('WordPress covers', () => {
  it('become a container with the image, the overlay, the height and the content position', () => {
    const [block] = fromCover(
      {
        url: 'https://old.example/a.webp',
        id: 907,
        focalPoint: { x: 0, y: 0.4 },
        minHeight: 100,
        minHeightUnit: 'vh',
        contentPosition: 'top center',
        align: 'full',
        style: { spacing: { padding: { top: '0', bottom: '0' } } },
      },
      '<div class="wp-block-cover"><span class="wp-block-cover__background has-background-dim-20 has-background-dim"></span></div>',
      [group([image, paragraph])],
    );
    expect(block!.type).toBe('prisma/container');
    expect(block!.children).toEqual([paragraph]);
    expect(block!.attrs).toMatchObject({
      isBlockRootParent: true,
      contentWidth: 'alignfull',
      backgroundType: 'image',
      backgroundImageDesktop: { id: 907, url: 'https://old.example/a.webp' },
      backgroundPositionDesktop: { x: 0, y: 0.4 },
      overlayType: 'color',
      backgroundImageColor: '#000000',
      overlayOpacity: 0.2,
      minHeightDesktop: 100,
      minHeightType: 'vh',
      justifyContentDesktop: 'flex-start',
      alignItemsDesktop: 'stretch',
      topPaddingDesktop: 0,
      bottomPaddingDesktop: 0,
      className: 'pr-cover-dark',
    });
  });

  it('without an image, show the overlay color as the background, 430px tall', () => {
    const [block] = fromCover({ customOverlayColor: '#123456', dimRatio: 50, isDark: false }, '', [
      group([paragraph]),
    ]);
    expect(block!.attrs).toMatchObject({
      backgroundType: 'color',
      backgroundColor: 'rgba(18,52,86,0.5)',
      minHeightDesktop: 430,
      minHeightType: 'px',
      contentWidth: 'default',
    });
    expect(block!.attrs.className).toBeUndefined();
  });
});

describe('WordPress block settings on Spectra blocks', () => {
  it('keep hiding by device with WordPress breakpoints, and the additional classes', () => {
    const attrs = convertAttrs({
      block_id: 'abc12345',
      className: 'clickable-card bad"class',
      metadata: { blockVisibility: { viewport: { desktop: false, tablet: false } } },
    });
    expect(attrs.viewportHidden).toEqual(['desktop', 'tablet']);
    const { html } = renderBlock(container, attrs);
    expect(html).toContain('clickable-card');
    expect(html).toContain('pr-viewport-hide-desktop pr-viewport-hide-tablet');
    expect(html).not.toContain('bad');
  });
});
