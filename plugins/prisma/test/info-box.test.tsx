import { describe, expect, it } from 'vitest';
import { infoBox } from '../src/blocks/info-box';
import { renderBlock } from './render';

describe('info box picture', () => {
  it('can share one proportion, cropped, so cards in a grid line up', () => {
    const image = { source_type: 'image', iconImage: { url: '/a.jpg' } };
    const { css } = renderBlock(infoBox, { ...image, imageRatio: '4/3' });
    expect(css).toContain('aspect-ratio:4 / 3;object-fit:cover;width:100%');
    expect(
      renderBlock(infoBox, { ...image, imageRatio: '1/1', imageFit: 'contain' }).css,
    ).toContain('object-fit:contain');
    expect(renderBlock(infoBox, image).css).not.toContain('aspect-ratio');
    expect(renderBlock(infoBox, { ...image, imageRatio: '4/3;color:red' }).css).not.toContain(
      'aspect-ratio',
    );
  });
});
