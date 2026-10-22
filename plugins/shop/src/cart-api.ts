import type { CartLine } from './cart';
import { itemKey } from './cart';
import type { Money } from './pages';
import type { CartItem } from './schema';
import type { Totals } from './totals';

/**
 * The cart as JSON, for page builders and scripts (`GET /cart/data`): the
 * visitor's items priced now, the totals as the cart page shows them, and
 * where the cart and the checkout are. Amounts are numbers in the currency
 * (12.5 is 12.50 €), with the same text the cart page prints beside them.
 */
export interface CartJson {
  items: CartJsonItem[];
  /** How many pieces in all (the cart link's number). */
  count: number;
  currency: string;
  /** Prices and totals include taxes (Settings → Cleishop). */
  pricesIncludeTax: boolean;
  coupons: { code: string; discount: number; formatted: string }[];
  totals: {
    subtotal: number;
    discount: number;
    /** null: shipping is calculated at checkout, or there is nothing to ship. */
    shipping: number | null;
    fees: { name: string; amount: number }[];
    tax: number;
    total: number;
    formatted: { subtotal: string; discount: string; tax: string; total: string };
  };
  /** Messages for the visitor (added, updated, coupon problems, items no longer available). */
  notices: { kind: 'ok' | 'error'; text: string }[];
  cartUrl: string;
  checkoutUrl: string;
  /** The cart page's markup, with `?html=1`. */
  html?: string;
}

export interface CartJsonItem {
  /** The item in the update and remove routes. */
  key: string;
  productId: string;
  variationId: string | null;
  title: string;
  /** A variation's choices, e.g. Colour: Red. */
  attributes: { name: string; value: string }[];
  sku: string;
  quantity: number;
  /** Products sold one at a time: the quantity cannot change. */
  soldIndividually: boolean;
  /** The price of one, and the regular one when on sale. */
  price: number;
  regularPrice: number;
  onSale: boolean;
  /** Price × quantity, before coupons. */
  total: number;
  image: string | null;
  url: string;
  formatted: { price: string; total: string };
}

const units = (cents: number) => Math.round(cents) / 100;

export function cartJson(input: {
  lines: CartLine[];
  totals: Totals;
  coupons: { code: string; discount: number }[];
  currency: string;
  includeTax: boolean;
  money: Money;
  notices: { kind: 'ok' | 'error'; text: string }[];
  urls: { cart: string; checkout: string; product: (line: CartLine) => string };
}): CartJson {
  const { totals, money, includeTax } = input;
  const items = input.lines.map((line): CartJsonItem => {
    const computed = totals.lines.find((l) => l.key === line.key);
    const total = computed
      ? includeTax
        ? computed.subtotalGross
        : computed.subtotalNet
      : Math.round(Number(line.unitPrice) * 100) * line.quantity;
    return {
      key: line.key,
      productId: line.productId,
      variationId: line.variationId,
      title: line.title,
      attributes: line.attributes,
      sku: line.sku,
      quantity: line.quantity,
      soldIndividually: line.soldIndividually,
      price: Number(line.unitPrice),
      regularPrice: Number(line.regularPrice),
      onSale: line.onSale,
      total: units(total),
      image: line.imageUrl,
      url: input.urls.product(line),
      formatted: { price: money.of(line.unitPrice), total: money(total) },
    };
  });
  const subtotal = includeTax ? totals.subtotalGross : totals.subtotalNet;
  const discount = includeTax ? totals.discountGross : totals.discountNet;
  const shippingGross = totals.shippingNet + totals.shippingTax;
  const shipping = includeTax ? shippingGross : totals.shippingNet;
  return {
    items,
    count: input.lines.reduce((sum, line) => sum + line.quantity, 0),
    currency: input.currency,
    pricesIncludeTax: includeTax,
    coupons: input.coupons.map((c) => ({
      code: c.code,
      discount: units(c.discount),
      formatted: money(c.discount),
    })),
    totals: {
      subtotal: units(subtotal),
      discount: units(discount),
      shipping: shippingGross === 0 ? null : units(shipping),
      fees: totals.fees.map((fee) => ({
        name: fee.name,
        amount: units(includeTax ? fee.net + fee.tax : fee.net),
      })),
      tax: units(totals.taxTotal),
      total: units(totals.total),
      formatted: {
        subtotal: money(subtotal),
        discount: money(discount),
        tax: money(totals.taxTotal),
        total: money(totals.total),
      },
    },
    notices: input.notices,
    cartUrl: input.urls.cart,
    checkoutUrl: input.urls.checkout,
  };
}

/** The quantity a visitor asked for, as the cart page reads it: 0 to 9999, null when not a number. */
export function readQuantity(raw: unknown): number | null {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const quantity = Math.floor(Number(raw));
  return Number.isFinite(quantity) ? Math.max(0, Math.min(quantity, 9999)) : null;
}

/**
 * An item's new quantity (0 removes it), with the cart page's rules: the
 * prices and stock are checked after (`priceCart`). `null` when no item has
 * that key.
 */
export function setQuantity(items: CartItem[], key: string, quantity: number): CartItem[] | null {
  if (!items.some((item) => itemKey(item) === key)) return null;
  return items
    .map((item) => (itemKey(item) === key ? { ...item, quantity } : item))
    .filter((item) => item.quantity > 0);
}

/** The cart without an item; `null` when no item has that key. */
export const removeItem = (items: CartItem[], key: string): CartItem[] | null =>
  setQuantity(items, key, 0);

/**
 * The script of the cart and checkout blocks (pages are cached, carts are
 * not): it fetches the visitor's cart or checkout from `data-shop-embed`
 * and puts it in the block, scripts included (e.g. the checkout's bot
 * protection). In the cart, its forms (quantities, remove, coupons) post in
 * the background and the cart is drawn again, with the cart page's notices;
 * the cart links' counts follow. Without scripts the block links the page.
 */
export const EMBED_JS = `(()=>{const run=el=>{for(const old of el.querySelectorAll('script')){const s=document.createElement('script');for(const a of old.attributes)s.setAttribute(a.name,a.value);s.text=old.text;old.replaceWith(s);}};
const load=(el,query)=>{const u=new URL(el.dataset.shopEmbed,location.href);u.searchParams.set('html','1');if(query)new URLSearchParams(query).forEach((v,k)=>u.searchParams.set(k,v));el.setAttribute('aria-busy','true');
return fetch(u,{credentials:'same-origin',headers:{accept:'application/json'}}).then(r=>r.ok?r.json():null).then(d=>{el.removeAttribute('aria-busy');if(!d||typeof d.html!=='string')return;el.innerHTML=d.html;run(el);
if(typeof d.count==='number')for(const c of document.querySelectorAll('[data-shop-count]'))c.textContent=d.count>0?String(d.count):'';
el.dispatchEvent(new CustomEvent('shop:cart',{bubbles:true,detail:d}));}).catch(()=>el.removeAttribute('aria-busy'));};
for(const el of document.querySelectorAll('[data-shop-embed]')){if(el.dataset.shopReady)continue;el.dataset.shopReady='1';load(el,'');if(el.dataset.shopKind!=='cart')continue;
el.addEventListener('submit',e=>{const f=e.target;if(!(f instanceof HTMLFormElement))return;const a=new URL(f.action,location.href);
if(a.origin!==location.origin||!/\\/cart\\/(update|coupon)$/.test(a.pathname))return;e.preventDefault();
fetch(a,{method:'POST',body:new URLSearchParams(new FormData(f,e.submitter)),credentials:'same-origin'}).then(r=>load(el,new URL(r.url).search)).catch(()=>f.submit());});}})();`;
export const EMBED_JS_PATH = `/shop-assets/embed-${Buffer.from(EMBED_JS).length.toString(36)}.js`;
