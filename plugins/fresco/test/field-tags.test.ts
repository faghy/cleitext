import { describe, expect, it } from 'vitest';
import { fieldTagValue, resolveFieldTags } from '../src/core/field-tags.js';

/** The core's dynamic sources (plugin API 1.47), as a page of the tests has them. */
const SOURCES: Record<string, unknown> = {
  'entry.field:photo': {
    id: 'm1',
    url: '/media/s/m1.webp',
    alt: 'A dog',
    width: 40,
    height: 30,
    sizes: {},
  },
  'entry.field:details.subtitle': 'Fresh <bread>',
  'entry.field:price': 12,
  'entry.field:open': true,
  'entry.field:tags': ['a', 'b'],
  'entry.field:site': 'https://example.com',
};
const resolve = (id: string) => Promise.resolve(SOURCES[id]);

describe('the "Custom field" tag', () => {
  it('gives an image field as an image (a media id formatted by the core)', async () => {
    const out = await resolveFieldTags(
      {
        image: { id: null, url: '/old.png' },
        __dynamic: { image: { tag: 'field', kind: 'media', key: 'photo' } },
      },
      resolve,
    );
    expect(out.image).toEqual({ id: 'm1', url: '/media/s/m1.webp', alt: 'A dog' });
    // Taken out: Fresco Pro's resolver does not see it again.
    expect(out.__dynamic).toBeUndefined();
  });

  it('gives texts with before and after, escaped in rich text, and links', async () => {
    const out = await resolveFieldTags(
      {
        title: 'Fixed',
        text: '<p>x</p>',
        link: { url: '/old', target: '_blank' },
        caption: 'Kept',
        __dynamic: {
          title: { tag: 'field', kind: 'text', key: 'details.subtitle', before: '« ', after: ' »' },
          text: { tag: 'field', kind: 'richtext', key: 'details.subtitle' },
          link: { tag: 'field', kind: 'url', key: 'site' },
          caption: { tag: 'post-title', kind: 'text' },
        },
      },
      resolve,
    );
    expect(out.title).toBe('« Fresh <bread> »');
    expect(out.text).toBe('<p>Fresh &lt;bread></p>');
    expect(out.link).toEqual({ url: 'https://example.com', target: '_blank' });
    // Other tags stay for Fresco Pro.
    expect(out.__dynamic).toEqual({ caption: { tag: 'post-title', kind: 'text' } });
  });

  it('uses the fallback alone, or keeps the fixed value without one', async () => {
    const out = await resolveFieldTags(
      {
        a: 'Fixed A',
        b: 'Fixed B',
        __dynamic: {
          a: { tag: 'field', kind: 'text', key: 'missing', before: '>', fallback: 'None' },
          b: { tag: 'field', kind: 'text', key: 'missing' },
        },
      },
      resolve,
    );
    expect(out).toEqual({ a: 'None', b: 'Fixed B' });
  });

  it('turns values into the kind of the setting', () => {
    expect(fieldTagValue(12, 'text')).toBe('12');
    expect(fieldTagValue(true, 'text')).toBe('✓');
    expect(fieldTagValue(['a', 'b'], 'text')).toBe('a, b');
    expect(fieldTagValue({ url: '/x.png', id: 'm' }, 'url')).toBe('/x.png');
    expect(fieldTagValue('/photo.jpg', 'media')).toEqual({ id: null, url: '/photo.jpg' });
    expect(fieldTagValue('not an image', 'media')).toBeUndefined();
    expect(fieldTagValue(null, 'text')).toBeUndefined();
  });

  it('leaves settings without field tags as they are', async () => {
    const attrs = { title: 'x', __dynamic: { title: { tag: 'post-title', kind: 'text' } } };
    expect(await resolveFieldTags(attrs, resolve)).toBe(attrs);
  });
});
