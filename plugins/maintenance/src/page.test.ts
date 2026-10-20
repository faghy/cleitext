import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  normalizeConfig,
  renderPage,
  secondsUntil,
  textsFor,
  type MaintenanceConfig,
} from './page';

const NOW = Date.parse('2026-10-20T10:00:00Z');
const site = { title: 'Bistro', timezone: 'Europe/Rome' };

function page(config: Partial<MaintenanceConfig>, locale = 'en', extra = {}) {
  return renderPage({
    config: { ...DEFAULT_CONFIG, ...config },
    locale,
    defaultLocale: 'en',
    site: { ...site, ...extra },
    now: NOW,
  });
}

describe('maintenance page', () => {
  it('is a whole document with the language, noindex and the default texts', () => {
    const html = page({});
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('<h1>Site under maintenance</h1>');
    expect(html).toContain('We’ll be back soon.');
    expect(html).toContain('<title>Site under maintenance – Bistro</title>');
    expect(html).toContain('href="https://cleitext.com"');
    expect(html).toContain('Made with Cleitext');
    expect(html).toContain('<svg');
    // Self-contained: no scripts, no external styles or fonts.
    expect(html).not.toMatch(/<script|<link rel="stylesheet"|@import|@font-face/);
  });

  it('speaks Italian', () => {
    const html = page({}, 'it');
    expect(html).toContain('<html lang="it">');
    expect(html).toContain('<h1>Sito in manutenzione</h1>');
    expect(html).toContain('Torniamo presto.');
    expect(html).toContain('Realizzato con Cleitext');
  });

  it('uses the texts written for each language', () => {
    const config = {
      texts: {
        en: { title: 'New menu soon', message: '' },
        it: { title: 'Nuovo menu in arrivo', message: 'Riapriamo lunedì' },
      },
    };
    expect(page(config, 'en')).toContain('<h1>New menu soon</h1>');
    expect(page(config, 'en')).toContain('We’ll be back soon.');
    expect(page(config, 'it')).toContain('<h1>Nuovo menu in arrivo</h1>');
    expect(page(config, 'it')).toContain('Riapriamo lunedì');
    // A language without built-in texts: those of the default language.
    const de = textsFor({ ...DEFAULT_CONFIG, ...config }, 'de', 'en');
    expect(de.title).toBe('New menu soon');
  });

  it('escapes everything written by people', () => {
    const html = page(
      {
        texts: { en: { title: '<script>alert(1)</script>', message: 'a & b\n"quoted"' } },
        email: 'info@bistro.example',
      },
      'en',
      { title: 'Bistro <b>"&"</b>', logoUrl: 'javascript:alert(1)' },
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('a &amp; b<br>&quot;quoted&quot;');
    expect(html).toContain('Bistro &lt;b&gt;&quot;&amp;&quot;&lt;/b&gt;');
    expect(html).not.toContain('javascript:');
  });

  it('shows the logo, else the icon, else the site title', () => {
    expect(page({}, 'en', { logoUrl: 'https://x.test/media/logo.png' })).toContain(
      '<img class="brand-image" src="https://x.test/media/logo.png" alt="Bistro">',
    );
    const icon = page({}, 'en', { iconUrl: 'https://x.test/media/icon.png' });
    expect(icon).toContain('class="brand-image brand-icon" src="https://x.test/media/icon.png"');
    expect(icon).toContain('<link rel="icon" href="https://x.test/media/icon.png">');
    expect(page({})).toContain('<span class="brand-name">Bistro</span>');
    expect(page({ showLogo: false })).not.toContain('class="brand');
  });

  it('shows the return date in the visitor’s language and the site’s time zone', () => {
    const returnAt = '2026-10-22T16:30:00.000Z';
    const en = page({ returnAt });
    expect(en).toContain(`Back on <time datetime="${returnAt}">October 22, 2026`);
    expect(en).toContain('6:30');
    const it = page({ returnAt }, 'it');
    expect(it).toContain('Di nuovo online il <time');
    expect(it).toContain('22 ottobre 2026');
    expect(it).toContain('18:30');
    // A date already gone is not shown.
    expect(page({ returnAt: '2026-10-01T00:00:00Z' })).not.toContain('<time');
  });

  it('links the contact address', () => {
    expect(page({ email: 'hello@bistro.example' }, 'it')).toContain(
      'Per contattarci: <a href="mailto:hello@bistro.example">hello@bistro.example</a>',
    );
    expect(page({})).not.toContain('mailto:');
  });

  it('has a coming-soon mode', () => {
    expect(page({ mode: 'coming-soon' })).toContain('<h1>Coming soon</h1>');
    expect(page({ mode: 'coming-soon' }, 'it')).toContain('<h1>Prossimamente</h1>');
  });

  it('uses the chosen colours', () => {
    const html = page({ colors: { background: '#000000', text: '#ffffff', accent: '#ff0066' } });
    expect(html).toContain(':root{--bg:#000000;--fg:#ffffff;--accent:#ff0066}');
  });
});

describe('settings', () => {
  it('keeps only valid values', () => {
    const config = normalizeConfig({
      mode: 'nonsense',
      texts: { it: { title: ' Ciao ', message: 7 }, '<x>': { title: 'no' }, fr: { title: '' } },
      returnAt: 'not a date',
      email: 'not an email',
      colors: { background: 'red', text: '#ABCDEF', accent: '#12345' },
      showLogo: 'yes',
    });
    expect(config).toEqual({
      mode: 'maintenance',
      texts: { it: { title: 'Ciao', message: '' } },
      returnAt: null,
      email: '',
      colors: { background: '#f8fafc', text: '#abcdef', accent: '#0369a1' },
      showLogo: true,
    });
    expect(normalizeConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig({ email: 'a@b.example', mode: 'coming-soon' })).toMatchObject({
      email: 'a@b.example',
      mode: 'coming-soon',
    });
  });

  it('gives Retry-After only for a date in the future', () => {
    expect(secondsUntil('2026-10-20T11:00:00Z', NOW)).toBe(3600);
    expect(secondsUntil('2026-10-20T09:00:00Z', NOW)).toBeUndefined();
    expect(secondsUntil(null, NOW)).toBeUndefined();
  });
});
