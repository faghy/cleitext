import { defineBlock, type PluginContext, type RouteRequest } from '@cleitext/plugin-sdk';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { productTag, productTags } from './buy-box';
import { CATALOG_CSS } from './catalog-html';
import { html, raw } from './html';
import { SHOP_CSS } from './pages';
import { orderItems, orders, products } from './schema';
import { translator } from './strings';
import { PRODUCT } from './sync';

/**
 * Product reviews (WooCommerce's): a rating from 1 to 5 and a text, posted
 * as comments of type `review` through the core (moderation, spam checks,
 * notifications), with "verified owner" for customers who bought the
 * product. The product's average and count are kept on its row.
 */

export const REVIEW = 'review';

export interface ReviewSettings {
  enabled: boolean;
  /** Only customers who bought the product may review it. */
  verifiedOnly: boolean;
  ratingRequired: boolean;
}

interface ReviewView {
  id: string;
  author: string;
  rating: number;
  verified: boolean;
  content: string;
  date: string;
}

interface ReviewsData {
  entryId: string;
  action: string;
  reviews: ReviewView[];
  average: number;
  counts: number[];
  settings: ReviewSettings;
  notice: { kind: 'ok' | 'error'; text: string } | null;
}

const ratingOf = (meta: Record<string, unknown>) => {
  const n = Number(meta.rating);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
};

const REVIEW_CSS = `
.shop-reviews{margin:2.5rem 0}
.shop-reviews__summary{display:flex;flex-wrap:wrap;gap:1.5rem 2.5rem;align-items:center;margin:0 0 1.5rem}
.shop-reviews__average{font-size:2.5em;font-weight:800;line-height:1}
.shop-bars{list-style:none;margin:0;padding:0;min-width:14rem}
.shop-bars li{display:grid;grid-template-columns:max-content minmax(6rem,1fr) 2rem;gap:.6rem;align-items:center;font-size:.85em;white-space:nowrap}
.shop-bars span.shop-bar{height:.5rem;border-radius:999px;background:rgba(127,127,127,.2);overflow:hidden}
.shop-bars span.shop-bar i{display:block;height:100%;background:#b54708}
.shop-review{list-style:none;padding:1rem 0;border-top:1px solid rgba(127,127,127,.25)}
.shop-review__meta{display:flex;flex-wrap:wrap;gap:.25rem .75rem;align-items:baseline;font-size:.9em}
.shop-review__meta strong{font-size:1.05em}
.shop-review__verified{font-size:.8em;font-weight:600;color:#067647}
.shop-review p{margin:.5rem 0 0}
.shop-reviews ol{margin:0;padding:0}
.shop-rate{border:0;padding:0;margin:0 0 1rem}
.shop-rate legend{font-weight:600;margin-bottom:.3rem}
.shop-rate__stars{display:inline-flex;flex-direction:row-reverse;gap:.15rem}
.shop-rate__stars input{position:absolute;opacity:0;width:1px;height:1px}
.shop-rate__stars label{font-size:1.8em;line-height:1;cursor:pointer;color:rgba(127,127,127,.45)}
.shop-rate__stars input:checked~label,.shop-rate__stars label:hover,.shop-rate__stars label:hover~label{color:#b54708}
.shop-rate__stars input:focus-visible+label{outline:2px solid currentColor;outline-offset:2px;border-radius:4px}
`;

export function registerReviews(
  ctx: PluginContext,
  settings: (siteId: string) => Promise<ReviewSettings>,
): void {
  /** Whether an email or account bought the product (an order processing or completed). */
  const bought = async (
    siteId: string,
    productId: string,
    who: { userId?: string; email?: string },
  ) => {
    if (!who.userId && !who.email) return false;
    const [row] = await ctx.db.transaction(siteId, (tx) =>
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(orders)
        .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
        .where(
          and(
            eq(orderItems.productId, productId),
            inArray(orders.status, ['processing', 'completed']),
            or(
              who.userId ? eq(orders.customerId, who.userId) : undefined,
              who.email ? eq(orders.email, who.email.trim().toLowerCase()) : undefined,
            ),
          ),
        ),
    );
    return (row?.n ?? 0) > 0;
  };

  /** The product's average rating and count, from its approved reviews. */
  const recount = async (siteId: string, productId: string) => {
    const reviews = await ctx.comments.find(siteId, {
      entryId: productId,
      type: REVIEW,
      limit: 1000,
    });
    const rated = reviews.map((r) => ratingOf(r.meta)).filter((n) => n > 0);
    const average = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : 0;
    await ctx.db.transaction(siteId, (tx) =>
      tx
        .update(products)
        .set({ rating: average.toFixed(2), ratingCount: rated.length })
        .where(eq(products.entryId, productId)),
    );
    await ctx.cache.invalidate(siteId, productTags([productId]));
  };
  const onReview = async (
    { comment }: { comment: { type: string; entryId: string } },
    context: { siteId?: string },
  ) => {
    if (comment.type === REVIEW && context.siteId) await recount(context.siteId, comment.entryId);
  };
  ctx.hooks.on('comment.created', onReview);
  ctx.hooks.on('comment.status', onReview);

  ctx.routes.public({
    method: 'POST',
    path: '/reviews',
    async handler(request: RouteRequest) {
      const t = translator(request.locale);
      const body = (request.body ?? {}) as Record<string, unknown>;
      const text = (name: string, max: number) =>
        typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, max) : '';
      const entryId = text('entry', 64);
      const back = text('back', 500);
      const target = back.startsWith('/') && !back.startsWith('//') ? back.split('?')[0]! : '/';
      const go = (params: Record<string, string>) => ({
        status: 303,
        headers: { location: `${target}?${new URLSearchParams(params)}#reviews` },
      });
      const store = await settings(request.siteId);
      const [product] = /^[0-9a-f-]{36}$/i.test(entryId)
        ? await ctx.db.transaction(request.siteId, (tx) =>
            tx.select().from(products).where(eq(products.entryId, entryId)),
          )
        : [];
      if (!store.enabled || !product || product.status !== 'published')
        return go({ 'review-error': t('Reviews are closed.') });
      const rating = Number(text('rating', 1));
      if (store.ratingRequired && !(rating >= 1 && rating <= 5))
        return go({ 'review-error': t('Choose a rating.') });
      const email = text('email', 200);
      const verified = await bought(request.siteId, entryId, {
        ...(request.user ? { userId: request.user.id } : {}),
        ...(email ? { email } : {}),
      });
      if (store.verifiedOnly && !verified)
        return go({
          'review-error': t('Only customers who bought this product can review it.'),
        });
      try {
        const posted = await ctx.comments.post(request, {
          entryId,
          type: REVIEW,
          content: text('review', 5000),
          meta: { ...(rating >= 1 && rating <= 5 ? { rating } : {}), verified },
          authorName: text('name', 120),
          authorEmail: email,
        });
        return go({ review: posted.status === 'approved' ? 'posted' : 'pending' });
      } catch (error) {
        return go({ 'review-error': (error as Error).message.slice(0, 200) });
      }
    },
  });

  ctx.blocks.register(
    defineBlock<Record<string, never>, ReviewsData | null>({
      type: 'shop/reviews',
      title: { en: 'Product reviews', it: 'Recensioni del prodotto' },
      icon: 'star',
      attributes: [],
      async load(_attrs, context) {
        const id = context.entry?.id;
        if (!id || context.entry?.type !== PRODUCT) return null;
        const store = await settings(context.siteId);
        if (!store.enabled) return null;
        context.tag(productTag(id));
        context.tag(`entry:${id}`);
        const t = translator(context.locale);
        const list = await ctx.comments.find(context.siteId, {
          entryId: id,
          type: REVIEW,
          limit: 200,
        });
        const reviews = list.map((r) => ({
          id: r.id,
          author: r.authorName,
          rating: ratingOf(r.meta),
          verified: r.meta.verified === true,
          content: r.content,
          date: r.createdAt,
        }));
        const rated = reviews.filter((r) => r.rating > 0);
        const params = context.page.params ?? {};
        const notice = params['review-error']
          ? { kind: 'error' as const, text: params['review-error'].slice(0, 200) }
          : params.review === 'posted'
            ? { kind: 'ok' as const, text: t('Thank you for your review.') }
            : params.review === 'pending'
              ? {
                  kind: 'ok' as const,
                  text: t('Thank you: your review will appear once approved.'),
                }
              : null;
        const base = context.page.site.home.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '');
        return {
          entryId: id,
          action: `${base}/reviews`,
          reviews,
          average: rated.length ? rated.reduce((a, r) => a + r.rating, 0) / rated.length : 0,
          counts: [5, 4, 3, 2, 1].map((n) => rated.filter((r) => r.rating === n).length),
          settings: store,
          notice,
        };
      },
      css: () => SHOP_CSS + CATALOG_CSS + REVIEW_CSS,
      render({ data, context }) {
        if (!data) return null;
        const t = translator(context.locale);
        const total = data.counts.reduce((a, b) => a + b, 0);
        const back = context.page.entry?.url.replace(/^https?:\/\/[^/]+/, '') ?? '/';
        const stars = (n: number) =>
          html`<span class="shop-stars" aria-hidden="true"
            >${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span
          >`;
        const markup = html`<section class="shop-page shop-reviews" id="reviews">
          <h2>${t('Reviews ({n})', { n: data.reviews.length })}</h2>
          ${
            data.notice
              ? html`<p
                  class="shop-notice${data.notice.kind === 'error' ? ' shop-notice--error' : ''}"
                  role="${data.notice.kind === 'error' ? 'alert' : 'status'}"
                >
                  ${data.notice.text}
                </p>`
              : ''
          }
          ${
            total > 0
              ? html`<div class="shop-reviews__summary">
                  <div>
                    <div class="shop-reviews__average">${data.average.toFixed(1)}</div>
                    ${stars(Math.round(data.average))}
                    <div class="shop-meta">
                      ${total === 1 ? t('1 rating') : t('{n} ratings', { n: total })}
                    </div>
                  </div>
                  <ul class="shop-bars" aria-label="${t('Ratings by stars')}">
                    ${data.counts.map(
                      (count, i) =>
                        html`<li>
                          <span>${t('{n} stars', { n: 5 - i })}</span>
                          <span class="shop-bar"
                            ><i style="width:${String(Math.round((count / total) * 100))}%"></i
                          ></span>
                          <span>${count}</span>
                        </li>`,
                    )}
                  </ul>
                </div>`
              : html`<p>${t('There are no reviews yet.')}</p>`
          }
          ${
            data.reviews.length
              ? html`<ol>
                  ${data.reviews.map(
                    (r) =>
                      html`<li class="shop-review">
                        <div class="shop-review__meta">
                          ${r.rating ? html`${stars(r.rating)}<span class="shop-sr">${t('Rated {rating} out of 5', { rating: r.rating })}</span>` : ''}
                          <strong>${r.author}</strong>
                          ${r.verified ? html`<span class="shop-review__verified">${t('Verified owner')}</span>` : ''}
                          <time datetime="${r.date}"
                            >${new Date(r.date).toLocaleDateString(context.locale, { dateStyle: 'medium' })}</time
                          >
                        </div>
                        ${r.content.split(/\n{2,}/).map((p) => html`<p>${p}</p>`)}
                      </li>`,
                  )}
                </ol>`
              : ''
          }
          <h3>
            ${data.reviews.length ? t('Add a review') : t('Be the first to review this product')}
          </h3>
          ${data.settings.verifiedOnly ? html`<p class="shop-meta">${t('Only customers who bought this product can review it.')}</p>` : ''}
          <form method="post" action="${data.action}" class="shop-review-form">
            <input type="hidden" name="entry" value="${data.entryId}" />
            <input type="hidden" name="back" value="${back}" />
            <fieldset class="shop-rate">
              <legend>
                ${t('Your rating')}${data.settings.ratingRequired ? raw(' <abbr title="required">*</abbr>') : ''}
              </legend>
              <span class="shop-rate__stars">
                ${[5, 4, 3, 2, 1].map(
                  (n) =>
                    html`<input
                        type="radio"
                        id="shop-rate-${n}"
                        name="rating"
                        value="${n}"
                        ${data.settings.ratingRequired ? raw(' required') : ''}
                      /><label for="shop-rate-${n}" title="${t('{n} stars', { n })}"
                        >★<span class="shop-sr">${t('{n} stars', { n })}</span></label
                      >`,
                )}
              </span>
            </fieldset>
            <p class="shop-field">
              <label for="shop-review-text">${t('Your review')}</label>
              <textarea
                id="shop-review-text"
                name="review"
                rows="5"
                maxlength="5000"
                required
              ></textarea>
            </p>
            <div class="shop-fields">
              <p class="shop-field">
                <label for="shop-review-name">${t('Name')}</label>
                <input id="shop-review-name" name="name" autocomplete="name" maxlength="120" />
              </p>
              <p class="shop-field">
                <label for="shop-review-email">${t('Email')}</label>
                <input
                  id="shop-review-email"
                  name="email"
                  type="email"
                  autocomplete="email"
                  maxlength="200"
                />
              </p>
            </div>
            <p class="shop-meta">
              ${t('Signed in? You can leave name and email empty. Your email is not published.')}
            </p>
            <p><button class="shop-button" type="submit">${t('Submit review')}</button></p>
          </form>
        </section>`;
        return <div dangerouslySetInnerHTML={{ __html: markup.value }} />;
      },
    }),
  );

  /** Shop → Reviews: every review, with its product, for moderation. */
  ctx.routes.api({
    method: 'GET',
    path: '/reviews',
    capability: 'manage_shop',
    async handler(request) {
      const status = ['pending', 'approved', 'spam', 'trash'].includes(request.query.status ?? '')
        ? (request.query.status as 'pending' | 'approved' | 'spam' | 'trash')
        : 'any';
      const list = await ctx.comments.find(request.siteId, {
        type: REVIEW,
        status,
        limit: 200,
        offset: Math.max(0, Number(request.query.offset) || 0),
      });
      const ids = [...new Set(list.map((r) => r.entryId))];
      const titles = ids.length
        ? await ctx.db.transaction(request.siteId, (tx) =>
            tx
              .select({ id: products.entryId, title: products.title })
              .from(products)
              .where(inArray(products.entryId, ids)),
          )
        : [];
      const title = new Map(titles.map((p) => [p.id, p.title]));
      return {
        body: {
          items: list.map((r) => ({
            id: r.id,
            productId: r.entryId,
            product: title.get(r.entryId) ?? '',
            status: r.status,
            author: r.authorName,
            rating: ratingOf(r.meta),
            verified: r.meta.verified === true,
            content: r.content,
            createdAt: r.createdAt,
          })),
        },
      };
    },
  });
}
