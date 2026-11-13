import { randomBytes } from 'node:crypto';
import {
  defineBlock,
  definePlugin,
  type PluginContext,
  type RouteRequest,
  type RouteResponse,
} from '@cleitext/plugin-sdk';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { escapeHtml, listPage, shareLinks } from './page';
import { strings } from './strings';
import { items, lists } from './store';

/**
 * Wishlist (official plugin, Cleishop add-on): a list per account, or per
 * guest with a cookie, joined to the account at sign-in. The heart buttons
 * are added in the browser (the pages stay cached for everyone); the list
 * page shows Cleishop's own product cards, through its `shop` service.
 */

const COOKIE = 'shop_wishlist_list';
const YEAR = 365 * 24 * 3600;
const MAX_ITEMS = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
export const SCRIPT = 'wishlist.js';

interface ShopService {
  [name: string]: (siteId: string, ...args: never[]) => unknown;
  productCards(
    siteId: string,
    options: { ids: string[]; locale: string; prefix: string },
  ): Promise<{ html: string; css: string; ids: string[] }>;
  productsBy(siteId: string, keys: { skus: string[] }): Promise<{ id: string; sku: string }[]>;
}

type List = typeof lists.$inferSelect;

/** `/it` for an address under /it/, '' for the site's own language. */
const prefixOf = (request: RouteRequest) =>
  request.locale && request.path.startsWith(`/${request.locale}/`) ? `/${request.locale}` : '';

export default definePlugin({
  setup(ctx: PluginContext) {
    ctx.access.defineCapability('manage_wishlist', {
      label: { en: 'Manage the wishlists', it: 'Gestire le liste desideri' },
      roles: ['administrator', 'editor'],
    });
    const tx = <T,>(siteId: string, fn: Parameters<typeof ctx.db.transaction<T>>[1]) =>
      ctx.db.transaction<T>(siteId, fn);
    const newToken = () => randomBytes(24).toString('base64url');

    // The list's cookie is strictly needed for the service asked for: no consent (as the cart's).

    /**
     * The visitor's list (created when `create`): the account's, with a guest
     * list of this browser joined to it; or the guest's, from the cookie.
     */
    async function listOf(
      request: RouteRequest,
      create: boolean,
    ): Promise<{ list: List | null; cookies: NonNullable<RouteResponse['cookies']> }> {
      const siteId = request.siteId;
      const token = request.cookies[COOKIE];
      const cookies: NonNullable<RouteResponse['cookies']> = [];
      const guest =
        token && TOKEN_RE.test(token)
          ? ((
              await tx(siteId, (t) =>
                t
                  .select()
                  .from(lists)
                  .where(and(eq(lists.token, token), sql`${lists.userId} IS NULL`)),
              )
            )[0] ?? null)
          : null;
      const userId = request.user?.id;
      if (!userId) {
        if (guest || !create) return { list: guest, cookies };
        const [made] = await tx(siteId, (t) =>
          t.insert(lists).values({ siteId, token: newToken() }).returning(),
        );
        cookies.push({ name: COOKIE, value: made!.token, maxAge: YEAR });
        return { list: made!, cookies };
      }
      let [mine] = await tx(siteId, (t) => t.select().from(lists).where(eq(lists.userId, userId)));
      if (!mine && (create || guest)) {
        [mine] = await tx(siteId, (t) =>
          t.insert(lists).values({ siteId, userId, token: newToken() }).returning(),
        );
      }
      if (guest && mine) {
        // Signed in: what was saved as a guest joins the account's list.
        await tx(siteId, async (t) => {
          const saved = await t.select().from(items).where(eq(items.listId, guest.id));
          if (saved.length) {
            await t
              .insert(items)
              .values(
                saved.map((i) => ({
                  siteId,
                  listId: mine!.id,
                  productId: i.productId,
                  addedAt: i.addedAt,
                })),
              )
              .onConflictDoNothing();
          }
          await t.delete(items).where(eq(items.listId, guest.id));
          await t.delete(lists).where(eq(lists.id, guest.id));
        });
        cookies.push({ name: COOKIE, value: '', maxAge: 0 });
      }
      return { list: mine ?? null, cookies };
    }

    const idsOf = async (siteId: string, listId: string) =>
      (
        await tx(siteId, (t) =>
          t
            .select({ id: items.productId })
            .from(items)
            .where(eq(items.listId, listId))
            .orderBy(sql`${items.addedAt} DESC`)
            .limit(MAX_ITEMS),
        )
      ).map((r) => r.id);

    // What the heart buttons need: the saved products and their count (never cached).
    ctx.routes.public({
      method: 'GET',
      path: '/wishlist/state',
      handler: async (request) => {
        const { list, cookies } = await listOf(request, false);
        const ids = list ? await idsOf(request.siteId, list.id) : [];
        return {
          body: { count: ids.length, ids },
          headers: { 'cache-control': 'private, no-store' },
          cookies,
        };
      },
    });

    // Adds or removes a product (the heart button, or a form without scripts).
    ctx.routes.public({
      method: 'POST',
      path: '/wishlist/toggle',
      handler: async (request) => {
        const form = (request.body ?? {}) as Record<string, string>;
        const productId = String(form.product ?? '');
        if (!UUID_RE.test(productId)) return { status: 400, body: { error: 'Unknown product.' } };
        const { list, cookies } = await listOf(request, true);
        const siteId = request.siteId;
        const saved = await tx(siteId, async (t) => {
          const [there] = await t
            .select({ id: items.productId })
            .from(items)
            .where(and(eq(items.listId, list!.id), eq(items.productId, productId)));
          if (there) {
            await t
              .delete(items)
              .where(and(eq(items.listId, list!.id), eq(items.productId, productId)));
            return false;
          }
          await t
            .insert(items)
            .values({ siteId, listId: list!.id, productId })
            .onConflictDoNothing();
          await t.update(lists).set({ updatedAt: new Date() }).where(eq(lists.id, list!.id));
          return true;
        });
        const count = (await idsOf(siteId, list!.id)).length;
        if (form.back && form.back.startsWith('/') && !form.back.startsWith('//')) {
          return { status: 303, headers: { location: form.back }, cookies };
        }
        return { body: { saved, count }, cookies };
      },
    });

    async function page(request: RouteRequest, list: List | null, shared: boolean) {
      const t = strings(request.locale);
      const prefix = prefixOf(request);
      const shop = await ctx.services?.use<ShopService>(request.siteId, 'shop');
      const ids = list ? await idsOf(request.siteId, list.id) : [];
      const cards = shop
        ? await shop.productCards(request.siteId, { ids, locale: request.locale, prefix })
        : { html: '', css: '', ids: [] };
      const origin = request.origin ?? '';
      const shareUrl = list ? `${origin}${prefix}/wishlist/shared/${list.token}` : '';
      return {
        page: {
          title: shared ? t('A wishlist') : t('Wishlist'),
          html: listPage({
            t,
            cards: cards.html,
            count: cards.ids.length,
            shared,
            prefix,
            share: !shared && cards.ids.length ? shareLinks(t, shareUrl) : '',
            shop: Boolean(shop),
          }),
          css: cards.css,
        },
      };
    }

    // The visitor's list, with prices, stock, add to cart and remove.
    ctx.routes.public({
      method: 'GET',
      path: '/wishlist',
      handler: async (request) => {
        const { list, cookies } = await listOf(request, false);
        return { ...(await page(request, list, false)), cookies };
      },
    });

    // A shared list, read-only.
    ctx.routes.public({
      method: 'GET',
      path: '/wishlist/shared/:token',
      handler: async (request) => {
        const token = request.params.token ?? '';
        const [list] = TOKEN_RE.test(token)
          ? await tx(request.siteId, (t) => t.select().from(lists).where(eq(lists.token, token)))
          : [];
        if (!list) {
          const t = strings(request.locale);
          return {
            status: 404,
            page: {
              title: t('Wishlist'),
              html: `<p>${escapeHtml(t('This list does not exist.'))}</p>`,
            },
          };
        }
        return page(request, list, true);
      },
    });

    // The script of the heart buttons, on pages with products or a wishlist link.
    ctx.assets.enqueue({
      file: SCRIPT,
      when: ({ html }) => html.includes('data-product=') || html.includes('data-wishlist'),
    });

    // A header link with the count (filled in the browser).
    ctx.blocks.register(
      defineBlock<Record<string, never>, { prefix: string }>({
        type: 'shop-wishlist/link',
        title: { en: 'Wishlist link', it: 'Link alla lista desideri' },
        description: {
          en: 'A link to the wishlist with the number of products saved, e.g. in the header.',
          it: 'Un link alla lista desideri con il numero di prodotti salvati, per esempio nell’header.',
        },
        icon: 'heart',
        attributes: [],
        load: async (_attrs, context) => ({
          prefix: context.page.site.home.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, ''),
        }),
        render: ({ data, context }) => {
          const t = strings(context.locale);
          return (
            <a
              className="shop-wishlist-link"
              href={`${data?.prefix ?? ''}/wishlist`}
              data-wishlist=""
            >
              <span aria-hidden="true">♡</span>{' '}
              <span className="shop-wishlist-link__label">{t('Wishlist')}</span>{' '}
              <span className="shop-wishlist-link__count" data-wishlist-count=""></span>
            </a>
          );
        },
      }),
    );

    // Admin: how many lists and the most wished products; YITH import.
    ctx.routes.api({
      method: 'GET',
      path: '/stats',
      capability: 'manage_wishlist',
      handler: async (request) => {
        const siteId = request.siteId;
        const [listCount] = await tx(siteId, (t) =>
          t.select({ n: sql<number>`count(*)::int` }).from(lists),
        );
        const [itemCount] = await tx(siteId, (t) =>
          t.select({ n: sql<number>`count(*)::int` }).from(items),
        );
        const counts = { lists: listCount?.n ?? 0, saved: itemCount?.n ?? 0 };
        const top = await tx(siteId, (t) =>
          t
            .select({ id: items.productId, n: sql<number>`count(*)::int` })
            .from(items)
            .groupBy(items.productId)
            .orderBy(sql`count(*) DESC`)
            .limit(10),
        );
        const titles = top.length
          ? await ctx.content.find(siteId, { ids: top.map((x) => x.id), status: 'any', limit: 10 })
          : [];
        return {
          body: {
            lists: counts?.lists ?? 0,
            saved: counts?.saved ?? 0,
            top: top.map((x) => ({ ...x, title: titles.find((e) => e.id === x.id)?.title ?? '—' })),
          },
        };
      },
    });

    // YITH WooCommerce Wishlist lists, from the WooCommerce Import export.
    ctx.routes.api({
      method: 'POST',
      path: '/import',
      capability: 'manage_wishlist',
      handler: async (request) => {
        const siteId = request.siteId;
        const body = (request.body ?? {}) as {
          wishlists?: {
            userId?: number;
            token?: string;
            items?: { sku?: string; productId?: number }[];
          }[];
        };
        const shop = await ctx.services?.use<ShopService>(siteId, 'shop');
        const woo = await ctx.services?.use<{
          [name: string]: (siteId: string, ...args: never[]) => unknown;
          customers(siteId: string, ids: string[]): Promise<Record<string, string>>;
        }>(siteId, 'shop-woo-import');
        if (!shop) return { status: 409, body: { error: 'Activate Cleishop first.' } };
        const wishlists = (Array.isArray(body.wishlists) ? body.wishlists : []).slice(0, 500);
        const skus = [
          ...new Set(
            wishlists.flatMap((w) => (w.items ?? []).map((i) => i.sku ?? '')).filter(Boolean),
          ),
        ];
        const bySku = new Map((await shop.productsBy(siteId, { skus })).map((p) => [p.sku, p.id]));
        const users = woo
          ? await woo.customers(
              siteId,
              wishlists.map((w) => String(w.userId ?? '')).filter(Boolean),
            )
          : {};
        let imported = 0;
        let saved = 0;
        let skipped = 0;
        for (const w of wishlists) {
          const userId = users[String(w.userId ?? '')];
          const productIds = (w.items ?? [])
            .map((i) => bySku.get(i.sku ?? ''))
            .filter((id): id is string => Boolean(id));
          if (!userId || !productIds.length) {
            skipped++;
            continue;
          }
          await tx(siteId, async (t) => {
            let [list] = await t.select().from(lists).where(eq(lists.userId, userId));
            if (!list)
              [list] = await t
                .insert(lists)
                .values({ siteId, userId, token: newToken() })
                .returning();
            const before = await t
              .select({ id: items.productId })
              .from(items)
              .where(and(eq(items.listId, list!.id), inArray(items.productId, productIds)));
            await t
              .insert(items)
              .values(productIds.map((productId) => ({ siteId, listId: list!.id, productId })))
              .onConflictDoNothing();
            saved += new Set(productIds).size - before.length;
          });
          imported++;
        }
        return {
          body: { imported, saved, skipped, linked: Boolean(woo) },
        };
      },
    });
  },
});
