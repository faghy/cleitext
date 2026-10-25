/**
 * The language switcher on the server (Multilingual 1.6.0): the block (for
 * the block editor, Fresco and Prisma's containers), the switcher themes
 * place with `<LanguageSwitcher>`, the menus, the bottom of the page,
 * `[language_switcher]` and the conversion of WPML's and Polylang's
 * switchers on import, and the settings.
 */
import { defineBlock, type PluginContext, type RouteResponse } from '@cleitext/plugin-sdk';
import { BLOCK_TYPE, blockFromShortcode, blockFromWordPress, replaceShortcodes } from './convert';
import { withSwitcher } from './menus';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  resolveLook,
  type SwitcherAttrs,
  type SwitcherSettings,
} from './options';
import { SwitcherView } from './view';

export const SETTINGS_KEY = 'switcher';

export async function switcherSettings(
  ctx: PluginContext,
  siteId: string,
): Promise<SwitcherSettings> {
  return normalizeSettings(await ctx.storage.get(siteId, SETTINGS_KEY));
}

const SITE_DEFAULT = {
  value: 'site',
  label: { en: 'As in the settings', it: 'Come nelle impostazioni' },
};

export function registerSwitcher(ctx: PluginContext): void {
  ctx.assets.enqueue({ file: 'switcher.css', when: ({ html }) => html.includes('ml-switcher') });
  ctx.assets.enqueue({
    file: 'switcher.js',
    when: ({ html }) => html.includes('ml-switcher__dropdown'),
  });

  ctx.blocks.register(
    defineBlock<SwitcherAttrs, SwitcherSettings>({
      type: BLOCK_TYPE,
      title: { en: 'Language switcher', it: 'Selettore di lingua' },
      description: {
        en: 'Links to this page in the other languages of the site.',
        it: 'Collegamenti a questa pagina nelle altre lingue del sito.',
      },
      icon: 'translation',
      category: 'widgets',
      // Rendered inside the page: themes' `<LanguageSwitcher>` gives it their place and hint.
      wrapper: false,
      attributes: [
        {
          name: 'style',
          type: 'select',
          label: { en: 'Layout', it: 'Aspetto' },
          options: [
            SITE_DEFAULT,
            { value: 'dropdown', label: { en: 'Dropdown', it: 'Menu a tendina' } },
            { value: 'inline', label: { en: 'Side by side', it: 'Affiancate' } },
            { value: 'list', label: { en: 'One under the other', it: 'Una sotto l’altra' } },
          ],
          default: 'site',
        },
        {
          name: 'names',
          type: 'select',
          label: { en: 'Language names', it: 'Nomi delle lingue' },
          options: [
            SITE_DEFAULT,
            {
              value: 'native',
              label: { en: 'In their own language (Deutsch)', it: 'Nella loro lingua (Deutsch)' },
            },
            {
              value: 'translated',
              label: {
                en: 'In the page’s language (German)',
                it: 'Nella lingua della pagina (Tedesco)',
              },
            },
            { value: 'code', label: { en: 'Codes (DE)', it: 'Codici (DE)' } },
          ],
          default: 'site',
        },
        {
          name: 'flags',
          type: 'select',
          label: { en: 'Flags', it: 'Bandiere' },
          options: [
            SITE_DEFAULT,
            { value: 'yes', label: { en: 'Show', it: 'Mostra' } },
            { value: 'no', label: { en: 'Hide', it: 'Nascondi' } },
          ],
          default: 'site',
        },
        {
          name: 'showCurrent',
          type: 'select',
          label: { en: 'The page’s language', it: 'La lingua della pagina' },
          options: [
            SITE_DEFAULT,
            { value: 'yes', label: { en: 'Listed', it: 'Elencata' } },
            { value: 'no', label: { en: 'Left out', it: 'Omessa' } },
          ],
          default: 'site',
        },
        {
          name: 'untranslated',
          type: 'select',
          label: { en: 'Languages without a translation', it: 'Lingue senza traduzione' },
          options: [
            SITE_DEFAULT,
            {
              value: 'home',
              label: { en: 'Link to their home page', it: 'Collegate alla loro home' },
            },
            { value: 'hide', label: { en: 'Hidden', it: 'Nascoste' } },
          ],
          default: 'site',
        },
        {
          name: 'align',
          type: 'select',
          label: { en: 'Alignment', it: 'Allineamento' },
          options: [
            { value: 'left', label: { en: 'Left', it: 'A sinistra' } },
            { value: 'center', label: { en: 'Centre', it: 'Al centro' } },
            { value: 'right', label: { en: 'Right', it: 'A destra' } },
          ],
          default: 'left',
        },
      ],
      load: (_attrs, context) => switcherSettings(ctx, context.siteId),
      render({ attrs, data, context }) {
        const settings = data ?? DEFAULT_SETTINGS;
        const placement = typeof attrs.placement === 'string' ? attrs.placement : '';
        const look = resolveLook(settings, attrs);
        const locales = context.page.locales ?? [];
        if (locales.length < 2 && context.preview) {
          return (
            <p className="ml-switcher-placeholder">
              {context.locale.startsWith('it')
                ? 'Selettore di lingua: compare quando il sito ha più lingue.'
                : 'Language switcher: it shows when the site has more than one language.'}
            </p>
          );
        }
        const align = attrs.align === 'center' || attrs.align === 'right' ? attrs.align : '';
        return (
          <SwitcherView
            locales={locales}
            look={look}
            pageLocale={context.locale}
            placement={placement || 'block'}
            {...(typeof attrs.className === 'string' ? { className: attrs.className } : {})}
            extra={[
              align && `ml-switcher--align-${align}`,
              placement === 'floating' && `ml-switcher--side-${settings.floatingSide}`,
            ]
              .filter(Boolean)
              .join(' ')}
          />
        );
      },
    }),
  );

  // Menus: the languages as items, in the chosen location or for each switcher link.
  ctx.hooks.filter('render.menus', async (menus, context) => {
    if (context.locales.length < 2 && !hasLink(menus)) return menus;
    return withSwitcher(
      menus,
      context.locales,
      await switcherSettings(ctx, context.siteId),
      context.locale,
    );
  });

  // At the bottom of every page, or floating in a corner (off by default).
  ctx.hooks.filter('render.locations', async (locations, context) => {
    if (context.editorFrame) return locations;
    const settings = await switcherSettings(ctx, context.siteId);
    if (settings.footer === 'off') return locations;
    const overlay = locations.overlay ?? { schema: 1 as const, blocks: [] };
    return {
      ...locations,
      overlay: {
        ...overlay,
        blocks: [
          ...overlay.blocks,
          {
            id: 'ml-language-switcher-auto',
            type: BLOCK_TYPE,
            v: 1,
            attrs: { placement: settings.footer === 'floating' ? 'floating' : 'footer-auto' },
          },
        ],
      },
    };
  });

  // `[language_switcher]` alone in a paragraph.
  ctx.hooks.filter('render.blocks', (blocks) => replaceShortcodes(blocks));

  // WordPress imports: WPML's and Polylang's switchers.
  ctx.hooks.filter('import.shortcode', (blocks, { tag, attrs }) => {
    if (blocks) return blocks;
    const found = blockFromShortcode(tag, attrs);
    return found ? [found] : null;
  });
  ctx.hooks.filter('import.block', (blocks, { name, attrs }) => {
    if (blocks) return blocks;
    const found = blockFromWordPress(name, attrs);
    return found ? [found] : null;
  });

  // Settings (Languages → Language switcher).
  ctx.routes.api({
    method: 'GET',
    path: '/switcher',
    capability: 'manage_settings',
    handler: async (request): Promise<RouteResponse> => ({
      body: await switcherSettings(ctx, request.siteId),
    }),
  });
  ctx.routes.api({
    method: 'PUT',
    path: '/switcher',
    capability: 'manage_settings',
    handler: async (request): Promise<RouteResponse> => {
      const current = await switcherSettings(ctx, request.siteId);
      const body = (request.body ?? {}) as Record<string, unknown>;
      const settings = normalizeSettings({ ...current, ...body });
      await ctx.storage.set(request.siteId, SETTINGS_KEY, settings);
      await ctx.cache.invalidate(request.siteId, ['site']);
      return { body: settings };
    },
  });
}

/** Whether a menu has a switcher link (shown as nothing on sites with one language). */
function hasLink(menus: Record<string, { url: string; children: unknown[] }[]>): boolean {
  const walk = (items: { url: string; children: unknown[] }[]): boolean =>
    items.some(
      (i) =>
        /^#(language-switcher|pll_switcher)/.test(i.url) ||
        walk(i.children as { url: string; children: unknown[] }[]),
    );
  return Object.values(menus).some(walk);
}
