/**
 * The plugin on a fake core: connecting a service, the block, the form's
 * submissions (checks, bot protection, rate limits, consent record), the
 * "subscribe me" registry for other plugins, privacy and the import hooks.
 */
import type { CxdBlock } from '@cleitext/plugin-sdk';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BLOCK_TYPE, FORM_ID, OPTIN_FIELD, SLUG, SUBMIT_PATH } from '../src/config';
import { optInApi, OPTIN_SYMBOL } from '../src/optin';
import { setupNewLetter } from '../src/server';
import { fakeContext, memoryStore } from './fake-ctx';
import { fakeHttp } from './fake-http';

const SITE = 'site-1';
let ipN = 0;
/** A new visitor's address for each submission, so the rate limits stay out of the way. */
const nextIp = () => `192.0.2.${++ipN % 250}`;

function brevoService() {
  return fakeHttp({
    'GET api.brevo.com/v3/account': (r) =>
      r.headers['api-key'] === 'good-key'
        ? { status: 200, body: { companyName: 'Acme' } }
        : { status: 401, body: { message: 'Key not found' } },
    'GET api.brevo.com/v3/contacts/lists': () => ({
      status: 200,
      body: { lists: [{ id: 7, name: 'News' }] },
    }),
    'GET api.brevo.com/v3/contacts/*': (r) =>
      r.url.includes('old%40example.com')
        ? { status: 200, body: { listIds: [7] } }
        : { status: 404, body: {} },
    'POST api.brevo.com/v3/contacts': (r) =>
      String(r.json.email).startsWith('bad')
        ? { status: 400, body: { message: 'Invalid email address' } }
        : { status: 201, body: { id: 1 } },
    'POST api.brevo.com/v3/contacts/doubleOptinConfirmation': () => ({ status: 201 }),
  });
}

async function setup(options: Parameters<typeof fakeContext>[0] = {}) {
  const fake = fakeContext(options);
  const service = brevoService();
  const store = memoryStore();
  setupNewLetter(fake.ctx, { store, http: service.http });
  await fake.ctx.storage.set(SITE, 'active', true);
  return { ...fake, service, store };
}

async function connect(f: Awaited<ReturnType<typeof setup>>, settings: object = {}) {
  await f.api('PUT', '/connection', { provider: 'brevo', key: 'good-key' });
  await f.api('PUT', '/settings', { lists: ['7'], doubleOptIn: false, ...settings });
}

async function render(f: Awaited<ReturnType<typeof setup>>, attrs: object = {}, preview = false) {
  const block = f.blocks.find((b) => b.type === BLOCK_TYPE)!;
  const context = { siteId: SITE, locale: 'en', tag: () => undefined, signedIn: false };
  const data = await block.load!(attrs as never, context as never);
  return renderToStaticMarkup(
    block.render({
      attrs: attrs as never,
      data,
      block: { id: 'b_1', type: BLOCK_TYPE, v: 1, attrs: {} },
      context: { ...context, preview } as never,
      children: null,
    } as never) as never,
  );
}

/** The signed spec of the form drawn by the block. */
async function specOf(f: Awaited<ReturnType<typeof setup>>, attrs: object = {}) {
  const html = await render(f, attrs);
  return /name="_spec" value="([^"]+)"/.exec(html)![1]!;
}

const subscribeCalls = (f: Awaited<ReturnType<typeof setup>>) =>
  f.service.calls.filter((c) => c.method === 'POST' && c.url.includes('/contacts'));

afterEach(() => {
  delete (globalThis as unknown as Record<symbol, unknown>)[OPTIN_SYMBOL];
});

describe('connecting a service', () => {
  it('stores the key as a secret, never gives it back, and checks it first', async () => {
    const f = await setup();
    const refused = (await f.api('PUT', '/connection', { provider: 'brevo', key: 'nope' })) as {
      status: number;
      body: { code: string };
    };
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('invalid-key');
    expect(f.secrets.get(`${SITE}|api-key`)).toBeUndefined();

    const ok = (await f.api('PUT', '/connection', { provider: 'brevo', key: 'good-key' })) as {
      body: { settings: { provider: string; account: string }; hasKey: boolean };
    };
    expect(ok.body.hasKey).toBe(true);
    expect(ok.body.settings).toMatchObject({ provider: 'brevo', account: 'Acme' });
    expect(f.secrets.get(`${SITE}|api-key`)).toBe('good-key');
    const read = await f.api('GET', '/settings');
    expect(JSON.stringify(read)).not.toContain('good-key');
    expect(await f.api('POST', '/verify', {})).toEqual({ body: { ok: true, account: 'Acme' } });
    expect(await f.api('GET', '/lists')).toEqual({ body: [{ id: '7', name: 'News' }] });
    // Settings never change the connection.
    await f.api('PUT', '/settings', { provider: 'mailchimp', lists: ['7'] });
    expect(
      ((await f.api('GET', '/settings')) as { body: { settings: { provider: string } } }).body
        .settings.provider,
    ).toBe('brevo');
    expect(f.invalidated.at(-1)).toEqual(['site']);
    // A new service needs its key.
    const noKey = (await f.api('PUT', '/connection', { provider: 'kit' })) as { status: number };
    expect(noKey.status).toBe(400);
    await f.api('DELETE', '/connection');
    expect(f.secrets.get(`${SITE}|api-key`)).toBeUndefined();
  });
});

describe('the block', () => {
  it('shows nothing until a service is connected (a note in the editor)', async () => {
    const f = await setup();
    expect(await render(f)).toBe('');
    expect(await render(f, {}, true)).toContain('not connected');
  });

  it('draws an accessible form that works without JavaScript', async () => {
    const f = await setup();
    await connect(f, { privacyUrl: '/privacy' });
    const html = await render(f, { heading: 'Stay in touch', fields: 'name', buttonLabel: 'Join' });
    expect(html).toContain(`<form action="${SUBMIT_PATH}" method="post">`);
    expect(html).toContain('<h2 class="cx-nl__heading">Stay in touch</h2>');
    expect(html).toMatch(/<label for="nl-b_1-email">Email/);
    expect(html).toContain('type="email"');
    expect(html).toContain('name="first_name"');
    expect(html).not.toContain('name="last_name"');
    // The consent: required, never ticked, with the privacy link.
    const consent = /<input id="nl-b_1-consent"[^>]*>/.exec(html)![0];
    expect(consent).toContain('required=""');
    expect(consent).not.toContain('checked');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('<div class="captcha"></div>');
    expect(html).toContain('>Join</button>');
    for (const outcome of ['success', 'pending', 'already', 'error', 'invalid', 'check', 'busy'])
      expect(html).toContain(`id="nl-b_1-${outcome}"`);
    expect(html).toContain('data-newletter=');
  });

  it('puts the button on the row of the inline layout', async () => {
    const f = await setup();
    await connect(f);
    f.ctx.forms!.challenge = async () => '';
    const html = await render(f, { layout: 'inline' });
    expect(html).toContain('cx-nl--inline');
    expect(html.indexOf('</button>')).toBeLessThan(html.indexOf('name="consent"'));
  });

  it('replaces [newletter] standing alone in a paragraph', async () => {
    const f = await setup();
    const blocks: CxdBlock[] = [
      {
        id: 'p1',
        type: 'core/paragraph',
        v: 1,
        attrs: {},
        content: [{ text: `[${SLUG} fields="name"]` }],
      },
      { id: 'p2', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Hello' }] },
    ] as CxdBlock[];
    const out = (await f.filter('render.blocks', blocks, {})) as CxdBlock[];
    expect(out[0]).toMatchObject({ id: 'p1', type: BLOCK_TYPE, attrs: { fields: 'name' } });
    expect(out[1]).toBe(blocks[1]);
  });
});

describe('a submission', () => {
  let f: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    f = await setup();
    await connect(f, { privacyUrl: '/privacy' });
  });

  const form = (spec: string, extra: Record<string, unknown> = {}) => ({
    _uid: 'nl-b_1',
    _spec: spec,
    _locale: 'en',
    email: 'Ada@Example.com',
    first_name: 'Ada',
    consent: '1',
    ...extra,
  });

  it('subscribes, goes back to the page and records the consent', async () => {
    const spec = await specOf(f, { fields: 'name' });
    const ip = nextIp();
    const res = await f.post(SUBMIT_PATH, form(spec), { ip });
    expect(res).toEqual({ status: 303, headers: { location: '/news#nl-b_1-success' } });
    const sent = subscribeCalls(f);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.json).toMatchObject({
      email: 'ada@example.com',
      listIds: [7],
      attributes: { FIRSTNAME: 'Ada' },
    });
    const [row] = f.store.rows;
    expect(row).toMatchObject({ status: 'subscribed', source: 'form', listIds: ['7'] });
    expect(row!.emailHint).toBe('a•••@e•••.com');
    expect(row!.consent).toMatchObject({
      text: 'I agree to receive the newsletter by email, as described in the privacy policy.',
      source: FORM_ID,
      page: '/news',
    });
    expect(Date.parse(row!.consent!.at)).toBeGreaterThan(Date.now() - 60_000);
    expect(row!.consent!.ipHash).toMatch(/^[0-9a-f]{32}$/);
    // Nothing in clear in the log.
    expect(JSON.stringify(f.store.rows)).not.toMatch(/ada@example\.com|192\.0\.2\./i);
    // The bot protection was asked, with hold.
    expect(f.verified.at(-1)).toMatchObject({ form: FORM_ID, ip, hold: true });
  });

  it('answers JSON to the script', async () => {
    const spec = await specOf(f);
    const res = await f.post(SUBMIT_PATH, form(spec), {
      ip: nextIp(),
      headers: { accept: 'application/json', host: 'example.com' },
    });
    expect(res).toMatchObject({
      status: 200,
      body: { outcome: 'success', message: 'Thank you! You are subscribed.' },
    });
  });

  it('says already subscribed, and pending with double opt-in', async () => {
    const spec = await specOf(f);
    const res = await f.post(SUBMIT_PATH, form(spec, { email: 'old@example.com' }), {
      ip: nextIp(),
    });
    expect((res.headers as Record<string, string>).location).toBe('/news#nl-b_1-already');
    await f.api('PUT', '/settings', {
      doubleOptIn: true,
      brevoTemplateId: 3,
      brevoRedirectUrl: 'https://example.com/ok',
    });
    const doi = await specOf(f);
    const pending = await f.post(SUBMIT_PATH, form(doi), { ip: nextIp() });
    expect((pending.headers as Record<string, string>).location).toBe('/news#nl-b_1-pending');
    expect(f.store.rows[0]!.status).toBe('pending');
  });

  it('refuses wrong fields, a missing consent and a forged form', async () => {
    const spec = await specOf(f);
    const json = { ip: nextIp(), headers: { accept: 'application/json', host: 'example.com' } };
    expect((await f.post(SUBMIT_PATH, form(spec, { email: 'nope' }), json)).body).toMatchObject({
      outcome: 'invalid',
      fields: ['email'],
    });
    expect(
      (await f.post(SUBMIT_PATH, form(spec, { consent: undefined }), json)).body,
    ).toMatchObject({ outcome: 'invalid', fields: ['consent'] });
    const forged = spec.replace(/^[^.]+/, Buffer.from('{"lists":["99"]}').toString('base64url'));
    expect((await f.post(SUBMIT_PATH, form(forged), json)).body).toMatchObject({
      outcome: 'error',
    });
    expect(subscribeCalls(f)).toHaveLength(0);
  });

  it('marks the email when the service refuses it, and logs the error', async () => {
    const spec = await specOf(f);
    const res = await f.post(SUBMIT_PATH, form(spec, { email: 'bad@example.com' }), {
      ip: nextIp(),
      headers: { accept: 'application/json', host: 'example.com' },
    });
    expect(res.body).toMatchObject({ outcome: 'invalid', fields: ['email'] });
    expect(f.store.rows[0]).toMatchObject({ status: 'error' });
    expect(f.store.rows[0]!.error).toMatch(/^invalid-email/);
  });

  it('lets bots believe it worked (hidden field)', async () => {
    const spec = await specOf(f);
    const res = await f.post(SUBMIT_PATH, form(spec, { website: 'http://spam' }), { ip: nextIp() });
    expect((res.headers as Record<string, string>).location).toBe('/news#nl-b_1-success');
    expect(subscribeCalls(f)).toHaveLength(0);
    expect(f.store.rows).toHaveLength(0);
  });

  it('limits the attempts of one address', async () => {
    const spec = await specOf(f);
    const ip = nextIp();
    const outcomes: string[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await f.post(SUBMIT_PATH, form(spec, { email: `p${i}@example.com` }), { ip });
      outcomes.push(
        String((res.headers as Record<string, string>).location)
          .split('-')
          .pop()!,
      );
    }
    expect(outcomes.slice(0, 6).every((o) => o === 'success')).toBe(true);
    expect(outcomes[6]).toBe('busy');
  });
});

describe('the site’s bot protection', () => {
  it('refuses, drops quietly, or holds spam until it is released', async () => {
    let verdict: {
      ok: boolean;
      message?: string;
      silent?: boolean;
      spam?: boolean;
      challenge?: boolean;
    } = { ok: false, message: 'Solve the captcha.', challenge: true };
    const f = await setup({ verify: () => verdict });
    await connect(f);
    const spec = await specOf(f);
    const send = (email: string, json = false) =>
      f.post(
        SUBMIT_PATH,
        { _uid: 'nl-b_1', _spec: spec, email, consent: '1' },
        {
          ip: nextIp(),
          ...(json ? { headers: { accept: 'application/json', host: 'example.com' } } : {}),
        },
      );

    expect((await send('a@example.com', true)).body).toMatchObject({
      outcome: 'check',
      message: 'Solve the captcha.',
      challenge: true,
    });
    const back = await send('a@example.com');
    expect((back.headers as Record<string, string>).location).toBe(
      `/news?cl-challenge=${encodeURIComponent(FORM_ID)}#nl-b_1-check`,
    );

    verdict = { ok: false, silent: true };
    expect((await send('b@example.com', true)).body).toMatchObject({ outcome: 'success' });

    verdict = { ok: true, spam: true };
    expect((await send('c@example.com', true)).body).toMatchObject({ outcome: 'success' });
    expect(f.store.rows[0]).toMatchObject({ status: 'spam' });
    expect(subscribeCalls(f)).toHaveLength(0);

    // Released as not spam: subscribed with what the protection kept.
    const held = f.verified.at(-1) as { fields: Record<string, unknown> };
    await f.emit(
      'form.released',
      { form: FORM_ID, fields: held.fields, locale: 'en' },
      { siteId: SITE },
    );
    expect(subscribeCalls(f)).toHaveLength(1);
    expect(f.store.rows[0]).toMatchObject({ status: 'subscribed' });
    expect(f.store.rows[0]!.consent!.ipHash).toMatch(/^[0-9a-f]{32}$/);
    // Other forms' releases are not ours.
    await f.emit(
      'form.released',
      { form: 'forms/contact', fields: held.fields, locale: 'en' },
      { siteId: SITE },
    );
    expect(subscribeCalls(f)).toHaveLength(1);
  });
});

describe('"subscribe me" in other plugins', () => {
  it('offers the box only where it is active, connected and wanted', async () => {
    const f = await setup();
    const api = optInApi()!;
    expect(api).toBeTruthy();
    const ask = (source: string, locale = 'en') => api.checkbox({ siteId: SITE, locale, source });
    expect(await ask('forms')).toBeNull(); // not connected
    await connect(f);
    expect(await ask('forms')).toEqual({
      name: OPTIN_FIELD,
      label: 'Subscribe me to the newsletter',
    });
    expect(await ask('agenda', 'it')).toEqual({
      name: OPTIN_FIELD,
      label: 'Iscrivimi alla newsletter',
    });
    expect(await ask('unknown')).toBeNull();
    await f.api('PUT', '/settings', { integrations: { forms: true, shop: false, agenda: true } });
    expect(await ask('shop')).toBeNull();
    await f.ctx.storage.delete(SITE, 'active');
    expect(await ask('forms')).toBeNull();
  });

  it('subscribes in the background to the integration lists, with the box as consent', async () => {
    const f = await setup();
    await connect(f, { integrationLists: ['9'], texts: { en: { optIn: 'Send me news' } } });
    await optInApi()!.subscribe({
      siteId: SITE,
      source: 'shop',
      email: ' Grace@Example.com ',
      name: 'Grace Brewster Hopper',
      locale: 'en',
      ip: '203.0.113.5',
    });
    await new Promise((r) => setTimeout(r, 10));
    const [call] = subscribeCalls(f);
    expect(call!.json).toMatchObject({
      email: 'grace@example.com',
      listIds: [9],
      attributes: { FIRSTNAME: 'Grace Brewster', LASTNAME: 'Hopper' },
    });
    expect(f.store.rows[0]).toMatchObject({ source: 'shop', status: 'subscribed' });
    expect(f.store.rows[0]!.consent).toMatchObject({ text: 'Send me news', source: 'shop' });
    // Never throws, never subscribes without a valid email or for a source turned off.
    await optInApi()!.subscribe({ siteId: SITE, source: 'forms', email: 'nope', locale: 'en' });
    await f.api('PUT', '/settings', { integrations: { forms: false, shop: true, agenda: true } });
    await optInApi()!.subscribe({
      siteId: SITE,
      source: 'forms',
      email: 'x@example.com',
      locale: 'en',
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(subscribeCalls(f)).toHaveLength(1);
  });
});

describe('privacy and retention', () => {
  it('exports and erases a person’s subscriptions by email, and writes a policy section', async () => {
    const f = await setup();
    await connect(f, { retentionDays: 30 });
    const spec = await specOf(f);
    await f.post(
      SUBMIT_PATH,
      { _uid: 'nl-b_1', _spec: spec, email: 'ada@example.com', consent: '1' },
      { ip: nextIp() },
    );
    const exported = (await f.exporters[0]!.export(SITE, 'ada@example.com')) as {
      items: Record<string, string>[];
    }[];
    expect(exported[0]!.items[0]).toMatchObject({
      status: 'subscribed',
      lists: '7',
      service: 'brevo',
    });
    expect(await f.exporters[0]!.export(SITE, 'other@example.com')).toEqual([]);
    expect(await f.erasers[0]!.erase(SITE, 'ada@example.com')).toMatchObject({ removed: 1 });
    expect(f.store.rows).toHaveLength(0);

    const registry = (
      globalThis as unknown as Record<
        symbol,
        Map<string, (i: object) => Promise<{ title: string; text: string }[]>>
      >
    )[Symbol.for('cleitext.privacy.policySections')]!;
    const [section] = await registry.get(SLUG)!({ siteId: SITE, locale: 'it' });
    expect(section!.text).toContain('Brevo');
    expect(section!.text).toContain('30 giorni');
  });

  it('forgets old lines after the days set', async () => {
    const f = await setup();
    await connect(f, { retentionDays: 10 });
    await f.store.add(SITE, {
      source: 'form',
      provider: 'brevo',
      status: 'subscribed',
      emailHash: 'h',
      emailHint: 'x',
      locale: 'en',
    });
    f.store.rows[0]!.createdAt = new Date(Date.now() - 11 * 86400_000).toISOString();
    await f.tasks.get('retention')!(SITE);
    expect(f.store.rows).toHaveLength(0);
    expect(((await f.api('GET', '/log')) as { body: unknown[] }).body).toEqual([]);
  });
});

describe('WordPress import hooks', () => {
  it('turn Mailchimp for WP forms into the block with their lists', async () => {
    const f = await setup();
    await f.filter(
      'import.wxrMeta',
      {},
      {
        siteId: SITE,
        items: [
          {
            id: 12,
            type: 'mc4wp-form',
            title: 'Signup',
            content: '<p><input type="email" name="EMAIL"><input type="submit" value="Join"></p>',
            meta: { _mc4wp_settings: 'a:1:{s:5:"lists";a:1:{i:0;s:10:"abcdef1234";}}' },
          },
        ],
        metaValue: (text: string | undefined) => {
          if (!text) return null;
          return { lists: [/s:10:"(\w+)"/.exec(text)![1]] };
        },
      },
    );
    const out = (await f.filter('import.shortcode', null, {
      siteId: SITE,
      tag: 'mc4wp_form',
      attrs: { id: '12' },
      content: null,
      text: '[mc4wp_form id="12"]',
    })) as CxdBlock[];
    expect(out[0]).toMatchObject({
      type: BLOCK_TYPE,
      attrs: { lists: 'abcdef1234', ref: 'mc4wp:12' },
    });
    expect(
      await f.filter('import.shortcode', null, { siteId: SITE, tag: 'gallery', attrs: {} }),
    ).toBeNull();
    const embed = (await f.filter('import.block', null, {
      siteId: SITE,
      name: 'core/html',
      attrs: {},
      html: '<form action="https://x.us21.list-manage.com/subscribe/post?u=1&amp;id=LIST9"><input name="EMAIL"></form>',
      children: [],
    })) as CxdBlock[];
    expect(embed[0]).toMatchObject({ type: BLOCK_TYPE, attrs: { lists: 'LIST9' } });
  });

  it('uses an imported form’s lists only with the service they belong to', async () => {
    const f = await setup();
    await connect(f);
    const html = await render(f, { lists: 'LIST9', ref: 'mailchimp' });
    const spec = /name="_spec" value="([^".]+)/.exec(html)![1]!;
    expect(JSON.parse(Buffer.from(spec, 'base64url').toString()).lists).toEqual(['7']);
  });
});
