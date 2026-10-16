-- Carts and orders, per site (Row Level Security).

-- A visitor's cart, found by the SHA-256 of the token in its cookie, or by
-- the signed-in customer. Items: [{ "product": uuid, "variation": uuid|null, "quantity": n }].
CREATE TABLE carts (
  site_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  user_id uuid,
  items jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, id),
  UNIQUE (site_id, token_hash)
);
SELECT cleitext_enable_tenant_rls('carts');
CREATE INDEX carts_user ON carts (site_id, user_id) WHERE user_id IS NOT NULL;

-- Order numbers go up by one per site.
CREATE TABLE counters (
  site_id uuid NOT NULL,
  name text NOT NULL,
  value bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, name)
);
SELECT cleitext_enable_tenant_rls('counters');

CREATE TABLE orders (
  site_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  number bigint NOT NULL,
  -- The secret of the order's public page (order received).
  key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN
    ('draft', 'pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed')),
  locale text NOT NULL DEFAULT 'en',
  currency text NOT NULL,
  prices_include_tax boolean NOT NULL,
  subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  discount_total numeric(14, 2) NOT NULL DEFAULT 0,
  shipping_total numeric(14, 2) NOT NULL DEFAULT 0,
  shipping_tax numeric(14, 2) NOT NULL DEFAULT 0,
  fee_total numeric(14, 2) NOT NULL DEFAULT 0,
  tax_total numeric(14, 2) NOT NULL DEFAULT 0,
  total numeric(14, 2) NOT NULL DEFAULT 0,
  -- Taxes by rate: [{ "rate": 22, "amount": "4.40" }].
  taxes jsonb NOT NULL DEFAULT '[]',
  payment_method text NOT NULL DEFAULT '',
  payment_title text NOT NULL DEFAULT '',
  transaction_id text NOT NULL DEFAULT '',
  shipping_method text NOT NULL DEFAULT '',
  customer_id uuid,
  email text NOT NULL,
  -- { firstName, lastName, company, address1, address2, city, postcode, province, country, phone }.
  billing jsonb NOT NULL,
  shipping jsonb NOT NULL,
  -- Italian invoices: { taxCode, vatNumber, sdi, pec }, or null.
  invoice jsonb,
  customer_note text NOT NULL DEFAULT '',
  ip inet,
  user_agent text,
  -- The stock of the order was reduced (and not given back since).
  stock_reduced boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, id),
  UNIQUE (site_id, number)
);
SELECT cleitext_enable_tenant_rls('orders');
CREATE INDEX orders_status ON orders (site_id, status, created_at DESC);
CREATE INDEX orders_customer ON orders (site_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX orders_email ON orders (site_id, lower(email));

-- What an order holds: products, shipping, fees. Names, codes and prices are
-- copied: the order stays as it was when the product changes.
CREATE TABLE order_items (
  site_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'product' CHECK (kind IN ('product', 'shipping', 'fee')),
  product_id uuid,
  variation_id uuid,
  name text NOT NULL,
  sku text NOT NULL DEFAULT '',
  -- The variation's attributes as shown: [{ "name": "Colour", "value": "Red" }].
  attributes jsonb NOT NULL DEFAULT '[]',
  quantity integer NOT NULL DEFAULT 1,
  -- Without taxes, after discounts.
  subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  total numeric(14, 2) NOT NULL DEFAULT 0,
  tax numeric(14, 2) NOT NULL DEFAULT 0,
  tax_rate numeric(6, 3) NOT NULL DEFAULT 0,
  -- Quantity taken from the stock for this line (0 once given back).
  stock_reduced integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, id),
  FOREIGN KEY (site_id, order_id) REFERENCES orders (site_id, id) ON DELETE CASCADE
);
SELECT cleitext_enable_tenant_rls('order_items');
CREATE INDEX order_items_order ON order_items (site_id, order_id, position);
CREATE INDEX order_items_product ON order_items (site_id, product_id);

-- The history of an order: changes of status, stock, payments, messages to the customer.
CREATE TABLE order_notes (
  site_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  note text NOT NULL,
  -- Sent to the customer (true) or kept for the shop (false).
  customer boolean NOT NULL DEFAULT false,
  author text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, id),
  FOREIGN KEY (site_id, order_id) REFERENCES orders (site_id, id) ON DELETE CASCADE
);
SELECT cleitext_enable_tenant_rls('order_notes');
CREATE INDEX order_notes_order ON order_notes (site_id, order_id, created_at);
