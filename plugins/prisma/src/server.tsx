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
import { DEFAULT_GLOBALS, normalizeGlobals, type Globals } from './lib/globals';
import { fromSpectra } from './import';
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

/** The site's defaults, read before the page's blocks are drawn (`load`). */
const siteGlobals = new Map<string, Globals>();

async function loadGlobals(ctx: PluginContext, siteId: string): Promise<Globals> {
  const globals = normalizeGlobals(await ctx.settings.get(siteId));
  siteGlobals.set(siteId, globals);
  return globals;
}

function register(ctx: PluginContext, block: PrismaBlock) {
  return defineBlock<Attrs, Globals>({
    type: `prisma/${block.name}`,
    title: block.title,
    description: block.description,
    category: 'design',
    schema: 'json',
    wrapper: false,
    ...(block.container ? { container: true } : {}),
    ...(block.richAttributes?.length ? { richAttributes: block.richAttributes } : {}),
    ...(block.media ? { media: (attrs: Attrs) => block.media!(withDefaults(block, attrs)) } : {}),
    load: (_attrs, context) => loadGlobals(ctx, context.siteId),
    css: ({ attrs, block: cxd, context }) =>
      blockCss(
        block,
        attrs,
        idOf(attrs, cxd.id),
        siteGlobals.get(context.siteId) ?? DEFAULT_GLOBALS,
      ),
    render: ({ attrs, block: cxd, children, context, data }) => {
      const all = withDefaults(block, attrs);
      return (
        <block.View
          attrs={all}
          id={idOf(attrs, cxd.id)}
          editing={false}
          globals={data ?? DEFAULT_GLOBALS}
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
          root={(tag, props, content, holdsChildren) =>
            createElement(safeTag(tag, 'div'), props, content, holdsChildren ? children : null)
          }
          media={(id) => {
            const found = typeof id === 'string' ? context.media.get(id) : undefined;
            return found ? { url: found.url, width: found.width, height: found.height } : null;
          }}
        />
      );
    },
  });
}

export default definePlugin({
  setup(ctx) {
    ctx.settings.define(
      [
        {
          name: 'contentWidth',
          type: 'number',
          label: { en: 'Content width (px)', it: 'Larghezza del contenuto (px)' },
          help: {
            en: 'Width of the boxed content of full-width containers.',
            it: 'Larghezza del contenuto incorniciato dei container a tutta larghezza.',
          },
          min: 320,
          max: 4000,
          default: DEFAULT_GLOBALS.contentWidth,
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
          name: 'elementsGap',
          type: 'number',
          label: { en: 'Space between elements (px)', it: 'Spazio tra gli elementi (px)' },
          min: 0,
          max: 400,
          default: DEFAULT_GLOBALS.elementsGap,
        },
      ],
      { title: { en: 'Prisma', it: 'Prisma' } },
    );
    for (const block of BLOCKS) ctx.blocks.register(register(ctx, block));
    // Pages built with Spectra, on WordPress import (plugin API 1.23).
    ctx.hooks.filter(
      'import.block',
      (blocks, { name, attrs, html, children }) =>
        blocks ?? (name.startsWith('uagb/') ? fromSpectra(name, attrs, html, children) : null),
    );
    ctx.assets.enqueue({
      file: 'prisma.css',
      when: ({ html }) => html.includes('pr-block-'),
    });
  },
});
