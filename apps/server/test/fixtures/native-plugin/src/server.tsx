import { defineBlock, definePlugin, inlineToHtml, type CxdInline } from '@cleitext/plugin-sdk';

interface Attrs {
  heading?: CxdInline[];
  padding?: { desktop?: number; mobile?: number };
}

/** A container block edited by its own editor entry (`schema: 'json'`). */
export default definePlugin({
  setup(ctx) {
    // WordPress blocks of an old block library become Boxes on import (plugin API 1.23).
    ctx.hooks.filter('import.block', (blocks, { name, attrs, children }) => {
      if (blocks || name !== 'legacy/box') return blocks;
      return [
        {
          id: `imported-${Math.random().toString(36).slice(2, 10)}`,
          type: 'native/box',
          v: 1,
          attrs: {
            heading: [{ text: String(attrs.title ?? '') }],
            padding: { desktop: Number(attrs.space ?? 0) },
          },
          children,
        },
      ];
    });
    // The tests import transfer documents through it.
    ctx.routes.api({
      method: 'POST',
      path: '/import',
      capability: 'edit_entries',
      async handler(request) {
        return {
          body: await ctx.transfer.importDocument(request.siteId, request.body, {
            userId: request.user!.id,
          }),
        };
      },
    });
    ctx.blocks.register(
      defineBlock<Attrs>({
        type: 'native/box',
        title: 'Box',
        schema: 'json',
        container: true,
        richAttributes: ['heading'],
        css: ({ attrs, block }) =>
          `.nb-${block.id}{padding:${Number(attrs.padding?.desktop ?? 0)}px}`,
        render: ({ attrs, block, children }) => (
          <section className={`nb-box nb-${block.id}`}>
            <h2 dangerouslySetInnerHTML={{ __html: inlineToHtml(attrs.heading ?? []) }} />
            {children}
          </section>
        ),
      }),
    );
  },
});
