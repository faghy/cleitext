/**
 * Fresco on the server: every element is a plugin block (containers hold
 * their children), its CSS is generated from its settings, and the site's
 * kit (global colors and fonts) is added to pages that use Fresco.
 */
import { definePlugin, type PluginBlockDefinition, type PluginContext } from '@cleitext/plugin-sdk';
import { elementCss, safeColor, withDefaults } from './core/css.js';
import { setIconData, type IconData } from './core/icons.js';
import {
  googleFontsUrl,
  kitCss,
  mergeKit,
  normalizeKit,
  safeSelector,
  type Kit,
} from './core/kit.js';
import type { ElementDefinition, FrescoNode, RenderContext } from './core/model.js';
import { installApi } from './api.js';
import { isVisible, resetExtensions, resolveSettings } from './core/extensions.js';
import { listElements } from './core/registry.js';
import { registerFreeElements } from './elements/index.js';
import icons from './public/icons.json';

const KIT_KEY = 'kit';
const KIT_TAG = 'fresco:kit';

/** Kits by site, kept for a minute (and dropped when saved). */
const kits = new Map<string, { kit: Kit; at: number }>();

async function kitFor(ctx: PluginContext, siteId: string): Promise<Kit> {
  const hit = kits.get(siteId);
  if (hit && Date.now() - hit.at < 60_000) return hit.kit;
  const kit = normalizeKit(await ctx.storage.get(siteId, KIT_KEY));
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
      when: ({ html }) => /data-fr-(anim|video|lightbox|handler)/.test(html),
    });

    // Canvas pages: the theme's header and footer give way to nothing.
    ctx.hooks.filter('render.locations', (locations, context) => {
      const editor = context.entry?.document.editor;
      if (
        editor?.id !== 'fresco' ||
        (editor.data as Record<string, unknown> | undefined)?.layout !== 'canvas'
      ) {
        return locations;
      }
      const empty = { schema: 1 as const, blocks: [] };
      return { ...locations, header: empty, footer: empty };
    });

    // Page settings of Fresco pages: layout, hidden title, page background.
    ctx.hooks.filter('render.html', async (html, context) => {
      const editor = context.entry?.document.editor;
      if (editor?.id !== 'fresco' || !editor.data) return html;
      const data = editor.data;
      const rules: string[] = [];
      if (data.hideTitle === true) {
        const kit = await kitFor(ctx, context.siteId);
        const selector = safeSelector(kit.titleSelector);
        // Never headings of Fresco's elements.
        const scoped = selector
          ?.split(',')
          .map((part) => `${part.trim()}:not(.fr-e *)`)
          .join(',');
        if (scoped) rules.push(`${scoped}{display:none!important}`);
      }
      if (data.layout === 'full' || data.layout === 'canvas') {
        // Top-level containers break out of the theme's content column.
        rules.push(
          '.fr-container:not(.fr-container .fr-container):not(.cx-location .fr-container){width:100vw;max-width:100vw;margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw)}html,body{overflow-x:clip}',
        );
      }
      const background = safeColor(data.background);
      if (background) rules.push(`body{background-color:${background}}`);
      if (rules.length === 0) return html;
      const at = html.indexOf('</head>');
      return at === -1
        ? html
        : `${html.slice(0, at)}<style id="fr-page">${rules.join('')}</style>${html.slice(at)}`;
    });

    // The kit: CSS variables of the global colors and fonts, on pages using Fresco.
    ctx.hooks.filter('render.html', async (html, context) => {
      if (!html.includes('class="fr-e ')) return html;
      context.tag(KIT_TAG);
      const kit = await kitFor(ctx, context.siteId);
      const fonts = googleFontsUrl(kit);
      const head =
        (fonts
          ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${fonts.replace(/&/g, '&amp;')}">`
          : '') +
        `<style id="fr-kit">${kitCss(kit)}</style>` +
        // Animated elements wait hidden for their turn; without scripts they just show.
        (html.includes('data-fr-anim=')
          ? "<script>document.documentElement.classList.add('fr-js')</script>"
          : '');
      const at = html.indexOf('</head>');
      return at === -1 ? html : html.slice(0, at) + head + html.slice(at);
    });

    // Site settings, read by the editor and saved from it.
    // The entries made with Fresco, for the overview page of the admin.
    ctx.routes.api({
      method: 'GET',
      path: '/pages',
      capability: 'edit_entries',
      async handler(request) {
        const found = [];
        for (const type of ['page', 'article']) {
          const entries = await ctx.content
            .find(request.siteId, { type, status: 'any', limit: 200, withDocument: true })
            .catch(() => []);
          for (const entry of entries) {
            if (entry.document?.editor?.id !== 'fresco') continue;
            found.push({
              id: entry.id,
              title: entry.title,
              type: entry.type,
              status: entry.status,
              locale: entry.locale,
              url: entry.url,
            });
          }
        }
        return { body: found };
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
