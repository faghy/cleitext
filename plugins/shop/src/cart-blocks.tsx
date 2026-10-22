import { defineBlock, type PluginContext } from '@cleitext/plugin-sdk';
import { EMBED_JS, EMBED_JS_PATH } from './cart-api';
import { translator } from './strings';

/**
 * The cart and the checkout as blocks, for pages made with the block editor
 * or a page builder: the same markup as Cleishop's own cart and checkout
 * pages. Pages are cached and carts belong to each visitor, so the block
 * holds a link to the page and its script fills it from `/cart/data` or
 * `/checkout/data` (see `EMBED_JS`).
 */

const EMBED_CSS = `.shop-embed{min-height:3rem}.shop-embed[aria-busy]{opacity:.6;transition:opacity .2s}
.shop-embed--preview{padding:1.5rem;border:1px dashed rgba(127,127,127,.5);border-radius:8px;text-align:center}`;

/** The language prefix of the page, from its home address (`/it`). */
const prefixOf = (home: string) => home.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '');

export function registerCartBlocks(ctx: PluginContext): void {
  const embed = (
    kind: 'cart' | 'checkout',
    title: { en: string; it: string },
    description: { en: string; it: string },
    texts: { link: string; preview: string },
  ) =>
    defineBlock<Record<string, never>, { prefix: string }>({
      type: `shop/${kind}`,
      title,
      description,
      icon: 'cart',
      attributes: [],
      load: async (_attrs, context) => ({ prefix: prefixOf(context.page.site.home) }),
      css: () => EMBED_CSS,
      render({ data, context }) {
        const t = translator(context.locale);
        if (context.preview)
          return (
            <div className="shop-embed shop-embed--preview">
              <p>{t(texts.preview)}</p>
            </div>
          );
        return (
          <>
            <div
              className="shop-embed"
              data-shop-embed={`${data.prefix}/${kind}/data`}
              data-shop-kind={kind}
              aria-live="polite"
            >
              <p>
                <a href={`${data.prefix}/${kind}`}>{t(texts.link)}</a>
              </p>
            </div>
            <script src={EMBED_JS_PATH} defer />
          </>
        );
      },
    });

  ctx.blocks.register(
    embed(
      'cart',
      { en: 'Cart', it: 'Carrello' },
      {
        en: 'The visitor’s cart, as on the cart page: quantities, coupons, totals.',
        it: 'Il carrello del visitatore, come nella pagina del carrello: quantità, coupon, totali.',
      },
      { link: 'Go to the cart', preview: 'The visitor’s cart appears here.' },
    ),
  );
  ctx.blocks.register(
    embed(
      'checkout',
      { en: 'Checkout', it: 'Cassa' },
      {
        en: 'The checkout form for the visitor’s cart, as on the checkout page.',
        it: 'Il modulo della cassa per il carrello del visitatore, come nella pagina della cassa.',
      },
      { link: 'Go to the checkout', preview: 'The checkout for the visitor’s cart appears here.' },
    ),
  );

  ctx.routes.public({
    method: 'GET',
    path: EMBED_JS_PATH,
    handler: () => ({
      body: EMBED_JS,
      contentType: 'text/javascript; charset=utf-8',
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    }),
  });
}
