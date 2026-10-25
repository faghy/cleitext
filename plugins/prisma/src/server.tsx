import {
  defineBlock,
  definePlugin,
  inlineToHtml,
  type CxdInline,
  type PluginContext,
} from '@cleitext/plugin-sdk';
import { createElement, type ReactNode } from 'react';
import { BLOCKS } from './blocks';
import { blockCss, withDefaults } from './lib/css';
import { DEFAULT_GLOBALS, normalizeGlobals, variablesCss, type Globals } from './lib/globals';
import { FORM_SETTINGS, registerFormRelease, registerFormRoutes } from './blocks/form/route';
import { buildTablesOfContents } from './blocks/table-of-contents/server';
import { fromCover, fromSpectra } from './import';
import { SPECTRA_CLASSES } from './css-classes';
import {
  extensionProps,
  fontItem,
  fontWeights,
  googleCssUrl,
  itemFamily,
  pageFonts,
} from './lib/extensions';
import { familiesToLoad, fontLink } from '@cleitext/design/fonts';
import { databaseFonts, LocalFonts, registerFontRoute } from '@cleitext/design/font-copies';
import { setIconData, type IconData } from './lib/icons';
import icons from './public/icons.json';
import { safeTag } from './lib/tags';
import type { Attrs, PrismaBlock } from './lib/types';

/**
 * Prisma (official plugin, free): design blocks for the block editor, edited
 * with their own settings (plugin API 1.23) and drawn here on the site with
 * the same markup and CSS as in the editor.
 */

/** The block's id in its class: the one the editor gave it, else its CXD id. */
function idOf(attrs: Attrs, fallback: string): string {
  return typeof attrs.blockId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(attrs.blockId)
    ? attrs.blockId
    : fallback;
}

/** `--a:1;--b:2` → React's style object (custom properties kept as they are). */
function styleObject(css: string): Record<string, string> {
  return Object.fromEntries(
    css
      .split(';')
      .filter(Boolean)
      .map((part) => {
        const [name, ...value] = part.split(':');
        return [name!.trim(), value.join(':').trim()];
      }),
  );
}

/** Where the site serves its copies of Google fonts (Settings → Prisma → Google Fonts). */
export const FONTS_ROUTE = '/_prisma/gfonts';
/** Pages waiting for a Google font's copy on the site. */
const FONTS_TAG = 'prisma:fonts';

/** Google Fonts kept on the site, set up with the plugin. */
let localFonts: LocalFonts | null = null;

/** The site's defaults, read before the page's blocks are drawn (`load`). */
const siteGlobals = new Map<string, Globals>();

async function loadGlobals(ctx: PluginContext, siteId: string): Promise<Globals> {
  const globals = normalizeGlobals(await ctx.settings.get(siteId));
  siteGlobals.set(siteId, globals);
  return globals;
}

function register(ctx: PluginContext, block: PrismaBlock) {
  return defineBlock<Attrs, { globals: Globals; data: unknown }>({
    type: `prisma/${block.name}`,
    title: block.title,
    description: block.description,
    category: 'design',
    schema: 'json',
    wrapper: false,
    ...(block.container ? { container: true } : {}),
    ...(block.richAttributes?.length ? { richAttributes: block.richAttributes } : {}),
    ...(block.media ? { media: (attrs: Attrs) => block.media!(withDefaults(block, attrs)) } : {}),
    load: async (attrs, context) => ({
      globals: await loadGlobals(ctx, context.siteId),
      data: block.load ? await block.load(withDefaults(block, attrs), context, ctx) : undefined,
    }),
    css: ({ attrs, block: cxd, context }) =>
      blockCss(
        block,
        attrs,
        idOf(attrs, cxd.id),
        siteGlobals.get(context.siteId) ?? DEFAULT_GLOBALS,
      ),
    render: ({ attrs, block: cxd, children, context, data }) => {
      const all = withDefaults(block, attrs, context.locale);
      return (
        <block.View
          attrs={all}
          id={idOf(attrs, cxd.id)}
          editing={false}
          globals={data?.globals ?? DEFAULT_GLOBALS}
          data={data?.data}
          text={(name, props) =>
            createElement(safeTag(props.tagName, 'div'), {
              ...(props.className ? { className: props.className } : {}),
              dangerouslySetInnerHTML: {
                __html: inlineToHtml(Array.isArray(all[name]) ? (all[name] as CxdInline[]) : []),
              },
            })
          }
          inner={(props): ReactNode =>
            createElement(
              safeTag(props.tagName, 'div'),
              props.className ? { className: props.className } : {},
              children,
            )
          }
          root={(tag, props, content, holdsChildren) => {
            // Visibility by device and entrance animation, on the block's root.
            const extension = extensionProps(all);
            const { style, ...data } = extension.data;
            return createElement(
              safeTag(tag, 'div'),
              {
                ...props,
                className: [props.className, extension.className].filter(Boolean).join(' '),
                ...data,
                ...(style ? { style: styleObject(style) } : {}),
              },
              content,
              holdsChildren ? children : null,
            );
          }}
          media={(id) => {
            const found = typeof id === 'string' ? context.media.get(id) : undefined;
            return found
              ? {
                  url: found.url,
                  width: found.width,
                  height: found.height,
                  variants: found.variants,
                }
              : null;
          }}
        />
      );
    },
  });
}

export default definePlugin({
  setup(ctx) {
    setIconData(icons as unknown as IconData);
    ctx.settings.define(
      [
        {
          name: 'contentWidth',
          type: 'number',
          label: { en: 'Content width (px)', it: 'Larghezza del contenuto (px)' },
          help: {
            en: 'Width of the boxed content of full-width containers. Empty: the theme’s content width (1140 px with themes that do not give one).',
            it: 'Larghezza del contenuto incorniciato dei container a tutta larghezza. Vuoto: quella del contenuto del tema (1140 px con i temi che non la indicano).',
          },
          min: 320,
          max: 4000,
        },
        {
          name: 'containerPadding',
          type: 'number',
          label: { en: 'Container padding (px)', it: 'Padding dei container (px)' },
          min: 0,
          max: 400,
          default: DEFAULT_GLOBALS.containerPadding,
        },
        {
          name: 'cssVariables',
          type: 'text',
          multiline: true,
          maxLength: 4000,
          label: { en: 'Color variables', it: 'Variabili di colore' },
          help: {
            en: 'One per line, e.g. "--ast-global-color-0: #c7a16f": the palette of the former theme of imported pages.',
            it: 'Una per riga, es. "--ast-global-color-0: #c7a16f": la palette del tema precedente delle pagine importate.',
          },
        },
        {
          name: 'elementsGap',
          type: 'number',
          label: { en: 'Space between elements (px)', it: 'Spazio tra gli elementi (px)' },
          min: 0,
          max: 400,
          default: DEFAULT_GLOBALS.elementsGap,
        },
        {
          name: 'googleFonts',
          type: 'select',
          label: { en: 'Google Fonts', it: 'Google Fonts' },
          help: {
            en: 'The fonts chosen in the blocks. Kept on this site, visitors never reach Google (needed in the EU without consent); from Google, their address reaches Google; “Don’t load” when the theme provides them.',
            it: 'I font scelti nei blocchi. Ospitati su questo sito, i visitatori non contattano mai Google (necessario in UE senza consenso); da Google, il loro indirizzo arriva a Google; “Non caricare” quando li fornisce il tema.',
          },
          options: [
            { value: 'local', label: { en: 'Host on this site', it: 'Ospita su questo sito' } },
            { value: 'google', label: { en: 'Load from Google', it: 'Carica da Google' } },
            { value: 'none', label: { en: 'Don’t load', it: 'Non caricare' } },
          ],
          default: DEFAULT_GLOBALS.googleFonts,
        },
        // Where forms send their messages, and the reCAPTCHA keys.
        ...FORM_SETTINGS,
      ],
      { title: { en: 'Prisma', it: 'Prisma' } },
    );
    // Google fonts kept on the site: Prisma's own table, storage and route.
    const fontStore = databaseFonts(ctx);
    localFonts = new LocalFonts({
      http: (request) => ctx.http.send(request),
      store: fontStore,
      log: ctx.log,
      route: FONTS_ROUTE,
      cssUrl: (item) => googleCssUrl([item]),
      label: 'Prisma',
      onReady(siteId) {
        // Again a little later: a page that went without the font may be stored after the first.
        setTimeout(() => void ctx.cache.invalidate(siteId, [FONTS_TAG]).catch(() => {}), 10_000);
        return ctx.cache.invalidate(siteId, [FONTS_TAG]);
      },
    });
    registerFontRoute(ctx, fontStore, FONTS_ROUTE);
    // The editor: how the site loads fonts, and its copies of some (null while not ready).
    ctx.routes.api({
      method: 'GET',
      path: '/fonts/local',
      capability: 'edit_entries',
      async handler(request) {
        const { googleFonts: mode } = await loadGlobals(ctx, request.siteId);
        const weights = fontWeights((request.query.fonts ?? '').split('|').slice(0, 200));
        const out: Record<string, string | null> = {};
        if (mode === 'local' && localFonts) {
          const items = [...weights].slice(0, 40).map(([family, w]) => fontItem(family, w));
          await Promise.all(
            items.map(async (item) => {
              const [sheet] = (await localFonts?.sheets(request.siteId, [item], 1500)) ?? [];
              out[itemFamily(item)] = sheet?.href ?? null;
            }),
          );
        }
        return { body: { mode, fonts: out } };
      },
    });
    for (const block of BLOCKS) ctx.blocks.register(register(ctx, block));
    registerFormRoutes(ctx);
    registerFormRelease(ctx);
    // Pages built with Spectra, on WordPress import (plugin API 1.23).
    ctx.hooks.filter(
      'import.block',
      (blocks, { name, attrs, html, children }) =>
        blocks ??
        (name.startsWith('uagb/')
          ? fromSpectra(name, attrs, html, children)
          : name === 'core/cover'
            ? fromCover(attrs, html, children)
            : null),
    );
    // CSS written for Spectra's class names, on WordPress import (plugin API 1.53).
    ctx.hooks.filter('import.cssClasses', (classes) => ({ ...classes, ...SPECTRA_CLASSES }));
    ctx.assets.enqueue({
      file: 'prisma.css',
      when: ({ html }) => html.includes('pr-block-'),
    });
    // The Google fonts the page's blocks chose, and the color variables.
    ctx.hooks.filter('render.html', async (page, context) => {
      if (!page.includes('pr-block-')) return page;
      // Tables of contents: their lists and the headings' anchors, in the page.
      const html = buildTablesOfContents(page);
      const at = html.indexOf('</head>');
      if (at === -1) return html;
      const globals = siteGlobals.get(context.siteId) ?? (await loadGlobals(ctx, context.siteId));
      const variables = variablesCss(globals);
      // Google fonts the blocks chose, but none the page loads already (the
      // theme's, Fresco's): kept on the site unless the settings say otherwise.
      let fonts = '';
      if (globals.googleFonts !== 'none' && html.includes('data-pr-fonts=')) {
        const weights = pageFonts(html);
        const items = familiesToLoad([...weights.keys()], html).map((family) =>
          fontItem(family, weights.get(family)!),
        );
        if (globals.googleFonts === 'google') {
          const url = googleCssUrl(items);
          if (url) {
            fonts = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${url.replace(/&/g, '&amp;')}">`;
          }
        } else if (items.length && localFonts) {
          context.tag(FONTS_TAG);
          const sheets = await localFonts.sheets(context.siteId, items.slice(0, 30), 2500);
          fonts = sheets.map((sheet) => fontLink(sheet.href, itemFamily(sheet.family))).join('');
        }
      }
      const head = fonts + (variables ? `<style id="pr-variables">${variables}</style>` : '');
      return html.slice(0, at) + head + html.slice(at);
    });
    // Each block's script, only on the pages that show the block.
    for (const block of BLOCKS) {
      const script = block.script;
      if (script)
        ctx.assets.enqueue({ file: script.file, when: ({ html }) => html.includes(script.marker) });
    }
    ctx.assets.enqueue({
      file: 'animations.css',
      when: ({ html }) => html.includes('data-pr-animation'),
    });
    ctx.assets.enqueue({
      file: 'animations.js',
      when: ({ html }) => html.includes('data-pr-animation'),
    });
  },
});
