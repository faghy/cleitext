-- Products sold, per site (Row Level Security): one per paid theme.
CREATE TABLE products (
  site_id uuid NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  -- Updates included with a purchase or a renewal.
  updates_months integer NOT NULL DEFAULT 12,
  -- The demo can be downloaded without a license (to try with Live Preview).
  demo boolean NOT NULL DEFAULT true,
  -- Checkout of the renewal; the license id is added as custom data.
  renew_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, slug)
);
SELECT cleitext_enable_tenant_rls('products');

-- What each variant of the payment provider sells.
CREATE TABLE variants (
  site_id uuid NOT NULL,
  provider text NOT NULL,
  variant_id text NOT NULL,
  product_slug text NOT NULL,
  -- Sites per license; 0 for no limit.
  seats integer NOT NULL DEFAULT 1,
  kind text NOT NULL DEFAULT 'new' CHECK (kind IN ('new', 'renewal')),
  PRIMARY KEY (site_id, provider, variant_id)
);
SELECT cleitext_enable_tenant_rls('variants');

-- Keys are kept only as SHA-256: they are shown once, then emailed.
CREATE TABLE licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  key_hash text NOT NULL,
  key_hint text NOT NULL,
  product_slug text NOT NULL,
  email text NOT NULL,
  seats integer NOT NULL DEFAULT 1,
  -- Versions released until then can be downloaded; null for no end.
  updates_until timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  source text NOT NULL DEFAULT 'manual',
  order_ref text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX licenses_key_idx ON licenses (site_id, key_hash);
CREATE UNIQUE INDEX licenses_order_idx ON licenses (site_id, source, order_ref)
  WHERE order_ref IS NOT NULL;
CREATE INDEX licenses_email_idx ON licenses (site_id, email);
SELECT cleitext_enable_tenant_rls('licenses');

-- Sites using a license. Deactivated ones stay, as a log.
CREATE TABLE activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  license_id uuid NOT NULL REFERENCES licenses (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  site_origin text NOT NULL,
  client_site_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz
);
CREATE UNIQUE INDEX activations_token_idx ON activations (site_id, token_hash);
CREATE INDEX activations_license_idx ON activations (license_id);
SELECT cleitext_enable_tenant_rls('activations');

-- Download addresses given out, demos included.
CREATE TABLE downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  product_slug text NOT NULL,
  version text NOT NULL,
  license_id uuid,
  site_origin text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX downloads_site_time_idx ON downloads (site_id, created_at DESC);
SELECT cleitext_enable_tenant_rls('downloads');
