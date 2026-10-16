import { definePlugin, type PluginContext, type RouteRequest } from '@cleitext/plugin-sdk';
import { z } from 'zod';
import { EXAMPLE_RULES, pricingRulesSchema, quickEditSchema, type PricingRules } from './catalog';
import { listProducts, listQuerySchema } from './list';
import {
  attributeSchema,
  copyProduct,
  getProduct,
  InputError,
  listAttributes,
  quickEdit,
  saveAttribute,
  saveProduct,
  saveProductSchema,
} from './products';
import { attributes } from './schema';
import { backfill, BRAND, CATEGORY, PRODUCT, syncProduct, watchEntries } from './sync';
import { eq } from 'drizzle-orm';

/**
 * Shop (official plugin): products are entries of type `product`, with
 * categories and brands as taxonomies; their commercial data lives in the
 * plugin's tables. Admin pages under Shop; the API is `/api/v1/ext/shop/…`.
 */

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
      ],
      { title: { en: 'Shop', it: 'Negozio' }, capability: CAPABILITY },
    );

    watchEntries(ctx);

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
      return done ? { status: 204 } : fail(404, 'Not found.');
    });

    /** Duplicate: a draft copy of the entry (core) with the same commercial data. */
    api('POST', '/products/:id/duplicate', async (request) => {
      const id = request.params.id!;
      if (!UUID_RE.test(id) || !request.user) return fail(404, 'Not found.');
      const copy = await ctx.content.copy(request.siteId, id, { userId: request.user.id });
      await syncProduct(ctx, request.siteId, copy);
      await ctx.db.transaction(request.siteId, (tx) => copyProduct(tx, id, copy.id));
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
