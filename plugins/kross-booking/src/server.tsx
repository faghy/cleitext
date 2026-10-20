import { defineBlock, definePlugin, type PluginContext } from '@cleitext/plugin-sdk';
import {
  BLOCK_TYPE,
  blockFromShortcode,
  configOf,
  containerAttributes,
  isConfigured,
  newVersion,
  validateConfig,
  widgetAttrs,
  type KrossConfig,
  type WidgetAttrs,
} from './widget';

/**
 * Kross Booking (official plugin, shipped on its own): the booking widget of
 * Kross Booking (krossbooking.com) on the pages that show it, as the
 * WordPress plugin "krossbooking-wp-v6" did. The block renders the widget's
 * container; the plugin's loader (public/kross-booking.js), added only to
 * those pages, loads jQuery and then the widget's files. WordPress pages with
 * the `[kross-booking]` shortcode get the block on import, Fresco pages too.
 */

const CONFIG_KEY = 'config';

async function loadConfig(ctx: PluginContext, siteId: string): Promise<KrossConfig> {
  return configOf(await ctx.storage.get(siteId, CONFIG_KEY));
}

async function saveConfig(ctx: PluginContext, siteId: string, config: KrossConfig): Promise<void> {
  await ctx.storage.set(siteId, CONFIG_KEY, config);
  // Every page with the widget shows the new settings.
  await ctx.cache.invalidate(siteId, ['site']);
}

const TEXTS = {
  en: {
    title: (room: string) => `Kross Booking widget — room ${room}`,
    lang: (lang: string) => `Language: ${lang}`,
    missing:
      'Set the hotel ID and the widget ID in Settings → Kross Booking: until then the widget is not shown.',
    note: 'The widget itself is shown on the page.',
  },
  it: {
    title: (room: string) => `Widget Kross Booking — camera ${room}`,
    lang: (lang: string) => `Lingua: ${lang}`,
    missing:
      'Imposta l’ID dell’hotel e l’ID del widget in Impostazioni → Kross Booking: fino ad allora il widget non viene mostrato.',
    note: 'Il widget vero e proprio si vede nella pagina.',
  },
};

const PLACEHOLDER_STYLE = {
  padding: '1.25rem 1.5rem',
  border: '1px dashed #94a3b8',
  borderRadius: '8px',
  background: '#f8fafc',
  color: '#1e293b',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '15px',
  lineHeight: 1.5,
} as const;

export default definePlugin({
  setup(ctx) {
    ctx.blocks.register(
      defineBlock<WidgetAttrs, KrossConfig>({
        type: BLOCK_TYPE,
        title: { en: 'Kross Booking', it: 'Kross Booking' },
        description: {
          en: 'The booking widget of Kross Booking: availability and prices of your rooms. The hotel and widget IDs are in Settings → Kross Booking.',
          it: 'Il widget di prenotazione di Kross Booking: disponibilità e prezzi delle camere. Gli ID dell’hotel e del widget sono in Impostazioni → Kross Booking.',
        },
        icon: 'calendar-alt',
        category: 'widgets',
        // Exactly the widget's container, as the WordPress shortcode wrote it.
        wrapper: false,
        attributes: [
          {
            name: 'room',
            type: 'text',
            maxLength: 40,
            label: { en: 'Room ID', it: 'ID della camera' },
            help: {
              en: 'The room’s ID at Kross Booking; 0 for the search of every room.',
              it: 'L’ID della camera su Kross Booking; 0 per la ricerca su tutte le camere.',
            },
            default: '0',
          },
          {
            name: 'lang',
            type: 'text',
            maxLength: 2,
            label: { en: 'Language', it: 'Lingua' },
            help: {
              en: 'Two letters, e.g. en or it. Empty: the language of the page, so each translation gets its own.',
              it: 'Due lettere, es. it o en. Vuoto: la lingua della pagina, così ogni traduzione ha la sua.',
            },
          },
          {
            name: 'url',
            type: 'text',
            maxLength: 500,
            label: {
              en: 'Booking page address (optional)',
              it: 'Indirizzo della pagina di prenotazione (facoltativo)',
            },
            help: {
              en: 'Where the widget sends visitors, e.g. https://example.com/book or /book. Empty: Kross Booking’s own page.',
              it: 'Dove il widget porta i visitatori, es. https://example.com/prenota o /prenota. Vuoto: la pagina di Kross Booking.',
            },
          },
        ],
        load: (_attrs, context) => loadConfig(ctx, context.siteId),
        render({ attrs, data, context }) {
          const config = data ?? configOf(null);
          if (context.preview) {
            // In an editor's preview (Fresco's canvas) the widget's script does not run.
            const t = context.locale.toLowerCase().startsWith('it') ? TEXTS.it : TEXTS.en;
            const { room, lang } = widgetAttrs(attrs, context.locale);
            return (
              <div className="kross-booking-placeholder" style={PLACEHOLDER_STYLE}>
                <strong>{t.title(room)}</strong>
                <div>{t.lang(lang)}</div>
                <div style={{ color: isConfigured(config) ? '#64748b' : '#b45309' }}>
                  {isConfigured(config) ? t.note : t.missing}
                </div>
              </div>
            );
          }
          return <div {...containerAttributes(attrs, context.locale, config)} />;
        },
      }),
    );

    // The loader, only on pages with the widget.
    ctx.assets.enqueue({
      file: 'kross-booking.js',
      when: ({ html }) => html.includes('kross-container'),
    });

    // `[kross-booking id="…" lang="…" url="…"]` of WordPress pages, on import (plugin API 1.36).
    ctx.hooks.filter(
      'import.shortcode',
      (blocks, { tag, attrs }) =>
        blocks ?? (tag === 'kross-booking' ? [blockFromShortcode(attrs)] : null),
    );

    ctx.routes.api({
      method: 'GET',
      path: '/config',
      capability: 'manage_settings',
      async handler(request) {
        return { body: await loadConfig(ctx, request.siteId) };
      },
    });

    ctx.routes.api({
      method: 'PUT',
      path: '/config',
      capability: 'manage_settings',
      async handler(request) {
        const { config, errors } = validateConfig(request.body);
        if (!config) {
          return { status: 400, body: { message: Object.values(errors).join(' '), errors } };
        }
        // The version stays unless it was changed by hand.
        await saveConfig(ctx, request.siteId, config);
        return { body: config };
      },
    });

    // "Refresh the widget": a new cache version, so browsers load its files again.
    ctx.routes.api({
      method: 'POST',
      path: '/refresh',
      capability: 'manage_settings',
      async handler(request) {
        const current = await loadConfig(ctx, request.siteId);
        const config = { ...current, version: newVersion(current.version) };
        await saveConfig(ctx, request.siteId, config);
        return { body: config };
      },
    });

    // For the block editor: whether the widget can be shown yet.
    ctx.routes.api({
      method: 'GET',
      path: '/status',
      capability: 'edit_entries',
      async handler(request) {
        return { body: { configured: isConfigured(await loadConfig(ctx, request.siteId)) } };
      },
    });
  },
});
