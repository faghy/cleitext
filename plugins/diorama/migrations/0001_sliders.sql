-- The sliders of a site (Row Level Security). The slides, their layers and
-- the settings are one JSON document (`data`), normalized by the plugin;
-- media are kept in it as { id, url } objects, so a site export moves them.
CREATE TABLE sliders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  title text NOT NULL,
  alias text NOT NULL,
  data jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sliders_site_alias_idx ON sliders (site_id, alias);
CREATE INDEX sliders_site_time_idx ON sliders (site_id, created_at);
SELECT cleitext_enable_tenant_rls('sliders');
