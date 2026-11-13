-- PDF invoices (Cleishop add-on): one invoice per order, with its number,
-- and the counters of the numbers (one for all, or one per year).

CREATE TABLE invoices (
  site_id uuid NOT NULL,
  order_id uuid NOT NULL,
  -- The number in its counter, and as printed (prefix, padding, suffix).
  number integer NOT NULL,
  counter text NOT NULL,
  formatted text NOT NULL,
  date timestamptz NOT NULL DEFAULT now(),
  -- Imported from another shop (e.g. WooCommerce PDF Invoices), as it was.
  imported boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, order_id)
);
CREATE UNIQUE INDEX invoices_number ON invoices (site_id, counter, number);
SELECT cleitext_enable_tenant_rls('invoices');

CREATE TABLE counters (
  site_id uuid NOT NULL,
  counter text NOT NULL,
  last integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, counter)
);
SELECT cleitext_enable_tenant_rls('counters');
