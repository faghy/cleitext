import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultLayer, normalizeSlider } from '../src/model/normalize';
import type { SliderData } from '../src/model/types';
import { BASE_CSS } from '../src/render/base-css';
import { fluidSize, sliderCss } from '../src/render/css';
import { embedSrc, SliderView, vimeoId, youtubeId, type RenderInput } from '../src/render/render';
import { MEDIA, sample } from './fixtures';

function html(slider: SliderData, extra: Partial<RenderInput> = {}): string {
  return renderToStaticMarkup(
    <SliderView
      slider={slider}
      scope="abc"
      uid="dio-b1"
      title="Home slider"
      locale="en"
      media={MEDIA}
      {...extra}
    />,
  );
}

function dom(markup: string): Document {
  return new DOMParser().parseFromString(`<body>${markup}</body>`, 'text/html');
}

describe('the slider’s markup', () => {
  it('is a carousel with named slides, and only the first is exposed', () => {
    const doc = dom(html(sample()));
    const root = doc.querySelector('section.dio')!;
    expect(root.getAttribute('aria-roledescription')).toBe('carousel');
    expect(root.getAttribute('aria-label')).toBe('Home slider');
    expect(root.id).toBe('dio-b1');
    const slides = [...doc.querySelectorAll('.dio__slide')];
    expect(slides).toHaveLength(3);
    expect(slides.map((s) => s.getAttribute('role'))).toEqual(['group', 'group', 'group']);
    expect(slides.map((s) => s.getAttribute('aria-roledescription'))).toEqual([
      'slide',
      'slide',
      'slide',
    ]);
    expect(slides[0]!.getAttribute('aria-label')).toBe('1 of 3: Welcome');
    expect(slides[1]!.getAttribute('aria-label')).toBe('2 of 3');
    expect(slides[0]!.classList.contains('is-active')).toBe(true);
    expect(slides[0]!.hasAttribute('aria-hidden')).toBe(false);
    expect(slides[1]!.getAttribute('aria-hidden')).toBe('true');
    expect(slides[1]!.hasAttribute('inert')).toBe(true);
  });

  it('puts the pause button first, controls named and waiting for the script', () => {
    const doc = dom(html(sample()));
    const root = doc.querySelector('.dio')!;
    const buttons = [...root.querySelectorAll('button')];
    expect(buttons[0]!.getAttribute('aria-label')).toBe('Pause the slideshow');
    for (const b of buttons)
      expect(b.getAttribute('aria-controls') ?? b.closest('[aria-controls]')).toBeTruthy();
    expect(root.querySelector('[data-dio-prev]')!.getAttribute('aria-label')).toBe(
      'Previous slide',
    );
    expect(root.querySelector('[data-dio-next]')!.hasAttribute('hidden')).toBe(true);
    const bullets = [...root.querySelectorAll('.dio__bullet')];
    expect(bullets.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Slide 1',
      'Slide 2',
      'Slide 3',
    ]);
    expect(bullets[0]!.getAttribute('aria-current')).toBe('true');
    // The live region is off while slides play by themselves.
    expect(root.querySelector('.dio__stage')!.getAttribute('aria-live')).toBe('off');
    const config = JSON.parse(root.getAttribute('data-dio')!);
    expect(config).toMatchObject({ autoplay: true, delay: 6000, effect: 'fade' });
  });

  it('is polite and has no pause button without autoplay', () => {
    const doc = dom(
      html(sample({ autoplay: { enabled: false, delay: 6000, pauseOnHover: true, loop: true } })),
    );
    expect(doc.querySelector('[data-dio-pause]')).toBeNull();
    expect(doc.querySelector('.dio__stage')!.getAttribute('aria-live')).toBe('polite');
  });

  it('loads the first picture at once and the others lazily, with responsive sources', () => {
    const doc = dom(html(sample()));
    const images = [...doc.querySelectorAll<HTMLImageElement>('img.dio__bg')];
    expect(images[0]!.getAttribute('loading')).toBe('eager');
    expect(images[0]!.getAttribute('fetchpriority')).toBe('high');
    expect(images[1]!.getAttribute('loading')).toBe('lazy');
    expect(images[1]!.hasAttribute('fetchpriority')).toBe(false);
    expect(images[0]!.getAttribute('alt')).toBe('A beach at sunset');
    expect(images[0]!.getAttribute('width')).toBe('2400');
    // The focal point of the library keeps the subject in view.
    expect(images[0]!.getAttribute('style')).toContain('object-position:30% 70%');
    const sources = [...doc.querySelectorAll('picture source')];
    expect(sources.map((s) => s.getAttribute('type'))).toEqual(['image/avif', 'image/webp']);
    expect(sources[1]!.getAttribute('srcset')).toBe(
      '/media/site/beach-800.webp 800w, /media/site/beach-1600.webp 1600w',
    );
    expect(sources[1]!.getAttribute('sizes')).toBe('100vw');
    // Without variants, the original.
    expect(images[1]!.getAttribute('src')).toBe('/media/site/second.jpg');
  });

  it('keeps texts as text, with headings and links where they belong', () => {
    const markup = html(sample());
    expect(markup).toContain('Second &lt;b&gt;slide&lt;/b&gt;');
    const doc = dom(markup);
    expect(doc.querySelector('h2.dio-heading')!.textContent).toBe('Hello');
    expect(doc.querySelector('p.dio-text')!.innerHTML).toBe('Line one<br>Line two');
    const button = doc.querySelector<HTMLAnchorElement>('a.dio-btn')!;
    expect(button.getAttribute('href')).toBe('https://example.com/book');
    expect(button.textContent).toBe('Book');
  });

  it('holds YouTube and Vimeo until consent, in their privacy-friendly players', () => {
    const doc = dom(html(sample()));
    const frame = doc.querySelector('iframe')!;
    expect(frame.hasAttribute('src')).toBe(false);
    expect(frame.getAttribute('data-cx-category')).toBe('marketing');
    expect(frame.getAttribute('data-cx-src')).toContain(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?',
    );
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    expect(frame.getAttribute('tabindex')).toBe('-1');
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(vimeoId('https://vimeo.com/76979871')).toBe('76979871');
    expect(embedSrc('vimeo', 'https://vimeo.com/76979871')).toContain('dnt=1');
    expect(embedSrc('youtube', 'https://example.com')).toBeNull();
  });

  it('draws a hero as one scene, without carousel semantics or controls', () => {
    const doc = dom(html(sample({ type: 'hero' })));
    expect(doc.querySelector('section')).toBeNull();
    expect(doc.querySelectorAll('.dio__slide')).toHaveLength(1);
    expect(doc.querySelector('[role="group"]')).toBeNull();
    expect(doc.querySelector('button')).toBeNull();
  });

  it('leaves hidden slides out, and draws nothing without slides', () => {
    const slider = sample();
    slider.slides[1]!.hidden = true;
    expect(dom(html(slider)).querySelectorAll('.dio__slide')).toHaveLength(2);
    expect(html(normalizeSlider({}))).toBe('');
  });

  it('marks layers that move, and nothing in the editor’s canvas', () => {
    const page = dom(html(sample()));
    expect(page.querySelector('.dio-heading')!.hasAttribute('data-in')).toBe(true);
    const canvas = dom(html(sample(), { mode: 'canvas', device: 'mobile', slideIndex: 1 }));
    expect(canvas.querySelector('.dio')!.classList.contains('dio--static')).toBe(true);
    expect(canvas.querySelector('.dio')!.hasAttribute('data-dio')).toBe(false);
    expect(canvas.querySelectorAll('.dio__slide')).toHaveLength(1);
    expect(canvas.querySelector('[data-dio-layer="h2"]')).not.toBeNull();
    expect(canvas.querySelector('iframe')).toBeNull();
  });
});

describe('the slider’s CSS', () => {
  it('reserves the height for each device, so nothing jumps', () => {
    const css = sliderCss(sample(), 'abc');
    expect(css).toContain(
      '.dio-sabc{--dio-h:600px;--dio-off:0px;--dio-nav:#ffffff;--dio-nav-size:44px}',
    );
    expect(css).toContain('@media (max-width:1024px){.dio-sabc{--dio-h:520px;--dio-off:0px}');
    expect(css).toContain('@media (max-width:767px){.dio-sabc{--dio-h:480px;--dio-off:0px}');
    expect(BASE_CSS).toContain('.dio__stage{position:relative;height:var(--dio-h)');
    expect(BASE_CSS).toContain('height:calc(100svh - var(--dio-off))');
  });

  it('writes only what changes on smaller devices', () => {
    const slider = sample();
    const layer = defaultLayer('shape', { id: 'sq' });
    layer.hide.mobile = true;
    slider.slides[0]!.layers.push(layer);
    const css = sliderCss(slider, 'abc');
    const mobile = css.slice(css.indexOf('@media (max-width:767px)'));
    expect(mobile).toContain('.dio-sabc .dio-lsq{display:none}');
    const tablet = css.slice(
      css.indexOf('@media (max-width:1024px)'),
      css.indexOf('@media (max-width:767px)'),
    );
    expect(tablet).not.toContain('.dio-lsq');
  });

  it('draws one device without media queries for the canvas', () => {
    const css = sliderCss(sample(), 'e', { device: 'tablet' });
    expect(css).not.toContain('@media');
    expect(css).toContain('--dio-h:520px');
  });

  it('shrinks fonts with narrow boxes, never below three quarters', () => {
    expect(fluidSize(48, 'desktop')).toBe('clamp(36px,4cqw,48px)');
    expect(fluidSize(12, 'mobile')).toBe('clamp(10px,3.077cqw,12px)');
  });

  it('respects reduced motion and keeps the entrance effects off the hover state', () => {
    expect(BASE_CSS).toContain(
      '@media (prefers-reduced-motion:reduce){.dio .dio-l,.dio .dio__bg,.dio .dio__media{animation:none!important}',
    );
    expect(BASE_CSS).toContain('var(--dio-in-delay,0ms) backwards');
    expect(BASE_CSS).toContain(
      '@keyframes dio-in-fade-up{from{opacity:0;transform:translateY(32px)}}',
    );
  });
});
