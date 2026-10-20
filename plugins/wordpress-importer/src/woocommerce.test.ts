import { describe, expect, it } from 'vitest';
import { wxrToDocument } from './wxr';

/** A WooCommerce export, as WordPress writes it (Tools → Export → All content). */
const meta = (key: string, value: string) =>
  `<wp:postmeta><wp:meta_key><![CDATA[${key}]]></wp:meta_key><wp:meta_value><![CDATA[${value}]]></wp:meta_value></wp:postmeta>`;
const item = (fields: string) => `<item>${fields}</item>`;
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
<title>Shop</title><link>https://shop.example</link><wp:wxr_version>1.2</wp:wxr_version>
<wp:base_site_url>https://shop.example</wp:base_site_url><wp:base_blog_url>https://shop.example</wp:base_blog_url>
<wp:author><wp:author_login><![CDATA[marina]]></wp:author_login><wp:author_email><![CDATA[m@shop.example]]></wp:author_email></wp:author>
<wp:term><wp:term_id>5</wp:term_id><wp:term_taxonomy><![CDATA[product_cat]]></wp:term_taxonomy><wp:term_slug><![CDATA[cancelleria]]></wp:term_slug><wp:term_name><![CDATA[Cancelleria]]></wp:term_name></wp:term>
<wp:term><wp:term_id>6</wp:term_id><wp:term_taxonomy><![CDATA[product_cat]]></wp:term_taxonomy><wp:term_slug><![CDATA[scuola]]></wp:term_slug><wp:term_parent><![CDATA[cancelleria]]></wp:term_parent><wp:term_name><![CDATA[Scuola]]></wp:term_name></wp:term>
<wp:term><wp:term_id>7</wp:term_id><wp:term_taxonomy><![CDATA[product_brand]]></wp:term_taxonomy><wp:term_slug><![CDATA[tintaunita]]></wp:term_slug><wp:term_name><![CDATA[TintaUNITA]]></wp:term_name></wp:term>
<wp:term><wp:term_id>8</wp:term_id><wp:term_taxonomy><![CDATA[pa_colore]]></wp:term_taxonomy><wp:term_slug><![CDATA[rosso]]></wp:term_slug><wp:term_name><![CDATA[Rosso]]></wp:term_name></wp:term>
<wp:term><wp:term_id>9</wp:term_id><wp:term_taxonomy><![CDATA[pa_colore]]></wp:term_taxonomy><wp:term_slug><![CDATA[blu-notte]]></wp:term_slug><wp:term_name><![CDATA[Blu notte]]></wp:term_name></wp:term>
${item(`<title>Astuccio</title><link>https://shop.example/wp-content/uploads/a.jpg</link><wp:post_id>101</wp:post_id><wp:post_type><![CDATA[attachment]]></wp:post_type><wp:status><![CDATA[inherit]]></wp:status><wp:attachment_url><![CDATA[https://shop.example/wp-content/uploads/a.jpg]]></wp:attachment_url>`)}
${item(`<title>Retro</title><wp:post_id>102</wp:post_id><wp:post_type><![CDATA[attachment]]></wp:post_type><wp:status><![CDATA[inherit]]></wp:status><wp:attachment_url><![CDATA[https://shop.example/wp-content/uploads/b.jpg]]></wp:attachment_url>`)}
${item(`<title>Pastelli 110 colori</title><link>https://shop.example/prodotto/pastelli-110/</link><dc:creator><![CDATA[marina]]></dc:creator>
<content:encoded><![CDATA[<p>Tutti i colori in un astuccio.</p>]]></content:encoded><excerpt:encoded><![CDATA[<p>Il <strong>più</strong> completo.</p>]]></excerpt:encoded>
<wp:post_id>700</wp:post_id><wp:post_date_gmt><![CDATA[2025-01-10 10:00:00]]></wp:post_date_gmt><wp:post_name><![CDATA[pastelli-110]]></wp:post_name><wp:status><![CDATA[publish]]></wp:status><wp:post_parent>0</wp:post_parent><wp:post_type><![CDATA[product]]></wp:post_type>
<category domain="product_cat" nicename="scuola"><![CDATA[Scuola]]></category><category domain="product_brand" nicename="tintaunita"><![CDATA[TintaUNITA]]></category>
<category domain="product_type" nicename="simple"><![CDATA[simple]]></category><category domain="product_visibility" nicename="featured"><![CDATA[featured]]></category><category domain="product_visibility" nicename="outofstock"><![CDATA[outofstock]]></category>
${meta('_sku', 'TU110')}${meta('_regular_price', '59.90')}${meta('_sale_price', '49.90')}${meta('_sale_price_dates_from', '1735689600')}${meta('_sale_price_dates_to', '1738368000')}
${meta('_manage_stock', 'yes')}${meta('_stock', '0')}${meta('_stock_status', 'outofstock')}${meta('_backorders', 'no')}${meta('_weight', '0,4')}${meta('_length', '30')}
${meta('_thumbnail_id', '101')}${meta('_product_image_gallery', '102,999')}${meta('_upsell_ids', 'a:1:{i:0;i:800;}')}${meta('_tax_status', 'taxable')}`)}
${item(`<title>Penna gel</title><link>https://shop.example/prodotto/penna-gel/</link><dc:creator><![CDATA[marina]]></dc:creator>
<content:encoded><![CDATA[<p>Scrive morbida.</p>]]></content:encoded><excerpt:encoded><![CDATA[]]></excerpt:encoded>
<wp:post_id>800</wp:post_id><wp:post_name><![CDATA[penna-gel]]></wp:post_name><wp:status><![CDATA[publish]]></wp:status><wp:post_parent>0</wp:post_parent><wp:post_type><![CDATA[product]]></wp:post_type>
<category domain="product_cat" nicename="cancelleria"><![CDATA[Cancelleria]]></category><category domain="product_type" nicename="variable"><![CDATA[variable]]></category>
<category domain="pa_colore" nicename="rosso"><![CDATA[Rosso]]></category><category domain="pa_colore" nicename="blu-notte"><![CDATA[Blu notte]]></category>
${meta('_product_attributes', 'a:2:{s:9:"pa_colore";a:6:{s:4:"name";s:9:"pa_colore";s:5:"value";s:0:"";s:8:"position";i:0;s:10:"is_visible";i:1;s:12:"is_variation";i:1;s:11:"is_taxonomy";i:1;}s:7:"formato";a:6:{s:4:"name";s:7:"Formato";s:5:"value";s:13:"Mini | Grande";s:8:"position";i:1;s:10:"is_visible";i:1;s:12:"is_variation";i:0;s:11:"is_taxonomy";i:0;}}')}`)}
${item(`<title>Penna gel - Rosso</title><wp:post_id>801</wp:post_id><wp:status><![CDATA[publish]]></wp:status><wp:post_parent>800</wp:post_parent><wp:post_type><![CDATA[product_variation]]></wp:post_type>
${meta('attribute_pa_colore', 'rosso')}${meta('_sku', 'PG-R')}${meta('_regular_price', '2.50')}${meta('_stock_status', 'instock')}${meta('_thumbnail_id', '101')}`)}
${item(`<title>Penna gel - Blu</title><wp:post_id>802</wp:post_id><wp:status><![CDATA[private]]></wp:status><wp:post_parent>800</wp:post_parent><wp:post_type><![CDATA[product_variation]]></wp:post_type>
${meta('attribute_pa_colore', 'blu-notte')}${meta('_sku', 'PG-B')}${meta('_regular_price', '2.70')}${meta('_manage_stock', 'yes')}${meta('_stock', '4')}`)}
${item(`<title>Ordine</title><wp:post_id>900</wp:post_id><wp:status><![CDATA[wc-completed]]></wp:status><wp:post_type><![CDATA[shop_order]]></wp:post_type>`)}
</channel></rss>`;

describe('WooCommerce products', () => {
  const { document, warnings } = wxrToDocument(XML, { locale: 'it' });
  const products = document.entries!.filter((e) => e.type === 'product');
  const shop = (document.plugins as { shop: { products: Record<string, unknown>[] } }).shop;

  it('become Cleishop products with their categories, brand, picture and short description', () => {
    expect(products.map((p) => p.slug)).toEqual(['pastelli-110', 'penna-gel']);
    const [pastelli] = products;
    expect(pastelli).toMatchObject({
      title: 'Pastelli 110 colori',
      status: 'published',
      excerpt: 'Il più completo.',
      featuredMediaRef: 'att:101',
      terms: { 'product-category': ['product_cat:scuola'], brand: ['product_brand:tintaunita'] },
    });
    expect(pastelli!.oldPaths).toContain('https://shop.example/prodotto/pastelli-110/');
    const categories = document.terms!.filter((t) => t.taxonomy === 'product-category');
    expect(categories.map((t) => [t.slug, t.parentRef ?? null])).toEqual([
      ['cancelleria', null],
      ['scuola', 'product_cat:cancelleria'],
    ]);
    expect(document.terms!.find((t) => t.taxonomy === 'brand')?.name).toBe('TintaUNITA');
  });

  it('give Cleishop prices, code, stock, sizes, gallery and related products', () => {
    expect(shop.products[0]).toMatchObject({
      entry: { $entry: 'post:700' },
      product: {
        kind: 'simple',
        sku: 'TU110',
        regularPrice: '59.90',
        salePrice: '49.90',
        saleFrom: '2025-01-01T00:00:00.000Z',
        saleTo: '2025-02-01T00:00:00.000Z',
        manageStock: true,
        stock: 0,
        stockStatus: 'outofstock',
        weight: 0.4,
        length: 30,
        featured: true,
        visibility: 'visible',
        // The missing picture 999 is left out.
        gallery: [
          { id: 'att:102', url: 'https://shop.example/wp-content/uploads/b.jpg', caption: '' },
        ],
      },
      upsells: [{ $entry: 'post:800' }],
    });
  });

  it('keep attributes with their names and variations with theirs', () => {
    expect(shop.products[1]).toMatchObject({
      product: { kind: 'variable' },
      attributes: [
        { name: 'Colore', values: ['Rosso', 'Blu notte'], visible: true, variation: true },
        { name: 'Formato', values: ['Mini', 'Grande'], visible: true, variation: false },
      ],
      variations: [
        {
          attributes: { Colore: 'Rosso' },
          enabled: true,
          sku: 'PG-R',
          regularPrice: '2.50',
          image: { id: 'att:101', url: 'https://shop.example/wp-content/uploads/a.jpg' },
        },
        { attributes: { Colore: 'Blu notte' }, enabled: false, manageStock: true, stock: 4 },
      ],
    });
  });

  it('report orders, and that Cleishop must be active', () => {
    const text = warnings.join('\n');
    expect(text).toContain('2 WooCommerce product(s) were imported for Cleishop');
    expect(text).toContain('shop type "shop_order" (orders, coupons)');
    expect(text).not.toContain('product_variation');
  });
});
