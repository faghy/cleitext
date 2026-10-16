-- Refunds of orders, full or partial, with what went back to the stock.
CREATE TABLE refunds (
  site_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL DEFAULT '',
  -- Quantities put back in stock: [{ "item": uuid, "quantity": n }].
  restocked jsonb NOT NULL DEFAULT '[]',
  author text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, id),
  FOREIGN KEY (site_id, order_id) REFERENCES orders (site_id, id) ON DELETE CASCADE
);
SELECT cleitext_enable_tenant_rls('refunds');
CREATE INDEX refunds_order ON refunds (site_id, order_id, created_at);
