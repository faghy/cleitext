import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { variantsCss } from '../src/core/atomic.js';
import { elementCss } from '../src/core/css.js';
import { DEFAULT_KIT, kitCss, normalizeBreakpoints, normalizeKit } from '../src/core/kit.js';
import {
  DEFAULT_BREAKPOINTS,
  type Breakpoints,
  type FrescoNode,
  type RenderContext,
} from '../src/core/model.js';
import { button, heading } from '../src/elements/basic.js';
import { previewLimits, previewWidth } from '../src/editor/canvas.js';

const ALL: Breakpoints = {
  mobile: 767,
  mobile_extra: 880,
  tablet: 1024,
  tablet_extra: 1200,
  laptop: 1366,
  widescreen: 2400,
};

const node = (type: string, attrs: Record<string, unknown>): FrescoNode => ({
  id: 'abc123',
  type,
  v: 1,
  attrs,
});

const context: RenderContext = {
  media: new Map(),
  locale: 'en',
  editing: false,
  site: { title: '', tagline: '', home: '/' },
};

describe('breakpoints of the kit', () => {
  it('keeps tablet and mobile, and the optional devices only when in order', () => {
    expect(normalizeBreakpoints(undefined)).toEqual(DEFAULT_BREAKPOINTS);
    expect(normalizeBreakpoints({ tablet: 1000, mobile: 700 })).toEqual({
      tablet: 1000,
      mobile: 700,
    });
    expect(normalizeBreakpoints(ALL)).toEqual(ALL);
    // Out of order or not whole numbers: that device is off, the others stay.
    expect(
      normalizeBreakpoints({ ...ALL, mobile_extra: 1100, laptop: 1366.5, widescreen: 1201 }),
    ).toEqual({ mobile: 767, tablet: 1024, tablet_extra: 1200 });
    // Widescreen above the widest max-width breakpoint, with room for desktop.
    expect(normalizeBreakpoints({ tablet: 1024, mobile: 767, widescreen: 1026 })).toEqual({
      tablet: 1024,
      mobile: 767,
      widescreen: 1026,
    });
    expect(normalizeBreakpoints({ tablet: 1024, mobile: 767, widescreen: 1025 })).toEqual(
      DEFAULT_BREAKPOINTS,
    );
    expect(normalizeKit({ breakpoints: { ...ALL, mobile: 2000 } }).breakpoints).toEqual({
      ...DEFAULT_BREAKPOINTS,
      mobile_extra: 880,
      tablet_extra: 1200,
      laptop: 1366,
      widescreen: 2400,
    });
  });

  it('writes the same utilities as before with the default breakpoints', () => {
    const css = kitCss(DEFAULT_KIT);
    expect(css).toContain(
      '@media (min-width:1025px){.fr-hide-desktop{display:none!important}}' +
        '@media (min-width:768px) and (max-width:1024px){.fr-hide-tablet{display:none!important}}' +
        '@media (max-width:767px){.fr-hide-mobile{display:none!important}}' +
        ':root{--fr-device:desktop}' +
        '@media (max-width:1024px){:root{--fr-device:tablet}.fr-align-tablet-left{text-align:left}',
    );
    expect(css).not.toMatch(/laptop|widescreen|_extra/);
  });

  it('gives every active device its hiding range and its utilities', () => {
    const css = kitCss(normalizeKit({ breakpoints: ALL }));
    expect(css).toContain(
      '@media (min-width:1367px) and (max-width:2399px){.fr-hide-desktop{display:none!important}}' +
        '@media (min-width:1201px) and (max-width:1366px){.fr-hide-laptop{display:none!important}}' +
        '@media (min-width:1025px) and (max-width:1200px){.fr-hide-tablet_extra{display:none!important}}' +
        '@media (min-width:881px) and (max-width:1024px){.fr-hide-tablet{display:none!important}}' +
        '@media (min-width:768px) and (max-width:880px){.fr-hide-mobile_extra{display:none!important}}' +
        '@media (max-width:767px){.fr-hide-mobile{display:none!important}}' +
        '@media (min-width:2400px){.fr-hide-widescreen{display:none!important}}',
    );
    // Utilities from the widest device down, so smaller ones win.
    const order = ['min-width:2400px', 'max-width:1366px', 'max-width:1200px', 'max-width:880px'];
    const at = order.map((m) => css.indexOf(`@media (${m}){:root{--fr-device:`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});

describe('per-device values', () => {
  it('writes element CSS for the active devices only', () => {
    const attrs = {
      align: 'left',
      'align@laptop': 'center',
      'align@mobile_extra': 'right',
      'align@widescreen': 'justify',
    };
    const css = elementCss(heading, node('fresco/heading', attrs), ALL);
    expect(css).toContain('@media (min-width:2400px){.fr-e-abc123{text-align:justify}}');
    expect(css).toContain('@media (max-width:1366px){.fr-e-abc123{text-align:center}}');
    expect(css).toContain('@media (max-width:880px){.fr-e-abc123{text-align:right}}');
    expect(css.indexOf('max-width:1366px')).toBeLessThan(css.indexOf('max-width:880px'));
    // Devices that are off are left out: the page renders as before.
    const before = elementCss(heading, node('fresco/heading', attrs), DEFAULT_BREAKPOINTS);
    expect(before).not.toContain('@media');
  });

  it('writes atomic variants of the new devices in order', () => {
    const css = variantsCss(
      '.x',
      [
        { device: 'mobile_extra', state: '', props: { textAlign: 'right' } },
        { device: 'laptop', state: '', props: { textAlign: 'center' } },
        { device: 'widescreen', state: '', props: { textAlign: 'left' } },
      ],
      ALL,
    );
    expect(css).toBe(
      '@media (min-width:2400px){.x{text-align:left}}' +
        '@media (max-width:1366px){.x{text-align:center}}' +
        '@media (max-width:880px){.x{text-align:right}}',
    );
    expect(
      variantsCss(
        '.x',
        [{ device: 'laptop', state: '', props: { color: 'red' } }],
        DEFAULT_BREAKPOINTS,
      ),
    ).toBe('');
  });

  it('adds the classes of the new devices (hiding, button alignment)', () => {
    const html = renderToStaticMarkup(
      button.render({
        node: node('fresco/button', {
          text: 'Go',
          _hide_laptop: true,
          'align@tablet_extra': 'center',
        }),
        settings: { text: 'Go', _hide_laptop: true },
        context,
        children: null,
      }),
    );
    expect(html).toContain('fr-hide-laptop');
    expect(html).toContain('fr-align-tablet_extra-center');
  });
});

describe('responsive mode', () => {
  it('previews each device within its own range', () => {
    expect(previewWidth('desktop', ALL)).toBeNull();
    expect(previewWidth('tablet', DEFAULT_BREAKPOINTS)).toBe(768);
    expect(previewWidth('mobile', DEFAULT_BREAKPOINTS)).toBe(375);
    expect(previewWidth('laptop', ALL)).toBe(1366);
    expect(previewWidth('widescreen', ALL)).toBe(2400);
    expect(previewLimits('tablet', DEFAULT_BREAKPOINTS)).toEqual({ min: 768, max: 1024 });
    expect(previewLimits('tablet', ALL)).toEqual({ min: 881, max: 1024 });
    expect(previewLimits('mobile', ALL)).toEqual({ min: 320, max: 767 });
    expect(previewLimits('widescreen', ALL)).toEqual({ min: 2400, max: 5000 });
  });
});
