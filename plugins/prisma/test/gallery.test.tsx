import { describe, expect, it } from 'vitest';
import { gallery } from '../src/blocks/gallery';
import type { ViewProps } from '../src/lib/types';
import { renderBlock } from './render';

const ID = '0f8a6c3e-6a4b-4c1e-9d2f-1a2b3c4d5e6f';
const FULL = '/media/2026/10/photo.jpg';

/** The site's media: the original (1920px wide) and its resized copies. */
const media: ViewProps['media'] = (id) =>
  id === ID
    ? {
        url: FULL,
        width: 1920,
        height: 1280,
        variants: [400, 800, 1200, 1920].flatMap((w) => [
          { format: 'webp', url: `/media/2026/10/photo-${w}.webp`, width: w },
          { format: 'avif', url: `/media/2026/10/photo-${w}.avif`, width: w },
        ]),
      }
    : null;

const attrs = {
  mediaGallery: [{ id: ID, url: FULL, alt: 'A photo' }],
  columnsDesk: 3,
  columnsTab: 2,
  columnsMob: 1,
  imageClickEvent: 'lightbox',
};

describe('gallery images of the site', () => {
  it('serves the resized copies with srcset and sizes', () => {
    const { html } = renderBlock(gallery, attrs, { media });
    expect(html).toContain(
      'srcSet="/media/2026/10/photo-400.webp 400w, /media/2026/10/photo-800.webp 800w, /media/2026/10/photo-1200.webp 1200w, /media/2026/10/photo-1920.webp 1920w"',
    );
    expect(html).toContain('type="image/avif"');
    expect(html).toContain(
      'sizes="(max-width: 767px) calc(100vw * 1 / 1), (max-width: 1023px) calc(100vw * 1 / 2), calc(100vw * 1 / 3)"',
    );
    // The original stays the fallback of the thumbnail and the lightbox image.
    expect(html).toContain(`class="pr-gallery__img" src="${FULL}"`);
    expect(html).toContain(`data-src="${FULL}"`);
  });

  it('lightbox thumbnails are the smallest copy', () => {
    const { html } = renderBlock(gallery, { ...attrs, lightboxThumbnails: true }, { media });
    expect(html).toContain(
      'class="pr-lightbox__thumb" data-index="0" aria-label="Image 1"><img src="/media/2026/10/photo-400.webp"',
    );
  });

  it('images without copies keep the sizes saved with them', () => {
    const { html } = renderBlock(gallery, {
      ...attrs,
      mediaGallery: [
        {
          id: 7,
          url: 'https://example.com/photo.jpg',
          sizes: { large: { url: 'https://example.com/photo-1024x683.jpg' } },
        },
      ],
    });
    expect(html).toContain('srcSet="https://example.com/photo-1024x683.jpg"');
    expect(html).not.toContain('sizes=');
  });
});
