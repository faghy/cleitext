import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SliderData } from '../src/model/types';
import { SliderView } from '../src/render/render';
import { MEDIA, sample } from './fixtures';

let reduce = false;

beforeEach(() => {
  reduce = false;
  window.matchMedia = ((query: string) => ({
    matches: query.includes('reduce') ? reduce : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLMediaElement.prototype.pause = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  delete (window as { cleitextConsent?: unknown }).cleitextConsent;
  delete (window as { cleitextDiorama?: unknown }).cleitextDiorama;
});

function page(slider: SliderData, banner = false) {
  document.body.innerHTML =
    (banner ? '<div id="cx-consent" hidden></div>' : '') +
    renderToStaticMarkup(
      <SliderView
        slider={slider}
        scope="abc"
        uid="dio-b1"
        title="Home"
        locale="en"
        media={MEDIA}
      />,
    );
}

/** The runtime, as the page runs it (once per import). */
async function run() {
  vi.resetModules();
  await import('../src/public/diorama');
}

const active = () =>
  [...document.querySelectorAll('.dio__slide')].findIndex((s) => s.classList.contains('is-active'));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the runtime', () => {
  it('shows the controls and changes slides with the arrows, the bullets and the keyboard', async () => {
    page(sample({ autoplay: { enabled: false, delay: 6000, pauseOnHover: true, loop: true } }));
    await run();
    const next = document.querySelector<HTMLButtonElement>('[data-dio-next]')!;
    expect(next.hidden).toBe(false);
    next.click();
    await flush();
    expect(active()).toBe(1);
    const slides = document.querySelectorAll<HTMLElement>('.dio__slide');
    expect(slides[0]!.getAttribute('aria-hidden')).toBe('true');
    expect(slides[0]!.inert).toBe(true);
    expect(slides[1]!.hasAttribute('aria-hidden')).toBe(false);
    expect(document.querySelectorAll('.dio__bullet')[1]!.getAttribute('aria-current')).toBe('true');
    document.querySelector<HTMLButtonElement>('[data-dio-go="2"]')!.click();
    await flush();
    expect(active()).toBe(2);
    // Arrows of the keyboard, only from inside the slider.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await flush();
    expect(active()).toBe(2);
    next.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await flush();
    expect(active()).toBe(0);
    next.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await flush();
    expect(active()).toBe(2);
  });

  it('plays by itself, pauses on focus and with the pause button', async () => {
    vi.useFakeTimers();
    page(sample());
    await run();
    const stage = document.querySelector('.dio__stage')!;
    expect(stage.getAttribute('aria-live')).toBe('off');
    await vi.advanceTimersByTimeAsync(6100);
    expect(active()).toBe(1);
    const pause = document.querySelector<HTMLButtonElement>('[data-dio-pause]')!;
    pause.click();
    expect(pause.getAttribute('aria-label')).toBe('Play the slideshow');
    expect(stage.getAttribute('aria-live')).toBe('polite');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(active()).toBe(1);
    pause.click();
    expect(pause.getAttribute('aria-label')).toBe('Pause the slideshow');
    // Focus inside stops it too.
    pause.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(active()).toBe(1);
  });

  it('lets scripts find a slider and pause it', async () => {
    vi.useFakeTimers();
    page(sample());
    await run();
    const registry = (window as { cleitextDiorama?: Record<string, unknown> }).cleitextDiorama as {
      get: (
        target: Element | string | null,
      ) => { paused: boolean; setPaused(paused: boolean): void } | undefined;
    };
    const root = document.querySelector('[data-dio]')!;
    const slider = registry.get(root)!;
    expect(slider).toBeDefined();
    // An element inside the slider, a selector and the page around it find the same slider.
    expect(registry.get(document.querySelector('.dio__stage'))).toBe(slider);
    expect(registry.get('[data-dio]')).toBe(slider);
    expect(registry.get(document.body)).toBe(slider);
    expect(registry.get('#nothing-here')).toBeUndefined();
    expect(registry.get('[[not a selector')).toBeUndefined();
    expect(registry.get(null)).toBeUndefined();
    expect(slider.paused).toBe(false);
    slider.setPaused(true);
    expect(slider.paused).toBe(true);
    const pause = document.querySelector<HTMLButtonElement>('[data-dio-pause]')!;
    expect(pause.getAttribute('aria-label')).toBe('Play the slideshow');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(active()).toBe(0);
    slider.setPaused(false);
    expect(slider.paused).toBe(false);
    await vi.advanceTimersByTimeAsync(6100);
    expect(active()).toBe(1);
  });

  it('never moves by itself with reduced motion, and slides still change', async () => {
    vi.useFakeTimers();
    reduce = true;
    page(sample());
    await run();
    const pause = document.querySelector<HTMLButtonElement>('[data-dio-pause]')!;
    expect(pause.getAttribute('aria-label')).toBe('Play the slideshow');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(active()).toBe(0);
    document.querySelector<HTMLButtonElement>('[data-dio-next]')!.click();
    await vi.advanceTimersByTimeAsync(10);
    expect(active()).toBe(1);
    // No videos start.
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('loads YouTube at once without a consent banner, and leaves it to Privacy with one', async () => {
    const slider = sample({
      autoplay: { enabled: false, delay: 6000, pauseOnHover: true, loop: true },
    });
    page(slider);
    await run();
    document.querySelector<HTMLButtonElement>('[data-dio-go="2"]')!.click();
    await flush();
    expect(document.querySelector('iframe')!.getAttribute('src')).toContain('youtube-nocookie.com');

    page(slider, true);
    await run();
    document.querySelector<HTMLButtonElement>('[data-dio-go="2"]')!.click();
    await flush();
    const frame = document.querySelector('iframe')!;
    expect(frame.hasAttribute('src')).toBe(false);
    expect(frame.getAttribute('data-cx-src')).toContain('youtube-nocookie.com');
  });

  it('follows a swipe', async () => {
    page(sample({ autoplay: { enabled: false, delay: 6000, pauseOnHover: true, loop: true } }));
    await run();
    const stage = document.querySelector<HTMLElement>('.dio__stage')!;
    const pointer = (type: string, x: number) => {
      const event = new MouseEvent(type, { clientX: x, clientY: 100, bubbles: true, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      stage.dispatchEvent(event);
    };
    pointer('pointerdown', 300);
    pointer('pointermove', 200);
    pointer('pointerup', 120);
    await flush();
    expect(active()).toBe(1);
  });

  it('lets other plugins add transitions', async () => {
    const custom = vi.fn(() => []);
    (window as { cleitextDiorama?: unknown }).cleitextDiorama = { transitions: { cube: custom } };
    const slider = sample({
      autoplay: { enabled: false, delay: 6000, pauseOnHover: true, loop: true },
    });
    slider.transition.effect = 'fade';
    slider.slides[1]!.transition = 'fade';
    page(slider);
    document.querySelectorAll('.dio__slide')[1]!.setAttribute('data-transition', 'cube');
    // jsdom has no Web Animations: give the slides an animate() so transitions run.
    HTMLElement.prototype.animate = vi.fn(
      () => ({ finished: Promise.resolve(), cancel() {} }) as unknown as Animation,
    );
    await run();
    document.querySelector<HTMLButtonElement>('[data-dio-next]')!.click();
    await flush();
    expect(custom).toHaveBeenCalledOnce();
    expect(active()).toBe(1);
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });
});
