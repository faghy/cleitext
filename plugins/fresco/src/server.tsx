/**
 * Fresco on the server: every element is a plugin block (containers hold
 * their children), its CSS is generated from its settings, and the site's
 * kit (global colors and fonts) is added to pages that use Fresco.
 */
import { definePlugin, type PluginBlockDefinition, type PluginContext } from '@cleitext/plugin-sdk';
import { elementCss, safeColor, withDefaults } from './core/css.js';
import { setIconData, type IconData } from './core/icons.js';
import { googleFontsUrl, kitCss, normalizeKit, safeSelector, type Kit } from './core/kit.js';
import type { ElementDefinition, FrescoNode, RenderContext } from './core/model.js';
import { installApi } from './api.js';
import { isVisible, resolveSettings } from './core/extensions.js';
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
): PluginBlockDefinition<Record<string, unknown>, { kit: Kit; attrs: Record<string, unknown> }> {
  const contextOf = (context: {
    locale: string;
    media: RenderContext['media'];
    menus: NonNullable<RenderContext['menus']>;
  }): RenderContext => ({
    media: context.media,
    menus: context.menus,
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
          ...(context.entry ? { entry: context.entry } : {}),
          tag: context.tag,
        }),
      ]);
      return { kit, attrs: resolved };
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
      });
    },
  };
}

export default definePlugin({
  setup(ctx) {
    setIconData(icons as unknown as IconData);
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

    // Page settings of Fresco pages: hidden title, page background.
    ctx.hooks.filter('render.html', async (html, context) => {
      const editor = context.entry?.document.editor;
      if (editor?.id !== 'fresco' || !editor.data) return html;
      const data = editor.data;
      const rules: string[] = [];
      if (data.hideTitle === true) {
        const kit = await kitFor(ctx, context.siteId);
        const selector = safeSelector(kit.titleSelector);
        // Never Fresco's own headings.
        const scoped = selector
          ?.split(',')
          .map((part) => `${part.trim()}:not(.fr-heading__title)`)
          .join(',');
        if (scoped) rules.push(`${scoped}{display:none!important}`);
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
