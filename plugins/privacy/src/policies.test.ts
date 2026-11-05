import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, textsFor } from './config';
import { policy } from './policies';

describe('privacy policy', () => {
  it('adds the sections of other plugins, as text, to the privacy policy only', () => {
    const sections = [{ title: 'Booking <appointments>', text: 'We use your name & email.' }];
    const site = { name: 'Studio', url: 'https://studio.test' };
    const privacy = JSON.stringify(
      policy('privacy', DEFAULT_CONFIG, 'en', site, {}, [], sections).document,
    );
    expect(privacy).toContain('"text":"Booking <appointments>"');
    expect(privacy).toContain('We use your name & email.');
    const cookies = JSON.stringify(
      policy('cookies', DEFAULT_CONFIG, 'en', site, {}, [], sections).document,
    );
    expect(cookies).not.toContain('Booking');
  });
});

describe('cookie policy', () => {
  const site = { name: 'Studio', url: 'https://studio.test' };
  const text = (config: typeof DEFAULT_CONFIG, locale: string) =>
    JSON.stringify(policy('cookies', config, locale, site, {}).document);

  it('with the banner: how to choose, the preferences button and third parties', () => {
    const it = text(DEFAULT_CONFIG, 'it');
    expect(it).toContain('Alla prima visita un banner');
    expect(it).toContain('privacy/preferences');
  });

  it('with only technical cookies: no banner, no button, no consent', () => {
    for (const banner of [
      { ...DEFAULT_CONFIG.banner, categories: [] },
      { ...DEFAULT_CONFIG.banner, enabled: false },
    ]) {
      const config = { ...DEFAULT_CONFIG, banner };
      const it = text(config, 'it');
      expect(it).toContain('solo cookie tecnici');
      expect(it).toContain('privacy/cookie-table');
      expect(it).not.toContain('privacy/preferences');
      expect(it).not.toContain('banner ti chiede');
      expect(it).not.toContain('dopo il tuo consenso');
      expect(text(config, 'en')).toContain('only uses technical cookies');
    }
  });

  it('a consent manager keeps the banner text, even without categories here', () => {
    const config = {
      ...DEFAULT_CONFIG,
      banner: { ...DEFAULT_CONFIG.banner, categories: [] },
      cmp: { ...DEFAULT_CONFIG.cmp, provider: 'cookiebot' as const },
    };
    expect(text(config, 'it')).toContain('privacy/preferences');
  });
});

describe('Spanish', () => {
  const site = { name: 'Estudio', url: 'https://estudio.test' };
  const text = (kind: 'privacy' | 'cookies', config: typeof DEFAULT_CONFIG) =>
    policy(kind, config, 'es-ES', site, { privacy: '/es/privacidad', cookies: '/es/cookies' });

  it('writes both policies in Spanish, with Spanish titles', () => {
    const privacy = text('privacy', DEFAULT_CONFIG);
    expect(privacy.title).toBe('Política de privacidad');
    const body = JSON.stringify(privacy.document);
    expect(body).toContain('Responsable del tratamiento');
    expect(body).toContain('www.aepd.es');
    expect(body).toContain('Última actualización');
    const cookies = text('cookies', DEFAULT_CONFIG);
    expect(cookies.title).toBe('Política de cookies');
    expect(JSON.stringify(cookies.document)).toContain('En tu primera visita un banner');
  });

  it('only technical cookies, in Spanish', () => {
    const config = { ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, categories: [] } };
    const body = JSON.stringify(text('cookies', config).document);
    expect(body).toContain('solo usa cookies técnicas');
    expect(body).not.toContain('privacy/preferences');
  });
});

describe('banner texts', () => {
  it('has Spanish, and English for languages it does not know', () => {
    expect(textsFor('es-ES').accept).toBe('Aceptar todas');
    expect(textsFor('fr').accept).toBe('Accept all');
  });
});
