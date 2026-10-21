import { describe, expect, it } from 'vitest';
import {
  actionFor,
  adminSources,
  DEFAULT_CONFIG,
  formGroup,
  isTestSecret,
  isTrusted,
  messageFor,
  normalizeConfig,
  protects,
  publicIp,
  trustedEntry,
} from './config';

describe('normalizeConfig', () => {
  it('gives the defaults for nothing or rubbish', () => {
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig('x')).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG).toMatchObject({
      provider: 'turnstile',
      minScore: 0.5,
      skipSignedIn: true,
      failsafe: 'off',
      language: 'auto',
    });
    expect(DEFAULT_CONFIG.forms).toMatchObject({ login: true, comments: true, shop: false });
  });

  it('keeps valid values and drops the others', () => {
    const config = normalizeConfig({
      provider: 'recaptcha3',
      siteKey: ' 1x00000000000000000000AA ',
      minScore: '0.74',
      failsafe: 'nope',
      fallbackSiteKey: 'bad key!',
      forms: { login: false, shop: true, unknown: true, comments: 'yes' },
      skipSignedIn: false,
      trustedIps: '203.0.113.7, 198.51.100.0/24\n2001:db8::/32 not-an-ip 10.0.0.1/33 203.0.113.7',
      theme: 'dark',
      size: 'huge',
      appearance: 'interaction-only',
      language: 'it',
      disableSubmit: true,
      messages: { it: '  Sei un   robot? ', en: '', 'bad locale': 'x', de: 42 },
    });
    expect(config).toMatchObject({
      provider: 'recaptcha3',
      siteKey: '1x00000000000000000000AA',
      minScore: 0.7,
      failsafe: 'off',
      fallbackSiteKey: '',
      skipSignedIn: false,
      trustedIps: ['203.0.113.7', '198.51.100.0/24', '2001:db8::/32'],
      theme: 'dark',
      size: 'normal',
      appearance: 'interaction-only',
      language: 'it',
      disableSubmit: true,
      messages: { it: 'Sei un robot?' },
    });
    expect(config.forms).toMatchObject({ login: false, shop: true, comments: true });
    expect(config.forms).not.toHaveProperty('unknown');
    expect(normalizeConfig({ minScore: 2 }).minScore).toBe(0.5);
    expect(normalizeConfig({ language: '<script>' }).language).toBe('auto');
  });
});

describe('forms', () => {
  it('maps form ids to their switch', () => {
    expect(formGroup('core/login')).toBe('login');
    expect(formGroup('core/register')).toBe('register');
    expect(formGroup('core/lost-password')).toBe('password');
    expect(formGroup('core/reset-password')).toBe('password');
    expect(formGroup('core/comment')).toBe('comments');
    expect(formGroup('forms/2b1c')).toBe('forms');
    expect(formGroup('shop/checkout')).toBe('shop');
    expect(formGroup('shop/review')).toBe('comments');
    expect(formGroup('fresco-pro/form')).toBe('builders');
    expect(formGroup('prisma/form')).toBe('builders');
    expect(formGroup('events/rsvp')).toBe('other');
    expect(formGroup('core/admin-login')).toBe('admin');
    expect(formGroup('core/admin-lost-password')).toBe('admin');
    expect(formGroup('core/admin-reset-password')).toBe('admin');
    expect(DEFAULT_CONFIG.forms.admin).toBe(true);
  });

  it('skips signed-in people when asked', () => {
    const config = normalizeConfig({ forms: { shop: false } });
    expect(protects(config, { form: 'core/comment', signedIn: false })).toBe(true);
    expect(protects(config, { form: 'core/comment', signedIn: true })).toBe(false);
    expect(protects(config, { form: 'shop/checkout', signedIn: false })).toBe(false);
    const always = normalizeConfig({ skipSignedIn: false });
    expect(protects(always, { form: 'core/comment', signedIn: true })).toBe(true);
  });
});

describe('addresses', () => {
  it('checks the trusted list, single addresses and ranges', () => {
    const list = ['203.0.113.7', '198.51.100.0/24', '2001:db8::/32'];
    expect(isTrusted('203.0.113.7', list)).toBe(true);
    expect(isTrusted('::ffff:203.0.113.7', list)).toBe(true);
    expect(isTrusted('198.51.100.200', list)).toBe(true);
    expect(isTrusted('198.51.101.1', list)).toBe(false);
    expect(isTrusted('2001:db8:1::5', list)).toBe(true);
    expect(isTrusted('2001:db9::1', list)).toBe(false);
    expect(isTrusted('not an ip', list)).toBe(false);
    expect(isTrusted('203.0.113.7', [])).toBe(false);
    expect(trustedEntry('10.0.0.0/8')).toBe('10.0.0.0/8');
    expect(trustedEntry('10.0.0.0/40')).toBeNull();
    expect(trustedEntry('example.com')).toBeNull();
  });

  it('sends only public addresses to the provider', () => {
    expect(publicIp('203.0.113.7')).toBe('203.0.113.7');
    expect(publicIp('::ffff:8.8.8.8')).toBe('8.8.8.8');
    expect(publicIp('2a00:1450::1')).toBe('2a00:1450::1');
    for (const local of [
      '10.0.0.200',
      '127.0.0.1',
      '192.168.1.5',
      '172.20.0.1',
      '::1',
      'fd00::1',
      'x',
    ])
      expect(publicIp(local)).toBeNull();
  });
});

describe('admin Content Security Policy', () => {
  it('allows only the active provider', () => {
    expect(adminSources(normalizeConfig({}))).toEqual({
      script: ['https://challenges.cloudflare.com'],
      frame: ['https://challenges.cloudflare.com'],
    });
    const google = adminSources(normalizeConfig({ provider: 'recaptcha3' }));
    expect(google.script).toEqual([
      'https://www.google.com/recaptcha/',
      'https://www.gstatic.com/recaptcha/',
    ]);
    expect(google.frame).not.toContain('https://challenges.cloudflare.com');
    const failsafe = adminSources(
      normalizeConfig({
        failsafe: 'recaptcha',
        fallbackSiteKey: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
      }),
    );
    expect(failsafe.script).toEqual([
      'https://challenges.cloudflare.com',
      'https://www.google.com/recaptcha/',
      'https://www.gstatic.com/recaptcha/',
    ]);
    expect(adminSources(normalizeConfig({ forms: { admin: false } }))).toEqual({
      script: [],
      frame: [],
    });
  });
});

describe('texts and names', () => {
  it('names the actions as the providers accept them', () => {
    expect(actionFor('turnstile', 'core/lost-password')).toBe('core_lost-password');
    expect(actionFor('turnstile', 'forms/0f8e9c1a-1111-2222-3333-444455556666')).toHaveLength(32);
    expect(actionFor('recaptcha3', 'fresco-pro/form')).toBe('fresco_pro/form');
  });

  it('gives the message in the page language, custom first', () => {
    const config = normalizeConfig({ messages: { it: 'No robot, grazie.' } });
    expect(messageFor(config, 'it')).toBe('No robot, grazie.');
    expect(messageFor(config, 'en')).toBe(
      'Please confirm that you are not a robot, then try again.',
    );
    expect(messageFor(normalizeConfig({}), 'it-CH')).toBe(
      'Conferma di non essere un robot, poi riprova.',
    );
    expect(messageFor(normalizeConfig({}), 'de')).toBe(
      'Please confirm that you are not a robot, then try again.',
    );
  });

  it('knows the test secrets', () => {
    expect(isTestSecret('1x0000000000000000000000000000000AA')).toBe(true);
    expect(isTestSecret('2x0000000000000000000000000000000AA')).toBe(true);
    expect(isTestSecret('0x4AAAAAAA-real-secret')).toBe(false);
  });
});
