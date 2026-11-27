import { createHash } from 'node:crypto';
import { definePlugin } from '@cleitext/plugin-sdk';
import { pgTable, date, integer, text, uuid, primaryKey } from 'drizzle-orm/pg-core';
import { and, eq, gte, sql } from 'drizzle-orm';
import CSS from './assets/front.css.txt';
import JS from './assets/front.js.txt';
import { colorVars, pathMatches, scriptConfig, scriptJson, settingsOf } from './bar';
import { SETTINGS_FIELDS } from './fields';
import { askPro, installServerApi } from './pro';

/**
 * Reklaim (official plugin, shipped on its own): a call-to-action bar fixed
 * at the bottom of the screen on phones. The bar is drawn by a small script,
 * so a cached page shows it as well; the server only says which texts.
 * Reklaim Pro adds bars per anchor and page, the page box, computers and
 * the top of the screen (see `pro.ts`).
 */

const SLUG = 'reklaim';
const VERSION = createHash('sha1').update(JS).update(CSS).digest('hex').slice(0, 10);
const ASSETS = `/${SLUG}`;
/** Bars counted per site and day, at most (a guard against made-up names). */
const MAX_BARS_PER_DAY = 50;

const clicks = pgTable(
  'clicks',
  {
    siteId: uuid('site_id').notNull(),
    day: date('day').notNull(),
    bar: text('bar').notNull(),
    clicks: integer('clicks').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.day, t.bar] })],
);

const BOTS =
  /bot|crawl|spider|slurp|facebookexternalhit|preview|lighthouse|headless|curl|wget|python|httpclient|monitor/i;
const recent = new Map<string, number>();

/** One click per visitor and minute; nothing about the visitor is kept. */
function isRepeat(key: string): boolean {
  const now = Date.now();
  if (recent.size > 5000) {
    for (const [k, at] of recent) if (now - at > 60_000) recent.delete(k);
  }
  const seen = recent.get(key);
  recent.set(key, now);
  return seen !== undefined && now - seen < 60_000;
}

const today = (offsetDays = 0) =>
  new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);

export default definePlugin({
  setup(ctx) {
    const pro = installServerApi();
    ctx.settings.define(SETTINGS_FIELDS, { title: { en: 'Reklaim', it: 'Reklaim' } });

    const asset = (body: string, contentType: string) => () =>
      Promise.resolve({
        body,
        contentType,
        headers: { 'cache-control': 'public, max-age=31536000, immutable' },
      });
    ctx.routes.public({
      method: 'GET',
      path: `${ASSETS}/front.js`,
      handler: asset(JS, 'text/javascript; charset=utf-8'),
    });
    ctx.routes.public({
      method: 'GET',
      path: `${ASSETS}/front.css`,
      handler: asset(CSS, 'text/css; charset=utf-8'),
    });

    ctx.routes.public({
      method: 'POST',
      path: `${ASSETS}/track`,
      async handler(request) {
        const agent = request.headers['user-agent'] ?? '';
        const body = (request.body ?? {}) as Record<string, unknown>;
        const bar =
          typeof body.bar === 'string'
            ? body.bar
                .replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, '')
                .trim()
                .slice(0, 60)
            : '';
        if (!bar || !agent || BOTS.test(agent)) return { status: 204 };
        const key = createHash('sha256')
          .update(`${request.siteId}|${request.ip}|${agent}|${bar}`)
          .digest('hex');
        if (isRepeat(key)) return { status: 204 };
        const cfg = settingsOf(await ctx.settings.get(request.siteId));
        if (!cfg.tracking) return { status: 204 };
        await ctx.db.transaction(request.siteId, async (tx) => {
          const day = today();
          const [known] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(clicks)
            .where(eq(clicks.day, day));
          const [same] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(clicks)
            .where(and(eq(clicks.day, day), eq(clicks.bar, bar)));
          if (!same?.n && (known?.n ?? 0) >= MAX_BARS_PER_DAY) return;
          await tx
            .insert(clicks)
            .values({ siteId: request.siteId, day, bar, clicks: 1 })
            .onConflictDoUpdate({
              target: [clicks.siteId, clicks.day, clicks.bar],
              set: { clicks: sql`${clicks.clicks} + 1` },
            });
        });
        return { status: 204 };
      },
    });

    ctx.routes.api({
      method: 'GET',
      path: '/stats',
      capability: 'manage_settings',
      async handler(request) {
        const rows = await ctx.db.transaction(request.siteId, (tx) =>
          tx
            .select({ day: clicks.day, bar: clicks.bar, clicks: clicks.clicks })
            .from(clicks)
            .where(gte(clicks.day, today(29))),
        );
        const [all] = await ctx.db.transaction(request.siteId, (tx) =>
          tx.select({ total: sql<number>`coalesce(sum(${clicks.clicks}), 0)::int` }).from(clicks),
        );
        const byDay = new Map<string, number>();
        const byBar = new Map<string, number>();
        for (const r of rows) {
          byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.clicks);
          byBar.set(r.bar, (byBar.get(r.bar) ?? 0) + r.clicks);
        }
        const days = Array.from({ length: 30 }, (_, i) => {
          const day = today(29 - i);
          return { day, clicks: byDay.get(day) ?? 0 };
        });
        const sum = (n: number) => days.slice(-n).reduce((total, d) => total + d.clicks, 0);
        return {
          body: {
            today: sum(1),
            week: sum(7),
            month: sum(30),
            total: all?.total ?? 0,
            days,
            bars: [...byBar]
              .map(([bar, n]) => ({ bar, clicks: n }))
              .sort((a, b) => b.clicks - a.clicks),
          },
        };
      },
    });

    ctx.hooks.filter('render.html', async (html, context) => {
      if (context.route === 'maintenance' || context.editorFrame) return html;
      const cfg = settingsOf(await ctx.settings.get(context.siteId));
      if (!cfg.enabled || pathMatches(context.path, cfg.hide_paths)) return html;
      const answer = await askPro(
        pro,
        {
          siteId: context.siteId,
          locale: context.locale,
          path: context.path,
          route: context.route,
          ...(context.entry
            ? {
                entry: {
                  id: context.entry.id,
                  type: context.entry.type,
                  fields: (context.entry.fields ?? {}) as Record<string, unknown>,
                },
              }
            : {}),
        },
        (message) => ctx.log.warn(message),
      );
      if (answer.hide) return html;
      const config = scriptConfig(cfg, context.locale, answer, `${ASSETS}/track`);
      if (!config) return html;
      const head = `<link rel="stylesheet" href="${ASSETS}/front.css?v=${VERSION}"><style>.reklaim{${colorVars(cfg)}}</style>`;
      const body = `<script type="application/json" id="reklaim-config">${scriptJson(config)}</script><script src="${ASSETS}/front.js?v=${VERSION}" defer></script>`;
      return html
        .replace(/<\/head>/i, () => `${head}</head>`)
        .replace(/<\/body>(?![\s\S]*<\/body>)/i, () => `${body}</body>`);
    });
  },
});
