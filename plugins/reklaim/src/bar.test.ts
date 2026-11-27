import { describe, expect, it } from 'vitest';
import {
  cleanAnchor,
  pathMatches,
  safeLink,
  scriptConfig,
  scriptJson,
  settingsOf,
  textsFor,
} from './bar';
import { askPro, installServerApi } from './pro';

const none = { hide: false, bars: [], desktop: false, position: 'bottom' as const };

describe('settings', () => {
  it('has defaults, and drops texts without a button and unsafe addresses', () => {
    const s = settingsOf({
      texts: [
        { locale: 'IT', text: ' Da 29 € ', button: 'Demo', link: 'javascript:alert(1)' },
        { locale: 'en', text: 'x', button: '' },
      ],
      anchor: '#demo form',
      background: 'red',
    });
    expect(s.texts).toEqual([{ locale: 'it', text: 'Da 29 €', button: 'Demo', link: '' }]);
    expect(s.anchor).toBe('demoform');
    expect(s.background).toBe('#1f2937');
    expect(s.scroll).toBe(500);
    expect(s.max_width).toBe(768);
    expect(s.ga_event).toBe('generate_lead');
  });

  it('accepts addresses on the site, web, mail and phone', () => {
    expect(safeLink('/en#demo')).toBe('/en#demo');
    expect(safeLink('#demo')).toBe('#demo');
    expect(safeLink('https://x.test/a')).toBe('https://x.test/a');
    expect(safeLink('tel:+39010')).toBe('tel:+39010');
    expect(safeLink('//evil.test')).toBe('');
    expect(safeLink('data:text/html,x')).toBe('');
    expect(cleanAnchor(' #prepara ')).toBe('prepara');
  });
});

describe('texts for a language', () => {
  const texts = [
    { locale: '', text: 'any', button: 'Any', link: '/' },
    { locale: 'it', text: 'it', button: 'It', link: '/' },
    { locale: 'fr-fr', text: 'fr', button: 'Fr', link: '/fr' },
  ];
  it('takes the language, then the one without language, then the first', () => {
    expect(textsFor(texts, 'it-IT')?.text).toBe('it');
    expect(textsFor(texts, 'fr')?.text).toBe('fr');
    expect(textsFor(texts, 'de')?.text).toBe('any');
    expect(textsFor(texts.slice(1), 'de')?.text).toBe('it');
    expect(textsFor([], 'it')).toBeNull();
  });
});

describe('pages without the bar', () => {
  it('matches pages and everything below a starred one', () => {
    const lines = '/contatti\n  /blog/*\n';
    expect(pathMatches('/contatti/', lines)).toBe(true);
    expect(pathMatches('/contatti-2', lines)).toBe(false);
    expect(pathMatches('/blog', lines)).toBe(true);
    expect(pathMatches('/blog/post', lines)).toBe(true);
    expect(pathMatches('/blogger', lines)).toBe(false);
    expect(pathMatches('/', '')).toBe(false);
  });
});

describe('script configuration', () => {
  const s = settingsOf({
    texts: [{ locale: 'it', text: 'Da 32,50 €', button: 'Demo', link: '/#demo' }],
    anchor: 'demo',
  });

  it('has the site bar, or nothing without texts', () => {
    const c = scriptConfig(s, 'it', none, '/reklaim/track');
    expect(c?.bars).toEqual([
      { id: 'default', anchor: 'demo', text: 'Da 32,50 €', button: 'Demo', link: '/#demo' },
    ]);
    expect(c?.maxWidth).toBe(768);
    expect(c?.track).toBe('/reklaim/track');
    expect(scriptConfig(settingsOf({}), 'it', none, '/t')).toBeNull();
    expect(
      scriptConfig({ ...s, tracking: false, ga_event: 'off' }, 'it', none, '/t'),
    ).toMatchObject({
      track: null,
      gaEvent: '',
    });
  });

  it('puts the bars of Pro first, and takes its screens and position', () => {
    const c = scriptConfig(
      s,
      'it',
      {
        hide: false,
        bars: [
          {
            id: 'Prepara',
            anchor: '#prepara',
            text: 'Gratis',
            button: 'Preparatemi il menu',
            link: '',
          },
          { id: 'bad', anchor: '', text: '', button: 'x', link: 'javascript:x' },
        ],
        desktop: true,
        position: 'top',
      },
      '/t',
    );
    expect(c?.bars.map((b) => [b.id, b.anchor])).toEqual([
      ['Prepara', 'prepara'],
      ['default', 'demo'],
    ]);
    expect(c?.maxWidth).toBe(0);
    expect(c?.position).toBe('top');
  });

  it('writes JSON safe in a script element', () => {
    expect(scriptJson({ a: '</script><b>&' })).toBe(
      '{"a":"\\u003c/script\\u003e\\u003cb\\u003e\\u0026"}',
    );
  });
});

describe('Pro', () => {
  it('puts the answers together and skips failing ones', async () => {
    const api = installServerApi();
    const page = { siteId: 's', locale: 'it', path: '/', route: 'entry' };
    expect(await askPro(api, page)).toEqual({ pro: false, ...none });
    const warnings: string[] = [];
    api.providers.push(
      () => null,
      () => {
        throw new Error('boom');
      },
      () => ({
        bars: [{ id: 'a', anchor: 'x', text: '', button: 'A', link: '' }],
        position: 'top',
      }),
      async () => ({ hide: true, desktop: true }),
    );
    const out = await askPro(api, page, (m) => warnings.push(m));
    expect(out).toMatchObject({ pro: true, hide: true, desktop: true, position: 'top' });
    expect(out.bars).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect((globalThis as Record<symbol, unknown>)[Symbol.for('cleitext.reklaim')]).toBe(api);
  });
});
