/**
 * NewLetter (official plugin): signup forms for the site's newsletter,
 * connected to the email-marketing service the owner uses (Brevo,
 * Mailchimp, MailerLite, Kit, ActiveCampaign) through its public API. A
 * native form (block, Fresco widget, `[newletter]` shortcode) with recorded
 * consent, double opt-in and the site's bot protection; a "subscribe me"
 * box in other plugins' forms through the opt-in registry (`optin.ts`); a
 * log of subscriptions without addresses in clear; WordPress forms of
 * Mailchimp for WP, Brevo, MailPoet and The Newsletter Plugin converted on
 * import. It adds no tracker of the services to the pages.
 */
import {
  definePlugin,
  defineBlock,
  type PluginContext,
  type RouteRequest,
  type RouteResponse,
} from '@cleitext/plugin-sdk';
import { randomBytes } from 'node:crypto';
import {
  BLOCK_TYPE,
  CACHE_TAG,
  CAPABILITY,
  FORM_ID,
  MARKER,
  NAME,
  OPTIN_FIELD,
  SLUG,
  SUBMIT_PATH,
  TEST_ENDPOINT_ENV,
} from './config';
import {
  blockFromShortcode,
  blocksFromImportedBlock,
  collectMc4wpForms,
  isNewsletterShortcode,
  refProvider,
  type Mc4wpForms,
} from './import/convert';
import { replaceShortcodes } from './shortcode';
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
  type ConsentRecord,
} from './model/form';
import { Limiter } from './model/limit';
import { isReady, normalizeSettings, text, textsFor, type Settings } from './model/settings';
import type { SignupAttrs } from './model/types';
import { installOptIn, type OptInSubscriber } from './optin';
import { isProviderId, providerOf, siteHttp, testEndpoint } from './providers';
import {
  ProviderError,
  type Credentials,
  type Http,
  type SubscribeResult,
} from './providers/types';
import { messagesOf, SignupForm, type FormView, type Outcome } from './render';
import type { LogStatus } from './schema';
import { databaseLogStore, type LogStore } from './store';

const SETTINGS_KEY = 'settings';
const ACTIVE_KEY = 'active';
const API_KEY_SECRET = 'api-key';
const HASH_SECRET = 'hash-key';
const SOURCES = ['forms', 'shop', 'agenda'] as const;

const AI_GUIDE = `Newsletter signups are handled by **${NAME.en}** (admin → ${NAME.en}): the owner connects the email-marketing service (Brevo, Mailchimp, MailerLite, Kit or ActiveCampaign) and chooses the lists there. Never imitate a signup form with HTML or a contact form, and never write API keys in content. Show the form with the **${BLOCK_TYPE}** block: \`{ "type": "${BLOCK_TYPE}", "attrs": { "heading": "…", "fields": "email" | "name" | "name-surname", "layout": "stacked" | "inline", "buttonLabel": "…" } }\` (without \`lists\` it uses the default lists of the settings). A shortcode \`[${SLUG}]\` alone in a paragraph also works.`;

const body = (request: RouteRequest) =>
  (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;

/** Same-site path of the page the form was sent from. */
function returnPath(referer: string | undefined, host: string | undefined): string {
  try {
    const url = new URL(referer ?? '');
    if (url.host === host && url.pathname.startsWith('/') && !url.pathname.startsWith('//'))
      return `${url.pathname}${url.search}`.replace(/[?&]cl-challenge=[^&]*/, '');
  } catch {
    // no referer
  }
  return '/';
}

const ipLimiter = new Limiter(6, 10 * 60_000);
const emailLimiter = new Limiter(3, 60 * 60_000);

export interface SetupOptions {
  /** The log (the plugin's table by default). */
  store?: LogStore;
  /** Requests to the services (the core's client, or the test endpoint, by default). */
  http?: Http;
}

/** Everything the plugin declares; exported for the tests, which give a fake context. */
export function setupNewLetter(ctx: PluginContext, options: SetupOptions = {}): void {
  const http =
    options.http ??
    siteHttp((request) => ctx.http.send(request), testEndpoint(process.env[TEST_ENDPOINT_ENV]));
  const store = options.store ?? databaseLogStore(ctx);

  ctx.access.defineCapability(CAPABILITY, {
    label: { en: `Manage the newsletter (${NAME.en})`, it: `Gestire la newsletter (${NAME.it})` },
    roles: ['administrator'],
  });

  // ---- Settings and keys -----------------------------------------------------------

  const settingsOf = async (siteId: string): Promise<Settings> =>
    normalizeSettings(await ctx.storage.get(siteId, SETTINGS_KEY));

  const hashKeys = new Map<string, Promise<string>>();
  /** The site's key for the hashes of the log (made the first time). */
  function hashKey(siteId: string): Promise<string> {
    let key = hashKeys.get(siteId);
    if (!key) {
      key = (async () => {
        let raw = await ctx.secrets.get(siteId, HASH_SECRET);
        if (!raw) {
          raw = randomBytes(32).toString('hex');
          await ctx.secrets.set(siteId, HASH_SECRET, raw);
        }
        return raw;
      })();
      key.catch(() => hashKeys.delete(siteId));
      hashKeys.set(siteId, key);
    }
    return key;
  }

  async function credentials(siteId: string, settings: Settings): Promise<Credentials | null> {
    const key = await ctx.secrets.get(siteId, API_KEY_SECRET);
    return key ? { key, ...(settings.apiUrl ? { url: settings.apiUrl } : {}) } : null;
  }

  async function ready(siteId: string, settings: Settings): Promise<boolean> {
    return isReady(settings, Boolean(await ctx.secrets.get(siteId, API_KEY_SECRET)));
  }

  // ---- Subscribing -----------------------------------------------------------------

  interface Request {
    source: string;
    email: string;
    firstName?: string;
    lastName?: string;
    fields: Record<string, string>;
    lists: string[];
    tags: string[];
    doubleOptIn: boolean;
    consent: ConsentRecord;
    ip?: string;
    locale: string;
  }

  /** Sends one subscription to the service, with its line in the log. */
  async function subscribe(
    siteId: string,
    settings: Settings,
    input: Request,
  ): Promise<{ status: LogStatus; result?: SubscribeResult; error?: ProviderError }> {
    const key = await hashKey(siteId);
    const provider = settings.provider ?? 'brevo';
    const id = await store.add(siteId, {
      source: input.source,
      provider,
      status: 'queued',
      emailHash: hashOf(key, 'email', input.email),
      emailHint: emailHint(input.email),
      listIds: input.lists,
      locale: input.locale,
      consent: input.consent,
    });
    const done = async (status: LogStatus, error: string | null, notes: string[] = []) => {
      await store
        .finish(siteId, id, { status, error, notes: notes.length ? notes.join(' ') : null })
        .catch((e: unknown) => ctx.log.warn('NewLetter: log not updated', { error: String(e) }));
    };
    try {
      const creds = await credentials(siteId, settings);
      if (!settings.provider || !creds)
        throw new ProviderError('config', 'No service is connected.');
      const result = await providerOf(settings.provider, http).subscribe(creds, {
        email: input.email,
        fields: input.fields,
        ...(input.firstName ? { firstName: input.firstName } : {}),
        ...(input.lastName ? { lastName: input.lastName } : {}),
        tags: input.tags,
        listIds: input.lists,
        doubleOptIn: input.doubleOptIn,
        doi: {
          ...(settings.brevoTemplateId ? { templateId: settings.brevoTemplateId } : {}),
          ...(settings.brevoRedirectUrl ? { redirectUrl: settings.brevoRedirectUrl } : {}),
        },
        consent: { at: input.consent.at, text: input.consent.text },
        ...(input.ip ? { ip: input.ip } : {}),
        locale: input.locale,
      });
      await done(result.status, null, result.notes);
      return { status: result.status, result };
    } catch (error) {
      const e =
        error instanceof ProviderError
          ? error
          : new ProviderError('provider', error instanceof Error ? error.message : String(error));
      await done('error', `${e.code}: ${e.message}`.slice(0, 500));
      if (e.code !== 'invalid-email')
        ctx.log.warn('NewLetter: a subscription failed', {
          siteId,
          code: e.code,
          error: e.message,
        });
      return { status: 'error', error: e };
    }
  }

  async function logSpam(siteId: string, settings: Settings, email: string, locale: string) {
    const key = await hashKey(siteId);
    await store.add(siteId, {
      source: 'form',
      provider: settings.provider ?? '',
      status: 'spam',
      emailHash: hashOf(key, 'email', email),
      emailHint: emailHint(email),
      locale,
      notes: 'Held by the site’s spam protection: subscribed if released as not spam.',
    });
  }

  // ---- The block -------------------------------------------------------------------

  /** The lists of a form: an imported form's only when they belong to the service connected. */
  function attrsFor(attrs: SignupAttrs, settings: Settings): SignupAttrs {
    const from = refProvider(attrs.ref);
    return from && from !== settings.provider ? { ...attrs, lists: '' } : attrs;
  }

  async function formView(
    attrs: SignupAttrs,
    siteId: string,
    locale: string,
    signedIn: boolean,
    preview: boolean,
    uid: string,
  ): Promise<FormView> {
    const settings = await settingsOf(siteId);
    const s = textsFor(settings, locale);
    const isReadyNow = await ready(siteId, settings);
    const spec = specOf(attrsFor(attrs, settings), settings);
    const challenge = isReadyNow
      ? ((await ctx.forms
          ?.challenge({ siteId, form: FORM_ID, locale, signedIn })
          .catch(() => '')) ?? '')
      : '';
    return {
      uid,
      ready: isReadyNow,
      preview,
      heading: text(attrs.heading, 200),
      text: text(attrs.text, 600),
      fields: spec.fields,
      custom: customFieldsOf(spec, settings, locale),
      layout:
        attrs.layout === 'inline' || attrs.layout === 'stacked' ? attrs.layout : settings.layout,
      spec: isReadyNow ? signSpec(await hashKey(siteId), spec) : '',
      locale,
      privacyUrl: settings.privacyUrl,
      challenge,
      s,
      buttonLabel: text(attrs.buttonLabel, 80) || s.button,
      messages: messagesOf(s, {
        success: text(attrs.successMessage, 300),
        error: text(attrs.errorMessage, 300),
      }),
    };
  }

  const uidOf = (id: string) => `nl-${id.replace(/[^\w-]/g, '').slice(0, 40) || 'form'}`;

  ctx.blocks.register(
    defineBlock<SignupAttrs, FormView>({
      type: BLOCK_TYPE,
      title: {
        en: `Newsletter signup (${NAME.en})`,
        it: `Iscrizione alla newsletter (${NAME.it})`,
      },
      description: {
        en: 'A form to subscribe to your newsletter, sent to the service connected in NewLetter.',
        it: 'Un modulo per iscriversi alla newsletter, inviato al servizio collegato in NewLetter.',
      },
      icon: 'email',
      category: 'widgets',
      attributes: [
        { name: 'heading', type: 'text', maxLength: 200, label: { en: 'Heading', it: 'Titolo' } },
        {
          name: 'text',
          type: 'text',
          multiline: true,
          maxLength: 600,
          label: { en: 'Text', it: 'Testo' },
        },
        {
          name: 'fields',
          type: 'select',
          label: { en: 'Fields', it: 'Campi' },
          default: 'email',
          options: [
            { value: 'email', label: { en: 'Email only', it: 'Solo email' } },
            { value: 'name', label: { en: 'Name and email', it: 'Nome ed email' } },
            {
              value: 'name-surname',
              label: { en: 'Name, surname and email', it: 'Nome, cognome ed email' },
            },
            {
              value: 'all',
              label: {
                en: 'All fields (with the custom ones)',
                it: 'Tutti i campi (anche i personalizzati)',
              },
            },
          ],
        },
        {
          name: 'layout',
          type: 'select',
          label: { en: 'Layout', it: 'Disposizione' },
          default: 'stacked',
          options: [
            { value: 'stacked', label: { en: 'Stacked', it: 'In colonna' } },
            { value: 'inline', label: { en: 'On one line', it: 'Su una riga' } },
          ],
        },
        {
          name: 'buttonLabel',
          type: 'text',
          maxLength: 80,
          label: { en: 'Button text', it: 'Testo del pulsante' },
        },
        {
          name: 'successMessage',
          type: 'text',
          maxLength: 300,
          label: { en: 'Message after subscribing', it: 'Messaggio dopo l’iscrizione' },
        },
        {
          name: 'errorMessage',
          type: 'text',
          maxLength: 300,
          label: { en: 'Error message', it: 'Messaggio di errore' },
        },
        {
          name: 'lists',
          type: 'text',
          maxLength: 300,
          label: { en: 'Lists (ids)', it: 'Liste (id)' },
          help: {
            en: 'Empty: the default lists of NewLetter. Several ids separated by commas.',
            it: 'Vuoto: le liste predefinite di NewLetter. Più id separati da virgole.',
          },
        },
        {
          name: 'tags',
          type: 'text',
          maxLength: 300,
          label: { en: 'Tags', it: 'Tag' },
          help: {
            en: 'Separated by commas, where the service has tags (Mailchimp, Kit, ActiveCampaign).',
            it: 'Separati da virgole, dove il servizio ha i tag (Mailchimp, Kit, ActiveCampaign).',
          },
        },
        {
          name: 'doubleOptIn',
          type: 'select',
          label: { en: 'Double opt-in', it: 'Doppio consenso (double opt-in)' },
          default: 'default',
          options: [
            {
              value: 'default',
              label: { en: 'As in the settings', it: 'Come nelle impostazioni' },
            },
            { value: 'on', label: { en: 'On', it: 'Attivo' } },
            { value: 'off', label: { en: 'Off', it: 'Disattivo' } },
          ],
        },
        { name: 'ref', type: 'text', maxLength: 120, label: 'Import', hidden: true },
      ],
      async load(attrs, context) {
        context.tag(CACHE_TAG);
        return formView(
          attrs,
          context.siteId,
          context.locale,
          context.signedIn === true,
          false,
          'nl-form',
        );
      },
      render: ({ data, block, context }) => (
        <SignupForm view={{ ...data, preview: context.preview === true, uid: uidOf(block.id) }} />
      ),
    }),
  );

  ctx.assets.enqueue({ file: 'newletter.js', when: ({ html }) => html.includes(`${MARKER}=`) });

  // `[newletter]` standing alone in a paragraph, a shortcode or an HTML block.
  ctx.hooks.filter('render.blocks', (blocks) => replaceShortcodes(blocks));

  // ---- WordPress import --------------------------------------------------------------

  /** Mailchimp for WP's forms of the import running on each site (read before its content). */
  const mc4wp = new Map<string, Mc4wpForms>();
  const newId = () => `b_${randomBytes(8).toString('hex')}`;
  ctx.hooks.filter('import.wxrMeta', (result, { siteId, items, metaValue }) => {
    mc4wp.set(siteId, collectMc4wpForms(items, metaValue));
    return result;
  });
  ctx.hooks.filter('import.shortcode', (blocks, { siteId, tag, attrs, content }) => {
    if (blocks || !isNewsletterShortcode(tag)) return blocks;
    const block = blockFromShortcode(tag, attrs, newId(), {
      content,
      forms: mc4wp.get(siteId),
    });
    return block ? [block] : null;
  });
  ctx.hooks.filter(
    'import.block',
    (blocks, { siteId, name, attrs, html }) =>
      blocks ?? blocksFromImportedBlock(name, attrs, html, newId(), mc4wp.get(siteId)),
  );

  // ---- The form's submissions --------------------------------------------------------

  function localeOf(request: RouteRequest, value: unknown, locales: string[]): string {
    const asked = text(value, 10);
    return asked && locales.includes(asked) ? asked : request.locale;
  }

  ctx.routes.public({
    method: 'POST',
    path: SUBMIT_PATH,
    async handler(request) {
      const input = body(request);
      const siteId = request.siteId;
      const uid = text(input._uid, 60).replace(/[^\w-]/g, '') || 'nl-form';
      const back = returnPath(request.headers.referer, request.headers.host);
      const json = (request.headers.accept ?? '').includes('application/json');
      const site = await ctx.site(siteId);
      const locale = localeOf(request, input._locale, site.locales);
      const settings = await settingsOf(siteId);
      const s = textsFor(settings, locale);
      const reply = (
        outcome: Outcome,
        extra: { fields?: string[]; challenge?: boolean; message?: string } = {},
      ): RouteResponse => {
        const message =
          extra.message ??
          (outcome === 'success'
            ? s.success
            : outcome === 'pending'
              ? s.pending
              : outcome === 'already'
                ? s.already
                : outcome === 'invalid'
                  ? s.invalid
                  : outcome === 'check'
                    ? s.check
                    : outcome === 'busy'
                      ? s.busy
                      : s.error);
        if (json)
          return {
            status: outcome === 'busy' ? 429 : 200,
            headers: { 'cache-control': 'no-store' },
            body: {
              outcome,
              message,
              ...(extra.fields ? { fields: extra.fields } : {}),
              ...(extra.challenge ? { challenge: true } : {}),
            },
          };
        const sep = back.includes('?') ? '&' : '?';
        return {
          status: 303,
          headers: {
            location: `${back}${extra.challenge ? `${sep}cl-challenge=${encodeURIComponent(FORM_ID)}` : ''}#${uid}-${outcome}`,
          },
        };
      };

      // Bots fill the hidden field: answer as if it went through.
      if (text(input.website, 200)) return reply('success');
      const key = await hashKey(siteId);
      const spec = readSpec(key, input._spec);
      if (!spec || !(await ready(siteId, settings))) return reply('error');
      const submission = readSubmission(input, spec, settings.customFields);
      if (submission.bad.length) return reply('invalid', { fields: submission.bad });
      if (!ipLimiter.allow(`${siteId}|${request.ip}`)) return reply('busy');
      if (!emailLimiter.allow(`${siteId}|${hashOf(key, 'email', submission.email)}`))
        return reply('busy');

      const verdict = await ctx.forms?.verify({
        siteId,
        form: FORM_ID,
        locale,
        // What a release needs (`form.released`): the form's values and the page.
        fields: { ...input, _back: back, _iph: hashOf(key, 'ip', request.ip) },
        ip: request.ip,
        host: (request.headers.host ?? '').replace(/:\d+$/, ''),
        signedIn: request.user !== null,
        hold: true,
      });
      if (verdict && !verdict.ok) {
        if (verdict.silent) return reply('success');
        return reply('check', {
          challenge: verdict.challenge === true,
          ...(verdict.message ? { message: verdict.message } : {}),
        });
      }
      if (verdict?.spam) {
        await logSpam(siteId, settings, submission.email, locale).catch(() => undefined);
        return reply(spec.doubleOptIn ? 'pending' : 'success');
      }

      const outcome = await deliver(siteId, settings, spec, submission, {
        locale,
        ip: request.ip,
        page: back,
      });
      return outcome === 'invalid' ? reply('invalid', { fields: ['email'] }) : reply(outcome);
    },
  });

  /** A checked submission of the form, to the service. */
  async function deliver(
    siteId: string,
    settings: Settings,
    spec: NonNullable<ReturnType<typeof readSpec>>,
    submission: ReturnType<typeof readSubmission>,
    where: { locale: string; ip?: string; ipHash?: string; page: string },
  ): Promise<Outcome> {
    const key = await hashKey(siteId);
    const consent = consentRecord({
      key,
      text: consentText(textsFor(settings, where.locale), settings.privacyUrl),
      ...(where.ip ? { ip: where.ip } : {}),
      source: FORM_ID,
      page: where.page,
    });
    if (!where.ip && where.ipHash) consent.ipHash = where.ipHash;
    const mapped = providerFields(submission, settings);
    const result = await subscribe(siteId, settings, {
      source: 'form',
      email: submission.email,
      ...mapped,
      lists: spec.lists,
      tags: spec.tags,
      doubleOptIn: spec.doubleOptIn,
      consent,
      ...(where.ip ? { ip: where.ip } : {}),
      locale: where.locale,
    });
    if (result.status === 'error')
      return result.error?.code === 'invalid-email' ? 'invalid' : 'error';
    return result.status === 'pending'
      ? 'pending'
      : result.status === 'already'
        ? 'already'
        : 'success';
  }

  // A signup held as spam and released as not spam (plugin API 1.45).
  ctx.hooks.on('form.released', async ({ form, fields, locale }, { siteId }) => {
    if (form !== FORM_ID) return;
    const settings = await settingsOf(siteId);
    const spec = readSpec(await hashKey(siteId), fields._spec);
    if (!spec) return;
    const submission = readSubmission(fields, spec, settings.customFields);
    if (submission.bad.length) return;
    const back =
      typeof fields._back === 'string' && /^\/(?![/\\])/.test(fields._back) ? fields._back : '/';
    await deliver(siteId, settings, spec, submission, {
      locale,
      page: back,
      ...(typeof fields._iph === 'string' ? { ipHash: fields._iph.slice(0, 64) } : {}),
    });
  });

  // ---- "Subscribe me" in other plugins' forms ----------------------------------------

  installOptIn({
    version: 1,
    async checkbox({ siteId, locale, source }) {
      if (!(SOURCES as readonly string[]).includes(source)) return null;
      if (!(await ctx.storage.get(siteId, ACTIVE_KEY))) return null;
      const settings = await settingsOf(siteId);
      if (!settings.integrations[source as (typeof SOURCES)[number]]) return null;
      if (!(await ready(siteId, settings))) return null;
      return { name: OPTIN_FIELD, label: textsFor(settings, locale).optIn };
    },
    async subscribe(input: OptInSubscriber) {
      const { siteId } = input;
      try {
        if (!(SOURCES as readonly string[]).includes(input.source)) return;
        if (!(await ctx.storage.get(siteId, ACTIVE_KEY))) return;
        const settings = await settingsOf(siteId);
        if (!settings.integrations[input.source as (typeof SOURCES)[number]]) return;
        const email = text(input.email, 254).toLowerCase();
        if (!isEmail(email) || !(await ready(siteId, settings))) return;
        const names =
          input.firstName || input.lastName
            ? { firstName: text(input.firstName, 100), lastName: text(input.lastName, 100) }
            : splitName(text(input.name, 200));
        const key = await hashKey(siteId);
        const mapped = providerFields({ ...names, fields: {} }, settings);
        const consent = consentRecord({
          key,
          text: textsFor(settings, input.locale).optIn,
          ...(input.ip ? { ip: input.ip } : {}),
          source: input.source,
        });
        // In the background: the host's request does not wait for the service.
        void subscribe(siteId, settings, {
          source: input.source,
          email,
          ...mapped,
          lists: settings.integrationLists.length ? settings.integrationLists : settings.lists,
          tags: settings.integrationTags,
          doubleOptIn: settings.doubleOptIn,
          consent,
          ...(input.ip ? { ip: input.ip } : {}),
          locale: input.locale,
        }).catch((error: unknown) =>
          ctx.log.error('NewLetter: an opt-in failed', { error: String(error) }),
        );
      } catch (error) {
        ctx.log.error('NewLetter: an opt-in failed', { error: String(error) });
      }
    },
  });

  // ---- Retention, privacy ----------------------------------------------------------

  ctx.schedule.every('retention', 60, async (siteId) => {
    const { retentionDays } = await settingsOf(siteId);
    if (retentionDays <= 0) return;
    const before = new Date(Date.now() - retentionDays * 86400_000);
    await store.olderThan(siteId, before);
  });

  ctx.privacy.registerExporter({
    id: SLUG,
    label: { en: 'Newsletter subscriptions', it: 'Iscrizioni alla newsletter' },
    async export(siteId, email) {
      const hash = hashOf(await hashKey(siteId), 'email', email);
      const rows = await store.byEmailHash(siteId, hash);
      if (rows.length === 0) return [];
      return [
        {
          id: `${SLUG}.subscriptions`,
          label: { en: 'Newsletter subscriptions', it: 'Iscrizioni alla newsletter' },
          items: rows.map((r) => ({
            date: r.createdAt,
            service: r.provider,
            lists: r.listIds.join(', '),
            status: r.status,
            from: r.source,
            consent: r.consent?.text ?? '',
            consentAt: r.consent?.at ?? '',
          })),
        },
      ];
    },
  });
  ctx.privacy.registerEraser({
    id: SLUG,
    label: { en: 'Newsletter subscriptions', it: 'Iscrizioni alla newsletter' },
    async erase(siteId, email) {
      const hash = hashOf(await hashKey(siteId), 'email', email);
      return {
        removed: await store.eraseEmailHash(siteId, hash),
        retained: 0,
        messages: [
          'The contact is kept by the email-marketing service: unsubscribe or delete it there too.',
        ],
      };
    },
  });

  // A section of the privacy policy made by the Privacy plugin (Privacy 1.7 registry).
  const policy = ((globalThis as unknown as Record<symbol, unknown>)[
    Symbol.for('cleitext.privacy.policySections')
  ] ??= new Map()) as Map<
    string,
    (input: { siteId: string; locale: string }) => Promise<{ title: string; text: string }[]>
  >;
  policy.set(SLUG, async ({ siteId, locale }) => {
    if (!(await ctx.storage.get(siteId, ACTIVE_KEY))) return [];
    const settings = await settingsOf(siteId);
    if (!settings.provider) return [];
    const service = providerOf(settings.provider, http).name;
    const it = locale.toLowerCase().startsWith('it');
    const days = settings.retentionDays;
    return [
      {
        title: it ? 'Newsletter' : 'Newsletter',
        text: it
          ? `Se ti iscrivi alla newsletter (dal modulo di iscrizione o spuntando la casella “Iscrivimi alla newsletter” in un altro modulo del sito), il tuo indirizzo email e, se li scrivi, nome e cognome sono inviati a ${service}, il servizio che usiamo per spedire la newsletter, che li tratta per nostro conto. La base giuridica è il tuo consenso (art. 6.1.a GDPR), che puoi revocare in qualsiasi momento con il link di cancellazione presente in ogni email.${settings.doubleOptIn ? ' Prima dell’iscrizione ricevi un’email per confermarla (double opt-in).' : ''} Il sito tiene una registrazione del consenso (data e ora, testo accettato e un’impronta non reversibile dell’indirizzo IP e dell’email) ${days > 0 ? `per ${days} giorni` : 'finché resti iscritto'}, come prova del consenso.`
          : `If you subscribe to the newsletter (from the signup form, or by ticking “Subscribe me to the newsletter” in another form of the site), your email address and, if you write them, your name and surname are sent to ${service}, the service we use to send the newsletter, which processes them on our behalf. The legal basis is your consent (Art. 6(1)(a) GDPR), which you can withdraw at any time with the unsubscribe link in every email.${settings.doubleOptIn ? ' Before you are subscribed you get an email to confirm it (double opt-in).' : ''} The site keeps a record of the consent (date and time, the text accepted and a non-reversible fingerprint of the IP address and the email) ${days > 0 ? `for ${days} days` : 'as long as you are subscribed'}, as proof of the consent.`,
      },
    ];
  });

  ctx.ai?.addContext({ title: `Newsletter (${NAME.en})`, markdown: () => AI_GUIDE });

  // ---- Admin API -------------------------------------------------------------------

  const adminRoute = (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    handler: Parameters<typeof ctx.routes.api>[0]['handler'],
  ) => ctx.routes.api({ method, path, capability: CAPABILITY, handler });

  /** An error as the admin reads it: problem details (`title`, `detail`) with the code. */
  const problem = (status: number, code: string, message: string) => ({
    status,
    body: { type: 'about:blank', title: message, detail: message, status, code, message },
  });
  const errorBody = (error: unknown) =>
    error instanceof ProviderError
      ? problem(error.code === 'network' ? 502 : 400, error.code, error.message)
      : null;

  /** The settings as the admin sees them: never the key, only whether there is one. */
  async function adminSettings(siteId: string) {
    const settings = await settingsOf(siteId);
    const hasKey = Boolean(await ctx.secrets.get(siteId, API_KEY_SECRET));
    return { settings, hasKey, ready: isReady(settings, hasKey) };
  }

  adminRoute('GET', '/settings', async (request) => ({
    body: await adminSettings(request.siteId),
  }));

  adminRoute('PUT', '/settings', async (request) => {
    const current = await settingsOf(request.siteId);
    const input = body(request);
    // The connection is changed through /connection only.
    const next = normalizeSettings({
      ...current,
      ...input,
      provider: current.provider,
      apiUrl: current.apiUrl,
      account: current.account,
    });
    await ctx.storage.set(request.siteId, SETTINGS_KEY, next);
    // Pages with the form or a "subscribe me" box show the new settings.
    await ctx.cache.invalidate(request.siteId, ['site']);
    return { body: await adminSettings(request.siteId) };
  });

  /** Credentials from the request (a key being tried) or the saved ones. */
  async function credentialsFrom(siteId: string, input: Record<string, unknown>) {
    const settings = await settingsOf(siteId);
    const provider = isProviderId(input.provider) ? input.provider : settings.provider;
    if (!provider) throw new ProviderError('config', 'Choose a service.');
    const key = text(input.key, 300) || (await ctx.secrets.get(siteId, API_KEY_SECRET)) || '';
    if (!key) throw new ProviderError('invalid-key', 'Enter the API key.');
    const url = text(input.apiUrl, 300) || settings.apiUrl;
    return { provider, creds: { key, ...(url ? { url } : {}) } as Credentials };
  }

  adminRoute('POST', '/verify', async (request) => {
    try {
      const { provider, creds } = await credentialsFrom(request.siteId, body(request));
      const account = await providerOf(provider, http).verify(creds);
      return { body: { ok: true, account: account.name } };
    } catch (error) {
      const out = errorBody(error);
      if (out) return out;
      throw error;
    }
  });

  adminRoute('PUT', '/connection', async (request) => {
    const input = body(request);
    if (!isProviderId(input.provider)) return problem(400, 'config', 'Choose a service.');
    const current = await settingsOf(request.siteId);
    const changed = current.provider !== input.provider;
    const typed = text(input.key, 300);
    if (changed && !typed) return problem(400, 'invalid-key', 'Enter the API key.');
    try {
      const { provider, creds } = await credentialsFrom(request.siteId, {
        ...input,
        key: typed,
      });
      const account = await providerOf(provider, http).verify(creds);
      if (typed) await ctx.secrets.set(request.siteId, API_KEY_SECRET, typed);
      const next = normalizeSettings({
        ...current,
        provider,
        apiUrl: creds.url ?? '',
        account: account.name,
        ...(changed
          ? {
              lists: [],
              listNames: {},
              integrationLists: [],
              firstNameKey: '',
              lastNameKey: '',
              customFields: [],
            }
          : {}),
      });
      await ctx.storage.set(request.siteId, SETTINGS_KEY, next);
      await ctx.cache.invalidate(request.siteId, ['site']);
      return { body: await adminSettings(request.siteId) };
    } catch (error) {
      const out = errorBody(error);
      if (out) return out;
      throw error;
    }
  });

  adminRoute('DELETE', '/connection', async (request) => {
    await ctx.secrets.delete(request.siteId, API_KEY_SECRET);
    const current = await settingsOf(request.siteId);
    await ctx.storage.set(
      request.siteId,
      SETTINGS_KEY,
      normalizeSettings({ ...current, provider: null, apiUrl: '', account: '' }),
    );
    await ctx.cache.invalidate(request.siteId, ['site']);
    return { body: await adminSettings(request.siteId) };
  });

  adminRoute('GET', '/lists', async (request) => {
    try {
      const { provider, creds } = await credentialsFrom(request.siteId, {});
      return { body: await providerOf(provider, http).lists(creds) };
    } catch (error) {
      const out = errorBody(error);
      if (out) return out;
      throw error;
    }
  });

  adminRoute('GET', '/fields', async (request) => {
    try {
      const settings = await settingsOf(request.siteId);
      const { provider, creds } = await credentialsFrom(request.siteId, {});
      const list = text(request.query.list, 100) || settings.lists[0];
      return { body: await providerOf(provider, http).fields(creds, list) };
    } catch (error) {
      const out = errorBody(error);
      if (out) return out;
      throw error;
    }
  });

  adminRoute('GET', '/log', async (request) => {
    const limit = Math.min(Math.max(Number(request.query.limit) || 100, 1), 500);
    return { body: await store.latest(request.siteId, limit) };
  });

  adminRoute('DELETE', '/log', async (request) => {
    await store.clear(request.siteId);
    return { status: 204 };
  });
}

export default definePlugin({
  async onActivate(site, ctx) {
    await ctx.storage.set(site.id, ACTIVE_KEY, true);
  },
  async onDeactivate(site, ctx) {
    await ctx.storage.delete(site.id, ACTIVE_KEY);
  },
  setup(ctx: PluginContext) {
    setupNewLetter(ctx);
  },
});
