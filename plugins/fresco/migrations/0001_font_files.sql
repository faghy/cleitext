-- Google Fonts kept on the site (Site settings → Global fonts → Google Fonts,
-- "Host on this site"): the stylesheet of each family, rewritten to the
-- site's copies, and its font files, served at /_fresco/gfonts/<name>.
-- Names are hashes: the same file is kept once per site.
CREATE TABLE font_files (
  site_id uuid NOT NULL,
  name text NOT NULL,
  mime text NOT NULL,
  bytes bytea NOT NULL,
  size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, name)
);
SELECT cleitext_enable_tenant_rls('font_files');
