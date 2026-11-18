-- Store 1.6.0: internal and external installations, orders linked to licenses.

-- The address an installation report came from and its reverse DNS name (the
-- server), to tell sites on our own servers from the others.
ALTER TABLE installs ADD COLUMN server_ip text;
ALTER TABLE installs ADD COLUMN server_host text;
-- Marked by hand: true internal, false external, NULL by the list of the settings.
ALTER TABLE installs ADD COLUMN internal boolean;

-- An order of a shop (Cleishop) linked by hand to a license made before it:
-- the order sells no new license, sends no key. `pending` links know the
-- order's number only and are completed when the order reaches the store.
CREATE TABLE order_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  license_id uuid NOT NULL,
  provider text NOT NULL,
  order_number integer,
  order_id text,
  order_ref text,
  status text NOT NULL CHECK (status IN ('pending', 'linked', 'refused')),
  previous_source text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  linked_at timestamptz
);
CREATE INDEX order_links_license_idx ON order_links (site_id, license_id);
CREATE INDEX order_links_order_idx ON order_links (site_id, provider, order_number);
SELECT cleitext_enable_tenant_rls('order_links');
