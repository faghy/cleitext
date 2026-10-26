import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IT } from '../src/admin/it';
import {
  BLOCK_TYPE,
  CAPABILITY,
  FORM_ID,
  NAME,
  SHORTCODE,
  SLUG,
  SUBMIT_PATH,
  TABLE_PREFIX,
  TEST_ENDPOINT_ENV,
} from '../src/config';
import {
  consentRecord,
  consentText,
  customFieldsOf,
  emailHint,
  hashOf,
  isEmail,
  providerFields,
  readSpec,
  readSubmission,
  signSpec,
  specOf,
  splitName,
} from '../src/model/form';
import { Limiter } from '../src/model/limit';
import {
  DEFAULT_SETTINGS,
  idList,
  isReady,
  labelOf,
  normalizeSettings,
  textsFor,
} from '../src/model/settings';
import { stringsFor } from '../src/model/strings';
import { installOptIn, optInApi, OPTIN_SYMBOL } from '../src/optin';
import { LOG_TABLE } from '../src/schema';
import { parseOwnShortcode } from '../src/shortcode';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('names in one place', () => {
  it('match the manifest, the package and the migrations', () => {
    const manifest = JSON.parse(read('../cleitext.plugin.json')) as {
      slug: string;
      name: string;
      capabilities: string[];
      description: string;
    };
    expect(manifest.slug).toBe(SLUG);
    expect(manifest.name).toBe(NAME.en);
    expect(manifest.capabilities).toEqual([CAPABILITY]);
    expect(manifest.description).toMatch(/^Every subscriber, a new letter\./);
    expect(JSON.parse(read('../package.json')).name).toBe(`@cleitext/plugin-${SLUG}`);
    for (const name of [BLOCK_TYPE, FORM_ID]) expect(name.startsWith(`${SLUG}/`)).toBe(true);
    expect(SUBMIT_PATH).toBe(`/_${SLUG}/subscribe`);
    expect(SHORTCODE).toBe(SLUG);
    expect(TEST_ENDPOINT_ENV).toBe(`${SLUG.toUpperCase().replace(/-/g, '_')}_TEST_ENDPOINT`);
    const dir = new URL('../migrations/', import.meta.url);
    const sql = readdirSync(dir)
      .map((f) => readFileSync(new URL(f, dir), 'utf8'))
      .join('\n');
    const tables = [...sql.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1]!);
    expect(tables).toEqual([LOG_TABLE]);
    for (const t of tables) {
      expect(t.startsWith(TABLE_PREFIX)).toBe(true);
      expect(sql).toContain(`cleitext_enable_tenant_rls('${t}')`);
    }
  });
});

describe('settings', () => {
  it('have defaults and refuse what is not valid', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = normalizeSettings({
      provider: 'mailchimp',
      apiUrl: 'http://not-https.example',
      lists: ['a1', 'a1', ' b2 ', '<x>'],
      tags: 'one, two,,one',
      brevoTemplateId: '12',
      brevoRedirectUrl: 'javascript:alert(1)',
      fields: 'everything',
      layout: 'inline',
      privacyUrl: '//evil.example',
      customFields: [
        { key: 'CITY', label: { en: 'City', it: 'Città', xx1: 'bad' }, required: true },
        { key: 'bad key', label: 'Nope' },
        { key: 'NOLABEL', label: {} },
      ],
      texts: { it: { button: 'Vai', nope: 'x' }, 'not a locale': { button: 'x' } },
      integrations: { forms: false },
      retentionDays: -3,
    });
    expect(s).toMatchObject({
      provider: 'mailchimp',
      apiUrl: '',
      lists: ['a1', 'b2'],
      tags: ['one', 'two'],
      brevoTemplateId: 12,
      brevoRedirectUrl: '',
      fields: 'email',
      layout: 'inline',
      privacyUrl: '',
      texts: { it: { button: 'Vai' } },
      integrations: { forms: false, shop: true, agenda: true },
      retentionDays: 180,
    });
    expect(s.customFields).toEqual([
      { key: 'CITY', label: { en: 'City', it: 'Città' }, required: true },
    ]);
    expect(normalizeSettings({ provider: 'sendgrid' }).provider).toBeNull();
    expect(idList([7, 8])).toEqual(['7', '8']);
    expect(labelOf(s.customFields[0]!, 'it-IT')).toBe('Città');
    expect(labelOf({ key: 'K', label: { de: 'Stadt' }, required: false }, 'fr')).toBe('Stadt');
  });

  it('say when a site can subscribe people', () => {
    const base = normalizeSettings({ provider: 'brevo' });
    expect(isReady(base, true)).toBe(false);
    expect(isReady({ ...base, lists: ['7'] }, true)).toBe(true);
    expect(isReady({ ...base, lists: ['7'] }, false)).toBe(false);
    expect(isReady({ ...base, provider: 'mailerlite' }, true)).toBe(true);
    expect(isReady({ ...base, provider: 'kit' }, true)).toBe(true);
    expect(isReady({ ...base, provider: 'activecampaign', lists: ['1'] }, true)).toBe(false);
    expect(
      isReady({ ...base, provider: 'activecampaign', lists: ['1'], apiUrl: 'https://a.b' }, true),
    ).toBe(true);
  });

  it('give the owner’s texts first', () => {
    const s = normalizeSettings({ texts: { it: { success: 'Evviva!' } } });
    expect(textsFor(s, 'it').success).toBe('Evviva!');
    expect(textsFor(s, 'it').button).toBe('Iscriviti');
    expect(textsFor(s, 'en').success).toBe(stringsFor('en').success);
  });
});

describe('visitors’ texts', () => {
  it('exist in both languages', () => {
    expect(Object.keys(stringsFor('it')).sort()).toEqual(Object.keys(stringsFor('en')).sort());
    expect(stringsFor('de')).toBe(stringsFor('en'));
  });

  it('translate every text of the admin', () => {
    const files = [
      new URL('../src/admin.tsx', import.meta.url),
      ...readdirSync(new URL('../src/admin/', import.meta.url))
        .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
        .map((f) => new URL(`../src/admin/${f}`, import.meta.url)),
    ];
    const missing: string[] = [];
    for (const file of files)
      for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g))
        if (!(m[1]! in IT)) missing.push(m[1]!);
    expect(missing).toEqual([]);
  });
});

describe('the form', () => {
  const settings = normalizeSettings({
    provider: 'brevo',
    lists: ['7'],
    tags: ['site'],
    doubleOptIn: true,
    firstNameKey: 'NOME',
    customFields: [
      { key: 'CITY', label: { en: 'City' }, required: true },
      { key: 'ZIP', label: { en: 'Zip' } },
    ],
  });

  it('takes its lists, tags, double opt-in and fields from the block and the settings', () => {
    expect(specOf({}, settings)).toEqual({
      lists: ['7'],
      tags: ['site'],
      doubleOptIn: true,
      fields: 'email',
      custom: [],
    });
    expect(
      specOf({ lists: '1, 2', tags: 'x', doubleOptIn: 'off', fields: 'all' }, settings),
    ).toEqual({
      lists: ['1', '2'],
      tags: ['site', 'x'],
      doubleOptIn: false,
      fields: 'all',
      custom: ['CITY', 'ZIP'],
    });
    expect(specOf({ doubleOptIn: 'on' }, { ...settings, doubleOptIn: false }).doubleOptIn).toBe(
      true,
    );
    expect(customFieldsOf(specOf({ fields: 'all' }, settings), settings, 'en')).toEqual([
      { key: 'CITY', label: 'City', required: true },
      { key: 'ZIP', label: 'Zip', required: false },
    ]);
  });

  it('is signed, so a visitor cannot point it elsewhere', () => {
    const spec = specOf({}, settings);
    const token = signSpec('k1', spec);
    expect(readSpec('k1', token)).toEqual(spec);
    expect(readSpec('k2', token)).toBeNull();
    const [, mac] = token.split('.');
    const forged = `${Buffer.from(JSON.stringify({ ...spec, lists: ['99'] })).toString('base64url')}.${mac}`;
    expect(readSpec('k1', forged)).toBeNull();
    expect(readSpec('k1', 'x')).toBeNull();
    expect(readSpec('k1', 42)).toBeNull();
    expect(readSpec('k1', 'a'.repeat(5000))).toBeNull();
  });

  it('checks the email, the consent and the required fields', () => {
    const spec = specOf({ fields: 'all' }, settings);
    expect(
      readSubmission(
        {
          email: ' Ada@Example.com ',
          first_name: 'Ada',
          last_name: 'L',
          f_CITY: 'Turin',
          consent: '1',
        },
        spec,
        settings.customFields,
      ),
    ).toEqual({
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'L',
      fields: { CITY: 'Turin' },
      bad: [],
    });
    expect(readSubmission({ email: 'x' }, spec, settings.customFields).bad).toEqual([
      'email',
      'f_CITY',
      'consent',
    ]);
    // Fields the form does not show are ignored.
    expect(
      readSubmission(
        { email: 'a@b.co', first_name: 'A', f_CITY: 'x', consent: 'on' },
        specOf({}, settings),
        settings.customFields,
      ),
    ).toMatchObject({ firstName: '', fields: {}, bad: [] });
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('a b@c.de')).toBe(false);
    expect(isEmail(`${'a'.repeat(250)}@b.co`)).toBe(false);
  });

  it('maps names to the service’s fields when the owner chose them', () => {
    expect(
      providerFields({ firstName: 'Ada', lastName: 'L', fields: { CITY: 'T' } }, settings),
    ).toEqual({ fields: { CITY: 'T', NOME: 'Ada' }, lastName: 'L' });
    expect(providerFields({ firstName: '', lastName: '', fields: {} }, settings)).toEqual({
      fields: {},
    });
    expect(splitName('Grace Brewster Hopper')).toEqual({
      firstName: 'Grace Brewster',
      lastName: 'Hopper',
    });
    expect(splitName(' Ada ')).toEqual({ firstName: 'Ada', lastName: '' });
    expect(splitName('')).toEqual({ firstName: '', lastName: '' });
  });
});

describe('the consent record', () => {
  it('keeps the time, the text read and a hash of the IP address', () => {
    const now = new Date('2030-05-01T08:00:00Z');
    const record = consentRecord({
      key: 'site-key',
      text: consentText(stringsFor('it'), '/privacy'),
      ip: '203.0.113.7',
      source: 'newletter/form',
      page: '/news',
      now,
    });
    expect(record).toEqual({
      at: '2030-05-01T08:00:00.000Z',
      text: 'Acconsento a ricevere la newsletter via email, come descritto nella informativa sulla privacy.',
      ipHash: hashOf('site-key', 'ip', '203.0.113.7'),
      source: 'newletter/form',
      page: '/news',
    });
    expect(record.ipHash).not.toContain('203.0.113.7');
    expect(consentRecord({ key: 'k', text: 'x', source: 's' }).ipHash).toBeNull();
    expect(consentText(stringsFor('en'), '')).toBe(stringsFor('en').consentPlain);
  });

  it('hashes with the site’s key, so other sites cannot match addresses', () => {
    expect(hashOf('k', 'email', 'A@B.co ')).toBe(hashOf('k', 'email', 'a@b.co'));
    expect(hashOf('k', 'email', 'a@b.co')).not.toBe(hashOf('k2', 'email', 'a@b.co'));
    expect(hashOf('k', 'email', 'a@b.co')).not.toBe(hashOf('k', 'ip', 'a@b.co'));
    expect(emailHint('mario.rossi@example.it')).toBe('m•••@e•••.it');
    expect(emailHint('x@localhost')).toBe('x•••@l•••');
  });
});

describe('the rate limiter', () => {
  it('counts per key in a window', () => {
    let now = 0;
    const limiter = new Limiter(2, 1000, () => now);
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
    expect(limiter.allow('b')).toBe(true);
    now = 1500;
    expect(limiter.allow('a')).toBe(true);
  });
});

describe('the opt-in registry', () => {
  it('is found by its key and version', () => {
    const holder = globalThis as unknown as Record<symbol, unknown>;
    try {
      expect(optInApi()).toBeUndefined();
      holder[OPTIN_SYMBOL] = { version: 2 };
      expect(optInApi()).toBeUndefined();
      const api = { version: 1 as const, checkbox: async () => null, subscribe: async () => {} };
      installOptIn(api);
      expect(optInApi()).toBe(api);
      expect(OPTIN_SYMBOL).toBe(Symbol.for('cleitext.newsletter.optIn'));
    } finally {
      delete holder[OPTIN_SYMBOL];
    }
  });
});

describe('the shortcode', () => {
  it('is read only when it stands alone', () => {
    expect(parseOwnShortcode(`[${SHORTCODE}]`)).toEqual({});
    expect(parseOwnShortcode(` [${SHORTCODE} fields="name" layout='inline' lists=1,2 /] `)).toEqual(
      {
        fields: 'name',
        layout: 'inline',
        lists: '1,2',
      },
    );
    expect(parseOwnShortcode(`Join: [${SHORTCODE}]`)).toBeNull();
  });
});
