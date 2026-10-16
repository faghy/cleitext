-- The catalog of the shop, per site (Row Level Security).
--
-- A product is a Cleitext entry of type `product` (title, description in
-- blocks, revisions, translations, SEO): this table keeps its commercial data
-- and a copy of what lists filter and sort on (title, status, categories,
-- brand, image), refreshed by the entry hooks, so that the admin list and the
-- storefront need no join with core tables.
CREATE TABLE products (
  site_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  -- Copy of the entry.
  locale text NOT NULL DEFAULT 'en',
  title text NOT NULL DEFAULT '',
  slug text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  category_ids uuid[] NOT NULL DEFAULT '{}',
  brand_id uuid,
  image_id uuid,
  image_url text,
  -- What is sold.
  kind text NOT NULL DEFAULT 'simple' CHECK (kind IN ('simple', 'variable')),
  sku text NOT NULL DEFAULT '',
  gtin text NOT NULL DEFAULT '',
  condition text NOT NULL DEFAULT 'new' CHECK (condition IN ('new', 'used', 'refurbished')),
  -- Three prices (Cleito): what it costs, the list price, the selling price;
  -- plus a sale price, optionally between two dates.
  cost numeric(14, 4),
  list_price numeric(14, 4),
  regular_price numeric(14, 4),
  sale_price numeric(14, 4),
  sale_from timestamptz,
  sale_to timestamptz,
  tax_status text NOT NULL DEFAULT 'taxable' CHECK (tax_status IN ('taxable', 'shipping', 'none')),
  tax_class text NOT NULL DEFAULT '',
  -- Stock.
  manage_stock boolean NOT NULL DEFAULT false,
  stock integer,
  stock_status text NOT NULL DEFAULT 'instock'
    CHECK (stock_status IN ('instock', 'outofstock', 'onbackorder')),
  backorders text NOT NULL DEFAULT 'no' CHECK (backorders IN ('no', 'notify', 'yes')),
  low_stock integer,
  sold_individually boolean NOT NULL DEFAULT false,
  -- Shipping.
  weight numeric(12, 3),
  length numeric(12, 2),
  width numeric(12, 2),
  height numeric(12, 2),
  shipping_class text NOT NULL DEFAULT '',
  virtual boolean NOT NULL DEFAULT false,
  downloadable boolean NOT NULL DEFAULT false,
  -- Shown to the customer after buying.
  purchase_note text NOT NULL DEFAULT '',
  -- Images after the main one: [{ "id": uuid, "url": text, "caption": text }].
  gallery jsonb NOT NULL DEFAULT '[]',
  upsell_ids uuid[] NOT NULL DEFAULT '{}',
  cross_sell_ids uuid[] NOT NULL DEFAULT '{}',
  featured boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'visible'
    CHECK (visibility IN ('visible', 'catalog', 'search', 'hidden')),
  total_sales integer NOT NULL DEFAULT 0,
  rating numeric(3, 2) NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, entry_id)
);
SELECT cleitext_enable_tenant_rls('products');
CREATE UNIQUE INDEX products_sku ON products (site_id, lower(sku)) WHERE sku <> '';
CREATE INDEX products_status ON products (site_id, status);
CREATE INDEX products_categories ON products USING gin (category_ids);
CREATE INDEX products_brand ON products (site_id, brand_id);
CREATE INDEX products_price ON products (site_id, regular_price);

-- Attributes shared by products (WooCommerce's global attributes): colour,
-- size… with their values. Products may also have attributes of their own.
CREATE TABLE attributes (
  site_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  -- `select` (a list) or `color` (swatches).
  kind text NOT NULL DEFAULT 'select' CHECK (kind IN ('select', 'color')),
  -- Values shown by their position or by name.
  sort text NOT NULL DEFAULT 'position' CHECK (sort IN ('position', 'name')),
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, id),
  UNIQUE (site_id, slug)
);
SELECT cleitext_enable_tenant_rls('attributes');

CREATE TABLE attribute_values (
  site_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  attribute_id uuid NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  -- Swatch of `color` attributes, e.g. #c0392b.
  color text,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, id),
  UNIQUE (site_id, attribute_id, slug),
  FOREIGN KEY (site_id, attribute_id) REFERENCES attributes (site_id, id) ON DELETE CASCADE
);
SELECT cleitext_enable_tenant_rls('attribute_values');

-- The attributes of a product: a shared one (attribute_id) with some of its
-- values, or its own (name and values as text).
CREATE TABLE product_attributes (
  site_id uuid NOT NULL,
  product_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  attribute_id uuid,
  name text NOT NULL DEFAULT '',
  -- Slugs of the shared attribute's values, or the product's own values.
  "values" text[] NOT NULL DEFAULT '{}',
  -- Shown in the product's details.
  visible boolean NOT NULL DEFAULT true,
  -- Combinations of these make the variations.
  variation boolean NOT NULL DEFAULT false,
  PRIMARY KEY (site_id, product_id, position),
  FOREIGN KEY (site_id, product_id) REFERENCES products (site_id, entry_id) ON DELETE CASCADE,
  FOREIGN KEY (site_id, attribute_id) REFERENCES attributes (site_id, id) ON DELETE CASCADE
);
SELECT cleitext_enable_tenant_rls('product_attributes');

-- Variations of variable products: one combination of attribute values
-- ({ "color": "red", "size": "" }, where "" means any value) with its own
-- price, stock and image; empty values fall back to the product's.
CREATE TABLE variations (
  site_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  attributes jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  sku text NOT NULL DEFAULT '',
  gtin text NOT NULL DEFAULT '',
  cost numeric(14, 4),
  regular_price numeric(14, 4),
  sale_price numeric(14, 4),
  sale_from timestamptz,
  sale_to timestamptz,
  manage_stock boolean NOT NULL DEFAULT false,
  stock integer,
  stock_status text NOT NULL DEFAULT 'instock'
    CHECK (stock_status IN ('instock', 'outofstock', 'onbackorder')),
  backorders text NOT NULL DEFAULT 'no' CHECK (backorders IN ('no', 'notify', 'yes')),
  weight numeric(12, 3),
  length numeric(12, 2),
  width numeric(12, 2),
  height numeric(12, 2),
  image_id uuid,
  image_url text,
  description text NOT NULL DEFAULT '',
  PRIMARY KEY (site_id, id),
  FOREIGN KEY (site_id, product_id) REFERENCES products (site_id, entry_id) ON DELETE CASCADE
);
SELECT cleitext_enable_tenant_rls('variations');
CREATE INDEX variations_product ON variations (site_id, product_id, position);
CREATE UNIQUE INDEX variations_sku ON variations (site_id, lower(sku)) WHERE sku <> '';
