import type { PluginContext } from '@cleitext/plugin-sdk';
import { z } from 'zod';
import { parseMoney } from './pricing';

/**
 * Cleishop for Cleitext's AI assistants (plugin API 1.40; `ctx.ai` is
 * missing on older cores): what of a product the core tools write, and a
 * tool for the prices and stock of a simple product.
 */

export const AI_CONTEXT = `Products are entries of the type \`product\` (address /product/<slug>): create
and change them with create_entry and update_entry like pages, with \`"type": "product"\`.

- \`title\`: the product name; the body (\`content\`): the long description, shown under the
  pictures and the buy box, which the shop adds by itself (never write prices, "add to cart"
  buttons or stock in the text); \`excerpt\`: the short description; \`featured_media_id\`: the main
  picture. Product pages are drafts until the user publishes them.
- **Prices and stock** are not entry fields: set them with shop_set_prices (simple products only),
  in the shop's currency, as the shop's settings enter them. Prices are shared by every language
  version of a product.
- Categories, brands, the gallery, SKU, attributes, variations, shipping and taxes are set by people
  in Shop → Products: say so when the user asks for them.
- To show products on a page, use the block \`shop/products\` (attributes \`show\`: "latest",
  "featured", "sale", "popular" or "rated"; \`category\` and \`brand\`: slugs; \`heading\`).`;

const money = z.union([z.number().min(0).max(1e10), z.string().max(20), z.null()]);

/** What shop_set_prices accepts: at least one change. */
const pricesSchema = z
  .object({
    id: z.uuid(),
    regular_price: money.optional(),
    sale_price: money.optional(),
    stock: z.number().int().min(0).max(1_000_000_000).optional(),
    stock_status: z.enum(['instock', 'outofstock', 'onbackorder']).optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 1, 'Give at least one change.');

interface ProductData {
  title: string;
  kind: 'simple' | 'variable';
  regularPrice: string | null;
  salePrice: string | null;
  manageStock: boolean;
  stock: number | null;
  stockStatus: string;
}

/** An error whose message the assistant gets. */
function exposed(message: string): Error {
  return Object.assign(new Error(message), { expose: true });
}

export function registerAi(ctx: PluginContext): void {
  ctx.ai?.addContext({ title: 'Products (Cleishop)', markdown: AI_CONTEXT });

  ctx.ai?.registerTool({
    name: 'set_prices',
    title: 'Set the price and stock of a product',
    description:
      'Sets the regular price, the sale price (null removes it), the quantity in stock or the stock status of a simple product. Only the given values change.',
    scope: 'write',
    capability: 'manage_shop',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The product (entry) id.' },
        regular_price: {
          type: ['number', 'string', 'null'],
          description: 'The price, e.g. 19.9 or "19.90".',
        },
        sale_price: {
          type: ['number', 'string', 'null'],
          description: 'The discounted price, lower than the regular one; null removes it.',
        },
        stock: {
          type: 'integer',
          minimum: 0,
          description: 'Items in stock: the shop then counts them and says when it runs out.',
        },
        stock_status: {
          type: 'string',
          enum: ['instock', 'outofstock', 'onbackorder'],
          description: 'For products whose stock is not counted.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    async run(args, { api }) {
      const parsed = pricesSchema.safeParse(args);
      if (!parsed.success) {
        throw exposed(
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        );
      }
      const input = parsed.data;
      let regular: string | null | undefined;
      let sale: string | null | undefined;
      try {
        regular = input.regular_price === undefined ? undefined : parseMoney(input.regular_price);
        sale = input.sale_price === undefined ? undefined : parseMoney(input.sale_price);
      } catch (error) {
        throw exposed((error as Error).message);
      }

      const path = `/ext/shop/products/${input.id}`;
      const current = await api('GET', path);
      if (current.status === 404) throw exposed('No product with this id.');
      if (current.status !== 200) throw exposed('The product could not be read.');
      const product = current.data as ProductData;
      if (product.kind === 'variable') {
        throw exposed(
          'This product has variations, each with its own price and stock: they are set in Shop → Products.',
        );
      }
      if (input.stock_status !== undefined && input.stock === undefined && product.manageStock) {
        throw exposed(
          'The shop counts the stock of this product, and its status follows it: give `stock` instead.',
        );
      }
      const regularAfter = regular === undefined ? product.regularPrice : regular;
      const saleAfter = sale === undefined ? product.salePrice : sale;
      if (
        saleAfter !== null &&
        (regularAfter === null || Number(saleAfter) >= Number(regularAfter))
      ) {
        throw exposed('The sale price must be lower than the regular price.');
      }

      const changes = {
        ...(regular !== undefined ? { regularPrice: regular } : {}),
        ...(sale !== undefined ? { salePrice: sale } : {}),
        ...(input.stock !== undefined ? { stock: input.stock } : {}),
        ...(input.stock_status !== undefined ? { stockStatus: input.stock_status } : {}),
      };
      const saved = await api('PATCH', `${path}/quick`, changes);
      if (saved.status !== 204) throw exposed('The prices could not be saved.');

      const after = (await api('GET', path)).data as ProductData;
      return {
        id: input.id,
        title: after.title,
        regular_price: after.regularPrice,
        sale_price: after.salePrice,
        stock: after.manageStock ? after.stock : null,
        stock_status: after.stockStatus,
      };
    },
  });
}
