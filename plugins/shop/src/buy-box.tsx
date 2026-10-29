import { textIn } from './texts';
import { defineBlock, type BlockLoadContext, type PluginContext } from '@cleitext/plugin-sdk';
import { asc, eq } from 'drizzle-orm';
import { currentPrice, isOnSale } from './pricing';
import {
  attributes,
  attributeValues,
  productAttributes,
  products,
  variations,
  type ProductRow,
  type VariationRow,
} from './schema';
import { SHOP_CSS } from './pages';
import { STRIPE_SCRIPT } from './stripe-element';
import { translator } from './strings';

/**
 * The buy box of a product page: price, availability, the variation's
 * options, quantity and "Add to cart". A plain form (no JavaScript); the
 * page stays in the cache and refreshes when the product changes.
 */

export const productTag = (id: string) => `shop:product:${id}`;
/** Pages listing products (the catalog, product blocks): they refresh with any product. */
export const CATALOG_TAG = 'shop:catalog';
/** What to refresh when products' prices or stock change. */
export const productTags = (ids: string[]) => [...new Set(ids)].map(productTag).concat(CATALOG_TAG);
/** Pages with the express buttons: they refresh when Shop → Payments changes. */
export const PAYMENTS_TAG = 'shop:payments';

/** What the buy box needs from the shop's settings. */
export interface BuyBoxSettings {
  currency: string;
  lowStock: number;
  /** The express buttons (Apple Pay, Google Pay, Link) show on product pages. */
  express?: boolean;
}

interface Option {
  key: string;
  name: string;
  values: { slug: string; name: string }[];
}

export interface BuyBoxData {
  product: Pick<ProductRow, 'entryId' | 'kind' | 'soldIndividually' | 'sku'> & {
    price: string | null;
    regularPrice: string | null;
    onSale: boolean;
    availability: 'instock' | 'low' | 'outofstock' | 'onbackorder';
    stock: number | null;
  };
  options: Option[];
  /** Variations' prices, for the range. */
  prices: number[];
  anyAvailable: boolean;
  currency: string;
  action: string;
  /** "Buy now" with the express buttons: where their script asks for the amount. */
  express?: string;
}

function availabilityOf(
  item: Pick<ProductRow, 'manageStock' | 'stock' | 'stockStatus'>,
  lowStock: number,
): BuyBoxData['product']['availability'] {
  if (item.stockStatus === 'outofstock') return 'outofstock';
  if (item.stockStatus === 'onbackorder') return 'onbackorder';
  if (item.manageStock && (item.stock ?? 0) <= lowStock) return 'low';
  return 'instock';
}

/** What the buy box shows for the product of a page. */
export async function loadBuyBox(
  ctx: PluginContext,
  settings: (siteId: string) => Promise<BuyBoxSettings>,
  context: BlockLoadContext,
): Promise<BuyBoxData | null> {
  const id = context.entry?.id;
  if (!id) return null;
  context.tag(productTag(id));
  context.tag(PAYMENTS_TAG);
  const values = await settings(context.siteId);
  // The cart of the page's language: `/it/cart/add` under `/it/`.
  const base = context.page.site.home.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '');
  return ctx.db.transaction(context.siteId, async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.entryId, id));
    if (!product) return null;
    const own = await tx
      .select()
      .from(productAttributes)
      .where(eq(productAttributes.productId, id))
      .orderBy(asc(productAttributes.position));
    const variationRows: VariationRow[] =
      product.kind === 'variable'
        ? await tx
            .select()
            .from(variations)
            .where(eq(variations.productId, id))
            .orderBy(asc(variations.position))
        : [];
    const enabled = variationRows.filter((v) => v.enabled && currentPrice(v) !== null);
    const shared = own.some((a) => a.attributeId) ? await tx.select().from(attributes) : [];
    const sharedValues = shared.length ? await tx.select().from(attributeValues) : [];
    const options: Option[] = own
      .filter((a) => a.variation && product.kind === 'variable')
      .map((a) => {
        if (a.attributeId) {
          const attribute = shared.find((s) => s.id === a.attributeId);
          // Names in the page's language.
          const list = sharedValues
            .filter((v) => v.attributeId === a.attributeId && a.values.includes(v.slug))
            .map((v) => ({ ...v, name: textIn(v.translations, context.locale, 'name', v.name) }))
            .sort((x, y) =>
              attribute?.sort === 'name' ? x.name.localeCompare(y.name) : x.position - y.position,
            );
          return {
            key: attribute?.slug ?? '',
            name: attribute
              ? textIn(attribute.translations, context.locale, 'name', attribute.name)
              : '',
            values: list.map((v) => ({ slug: v.slug, name: v.name })),
          };
        }
        const key = a.name
          .normalize('NFKD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        return {
          key,
          name: textIn(a.translations, context.locale, 'name', a.name),
          values: a.values.map((v) => ({
            slug: v,
            name: textIn(a.translations, context.locale, `value:${v}`, v),
          })),
        };
      })
      .filter((o) => o.key && o.values.length > 0);
    const price = currentPrice(product);
    return {
      product: {
        entryId: product.entryId,
        kind: product.kind,
        soldIndividually: product.soldIndividually,
        sku: product.sku,
        price,
        regularPrice: product.regularPrice,
        onSale: isOnSale(product),
        availability: availabilityOf(product, values.lowStock),
        stock: product.manageStock ? product.stock : null,
      },
      options,
      prices: enabled.map((v) => Number(currentPrice(v))),
      anyAvailable: enabled.some((v) => v.stockStatus !== 'outofstock'),
      currency: values.currency,
      action: `${base}/cart/add`,
      // Simple products only: a variation is chosen in the form first.
      ...(values.express && product.kind !== 'variable'
        ? { express: `${base}/checkout/express` }
        : {}),
    };
  });
}

/** The buy box: price, availability, options, quantity, "Add to cart". */
export function BuyBoxView({ data, locale }: { data: BuyBoxData | null; locale: string }) {
  const context = { locale };
  if (!data) return null;
  const t = translator(context.locale);
  const money = (value: number | string) =>
    new Intl.NumberFormat(context.locale, {
      style: 'currency',
      currency: data.currency,
      useGrouping: 'always',
    }).format(Number(value));
  const { product } = data;
  const variable = product.kind === 'variable';
  const min = data.prices.length ? Math.min(...data.prices) : null;
  const max = data.prices.length ? Math.max(...data.prices) : null;
  const buyable = variable
    ? data.anyAvailable && min !== null
    : product.price !== null && product.availability !== 'outofstock';
  return (
    <div className="shop-buy">
      <p className="shop-buy__price">
        {variable ? (
          min === null ? null : min === max ? (
            money(min)
          ) : (
            `${money(min)} – ${money(max!)}`
          )
        ) : product.price === null ? null : product.onSale ? (
          <>
            <del>{money(product.regularPrice!)}</del> <ins>{money(product.price)}</ins>{' '}
            <span className="shop-badge">{t('Sale!')}</span>
          </>
        ) : (
          money(product.price)
        )}
      </p>
      {!variable && (
        <p className={`shop-buy__stock shop-stock--${product.availability}`}>
          {product.availability === 'outofstock'
            ? t('Out of stock')
            : product.availability === 'onbackorder'
              ? t('Available on backorder')
              : product.availability === 'low' && product.stock !== null
                ? t('Only {n} left', { n: product.stock })
                : t('In stock')}
        </p>
      )}
      {buyable ? (
        <form className="shop-buy__form" method="post" action={data.action}>
          <input type="hidden" name="product" value={product.entryId} />
          {data.options.map((option) => (
            <p key={option.key} className="shop-field">
              <label htmlFor={`shop-opt-${option.key}`}>{option.name}</label>
              <select id={`shop-opt-${option.key}`} name={`attribute_${option.key}`} required>
                <option value="">{t('Choose an option')}</option>
                {option.values.map((value) => (
                  <option key={value.slug} value={value.slug}>
                    {value.name}
                  </option>
                ))}
              </select>
            </p>
          ))}
          <p className="shop-buy__actions">
            {!product.soldIndividually && (
              <>
                <label htmlFor="shop-qty" className="shop-sr">
                  {t('Quantity')}
                </label>
                <input
                  id="shop-qty"
                  type="number"
                  name="quantity"
                  defaultValue={1}
                  min={1}
                  max={9999}
                  inputMode="numeric"
                />
              </>
            )}
            <button type="submit" className="shop-button">
              {t('Add to cart')}
            </button>
          </p>
          {data.express && !variable && (
            <div
              className="shop-express shop-express--product"
              data-shop-express={JSON.stringify({
                url: data.express,
                place: 'product',
                product: product.entryId,
              })}
              hidden
            >
              <div className="shop-express__buttons" />
              <p className="shop-error" role="alert" data-shop-express-error="" />
            </div>
          )}
        </form>
      ) : (
        variable && <p className="shop-buy__stock shop-stock--outofstock">{t('Out of stock')}</p>
      )}
    </div>
  );
}

export function registerBuyBox(
  ctx: PluginContext,
  settings: (siteId: string) => Promise<BuyBoxSettings>,
): void {
  // The express buttons' script, on pages that show them ("buy now").
  ctx.assets.enqueue({
    file: STRIPE_SCRIPT,
    when: ({ html }) => html.includes('data-shop-express'),
  });
  ctx.blocks.register(
    defineBlock<Record<string, never>, BuyBoxData | null>({
      type: 'shop/buy-box',
      title: { en: 'Add to cart', it: 'Aggiungi al carrello' },
      icon: 'cart',
      attributes: [],
      load: (_attrs, context) => loadBuyBox(ctx, settings, context),
      css: () => SHOP_CSS,
      render: ({ data, context }) => <BuyBoxView data={data} locale={context.locale} />,
    }),
  );
}
