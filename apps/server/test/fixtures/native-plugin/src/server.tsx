import { defineBlock, definePlugin, inlineToHtml, type CxdInline } from '@cleitext/plugin-sdk';

interface Attrs {
  heading?: CxdInline[];
  padding?: { desktop?: number; mobile?: number };
}

/** A container block edited by its own editor entry (`schema: 'json'`). */
export default definePlugin({
  setup(ctx) {
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
