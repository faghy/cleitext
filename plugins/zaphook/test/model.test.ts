import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  formBody,
  requestBody,
  buildPayload,
  fixedFieldsOf,
  classify,
  emailOf,
  InvalidWebhook,
  matches,
  nextAttempt,
  samplePayload,
  shortError,
  signature,
  webhookFrom,
  webhooksOf,
  webhookUrl,
  type DeliveredMessage,
  type Webhook,
} from '../src/model';
import { policySection } from '../src/server';

const HOOK: Webhook = {
  id: 'w1',
  label: 'Zapier',
  url: 'https://hooks.zapier.com/hooks/catch/1/abc/',
  enabled: true,
  scope: 'all',
  forms: [],
  includeIp: false,
  includeUserAgent: false,
  skipMail: false,
  hasSecret: false,
  fixedFields: [],
  bodyFormat: 'json',
  omitServiceKeys: false,
};

/** The first real case: the fields the existing Zap expects at the root. */
const MESSAGE: DeliveredMessage = {
  messageId: 'm-1',
  form: 'Richiesta informazioni',
  fields: {
    nome: 'Mario Rossi',
    telefono: '+39 333 1234567',
    email: 'mario@example.com',
    comune: 'Varazze',
    richiesta: 'Vorrei un preventivo.',
    servizi: ['giardino', 'piscina'],
  },
  page: { path: '/contatti', url: 'https://example.it/contatti', title: 'Contatti' },
  locale: 'it',
  submittedAt: '2026-11-18T09:30:00.000Z',
  ip: '198.51.100.4',
  userAgent: 'Mozilla/5.0',
};

describe('the payload', () => {
  it('puts the fields at the root with their names, then the metadata', () => {
    expect(buildPayload(HOOK, MESSAGE)).toEqual({
      nome: 'Mario Rossi',
      telefono: '+39 333 1234567',
      email: 'mario@example.com',
      comune: 'Varazze',
      richiesta: 'Vorrei un preventivo.',
      servizi: ['giardino', 'piscina'],
      _form: 'Richiesta informazioni',
      _page_url: 'https://example.it/contatti',
      _page_title: 'Contatti',
      _submitted_at: '2026-11-18T09:30:00.000Z',
      _locale: 'it',
      _message_id: 'm-1',
    });
  });

  it('adds the IP address and the browser only when asked', () => {
    const payload = buildPayload({ includeIp: true, includeUserAgent: true }, MESSAGE);
    expect(payload._ip).toBe('198.51.100.4');
    expect(payload._user_agent).toBe('Mozilla/5.0');
    const none = buildPayload({ includeIp: true, includeUserAgent: false }, {
      ...MESSAGE,
      ip: undefined,
    } as DeliveredMessage);
    expect(none).not.toHaveProperty('_ip');
    expect(none).not.toHaveProperty('_user_agent');
  });

  it('never lets a field take the place of the metadata', () => {
    const payload = buildPayload(HOOK, {
      ...MESSAGE,
      fields: { _form: 'forged', nome: 'A' },
      page: { path: '/x' },
    });
    expect(payload._form).toBe('Richiesta informazioni');
    expect(payload._page_url).toBe('/x');
    expect(payload._page_title).toBe('');
  });

  it('has a test message with _test', () => {
    const sample = samplePayload(HOOK, 'https://example.it', 'it');
    expect(sample._test).toBe(true);
    expect(sample._page_url).toBe('https://example.it/');
    expect(sample).not.toHaveProperty('_ip');
    expect(sample.email).toBe('mario.rossi@example.com');
  });

  it('finds the visitor’s email for privacy requests', () => {
    expect(emailOf(buildPayload(HOOK, MESSAGE))).toBe('mario@example.com');
    expect(emailOf({ nome: 'A', _form: 'x@y.it' })).toBeNull();
  });
});

describe('which webhooks get a message', () => {
  it('every form, only some, never when off', () => {
    expect(matches(HOOK, 'Anything')).toBe(true);
    const some: Webhook = { ...HOOK, scope: 'selected', forms: ['Richiesta informazioni'] };
    expect(matches(some, 'richiesta informazioni ')).toBe(true);
    expect(matches(some, 'Newsletter')).toBe(false);
    expect(matches({ ...HOOK, enabled: false }, 'Anything')).toBe(false);
  });
});

describe('webhooks as saved', () => {
  const id = () => 'new-id';

  it('accept only full https addresses', () => {
    expect(webhookUrl('https://hook.eu1.make.com/abc')).toBe('https://hook.eu1.make.com/abc');
    expect(webhookUrl('http://hooks.zapier.com/x')).toBeNull();
    expect(webhookUrl('https://user:pw@example.com/x')).toBeNull();
    expect(webhookUrl('https://localhost/x')).toBeNull();
    expect(webhookUrl('hooks.zapier.com')).toBeNull();
    expect(() => webhookFrom({ url: 'ftp://x.y' }, null, id)).toThrow(InvalidWebhook);
  });

  it('start with the private options off and keep the secret apart', () => {
    const { webhook, secret } = webhookFrom(
      { url: 'https://n8n.example.com/webhook/1', secret: '  a-long-secret ' },
      null,
      id,
    );
    expect(webhook).toEqual({
      id: 'new-id',
      label: 'n8n.example.com',
      url: 'https://n8n.example.com/webhook/1',
      enabled: true,
      scope: 'all',
      forms: [],
      includeIp: false,
      includeUserAgent: false,
      skipMail: false,
      hasSecret: true,
      fixedFields: [],
      bodyFormat: 'json',
      omitServiceKeys: false,
    });
    expect(JSON.stringify(webhook)).not.toContain('a-long-secret');
    expect(secret).toBe('a-long-secret');
    // Saved again without a secret: kept; with null: removed.
    expect(webhookFrom({ label: 'n8n' }, webhook, id)).toMatchObject({
      webhook: { hasSecret: true, label: 'n8n' },
      secret: undefined,
    });
    expect(webhookFrom({ secret: null }, webhook, id)).toMatchObject({
      webhook: { hasSecret: false },
      secret: null,
    });
    expect(() => webhookFrom({ secret: 'short' }, webhook, id)).toThrow(InvalidWebhook);
  });

  it('need a form when only some forms are sent', () => {
    expect(() => webhookFrom({ url: HOOK.url, scope: 'selected', forms: [] }, null, id)).toThrow(
      'Choose at least one form',
    );
    expect(webhooksOf([{ ...HOOK }, { id: 'bad', url: 'http://x.y' }, null])).toEqual([HOOK]);
  });
});

describe('answers and attempts', () => {
  it('classifies the answers', () => {
    expect(classify(200)).toBe('sent');
    expect(classify(204)).toBe('sent');
    expect(classify(410)).toBe('failed');
    expect(classify(404)).toBe('failed');
    expect(classify(400)).toBe('failed');
    expect(classify(301)).toBe('failed');
    expect(classify(429)).toBe('retry');
    expect(classify(500)).toBe('retry');
    expect(classify(503)).toBe('retry');
    expect(classify(null)).toBe('retry');
  });

  it('tries again after 1 min, 5 min, 30 min, 2 h, 6 h, then gives up', () => {
    const waits = [1, 2, 3, 4, 5].map((n) => nextAttempt(n, 0)!.getTime() / 60_000);
    expect(waits).toEqual([1, 5, 30, 120, 360]);
    expect(nextAttempt(6, 0)).toBeNull();
  });

  it('keeps errors short, without addresses or secrets', () => {
    const error = new Error(
      `connect ECONNREFUSED for ${HOOK.url} with s3cr3t-value ${'x'.repeat(300)}`,
    );
    const short = shortError(error, ['s3cr3t-value']);
    expect(short).not.toContain('zapier');
    expect(short).not.toContain('s3cr3t');
    expect(short.length).toBeLessThanOrEqual(160);
  });
});

describe('the signature', () => {
  it('is the HMAC-SHA256 of "<timestamp>.<body>" in hex', async () => {
    const body = JSON.stringify({ nome: 'Mario' });
    const headers = await signature('a-long-secret', '1795000000', body);
    const expected = createHmac('sha256', 'a-long-secret')
      .update(`1795000000.${body}`)
      .digest('hex');
    expect(headers).toEqual({
      'X-Zaphook-Timestamp': '1795000000',
      'X-Zaphook-Signature': `sha256=${expected}`,
    });
  });
});

describe('the privacy policy', () => {
  it('names the hosts of the webhooks that are on, in the policy’s language', () => {
    const hooks: Webhook[] = [
      HOOK,
      { ...HOOK, id: 'w2', url: 'https://hook.eu1.make.com/x', enabled: false },
      { ...HOOK, id: 'w3', url: 'https://hooks.zapier.com/other' },
    ];
    const [it] = policySection(hooks, 'it-IT');
    expect(it!.title).toBe('Invio dei moduli ad altri servizi');
    expect(it!.text).toContain(': hooks.zapier.com.');
    expect(it!.text).not.toContain('make.com');
    expect(it!.text).not.toContain('/hooks/catch');
    expect(policySection(hooks, 'en')[0]!.title).toBe('Forms sent to other services');
    expect(policySection(hooks, 'es')[0]!.text).toContain('hooks.zapier.com');
    expect(policySection([{ ...HOOK, enabled: false }], 'en')).toEqual([]);
  });
});

describe('fixed fields', () => {
  it('keep a name not starting with _, each once, and go over the form fields', () => {
    const fields = fixedFieldsOf([
      { name: ' artigiano ', value: 'Tecnico Caldaie' },
      { name: '_form', value: 'x' },
      { name: 'artigiano', value: 'twice' },
      { name: '', value: 'no name' },
      'junk',
    ]);
    expect(fields).toEqual([{ name: 'artigiano', value: 'Tecnico Caldaie' }]);
    const payload = buildPayload(
      { includeIp: false, includeUserAgent: false, fixedFields: fields },
      {
        messageId: 'm',
        form: 'f',
        fields: { nome: 'Mario', artigiano: 'from the visitor' },
        page: { path: '/' },
        locale: 'it',
        submittedAt: '2026-11-18T10:00:00.000Z',
      },
    );
    expect(payload).toMatchObject({ nome: 'Mario', artigiano: 'Tecnico Caldaie' });
  });
});

describe('the body of the request (1.2.0)', () => {
  const payload = {
    nome: 'Mario Rossi',
    'product-id': '42',
    servizi: ['a b', 'c&d'],
    vuoto: '',
    _form: 'Preventivo',
    _test: true,
  };
  it('writes a form as http_build_query does', () => {
    expect(formBody(payload)).toBe(
      'nome=Mario+Rossi&product-id=42&servizi%5B%5D=a+b&servizi%5B%5D=c%26d&vuoto=&_form=Preventivo&_test=1',
    );
    expect(formBody({ x: "(it's)*~!" })).toBe('x=%28it%27s%29%2A%7E%21');
  });
  it('keeps JSON by default and can leave out the service keys', () => {
    expect(requestBody({ bodyFormat: 'json', omitServiceKeys: false }, payload)).toEqual({
      body: JSON.stringify(payload),
      contentType: 'application/json',
    });
    const form = requestBody({ bodyFormat: 'form', omitServiceKeys: true }, payload);
    expect(form.contentType).toBe('application/x-www-form-urlencoded');
    expect(form.body).toBe(
      'nome=Mario+Rossi&product-id=42&servizi%5B%5D=a+b&servizi%5B%5D=c%26d&vuoto=',
    );
  });
});
