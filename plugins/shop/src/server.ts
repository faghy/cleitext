import { definePlugin, type PluginContext, type RouteRequest } from '@cleitext/plugin-sdk';
import { conversions } from './conversions';
import { z } from 'zod';
import { registerAi } from './ai';
import { EXAMPLE_RULES, pricingRulesSchema, quickEditSchema, type PricingRules } from './catalog';
import { exportProducts, matchProducts } from './export';
import { listProducts, listQuerySchema } from './list';
import {
  attributeSchema,
  getProduct,
  InputError,
  listAttributes,
  quickEdit,
  saveAttribute,
  saveProduct,
  saveProductSchema,
} from './products';
import { attributes, type OrderStatus } from './schema';
import { backfill, BRAND, CATEGORY, PRODUCT, syncProduct, watchEntries } from './sync';
import { eq } from 'drizzle-orm';
import { orderDetail } from './order-admin';
import { orderMail, registerOrderRoutes } from './orders-routes';
import { productTags, registerBuyBox } from './buy-box';
import { registerPublicApi } from './public-api';
import { registerStorefront, type StoreSettings } from './storefront';
import { COUNTRIES } from './address';
import { registerAccount } from './account';
import { registerCatalog } from './catalog-routes';
import { registerWooImport } from './import-woocommerce';
import { registerReviews } from './reviews';
import { registerPrivacy } from './privacy';
import { groupTranslations } from './translations';
import { emailsForStatus } from './emails';
import { onlinePayments } from './online-payments';
import { registerStorefrontBlocks } from './storefront-blocks';
import { registerCartBlocks } from './cart-blocks';
import { loadPayments } from './rules-routes';
import { registerRulesRoutes, TAXES_STORAGE, taxSettingsSchema } from './rules-routes';

/**
 * Shop (official plugin): products are entries of type `product`, with
 * categories and brands as taxonomies; their commercial data lives in the
 * plugin's tables. Admin pages under Shop; the API is `/api/v1/ext/shop/…`.
 */

declare module '@cleitext/plugin-sdk' {
  interface Actions {
    /** An order was placed at the checkout. */
    'shop.order.created': { orderId: string; number: number };
  }
}

/** Storage key: the products translated before 1.1 were grouped. */
const GROUPED = 'translations-grouped';
const CAPABILITY = 'manage_shop';

const PRICING = 'pricing';

/** Errors as problem details (RFC 9457), as the admin reads them. */
const fail = (status: number, message: string, errors: unknown[] = []) => ({
  status,
  body: {
    title: status === 404 ? 'Not Found' : 'Bad Request',
    status,
    detail: message,
    ...(errors.length > 0 ? { errors } : {}),
  },
});

/** Validation errors as the admin shows them. */
function invalid(error: z.ZodError) {
  return fail(
    400,
    'Some values are not valid.',
    error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  );
}

async function guard<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof InputError) return fail(400, error.message, error.errors);
    if (error instanceof z.ZodError) return invalid(error);
    throw error;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default definePlugin({
  setup(ctx: PluginContext) {
    ctx.content.registerType({
      slug: PRODUCT,
      name: { en: 'Products', it: 'Prodotti' },
      permalink: '/product/{slug}',
    });
    ctx.content.registerTaxonomy({
      slug: CATEGORY,
      name: { en: 'Product categories', it: 'Categorie prodotto' },
      hierarchical: true,
      types: [PRODUCT],
      fields: [{ name: 'image', type: 'media', label: { en: 'Image', it: 'Immagine' } }],
    });
    ctx.content.registerTaxonomy({
      slug: BRAND,
      name: { en: 'Brands', it: 'Marchi' },
      types: [PRODUCT],
      fields: [
        { name: 'logo', type: 'media', label: { en: 'Logo', it: 'Logo' } },
        { name: 'website', type: 'url', label: { en: 'Website', it: 'Sito web' } },
      ],
    });
    ctx.access.defineCapability(CAPABILITY, {
      label: { en: 'Manage the shop', it: 'Gestire il negozio' },
      roles: ['administrator', 'editor'],
    });
    ctx.settings.define(
      [
        {
          name: 'currency',
          type: 'select',
          label: { en: 'Currency', it: 'Valuta' },
          options: [
            'EUR',
            'USD',
            'GBP',
            'CHF',
            'JPY',
            'CAD',
            'AUD',
            'SEK',
            'NOK',
            'DKK',
            'PLN',
            'CZK',
          ].map((code) => ({ value: code, label: code })),
          default: 'EUR',
        },
        {
          name: 'baseCountry',
          type: 'select',
          label: { en: 'Shop country', it: 'Paese del negozio' },
          help: {
            en: 'Taxes are worked out for it until the customer gives an address.',
            it: 'Le tasse si calcolano per questo paese finché il cliente non dà un indirizzo.',
          },
          options: COUNTRIES.map((code) => ({ value: code, label: code })),
          default: 'IT',
        },
        {
          name: 'pricesIncludeTax',
          type: 'boolean',
          label: {
            en: 'Prices are entered with taxes',
            it: 'I prezzi si inseriscono con le tasse',
          },
          default: true,
        },
        {
          name: 'weightUnit',
          type: 'select',
          label: { en: 'Weight unit', it: 'Unità di peso' },
          options: ['kg', 'g', 'lb', 'oz'].map((u) => ({ value: u, label: u })),
          default: 'kg',
        },
        {
          name: 'dimensionUnit',
          type: 'select',
          label: { en: 'Dimension unit', it: 'Unità delle dimensioni' },
          options: ['cm', 'mm', 'm', 'in'].map((u) => ({ value: u, label: u })),
          default: 'cm',
        },
        {
          name: 'lowStock',
          type: 'number',
          label: { en: 'Low stock below', it: 'Scorta bassa sotto' },
          default: 2,
          min: 0,
        },
        {
          name: 'wizard',
          type: 'boolean',
          label: {
            en: 'New products step by step',
            it: 'Nuovi prodotti passo per passo',
          },
          help: {
            en: 'The product form as a wizard (category and brand, description, prices and stock, images…) instead of one page.',
            it: 'La scheda prodotto come procedura guidata (categoria e marchio, descrizione, prezzi e magazzino, immagini…) invece che in una sola pagina.',
          },
          default: false,
        },
        {
          name: 'notifyEmail',
          type: 'text',
          label: { en: 'Emails for new orders', it: 'Email per i nuovi ordini' },
          help: {
            en: 'Where the shop’s emails go (new, cancelled and failed orders); several separated by commas. Empty: none.',
            it: 'Dove arrivano le email del negozio (ordini nuovi, annullati e non riusciti); più indirizzi separati da virgole. Vuoto: nessuna.',
          },
          maxLength: 500,
        },
        {
          name: 'phoneRequired',
          type: 'boolean',
          label: {
            en: 'Phone number required at checkout',
            it: 'Telefono obbligatorio alla cassa',
          },
          default: true,
        },
        {
          name: 'reviewsEnabled',
          type: 'boolean',
          label: { en: 'Product reviews', it: 'Recensioni dei prodotti' },
          help: {
            en: 'Customers rate products from 1 to 5 stars and write a review; you approve them in Cleishop → Reviews.',
            it: 'I clienti valutano i prodotti da 1 a 5 stelle e scrivono una recensione; le approvi in Cleishop → Recensioni.',
          },
          default: true,
        },
        {
          name: 'reviewsVerifiedOnly',
          type: 'boolean',
          label: {
            en: 'Reviews only from customers who bought the product',
            it: 'Recensioni solo da chi ha acquistato il prodotto',
          },
          default: false,
        },
        {
          name: 'reviewsRatingRequired',
          type: 'boolean',
          label: { en: 'The star rating is required', it: 'Il voto in stelle è obbligatorio' },
          default: true,
        },
        {
          name: 'termsUrl',
          type: 'url',
          label: { en: 'Terms and conditions page', it: 'Pagina dei termini e condizioni' },
          help: {
            en: 'Its address: customers accept it before ordering. Empty: no checkbox.',
            it: 'Il suo indirizzo: i clienti li accettano prima di ordinare. Vuoto: nessuna casella.',
          },
        },
      ],
      { title: { en: 'Cleishop', it: 'Cleishop' }, capability: CAPABILITY },
    );

    watchEntries(ctx);

    // Stripe and PayPal: emails go out once the provider confirms the payment.
    const online = onlinePayments(ctx, {
      payments: (siteId) => loadPayments(ctx, siteId),
      siteName: async (siteId) => (await ctx.site(siteId)).name,
      paid: async (siteId, origin, orderId, from) => {
        const detail = await ctx.db.transaction(siteId, (tx) => orderDetail(tx, orderId));
        if (!detail) return;
        await mail.send(siteId, origin, 'new_order', detail);
        for (const email of emailsForStatus(from, detail.order.status))
          await mail.send(siteId, origin, email, detail);
        await ctx.hooks.emit(
          'shop.order.status',
          { orderId, number: detail.order.number, from, to: detail.order.status },
          { siteId },
        );
        await conversions(ctx).changed(siteId, orderId, from as OrderStatus, detail.order.status);
      },
    });
    online.register();
    online.registerAdmin(CAPABILITY);
    const taxSettings = async (siteId: string) =>
      taxSettingsSchema.parse((await ctx.storage.get(siteId, TAXES_STORAGE)) ?? {});
    const store = async (siteId: string): Promise<StoreSettings> => {
      const values = await ctx.settings.get(siteId);
      const str = (name: string) =>
        typeof values[name] === 'string' ? (values[name] as string) : '';
      return {
        currency: str('currency') || 'EUR',
        pricesIncludeTax: values.pricesIncludeTax !== false,
        phoneRequired: values.phoneRequired !== false,
        termsUrl: str('termsUrl'),
        baseCountry: str('baseCountry') || 'IT',
        taxesEnabled: (await taxSettings(siteId)).enabled,
        payments: await loadPayments(ctx, siteId),
        ready: await online.ready(siteId),
      };
    };
    const storeWithNotify = async (siteId: string) => {
      const values = await ctx.settings.get(siteId);
      const notifyEmails = String(values.notifyEmail ?? '')
        .split(/[,;\s]+/)
        .map((e) => e.trim())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      return { ...(await store(siteId)), notifyEmails };
    };
    const mail = orderMail(ctx, storeWithNotify);
    registerStorefront(
      ctx,
      store,
      async (siteId, orderId, origin) => {
        const detail = await ctx.db.transaction(siteId, (tx) => orderDetail(tx, orderId));
        // Online payments: nothing is sent before the provider confirms.
        if (!detail || detail.order.status === 'pending') return;
        await mail.send(siteId, origin, 'new_order', detail);
        await mail.send(
          siteId,
          origin,
          detail.order.status === 'processing' ? 'customer_processing' : 'customer_on_hold',
          detail,
        );
      },
      online,
    );
    registerOrderRoutes(ctx, CAPABILITY, storeWithNotify, online);
    registerRulesRoutes(ctx, CAPABILITY);
    registerBuyBox(ctx, async (siteId) => {
      const values = await ctx.settings.get(siteId);
      return { currency: String(values.currency ?? 'EUR'), lowStock: Number(values.lowStock ?? 2) };
    });
    const currency = async (siteId: string) => ({
      currency: String((await ctx.settings.get(siteId)).currency ?? 'EUR'),
    });
    registerCatalog(ctx, currency);
    // WooCommerce products from the WordPress importer.
    registerWooImport(ctx);
    registerAccount(ctx, store);
    registerStorefrontBlocks(ctx, currency, async (siteId) => {
      const values = await ctx.settings.get(siteId);
      return { currency: String(values.currency ?? 'EUR'), lowStock: Number(values.lowStock ?? 2) };
    });
    // The cart and the checkout as blocks, for page builders.
    registerCartBlocks(ctx);
    registerPrivacy(ctx);
    // Products' data for other plugins (page builders' product widgets and tags).
    registerPublicApi(ctx, async (siteId) => {
      const values = await ctx.settings.get(siteId);
      return {
        currency: String(values.currency ?? 'EUR'),
        lowStock: Number(values.lowStock ?? 2),
        weightUnit: String(values.weightUnit ?? 'kg'),
        dimensionUnit: String(values.dimensionUnit ?? 'cm'),
      };
    });
    // Once per site: products translated before the shop kept groups share their data.
    ctx.schedule.every('group-translations', 5, async (siteId) => {
      if (await ctx.storage.get(siteId, GROUPED)) return;
      const entries = await ctx.content.find(siteId, { type: PRODUCT, status: 'any', limit: 200 });
      await groupTranslations(
        ctx,
        siteId,
        entries.map((e) => e.id),
      );
      await ctx.storage.set(siteId, GROUPED, true);
    });
    registerAi(ctx);
    registerReviews(ctx, async (siteId) => {
      const values = await ctx.settings.get(siteId);
      return {
        enabled: values.reviewsEnabled !== false,
        verifiedOnly: values.reviewsVerifiedOnly === true,
        ratingRequired: values.reviewsRatingRequired !== false,
      };
    });
    // Product pages: the path to them, the pictures beside the buy box, the
    // description, reviews and related products.
    ctx.hooks.filter('render.blocks', (blocks, context) => {
      if (context.entry.type !== PRODUCT) return blocks;
      const block = (type: string) => ({
        id: `shop-${type}`,
        type: `shop/${type}`,
        v: 1,
        attrs: {},
      });
      // Pictures and buy box first, as shops do; then the description.
      return [
        block('breadcrumbs'),
        block('summary'),
        ...blocks,
        block('reviews'),
        block('related'),
      ];
    });
    /** Product pages show prices and stock: they refresh when those change. */
    const refresh = (siteId: string, ids: string[]) =>
      ctx.cache.invalidate(siteId, productTags(ids));

    const api = (
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: string,
      handler: (request: RouteRequest) => Promise<{ status?: number; body?: unknown }>,
    ) => ctx.routes.api({ method, path, capability: CAPABILITY, handler });

    const settings = async (siteId: string) => {
      const values = await ctx.settings.get(siteId);
      return {
        currency: String(values.currency ?? 'EUR'),
        pricesIncludeTax: values.pricesIncludeTax !== false,
        weightUnit: String(values.weightUnit ?? 'kg'),
        dimensionUnit: String(values.dimensionUnit ?? 'cm'),
        lowStock: Number(values.lowStock ?? 2),
        wizard: values.wizard === true,
      };
    };
    const pricing = async (siteId: string): Promise<PricingRules> => {
      const stored = pricingRulesSchema.safeParse(await ctx.storage.get(siteId, PRICING));
      return stored.success
        ? stored.data
        : { ...EXAMPLE_RULES, surcharge: 0, tiers: [], discount: 0 };
    };

    /** What every admin page needs: settings, categories, brands, attributes. */
    api('GET', '/setup', async (request) => {
      const site = request.siteId;
      const [values, rules, categories, brands, shared] = await Promise.all([
        settings(site),
        pricing(site),
        ctx.terms.find(site, { taxonomy: CATEGORY, limit: 500 }),
        ctx.terms.find(site, { taxonomy: BRAND, limit: 500 }),
        ctx.db.transaction(site, (tx) => listAttributes(tx)),
      ]);
      return { body: { settings: values, pricing: rules, categories, brands, attributes: shared } };
    });

    api('GET', '/products', async (request) => {
      const query = listQuerySchema.safeParse(request.query);
      if (!query.success) return invalid(query.error);
      const site = request.siteId;
      const locale = query.data.locale;
      const [categories, brands, values] = await Promise.all([
        ctx.terms.find(site, { taxonomy: CATEGORY, limit: 500, ...(locale ? { locale } : {}) }),
        ctx.terms.find(site, { taxonomy: BRAND, limit: 500, ...(locale ? { locale } : {}) }),
        settings(site),
      ]);
      const list = await ctx.db.transaction(site, (tx) =>
        listProducts(tx, query.data, { categories, brands, lowStock: values.lowStock }),
      );
      return { body: list };
    });

    /** The products matching the list's filters, as CSV. */
    ctx.routes.api({
      method: 'GET',
      path: '/export.csv',
      capability: CAPABILITY,
      handler: async (request) => {
        const query = listQuerySchema.safeParse(request.query);
        if (!query.success) return invalid(query.error);
        const site = request.siteId;
        const locale = query.data.locale;
        const [categories, brands, values] = await Promise.all([
          ctx.terms.find(site, { taxonomy: CATEGORY, limit: 500, ...(locale ? { locale } : {}) }),
          ctx.terms.find(site, { taxonomy: BRAND, limit: 500, ...(locale ? { locale } : {}) }),
          settings(site),
        ]);
        const csv = await ctx.db.transaction(site, (tx) =>
          exportProducts(tx, query.data, { categories, brands, lowStock: values.lowStock }),
        );
        return {
          body: `\uFEFF${csv}`,
          contentType: 'text/csv; charset=utf-8',
          headers: { 'content-disposition': 'attachment; filename="products.csv"' },
        };
      },
    });

    /** Which rows of an import are products already in the shop (by id or code). */
    api('POST', '/import/match', async (request) => {
      const input = z
        .object({
          ids: z.array(z.uuid()).max(5000).default([]),
          skus: z.array(z.string().trim().min(1).max(100)).max(5000).default([]),
        })
        .safeParse(request.body ?? {});
      if (!input.success) return invalid(input.error);
      return {
        body: await ctx.db.transaction(request.siteId, (tx) =>
          matchProducts(tx, input.data.ids, input.data.skus),
        ),
      };
    });

    /** Pictures of an import, downloaded from their addresses into the library (in order). */
    api('POST', '/import/images', async (request) => {
      const input = z
        .object({
          urls: z
            .array(z.url({ protocol: /^https?$/ }))
            .min(1)
            .max(20),
        })
        .safeParse(request.body ?? {});
      if (!input.success) return invalid(input.error);
      const images: ({ id: string; url: string } | { error: string; source: string })[] = [];
      for (const url of input.data.urls) {
        try {
          const item = await ctx.media.fromUrl(request.siteId, url, { userId: request.user!.id });
          images.push({ id: item.id, url: item.url });
        } catch (error) {
          images.push({
            source: url,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return { body: { images } };
    });

    api('GET', '/products/:id', async (request) => {
      const id = request.params.id!;
      if (!UUID_RE.test(id)) return fail(404, 'Not found.');
      let product = await ctx.db.transaction(request.siteId, (tx) => getProduct(tx, id));
      if (!product) {
        // A product made before the shop was active: its row is made now.
        const entry = await ctx.content.get(request.siteId, id);
        if (!entry || entry.type !== PRODUCT) return fail(404, 'Not found.');
        await syncProduct(ctx, request.siteId, entry);
        product = await ctx.db.transaction(request.siteId, (tx) => getProduct(tx, id));
      }
      return { body: product };
    });

    api('PUT', '/products/:id', (request) =>
      guard(async () => {
        const id = request.params.id!;
        if (!UUID_RE.test(id)) return fail(404, 'Not found.');
        const input = saveProductSchema.safeParse(request.body ?? {});
        if (!input.success) return invalid(input.error);
        const exists = await ctx.db.transaction(request.siteId, (tx) => getProduct(tx, id));
        if (!exists) {
          const entry = await ctx.content.get(request.siteId, id);
          if (!entry || entry.type !== PRODUCT) return fail(404, 'Not found.');
          await syncProduct(ctx, request.siteId, entry);
        }
        await saveProduct(ctx, request.siteId, id, input.data);
        await refresh(request.siteId, [id]);
        return { body: await ctx.db.transaction(request.siteId, (tx) => getProduct(tx, id)) };
      }),
    );

    api('PATCH', '/products/:id/quick', async (request) => {
      const id = request.params.id!;
      const input = quickEditSchema.safeParse(request.body ?? {});
      if (!input.success) return invalid(input.error);
      const done = UUID_RE.test(id)
        ? await ctx.db.transaction(request.siteId, (tx) => quickEdit(tx, id, input.data))
        : false;
      if (done) await refresh(request.siteId, [id]);
      return done ? { status: 204 } : fail(404, 'Not found.');
    });

    /** Duplicate: a draft copy of the entry (core) with the same commercial data. */
    api('POST', '/products/:id/duplicate', async (request) => {
      const id = request.params.id!;
      if (!UUID_RE.test(id) || !request.user) return fail(404, 'Not found.');
      // The shop copies its data when the core says the entry was copied (entry.copied).
      const copy = await ctx.content.copy(request.siteId, id, { userId: request.user.id });
      return { status: 201, body: { id: copy.id } };
    });

    api('GET', '/pricing', async (request) => ({ body: await pricing(request.siteId) }));
    api('PUT', '/pricing', async (request) => {
      const input = pricingRulesSchema.safeParse(request.body ?? {});
      if (!input.success) return invalid(input.error);
      await ctx.storage.set(request.siteId, PRICING, input.data);
      return { body: input.data };
    });

    api('GET', '/attributes', async (request) => ({
      body: await ctx.db.transaction(request.siteId, (tx) => listAttributes(tx)),
    }));
    api('POST', '/attributes', (request) =>
      guard(async () => {
        const input = attributeSchema.parse(request.body ?? {});
        const id = await ctx.db.transaction(request.siteId, (tx) =>
          saveAttribute(tx, request.siteId, null, input),
        );
        return { status: 201, body: { id } };
      }),
    );
    api('PUT', '/attributes/:id', (request) =>
      guard(async () => {
        const id = request.params.id!;
        if (!UUID_RE.test(id)) return fail(404, 'Not found.');
        const input = attributeSchema.parse(request.body ?? {});
        await ctx.db.transaction(request.siteId, (tx) =>
          saveAttribute(tx, request.siteId, id, input),
        );
        return { body: { id } };
      }),
    );
    api('DELETE', '/attributes/:id', async (request) => {
      const id = request.params.id!;
      if (!UUID_RE.test(id)) return fail(404, 'Not found.');
      await ctx.db.transaction(request.siteId, (tx) =>
        tx.delete(attributes).where(eq(attributes.id, id)),
      );
      return { status: 204 };
    });
  },

  async onActivate(site, ctx) {
    await backfill(ctx, site.id);
  },
});
