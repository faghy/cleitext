/**
 * The seams of the language switcher (core 0.83, plugin API 1.54): menus
 * given back by plugins (`render.menus`) and `<LanguageSwitcher>` of the
 * theme SDK, which renders the language plugin's block or the theme's own.
 */
import { LanguageSwitcher, PageProvider, type PageContext } from '@cleitext/theme-sdk';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cleanMenus, SWITCHER_BLOCK_ID } from '../src/public/plugin-menus.js';

describe('menus given back by plugins', () => {
  it('keep well formed items only, with unique ids', () => {
    const menus = cleanMenus({
      primary: [
        { id: 'a', label: ' Home ', url: '/', current: true, children: [] },
        { id: 'a', label: 'Twin', url: '/twin', current: false, children: [] },
        { id: 'b', label: 'Bad', url: 'javascript:alert(1)', current: false, children: [] },
        { id: 'c', label: '', url: '/empty', current: false, children: [] },
        {
          id: 'd',
          label: 'Languages',
          url: '#',
          current: 'yes',
          target: '_blank',
          data: { x: 1 },
          children: [{ id: 'e', label: 'Italiano', url: '/it', children: 'no' }],
        },
        'junk',
      ],
      'bad location!': [{ id: 'z', label: 'Z', url: '/z', current: false, children: [] }],
    });
    expect(menus).toEqual({
      primary: [
        { id: 'a', label: 'Home', url: '/', current: true, children: [] },
        {
          id: 'd',
          label: 'Languages',
          url: '#',
          target: '_blank',
          current: false,
          data: { x: 1 },
          children: [{ id: 'e', label: 'Italiano', url: '/it', current: false, children: [] }],
        },
      ],
    });
    expect(cleanMenus(null)).toEqual({});
    expect(cleanMenus([])).toEqual({});
  });

  it('stop at 1000 items a menu', () => {
    const many = Array.from({ length: 1200 }, (_, i) => ({
      id: `i${i}`,
      label: `Item ${i}`,
      url: `/i${i}`,
      children: [],
    }));
    expect(cleanMenus({ primary: many }).primary).toHaveLength(1000);
  });
});

describe('<LanguageSwitcher> of the theme SDK', () => {
  const locales = [
    { code: 'en', name: 'English', url: '/about', current: true, translated: true },
    { code: 'it', name: 'Italiano', url: '/it/chi-siamo', current: false, translated: true },
  ];
  const page = (extra: Partial<PageContext> = {}): PageContext => ({
    site: {
      id: 's',
      title: 'Site',
      tagline: '',
      origin: 'http://x.test',
      timezone: 'UTC',
      dateStyle: 'long',
    },
    locale: 'it',
    locales,
    menus: {},
    urls: { home: '/', search: '/search' },
    media: new Map(),
    ...extra,
  });
  const render = (context: PageContext, node: ReactNode) =>
    renderToStaticMarkup(createElement(PageProvider, { value: context, children: node }));

  it('renders the language plugin’s block with the theme’s place and hint', () => {
    const seen: unknown[] = [];
    const renderers = new Map([
      [
        'multilingual/language-switcher',
        ({ block }: { block: { id: string; attrs: unknown } }) => {
          seen.push(block);
          return createElement('nav', { className: 'plugin' });
        },
      ],
    ]);
    const out = render(
      page({
        blockRenderers: renderers as never,
        languageSwitcher: { type: 'multilingual/language-switcher', id: SWITCHER_BLOCK_ID },
      }),
      createElement(LanguageSwitcher, {
        placement: 'header',
        hint: { style: 'inline', names: 'code' },
        className: 'theme-langs',
        fallback: createElement('ul', { className: 'theme' }),
      }),
    );
    expect(out).toBe('<nav class="plugin"></nav>');
    expect(seen).toEqual([
      {
        id: SWITCHER_BLOCK_ID,
        type: 'multilingual/language-switcher',
        v: 1,
        attrs: {
          placement: 'header',
          hint: { style: 'inline', names: 'code' },
          className: 'theme-langs',
        },
      },
    ]);
  });

  it('falls back to the theme’s own markup, or a plain list, without a plugin', () => {
    const fallback = createElement('ul', { className: 'theme' });
    expect(render(page(), createElement(LanguageSwitcher, { fallback }))).toBe(
      '<ul class="theme"></ul>',
    );
    // A block type the page cannot render (the plugin went inactive) falls back too.
    expect(
      render(
        page({ languageSwitcher: { type: 'gone/switcher', id: 'x' } }),
        createElement(LanguageSwitcher, { fallback }),
      ),
    ).toBe('<ul class="theme"></ul>');
    const plain = render(page(), createElement(LanguageSwitcher));
    expect(plain).toContain('<nav class="cx-language-switcher" aria-label="Lingue">');
    expect(plain).toContain(
      '<a href="/about" hrefLang="en" lang="en" aria-current="true">English</a>',
    );
  });

  it('shows nothing on sites with one language', () => {
    expect(
      render(page({ locales: [locales[0]!] }), createElement(LanguageSwitcher, { fallback: 'x' })),
    ).toBe('');
  });
});
