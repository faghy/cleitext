-- Shipping zones and their methods, tax rates and coupons.

-- Zones by position; methods with no zone belong to "everywhere else".
CREATE TABLE shipping_zones (
  site_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  -- [{ "country": "IT", "province": "MI" }]
  regions jsonb NOT NULL DEFAULT '[]',
  -- ["20*", "00118...00199"]
  postcodes jsonb NOT NULL DEFAULT '[]',
  PRIMARY KEY (site_id, id)
);
SELECT cleitext_enable_tenant_rls('shipping_zones');

CREATE TABLE shipping_methods (
  site_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  zone_id uuid,
  position integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  taxable boolean NOT NULL DEFAULT true,
  -- { "kind": "flat" | "free" | "pickup" | "weight", ... } (src/shipping.ts)
  settings jsonb NOT NULL,
  PRIMARY KEY (site_id, id),
  FOREIGN KEY (site_id, zone_id) REFERENCES shipping_zones (site_id, id) ON DELETE CASCADE
);
SELECT cleitext_enable_tenant_rls('shipping_methods');
CREATE INDEX shipping_methods_zone ON shipping_methods (site_id, zone_id, position);

CREATE TABLE tax_rates (
  site_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  -- '' for any country.
  country text NOT NULL DEFAULT '',
  province text NOT NULL DEFAULT '',
  tax_class text NOT NULL DEFAULT '',
  rate numeric(6, 3) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  name text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, id)
);
SELECT cleitext_enable_tenant_rls('tax_rates');

CREATE TABLE coupons (
  site_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  -- Lower case.
  code text NOT NULL,
  kind text NOT NULL DEFAULT 'percent',
  amount numeric(14, 2) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  usage_limit integer,
  usage_count integer NOT NULL DEFAULT 0,
  -- The rest of src/coupons.ts's input: restrictions and limits.
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, id)
);
SELECT cleitext_enable_tenant_rls('coupons');
CREATE UNIQUE INDEX coupons_code ON coupons (site_id, code);

-- Who used a coupon, for the limits per customer.
CREATE TABLE coupon_uses (
  site_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL,
  order_id uuid NOT NULL,
  email text NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, id),
  FOREIGN KEY (site_id, coupon_id) REFERENCES coupons (site_id, id) ON DELETE CASCADE,
  FOREIGN KEY (site_id, order_id) REFERENCES orders (site_id, id) ON DELETE CASCADE
);
SELECT cleitext_enable_tenant_rls('coupon_uses');
CREATE INDEX coupon_uses_coupon ON coupon_uses (site_id, coupon_id, email);

-- Codes on a cart; on an order, with what each took off: [{ "code": "x", "discount": "5.00" }].
ALTER TABLE carts ADD COLUMN coupons jsonb NOT NULL DEFAULT '[]';
ALTER TABLE orders ADD COLUMN coupons jsonb NOT NULL DEFAULT '[]';
-- The rate chosen at checkout: "<method id>", and its title in shipping_method.
ALTER TABLE orders ADD COLUMN shipping_rate text NOT NULL DEFAULT '';
-- The tax of a line before its discount (with `subtotal`, the line as listed).
ALTER TABLE order_items ADD COLUMN subtotal_tax numeric(14, 2) NOT NULL DEFAULT 0;
