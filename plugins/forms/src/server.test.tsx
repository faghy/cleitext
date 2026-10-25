import type { PluginBlockDefinition, PluginContext } from '@cleitext/plugin-sdk';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import fixture from './hotel.fixture.json';
import plugin from './server';

/**
 * The acceptance case: a hotel's booking request rebuilt from Contact Form 7
 * (six fields on one row on desktop, the requests below, the consent and the
 * button on one row).
 */
const HOTEL_ATTRS = fixture.attrs;
const HOTEL_REQUEST: Record<string, string> = fixture.request;

type Data = { challenge: string; spec?: string };
type Route = {
  method: string;
  path: string;
  handler: (request: unknown) => Promise<{
    status?: number;
    headers?: Record<string, string>;
    body?: unknown;
  }>;
};

/** The plugin set up against a fake context: what it registered and did. */
function setUp(
  options: { challenge?: string; refuse?: boolean; verdict?: Record<string, unknown> } = {},
) {
  const actions = new Map<string, (payload: never, context: { siteId: string }) => unknown>();
  const blocks: PluginBlockDefinition<Record<string, unknown>, Data>[] = [];
  const routes: Route[] = [];
  const secrets = new Map<string, string>();
  const inserted: Record<string, unknown>[] = [];
  const mails: Record<string, unknown>[] = [];
  const verified: unknown[] = [];
  const ctx = {
    access: { defineCapability: () => undefined },
    settings: {
      define: () => undefined,
      get: async () => ({ recipient: 'hotel@example.com' }),
    },
    secrets: {
      get: async (_siteId: string, key: string) => secrets.get(key) ?? null,
      set: async (_siteId: string, key: string, value: string) => void secrets.set(key, value),
    },
    blocks: { register: (definition: never) => blocks.push(definition) },
    routes: {
      public: (route: Route) => routes.push(route),
      api: (route: Route) => routes.push(route),
    },
    privacy: { registerExporter: () => undefined, registerEraser: () => undefined },
    forms: {
      challenge: async () => options.challenge ?? '',
      verify: async (context: unknown) => {
        verified.push(context);
        if (options.verdict) return options.verdict;
        return options.refuse ? { ok: false, message: 'No' } : { ok: true };
      },
    },
    hooks: {
      on: (name: string, handler: (payload: never, context: { siteId: string }) => unknown) =>
        void actions.set(name, handler),
    },
    db: {
      transaction: async (_siteId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          insert: () => ({
            values: async (row: Record<string, unknown>) => void inserted.push(row),
          }),
        }),
    },
    mail: { send: async (message: Record<string, unknown>) => void mails.push(message) },
    log: { error: () => undefined, warn: () => undefined },
  } as unknown as PluginContext;
  void plugin.setup(ctx);
  const block = blocks[0]!;
  const submit = routes.find((r) => r.method === 'POST' && r.path === '/_forms/submit')!;
  let ip = 0;

  async function render(attrs: Record<string, unknown>, locale = 'it-IT') {
    const all = {
      formName: 'Contact',
      buttonLabel: 'Send',
      successMessage: 'Thank you, we will reply soon.',
      ...attrs,
    };
    const context = {
      siteId: 's',
      locale,
      page: { route: 'entry', site: { title: '', tagline: '', home: '/' } },
      media: new Map(),
      menus: {},
    };
    const data = await block.load!(all, { ...context, tag: () => undefined } as never);
    const node = block.render({
      attrs: all,
      data,
      block: { id: 'b1', type: block.type, v: 1, attrs: all },
      context: context as never,
    });
    return { html: renderToStaticMarkup(createElement(Fragment, null, node)), data };
  }

  const send = (body: Record<string, unknown>) =>
    submit.handler({
      siteId: 's',
      locale: 'it',
      body: { _block: 'b1', ...body },
      ip: `10.0.0.${++ip}`,
      user: null,
      headers: { host: 'hotel.test', referer: 'http://hotel.test/prenota' },
    });

  const emit = (name: string, payload: unknown) =>
    actions.get(name)!(payload as never, { siteId: 's' });

  return { block, render, send, inserted, mails, verified, emit };
}

/** The classic form's markup before 1.3.0, which must not change. */
const CLASSIC_IT =
  '<section class="contact-form" id="form-b1"><style>#form-b1-sent:not(:target),#form-b1-error:not(:target),#form-b1-check:not(:target){display:none}.contact-form form{display:grid;gap:.75rem;max-width:36rem}.contact-form label{display:grid;gap:.25rem}.contact-form .form-privacy{font-size:.875em;margin:0}.contact-form .hp{position:absolute;left:-10000px}</style><p id="form-b1-sent" role="status">Thank you, we will reply soon.</p><p id="form-b1-error" role="alert">Il messaggio non è stato inviato. Controlla i campi e riprova.</p><p id="form-b1-check" role="alert">Il controllo anti-spam non è riuscito: riprova.</p><form action="/_forms/submit" method="post"><input type="hidden" name="_form" value="Contact"/><input type="hidden" name="_block" value="b1"/><label>Nome<input required="" maxLength="120" autoComplete="name" name="name"/></label><label>Email<input type="email" required="" maxLength="200" autoComplete="email" name="email"/></label><label>Telefono<input type="tel" maxLength="40" autoComplete="tel" name="phone"/></label><label>Messaggio<textarea name="message" required="" maxLength="5000" rows="6"></textarea></label><label class="hp" aria-hidden="true">Website<input tabindex="-1" autoComplete="off" name="website"/></label><p class="form-privacy">Inviando il messaggio, i tuoi dati saranno trattati per risponderti, come descritto nella <a href="/privacy">privacy policy</a>.</p><div class="form-challenge"><i>captcha</i></div><button type="submit">Send</button></form></section>';

describe('the classic form', () => {
  it('renders exactly as before', async () => {
    const { render } = setUp({ challenge: '<i>captcha</i>' });
    const { html, data } = await render({ askPhone: true, privacyUrl: '/privacy', fields: [] });
    expect(html).toBe(CLASSIC_IT);
    expect(data.spec).toBe('');
    expect((await render({ askPhone: true, privacyUrl: '/privacy' })).html).toBe(CLASSIC_IT);
  });

  it('stores and emails a message as before', async () => {
    const { send, inserted, mails } = setUp();
    const response = await send({
      _form: 'Contact us',
      name: 'Ada',
      email: 'ADA@example.com',
      phone: '123',
      message: 'Hello!',
    });
    expect(response).toEqual({ status: 303, headers: { location: '/prenota#form-b1-sent' } });
    expect(inserted[0]).toEqual({
      siteId: 's',
      formName: 'Contact us',
      pagePath: '/prenota',
      name: 'Ada',
      email: 'ada@example.com',
      phone: '123',
      message: 'Hello!',
      data: null,
    });
    expect(mails[0]).toEqual({
      siteId: 's',
      to: 'hotel@example.com',
      replyTo: 'ada@example.com',
      subject: '[Contact us] Ada',
      text: 'Ada <ada@example.com>\nPhone: 123\nPage: /prenota\n\nHello!',
    });
  });
});

describe('the hotel booking form', () => {
  it('renders the fields in a grid, the consent beside the button', async () => {
    const { render } = setUp({ challenge: '<i>captcha</i>' });
    const { html, data } = await render(HOTEL_ATTRS);
    expect(data.spec).toMatch(/^[\w-]+\.[\w-]{43}$/);
    expect(html).toContain('<form class="cf-grid" action="/_forms/submit" method="post">');
    expect(html).toContain(`<input type="hidden" name="_spec" value="${data.spec}"/>`);
    expect(html).toContain('grid-template-columns:repeat(12,minmax(0,1fr))');
    expect(html).toContain('.contact-form .cf-grid>.cf-w-1-6{grid-column:span 2}');
    expect(html).toContain(
      '<label class="cf-field cf-text cf-w-1-6"><input type="text" required="" maxLength="200" placeholder="Nome*" aria-label="Nome*" name="your-name"/></label>',
    );
    expect(html).toContain(
      '<input type="email" required="" maxLength="200" placeholder="Email*" aria-label="Email*" autoComplete="email" name="your-email"/>',
    );
    expect(html).toContain(
      '<input type="number" min="1" max="20" placeholder="Numero ospiti" aria-label="Numero ospiti" name="guests"/>',
    );
    expect(html).toContain(
      '<label class="cf-field cf-date cf-w-1-6"><span class="cf-label">Arrivo*</span><input type="date" required="" name="arrival"/></label>',
    );
    expect(html).toContain(
      '<label class="cf-field cf-textarea cf-w-full"><textarea name="requests" required="" maxLength="5000" rows="6" placeholder="Richieste particolari*" aria-label="Richieste particolari*"></textarea></label>',
    );
    expect(html).toContain(
      '<div class="form-challenge"><i>captcha</i></div><div class="cf-submit-row"><label class="cf-field cf-acceptance cf-w-full"><input type="checkbox" required="" name="privacy" value="1"/><span>Ho letto e accetto la <a href="/privacy-policy">privacy policy</a></span></label><button type="submit">INVIA LA RICHIESTA</button></div></form>',
    );
    // In field order: the six fields, then the requests.
    const order = [...html.matchAll(/name="([\w-]+)"/g)].map((m) => m[1]);
    expect(order).toEqual([
      '_form',
      '_block',
      '_spec',
      'website',
      'your-name',
      'your-email',
      'your-tel',
      'guests',
      'arrival',
      'departure',
      'requests',
      'privacy',
    ]);
  });

  it('puts the consent with the other fields without submitInline', async () => {
    const { render } = setUp();
    const { html } = await render({ ...HOTEL_ATTRS, submitInline: false });
    expect(html).not.toContain('class="cf-submit-row"');
    expect(html).toContain('</label><button type="submit">INVIA LA RICHIESTA</button></form>');
  });

  it('stores every field and emails the hotel with the visitor as Reply-To', async () => {
    const { render, send, inserted, mails, verified } = setUp();
    const { data } = await render(HOTEL_ATTRS);
    const response = await send({ _form: 'Prenotazione', _spec: data.spec, ...HOTEL_REQUEST });
    expect(response.headers!.location).toBe('/prenota#form-b1-sent');
    expect(verified).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      formName: 'Prenotazione',
      name: 'Mario Rossi',
      email: 'mario@example.com',
      phone: '+39 019 123456',
      message: 'Camera vista mare,\nse possibile.',
    });
    expect((inserted[0]!.data as { label: string; value: string }[]).map((f) => f.label)).toEqual([
      'Nome*',
      'Email*',
      'Telefono',
      'Numero ospiti',
      'Arrivo*',
      'Partenza*',
      'Richieste particolari*',
      'Ho letto e accetto la privacy policy',
    ]);
    expect(mails[0]).toMatchObject({
      to: 'hotel@example.com',
      replyTo: 'mario@example.com',
      subject: 'Sito Hotel aurora Varazze',
    });
    expect(mails[0]!.text).toContain('Arrivo*: 2027-07-10\nPartenza*: 2027-07-17\n');
  });

  it('refuses invalid, forged and unprotected messages', async () => {
    const { render, send, inserted, mails } = setUp({ refuse: true });
    const { data } = await render(HOTEL_ATTRS);
    const location = async (body: Record<string, unknown>) =>
      (await send({ _spec: data.spec, ...HOTEL_REQUEST, ...body })).headers!.location;
    expect(await location({ privacy: '' })).toBe('/prenota#form-b1-error');
    expect(await location({ guests: '99' })).toBe('/prenota#form-b1-error');
    expect(await location({ _spec: `${data.spec!.slice(0, -3)}abc` })).toBe(
      '/prenota#form-b1-error',
    );
    expect(await location({ _spec: '' })).toBe('/prenota#form-b1-error');
    // The honeypot: bots are told it worked.
    expect(await location({ website: 'spam.test' })).toBe('/prenota#form-b1-sent');
    // The captcha plugin refuses.
    expect(await location({})).toBe('/prenota#form-b1-check');
    expect(inserted).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });

  it('keeps spam aside and delivers it when it is released (plugin API 1.45)', async () => {
    const { render, send, inserted, mails, verified, emit } = setUp({
      verdict: { ok: true, spam: true },
    });
    const { data } = await render(HOTEL_ATTRS);
    const response = await send({ _form: 'Prenotazione', _spec: data.spec, ...HOTEL_REQUEST });
    // The visitor reads the usual thanks; nothing is stored or sent yet.
    expect(response.headers!.location).toBe('/prenota#form-b1-sent');
    expect(inserted).toHaveLength(0);
    expect(mails).toHaveLength(0);
    const asked = verified[0] as { hold: boolean; fields: Record<string, unknown> };
    expect(asked.hold).toBe(true);
    expect(asked.fields._back).toBe('/prenota');

    // Another plugin's form is not ours.
    await emit('form.released', { form: 'prisma/form', locale: 'it', fields: asked.fields });
    expect(inserted).toHaveLength(0);
    await emit('form.released', { form: 'forms/contact', locale: 'it', fields: asked.fields });
    expect(inserted[0]).toMatchObject({ formName: 'Prenotazione', pagePath: '/prenota' });
    expect(mails[0]).toMatchObject({ to: 'hotel@example.com', replyTo: 'mario@example.com' });
  });

  it('drops silently, or asks for the captcha on the page', async () => {
    const silent = setUp({ verdict: { ok: false, silent: true } });
    const { data } = await silent.render(HOTEL_ATTRS);
    expect((await silent.send({ _spec: data.spec, ...HOTEL_REQUEST })).headers!.location).toBe(
      '/prenota#form-b1-sent',
    );
    expect(silent.inserted).toHaveLength(0);

    const challenge = setUp({ verdict: { ok: false, challenge: true, message: 'Solve it' } });
    expect((await challenge.send({ _spec: data.spec, ...HOTEL_REQUEST })).headers!.location).toBe(
      '/prenota?cl-challenge=forms%2Fcontact#form-b1-check',
    );
  });
});

describe('default values and web addresses (1.5.0)', () => {
  it('render as the fields’ starting values', async () => {
    const { render } = setUp({});
    const { html } = await render({
      fields: [
        { name: 'site', type: 'url', label: 'Site', value: 'https://example.com' },
        { name: 'subject', type: 'text', label: 'Subject', value: 'Booking' },
        { name: 'room', type: 'select', label: 'Room', options: 'single\ndouble', value: 'double' },
        { name: 'extras', type: 'checkbox', label: 'Extras', options: 'a\nb', value: 'b' },
        { name: 'note', type: 'textarea', label: 'Note', value: 'Hi' },
      ],
    });
    expect(html).toContain(
      '<input type="url" maxLength="500" autoComplete="url" name="site" value="https://example.com"/>',
    );
    expect(html).toContain('value="Booking"');
    expect(html).toMatch(/<option value="double" selected="">double<\/option>/);
    expect(html).toContain('<input type="checkbox" name="extras" checked="" value="b"/>');
    expect(html).toContain('>Hi</textarea>');
  });
});
