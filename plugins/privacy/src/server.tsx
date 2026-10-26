import {
  defineBlock,
  definePlugin,
  labelText,
  type PluginContext,
  type TrackerDeclaration,
} from '@cleitext/plugin-sdk';
import { count, desc, eq, lt, sql } from 'drizzle-orm';
import { bannerHtml, CONSENT_PATH, consentModeScript, gateEmbeds } from './banner';
import { activeCmp, cmpBodyHtml, cmpCookie, cmpHasPolicy, cmpHeadHtml, cmpPolicyHtml } from './cmp';
import {
  CATEGORIES,
  categoryLabel,
  CMP_PROVIDERS,
  cmpProblems,
  cookieyesKey,
  textsFor,
  withDefaults,
  type Category,
  type CmpConfig,
  type CookieRow,
  type PrivacyConfig,
} from './config';
import { cmpPolicy, policy, type PolicyKind, type PolicySection } from './policies';
import { consents, requests } from './schema';

const CACHE_TAG = 'privacy';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** At most this many consent records per address and site in the window. */
const RATE_LIMIT = { max: 30, windowMs: 10 * 60_000 };

const recent = new Map<string, number[]>();
function allowed(key: string): boolean {
  const now = Date.now();
  const times = (recent.get(key) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (times.length >= RATE_LIMIT.max) return false;
  times.push(now);
  recent.set(key, times);
  if (recent.size > 10_000) recent.clear();
  return true;
}

/** 203.0.113.42 → 203.0.113.0; 2001:db8:1:2:… → 2001:db8:1::. */
export function truncateIp(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d+\.\d+\.\d+)\.\d+$/.exec(ip);
  if (v4) return `${v4[1]}.0`;
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}::`;
  return '';
}

/** bob@example.com → bo…@example.com */
const maskEmail = (email: string) => `${email.slice(0, 2)}…@${email.split('@')[1] ?? ''}`;

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

/** Settings from the admin, checked field by field. */
function cleanConfig(input: unknown, current: PrivacyConfig): PrivacyConfig {
  const body = (input ?? {}) as Partial<PrivacyConfig>;
  const banner = (body.banner ?? {}) as Partial<PrivacyConfig['banner']>;
  const texts = (value: unknown) =>
    Object.fromEntries(
      Object.entries((value ?? {}) as Record<string, unknown>)
        .filter(([k]) => /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(k))
        .map(([k, v]) => [k, text(v, 2000)])
        .filter(([, v]) => v),
    );
  const categories = Array.isArray(banner.categories)
    ? CATEGORIES.filter((c) => banner.categories!.includes(c))
    : current.banner.categories;
  const scripts = Object.fromEntries(
    CATEGORIES.map((c) => [c, text((banner.scripts ?? {})[c], 20_000)]).filter(([, v]) => v),
  );
  const cookies: CookieRow[] = Array.isArray(body.cookies)
    ? body.cookies.slice(0, 200).map((row) => ({
        name: text(row?.name, 200),
        provider: text(row?.provider, 200),
        category: (['necessary', ...CATEGORIES] as string[]).includes(row?.category)
          ? row.category
          : 'necessary',
        purpose: text(row?.purpose, 500),
        duration: text(row?.duration, 100),
      }))
    : current.cookies;
  const controller = (body.controller ?? {}) as Partial<PrivacyConfig['controller']>;
  const processing = (body.processing ?? {}) as Partial<PrivacyConfig['processing']>;
  const pages: PrivacyConfig['pages'] = {};
  for (const [locale, value] of Object.entries((body.pages ?? current.pages) as object)) {
    if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(locale)) continue;
    const v = (value ?? {}) as { privacy?: unknown; cookies?: unknown };
    const uuid = (x: unknown) =>
      typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x) ? x : undefined;
    const entry = { privacy: uuid(v.privacy), cookies: uuid(v.cookies) };
    if (entry.privacy || entry.cookies) pages[locale] = entry;
  }
  const cmp = (body.cmp ?? current.cmp) as Partial<CmpConfig>;
  const iubenda = (cmp.iubenda ?? {}) as Partial<CmpConfig['iubenda']>;
  const cookiebot = (cmp.cookiebot ?? {}) as Partial<CmpConfig['cookiebot']>;
  const cookieyes = (cmp.cookieyes ?? {}) as Partial<CmpConfig['cookieyes']>;
  const next: PrivacyConfig = {
    banner: {
      enabled: bool(banner.enabled, current.banner.enabled),
      layout: banner.layout === 'box' ? 'box' : 'bar',
      categories,
      title: texts(banner.title),
      message: texts(banner.message),
      color: /^#[0-9a-f]{3,8}$/i.test(String(banner.color))
        ? String(banner.color)
        : current.banner.color,
      floatingButton: bool(banner.floatingButton, current.banner.floatingButton),
      consentMode: bool(banner.consentMode, current.banner.consentMode),
      scripts,
      months: Math.min(Math.max(Number(banner.months) || 6, 1), 12),
      embedCategory: (CATEGORIES as readonly string[]).includes(String(banner.embedCategory))
        ? (banner.embedCategory as Category)
        : current.banner.embedCategory,
    },
    version: current.version,
    cookies,
    controller: {
      name: text(controller.name, 200),
      address: text(controller.address, 500),
      vat: text(controller.vat, 50),
      email: text(controller.email, 200),
      phone: text(controller.phone, 50),
      dpoEmail: text(controller.dpoEmail, 200),
    },
    processing: {
      contactForms: bool(processing.contactForms, current.processing.contactForms),
      accounts: bool(processing.accounts, current.processing.accounts),
      newsletter: bool(processing.newsletter, current.processing.newsletter),
      analytics: text(processing.analytics, 100),
      embeds: bool(processing.embeds, current.processing.embeds),
      hosting: text(processing.hosting, 200),
    },
    pages,
    consentRetentionMonths: Math.min(Math.max(Number(body.consentRetentionMonths) || 24, 6), 120),
    cmp: {
      provider: (CMP_PROVIDERS as readonly string[]).includes(String(cmp.provider))
        ? (cmp.provider as CmpConfig['provider'])
        : 'none',
      consentMode: cmp.consentMode === 'privacy' ? 'privacy' : 'cmp',
      policies: bool(cmp.policies, false),
      iubenda: {
        siteId: text(iubenda.siteId, 20),
        cookiePolicyId: text(iubenda.cookiePolicyId, 20),
        cookiePolicyIds: Object.fromEntries(
          Object.entries((iubenda.cookiePolicyIds ?? {}) as Record<string, unknown>)
            .filter(([k]) => /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(k))
            .map(([k, v]) => [k, text(v, 20)])
            .filter(([, v]) => v),
        ),
        lang: text(iubenda.lang, 10),
        options: text(iubenda.options, 5000),
        embed: iubenda.embed === 'text' ? 'text' : 'button',
      },
      cookiebot: {
        cbid: text(cookiebot.cbid, 64),
        blocking: cookiebot.blocking === 'auto' ? 'auto' : 'manual',
      },
      cookieyes: { key: cookieyesKey(text(cookieyes.key, 500)) },
    },
  };
  // New categories or cookies: what visitors agreed to changed, so they answer again.
  // Rows compared field by field: the stored copy may list its keys in another order.
  const rows = (list: CookieRow[]) =>
    JSON.stringify(list.map((r) => [r.name, r.provider, r.category, r.purpose, r.duration]));
  const changed =
    JSON.stringify(next.banner.categories) !== JSON.stringify(current.banner.categories) ||
    rows(next.cookies) !== rows(current.cookies) ||
    (body as { askAgain?: unknown }).askAgain === true;
  if (changed) next.version = current.version + 1;
  return next;
}

async function config(ctx: PluginContext, siteId: string): Promise<PrivacyConfig> {
  return withDefaults(await ctx.storage.get<Partial<PrivacyConfig>>(siteId, 'config'));
}

/** The settings with the rules of the trackers other plugins add (Analytics…). */
interface Effective {
  cfg: PrivacyConfig;
  trackers: TrackerDeclaration[];
  /** Changes when categories, cookies or trackers change: visitors answer again. */
  version: string;
}

/**
 * Embeds of other sites held until consent to the chosen category
 * (marketing by default; marketing again when the chosen one is not
 * offered), with a notice naming the provider and the category.
 */
function gatePage(html: string, cfg: PrivacyConfig, locale: string): string {
  const offered = cfg.banner.categories;
  const category: Category | null = offered.includes(cfg.banner.embedCategory)
    ? cfg.banner.embedCategory
    : offered.includes('marketing')
      ? 'marketing'
      : null;
  if (!category) return html;
  const t = textsFor(locale);
  return gateEmbeds(html, { ...t.embed, preferences: t.preferences }, cfg.banner.color, {
    category,
    offered,
    label: (c) => categoryLabel(t, c),
  });
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

async function effective(ctx: PluginContext, siteId: string): Promise<Effective> {
  const cfg = await config(ctx, siteId);
  const trackers = await ctx.privacy.trackers(siteId);
  const needed = trackers.filter((t) => t.requiresConsent).map((t) => t.category);
  const categories = CATEGORIES.filter(
    (c) => cfg.banner.categories.includes(c) || needed.includes(c),
  );
  const version =
    trackers.length === 0
      ? String(cfg.version)
      : `${cfg.version}.${hash(
          JSON.stringify(
            trackers.map((t) => [
              t.id,
              t.category,
              t.requiresConsent,
              t.cookies.map((c) => c.name),
            ]),
          ),
        )}`;
  return {
    cfg: {
      ...cfg,
      banner: {
        ...cfg.banner,
        categories,
        consentMode: cfg.banner.consentMode || trackers.some((t) => t.googleConsentMode),
      },
    },
    trackers,
    version,
  };
}

/** The external consent manager in use, when its settings are complete. */
const cmpOf = (cfg: PrivacyConfig) =>
  cfg.banner.enabled && cmpProblems(cfg.cmp).length === 0 ? activeCmp(cfg) : null;

/** Whether visitors see the built-in banner. */
const bannerShown = (e: Effective) =>
  e.cfg.banner.enabled && e.cfg.banner.categories.length > 0 && !cmpOf(e.cfg);

/** The cookie table: the banner's own cookie, the listed ones, those of the trackers. */
function cookieRows(e: Effective, locale: string): CookieRow[] {
  const t = textsFor(locale);
  const rows: CookieRow[] = [];
  const cmpRow = cmpOf(e.cfg) ? cmpCookie(e.cfg.cmp, locale, t.consentCookie) : null;
  if (cmpRow) rows.push(cmpRow);
  else if (bannerShown(e)) {
    rows.push({
      name: 'cx_consent',
      provider: 'This site',
      category: 'necessary',
      purpose: t.consentCookie,
      duration: `${e.cfg.banner.months} ${t.months}`,
    });
  }
  rows.push(
    ...e.cfg.cookies.filter((row) => row.name !== 'cx_consent' && row.name !== cmpRow?.name),
  );
  for (const tracker of e.trackers) {
    for (const cookie of tracker.cookies) {
      rows.push({
        name: cookie.name,
        provider: tracker.provider,
        category: tracker.category,
        purpose: labelText(cookie.purpose, locale),
        duration: cookie.duration,
      });
    }
  }
  return rows;
}

/**
 * Sections other plugins add to the privacy policy (Privacy 1.7): a map of
 * providers by plugin slug on `globalThis` under
 * `Symbol.for('cleitext.privacy.policySections')`, filled by those plugins in
 * their `setup` (in any order), each answering for the sites where it is
 * active. A failing provider is left out.
 */
async function policySections(
  siteId: string,
  locale: string,
  ctx: { log: { warn(message: string): void } },
): Promise<PolicySection[]> {
  const registry = (globalThis as unknown as Record<symbol, unknown>)[
    Symbol.for('cleitext.privacy.policySections')
  ] as
    | Map<string, (input: { siteId: string; locale: string }) => Promise<PolicySection[]>>
    | undefined;
  const out: PolicySection[] = [];
  for (const [slug, provider] of registry ?? []) {
    try {
      for (const s of await provider({ siteId, locale }))
        if (typeof s?.title === 'string' && typeof s.text === 'string')
          out.push({ title: s.title.slice(0, 200), text: s.text.slice(0, 5000) });
    } catch (error) {
      ctx.log.warn(`The privacy policy section of ${slug} failed: ${String(error)}`);
    }
  }
  return out;
}

/** Addresses of the policy pages in a language, or in the default one. */
async function policyLinks(
  ctx: PluginContext,
  siteId: string,
  cfg: PrivacyConfig,
  locale: string,
): Promise<{ privacy?: string; cookies?: string }> {
  const ids = cfg.pages[locale] ?? Object.values(cfg.pages)[0] ?? {};
  const links: { privacy?: string; cookies?: string } = {};
  for (const kind of ['privacy', 'cookies'] as const) {
    const id = ids[kind];
    if (!id) continue;
    const entry = await ctx.content.get(siteId, id);
    if (entry?.status === 'published') links[kind] = new URL(entry.url, 'http://x').pathname;
  }
  return links;
}

/**
 * Privacy & GDPR (official plugin, shipped on its own): the cookie banner,
 * the consent log, the privacy and cookie policies, and the requests of
 * people to export or erase their personal data.
 */
export default definePlugin({
  setup(ctx) {
    ctx.access.defineCapability('manage_privacy', {
      label: { en: 'Manage privacy and GDPR', it: 'Gestire privacy e GDPR' },
      roles: ['administrator'],
    });

    // The policy pages are marked next to their title in the admin.
    ctx.hooks.filter('entry.states', async (states, { siteId, ids }) => {
      const cfg = await config(ctx, siteId);
      const wanted = new Set(ids);
      for (const pages of Object.values(cfg.pages)) {
        if (pages.privacy && wanted.has(pages.privacy)) {
          (states[pages.privacy] ??= []).push({ key: 'privacy', label: 'Privacy policy' });
        }
        if (pages.cookies && wanted.has(pages.cookies)) {
          (states[pages.cookies] ??= []).push({ key: 'cookies', label: 'Cookie policy' });
        }
      }
      return states;
    });

    // ---- Public pages: the banner and the gated scripts -----------------------------

    ctx.hooks.filter('render.html', async (html, context) => {
      context.tag(CACHE_TAG);
      const e = await effective(ctx, context.siteId);
      const cfg = e.cfg;
      if (!cfg.banner.enabled) return html;
      const cmp = cmpOf(cfg);
      if (cmp) {
        // The CMP's banner and record; the scripts and embeds are still held here.
        const ownDefaults = cfg.banner.consentMode && cfg.cmp.consentMode === 'privacy';
        const head = `${ownDefaults ? consentModeScript(e.version, false) : ''}${cmpHeadHtml(
          cfg.cmp,
          context.locale,
          cfg.banner.consentMode,
        )}`;
        let page = html.replace(/<head\b[^>]*>/i, (tag) => `${tag}${head}`);
        page = gatePage(page, cfg, context.locale);
        const tail = cmpBodyHtml(cfg, cmp, e.version, cfg.banner.consentMode);
        const close = page.lastIndexOf('</body>');
        return close >= 0 ? `${page.slice(0, close)}${tail}${page.slice(close)}` : `${page}${tail}`;
      }
      let out = html;
      if (cfg.banner.consentMode) {
        out = out.replace(/<head\b[^>]*>/i, (head) => `${head}${consentModeScript(e.version)}`);
      }
      // With only technical cookies there is nothing to ask (Garante 2021).
      if (!bannerShown(e)) return out;
      // Videos, maps and posts of other sites wait for consent, as the policies say.
      out = gatePage(out, cfg, context.locale);
      const links = await policyLinks(ctx, context.siteId, cfg, context.locale);
      const banner = bannerHtml(cfg, context.locale, links, e.version);
      const end = out.lastIndexOf('</body>');
      return end >= 0 ? `${out.slice(0, end)}${banner}${out.slice(end)}` : `${out}${banner}`;
    });

    ctx.routes.public({
      method: 'POST',
      path: CONSENT_PATH,
      async handler(request) {
        const body = (request.body ?? {}) as Record<string, unknown>;
        const consentId = text(body.id, 64);
        if (!/^[A-Za-z0-9-]{8,64}$/.test(consentId)) return { status: 400 };
        if (!allowed(`${request.siteId}|${request.ip}`)) return { status: 429 };
        const { cfg } = await effective(ctx, request.siteId);
        // An external consent manager keeps its own record.
        if (cmpOf(cfg)) return { status: 404 };
        const chosen = Array.isArray(body.categories) ? body.categories : [];
        const categories = cfg.banner.categories.filter((c) => chosen.includes(c));
        await ctx.db.transaction(request.siteId, async (tx) => {
          await tx.insert(consents).values({
            siteId: request.siteId,
            consentId,
            categories,
            version: cfg.version,
            ip: truncateIp(request.ip) || null,
            userAgent: text(request.headers['user-agent'], 300) || null,
          });
          // Now and then, records past the retention period go.
          if (Math.random() < 0.02) {
            await tx
              .delete(consents)
              .where(
                lt(
                  consents.createdAt,
                  sql`now() - make_interval(months => ${cfg.consentRetentionMonths})`,
                ),
              );
          }
        });
        return { status: 204 };
      },
    });

    // ---- Blocks for the cookie policy -------------------------------------------------

    ctx.blocks.register(
      defineBlock<Record<string, never>, { rows: CookieRow[]; declaration: string }>({
        type: 'privacy/cookie-table',
        title: { en: 'Cookie table', it: 'Tabella dei cookie' },
        description: {
          en: 'The cookies listed in Privacy → Cookies, always up to date.',
          it: 'I cookie elencati in Privacy → Cookie, sempre aggiornati.',
        },
        icon: 'editor-table',
        category: 'widgets',
        async load(_attrs, context) {
          context.tag(CACHE_TAG);
          const e = await effective(ctx, context.siteId);
          // The CMP's own cookie declaration, when chosen (Cookiebot, iubenda).
          const declaration = cmpOf(e.cfg)
            ? cmpPolicyHtml(e.cfg.cmp, 'cookies', context.locale)
            : '';
          return { rows: declaration ? [] : cookieRows(e, context.locale), declaration };
        },
        render({ data: loaded, context }) {
          const t = textsFor(context.locale);
          if (loaded?.declaration) {
            return (
              <div
                className="privacy-cookie-declaration"
                dangerouslySetInnerHTML={{ __html: loaded.declaration }}
              />
            );
          }
          const data = loaded?.rows;
          if (!data || data.length === 0) return <p>{t.noCookies}</p>;
          return (
            <figure className="wp-block-table privacy-cookie-table">
              <table>
                <thead>
                  <tr>
                    <th>{t.table.name}</th>
                    <th>{t.table.provider}</th>
                    <th>{t.table.purpose}</th>
                    <th>{t.table.category}</th>
                    <th>{t.table.duration}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={i}>
                      <td>
                        <code>{row.name}</code>
                      </td>
                      <td>{row.provider === 'This site' ? t.thisSite : row.provider}</td>
                      <td>{row.purpose}</td>
                      <td>{categoryLabel(t, row.category)}</td>
                      <td>{row.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </figure>
          );
        },
      }),
    );

    ctx.blocks.register(
      defineBlock<{ kind: PolicyKind }, string>({
        type: 'privacy/cmp-policy',
        title: { en: 'Policy of the consent manager', it: 'Policy del gestore dei consensi' },
        description: {
          en: 'The privacy or cookie policy kept by iubenda, or the cookie declaration of Cookiebot, in the language of the page.',
          it: 'La privacy o cookie policy gestita da iubenda, o la dichiarazione dei cookie di Cookiebot, nella lingua della pagina.',
        },
        icon: 'shield',
        category: 'widgets',
        attributes: [
          {
            name: 'kind',
            type: 'select',
            label: { en: 'Policy', it: 'Policy' },
            options: [
              { value: 'privacy', label: { en: 'Privacy policy', it: 'Privacy policy' } },
              { value: 'cookies', label: { en: 'Cookie policy', it: 'Cookie policy' } },
            ],
            default: 'privacy',
          },
        ],
        async load(attrs, context) {
          context.tag(CACHE_TAG);
          const cfg = await config(ctx, context.siteId);
          if (!cmpOf(cfg)) return '';
          return cmpPolicyHtml(
            cfg.cmp,
            attrs.kind === 'cookies' ? 'cookies' : 'privacy',
            context.locale,
          );
        },
        render({ data }) {
          if (!data) return null;
          return <div className="privacy-cmp-policy" dangerouslySetInnerHTML={{ __html: data }} />;
        },
      }),
    );

    ctx.blocks.register(
      defineBlock({
        type: 'privacy/preferences',
        title: { en: 'Cookie preferences button', it: 'Pulsante preferenze cookie' },
        description: {
          en: 'Opens the cookie banner to change the choice.',
          it: 'Apre il banner dei cookie per cambiare la scelta.',
        },
        icon: 'admin-generic',
        category: 'widgets',
        render({ context }) {
          return (
            <p className="privacy-preferences">
              <a className="wp-element-button" href="#cookie-preferences" data-cx-open="">
                {textsFor(context.locale).preferences}
              </a>
            </p>
          );
        },
      }),
    );

    // ---- GDPR requests: the data of the plugin itself ---------------------------------

    ctx.privacy.registerExporter({
      id: 'privacy',
      label: { en: 'Privacy requests', it: 'Richieste privacy' },
      async export(siteId, email) {
        const rows = await ctx.db.transaction(siteId, (tx) =>
          tx.select().from(requests).where(eq(requests.email, email)),
        );
        return rows.length === 0
          ? []
          : [
              {
                id: 'privacy.requests',
                label: { en: 'Privacy requests', it: 'Richieste privacy' },
                items: rows.map((r) => ({ kind: r.kind, date: r.createdAt.toISOString() })),
              },
            ];
      },
    });

    ctx.privacy.registerEraser({
      id: 'privacy',
      label: { en: 'Privacy requests', it: 'Richieste privacy' },
      async erase(siteId, email) {
        // The records stay (accountability), without the address.
        const masked = await ctx.db.transaction(siteId, (tx) =>
          tx
            .update(requests)
            .set({ email: maskEmail(email) })
            .where(eq(requests.email, email))
            .returning({ id: requests.id }),
        );
        return { removed: masked.length, retained: 0 };
      },
    });

    // ---- Admin API --------------------------------------------------------------------

    ctx.routes.api({
      method: 'GET',
      path: '/config',
      capability: 'manage_privacy',
      async handler(request) {
        return { body: await config(ctx, request.siteId) };
      },
    });

    ctx.routes.api({
      method: 'PUT',
      path: '/config',
      capability: 'manage_privacy',
      async handler(request) {
        const next = cleanConfig(request.body, await config(ctx, request.siteId));
        const problems = cmpProblems(next.cmp);
        if (problems.length > 0) {
          return {
            status: 400,
            body: {
              title: 'Bad Request',
              status: 400,
              detail: `Check the consent manager's settings: ${problems.join(', ')}.`,
              problems,
            },
          };
        }
        await ctx.storage.set(request.siteId, 'config', next);
        await ctx.cache.invalidate(request.siteId, [CACHE_TAG]);
        return { body: next };
      },
    });

    ctx.routes.api({
      method: 'GET',
      path: '/policy/:kind',
      capability: 'manage_privacy',
      async handler(request) {
        const kind = request.params.kind as PolicyKind;
        if (kind !== 'privacy' && kind !== 'cookies') return { status: 404 };
        const { cfg, trackers } = await effective(ctx, request.siteId);
        // The admin passes the site's name and address, as it shows them.
        const locale = text(request.query.locale, 20) || 'en';
        // iubenda keeps the policies: the page shows them.
        if (cfg.cmp.provider === 'iubenda' && cmpOf(cfg) && cmpHasPolicy(cfg.cmp, kind)) {
          return { body: cmpPolicy(kind, locale) };
        }
        const origin = /^https?:\/\/[^/]+$/.test(request.query.origin ?? '')
          ? request.query.origin!
          : `https://${request.headers.host ?? 'localhost'}`;
        return {
          body: policy(
            kind,
            cfg,
            locale,
            { name: text(request.query.site, 200) || request.headers.host || '', url: origin },
            await policyLinks(ctx, request.siteId, cfg, locale),
            trackers,
            kind === 'privacy' ? await policySections(request.siteId, locale, ctx) : [],
          ),
        };
      },
    });

    ctx.routes.api({
      method: 'GET',
      path: '/trackers',
      capability: 'manage_privacy',
      async handler(request) {
        const e = await effective(ctx, request.siteId);
        return {
          body: {
            trackers: e.trackers,
            categories: e.cfg.banner.categories,
            consentMode: e.cfg.banner.consentMode,
            bannerShown: bannerShown(e),
            cmp: cmpOf(e.cfg),
          },
        };
      },
    });

    // Pages the admin reads, as a visitor, to look for Google Fonts loaded before consent.
    ctx.routes.api({
      method: 'GET',
      path: '/checks/pages',
      capability: 'manage_privacy',
      async handler(request) {
        const [pages, articles] = await Promise.all(
          ['page', 'article'].map((type) =>
            ctx.content.find(request.siteId, { type, limit: 5 }).catch(() => []),
          ),
        );
        const paths = [
          '/',
          ...[...(pages ?? []), ...(articles ?? []).slice(0, 2)].map((entry) => entry.url),
        ].filter((url) => typeof url === 'string' && url.startsWith('/') && !url.startsWith('//'));
        return { body: { pages: [...new Set(paths)].slice(0, 8) } };
      },
    });

    ctx.routes.api({
      method: 'GET',
      path: '/consents',
      capability: 'manage_privacy',
      async handler(request) {
        const cfg = await config(ctx, request.siteId);
        const body = await ctx.db.transaction(request.siteId, async (tx) => {
          const [total] = await tx.select({ n: count() }).from(consents);
          const byCategory: Record<string, number> = {};
          for (const category of CATEGORIES) {
            const [row] = await tx
              .select({ n: count() })
              .from(consents)
              .where(sql`${category} = ANY(${consents.categories})`);
            byCategory[category] = row?.n ?? 0;
          }
          const [rejected] = await tx
            .select({ n: count() })
            .from(consents)
            .where(sql`cardinality(${consents.categories}) = 0`);
          const rows = await tx
            .select()
            .from(consents)
            .orderBy(desc(consents.createdAt))
            .limit(100);
          return {
            total: total?.n ?? 0,
            rejected: rejected?.n ?? 0,
            byCategory,
            version: cfg.version,
            recent: rows.map((r) => ({
              id: r.consentId,
              categories: r.categories,
              version: r.version,
              ip: r.ip,
              date: r.createdAt.toISOString(),
            })),
          };
        });
        return { body };
      },
    });

    ctx.routes.api({
      method: 'GET',
      path: '/consents.csv',
      capability: 'manage_privacy',
      async handler(request) {
        const rows = await ctx.db.transaction(request.siteId, (tx) =>
          tx.select().from(consents).orderBy(desc(consents.createdAt)).limit(100_000),
        );
        const cell = (v: string) => `"${v.replaceAll('"', '""')}"`;
        const lines = [
          'date,consent_id,categories,version,ip,user_agent',
          ...rows.map((r) =>
            [
              r.createdAt.toISOString(),
              r.consentId,
              cell(r.categories.join(' ')),
              String(r.version),
              r.ip ?? '',
              cell(r.userAgent ?? ''),
            ].join(','),
          ),
        ];
        return {
          body: `${lines.join('\n')}\n`,
          contentType: 'text/csv; charset=utf-8',
          headers: { 'content-disposition': 'attachment; filename="consents.csv"' },
        };
      },
    });

    ctx.routes.api({
      method: 'GET',
      path: '/requests',
      capability: 'manage_privacy',
      async handler(request) {
        const rows = await ctx.db.transaction(request.siteId, (tx) =>
          tx.select().from(requests).orderBy(desc(requests.createdAt)).limit(200),
        );
        return {
          body: rows.map((r) => ({
            id: r.id,
            kind: r.kind,
            email: r.email,
            handledBy: r.handledBy,
            result: r.result,
            date: r.createdAt.toISOString(),
          })),
        };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/requests',
      capability: 'manage_privacy',
      async handler(request) {
        const body = (request.body ?? {}) as Record<string, unknown>;
        const email = text(body.email, 200).toLowerCase();
        const kind = body.kind === 'erase' ? 'erase' : body.kind === 'export' ? 'export' : null;
        if (!kind || !EMAIL_RE.test(email)) {
          return {
            status: 400,
            body: {
              title: 'Bad Request',
              status: 400,
              detail: 'Give a valid email and a request kind.',
            },
          };
        }
        const handledBy = request.user?.displayName ?? '';
        const lang = text(body.locale, 20) || 'en';
        if (kind === 'export') {
          const data = await ctx.privacy.exportPersonalData(request.siteId, email);
          const found = data.reduce(
            (n, source) => n + source.groups.reduce((m, g) => m + g.items.length, 0),
            0,
          );
          await ctx.db.transaction(request.siteId, (tx) =>
            tx.insert(requests).values({
              siteId: request.siteId,
              kind,
              email,
              handledBy,
              result: { items: found },
            }),
          );
          return {
            body: {
              kind,
              email,
              exportedAt: new Date().toISOString(),
              items: found,
              data: data.map((source) => ({
                source: source.source,
                label: labelText(source.label, lang),
                groups: source.groups.map((g) => ({
                  id: g.id,
                  label: labelText(g.label, lang),
                  items: g.items,
                })),
              })),
            },
          };
        }
        const results = await ctx.privacy.erasePersonalData(request.siteId, email);
        const removed = results.reduce((n, r) => n + r.removed, 0);
        const retained = results.reduce((n, r) => n + r.retained, 0);
        // The record of the request stays, without the address (accountability).
        await ctx.db.transaction(request.siteId, (tx) =>
          tx.insert(requests).values({
            siteId: request.siteId,
            kind,
            email: maskEmail(email),
            handledBy,
            result: { removed, retained },
          }),
        );
        return {
          body: {
            kind,
            email,
            removed,
            retained,
            results: results.map((r) => ({
              source: r.source,
              label: labelText(r.label, lang),
              removed: r.removed,
              retained: r.retained,
              messages: r.messages ?? [],
            })),
          },
        };
      },
    });
  },
});
