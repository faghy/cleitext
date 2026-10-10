-- Languages of each site, besides its default one (kept by the core).
CREATE TABLE languages (
  site_id uuid NOT NULL,
  code text NOT NULL CHECK (code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  name text NOT NULL,
  -- Address prefix, e.g. /en; the code when null. The default language has none.
  url_prefix text CHECK (url_prefix ~ '^/[a-z0-9-]{1,20}$'),
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, code)
);
SELECT cleitext_enable_tenant_rls('languages');

-- Items that translate each other share a group, with one item per language
-- (like WPML's icl_translations). Entries and terms keep their own language
-- in the core; it is repeated here to keep the rule "one per language".
CREATE TABLE translations (
  site_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('entry', 'term')),
  element_id uuid NOT NULL,
  group_id uuid NOT NULL,
  locale text NOT NULL,
  -- Language it was translated from (null for the original).
  source_locale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, kind, element_id),
  UNIQUE (site_id, kind, group_id, locale)
);
CREATE INDEX translations_group_idx ON translations (site_id, kind, group_id);
SELECT cleitext_enable_tenant_rls('translations');
