import { describe, expect, it } from 'vitest';
import { bannerHtml } from './banner';
import { withDefaults } from './config';

function render(color = '#aa3366') {
  const cfg = withDefaults(null);
  return bannerHtml(
    {
      ...cfg,
      banner: {
        ...cfg.banner,
        enabled: true,
        floatingButton: true,
        color,
        categories: ['statistics', 'marketing'],
      },
    },
    'en',
    { privacy: '/privacy' },
    '1',
  );
}

/** The rules of the banner's stylesheet, media queries opened up. */
function rules(html: string): { selectors: string[]; body: string }[] {
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1]!.replace(/@media[^{]*\{/g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
    selectors: sel!.split(',').map((s) => s.trim()),
    body: body!,
  }));
}

/** [ids, classes and pseudo-classes, types], for the simple selectors used here. */
function specificity(selector: string): [number, number, number] {
  const ids = selector.match(/#[\w-]+/g)?.length ?? 0;
  const classes = selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g)?.length ?? 0;
  const types = selector.replace(/[.#:[][^\s>+~]*/g, ' ').match(/\b[a-z][\w-]*/gi)?.length ?? 0;
  return [ids, classes, types];
}

const beats = (a: number[], b: number[]) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
};

/** Selectors of themes that restyle every button (Astra/Zenit, Aurora…). */
const THEME_SELECTORS = [
  'button',
  '.button',
  'input[type=button]',
  'body button:hover',
  'html body button:focus',
  '.ast-button:hover',
  '.entry-content button:focus',
];

const CONTROLS = ['.cx-consent__button', '.cx-consent__close', '.cx-consent-reopen'];

describe('banner styles against the theme', () => {
  const html = render();
  const all = rules(html);
  // The rules that style a control (not the ones that only hide it).
  const controlRules = all.filter(
    (r) =>
      !r.body.includes('display:none') &&
      r.selectors.some((s) => CONTROLS.some((c) => s.endsWith(c) || s.includes(`${c}.`))),
  );

  it('starts every control from the browser look, then sets its own values', () => {
    for (const control of CONTROLS) {
      const base = all.find((r) =>
        r.selectors.some((s) => s.endsWith(control) && !s.includes(':')),
      );
      expect(base, control).toBeDefined();
      expect(base!.body.startsWith('all:revert;'), control).toBe(true);
      for (const prop of ['padding', 'line-height', 'background', 'color', 'border']) {
        expect(base!.body, `${control} ${prop}`).toMatch(new RegExp(`(^|;)${prop}:`));
      }
    }
  });

  it('outweighs the usual theme selectors in every state, without !important', () => {
    expect(controlRules.length).toBeGreaterThan(3);
    for (const rule of controlRules) {
      for (const selector of rule.selectors) {
        for (const theme of THEME_SELECTORS) {
          expect(beats(specificity(selector), specificity(theme)), `${selector} > ${theme}`).toBe(
            true,
          );
        }
      }
      expect(rule.body).not.toContain('!important');
    }
  });

  it('keeps the focus ring above the reset and the colour of the settings', () => {
    const focus = all.find((r) => r.selectors.every((s) => s.endsWith(':focus-visible')));
    expect(focus!.body).toContain('outline:3px solid');
    const reopenBase = specificity('.cx-consent-reopen.cx-consent-reopen.cx-consent-reopen');
    for (const s of focus!.selectors) expect(beats(specificity(s), reopenBase)).toBe(true);
    expect(html).toContain('background:#aa3366');
    expect(html).not.toContain('COLOR');
  });

  it('draws the floating button as a circle with its icon at full size', () => {
    const reopen = all.find((r) =>
      r.selectors.includes('.cx-consent-reopen.cx-consent-reopen.cx-consent-reopen'),
    )!;
    expect(reopen.body).toContain('padding:0');
    expect(reopen.body).toContain('border-radius:50%');
    expect(reopen.body).toContain('width:2.75rem');
    const icon = all.find((r) => r.selectors.some((s) => s.endsWith(' svg')))!;
    expect(icon.body).toContain('width:22px');
    expect(icon.body).toContain('flex:none');
  });
});
