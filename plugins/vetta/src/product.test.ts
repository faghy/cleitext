import { describe, expect, it } from 'vitest';
import { customNodes, price, productNode } from './product';
import { limitsFor } from './pro';

const base = {
  pageUrl: 'https://menu.test/',
  title: 'ProntoMenu',
  description: 'Il menu digitale',
  image: 'https://menu.test/a.png',
  publisherId: 'https://menu.test/#organization',
};

describe('product', () => {
  it('reads prices written the Italian or the English way', () => {
    expect(price('32,50')).toBe('32.50');
    expect(price('32.5')).toBe('32.50');
    expect(price(390)).toBe('390');
    expect(price(' 1 000 ')).toBe('1000');
    expect(price('€ 32')).toBeNull();
    expect(price('')).toBeNull();
  });

  it('is nothing until the page presents something', () => {
    expect(productNode({ ...base, fields: {} })).toBeNull();
    expect(productNode({ ...base, fields: { productType: 'Car' } })).toBeNull();
  });

  it('describes an app with monthly and yearly offers', () => {
    const node = productNode({
      ...base,
      fields: {
        productType: 'SoftwareApplication',
        productOffers: [
          { name: 'Mensile', price: '32,50', period: 'P1M' },
          {
            name: 'Annuale',
            price: '325',
            currency: 'eur',
            period: 'P1Y',
            url: 'https://menu.test/prezzi',
          },
          { name: 'Rotto', price: 'gratis' },
        ],
      },
    });
    expect(node).toMatchObject({
      '@type': 'SoftwareApplication',
      '@id': 'https://menu.test/#product',
      name: 'ProntoMenu',
      description: 'Il menu digitale',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      publisher: { '@id': 'https://menu.test/#organization' },
    });
    const offers = node!.offers as Record<string, unknown>[];
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      '@type': 'Offer',
      name: 'Mensile',
      price: '32.50',
      priceCurrency: 'EUR',
      url: 'https://menu.test/',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        billingDuration: 'P1M',
        referenceQuantity: { unitCode: 'MON', value: 1 },
      },
    });
    expect(offers[1]).toMatchObject({ url: 'https://menu.test/prezzi', priceCurrency: 'EUR' });
  });

  it('describes a product with brand and code, and a service by its provider', () => {
    const product = productNode({
      ...base,
      fields: {
        productType: 'Product',
        productName: 'Lavagna',
        productBrand: 'Ardesia',
        productSku: 'LV-1',
        productOffers: [{ price: '49' }],
      },
    });
    expect(product).toMatchObject({
      name: 'Lavagna',
      brand: { '@type': 'Brand', name: 'Ardesia' },
      sku: 'LV-1',
      offers: { '@type': 'Offer', price: '49' },
    });
    expect(product).not.toHaveProperty('offers.priceSpecification');
    const service = productNode({
      ...base,
      fields: { productType: 'Service', productCategory: 'Grafica' },
    });
    expect(service).toMatchObject({
      serviceType: 'Grafica',
      provider: { '@id': base.publisherId },
    });
    expect(service).not.toHaveProperty('offers');
  });
});

describe('own JSON-LD', () => {
  it('takes an object, a list or a whole graph, without @context', () => {
    expect(customNodes('')).toEqual({ nodes: [], error: null });
    expect(
      customNodes('{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}').nodes,
    ).toEqual([{ '@type': 'FAQPage', mainEntity: [] }]);
    expect(customNodes('[{"@type":"Event"},{"@type":["Thing","Place"]}]').nodes).toHaveLength(2);
    expect(
      customNodes('{"@context":"https://schema.org","@graph":[{"@type":"Course"}]}').nodes,
    ).toEqual([{ '@type': 'Course' }]);
  });

  it('says what is wrong, and adds nothing', () => {
    expect(customNodes('{"@type":').error).toMatch(/^Not valid JSON/);
    expect(customNodes('{"name":"x"}').error).toBe('Every item needs a "@type".');
    expect(customNodes('[1]').error).toBe('Every item must be an object.');
    expect(customNodes(JSON.stringify(Array(31).fill({ '@type': 'Thing' }))).error).toBe(
      'At most 30 items.',
    );
  });
});

describe('limits', () => {
  it('needs Pro, or a site that had it', () => {
    expect(limitsFor(false, []).schema).toBe(false);
    expect(limitsFor(true, []).schema).toBe(true);
    expect(limitsFor(false, ['schemaPlus']).schema).toBe(true);
    // Sites from before 2.0 kept their modules, not this new feature.
    expect(limitsFor(false, ['keywords', 'terms']).schema).toBe(false);
  });
});
