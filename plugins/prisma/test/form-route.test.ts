import type { CxdBlock, PluginContext, RouteHandler, RouteRequest } from '@cleitext/plugin-sdk';
import { describe, expect, it, vi } from 'vitest';
import { registerFormRelease, registerFormRoutes } from '../src/blocks/form/route';
import {
  checkValues,
  composeEmail,
  findForm,
  formFields,
  recipientsOf,
  returnPath,
  spamVerdict,
} from '../src/blocks/form/submit';
import { makeToken, tokenTime } from '../src/blocks/form/token';
import { safeRedirect } from '../src/blocks/form/schema';

const block = (type: string, attrs: Record<string, unknown>, children?: CxdBlock[]): CxdBlock => ({
  id: `cxd-${type}-${String(attrs.blockId ?? '')}`,
  type,
  v: 1,
  attrs,
  ...(children ? { children } : {}),
});

const FORM = block('prisma/form', { blockId: 'f1', afterSubmitToEmail: 'owner@site.test, bad' }, [
  block('prisma/form-name', { blockId: 'name', name: [{ text: 'Your name' }], nameRequired: true }),
  block('prisma/form-email', { blockId: 'mail', required: true }),
  block('prisma/form-phone', { blockId: 'tel' }),
  block('prisma/form-select', {
    blockId: 'sel',
    selectName: [{ text: 'Topic' }],
    options: [{ optiontitle: 'Sales', optionvalue: 'sales' }],
  }),
  block('prisma/form-checkbox', {
    blockId: 'cb',
    checkboxName: [{ text: 'Colors' }],
    options: [
      { optiontitle: 'Red', optionvalue: 'red' },
      { optiontitle: 'Blue', optionvalue: 'blue' },
    ],
  }),
  block('prisma/form-toggle', { blockId: 'tg', name: [{ text: 'News' }] }),
  block('prisma/form-date', {
    blockId: 'dt',
    additonalVal: true,
    minYear: '2024',
    minMonth: '01',
    minDay: '01',
    maxYear: '2024',
    maxMonth: '12',
    maxDay: '31',
  }),
  block('prisma/form-hidden', {
    blockId: 'hd',
    hidden_field_name: 'Source',
    hidden_field_value: 'landing',
  }),
  block('prisma/form-upload', { blockId: 'up' }),
  block('prisma/form-accept', { blockId: 'ok', acceptRequired: true }),
]);
const PAGE = [block('prisma/container', {}, [FORM])];

const VALID = {
  name: 'Ada',
  mail: 'ada@example.com',
  tel: ['IT', '333 1234567'],
  sel: 'sales',
  cb: ['red', 'blue'],
  tg: ['off', 'on'],
  dt: '2024-05-06',
  hd: 'forged',
  up: 'C:\\fakepath\\cv.pdf',
  ok: 'Agree',
};

describe('finding the form in the saved page', () => {
  it('finds it at any depth by its block id, with its fields in order', () => {
    const form = findForm(PAGE, 'f1')!;
    expect(form.type).toBe('prisma/form');
    expect(findForm(PAGE, 'nope')).toBeNull();
    const fields = formFields(form);
    expect(fields.map((f) => f.id)).toEqual([
      'name',
      'mail',
      'tel',
      'sel',
      'cb',
      'tg',
      'dt',
      'hd',
      'up',
      'ok',
    ]);
    expect(fields[0]).toMatchObject({ kind: 'name', label: 'Your name', required: true });
    expect(fields[1]).toMatchObject({ label: 'Email', required: true });
  });
});

describe('checking the values', () => {
  const fields = formFields(findForm(PAGE, 'f1')!);

  it('accepts a valid message and writes each field as the email shows it', () => {
    const { entries, errors, replyTo } = checkValues(fields, VALID);
    expect(errors).toEqual({});
    expect(replyTo).toBe('ada@example.com');
    expect(Object.fromEntries(entries.map((e) => [e.label, e.value]))).toEqual({
      'Your name': 'Ada',
      Email: 'ada@example.com',
      Phone: '+39 333 1234567',
      Topic: 'sales',
      Colors: 'red, blue',
      News: 'on',
      Date: '2024-05-06',
      // The saved value, not the one sent.
      Source: 'landing',
      Upload: 'cv.pdf',
      Accept: 'Agree',
    });
  });

  it('refuses missing required fields and malformed values', () => {
    const { errors } = checkValues(fields, {
      ...VALID,
      name: '  ',
      mail: 'not-an-email',
      sel: 'other',
      cb: ['green'],
      dt: '2025-01-01',
      ok: undefined,
    });
    expect(errors).toEqual({
      name: 'This field is required.',
      mail: 'Enter a valid email address.',
      sel: 'Choose one of the options.',
      cb: 'Choose one of the options.',
      dt: 'Choose a date in the allowed range.',
      ok: 'This field is required.',
    });
  });

  it('reads a switch left off, and refuses impossible dates', () => {
    const { entries, errors } = checkValues(fields, { ...VALID, tg: 'off', dt: '2024-02-31' });
    expect(entries.find((e) => e.label === 'News')!.value).toBe('off');
    expect(errors.dt).toBe('Enter a valid date.');
  });
});

describe('spam and recipients', () => {
  it('tells bots, quick senders and people apart', () => {
    const now = 1_700_000_010_000;
    expect(spamVerdict({ honeypot: 'http://spam', drawnAt: now - 60_000, now })).toBe('bot');
    expect(spamVerdict({ honeypot: '', drawnAt: null, now })).toBe('quick');
    expect(spamVerdict({ honeypot: '', drawnAt: now - 1000, now })).toBe('quick');
    expect(spamVerdict({ honeypot: '', drawnAt: now - 60_000, now, elapsed: '800' })).toBe('quick');
    expect(spamVerdict({ honeypot: '', drawnAt: now - 60_000, now, elapsed: '9000' })).toBe('ok');
    expect(spamVerdict({ honeypot: '', drawnAt: now - 60_000, now })).toBe('ok');
  });

  it('signs the drawing time and rejects forged or foreign tokens', async () => {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('k'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const token = await makeToken(key, 'entry-1', 1_700_000_000_000);
    expect(await tokenTime(key, 'entry-1', token)).toBe(1_700_000_000_000);
    expect(await tokenTime(key, 'entry-2', token)).toBeNull();
    expect(await tokenTime(key, 'entry-1', token.replace(/^\d/, '2'))).toBeNull();
    expect(await tokenTime(key, 'entry-1', undefined)).toBeNull();
  });

  it('takes the form’s addresses, else the site’s, without repeats', () => {
    expect(
      recipientsOf(
        {
          afterSubmitToEmail: 'a@x.io, junk',
          afterSubmitCcEmail: 'A@x.io,b@x.io',
          afterSubmitBccEmail: 'c@x.io',
        },
        'site@x.io',
      ),
    ).toEqual({ to: ['a@x.io'], cc: ['b@x.io'], bcc: ['c@x.io'] });
    expect(recipientsOf({}, 'site@x.io').to).toEqual(['site@x.io']);
    expect(recipientsOf({}, undefined).to).toEqual([]);
  });

  it('writes an escaped email and safe redirects', () => {
    const mail = composeEmail({
      subject: 'Hello\r\nBcc: evil@x.io',
      entries: [{ label: 'Message', value: '<b>hi</b>\nthere' }],
      siteName: 'Site',
      pageUrl: 'https://site.test/contact',
    });
    expect(mail.subject).toBe('Hello Bcc: evil@x.io');
    expect(mail.html).toContain('&lt;b&gt;hi&lt;/b&gt;<br>there');
    expect(mail.text).toContain('Message:\n<b>hi</b>\nthere');
    expect(safeRedirect('https://example.com/thanks')).toBe('https://example.com/thanks');
    expect(safeRedirect('/thanks')).toBe('/thanks');
    expect(safeRedirect('//evil.com')).toBe('');
    expect(safeRedirect('javascript:alert(1)')).toBe('');
    expect(returnPath('https://site.test/contact?x=1', 'https://site.test')).toBe('/contact?x=1');
    expect(returnPath('https://evil.test/a', 'https://site.test')).toBe('/');
  });
});

describe('the route', () => {
  function setup(
    settings: Record<string, unknown> = {},
    verdict: Record<string, unknown> | null = null,
  ) {
    let handler: RouteHandler | null = null;
    const actions = new Map<string, (payload: unknown, context: { siteId: string }) => unknown>();
    const verified: Record<string, unknown>[] = [];
    const secrets = new Map<string, string>();
    const send = vi.fn(async () => {});
    const ctx = {
      routes: { public: (r: { handler: RouteHandler }) => (handler = r.handler) },
      content: {
        find: vi.fn(async (_site: string, q: { ids?: string[] }) =>
          q.ids?.[0] === 'e1'
            ? [{ id: 'e1', url: '/contact', document: { schema: 1, blocks: PAGE } }]
            : [],
        ),
      },
      secrets: {
        get: async (_s: string, k: string) => secrets.get(k) ?? null,
        set: async (_s: string, k: string, v: string) => void secrets.set(k, v),
      },
      settings: { get: async () => settings },
      mail: { send },
      http: { send: vi.fn() },
      site: async () => ({ id: 's', name: 'Site', defaultLocale: 'en', locales: ['en'] }),
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
      forms: {
        verify: async (input: Record<string, unknown>) => {
          verified.push(input);
          return verdict ?? { ok: true };
        },
      },
      hooks: { on: (name: string, fn: never) => void actions.set(name, fn) },
    } as unknown as PluginContext;
    registerFormRoutes(ctx);
    registerFormRelease(ctx);
    const post = (body: Record<string, unknown>, json = true) =>
      handler!({
        siteId: 's',
        body,
        ip: '1.2.3.4',
        origin: 'https://site.test',
        headers: {
          accept: json ? 'application/json' : 'text/html',
          referer: 'https://site.test/contact',
        },
      } as unknown as RouteRequest);
    const emit = (name: string, payload: unknown) => actions.get(name)!(payload, { siteId: 's' });
    return { ctx, post, send, verified, emit };
  }

  async function token(ctx: PluginContext) {
    const { formKey } = await import('../src/blocks/form/token');
    return makeToken(await formKey(ctx, 's'), 'e1', Date.now() - 10_000);
  }

  it('sends the email to the saved addresses, never to ones sent by the browser', async () => {
    const { ctx, post, send } = setup();
    const res = await post({
      ...VALID,
      _pr_form: 'f1',
      _pr_entry: 'e1',
      _pr_token: await token(ctx),
      _pr_website: '',
      afterSubmitToEmail: 'attacker@evil.test',
    });
    expect(res).toMatchObject({ status: 200, body: { ok: true } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toMatchObject([
      { to: 'owner@site.test', subject: 'Form Submission', replyTo: 'ada@example.com' },
    ]);
  });

  it('answers field errors as JSON, and redirects back without JavaScript', async () => {
    const { ctx, post, send } = setup();
    const t = await token(ctx);
    const res = await post({ ...VALID, name: '', _pr_form: 'f1', _pr_entry: 'e1', _pr_token: t });
    expect(res).toMatchObject({
      status: 422,
      body: { ok: false, errors: { name: 'This field is required.' } },
    });
    const back = await post({ ...VALID, _pr_form: 'f1', _pr_entry: 'e1', _pr_token: t }, false);
    expect(back).toEqual({ status: 303, headers: { location: '/contact#pr-form-f1-sent' } });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('pretends to accept bots and refuses unknown forms and missing tokens', async () => {
    const { ctx, post, send } = setup();
    expect(
      await post({
        ...VALID,
        _pr_form: 'f1',
        _pr_entry: 'e1',
        _pr_token: await token(ctx),
        _pr_website: 'x',
      }),
    ).toMatchObject({ body: { ok: true } });
    expect(await post({ ...VALID, _pr_form: 'zz', _pr_entry: 'e1' })).toMatchObject({
      status: 404,
    });
    expect(await post({ ...VALID, _pr_form: 'f1', _pr_entry: 'e1' })).toMatchObject({
      status: 429,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps spam aside and sends it when it is released (plugin API 1.45)', async () => {
    const { ctx, post, send, verified, emit } = setup({}, { ok: true, spam: true });
    const body = { ...VALID, _pr_form: 'f1', _pr_entry: 'e1', _pr_token: await token(ctx) };
    expect(await post(body)).toMatchObject({ status: 200, body: { ok: true } });
    expect(send).not.toHaveBeenCalled();
    expect(verified[0]).toMatchObject({ form: 'prisma/form', hold: true });
    const fields = verified[0]!.fields as Record<string, unknown>;
    expect(fields._pr_origin).toBe('https://site.test');
    await emit('form.released', { form: 'forms/contact', locale: 'en', fields });
    expect(send).not.toHaveBeenCalled();
    await emit('form.released', { form: 'prisma/form', locale: 'en', fields });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toMatchObject([
      { to: 'owner@site.test', replyTo: 'ada@example.com' },
    ]);
  });

  it('drops silently, or asks for the captcha', async () => {
    const silent = setup({}, { ok: false, silent: true });
    const body = { ...VALID, _pr_form: 'f1', _pr_entry: 'e1', _pr_token: await token(silent.ctx) };
    expect(await silent.post(body)).toMatchObject({ status: 200, body: { ok: true } });
    expect(silent.send).not.toHaveBeenCalled();

    const ask = setup({}, { ok: false, challenge: true, message: 'Solve it' });
    expect(await ask.post(body)).toMatchObject({
      status: 403,
      body: { ok: false, message: 'Solve it', challenge: true },
    });
    expect(await ask.post(body, false)).toEqual({
      status: 303,
      headers: { location: '/contact?cl-challenge=prisma%2Fform#pr-form-f1-error' },
    });
  });
});
