import { createHash, randomBytes } from 'node:crypto';
import type { PluginTransaction } from '@cleitext/plugin-sdk';
import { and, eq, inArray } from 'drizzle-orm';
import { currentPrice, isOnSale } from './pricing';
import {
  attributes,
  attributeValues,
  carts,
  productAttributes,
  products,
  variations,
  type CartItem,
  type ProductRow,
  type VariationRow,
} from './schema';

/** A visitor's cart: the token in the `shop_cart` cookie, its items, their prices now. */

export const CART_COOKIE = 'shop_cart';
export const CART_DAYS = 30;
const MAX_ITEMS = 100;
const MAX_QUANTITY = 9999;

export const newToken = () => randomBytes(24).toString('base64url');
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function loadCart(
  tx: PluginTransaction,
  token: string | undefined,
): Promise<CartItem[]> {
  if (!token || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return [];
  const [row] = await tx
    .select({ items: carts.items })
    .from(carts)
    .where(eq(carts.tokenHash, tokenHash(token)));
  return row?.items ?? [];
}

export async function saveCart(
  tx: PluginTransaction,
  siteId: string,
  token: string,
  items: CartItem[],
  userId: string | null,
): Promise<void> {
  const values = { items: items.slice(0, MAX_ITEMS), userId, updatedAt: new Date() };
  await tx
    .insert(carts)
    .values({ siteId, tokenHash: tokenHash(token), ...values })
    .onConflictDoUpdate({ target: [carts.siteId, carts.tokenHash], set: values });
}

/** Adds an item, or more of one already there; one only for products sold individually. */
export function addItem(items: CartItem[], item: CartItem, soldIndividually: boolean): CartItem[] {
  const index = items.findIndex(
    (i) => i.product === item.product && i.variation === item.variation,
  );
  if (index < 0)
    return [
      ...items,
      { ...item, quantity: soldIndividually ? 1 : Math.min(item.quantity, MAX_QUANTITY) },
    ];
  return items.map((existing, i) =>
    i === index
      ? {
          ...existing,
          quantity: soldIndividually
            ? 1
            : Math.min(existing.quantity + item.quantity, MAX_QUANTITY),
        }
      : existing,
  );
}

export const itemKey = (item: Pick<CartItem, 'product' | 'variation'>) =>
  `${item.product}:${item.variation ?? ''}`;

export interface CartLine {
  key: string;
  productId: string;
  variationId: string | null;
  quantity: number;
  title: string;
  slug: string;
  locale: string;
  attributes: { name: string; value: string }[];
  sku: string;
  imageUrl: string | null;
  unitPrice: string;
  regularPrice: string;
  onSale: boolean;
  taxStatus: 'taxable' | 'shipping' | 'none';
  taxClass: string;
  manageStock: boolean;
  stock: number | null;
  backorders: 'no' | 'notify' | 'yes';
  soldIndividually: boolean;
  weight: number;
  virtual: boolean;
  purchaseNote: string;
}

/** Why an item cannot be bought as it is; null when it can. */
export type LineProblem = 'gone' | 'stock';

/**
 * The items with what they cost now and whether they can be bought: the
 * product published, a price, enough stock (unless backorders are allowed).
 * Items that cannot be bought at all are dropped (`dropped`); those with too
 * little stock are lowered to what is left (`lowered`).
 */
export async function priceCart(
  tx: PluginTransaction,
  items: CartItem[],
  now = new Date(),
): Promise<{ lines: CartLine[]; items: CartItem[]; dropped: string[]; lowered: string[] }> {
  if (items.length === 0) return { lines: [], items: [], dropped: [], lowered: [] };
  const productRows = await tx
    .select()
    .from(products)
    .where(inArray(products.entryId, [...new Set(items.map((i) => i.product))]));
  const variationIds = items.flatMap((i) => (i.variation ? [i.variation] : []));
  const variationRows = variationIds.length
    ? await tx.select().from(variations).where(inArray(variations.id, variationIds))
    : [];
  const names = await attributeNames(
    tx,
    productRows.map((p) => p.entryId),
  );
  const byProduct = new Map(productRows.map((p) => [p.entryId, p]));
  const byVariation = new Map(variationRows.map((v) => [v.id, v]));

  const lines: CartLine[] = [];
  const kept: CartItem[] = [];
  const dropped: string[] = [];
  const lowered: string[] = [];
  for (const item of items) {
    const product = byProduct.get(item.product);
    const variation = item.variation ? byVariation.get(item.variation) : undefined;
    const line = product ? lineOf(product, variation ?? null, item, names, now) : null;
    if (!line || (item.variation && !variation) || (product?.kind === 'variable' && !variation)) {
      dropped.push(product?.title ?? item.product);
      continue;
    }
    if (line.manageStock && line.backorders === 'no' && line.quantity > (line.stock ?? 0)) {
      if ((line.stock ?? 0) <= 0) {
        dropped.push(line.title);
        continue;
      }
      line.quantity = line.stock!;
      lowered.push(line.title);
    }
    lines.push(line);
    kept.push({ ...item, quantity: line.quantity });
  }
  return { lines, items: kept, dropped, lowered };
}

function lineOf(
  product: ProductRow,
  variation: VariationRow | null,
  item: CartItem,
  names: AttributeNames,
  now: Date,
): CartLine | null {
  if (product.status !== 'published') return null;
  if (variation && (!variation.enabled || variation.productId !== product.entryId)) return null;
  const priced = variation ?? product;
  const unitPrice = currentPrice(priced, now);
  if (unitPrice === null) return null;
  const stockOwner = variation ?? product;
  const quantity = product.soldIndividually
    ? 1
    : Math.max(1, Math.min(item.quantity, MAX_QUANTITY));
  return {
    key: itemKey(item),
    productId: product.entryId,
    variationId: variation?.id ?? null,
    quantity,
    title: product.title,
    slug: product.slug,
    locale: product.locale,
    attributes: variation ? describe(variation.attributes, product.entryId, names) : [],
    sku: variation?.sku || product.sku,
    imageUrl: variation?.imageUrl ?? product.imageUrl,
    unitPrice,
    regularPrice: priced.regularPrice ?? unitPrice,
    onSale: isOnSale(priced, now),
    taxStatus: product.taxStatus,
    taxClass: product.taxClass,
    manageStock: stockOwner.manageStock,
    stock: stockOwner.stock,
    backorders: stockOwner.backorders,
    soldIndividually: product.soldIndividually,
    weight: Number(variation?.weight ?? product.weight ?? 0),
    virtual: product.virtual,
    purchaseNote: product.purchaseNote,
  };
}

/** Names of attributes and values, to show "Colour: Red" for a variation. */
type AttributeNames = Map<string, { name: string; values: Map<string, string> }>;

async function attributeNames(
  tx: PluginTransaction,
  productIds: string[],
): Promise<AttributeNames> {
  const names: AttributeNames = new Map();
  if (productIds.length === 0) return names;
  const own = await tx
    .select()
    .from(productAttributes)
    .where(inArray(productAttributes.productId, productIds));
  const shared = await tx.select().from(attributes);
  const values = shared.length ? await tx.select().from(attributeValues) : [];
  for (const attribute of shared) {
    names.set(attribute.slug, {
      name: attribute.name,
      values: new Map(
        values.filter((v) => v.attributeId === attribute.id).map((v) => [v.slug, v.name]),
      ),
    });
  }
  for (const row of own.filter((a) => !a.attributeId)) {
    const key = row.name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    names.set(`${row.productId}:${key}`, {
      name: row.name,
      values: new Map(row.values.map((v) => [v, v])),
    });
  }
  return names;
}

function describe(values: Record<string, string>, productId: string, names: AttributeNames) {
  return Object.entries(values).map(([key, value]) => {
    const attribute = names.get(`${productId}:${key}`) ?? names.get(key);
    return { name: attribute?.name ?? key, value: attribute?.values.get(value) ?? value };
  });
}

/** The variation of a product matching the chosen values ("" in a variation means any value). */
export async function findVariation(
  tx: PluginTransaction,
  productId: string,
  chosen: Record<string, string>,
): Promise<VariationRow | null> {
  const rows = await tx
    .select()
    .from(variations)
    .where(and(eq(variations.productId, productId), eq(variations.enabled, true)));
  return (
    rows
      .sort((a, b) => a.position - b.position)
      .find((v) =>
        Object.entries(v.attributes).every(([key, value]) => value === '' || chosen[key] === value),
      ) ?? null
  );
}
