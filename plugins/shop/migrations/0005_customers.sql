-- Customers with an account: their addresses, filled in at checkout.
CREATE TABLE customers (
  site_id uuid NOT NULL,
  user_id uuid NOT NULL,
  email text NOT NULL DEFAULT '',
  billing jsonb,
  shipping jsonb,
  invoice jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, user_id)
);
SELECT cleitext_enable_tenant_rls('customers');
