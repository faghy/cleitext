import type { PluginContext, PluginTransaction } from '@cleitext/plugin-sdk';
import { and, asc, eq, ne, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { shareProduct, versionsOf } from './translations';
import { parseMoney, productInputSchema, stockStatusOf, type ProductInput } from './catalog';
import {
  attributes,
  attributeValues,
  productAttributes,
  products,
  variations,
  type GalleryImage,
  type ProductRow,
  type VariationRow,
} from './schema';

/** The product form: commercial data, attributes and variations of one product. */

export interface ProductView extends Omit<
  ProductRow,
  'siteId' | 'createdAt' | 'updatedAt' | 'saleFrom' | 'saleTo'
> {
  saleFrom: string | null;
  saleTo: string | null;
  updatedAt: string;
  attributes: ProductAttributeView[];
  variations: VariationView[];
}
export interface ProductAttributeView {
  attributeId: string | null;
  name: string;
  values: string[];
  visible: boolean;
  variation: boolean;
}
export interface VariationView extends Omit<
  VariationRow,
  'siteId' | 'productId' | 'saleFrom' | 'saleTo'
> {
  saleFrom: string | null;
  saleTo: string | null;
}

export class InputError extends Error {
  constructor(
    message: string,
    readonly errors: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

const iso = (date: Date | null) => (date ? date.toISOString() : null);

/** A copy of an object without some keys. */
function omit<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

export async function getProduct(tx: PluginTransaction, id: string): Promise<ProductView | null> {
  const [row] = await tx.select().from(products).where(eq(products.entryId, id));
  if (!row) return null;
  const attributeRows = await tx
    .select()
    .from(productAttributes)
    .where(eq(productAttributes.productId, id))
    .orderBy(asc(productAttributes.position));
  const variationRows = await tx
    .select()
    .from(variations)
    .where(eq(variations.productId, id))
    .orderBy(asc(variations.position));
  const rest = omit(row, ['siteId', 'createdAt']);
  return {
    ...rest,
    saleFrom: iso(row.saleFrom),
    saleTo: iso(row.saleTo),
    updatedAt: row.updatedAt.toISOString(),
    attributes: attributeRows.map((a) => ({
      attributeId: a.attributeId,
      name: a.name,
      values: a.values,
      visible: a.visible,
      variation: a.variation,
    })),
    variations: variationRows.map(({ siteId: _s, productId: _p, ...v }) => ({
      ...v,
      saleFrom: iso(v.saleFrom),
      saleTo: iso(v.saleTo),
    })),
  };
}

const money = z.union([z.string(), z.number(), z.null()]).transform((value, ctx) => {
  try {
    return parseMoney(value);
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: (error as Error).message });
    return z.NEVER;
  }
});
const measure = z.union([z.number().min(0).max(1_000_000), z.null()]).default(null);

export const attributeInputSchema = z.object({
  attributeId: z.uuid().nullable().default(null),
  name: z.string().trim().max(120).default(''),
  values: z.array(z.string().trim().min(1).max(120)).max(200),
  visible: z.boolean().default(true),
  variation: z.boolean().default(false),
});

export const variationInputSchema = z.object({
  id: z.uuid().optional(),
  attributes: z.record(z.string().max(120), z.string().max(120)),
  enabled: z.boolean().default(true),
  sku: z.string().trim().max(100).default(''),
  gtin: z
    .string()
    .trim()
    .regex(/^(\d{8}|\d{12,14})?$/)
    .default(''),
  cost: money.default(null),
  regularPrice: money.default(null),
  salePrice: money.default(null),
  saleFrom: z.iso.datetime({ offset: true }).nullable().default(null),
  saleTo: z.iso.datetime({ offset: true }).nullable().default(null),
  manageStock: z.boolean().default(false),
  stock: z.number().int().min(-1_000_000).max(1_000_000_000).nullable().default(null),
  stockStatus: z.enum(['instock', 'outofstock', 'onbackorder']).default('instock'),
  backorders: z.enum(['no', 'notify', 'yes']).default('no'),
  weight: measure,
  length: measure,
  width: measure,
  height: measure,
  imageId: z.uuid().nullable().default(null),
  description: z.string().max(2_000).default(''),
});

export const saveProductSchema = z.object({
  product: productInputSchema.default({}),
  attributes: z.array(attributeInputSchema).max(30).optional(),
  variations: z.array(variationInputSchema).max(500).optional(),
});
export type SaveProductInput = z.output<typeof saveProductSchema>;

/** Codes must be unique among the products and variations of the site. */
async function assertFreeSku(
  tx: PluginTransaction,
  sku: string,
  owner: { product?: string; variation?: string },
): Promise<void> {
  if (!sku) return;
  // The versions of a product in other languages share its codes.
  const versions = owner.product ? await versionsOf(tx, [owner.product]) : [];
  const [product] = await tx
    .select({ id: products.entryId })
    .from(products)
    .where(
      and(
        sql`lower(${products.sku}) = lower(${sku})`,
        versions.length > 0 ? notInArray(products.entryId, versions) : undefined,
      ),
    );
  const [variation] = await tx
    .select({ id: variations.id })
    .from(variations)
    .where(
      and(
        sql`lower(${variations.sku}) = lower(${sku})`,
        owner.variation ? ne(variations.id, owner.variation) : undefined,
        versions.length > 0 ? notInArray(variations.productId, versions) : undefined,
      ),
    );
  if (product || variation) {
    throw new InputError(`The code "${sku}" is already used by another product.`, [
      { path: 'sku', message: 'Already used' },
    ]);
  }
}

/** Gallery items with their addresses, in the order given. */
async function galleryOf(
  ctx: PluginContext,
  siteId: string,
  items: { id: string; caption: string }[],
): Promise<GalleryImage[]> {
  const result: GalleryImage[] = [];
  for (const item of items) {
    const media = await ctx.media.get(siteId, item.id);
    if (media) result.push({ id: item.id, url: media.url, caption: item.caption });
  }
  return result;
}

/**
 * Saves the commercial data of a product (its entry exists: the admin made
 * it through the core API). Attributes and variations, when given, replace
 * the current ones; variations keep their id.
 */
export async function saveProduct(
  ctx: PluginContext,
  siteId: string,
  id: string,
  input: SaveProductInput,
): Promise<void> {
  const product: ProductInput = input.product;
  const gallery = product.gallery ? await galleryOf(ctx, siteId, product.gallery) : undefined;
  const images = new Map<string, string | null>();
  for (const variation of input.variations ?? []) {
    if (variation.imageId && !images.has(variation.imageId))
      images.set(variation.imageId, (await ctx.media.get(siteId, variation.imageId))?.url ?? null);
  }

  await ctx.db.transaction(siteId, async (tx) => {
    const [current] = await tx.select().from(products).where(eq(products.entryId, id));
    if (!current) throw new InputError('This product does not exist.');
    if (product.sku !== undefined) await assertFreeSku(tx, product.sku, { product: id });

    const { saleFrom, saleTo, weight, length, width, height } = product;
    const plain = omit(product, [
      'gallery',
      'saleFrom',
      'saleTo',
      'weight',
      'length',
      'width',
      'height',
    ]);
    const merged = { ...current, ...plain };
    const changes: Partial<typeof products.$inferInsert> = {
      ...plain,
      ...(saleFrom !== undefined ? { saleFrom: saleFrom ? new Date(saleFrom) : null } : {}),
      ...(saleTo !== undefined ? { saleTo: saleTo ? new Date(saleTo) : null } : {}),
      ...(weight !== undefined ? { weight: weight === null ? null : String(weight) } : {}),
      ...(length !== undefined ? { length: length === null ? null : String(length) } : {}),
      ...(width !== undefined ? { width: width === null ? null : String(width) } : {}),
      ...(height !== undefined ? { height: height === null ? null : String(height) } : {}),
      ...(gallery ? { gallery } : {}),
      stockStatus: stockStatusOf(merged),
      updatedAt: new Date(),
    };
    // Variable products count the stock of their variations.
    if (merged.kind === 'variable') {
      changes.manageStock = false;
      changes.stockStatus = 'instock';
    }
    if (!merged.manageStock || merged.kind === 'variable') changes.stock = null;
    await tx.update(products).set(changes).where(eq(products.entryId, id));

    if (input.attributes) {
      const known = new Set(
        (await tx.select({ id: attributes.id }).from(attributes)).map((a) => a.id),
      );
      await tx.delete(productAttributes).where(eq(productAttributes.productId, id));
      const rows = input.attributes.map((a, position) => {
        if (a.attributeId && !known.has(a.attributeId))
          throw new InputError('An attribute of this product does not exist any more.');
        if (!a.attributeId && !a.name)
          throw new InputError('Give a name to the attributes of this product.');
        return { siteId, productId: id, position, ...a };
      });
      if (rows.length > 0) await tx.insert(productAttributes).values(rows);
    }

    if (input.variations) {
      const keep = input.variations.flatMap((v) => (v.id ? [v.id] : []));
      await tx
        .delete(variations)
        .where(
          and(
            eq(variations.productId, id),
            keep.length > 0 ? notInArray(variations.id, keep) : undefined,
          ),
        );
      for (const [position, v] of input.variations.entries()) {
        if (v.sku)
          await assertFreeSku(tx, v.sku, { product: id, ...(v.id ? { variation: v.id } : {}) });
        const values = {
          position,
          attributes: v.attributes,
          enabled: v.enabled,
          sku: v.sku,
          gtin: v.gtin,
          cost: v.cost,
          regularPrice: v.regularPrice,
          salePrice: v.salePrice,
          saleFrom: v.saleFrom ? new Date(v.saleFrom) : null,
          saleTo: v.saleTo ? new Date(v.saleTo) : null,
          manageStock: v.manageStock,
          stock: v.manageStock ? v.stock : null,
          stockStatus: stockStatusOf(v),
          backorders: v.backorders,
          weight: v.weight === null ? null : String(v.weight),
          length: v.length === null ? null : String(v.length),
          width: v.width === null ? null : String(v.width),
          height: v.height === null ? null : String(v.height),
          imageId: v.imageId,
          imageUrl: v.imageId ? (images.get(v.imageId) ?? null) : null,
          description: v.description,
        };
        const updated = v.id
          ? await tx
              .update(variations)
              .set(values)
              .where(and(eq(variations.id, v.id), eq(variations.productId, id)))
              .returning({ id: variations.id })
          : [];
        if (updated.length === 0)
          await tx.insert(variations).values({ siteId, productId: id, ...values });
      }
    }
    await shareProduct(tx, id);
  });
}

/** Quick edits from the list (price, sale price, cost, stock), stock status kept coherent. */
export async function quickEdit(
  tx: PluginTransaction,
  id: string,
  changes: Partial<
    Pick<ProductRow, 'regularPrice' | 'salePrice' | 'cost' | 'listPrice' | 'stock' | 'stockStatus'>
  >,
): Promise<boolean> {
  const [current] = await tx.select().from(products).where(eq(products.entryId, id));
  if (!current) return false;
  const merged = { ...current, ...changes };
  // Typing a quantity means the stock is counted.
  if (changes.stock !== undefined && changes.stock !== null) merged.manageStock = true;
  await tx
    .update(products)
    .set({
      ...changes,
      manageStock: merged.manageStock,
      stockStatus: stockStatusOf(merged),
      updatedAt: new Date(),
    })
    .where(eq(products.entryId, id));
  await shareProduct(tx, id);
  return true;
}

/** Commercial data of a product copied to its duplicate (without the codes). */
export async function copyProduct(tx: PluginTransaction, from: string, to: string): Promise<void> {
  const [source] = await tx.select().from(products).where(eq(products.entryId, from));
  if (!source) return;
  const data = omit(source, [
    'siteId',
    'entryId',
    'locale',
    'title',
    'slug',
    'status',
    'categoryIds',
    'brandId',
    'imageId',
    'imageUrl',
    'createdAt',
    'totalSales',
    'rating',
    'ratingCount',
    // A duplicate is another product, not a version of this one.
    'groupId',
  ]);
  await tx
    .update(products)
    .set({ ...data, sku: '', gtin: '', updatedAt: new Date() })
    .where(eq(products.entryId, to));
  const attributeRows = await tx
    .select()
    .from(productAttributes)
    .where(eq(productAttributes.productId, from));
  if (attributeRows.length > 0)
    await tx.insert(productAttributes).values(attributeRows.map((a) => ({ ...a, productId: to })));
  const variationRows = await tx.select().from(variations).where(eq(variations.productId, from));
  if (variationRows.length > 0)
    await tx.insert(variations).values(
      variationRows.map(({ id: _v, ...v }) => ({
        ...v,
        productId: to,
        sku: '',
        gtin: '',
        groupId: null,
      })),
    );
}

// ---- Shared attributes ---------------------------------------------------------------

export interface AttributeView {
  id: string;
  slug: string;
  name: string;
  kind: 'select' | 'color';
  sort: 'position' | 'name';
  values: { id: string; slug: string; name: string; color: string | null }[];
}

export async function listAttributes(tx: PluginTransaction): Promise<AttributeView[]> {
  const rows = await tx
    .select()
    .from(attributes)
    .orderBy(asc(attributes.position), asc(attributes.name));
  const values = await tx
    .select()
    .from(attributeValues)
    .orderBy(asc(attributeValues.position), asc(attributeValues.name));
  return rows.map((a) => {
    const own = values.filter((v) => v.attributeId === a.id);
    if (a.sort === 'name') own.sort((x, y) => x.name.localeCompare(y.name));
    return {
      id: a.id,
      slug: a.slug,
      name: a.name,
      kind: a.kind,
      sort: a.sort,
      values: own.map((v) => ({ id: v.id, slug: v.slug, name: v.name, color: v.color })),
    };
  });
}

export const attributeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(60).optional(),
  kind: z.enum(['select', 'color']).default('select'),
  sort: z.enum(['position', 'name']).default('position'),
  values: z
    .array(
      z.object({
        id: z.uuid().optional(),
        name: z.string().trim().min(1).max(120),
        slug: z.string().trim().max(120).optional(),
        color: z
          .string()
          .regex(/^#[0-9a-f]{6}$/i)
          .nullable()
          .optional(),
      }),
    )
    .max(500)
    .default([]),
});

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Creates or replaces a shared attribute and its values (values keep their id). */
export async function saveAttribute(
  tx: PluginTransaction,
  siteId: string,
  id: string | null,
  input: z.output<typeof attributeSchema>,
): Promise<string> {
  const slug = slugify(input.slug || input.name);
  if (!slug) throw new InputError('The name must contain letters or digits.');
  const [taken] = await tx
    .select({ id: attributes.id })
    .from(attributes)
    .where(and(eq(attributes.slug, slug), id ? ne(attributes.id, id) : undefined));
  if (taken) throw new InputError(`An attribute "${slug}" already exists.`);
  let attributeId = id;
  if (attributeId) {
    const updated = await tx
      .update(attributes)
      .set({ slug, name: input.name, kind: input.kind, sort: input.sort })
      .where(eq(attributes.id, attributeId))
      .returning({ id: attributes.id });
    if (updated.length === 0) throw new InputError('This attribute does not exist.');
  } else {
    const [created] = await tx
      .insert(attributes)
      .values({ siteId, slug, name: input.name, kind: input.kind, sort: input.sort })
      .returning({ id: attributes.id });
    attributeId = created!.id;
  }
  const keep = input.values.flatMap((v) => (v.id ? [v.id] : []));
  await tx
    .delete(attributeValues)
    .where(
      and(
        eq(attributeValues.attributeId, attributeId),
        keep.length > 0 ? notInArray(attributeValues.id, keep) : undefined,
      ),
    );
  const seen = new Set<string>();
  for (const [position, value] of input.values.entries()) {
    const valueSlug = slugify(value.slug || value.name);
    if (!valueSlug || seen.has(valueSlug))
      throw new InputError(`The value "${value.name}" is repeated or has no letters or digits.`);
    seen.add(valueSlug);
    const values = { slug: valueSlug, name: value.name, color: value.color ?? null, position };
    const updated = value.id
      ? await tx
          .update(attributeValues)
          .set(values)
          .where(
            and(eq(attributeValues.id, value.id), eq(attributeValues.attributeId, attributeId)),
          )
          .returning({ id: attributeValues.id })
      : [];
    if (updated.length === 0)
      await tx.insert(attributeValues).values({ siteId, attributeId, ...values });
  }
  return attributeId;
}
