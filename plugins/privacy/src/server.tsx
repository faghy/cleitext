import {
  defineBlock,
  definePlugin,
  labelText,
  type PluginContext,
  type TrackerDeclaration,
} from '@cleitext/plugin-sdk';
import { count, desc, eq, lt, sql } from 'drizzle-orm';
import { bannerHtml, CONSENT_PATH, consentModeScript } from './banner';
import {
  CATEGORIES,
  categoryLabel,
  textsFor,
  withDefaults,
  type CookieRow,
  type PrivacyConfig,
} from './config';
import { policy, type PolicyKind } from './policies';
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
  };
  // New categories or cookies: what visitors agreed to changed, so they answer again.
  const changed =
    JSON.stringify(next.banner.categories) !== JSON.stringify(current.banner.categories) ||
    JSON.stringify(next.cookies) !== JSON.stringify(current.cookies) ||
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

/** Whether visitors see the banner. */
const bannerShown = (e: Effective) => e.cfg.banner.enabled && e.cfg.banner.categories.length > 0;

/** The cookie table: the banner's own cookie, the listed ones, those of the trackers. */
function cookieRows(e: Effective, locale: string): CookieRow[] {
  const t = textsFor(locale);
  const rows: CookieRow[] = [];
  if (bannerShown(e)) {
    rows.push({
      name: 'cx_consent',
      provider: 'This site',
      category: 'necessary',
      purpose: t.consentCookie,
      duration: `${e.cfg.banner.months} ${t.months}`,
    });
  }
  rows.push(...e.cfg.cookies.filter((row) => row.name !== 'cx_consent'));
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
      let out = html;
      if (cfg.banner.consentMode) {
        out = out.replace(/<head\b[^>]*>/i, (head) => `${head}${consentModeScript(e.version)}`);
      }
      // With only technical cookies there is nothing to ask (Garante 2021).
      if (!bannerShown(e)) return out;
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
      defineBlock<Record<string, never>, CookieRow[]>({
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
          return cookieRows(await effective(ctx, context.siteId), context.locale);
        },
        render({ data, context }) {
          const t = textsFor(context.locale);
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
          },
        };
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
