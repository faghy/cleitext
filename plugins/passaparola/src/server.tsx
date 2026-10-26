/**
 * Passaparola (official plugin): the site's own affiliate program. Members
 * of the site apply (block or account page) and, once approved, get a code
 * and a link `https://site/?ref=<code>`; the core captures the link with
 * the visitor's consent (plugin API 1.58) and gives the code back with the
 * conversions announced by Cleishop, Agenda, Store and Forms. Each
 * conversion of the chosen source earns a commission (percent or fixed),
 * approved after the refund window and paid by hand; refunds take it back.
 * The free version counts one source; Passaparola Pro (`pro.ts`) all.
 */
import {
  defineBlock,
  definePlugin,
  type ConversionEvent,
  type PluginContext,
  type RouteRequest,
  type RouteResponse,
} from '@cleitext/plugin-sdk';
import {
  ACCOUNT_PAGE,
  BLOCKS,
  CACHE_TAG,
  CAPABILITY,
  CSS,
  NAME,
  SLUG,
  UPGRADE_URL,
} from './config';
import { toCsv } from './model/csv';
import { emailText, type EmailKind, type EmailValues } from './model/emails';
import { formatMoney, fromCents, toCents } from './model/money';
import {
  AFFILIATE_STATUSES,
  attribute,
  CODE_RE,
  commissionFor,
  REFERRAL_STATUSES,
  sourceCounts,
  toPay,
  type AffiliateStatus,
  type ReferralStatus,
} from './model/rules';
import { SOURCE_NAMES, SOURCES, type Settings } from './model/settings';
import { fill, stringsFor } from './model/strings';
import { cleanIban, cleanWebsite, EMAIL_RE, field } from './model/validate';
import { accountPage, applyForm, dashboard, esc, signInFirst, STYLE } from './pages';
import { allSources, installServerApi } from './pro';
import type { AffiliateRow } from './schema';
import { databaseStore, lite, UUID_RE, type Store } from './store';

const AREA = `/account/${ACCOUNT_PAGE}`;

const body = (request: RouteRequest) =>
  (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;

/** The language prefix of a public address: `/it` for `/it/account/affiliate`. */
const prefixOf = (request: Pick<RouteRequest, 'locale' | 'path'>) =>
  request.locale && request.path.startsWith(`/${request.locale}/`) ? `/${request.locale}` : '';

/** The language prefix of a page, from its home address (`https://site/it/` → `/it`). */
const homePrefix = (home: string) => home.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '');

const problem = (status: number, detail: string) => ({
  status,
  body: { title: detail, detail, status },
});

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = (offset = 0) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - offset);
  return d.toISOString().slice(0, 10);
};

/** The affiliate's link: the site's home with the program's parameter. */
const linkOf = (origin: string, settings: Settings, code: string) =>
  `${origin}/?${encodeURIComponent(settings.param)}=${encodeURIComponent(code)}`;

const privatePage = (title: string, html: string, status = 200): RouteResponse => ({
  status,
  headers: { 'cache-control': 'private, no-store' },
  page: { title, html },
});

export default definePlugin({
  setup(ctx: PluginContext) {
    const store: Store = databaseStore(ctx);
    const api = installServerApi();

    /** The site's address as visitors reach it, for the links in emails sent from hooks. */
    const ORIGIN_KEY = 'origin';
    async function rememberOrigin(siteId: string, origin: string) {
      if ((await ctx.storage.get(siteId, ORIGIN_KEY)) !== origin)
        await ctx.storage.set(siteId, ORIGIN_KEY, origin);
    }
    const originOf = async (siteId: string) => {
      const value = await ctx.storage.get(siteId, ORIGIN_KEY);
      return typeof value === 'string' ? value : '';
    };

    ctx.access.defineCapability(CAPABILITY, {
      label: {
        en: `Manage the affiliate program (${NAME.en})`,
        it: `Gestire il programma di affiliazione (${NAME.it})`,
      },
      roles: ['administrator'],
    });

    // ---- Emails --------------------------------------------------------------------------

    async function send(
      siteId: string,
      to: string,
      kind: EmailKind,
      locale: string,
      values: Omit<EmailValues, 'site'>,
    ): Promise<void> {
      if (!EMAIL_RE.test(to)) return;
      try {
        const site = await ctx.site(siteId);
        const mail = emailText(kind, locale || site.defaultLocale, { ...values, site: site.name });
        await ctx.mail.send({ siteId, to, subject: mail.subject, text: mail.text });
      } catch (error) {
        ctx.log.error('Email not sent', { kind, error: String(error) });
      }
    }

    /** Who hears of new applications: the settings' address, or the site's administrators. */
    async function adminEmails(siteId: string, settings: Settings): Promise<string[]> {
      if (settings.notifyEmail) return settings.notifyEmail.split(/,\s*/);
      try {
        const admins = await ctx.users.find(siteId, { role: 'administrator', limit: 5 });
        return admins.map((u) => u.email).filter((e): e is string => !!e);
      } catch {
        return [];
      }
    }

    async function welcome(siteId: string, origin: string, affiliate: AffiliateRow) {
      const settings = await store.settings(siteId);
      if (!settings.emails.approved) return;
      await send(siteId, affiliate.email, 'approved', affiliate.locale, {
        name: affiliate.name,
        code: affiliate.code,
        link: `${origin}${AREA}`,
      });
    }

    // ---- Referral links and conversions (plugin API 1.58) --------------------------------

    ctx.referrals.capture(async (siteId) => {
      const settings = await store.settings(siteId);
      return {
        param: settings.param,
        category: settings.category,
        days: settings.cookieDays,
        model: settings.model,
      };
    });

    // The referral cookie, for Privacy & GDPR: its banner asks consent to the
    // category, and its cookie policy lists the cookie.
    ctx.privacy.declareTrackers(async (siteId) => {
      const settings = await store.settings(siteId);
      const site = await ctx.site(siteId);
      return [
        {
          id: `${SLUG}.referral`,
          name: `${NAME.en} (affiliate links)`,
          provider: site.name,
          category: settings.category,
          requiresConsent: true,
          cookies: [
            {
              name: `cx_ref_${SLUG.replace(/-/g, '_')}`,
              duration: `${settings.cookieDays} days`,
              purpose: {
                en: 'Remembers the affiliate whose link brought you, so they get their commission.',
                it: 'Ricorda l’affiliato dal cui link sei arrivato, perché riceva la sua commissione.',
              },
            },
          ],
          purpose: {
            en: 'When you arrive through the link of one of our affiliates, we remember their code to credit them with a commission if you buy. We do not keep your address or follow you elsewhere.',
            it: 'Quando arrivi dal link di un nostro affiliato, ricordiamo il suo codice per riconoscergli una commissione se acquisti. Non conserviamo il tuo indirizzo e non ti seguiamo altrove.',
          },
        },
      ];
    });

    ctx.hooks.on('referral.visit', async (visit, { siteId }) => {
      if (visit.plugin !== SLUG) return;
      const affiliate = await store.affiliateByCode(siteId, visit.code);
      if (affiliate?.status === 'active') await store.recordVisit(siteId, affiliate.id, today());
    });

    async function credit(siteId: string, event: ConversionEvent): Promise<void> {
      const code = event.referrals?.[SLUG];
      if (!code) return;
      const settings = await store.settings(siteId);
      const all = await allSources(api, siteId, (m) => ctx.log.warn(m));
      if (!sourceCounts(event.source, settings, all)) {
        // Shown in the admin with the invitation to Passaparola Pro.
        await store.recordMissed(siteId, event.source, monthStart());
        return;
      }
      const row = await store.affiliateByCode(siteId, code);
      const decision = attribute(event, SLUG, true, row ? lite(row) : null);
      if (!decision.ok || !row) {
        ctx.log.info('Conversion not credited', {
          source: event.source,
          reason: decision.ok ? 'unknown' : decision.reason,
        });
        return;
      }
      const commission = commissionFor(event, settings, decision.affiliate);
      const referral = await store.recordConversion(siteId, event, row.id, commission);
      if (referral && settings.emails.referral && commission.cents > 0) {
        const site = await ctx.site(siteId);
        await send(siteId, row.email, 'referral', row.locale, {
          name: row.name,
          amount: formatMoney(
            commission.cents,
            commission.currency,
            row.locale || site.defaultLocale,
          ),
          what: event.label || event.kind,
          link: `${await originOf(siteId)}${AREA}`,
        });
      }
    }

    ctx.hooks.on('conversion.paid', (event, { siteId }) => credit(siteId, event));
    ctx.hooks.on('conversion.reversed', async (reversal, { siteId }) => {
      await store.reverse(
        siteId,
        reversal.source,
        reversal.id,
        reversal.amount ? toCents(reversal.amount) : null,
      );
    });

    // Commissions are approved once the refund window is over.
    ctx.schedule.every('approve', 60, async (siteId) => {
      const settings = await store.settings(siteId);
      await store.approveDue(siteId, settings.refundDays);
    });

    // ---- The visitor's account -----------------------------------------------------------

    ctx.hooks.filter('account.links', async (links, context) => {
      const s = stringsFor(context.locale);
      const affiliate = await store.affiliateByUser(context.siteId, context.userId);
      return [
        ...links,
        { label: affiliate ? s.areaTitle : s.becomeTitle, url: `${context.base}/${ACCOUNT_PAGE}` },
      ];
    });

    const signedIn = (request: RouteRequest): RouteResponse | null =>
      request.user
        ? null
        : {
            status: 303,
            headers: {
              location: `${prefixOf(request)}/account/login?redirect=${encodeURIComponent(request.path)}`,
            },
          };

    /** The affiliate area: the form, the state of the application, or the dashboard. */
    async function area(
      request: RouteRequest,
      extra: { error?: string; values?: Record<string, string>; status?: number } = {},
    ): Promise<RouteResponse> {
      const s = stringsFor(request.locale);
      const prefix = prefixOf(request);
      await rememberOrigin(request.siteId, request.origin);
      const settings = await store.settings(request.siteId);
      const affiliate = await store.affiliateByUser(request.siteId, request.user!.id);
      const page = (content: string) =>
        privatePage(s.areaTitle, accountPage(s, `${prefix}/account`, content), extra.status);
      if (!affiliate)
        return page(
          applyForm(s, {
            action: `${prefix}${AREA}/apply`,
            termsUrl: settings.termsUrl,
            ...(extra.values ? { values: extra.values } : {}),
            ...(extra.error ? { error: extra.error } : {}),
            heading: s.applyTitle,
          }),
        );
      if (affiliate.status !== 'active') {
        const text =
          affiliate.status === 'pending'
            ? s.pending
            : affiliate.status === 'rejected'
              ? s.rejected
              : s.suspended;
        return page(`<p class="${CSS}-notice">${esc(text)}</p>`);
      }
      const data = await store.dashboard(request.siteId, affiliate.id);
      const locale = request.locale || affiliate.locale;
      return page(
        dashboard(s, {
          name: affiliate.name,
          link: linkOf(request.origin, settings, affiliate.code),
          cookieDays: settings.cookieDays,
          refundDays: settings.refundDays,
          locale,
          visits: data.visits,
          conversions: data.conversions,
          totals: data.totals,
          currency: settings.currency,
          latest: data.latest,
          payouts: data.payouts,
          paypalEmail: affiliate.paypalEmail,
          iban: affiliate.iban,
          payoutAction: `${prefix}${AREA}/payout`,
          termsUrl: settings.termsUrl,
          minPayout:
            settings.minPayout > 0
              ? formatMoney(toCents(settings.minPayout), settings.currency, locale)
              : '',
          saved: request.query.saved === '1',
          ...(extra.error ? { error: extra.error } : {}),
        }),
      );
    }

    ctx.routes.public({
      method: 'GET',
      path: AREA,
      async handler(request) {
        return signedIn(request) ?? area(request);
      },
    });

    /** Payment details from a form; an error message when they are not valid. */
    function payoutDetails(
      input: Record<string, unknown>,
      s: ReturnType<typeof stringsFor>,
    ): { paypalEmail: string; iban: string } | { error: string } {
      const paypalEmail = field(input.paypal, 200).toLowerCase();
      const ibanText = field(input.iban, 40);
      if (paypalEmail && !EMAIL_RE.test(paypalEmail)) return { error: s.badPaypal };
      const iban = ibanText ? cleanIban(ibanText) : '';
      if (iban === null) return { error: s.badIban };
      return { paypalEmail, iban };
    }

    ctx.routes.public({
      method: 'POST',
      path: `${AREA}/apply`,
      async handler(request) {
        const away = signedIn(request);
        if (away) return away;
        const s = stringsFor(request.locale);
        const prefix = prefixOf(request);
        const back = { status: 303, headers: { location: `${prefix}${AREA}` } };
        if (await store.affiliateByUser(request.siteId, request.user!.id)) return back;
        const input = body(request);
        const values = {
          code: field(input.code, 32).toLowerCase(),
          website: field(input.website, 300),
          promotion: field(input.promotion, 1000),
          paypal: field(input.paypal, 200),
          iban: field(input.iban, 40),
        };
        const refuse = (error: string) => area(request, { error, values, status: 400 });
        if (input.terms !== '1' && input.terms !== true && input.terms !== 'on')
          return refuse(s.mustAccept);
        if (values.code && !CODE_RE.test(values.code)) return refuse(s.badCode);
        if (values.code && (await store.codeTaken(request.siteId, values.code)))
          return refuse(s.takenCode);
        const details = payoutDetails(input, s);
        if ('error' in details) return refuse(details.error);
        const settings = await store.settings(request.siteId);
        const member = await ctx.users.get(request.siteId, request.user!.id).catch(() => null);
        let affiliate: AffiliateRow;
        try {
          affiliate = await store.apply(request.siteId, {
            userId: request.user!.id,
            name: request.user!.displayName,
            email: member?.email ?? '',
            locale: request.locale,
            code: values.code,
            website: cleanWebsite(values.website),
            promotion: values.promotion,
            paypalEmail: details.paypalEmail,
            iban: details.iban,
            status: settings.approval === 'auto' ? 'active' : 'pending',
          });
        } catch {
          // Two applications at once, or a code taken meanwhile.
          return back;
        }
        if (affiliate.status === 'active') await welcome(request.siteId, request.origin, affiliate);
        else if (settings.emails.application) {
          const site = await ctx.site(request.siteId);
          for (const to of await adminEmails(request.siteId, settings))
            await send(request.siteId, to, 'application', site.defaultLocale, {
              name: affiliate.name,
              email: affiliate.email || '—',
              link: `${request.origin}/cl-admin/ext/${SLUG}`,
            });
        }
        return back;
      },
    });

    ctx.routes.public({
      method: 'POST',
      path: `${AREA}/payout`,
      async handler(request) {
        const away = signedIn(request);
        if (away) return away;
        const s = stringsFor(request.locale);
        const affiliate = await store.affiliateByUser(request.siteId, request.user!.id);
        if (!affiliate || affiliate.status !== 'active')
          return { status: 303, headers: { location: `${prefixOf(request)}${AREA}` } };
        const details = payoutDetails(body(request), s);
        if ('error' in details) return area(request, { error: details.error, status: 400 });
        await store.savePayoutDetails(request.siteId, affiliate.id, details);
        return {
          status: 303,
          headers: { location: `${prefixOf(request)}${AREA}?saved=1#payout` },
        };
      },
    });

    // ---- Blocks --------------------------------------------------------------------------

    interface BlockView {
      html: string;
    }

    const blockHtml = (html: string) => (
      <div className={CSS} dangerouslySetInnerHTML={{ __html: `<style>${STYLE}</style>${html}` }} />
    );

    ctx.blocks.register(
      defineBlock<{ heading: string; showRegister: boolean }, BlockView>({
        type: BLOCKS.signup,
        title: {
          en: `Affiliate application (${NAME.en})`,
          it: `Richiesta di affiliazione (${NAME.it})`,
        },
        description: {
          en: 'The form to join the affiliate program, with the program terms. Visitors who are not signed in are asked to sign in or create an account first.',
          it: 'Il modulo per entrare nel programma di affiliazione, con le condizioni. A chi non ha fatto l’accesso chiede prima di accedere o di creare un account.',
        },
        icon: 'groups',
        category: 'widgets',
        attributes: [
          { name: 'heading', type: 'text', maxLength: 200, label: { en: 'Heading', it: 'Titolo' } },
          {
            name: 'showRegister',
            type: 'boolean',
            default: true,
            label: {
              en: 'Offer to create an account (registration open)',
              it: 'Proponi di creare un account (registrazione aperta)',
            },
          },
        ],
        async load(attrs, context) {
          context.tag(CACHE_TAG);
          const s = stringsFor(context.locale);
          const prefix = homePrefix(context.page.site.home);
          const user = context.page.user;
          if (!user) {
            return {
              html: signInFirst(s, {
                login: `${prefix}/account/login?redirect=${encodeURIComponent(`${prefix}${AREA}`)}`,
                register: attrs.showRegister === false ? null : `${prefix}/account/register`,
              }),
            };
          }
          const affiliate = await store.affiliateByUser(context.siteId, user.id);
          if (affiliate)
            return {
              html: `<p><a class="${CSS}-button" href="${esc(`${prefix}${AREA}`)}">${esc(s.yourArea)}</a></p>`,
            };
          const settings = await store.settings(context.siteId);
          return {
            html: applyForm(s, {
              action: `${prefix}${AREA}/apply`,
              termsUrl: settings.termsUrl,
              heading: attrs.heading || s.applyTitle,
            }),
          };
        },
        render: ({ data }) => blockHtml(data.html),
      }),
    );

    ctx.blocks.register(
      defineBlock<{ guestLabel: string; memberLabel: string }, BlockView>({
        type: BLOCKS.link,
        title: {
          en: `Affiliate area link (${NAME.en})`,
          it: `Link all’area affiliato (${NAME.it})`,
        },
        description: {
          en: 'A link to the affiliate area: to sign in for visitors, to the area for affiliates.',
          it: 'Un link all’area affiliato: per accedere ai visitatori, all’area per gli affiliati.',
        },
        icon: 'login',
        category: 'widgets',
        attributes: [
          {
            name: 'guestLabel',
            type: 'text',
            maxLength: 100,
            label: { en: 'Text for visitors', it: 'Testo per i visitatori' },
          },
          {
            name: 'memberLabel',
            type: 'text',
            maxLength: 100,
            label: { en: 'Text for signed-in people', it: 'Testo per chi ha fatto l’accesso' },
          },
        ],
        async load(attrs, context) {
          context.tag(CACHE_TAG);
          const s = stringsFor(context.locale);
          const prefix = homePrefix(context.page.site.home);
          const user = context.page.user;
          const url = user
            ? `${prefix}${AREA}`
            : `${prefix}/account/login?redirect=${encodeURIComponent(`${prefix}${AREA}`)}`;
          let label = attrs.guestLabel || s.signInArea;
          if (user) {
            const affiliate = await store.affiliateByUser(context.siteId, user.id);
            label = attrs.memberLabel || (affiliate ? s.yourArea : s.becomeButton);
          }
          return { html: `<a class="${CSS}-account-link" href="${esc(url)}">${esc(label)}</a>` };
        },
        render: ({ data }) => (
          <span className={`${CSS}-account`} dangerouslySetInnerHTML={{ __html: data.html }} />
        ),
      }),
    );

    ctx.blocks.register(
      defineBlock<
        {
          heading: string;
          text: string;
          buttonLabel: string;
          buttonUrl: string;
          showRate: boolean;
        },
        BlockView
      >({
        type: BLOCKS.cta,
        title: { en: `Become an affiliate (${NAME.en})`, it: `Diventa affiliato (${NAME.it})` },
        description: {
          en: 'A box inviting visitors to join the affiliate program, with the commission.',
          it: 'Un riquadro che invita i visitatori a entrare nel programma di affiliazione, con la commissione.',
        },
        icon: 'campaign',
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
            name: 'buttonLabel',
            type: 'text',
            maxLength: 80,
            label: { en: 'Button text', it: 'Testo del pulsante' },
          },
          {
            name: 'buttonUrl',
            type: 'text',
            maxLength: 300,
            label: { en: 'Button address', it: 'Indirizzo del pulsante' },
            help: {
              en: 'Empty: the affiliate area, where people apply.',
              it: 'Vuoto: l’area affiliato, dove si fa la richiesta.',
            },
          },
          {
            name: 'showRate',
            type: 'boolean',
            default: true,
            label: { en: 'Show the commission', it: 'Mostra la commissione' },
          },
        ],
        async load(attrs, context) {
          context.tag(CACHE_TAG);
          const s = stringsFor(context.locale);
          const prefix = homePrefix(context.page.site.home);
          const settings = await store.settings(context.siteId);
          const rate =
            attrs.showRate === false
              ? ''
              : settings.commissionType === 'percent'
                ? fill(s.earnPercent, {
                    value: settings.commissionValue.toLocaleString(context.locale || 'en'),
                  })
                : fill(s.earnFixed, {
                    value: formatMoney(
                      toCents(settings.commissionValue),
                      settings.currency,
                      context.locale,
                    ),
                  });
          const url = /^(\/(?![/\\])|https?:\/\/)/.test(attrs.buttonUrl ?? '')
            ? attrs.buttonUrl
            : `${prefix}${AREA}`;
          return {
            html: `<div class="${CSS}-cta"><h2>${esc(attrs.heading || s.becomeTitle)}</h2><p>${esc(
              attrs.text || s.becomeText,
            )}</p>${rate ? `<p><strong>${esc(rate)}</strong></p>` : ''}<p><a class="${CSS}-button" href="${esc(url)}">${esc(
              attrs.buttonLabel || s.becomeButton,
            )}</a></p></div>`,
          };
        },
        render: ({ data }) => blockHtml(data.html),
      }),
    );

    // ---- Admin ---------------------------------------------------------------------------

    const admin = (
      method: 'GET' | 'POST' | 'PUT' | 'PATCH',
      path: string,
      handler: (request: RouteRequest) => Promise<RouteResponse>,
    ) => ctx.routes.api({ method, path, capability: CAPABILITY, handler });

    admin('GET', '/overview', async (request) => {
      const siteId = request.siteId;
      await rememberOrigin(siteId, request.origin);
      const settings = await store.settings(siteId);
      const [pending, active, payable, missedCounts, all] = await Promise.all([
        store.listAffiliates(siteId, { status: 'pending', limit: 1 }),
        store.listAffiliates(siteId, { status: 'active', limit: 1 }),
        store.payable(siteId),
        store.missedCount(siteId, monthStart(2)),
        allSources(api, siteId),
      ]);
      const lines = toPay(payable.rows, toCents(settings.minPayout));
      return {
        body: {
          settings,
          counts: { pending: pending.total, active: active.total },
          toPay: lines.filter((l) => l.due).length,
          missed: missedCounts,
          allSources: all,
          sources: SOURCES.map((id) => ({ id, name: SOURCE_NAMES[id] })),
          upgradeUrl: api.upgradeUrl || UPGRADE_URL,
        },
      };
    });

    admin('GET', '/settings', async (request) => ({
      body: { settings: await store.settings(request.siteId) },
    }));

    admin('PUT', '/settings', async (request) => {
      const settings = await store.saveSettings(request.siteId, request.body);
      // The capture script and the blocks show the new settings.
      await ctx.cache.invalidate(request.siteId, ['referrals', CACHE_TAG]);
      return { body: { settings } };
    });

    admin('GET', '/affiliates', async (request) => {
      const status = request.query.status as AffiliateStatus;
      const result = await store.listAffiliates(request.siteId, {
        ...((AFFILIATE_STATUSES as readonly string[]).includes(status) ? { status } : {}),
        ...(request.query.search ? { search: request.query.search.slice(0, 100) } : {}),
        limit: 50,
        offset: Math.max(0, Number(request.query.offset) || 0),
      });
      const settings = await store.settings(request.siteId);
      return {
        body: {
          ...result,
          affiliates: result.affiliates.map((a) => ({
            ...a,
            link: linkOf(request.origin, settings, a.code),
          })),
        },
      };
    });

    admin('POST', '/affiliates/:id/status', async (request) => {
      const status = (body(request).status ?? '') as AffiliateStatus;
      if (!(AFFILIATE_STATUSES as readonly string[]).includes(status))
        return problem(400, 'Unknown status.');
      const changed = await store.setStatus(request.siteId, request.params.id ?? '', status);
      if (!changed) return problem(404, 'This affiliate does not exist.');
      if (status === 'active' && changed.previous === 'pending')
        await welcome(request.siteId, request.origin, changed.row);
      return { body: changed.row };
    });

    admin('PATCH', '/affiliates/:id', async (request) => {
      const input = body(request);
      const changes: { rate?: number | null; code?: string; note?: string } = {};
      if ('rate' in input) {
        if (input.rate === null || input.rate === '') changes.rate = null;
        else {
          const rate = Number(String(input.rate).replace(',', '.'));
          if (!Number.isFinite(rate) || rate < 0 || rate > 1_000_000)
            return problem(400, 'The rate is a number, 0 or more (percent: up to 100).');
          const settings = await store.settings(request.siteId);
          if (settings.commissionType === 'percent' && rate > 100)
            return problem(400, 'A percent rate is at most 100.');
          changes.rate = Math.round(rate * 100) / 100;
        }
      }
      if (typeof input.code === 'string' && input.code.trim()) {
        const code = input.code.trim().toLowerCase();
        if (!CODE_RE.test(code))
          return problem(400, 'Codes have lowercase letters, digits and dashes (2–32).');
        const owner = await store.affiliateByCode(request.siteId, code);
        if (owner && owner.id !== request.params.id) return problem(409, 'This code is taken.');
        changes.code = code;
      }
      if (typeof input.note === 'string') changes.note = field(input.note, 2000);
      const row = await store.updateAffiliate(request.siteId, request.params.id ?? '', changes);
      return row ? { body: row } : problem(404, 'This affiliate does not exist.');
    });

    const referralQuery = (request: RouteRequest) => {
      const q = request.query;
      const isDate = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
      return {
        ...((REFERRAL_STATUSES as readonly string[]).includes(q.status ?? '')
          ? { status: q.status as ReferralStatus }
          : {}),
        ...(q.affiliate && UUID_RE.test(q.affiliate) ? { affiliateId: q.affiliate } : {}),
        ...(q.source && /^[a-z][a-z0-9-]{1,39}$/.test(q.source) ? { source: q.source } : {}),
        ...(isDate(q.from) ? { from: q.from! } : {}),
        ...(isDate(q.to) ? { to: q.to! } : {}),
      };
    };

    admin('GET', '/referrals', async (request) => ({
      body: await store.listReferrals(request.siteId, {
        ...referralQuery(request),
        limit: 50,
        offset: Math.max(0, Number(request.query.offset) || 0),
      }),
    }));

    admin('GET', '/referrals.csv', async (request) => {
      const { rows } = await store.listReferrals(request.siteId, {
        ...referralQuery(request),
        limit: 5000,
      });
      return {
        contentType: 'text/csv; charset=utf-8',
        headers: { 'content-disposition': `attachment; filename="${SLUG}-referrals.csv"` },
        body: toCsv(
          [
            'date',
            'affiliate',
            'code',
            'source',
            'what',
            'customer',
            'status',
            'commission',
            'currency',
          ],
          rows.map(({ referral: r, affiliate: a }) => [
            r.createdAt.toISOString().slice(0, 10),
            a.name,
            a.code,
            r.source,
            r.kind === 'adjustment' ? `adjustment: ${r.label}` : r.label,
            r.customerEmail,
            r.status,
            fromCents(Number(r.amountCents)),
            r.currency,
          ]),
        ),
      };
    });

    admin('POST', '/referrals/:id/status', async (request) => {
      const status = body(request).status;
      if (status !== 'approved' && status !== 'rejected' && status !== 'pending')
        return problem(400, 'Unknown status.');
      const row = await store.setReferralStatus(request.siteId, request.params.id ?? '', status);
      return row ? { body: row } : problem(404, 'This referral does not exist or is paid.');
    });

    async function payoutLines(siteId: string) {
      const settings = await store.settings(siteId);
      const { rows, people } = await store.payable(siteId);
      return toPay(rows, toCents(settings.minPayout)).map((line) => {
        const person = people.find((p) => p.id === line.affiliateId);
        return {
          ...line,
          amount: fromCents(line.amountCents),
          affiliate: person
            ? {
                id: person.id,
                name: person.name,
                email: person.email,
                code: person.code,
                paypalEmail: person.paypalEmail,
                iban: person.iban,
              }
            : null,
        };
      });
    }

    admin('GET', '/payouts', async (request) => ({
      body: {
        lines: await payoutLines(request.siteId),
        history: await store.listPayouts(request.siteId),
        settings: await store.settings(request.siteId),
      },
    }));

    admin('GET', '/payouts.csv', async (request) => {
      const lines = (await payoutLines(request.siteId)).filter((l) => l.due);
      return {
        contentType: 'text/csv; charset=utf-8',
        headers: { 'content-disposition': `attachment; filename="${SLUG}-payouts.csv"` },
        body: toCsv(
          ['affiliate', 'email', 'code', 'paypal', 'iban', 'amount', 'currency', 'commissions'],
          lines.map((l) => [
            l.affiliate?.name ?? '',
            l.affiliate?.email ?? '',
            l.affiliate?.code ?? '',
            l.affiliate?.paypalEmail ?? '',
            l.affiliate?.iban ?? '',
            l.amount,
            l.currency,
            l.count,
          ]),
        ),
      };
    });

    admin('POST', '/payouts', async (request) => {
      const input = body(request);
      const affiliateId = typeof input.affiliateId === 'string' ? input.affiliateId : '';
      const currency = typeof input.currency === 'string' ? input.currency.toUpperCase() : '';
      const paidAt =
        typeof input.paidAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.paidAt)
          ? new Date(`${input.paidAt}T12:00:00Z`)
          : new Date();
      const done = await store.markPaid(request.siteId, affiliateId, currency, {
        note: field(input.note, 500),
        paidAt,
      });
      if (!done) return problem(400, 'There is nothing to pay to this affiliate.');
      const settings = await store.settings(request.siteId);
      const person = await store.affiliate(request.siteId, affiliateId);
      if (person && settings.emails.payout) {
        const site = await ctx.site(request.siteId);
        await send(request.siteId, person.email, 'payout', person.locale, {
          name: person.name,
          amount: formatMoney(
            done.payout.amountCents,
            done.payout.currency,
            person.locale || site.defaultLocale,
          ),
          ...(done.payout.note ? { note: done.payout.note } : {}),
          link: `${request.origin}${AREA}`,
        });
      }
      return { status: 201, body: done };
    });

    // ---- Personal data (GDPR) ------------------------------------------------------------

    ctx.privacy.registerExporter({
      id: SLUG,
      label: { en: `Affiliate program (${NAME.en})`, it: `Programma di affiliazione (${NAME.it})` },
      async export(siteId, email) {
        const data = await store.personalData(siteId, email);
        const groups = [];
        if (data.people.length)
          groups.push({
            id: `${SLUG}.affiliate`,
            label: { en: 'Affiliate', it: 'Affiliato' },
            items: data.people.map((p) => ({
              code: p.code,
              status: p.status,
              name: p.name,
              email: p.email,
              website: p.website,
              promotion: p.promotion,
              paypal: p.paypalEmail,
              iban: p.iban,
              terms_accepted: p.termsAcceptedAt?.toISOString() ?? '',
              applied: p.createdAt.toISOString(),
            })),
          });
        if (data.payouts.length)
          groups.push({
            id: `${SLUG}.payouts`,
            label: { en: 'Affiliate payouts', it: 'Pagamenti all’affiliato' },
            items: data.payouts.map((p) => ({
              date: p.paidAt.toISOString(),
              amount: `${fromCents(Number(p.amountCents))} ${p.currency}`,
              details: p.details,
              note: p.note,
            })),
          });
        if (data.asCustomer.length)
          groups.push({
            id: `${SLUG}.referred`,
            label: { en: 'Brought by an affiliate', it: 'Portato da un affiliato' },
            items: data.asCustomer.map((r) => ({
              what: r.label,
              source: r.source,
              date: r.at.toISOString(),
            })),
          });
        return groups;
      },
    });
    ctx.privacy.registerEraser({
      id: SLUG,
      label: { en: `Affiliate program (${NAME.en})`, it: `Programma di affiliazione (${NAME.it})` },
      async erase(siteId, email) {
        const result = await store.erase(siteId, email);
        return {
          ...result,
          ...(result.retained
            ? {
                messages: [
                  'Payouts made to the affiliate are kept as accounting records, without payment details.',
                ],
              }
            : {}),
        };
      },
    });
  },
});
