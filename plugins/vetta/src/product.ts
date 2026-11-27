/**
 * Structured data of a page beyond Vetta's graph (Vetta SEO Pro): a product,
 * an application or a service with its offers, filled in the page's box, and
 * the page's own JSON-LD, checked and added to the same `@graph`.
 */

export const PRODUCT_TYPES = ['Product', 'SoftwareApplication', 'Service'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/** Billing periods of an offer: once, a month, a year. */
const PERIODS: Record<string, { duration: string; unit: string }> = {
  P1M: { duration: 'P1M', unit: 'MON' },
  P1Y: { duration: 'P1Y', unit: 'ANN' },
};

/** The page's fields of the product (group `vetta`). */
export interface ProductFields {
  productType?: unknown;
  productName?: unknown;
  productDescription?: unknown;
  productBrand?: unknown;
  productSku?: unknown;
  productCategory?: unknown;
  productOs?: unknown;
  productOffers?: unknown;
  customSchema?: unknown;
}

export interface ProductInput {
  fields: ProductFields;
  pageUrl: string;
  title: string;
  description: string;
  image: string | null;
  publisherId: string;
}

const text = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const url = (v: unknown) => {
  const s = text(v, 2000);
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
};

/** A price as schema.org wants it: `32,50` and `32.5` are `32.50`; anything else is dropped. */
export function price(v: unknown): string | null {
  const s = typeof v === 'number' ? String(v) : text(v, 20).replace(/\s/g, '');
  const m = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return m[2] === undefined ? m[1]! : `${m[1]}.${m[2].padEnd(2, '0')}`;
}

function offers(list: unknown, pageUrl: string): Record<string, unknown>[] {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, 20)
    .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : {}))
    .map((o) => {
      const amount = price(o.price);
      if (amount === null) return null;
      const currency = (text(o.currency, 3) || 'EUR').toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) return null;
      const period = PERIODS[text(o.period)];
      return {
        '@type': 'Offer',
        ...(text(o.name) ? { name: text(o.name) } : {}),
        price: amount,
        priceCurrency: currency,
        url: url(o.url) || pageUrl,
        availability: 'https://schema.org/InStock',
        ...(period
          ? {
              priceSpecification: {
                '@type': 'UnitPriceSpecification',
                price: amount,
                priceCurrency: currency,
                billingDuration: period.duration,
                referenceQuantity: {
                  '@type': 'QuantitativeValue',
                  value: 1,
                  unitCode: period.unit,
                },
              },
            }
          : {}),
      };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);
}

/** The product, application or service of the page, or null when the page has none. */
export function productNode(input: ProductInput): Record<string, unknown> | null {
  const f = input.fields;
  const type = text(f.productType) as ProductType;
  if (!PRODUCT_TYPES.includes(type)) return null;
  const name = text(f.productName, 200) || input.title;
  if (!name) return null;
  const description = text(f.productDescription, 1000) || input.description;
  const category = text(f.productCategory, 100);
  const list = offers(f.productOffers, input.pageUrl);
  const node: Record<string, unknown> = {
    '@type': type,
    '@id': `${input.pageUrl}#product`,
    name,
    ...(description ? { description } : {}),
    url: input.pageUrl,
    mainEntityOfPage: { '@id': `${input.pageUrl}#webpage` },
    ...(input.image ? { image: input.image } : {}),
  };
  if (type === 'Product') {
    if (text(f.productBrand)) node.brand = { '@type': 'Brand', name: text(f.productBrand) };
    if (text(f.productSku, 80)) node.sku = text(f.productSku, 80);
    if (category) node.category = category;
  } else if (type === 'SoftwareApplication') {
    node.applicationCategory = category || 'BusinessApplication';
    node.operatingSystem = text(f.productOs, 100) || 'Web';
    node.publisher = { '@id': input.publisherId };
  } else {
    if (category) node.serviceType = category;
    node.provider = { '@id': input.publisherId };
  }
  if (list.length) node.offers = list.length === 1 ? list[0] : list;
  return node;
}

/** Nodes of the page's own JSON-LD, at most this many. */
export const MAX_CUSTOM_NODES = 30;

/**
 * The page's own JSON-LD as nodes of the graph: an object, a list of them,
 * or a whole `{ "@context", "@graph" }`. Every node needs a `@type`;
 * `@context` is the graph's. An error says why nothing is added.
 */
export function customNodes(source: unknown): {
  nodes: Record<string, unknown>[];
  error: string | null;
} {
  const raw = typeof source === 'string' ? source.trim() : '';
  if (!raw) return { nodes: [], error: null };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { nodes: [], error: `Not valid JSON: ${(e as Error).message}` };
  }
  const graph =
    data && typeof data === 'object' && !Array.isArray(data) && '@graph' in data
      ? (data as { '@graph': unknown })['@graph']
      : data;
  const list = Array.isArray(graph) ? graph : [graph];
  const nodes: Record<string, unknown>[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return { nodes: [], error: 'Every item must be an object.' };
    const node = { ...(item as Record<string, unknown>) };
    delete node['@context'];
    if (typeof node['@type'] !== 'string' && !Array.isArray(node['@type']))
      return { nodes: [], error: 'Every item needs a "@type".' };
    nodes.push(node);
  }
  if (nodes.length > MAX_CUSTOM_NODES)
    return { nodes: [], error: `At most ${MAX_CUSTOM_NODES} items.` };
  return { nodes, error: null };
}
