-- A translation needs an update when its original changed after it was
-- last saved (like WPML's needs_update).
ALTER TABLE translations ADD COLUMN needs_update boolean NOT NULL DEFAULT false;

-- Site texts in the other languages: title and tagline.
CREATE TABLE strings (
  site_id uuid NOT NULL,
  locale text NOT NULL,
  key text NOT NULL CHECK (key IN ('title', 'tagline')),
  value text NOT NULL,
  PRIMARY KEY (site_id, locale, key)
);
SELECT cleitext_enable_tenant_rls('strings');
