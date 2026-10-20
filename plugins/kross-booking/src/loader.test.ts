// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The loader shipped in the public folder, run as the page would run it. */
const source = readFileSync(join(__dirname, '../public/kross-booking.js'), 'utf8');
const LOADER = 'https://hotel.example/plugin-assets/kross-booking/1.0.0/kross-booking.js';

function page(body: string): void {
  document.head.innerHTML = '';
  document.body.innerHTML = `${body}<script src="${LOADER}"></script>`;
}

function run(): void {
  new Function(source)();
}

const added = (selector: string) =>
  [...document.querySelectorAll(selector)].map(
    (el) => el.getAttribute('src') ?? el.getAttribute('href'),
  );

const container = (attrs = 'data-cx-widget="11" data-cx-version="6"') =>
  `<div data-lang="it" data-hotel-id="pratonevoso" data-id-room="0" class="kross-container" ${attrs}></div>`;

afterEach(() => {
  delete (window as { cleitextKrossBooking?: unknown }).cleitextKrossBooking;
  delete (window as { jQuery?: unknown }).jQuery;
  vi.restoreAllMocks();
});

describe('the Kross Booking loader', () => {
  it('loads jQuery first, then the widget, once', () => {
    page(container() + container('data-cx-widget="11" data-cx-version="6"'));
    run();
    expect(added('link[rel=stylesheet]')).toEqual([
      'https://data.krossbooking.com/widget/v6/pratonevoso/11.css?cache=6',
    ]);
    // Only jQuery, next to the loader: the widget waits for it.
    expect(added('script').slice(1)).toEqual([
      'https://hotel.example/plugin-assets/kross-booking/1.0.0/jquery-3.7.1.min.js',
    ]);
    document.querySelectorAll('script')[1]!.dispatchEvent(new Event('load'));
    expect(added('script').slice(1)).toEqual([
      'https://hotel.example/plugin-assets/kross-booking/1.0.0/jquery-3.7.1.min.js',
      'https://data.krossbooking.com/widget/v6/pratonevoso/11.js?cache=6',
    ]);
    // A second run (another copy of the loader) adds nothing.
    run();
    expect(added('script')).toHaveLength(3);
    expect(added('link[rel=stylesheet]')).toHaveLength(1);
  });

  it('reuses the jQuery of the page', () => {
    (window as { jQuery?: unknown }).jQuery = () => {};
    page(container('data-cx-widget="11" data-cx-version="123456"'));
    run();
    expect(added('script').slice(1)).toEqual([
      'https://data.krossbooking.com/widget/v6/pratonevoso/11.js?cache=123456',
    ]);
  });

  it('loads nothing until the hotel and widget are set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    page(container(''));
    run();
    expect(added('script')).toHaveLength(1);
    expect(added('link')).toHaveLength(0);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('ignores values that would change the addresses', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    page(
      '<div class="kross-container" data-hotel-id="../evil" data-cx-widget="11" data-cx-version="6"></div>',
    );
    run();
    expect(added('script')).toHaveLength(1);
    expect(added('link')).toHaveLength(0);
  });

  it('does nothing on pages without the widget', () => {
    page('<p>Hello</p>');
    run();
    expect(added('script')).toHaveLength(1);
    expect((window as { cleitextKrossBooking?: unknown }).cleitextKrossBooking).toBeUndefined();
  });
});
