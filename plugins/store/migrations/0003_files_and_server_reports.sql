-- Public downloads of a product (e.g. the Cleitext Toolkit for Plesk): one
-- file per version, served at /downloads/<slug>/<file>. Published files are
-- never replaced: a version is deleted first, then uploaded again.
CREATE TABLE files (
  site_id uuid NOT NULL,
  product_slug text NOT NULL,
  version text NOT NULL,
  filename text NOT NULL,
  sha256 text NOT NULL,
  size integer NOT NULL,
  data bytea NOT NULL,
  downloads integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, product_slug, version)
);
CREATE UNIQUE INDEX files_filename_idx ON files (site_id, filename);
SELECT cleitext_enable_tenant_rls('files');

-- Anonymous reports of servers that run a product (the Toolkit for Plesk,
-- opt-in): a hash that names the server, versions and how many Cleitext
-- installations it manages. No address, domain or IP is kept.
CREATE TABLE server_reports (
  site_id uuid NOT NULL,
  product_slug text NOT NULL,
  server_hash text NOT NULL,
  product_version text NOT NULL,
  panel text NOT NULL,
  panel_version text NOT NULL,
  installations integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, product_slug, server_hash)
);
CREATE INDEX server_reports_seen_idx ON server_reports (site_id, last_seen_at DESC);
SELECT cleitext_enable_tenant_rls('server_reports');
