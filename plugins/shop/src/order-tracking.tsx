import { defineBlock, type PluginContext, type RouteResponse } from '@cleitext/plugin-sdk';
import { sharedLimiter } from './cart-link';
import { prefixOf } from './catalog-routes';
import { escape } from './html';
import { orderByNumber } from './orders';
import { receivedPage, SHOP_CSS } from './pages';
import { translator, type Translate } from './strings';

/**
 * Order tracking, like WooCommerce's `[woocommerce_order_tracking]` (1.21):
 * `/order-tracking` asks for the order number and the billing email and
 * shows the order's status and lines. Any wrong pair gets the same answer
 * (no way to learn which orders exist), and each visitor has a few tries.
 */

export const TRACKING_PATH = '/order-tracking';

/** Tries one visitor (site and IP address) has: 10 every 10 minutes. */
export const TRACKING_LIMIT = { max: 10, windowMs: 10 * 60_000 };

const NO_STORE = { 'cache-control': 'private, no-store' };

/** The order's number as customers write it: `#1234`, `1234`. */
export function orderNumberOf(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const digits = value.trim().replace(/^#/, '');
  if (!/^\d{1,15}$/.test(digits)) return null;
  const number = Number(digits);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/** The form, for the route's page (the block renders the same fields). */
export function trackingForm(
  t: Translate,
  action: string,
  values: { order: string; email: string } = { order: '', email: '' },
  error = '',
): string {
  return `<form class="shop-tracking" method="post" action="${escape(action)}">
<p>${escape(t('To track your order enter its number and the email address you used at checkout.'))}</p>
${error ? `<p class="shop-notice shop-notice--error" role="alert">${escape(error)}</p>` : ''}
<div class="shop-fields">
<p class="shop-field"><label for="shop-track-order">${escape(t('Order number'))}</label><input id="shop-track-order" name="orderid" type="text" inputmode="numeric" autocomplete="off" required maxlength="20" value="${escape(values.order)}" /></p>
<p class="shop-field"><label for="shop-track-email">${escape(t('Billing email'))}</label><input id="shop-track-email" name="order_email" type="email" autocomplete="email" required maxlength="320" value="${escape(values.email)}" /></p>
</div>
<p><button class="shop-button" type="submit">${escape(t('Track'))}</button></p>
</form>`;
}

const page = (body: string) => `<style>${SHOP_CSS}</style><div class="shop-page">${body}</div>`;

export function registerOrderTracking(ctx: PluginContext): void {
  const allowed = sharedLimiter('order-tracking', TRACKING_LIMIT.max, TRACKING_LIMIT.windowMs);

  ctx.routes.public({
    method: 'GET',
    path: TRACKING_PATH,
    handler: (request): RouteResponse => {
      const t = translator(request.locale);
      return {
        page: {
          title: t('Order tracking'),
          index: false,
          html: page(trackingForm(t, `${prefixOf(request)}${TRACKING_PATH}`)),
        },
      };
    },
  });

  ctx.routes.public({
    method: 'POST',
    path: TRACKING_PATH,
    async handler(request): Promise<RouteResponse> {
      const t = translator(request.locale);
      const action = `${prefixOf(request)}${TRACKING_PATH}`;
      const body = (request.body ?? {}) as Record<string, unknown>;
      const typed = {
        order: typeof body.orderid === 'string' ? body.orderid.trim().slice(0, 20) : '',
        email: typeof body.order_email === 'string' ? body.order_email.trim().slice(0, 320) : '',
      };
      const answer = (error: string, status = 200): RouteResponse => ({
        status,
        headers: NO_STORE,
        page: {
          title: t('Order tracking'),
          index: false,
          html: page(trackingForm(t, action, typed, error)),
        },
      });
      if (!allowed(`${request.siteId}|${request.ip}`))
        return {
          ...answer(t('Too many requests: try again later.'), 429),
          headers: { ...NO_STORE, 'retry-after': '600' },
        };
      const number = orderNumberOf(typed.order);
      const email = typed.email.toLowerCase();
      const found =
        number !== null && email
          ? await ctx.db.transaction(request.siteId, (tx) => orderByNumber(tx, number))
          : null;
      // The same answer for an order that does not exist and for a wrong email.
      if (
        !found ||
        found.order.status === 'draft' ||
        found.order.email.trim().toLowerCase() !== email
      )
        return answer(
          t('Sorry, the order could not be found. Check the number and the email and try again.'),
        );
      return {
        headers: NO_STORE,
        page: {
          title: t('Order tracking'),
          index: false,
          html: receivedPage({
            order: found.order,
            items: found.items,
            t,
            locale: request.locale,
            tracking: { back: action },
            payment: null,
          }),
        },
      };
    },
  });

  // The form as a block, for any page (WooCommerce's shortcode on imported pages).
  ctx.blocks.register(
    defineBlock<Record<string, never>, { action: string }>({
      type: 'shop/order-tracking',
      title: { en: 'Order tracking', it: 'Traccia l’ordine' },
      description: {
        en: 'A form where customers see the status of an order from its number and their email.',
        it: 'Un modulo dove i clienti vedono lo stato di un ordine dal suo numero e dalla loro email.',
      },
      icon: 'cart',
      attributes: [],
      load: async (_attrs, context) => ({
        action: `${context.page.site.home.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '')}${TRACKING_PATH}`,
      }),
      css: () => SHOP_CSS,
      render({ data, context }) {
        const t = translator(context.locale);
        return (
          <div className="shop-page">
            <form className="shop-tracking" method="post" action={data.action}>
              <p>
                {t(
                  'To track your order enter its number and the email address you used at checkout.',
                )}
              </p>
              <div className="shop-fields">
                <p className="shop-field">
                  <label htmlFor="shop-track-order">{t('Order number')}</label>
                  <input
                    id="shop-track-order"
                    name="orderid"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    maxLength={20}
                  />
                </p>
                <p className="shop-field">
                  <label htmlFor="shop-track-email">{t('Billing email')}</label>
                  <input
                    id="shop-track-email"
                    name="order_email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={320}
                  />
                </p>
              </div>
              <p>
                <button className="shop-button" type="submit">
                  {t('Track')}
                </button>
              </p>
            </form>
          </div>
        );
      },
    }),
  );
}
