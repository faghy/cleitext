/**
 * Diorama 1.1's extension points: decorators of the markup, the browser's
 * registry (thumbnails with `data-dio-go`, pausing), and the layers' offsets.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SliderData } from '../src/model/types';
import { sliderCss } from '../src/render/css';
import {
  mergeDecorators,
  SliderView,
  type RenderDecorator,
  type RenderInput,
} from '../src/render/render';
import { MEDIA, sample } from './fixtures';

function html(slider: SliderData, decorate?: RenderDecorator, extra: Partial<RenderInput> = {}) {
  return renderToStaticMarkup(
    <SliderView
      slider={slider}
      scope="abc"
      uid="dio-b1"
      title="Home"
      locale="en"
      media={MEDIA}
      decorate={decorate}
      {...extra}
    />,
  );
}

const dom = (markup: string) =>
  new DOMParser().parseFromString(`<body>${markup}</body>`, 'text/html');

describe('decorators', () => {
  it('add classes, attributes, settings, CSS and markup', () => {
    const slider = sample();
    const firstLayer = slider.slides[0]!.layers[0]!;
    const doc = dom(
      html(slider, {
        root: { className: 'pro-root', attrs: { 'data-pro': 'yes' } },
        config: { effect: 'pro-cube' },
        css: '.pro-extra{color:red}',
        stage: <div className="pro-globals" />,
        after: <div className="pro-thumbs" />,
        slide: (slide, index) =>
          index === 1
            ? { className: 'pro-slide', attrs: { 'data-transition': 'pro-flip' } }
            : undefined,
        layer: (layer) => (layer.id === firstLayer.id ? { attrs: { 'data-act': '1' } } : undefined),
      }),
    );
    const root = doc.querySelector<HTMLElement>('.dio')!;
    expect(root.classList.contains('pro-root')).toBe(true);
    expect(root.classList.contains('dio')).toBe(true);
    expect(root.getAttribute('data-pro')).toBe('yes');
    expect(JSON.parse(root.getAttribute('data-dio')!).effect).toBe('pro-cube');
    expect(root.querySelector('style')!.textContent).toContain('.pro-extra{color:red}');
    expect(root.querySelector('.dio__stage > .pro-globals')).not.toBeNull();
    expect(root.querySelector(':scope > .pro-thumbs')).not.toBeNull();
    const slides = root.querySelectorAll('.dio__slide');
    expect(slides[1]!.classList.contains('pro-slide')).toBe(true);
    expect(slides[1]!.getAttribute('data-transition')).toBe('pro-flip');
    expect(root.querySelector(`.dio-l${firstLayer.id}`)!.getAttribute('data-act')).toBe('1');
  });

  it('replace the text of a layer, and leave the editor’s canvas alone', () => {
    const slider = sample();
    const heading = slider.slides[0]!.layers[0]!.children[0] ?? slider.slides[0]!.layers[0]!;
    const decorate: RenderDecorator = {
      root: { className: 'pro-root' },
      layer: (layer) =>
        layer.id === heading.id ? { children: <b className="split">X</b> } : undefined,
    };
    expect(dom(html(slider, decorate)).querySelector(`.dio-l${heading.id} .split`)).not.toBeNull();
    const canvas = dom(html(slider, decorate, { mode: 'canvas', device: 'desktop' }));
    expect(canvas.querySelector('.pro-root')).toBeNull();
    expect(canvas.querySelector('.split')).toBeNull();
  });

  it('merge in order', () => {
    const merged = mergeDecorators([
      { root: { className: 'a', attrs: { x: '1' } }, css: 'A', config: { effect: 'one' } },
      undefined,
      {
        root: { className: 'b', attrs: { x: '2', y: '3' } },
        css: 'B',
        layer: () => ({ className: 'l2' }),
      },
    ])!;
    expect(merged.root).toEqual({ className: 'a b', attrs: { x: '2', y: '3' } });
    expect(merged.css).toBe('AB');
    expect(merged.config).toEqual({ effect: 'one' });
    expect(merged.layer!(sample().slides[0]!.layers[0]!)).toEqual({
      className: 'l2',
      attrs: {},
      children: undefined,
    });
    expect(mergeDecorators([undefined, null])).toBeUndefined();
  });

  it('let layers be moved by offsets of other plugins', () => {
    expect(sliderCss(sample(), 'abc')).toContain('translate:calc(0% + var(--dio-tx,0px))');
  });
});

describe('the browser’s registry', () => {
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
  });
  afterEach(() => {
    document.body.innerHTML = '';
    delete (window as { cleitextDiorama?: unknown }).cleitextDiorama;
  });

  it('follows thumbnails by their `data-dio-go`, and pauses on request', async () => {
    const slider = sample({
      autoplay: { enabled: true, delay: 6000, pauseOnHover: true, loop: true },
    });
    document.body.innerHTML = html(slider, {
      after: (
        <div className="thumbs">
          {slider.slides.map((s, i) => (
            <button key={s.id} type="button" data-dio-go={i} className="thumb" />
          ))}
        </div>
      ),
    });
    vi.resetModules();
    await import('../src/public/diorama');
    const registry = (
      window as unknown as {
        cleitextDiorama: {
          sliders: { index: number; paused: boolean; setPaused(p: boolean): void }[];
          scan: () => void;
        };
      }
    ).cleitextDiorama;
    const thumbs = document.querySelectorAll<HTMLButtonElement>('.thumb');
    thumbs[2]!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(registry.sliders[0]!.index).toBe(2);
    expect(thumbs[2]!.getAttribute('aria-current')).toBe('true');
    expect(document.querySelectorAll('.dio__bullet')[2]!.getAttribute('aria-current')).toBe('true');
    registry.sliders[0]!.setPaused(true);
    expect(registry.sliders[0]!.paused).toBe(true);
    expect(document.querySelector('[data-dio-pause]')!.getAttribute('aria-label')).toBe(
      'Play the slideshow',
    );
    expect(typeof registry.scan).toBe('function');
  });
});
