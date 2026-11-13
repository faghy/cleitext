-- WooCommerce Import: what was imported, by its WooCommerce id, so importing
-- again adds only what is new and orders find their customers' accounts.

CREATE TABLE imported (
  site_id uuid NOT NULL,
  -- customer | order
  kind text NOT NULL,
  -- The WooCommerce id (user id or order id).
  ref text NOT NULL,
  -- The Cleitext user (customer) or Cleishop order.
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, kind, ref)
);
SELECT cleitext_enable_tenant_rls('imported');
