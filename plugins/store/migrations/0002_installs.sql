-- What Cleitext sites run, as they report it about once a day: one row per
-- site address, replaced at every report.
CREATE TABLE installs (
  site_id uuid NOT NULL,
  origin text NOT NULL,
  -- The installation (server) the site belongs to: sites of one server share it.
  install_id text NOT NULL,
  core_version text NOT NULL,
  theme_slug text,
  theme_version text,
  -- [{ slug, version, active }]
  plugins jsonb NOT NULL DEFAULT '[]',
  -- [{ slug, version }], installed on the server.
  themes jsonb NOT NULL DEFAULT '[]',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, origin)
);
CREATE INDEX installs_seen_idx ON installs (site_id, last_seen_at DESC);
SELECT cleitext_enable_tenant_rls('installs');
