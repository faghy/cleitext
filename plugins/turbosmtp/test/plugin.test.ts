/** turboSMTP: the connection, the sending by API and by SMTP, the test email and the statistics. */
import { readFileSync } from 'node:fs';
import type { OutgoingMail } from '@cleitext/plugin-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanKeys, sendPayload, TurboError } from '../src/api';
import { CAPABILITY, NAME, SLUG } from '../src/config';
import { chosenSender, decodeAggs, messageRow, normalizeSettings, statusesOf } from '../src/model';
import { setupTurboSmtp, testEndpoint } from '../src/server';
import { fakeContext, fakeTurbo, type FakeTurbo } from './fake';

const API = 'pro.api.serversmtp.com/api/v2';
const SEND = 'api.turbo-smtp.com/api/v2/mail/send';

const mail = (over: Partial<OutgoingMail> = {}): OutgoingMail => ({
  from: '"Hotel Aurora" <no-reply@aurora.test>',
  fromChosen: false,
  to: ['guest@example.com'],
  cc: [],
  bcc: [],
  subject: 'Your booking',
  text: 'See you soon',
  attachments: [],
  ...over,
});

let turbo: FakeTurbo;
let fake: ReturnType<typeof fakeContext>;

beforeEach(() => {
  turbo = fakeTurbo();
  turbo.answers.set(`GET ${API}/user/config`, {
    status: 200,
    body: { email: 'owner@aurora.test' },
  });
  fake = fakeContext();
  setupTurboSmtp(fake.ctx, { http: turbo.http });
});

const connect = () =>
  fake.call('PUT', '/connection', { body: { consumerKey: 'ck-1', consumerSecret: 'cs-1' } });

describe('the manifest', () => {
  it('matches the names of the code', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../cleitext.plugin.json', import.meta.url), 'utf8'),
    );
    expect(manifest).toMatchObject({ slug: SLUG, name: NAME, capabilities: [CAPABILITY] });
    expect(manifest.permissions).toContain('mail:transport');
  });
});

describe('connecting the account', () => {
  it('checks the API keys with turboSMTP and keeps them as secrets', async () => {
    const answer = await connect();
    expect(answer.status ?? 200).toBe(200);
    expect(answer.body).toMatchObject({
      connected: true,
      sending: true,
      settings: { account: 'owner@aurora.test', mode: 'api' },
    });
    expect(JSON.stringify(answer.body)).not.toContain('cs-1');
    expect(turbo.requests[0]).toMatchObject({
      method: 'GET',
      url: `https://${API}/user/config`,
      headers: { consumerKey: 'ck-1', consumerSecret: 'cs-1' },
    });
    expect(fake.secrets.get('site-1|consumer-secret')).toBe('cs-1');
  });

  it('refuses keys turboSMTP does not know, and saves nothing', async () => {
    turbo.answers.set(`GET ${API}/user/config`, { status: 401, body: { message: 'no' } });
    const answer = await connect();
    expect(answer).toMatchObject({ status: 400, body: { code: 'invalid-keys' } });
    expect(fake.secrets.size).toBe(0);
  });

  it('makes new keys from email and password, signs out, and does not keep the password', async () => {
    turbo.answers.set(`POST ${API}/authorize`, { status: 200, body: { auth: 'token-9' } });
    turbo.answers.set(`POST ${API}/user/consumerKeys`, {
      status: 200,
      body: { consumerKey: 'ck-new', consumerSecret: 'cs-new' },
    });
    const answer = await fake.call('PUT', '/connection', {
      body: { email: 'owner@aurora.test', password: 'secret pass' },
    });
    expect(answer.body).toMatchObject({
      connected: true,
      settings: { smtpUser: 'owner@aurora.test' },
    });
    const paths = turbo.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`);
    expect(paths).toEqual([
      'POST /api/v2/authorize',
      'POST /api/v2/user/consumerKeys',
      'POST /api/v2/deauthorize',
      'GET /api/v2/user/config',
    ]);
    expect(turbo.requests[0]!.json).toEqual({
      email: 'owner@aurora.test',
      password: 'secret pass',
    });
    expect(turbo.requests[1]).toMatchObject({
      headers: { authorization: 'token-9' },
      json: { label: 'Hotel Aurora (Cleitext)' },
    });
    expect([...fake.secrets.values()]).not.toContain('secret pass');
    expect(fake.secrets.get('site-1|consumer-key')).toBe('ck-new');
  });

  it('says when the email and password are wrong', async () => {
    turbo.answers.set(`POST ${API}/authorize`, { status: 401, body: {} });
    const answer = await fake.call('PUT', '/connection', {
      body: { email: 'owner@aurora.test', password: 'wrong' },
    });
    expect(answer).toMatchObject({ status: 400, body: { code: 'invalid-login' } });
  });

  it('disconnects: keys and SMTP password go', async () => {
    await connect();
    fake.secrets.set('site-1|smtp-password', 'pw');
    const answer = await fake.call('DELETE', '/connection');
    expect(answer.body).toMatchObject({
      connected: false,
      sending: false,
      settings: { account: '' },
    });
    expect(fake.secrets.size).toBe(0);
  });

  it('needs both keys, without spaces', () => {
    expect(() => cleanKeys({ consumerKey: 'a', consumerSecret: '' })).toThrow(TurboError);
    expect(() => cleanKeys({ consumerKey: 'a b', consumerSecret: 'c' })).toThrow(TurboError);
    expect(cleanKeys({ consumerKey: ' a ', consumerSecret: 'c' })).toEqual({
      consumerKey: 'a',
      consumerSecret: 'c',
    });
  });
});

describe('sending by API', () => {
  it('leaves the emails alone until the account is connected', async () => {
    expect(await fake.mailDeliver('site-1', mail())).toBeNull();
    expect(turbo.requests).toHaveLength(0);
  });

  it('sends every email through turboSMTP, with the sender of the settings', async () => {
    await connect();
    await fake.call('PUT', '/settings', {
      body: { fromEmail: 'booking@aurora.test', fromName: 'Aurora Bookings' },
    });
    turbo.requests.length = 0;
    const result = await fake.mailDeliver(
      'site-1',
      mail({
        cc: ['desk@aurora.test'],
        bcc: ['archive@aurora.test'],
        html: '<p>See you soon</p>',
        replyTo: 'desk@aurora.test',
        attachments: [
          { filename: 'invoice.pdf', content: Buffer.from('PDF'), contentType: 'application/pdf' },
        ],
      }),
    );
    expect(result).toEqual({ delivered: true, from: '"Aurora Bookings" <booking@aurora.test>' });
    expect(turbo.requests).toHaveLength(1);
    expect(turbo.requests[0]).toMatchObject({
      method: 'POST',
      url: `https://${SEND}`,
      headers: { consumerKey: 'ck-1', consumerSecret: 'cs-1' },
      json: {
        from: '"Aurora Bookings" <booking@aurora.test>',
        to: 'guest@example.com',
        cc: 'desk@aurora.test',
        bcc: 'archive@aurora.test',
        reply_to: 'desk@aurora.test',
        subject: 'Your booking',
        content: 'See you soon',
        html_content: '<p>See you soon</p>',
        attachments: [{ content: 'UERG', name: 'invoice.pdf', type: 'application/pdf' }],
      },
    });
  });

  it('keeps a sender chosen for the email, and the site’s when none is set', async () => {
    await connect();
    const chosen = mail({ from: '"Contact form" <no-reply@aurora.test>', fromChosen: true });
    expect(await fake.mailDeliver('site-1', chosen)).toMatchObject({
      from: '"Contact form" <no-reply@aurora.test>',
    });
    expect(await fake.mailDeliver('site-1', mail())).toMatchObject({
      from: '"Hotel Aurora" <no-reply@aurora.test>',
    });
  });

  it('throws when turboSMTP fails, so the core sends the usual way, and keeps the error', async () => {
    await connect();
    turbo.answers.set(`POST ${SEND}`, { status: 500, body: { message: 'quota exceeded' } });
    await expect(fake.ctx.storage.get('site-1', 'last-error')).resolves.toBeNull();
    expect(await fake.mailDeliver('site-1', mail())).toBeNull();
    const view = (await fake.call('GET', '/settings')).body as { lastError: { message: string } };
    expect(view.lastError.message).toContain('quota exceeded');
    // The next email that goes through clears it.
    turbo.answers.delete(`POST ${SEND}`);
    await fake.mailDeliver('site-1', mail());
    expect((await fake.call('GET', '/settings')).body).toMatchObject({ lastError: null });
  });

  it('can be turned off without disconnecting', async () => {
    await connect();
    await fake.call('PUT', '/settings', { body: { enabled: false } });
    expect(await fake.mailDeliver('site-1', mail())).toBeNull();
  });

  it('keeps a result another plugin gave', async () => {
    await connect();
    turbo.requests.length = 0;
    const other = { delivered: true as const };
    expect(await fake.filter()(other, { siteId: 'site-1', message: mail() })).toBe(other);
    expect(turbo.requests).toHaveLength(0);
  });
});

describe('sending by SMTP', () => {
  beforeEach(async () => {
    await connect();
    turbo.answers.set(`POST ${API}/authorize`, { status: 200, body: { auth: 'token-1' } });
  });

  it('checks the sign-in before saving it, then hands the core turboSMTP’s server', async () => {
    const answer = await fake.call('PUT', '/settings', {
      body: {
        mode: 'smtp',
        host: 'pro.turbo-smtp.com',
        port: 465,
        smtpUser: 'owner@aurora.test',
        smtpPassword: 'smtp pw',
      },
    });
    expect(answer.body).toMatchObject({
      hasSmtpPassword: true,
      sending: true,
      settings: { mode: 'smtp', host: 'pro.turbo-smtp.com', port: 465, security: 'tls' },
    });
    expect(JSON.stringify(answer.body)).not.toContain('smtp pw');
    expect(turbo.requests.at(-2)!.json).toEqual({
      email: 'owner@aurora.test',
      password: 'smtp pw',
    });
    expect(await fake.mailDeliver('site-1', mail())).toEqual({
      smtp: {
        host: 'pro.turbo-smtp.com',
        port: 465,
        security: 'tls',
        user: 'owner@aurora.test',
        password: 'smtp pw',
      },
      from: '"Hotel Aurora" <no-reply@aurora.test>',
    });
  });

  it('does not save a sign-in turboSMTP refuses', async () => {
    turbo.answers.set(`POST ${API}/authorize`, { status: 403, body: {} });
    const answer = await fake.call('PUT', '/settings', {
      body: { mode: 'smtp', smtpUser: 'owner@aurora.test', smtpPassword: 'bad' },
    });
    expect(answer).toMatchObject({ status: 400, body: { code: 'invalid-login' } });
    expect(fake.secrets.get('site-1|smtp-password')).toBeUndefined();
  });

  it('asks for the password the first time', async () => {
    const answer = await fake.call('PUT', '/settings', {
      body: { mode: 'smtp', smtpUser: 'owner@aurora.test' },
    });
    expect(answer).toMatchObject({ status: 400 });
  });

  it('keeps only turboSMTP’s servers and ports', () => {
    expect(normalizeSettings({ host: 'smtp.evil.test', port: 26 })).toMatchObject({
      host: 'pro.eu.turbo-smtp.com',
      port: 587,
      security: 'starttls',
    });
    expect(normalizeSettings({ port: 2525, security: 'none' })).toMatchObject({
      port: 2525,
      security: 'none',
    });
  });
});

describe('the test email', () => {
  it('goes through the site’s mail and turboSMTP', async () => {
    await connect();
    turbo.requests.length = 0;
    const answer = await fake.call('POST', '/test', { body: { to: 'me@example.com' } });
    expect(answer.body).toEqual({ ok: true });
    expect(fake.sent.at(-1)!.message).toMatchObject({
      to: ['me@example.com'],
      subject: 'Email di prova da turboSMTP',
    });
    expect(fake.sent.at(-1)!.message.html).toContain('<p');
    expect(turbo.requests[0]!.url).toBe(`https://${SEND}`);
  });

  it('shows turboSMTP’s error', async () => {
    await connect();
    turbo.answers.set(`POST ${SEND}`, { status: 400, body: { message: 'sender not verified' } });
    const answer = await fake.call('POST', '/test', { body: { to: 'me@example.com' } });
    expect(answer).toMatchObject({ status: 502 });
    expect(JSON.stringify(answer.body)).toContain('sender not verified');
  });

  it('needs an address and a connected account', async () => {
    expect(await fake.call('POST', '/test', { body: { to: 'nope' } })).toMatchObject({
      status: 400,
    });
    expect(await fake.call('POST', '/test', { body: { to: 'me@example.com' } })).toMatchObject({
      status: 400,
    });
  });
});

describe('statistics', () => {
  it('asks turboSMTP for the period and unpacks the day series', async () => {
    await connect();
    turbo.answers.set(`GET ${API}/analytics`, {
      status: 200,
      body: {
        count: 7,
        aggs: ['all', 'delivered', 'opens', 5, 20389, 4, 3, 1, -1, 20391, 3, 3, 2, -1],
        results: [],
      },
    });
    const answer = await fake.call('GET', '/stats', {
      query: { from: '2025-10-28', to: '2025-11-03' },
    });
    const q = new URL(turbo.requests.at(-1)!.url).searchParams;
    expect(Object.fromEntries(q)).toMatchObject({
      from: '2025-10-28',
      to: '2025-11-03',
      tz: 'Europe/Rome',
      grp: 'day',
      int: '1',
    });
    expect(answer.body).toMatchObject({
      count: 7,
      series: {
        keys: ['all', 'delivered', 'opens'],
        totals: { all: 7, delivered: 6, opens: 3 },
        days: [
          { day: '2025-10-28', counts: { all: 4, delivered: 3, opens: 1 } },
          { day: '2025-10-30', counts: { all: 3, delivered: 3, opens: 2 } },
        ],
      },
    });
  });

  it('lists the messages of a group, a page at a time', async () => {
    await connect();
    turbo.answers.set(`GET ${API}/analytics`, {
      status: 200,
      body: {
        count: 45,
        results: [
          {
            send_time: '2025-11-03 10:00:00',
            status: 'OPEN',
            recipient: 'guest@example.com',
            sender: 'booking@aurora.test',
            subject: 'Your booking',
            error: '',
          },
        ],
      },
    });
    const answer = await fake.call('GET', '/messages', { query: { group: 'opens', page: '2' } });
    const q = new URL(turbo.requests.at(-1)!.url).searchParams;
    expect(q.get('status')).toBe('OPEN,CLICK,UNSUB,REPORT');
    expect(q.get('page')).toBe('2');
    expect(answer.body).toMatchObject({
      count: 45,
      page: 2,
      pages: 3,
      rows: [{ status: 'OPEN', group: 'opens', to: 'guest@example.com', subject: 'Your booking' }],
    });
  });

  it('needs a connected account', async () => {
    expect(await fake.call('GET', '/stats')).toMatchObject({ status: 400 });
  });
});

describe('the model', () => {
  it('builds the payload without empty fields', () => {
    expect(sendPayload(mail(), 'a@b.test')).toEqual({
      from: 'a@b.test',
      to: 'guest@example.com',
      subject: 'Your booking',
      content: 'See you soon',
    });
  });

  it('puts the name of the settings on the site’s address', () => {
    const settings = normalizeSettings({ fromName: 'Reception' });
    expect(chosenSender(settings, '"Hotel" <hi@aurora.test>')).toBe('"Reception" <hi@aurora.test>');
    expect(chosenSender(normalizeSettings({}), 'hi@aurora.test')).toBeNull();
    expect(normalizeSettings({ fromName: 'Evil "x" <y>' }).fromName).toBe('Evil x y');
  });

  it('maps groups to statuses and statuses to groups', () => {
    expect(statusesOf('bounce')).toBe('FAIL');
    expect(statusesOf('all')).toBe('');
    expect(statusesOf('__proto__')).toBe('');
    expect(messageRow({ status: 'click' }).group).toBe('clicks');
    expect(messageRow({ status: 'SUCCESS' }).group).toBe('delivered');
  });

  it('ignores what is not a series', () => {
    expect(decodeAggs([])).toEqual({ keys: [], days: [], totals: {} });
    expect(decodeAggs(['all', 1, null, 10, 2, -1]).totals).toEqual({ all: 2 });
  });

  it('reaches a test endpoint only on this machine', () => {
    expect(testEndpoint('http://127.0.0.1:9999/')).toBe('http://127.0.0.1:9999');
    expect(testEndpoint('http://example.com')).toBeNull();
    expect(testEndpoint('https://localhost')).toBeNull();
  });
});

describe('the Italian texts', () => {
  it('cover every text of the admin', async () => {
    const { IT } = await import('../src/admin/it');
    const source = readFileSync(new URL('../src/admin.tsx', import.meta.url), 'utf8');
    const texts = [...source.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)+)'/g)].map((m) => m[1]!);
    const labels = [...source.matchAll(/^\s+\w+: '([A-Z][^']+)',$/gm)].map((m) => m[1]!);
    const missing = [...texts, ...labels].filter((text) => !(text in IT));
    expect(missing).toEqual([]);
  });
});
