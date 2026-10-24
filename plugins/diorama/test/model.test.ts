import { describe, expect, it } from 'vitest';
import {
  aliasOf,
  defaultLayer,
  defaultSlider,
  LIMITS,
  link,
  mediaIdsOf,
  normalizeLayer,
  normalizeSlider,
} from '../src/model/normalize';
import { expandPosts, fillTags, shorten } from '../src/model/posts';
import { layerPos, layerStyle, resetFor, setFor, valueFor } from '../src/model/resolve';
import { quickSlider, TEMPLATES, templateSlider } from '../src/model/templates';
import { IMAGE_ID, sample } from './fixtures';

describe('normalization', () => {
  it('turns anything into a complete slider with defaults', () => {
    for (const input of [null, 42, 'x', [], {}, { slides: 'no' }]) {
      const slider = normalizeSlider(input);
      expect(slider.v).toBe(1);
      expect(slider.type).toBe('slider');
      expect(slider.slides).toEqual([]);
      expect(slider.size.base.height).toBe(600);
    }
  });

  it('bounds numbers, drops unknown values and keeps only known keys', () => {
    const slider = normalizeSlider({
      type: 'carousel',
      layout: 'fullscreen',
      transition: { effect: 'explode', duration: 99_999 },
      autoplay: { delay: 10 },
      navigation: { color: 'red; background:url(x)', size: 500 },
      evil: true,
      slides: [
        {
          layers: [
            { type: 'heading', style: { base: { fontSize: 9999, color: '#ABCDEF', bogus: 1 } } },
            { type: 'script' },
          ],
        },
      ],
    });
    expect(slider.type).toBe('slider');
    expect(slider.layout).toBe('fullscreen');
    expect(slider.transition.effect).toBe('fade');
    expect(slider.transition.duration).toBe(4000);
    expect(slider.autoplay.delay).toBe(1500);
    expect(slider.navigation.color).toBe('#ffffff');
    expect(slider.navigation.size).toBe(80);
    expect(slider).not.toHaveProperty('evil');
    const layers = slider.slides[0]!.layers;
    expect(layers).toHaveLength(1);
    expect(layers[0]!.style.base.fontSize).toBe(240);
    expect(layers[0]!.style.base.color).toBe('#abcdef');
    expect(layers[0]!.style.base).not.toHaveProperty('bogus');
  });

  it('keeps only the valid per-device overrides', () => {
    const layer = normalizeLayer({
      type: 'text',
      style: {
        base: { fontSize: 30 },
        tablet: { fontSize: 24, nope: 1 },
        mobile: { color: 'nonsense', fontSize: 'x' },
      },
      pos: { base: { x: 10 }, mobile: {} },
    })!;
    expect(layer.style.tablet).toEqual({ fontSize: 24 });
    // Invalid values fall back to the larger device's, and stay as overrides only when given.
    expect(layer.style.mobile).toEqual({ color: '#ffffff', fontSize: 24 });
    expect(layer.pos.mobile).toBeUndefined();
  });

  it('gives slides and layers unique ids, and never nests boxes', () => {
    const slider = normalizeSlider({
      slides: [
        {
          id: 'same',
          layers: [
            { id: 'dup', type: 'text' },
            { id: 'dup', type: 'box', children: [{ type: 'box' }, { type: 'button' }] },
          ],
        },
        { id: 'same' },
      ],
    });
    expect(slider.slides[0]!.id).not.toBe(slider.slides[1]!.id);
    const [a, b] = slider.slides[0]!.layers;
    expect(a!.id).not.toBe(b!.id);
    expect(b!.children.map((c) => c.type)).toEqual(['button']);
  });

  it('keeps links and media safe', () => {
    expect(link({ kind: 'url', value: 'javascript:alert(1)' }).value).toBe('');
    expect(link({ kind: 'url', value: 'example.com/x' }).value).toBe('https://example.com/x');
    expect(link({ kind: 'phone', value: '+39 010 123-456' }).value).toBe('+39010123456');
    expect(link({ kind: 'email', value: 'a@b' }).value).toBe('');
    expect(link({ kind: 'scroll', value: '#contacts' }).value).toBe('#contacts');
    expect(link({ kind: 'scroll', value: '#x"><script>' }).value).toBe('');
    expect(link({ kind: 'page', value: '/about', entryId: 'not-a-uuid' })).toEqual({
      kind: 'page',
      value: '/about',
    });
    const layer = normalizeLayer({
      type: 'image',
      content: { media: { id: 'x', url: '//evil.example/a.jpg' } },
    })!;
    expect(layer.content.media).toBeNull();
  });

  it('keeps other plugins’ data within a size limit', () => {
    expect(normalizeSlider({ ext: { pro: { type: 'carousel' } } }).ext).toEqual({
      pro: { type: 'carousel' },
    });
    expect(normalizeSlider({ ext: { big: 'x'.repeat(LIMITS.ext) } }).ext).toEqual({});
  });

  it('lists the media a slider uses', () => {
    expect(mediaIdsOf(sample())).toEqual([IMAGE_ID, '11111111-2222-4333-8444-666666666666']);
  });

  it('makes short names for the shortcode', () => {
    expect(aliasOf('Città sul Mare!')).toBe('citta-sul-mare');
    expect(aliasOf('')).toBe('slider');
  });
});

describe('per-device values', () => {
  it('inherits from the larger device, and stores only overrides', () => {
    let style = defaultLayer('heading').style;
    style = setFor(style, 'tablet', 'fontSize', 40);
    expect(style.base.fontSize).toBe(56);
    expect(style.tablet).toEqual({ fontSize: 40 });
    expect(valueFor(style, 'mobile').fontSize).toBe(40);
    style = setFor(style, 'mobile', 'color', '#000000');
    expect(valueFor(style, 'mobile')).toMatchObject({ fontSize: 40, color: '#000000' });
    style = resetFor(style, 'tablet', 'fontSize');
    expect(style.tablet).toBeUndefined();
    expect(valueFor(style, 'mobile').fontSize).toBe(56);
  });

  it('lays texts out for phones by themselves, unless set by hand', () => {
    const layer = defaultLayer('heading');
    layer.pos.base = { x: 8, y: 30, w: 40, h: 0, anchor: 'tl' };
    expect(layerPos(layer, 'mobile', true)).toMatchObject({ x: 50, w: 88, anchor: 't' });
    expect(layerPos(layer, 'mobile', false)).toMatchObject({ x: 8, w: 40, anchor: 'tl' });
    expect(layerPos(layer, 'tablet', true)).toMatchObject({ x: 8, w: 40 });
    expect(layerStyle(layer, 'mobile', true).fontSize).toBe(35);
    expect(layerStyle(layer, 'tablet', true).fontSize).toBe(48);
    layer.pos.mobile = { x: 20 };
    expect(layerPos(layer, 'mobile', true)).toMatchObject({ x: 20, w: 40 });
    layer.style.mobile = { fontSize: 20 };
    expect(layerStyle(layer, 'mobile', true).fontSize).toBe(20);
    // Shapes and images keep their place.
    const shape = defaultLayer('shape');
    expect(layerPos(shape, 'mobile', true)).toEqual(shape.pos.base);
  });

  it('keeps a readable minimum size on phones', () => {
    const text = defaultLayer('text');
    text.style.base.fontSize = 18;
    expect(layerStyle(text, 'mobile', true).fontSize).toBe(16);
  });
});

describe('templates and the fast path', () => {
  it('has about ten templates that normalize to themselves', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
    for (const template of TEMPLATES) {
      const slider = templateSlider(template.id)!;
      expect(slider.slides.length, template.id).toBeGreaterThan(0);
      expect(normalizeSlider(JSON.parse(JSON.stringify(slider)))).toEqual(slider);
      // Only gradients, colours and shapes: no stock photos.
      expect(JSON.stringify(slider)).not.toMatch(/https?:\/\//);
    }
    expect(templateSlider('nope')).toBeNull();
  });

  it('makes one slide per picture, with its words in a content box', () => {
    const slider = quickSlider([
      {
        image: { id: IMAGE_ID, url: '/media/a.jpg' },
        title: 'Hi',
        button: 'Go',
        link: { kind: 'url', value: 'https://x.example' },
      },
      { image: { id: null, url: '/media/b.jpg' } },
    ]);
    expect(slider.slides).toHaveLength(2);
    const [first, second] = slider.slides;
    expect(first!.background.image).toEqual({ id: IMAGE_ID, url: '/media/a.jpg' });
    expect(first!.layers[0]!.type).toBe('box');
    expect(first!.layers[0]!.children.map((c) => c.content.text)).toEqual(['Hi', 'Go']);
    expect(first!.overlay.opacity).toBeGreaterThan(0);
    expect(second!.layers).toEqual([]);
  });
});

describe('latest posts', () => {
  it('fills the template slide with each post', () => {
    const slider = templateSlider('latest-posts')!;
    const { slider: out, media } = expandPosts(
      slider,
      [
        {
          id: 'p1',
          title: 'First',
          url: '/first',
          excerpt: 'A very long excerpt '.repeat(20),
          publishedAt: '2026-10-01T10:00:00Z',
          author: 'Ann',
          category: 'News',
          image: {
            id: IMAGE_ID,
            url: '/media/x.jpg',
            width: 10,
            height: 10,
            alt: '',
            variants: [],
          },
        },
        {
          id: 'p2',
          title: 'Second',
          url: '/second',
          excerpt: '',
          publishedAt: null,
          author: '',
          category: '',
          image: null,
        },
      ],
      'en',
    );
    expect(out.slides).toHaveLength(2);
    expect(media.map((m) => m.id)).toEqual([IMAGE_ID]);
    const text = JSON.stringify(out.slides[0]);
    expect(text).toContain('"First"');
    expect(text).toContain('News · October 1, 2026');
    expect(text).not.toContain('{{title}}');
    expect(out.slides[0]!.background.image).toEqual({ id: IMAGE_ID, url: '/media/x.jpg' });
    expect(out.slides[1]!.background.kind).toBe('gradient');
    const button = out.slides[0]!.layers[0]!.children.find((c) => c.type === 'button')!;
    expect(button.content.link.value).toBe('/first');
  });

  it('shortens excerpts on a word and fills only known tags', () => {
    expect(shorten('one two three four', 9)).toBe('one two…');
    expect(fillTags('{{title}} {{nope}}', { title: 'T' })).toBe('T {{nope}}');
  });

  it('leaves manual sliders as they are', () => {
    const slider = defaultSlider();
    expect(expandPosts(slider, [], 'en').slider).toBe(slider);
  });
});
