import { createHash } from 'node:crypto';
import { defineBlock, definePlugin, type PluginContext } from '@cleitext/plugin-sdk';
import { pgTable, date, integer, uuid, primaryKey } from 'drizzle-orm/pg-core';
import { and, desc, gte, sql } from 'drizzle-orm';
import CSS from './assets/front.css.txt';
import JS from './assets/front.js.txt';
import { cleanPhone, colorVars, type Variables } from './format';
import { floatingHtml, qrSvg, waLink, type ChatOverride, type ChatSettings } from './render';
import { SETTINGS_FIELDS, OVERRIDE_FIELDS } from './fields';

/**
 * Click to Chat (official plugin, shipped on its own): Joinchat's WhatsApp
 * button and chat window for Cleitext. The settings, the per-entry box and
 * the WhatsApp button block are Cleitext's; the script and the styles are
 * Joinchat's (by Creame, GPL), with small changes noted at their top.
 */

const SLUG = 'click-to-chat';
const VERSION = createHash('sha1').update(JS).update(CSS).digest('hex').slice(0, 10);
const ASSETS = `/${SLUG}`;

const clicks = pgTable(
  'clicks',
  {
    siteId: uuid('site_id').notNull(),
    day: date('day').notNull(),
    clicks: integer('clicks').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.day] })],
);

interface Visibility {
  show_front: boolean;
  show_pages: boolean;
  show_articles: boolean;
  show_other: boolean;
  show_archives: boolean;
  show_search: boolean;
  show_404: boolean;
}

type Settings = ChatSettings & Visibility & { button_image: string | null };

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const str = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

async function settingsOf(ctx: PluginContext, siteId: string): Promise<Settings> {
  const s = await ctx.settings.get(siteId);
  return {
    telephone: str(s.telephone),
    message_send: str(s.message_send),
    button_tip: str(s.button_tip).slice(0, 40),
    button_image: typeof s.button_image === 'string' ? s.button_image : null,
    button_delay: num(s.button_delay, 3),
    position: pick(s.position, ['right', 'left'] as const, 'right'),
    color: str(s.color, '#25d366'),
    text_color: pick(s.text_color, ['white', 'black'] as const, 'white'),
    dark_mode: pick(s.dark_mode, ['no', 'yes', 'auto'] as const, 'no'),
    mobile_only: bool(s.mobile_only, false),
    whatsapp_web: bool(s.whatsapp_web, false),
    qr: bool(s.qr, false),
    qr_text: str(s.qr_text),
    message_text: str(s.message_text),
    header: pick(s.header, ['whatsapp', 'custom', 'none'] as const, 'whatsapp'),
    header_text: str(s.header_text),
    message_start: str(s.message_start),
    message_delay: num(s.message_delay, 10),
    message_views: num(s.message_views, 2),
    message_badge: bool(s.message_badge, false),
    optin_text: str(s.optin_text),
    optin_check: bool(s.optin_check, false),
    gads: str(s.gads),
    ga_event: str(s.ga_event),
    tracking: bool(s.tracking, true),
    show_front: bool(s.show_front, true),
    show_pages: bool(s.show_pages, true),
    show_articles: bool(s.show_articles, true),
    show_other: bool(s.show_other, true),
    show_archives: bool(s.show_archives, true),
    show_search: bool(s.show_search, true),
    show_404: bool(s.show_404, true),
  };
}

function visible(
  s: Settings,
  route: string,
  path: string,
  type: string | undefined,
  view: unknown,
): boolean {
  if (view === 'show') return true;
  if (view === 'hide') return false;
  if (route === 'maintenance') return false;
  if (route === 'search') return s.show_search;
  if (route === '404') return s.show_404;
  if (route === 'archive') return s.show_archives;
  if (path === '/' || /^\/[a-z]{2,3}(-[A-Z]{2})?\/?$/.test(path)) return s.show_front;
  if (type === 'page') return s.show_pages;
  if (type === 'article') return s.show_articles;
  return s.show_other;
}

/** {SITE}, {TITLE}, {URL} and {HOME} of a rendered page, read from its head. */
function variablesOf(html: string, path: string): Variables {
  const attr = (pattern: RegExp) => unescape(pattern.exec(html)?.[1] ?? '');
  const canonical = attr(/<link\b[^>]*rel="canonical"[^>]*href="([^"]*)"/i);
  const site = attr(/<meta\b[^>]*property="og:site_name"[^>]*content="([^"]*)"/i);
  const title = unescape(/<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '');
  let url = canonical || path;
  let home = '/';
  try {
    const u = new URL(canonical);
    url = u.href;
    home = `${u.origin}/`;
  } catch {
    // No canonical address: the path is all there is.
  }
  return { site, title, url, home };
}

function unescape(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// ---- Click counter -------------------------------------------------------------------

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

function today(offsetDays = 0): string {
  return new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

// ---- Plugin --------------------------------------------------------------------------

export default definePlugin({
  setup(ctx) {
    ctx.settings.define(SETTINGS_FIELDS, { title: { en: 'Click to Chat', it: 'Click to Chat' } });

    ctx.content.registerFieldGroup({
      id: SLUG,
      title: { en: 'WhatsApp button', it: 'Pulsante WhatsApp' },
      types: ['page', 'article'],
      fields: OVERRIDE_FIELDS,
    });

    // Script and styles, served by the site with a long cache (the address changes with them).
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
        const body = (request.body ?? {}) as Record<string, string>;
        const key = createHash('sha256')
          .update(`${request.siteId}|${request.ip}|${agent}|${String(body.chat_id ?? '')}`)
          .digest('hex');
        if (!agent || BOTS.test(agent) || isRepeat(key)) return { status: 204 };
        const cfg = await settingsOf(ctx, request.siteId);
        if (!cfg.tracking) return { status: 204 };
        await ctx.db.transaction(request.siteId, (tx) =>
          tx
            .insert(clicks)
            .values({ siteId: request.siteId, day: today(), clicks: 1 })
            .onConflictDoUpdate({
              target: [clicks.siteId, clicks.day],
              set: { clicks: sql`${clicks.clicks} + 1` },
            }),
        );
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
            .select({ day: clicks.day, clicks: clicks.clicks })
            .from(clicks)
            .where(and(gte(clicks.day, today(29))))
            .orderBy(desc(clicks.day)),
        );
        const [all] = await ctx.db.transaction(request.siteId, (tx) =>
          tx.select({ total: sql<number>`coalesce(sum(${clicks.clicks}), 0)::int` }).from(clicks),
        );
        const byDay = new Map(rows.map((r) => [r.day, r.clicks]));
        const days = Array.from({ length: 30 }, (_, i) => {
          const day = today(29 - i);
          return { day, clicks: byDay.get(day) ?? 0 };
        });
        const sum = (n: number) => days.slice(-n).reduce((total, d) => total + d.clicks, 0);
        return {
          body: { today: sum(1), week: sum(7), month: sum(30), total: all?.total ?? 0, days },
        };
      },
    });

    ctx.hooks.filter('render.html', async (html, context) => {
      const cfg = await settingsOf(ctx, context.siteId);
      const fields = (context.entry?.fields?.[SLUG] ?? {}) as ChatOverride & { view?: string };
      const hasTriggers = /cx-chat-button|href="#(whatsapp|joinchat)"|joinchat_(open|app)/.test(
        html,
      );
      const phone = cleanPhone(fields.telephone?.trim() ? fields.telephone : cfg.telephone);
      if (!phone && !hasTriggers) return html;
      const show =
        Boolean(phone) &&
        visible(cfg, context.route, context.path, context.entry?.type, fields.view);
      if (!show && !hasTriggers) return html;

      let image: { url: string; mime: string } | null = null;
      if (show && cfg.button_image) {
        const media = await ctx.media.get(context.siteId, cfg.button_image);
        if (media) image = { url: media.url, mime: media.mime };
      }
      const floating = phone
        ? floatingHtml({
            settings: cfg,
            override: fields,
            vars: variablesOf(html, context.path),
            locale: context.locale,
            image,
            triggersOnly: !show,
            trackingUrl: `${ASSETS}/track`,
          })
        : '';
      const head = `<link rel="stylesheet" href="${ASSETS}/front.css?v=${VERSION}"><style>.joinchat{${colorVars(cfg.color, cfg.text_color === 'white')}}</style>`;
      const body = `${floating}<script src="${ASSETS}/front.js?v=${VERSION}" defer></script>`;
      return html
        .replace(/<\/head>/i, () => `${head}</head>`)
        .replace(/<\/body>(?![\s\S]*<\/body>)/i, () => `${body}</body>`);
    });

    ctx.blocks.register(
      defineBlock<
        {
          text: string;
          phone: string;
          message: string;
          show: string;
          qrText: string;
          align: string;
        },
        { href: string; qr: string | null; phone: string }
      >({
        type: `${SLUG}/button`,
        title: { en: 'WhatsApp button', it: 'Pulsante WhatsApp' },
        description: {
          en: 'A button that opens a WhatsApp chat, with a QR code for computers.',
          it: 'Un pulsante che apre una chat WhatsApp, con un codice QR per i computer.',
        },
        icon: 'format-chat',
        category: 'widgets',
        attributes: [
          {
            name: 'text',
            type: 'text',
            maxLength: 80,
            label: { en: 'Button text', it: 'Testo del pulsante' },
            default: 'WhatsApp',
          },
          {
            name: 'phone',
            type: 'text',
            maxLength: 30,
            label: { en: 'Number (empty: the site’s)', it: 'Numero (vuoto: quello del sito)' },
            help: {
              en: 'With the country code, e.g. +39 333 1234567.',
              it: 'Con il prefisso internazionale, es. +39 333 1234567.',
            },
          },
          {
            name: 'message',
            type: 'text',
            multiline: true,
            maxLength: 1000,
            label: { en: 'Message (empty: the site’s)', it: 'Messaggio (vuoto: quello del sito)' },
          },
          {
            name: 'show',
            type: 'select',
            label: { en: 'Show', it: 'Mostra' },
            options: [
              {
                value: 'both',
                label: {
                  en: 'Button and QR code (on computers)',
                  it: 'Pulsante e codice QR (sui computer)',
                },
              },
              { value: 'button', label: { en: 'Button only', it: 'Solo il pulsante' } },
              {
                value: 'qr',
                label: {
                  en: 'QR code only (on computers)',
                  it: 'Solo il codice QR (sui computer)',
                },
              },
            ],
            default: 'both',
          },
          {
            name: 'qrText',
            type: 'text',
            maxLength: 60,
            label: { en: 'Text under the QR code', it: 'Testo sotto il codice QR' },
          },
          {
            name: 'align',
            type: 'select',
            label: { en: 'Alignment', it: 'Allineamento' },
            options: [
              { value: 'left', label: { en: 'Left', it: 'Sinistra' } },
              { value: 'center', label: { en: 'Center', it: 'Centro' } },
              { value: 'right', label: { en: 'Right', it: 'Destra' } },
            ],
            default: 'left',
          },
        ],
        async load(attrs, context) {
          const cfg = await settingsOf(ctx, context.siteId);
          const phone = cleanPhone(attrs.phone?.trim() ? attrs.phone : cfg.telephone);
          if (!phone) return { href: '', qr: null, phone };
          const message = attrs.message?.trim() ? attrs.message : cfg.message_send;
          const href = waLink(phone, message.replace(/\{[A-Z]+\}/g, '').trim());
          return { href, qr: attrs.show === 'button' ? null : qrSvg(href), phone };
        },
        render({ attrs, data, context }) {
          if (!data?.href) return null;
          const it = context.locale.toLowerCase().startsWith('it');
          const align = ['center', 'right'].includes(attrs.align) ? attrs.align : 'left';
          return (
            <div
              className={`cx-chat-button cx-chat-button--${align}${attrs.show === 'qr' ? ' cx-chat-button--qr' : ''}`}
            >
              {data.qr && (
                <figure>
                  <figcaption>
                    {attrs.qrText?.trim() || (it ? 'Inquadra il codice' : 'Scan the code')}
                  </figcaption>
                  <span dangerouslySetInnerHTML={{ __html: data.qr }} />
                </figure>
              )}
              {/* With "QR code only" phones, which have no QR code, still get the button. */}
              <a
                className="wp-element-button cx-chat-button__link joinchat_app"
                href={data.href}
                target="_blank"
                rel="noopener"
                {...(attrs.phone?.trim() ? { 'data-phone': data.phone } : {})}
                {...(attrs.message?.trim() ? { 'data-message': attrs.message } : {})}
              >
                {attrs.text?.trim() || 'WhatsApp'}
              </a>
            </div>
          );
        },
      }),
    );
  },
});
