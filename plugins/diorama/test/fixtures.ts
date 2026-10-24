import {
  contentBox,
  defaultLayer,
  defaultSlide,
  defaultSlider,
  normalizeSlider,
} from '../src/model/normalize';
import type { SliderData } from '../src/model/types';
import type { RenderMedia } from '../src/render/render';

export const IMAGE_ID = '11111111-2222-4333-8444-555555555555';
export const IMAGE_2 = '11111111-2222-4333-8444-666666666666';

export const MEDIA = new Map<string, RenderMedia>([
  [
    IMAGE_ID,
    {
      id: IMAGE_ID,
      url: '/media/site/beach.jpg',
      width: 2400,
      height: 1600,
      alt: 'A beach at sunset',
      focalPoint: { x: 0.3, y: 0.7 },
      variants: [
        {
          variant: 'w800',
          format: 'webp',
          url: '/media/site/beach-800.webp',
          width: 800,
          height: 533,
        },
        {
          variant: 'w1600',
          format: 'webp',
          url: '/media/site/beach-1600.webp',
          width: 1600,
          height: 1066,
        },
        {
          variant: 'w800',
          format: 'avif',
          url: '/media/site/beach-800.avif',
          width: 800,
          height: 533,
        },
      ],
    },
  ],
]);

/** Three slides: a picture with a content box, a gradient, a YouTube video. */
export function sample(overrides: Partial<SliderData> = {}): SliderData {
  return normalizeSlider(
    defaultSlider({
      slides: [
        defaultSlide({
          id: 'one',
          name: 'Welcome',
          background: {
            ...defaultSlide().background,
            kind: 'image',
            image: { id: IMAGE_ID, url: '/media/site/beach.jpg' },
          },
          layers: [
            contentBox({
              heading: 'Hello',
              text: 'Line one\nLine two',
              button: 'Book',
              link: { kind: 'url', value: 'https://example.com/book' },
            }),
          ],
        }),
        defaultSlide({
          id: 'two',
          background: {
            ...defaultSlide().background,
            kind: 'image',
            image: { id: IMAGE_2, url: '/media/site/second.jpg' },
          },
          layers: [
            defaultLayer('heading', {
              id: 'h2',
              content: { ...defaultLayer('heading').content, text: 'Second <b>slide</b>' },
            }),
          ],
        }),
        defaultSlide({
          id: 'three',
          background: {
            ...defaultSlide().background,
            kind: 'video',
            video: {
              source: 'youtube',
              media: null,
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            },
          },
        }),
      ],
      ...overrides,
    }),
  );
}
