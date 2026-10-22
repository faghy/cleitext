/**
 * Fresco on the server: every element is a plugin block (containers hold
 * their children), its CSS is generated from its settings, and the site's
 * kit (global colors and fonts) is added to pages that use Fresco.
 */
import { definePlugin, type PluginBlockDefinition, type PluginContext } from '@cleitext/plugin-sdk';
import { elementCss, withDefaults } from './core/css.js';
import { pageCss } from './core/page-css.js';
import { pageGoogleFonts, usedGoogleFonts } from './core/fonts.js';
import { setIconData, type IconData } from './core/icons.js';
import {
  googleFontsUrl,
  kitCss,
  mergeKit,
  normalizeKit,
  pageLayout,
  safeSelector,
  type Kit,
} from './core/kit.js';
import { normalizePreferences } from './editor/prefs-model.js';
import type { ElementDefinition, FrescoNode, RenderContext } from './core/model.js';
import { aiEditor } from './ai.js';
import { installApi } from './api.js';
import { isVisible, resetExtensions, resolveSettings } from './core/extensions.js';
import { listElements } from './core/registry.js';
import { registerFreeElements } from './elements/index.js';
import { frescoEntries, registerTools } from './tools.js';
import icons from './public/icons.json';

const KIT_KEY = 'kit';
const KIT_TAG = 'fresco:kit';

/** Kits by site, kept for a minute (and dropped when saved). */
const kits = new Map<string, { kit: Kit; at: number }>();

/**
 * Fresco's own context: the kit is in its storage. Elements of Fresco Pro
 * are built with Pro's context (`blockFor`), whose storage is Pro's: read
 * there, the kit was missing and the defaults (cached for every element of
 * the site) replaced the site's colors, fonts and widths.
 */
let kitContext: PluginContext | null = null;

async function kitFor(ctx: PluginContext, siteId: string): Promise<Kit> {
  const hit = kits.get(siteId);
  if (hit && Date.now() - hit.at < 60_000) return hit.kit;
  const kit = normalizeKit(await (kitContext ?? ctx).storage.get(siteId, KIT_KEY));
  kits.set(siteId, { kit, at: Date.now() });
  return kit;
}

/** The plugin block of an element. */
function blockFor(
  ctx: PluginContext,
  definition: ElementDefinition,
): PluginBlockDefinition<
  Record<string, unknown>,
  { kit: Kit; attrs: Record<string, unknown>; data?: unknown }
> {
  const contextOf = (context: {
    locale: string;
    media: RenderContext['media'];
    menus: NonNullable<RenderContext['menus']>;
    page: NonNullable<RenderContext['page']>;
  }): RenderContext => ({
    media: context.media,
    menus: context.menus,
    page: context.page,
    locale: context.locale,
    editing: false,
    site: { title: '', tagline: '', home: '/' },
  });
  return {
    type: definition.type,
    title: definition.title,
    category: 'design',
    container: definition.container === true,
    wrapper: false,
    ...(definition.html ? { html: definition.html } : {}),
    // The kit (breakpoints) is needed by the CSS; it is cached per site.
    // Also the settings computed from data (dynamic tags of Fresco Pro).
    load: async (attrs, context) => {
      context.tag(KIT_TAG);
      const [kit, resolved] = await Promise.all([
        kitFor(ctx, context.siteId),
        resolveSettings(attrs, {
          siteId: context.siteId,
          locale: context.locale,
          page: context.page,
          ...(context.entry ? { entry: context.entry } : {}),
          tag: context.tag,
        }),
      ]);
      const data = definition.load
        ? await definition.load(withDefaults(definition, resolved), {
            ...context,
            breakpoints: kit.breakpoints,
          })
        : undefined;
      return { kit, attrs: resolved, ...(data !== undefined ? { data } : {}) };
    },
    media: (attrs) => definition.media?.(withDefaults(definition, attrs)) ?? [],
    css: ({ block, context }) =>
      elementCss(
        definition,
        block as FrescoNode,
        (kits.get(context.siteId)?.kit ?? normalizeKit(null)).breakpoints,
      ),
    render: ({ attrs: stored, data, block, children, items, context }) => {
      const attrs = data?.attrs ?? stored;
      // Display conditions (Fresco Pro) may hide the element on this page.
      if (
        !isVisible(
          { ...(block as FrescoNode), attrs },
          withDefaults(definition, attrs),
          contextOf(context),
        )
      ) {
        return null;
      }
      return definition.render({
        node: { ...(block as FrescoNode), attrs },
        settings: withDefaults(definition, attrs),
        children,
        ...(items ? { items } : {}),
        context: contextOf(context),
        ...(data?.data !== undefined ? { data: data.data } : {}),
      });
    },
  };
}

export default definePlugin({
  setup(ctx) {
    kitContext = ctx;
    kits.clear();
    setIconData(icons as unknown as IconData);
    // Plugins load again after installs and updates: extensions start empty.
    resetExtensions();
    registerFreeElements();
    // Fresco Pro (loaded after Fresco) builds and registers its elements with this.
    installApi({
      blockFor: (pluginCtx: PluginContext, definition: ElementDefinition) =>
        blockFor(pluginCtx, definition),
    });
    for (const definition of listElements()) {
      if (definition.type.startsWith('fresco/')) ctx.blocks.register(blockFor(ctx, definition));
    }

    // Cleitext's AI assistants write Fresco pages as Fresco pages (plugin API 1.40).
    ctx.ai?.registerEditor(aiEditor((siteId) => kitFor(ctx, siteId)));

    ctx.access.defineCapability('manage_fresco', {
      label: {
        en: 'Manage Fresco site settings',
        it: 'Gestire le impostazioni del sito di Fresco',
      },
      roles: ['administrator'],
    });

    // Styles of the elements, and the script of those that need one.
    ctx.assets.enqueue({ file: 'fresco.css', when: ({ html }) => html.includes('class="fr-e ') });
    ctx.assets.enqueue({
      file: 'frontend.js',
      // Also for the lightbox of image links (Site settings → Lightbox).
      when: ({ html }) =>
        /data-fr-(anim|video|lightbox|handler)/.test(html) || html.includes('--fr-lb-images:1'),
    });

    // Canvas pages: the theme's header and footer give way to nothing.
    ctx.hooks.filter('render.locations', async (locations, context) => {
      const editor = context.entry?.document.editor;
      if (editor?.id !== 'fresco') return locations;
      // The page's own layout, else the site's default (Site settings → Layout).
      const data = (editor.data ?? {}) as Record<string, unknown>;
      const layout =
        data.layout === 'canvas' ? 'canvas' : pageLayout(data, await kitFor(ctx, context.siteId));
      if (layout !== 'canvas') return locations;
      const empty = { schema: 1 as const, blocks: [] };
      return { ...locations, header: empty, footer: empty };
    });

    // The toolbar of the public site says "Edit with Fresco" on Fresco pages (plugin API 1.29).
    ctx.hooks.filter('render.adminBarEdit', (link, { locale, entry }) =>
      link && entry.editor === 'fresco'
        ? {
            ...link,
            label: locale.toLowerCase().startsWith('it')
              ? 'Modifica con Fresco'
              : 'Edit with Fresco',
          }
        : link,
    );

    // Page settings of Fresco pages: layout, hidden title, page background and padding.
    ctx.hooks.filter('render.html', async (html, context) => {
      const editor = context.entry?.document.editor;
      if (editor?.id !== 'fresco') return html;
      const kit = await kitFor(ctx, context.siteId);
      // The site's default layout, for pages that keep it.
      const layout = pageLayout(editor.data ?? {}, kit);
      const data =
        layout === (editor.data?.layout ?? '') ? editor.data : { ...editor.data, layout };
      if (!data) return html;
      const css = pageCss(data, {
        titleSelector: safeSelector(kit.titleSelector),
        breakpoints: kit.breakpoints,
      });
      if (!css) return html;
      const at = html.indexOf('</head>');
      return at === -1
        ? html
        : `${html.slice(0, at)}<style id="fr-page">${css}</style>${html.slice(at)}`;
    });

    // The kit: CSS variables of the global colors and fonts, on pages using Fresco.
    ctx.hooks.filter('render.html', async (html, context) => {
      if (!html.includes('class="fr-e ')) return html;
      context.tag(KIT_TAG);
      const kit = await kitFor(ctx, context.siteId);
      const css = kitCss(kit);
      // Google fonts: the kit's, and those this page's elements use (they name
      // them in `data-fr-fonts`); the theme's own fonts stay its business.
      const fonts = googleFontsUrl(
        kit,
        [...new Set([...pageGoogleFonts(html), ...usedGoogleFonts(css)])].slice(0, 20),
      );
      const head =
        (fonts
          ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${fonts.replace(/&/g, '&amp;')}">`
          : '') +
        `<style id="fr-kit">${css}</style>` +
        // The color of the browser's bar on phones (Site settings → Background).
        (kit.theme.background?.mobileColor
          ? `<meta name="theme-color" content="${kit.theme.background.mobileColor}">`
          : '') +
        // Animated elements wait hidden for their turn; without scripts they just show.
        (html.includes('data-fr-anim=')
          ? "<script>document.documentElement.classList.add('fr-js')</script>"
          : '');
      // Before the page's own settings (`#fr-page`), which win over the site's.
      const page = html.indexOf('<style id="fr-page">');
      const at = page !== -1 ? page : html.indexOf('</head>');
      return at === -1 ? html : html.slice(0, at) + head + html.slice(at);
    });

    // The entries made with Fresco, for the overview page of the admin.
    ctx.routes.api({
      method: 'GET',
      path: '/pages',
      capability: 'edit_entries',
      async handler(request) {
        const entries = await frescoEntries(ctx, request.siteId);
        return {
          body: entries
            .filter((entry) => entry.type === 'page' || entry.type === 'article')
            .map((entry) => ({
              id: entry.id,
              title: entry.title,
              type: entry.type,
              status: entry.status,
              locale: entry.locale,
              url: entry.url,
            })),
        };
      },
    });

    // The public address of an entry, for "View page" in the editor.
    ctx.routes.api({
      method: 'GET',
      path: '/entry-link',
      capability: 'edit_entries',
      async handler(request) {
        const id = request.query.id ?? '';
        const entry = /^[\w-]{1,64}$/.test(id) ? await ctx.content.get(request.siteId, id) : null;
        if (!entry) return { status: 404, body: { error: 'not_found' } };
        return { body: { url: entry.url, status: entry.status } };
      },
    });

    // Tools and System info of Fresco's menu. Regenerating the CSS reads the
    // kit again and empties the cached pages that use Fresco.
    registerTools(ctx, {
      async regenerate(siteId) {
        kits.delete(siteId);
        await ctx.cache.invalidate(siteId, [KIT_TAG]);
      },
    });

    // Imports (plugin API 1.28): site settings converted from another builder join the kit.
    ctx.hooks.filter('import.pluginData', async (result, { siteId, slug, data }) => {
      if (slug !== 'fresco') return result;
      const kit = (data as { kit?: unknown } | null)?.kit;
      const warnings = [...(result?.warnings ?? [])];
      if (kit && typeof kit === 'object') {
        const merged = mergeKit(normalizeKit(await ctx.storage.get(siteId, KIT_KEY)), kit);
        await ctx.storage.set(siteId, KIT_KEY, merged);
        kits.delete(siteId);
        await ctx.cache.invalidate(siteId, [KIT_TAG]);
        warnings.push(
          'Fresco site settings (global colors and fonts, layout, theme style) were updated from the imported site.',
        );
      }
      return { warnings };
    });

    // The editor's preferences of each user (User preferences).
    ctx.routes.api({
      method: 'GET',
      path: '/preferences',
      capability: 'edit_entries',
      async handler(request) {
        if (!request.user) return { status: 401, body: { message: 'Sign in first.' } };
        return {
          body: normalizePreferences(
            await ctx.storage.get(request.siteId, `prefs:${request.user.id}`),
          ),
        };
      },
    });
    ctx.routes.api({
      method: 'PUT',
      path: '/preferences',
      capability: 'edit_entries',
      async handler(request) {
        if (!request.user) return { status: 401, body: { message: 'Sign in first.' } };
        const prefs = normalizePreferences(request.body);
        await ctx.storage.set(request.siteId, `prefs:${request.user.id}`, prefs);
        return { body: prefs };
      },
    });

    // Site settings, read by the editor and saved from it.
    ctx.routes.api({
      method: 'GET',
      path: '/kit',
      capability: 'edit_entries',
      async handler(request) {
        return { body: await kitFor(ctx, request.siteId) };
      },
    });
    ctx.routes.api({
      method: 'PUT',
      path: '/kit',
      capability: 'manage_fresco',
      async handler(request) {
        const kit = normalizeKit(request.body);
        await ctx.storage.set(request.siteId, KIT_KEY, kit);
        kits.delete(request.siteId);
        await ctx.cache.invalidate(request.siteId, [KIT_TAG]);
        return { body: kit };
      },
    });
  },
});
