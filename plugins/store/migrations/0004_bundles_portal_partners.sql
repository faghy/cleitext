-- Store 1.4.0: bundles (agency licenses), the customer portal and partners.

-- A bundle is a product whose licenses are valid for other products: those in
-- `covers`, or every product that is not a bundle when `covers` is NULL.
ALTER TABLE products ADD COLUMN bundle boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN covers text[];
-- Free products (public downloads only, such as the Toolkit for Plesk) are
-- never part of "every product".
ALTER TABLE products ADD COLUMN free boolean NOT NULL DEFAULT false;
-- List price, for the record (manual licenses of partners show the discount).
ALTER TABLE products ADD COLUMN price_cents integer;
ALTER TABLE products ADD COLUMN currency text NOT NULL DEFAULT 'EUR';

-- The agency that manages a license, when it is not the customer (`email`).
ALTER TABLE licenses ADD COLUMN owner_email text;
-- What was charged, for the record: list price, partner discount, price.
ALTER TABLE licenses ADD COLUMN list_price_cents integer;
ALTER TABLE licenses ADD COLUMN discount_percent integer;
ALTER TABLE licenses ADD COLUMN price_cents integer;
ALTER TABLE licenses ADD COLUMN currency text;
-- The key encrypted (AES-256-GCM) with a secret of the store, so the portal
-- can show it again. Licenses made before 1.4.0 have none.
ALTER TABLE licenses ADD COLUMN key_sealed text;
CREATE INDEX licenses_owner_idx ON licenses (site_id, owner_email);

-- The product an activation is for (bundles: one per product and site).
-- NULL for activations made before 1.4.0: the license's own product.
ALTER TABLE activations ADD COLUMN product_slug text;

-- Agencies and resellers: a discount on list prices, for the record.
CREATE TABLE partners (
  site_id uuid NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  discount_percent integer NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  -- The partner's code for Lemon Squeezy checkouts (custom data `partner`).
  code text,
  -- The Lemon Squeezy discount code given to the partner, for reference.
  ls_discount_code text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, email)
);
CREATE UNIQUE INDEX partners_code_idx ON partners (site_id, code) WHERE code IS NOT NULL;
SELECT cleitext_enable_tenant_rls('partners');

-- Sign-in links of the customer portal and its sessions, as SHA-256.
CREATE TABLE portal_tokens (
  site_id uuid NOT NULL,
  token_hash text NOT NULL,
  email text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('link', 'session')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, token_hash)
);
CREATE INDEX portal_tokens_expiry_idx ON portal_tokens (site_id, expires_at);
SELECT cleitext_enable_tenant_rls('portal_tokens');
