ALTER TABLE "taxonomies" ADD COLUMN "source" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "taxonomies" ADD COLUMN "fields_schema" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "terms" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- Categories and tags belong to the core; taxonomies made from the admin are the user's.
CREATE OR REPLACE FUNCTION cleitext_seed_site_defaults(p_site uuid) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM set_config('app.site_id', p_site::text, true);
  INSERT INTO content_types (id, site_id, slug, name, source, hierarchical, supports, permalink)
  VALUES
    (gen_random_uuid(), p_site, 'page', '{"en": "Pages", "it": "Pagine"}', 'core', true,
     '{title,blocks,revisions,featured_image,parent}', '/{path}'),
    (gen_random_uuid(), p_site, 'article', '{"en": "Posts", "it": "Articoli"}', 'core', false,
     '{title,blocks,revisions,featured_image,excerpt,taxonomies,comments}', '/{year}/{slug}')
  ON CONFLICT ON CONSTRAINT content_types_site_slug_unique DO NOTHING;
  INSERT INTO taxonomies (id, site_id, slug, name, source, hierarchical, content_types)
  VALUES
    (gen_random_uuid(), p_site, 'category', '{"en": "Categories", "it": "Categorie"}', 'core', true, '{article}'),
    (gen_random_uuid(), p_site, 'tag', '{"en": "Tags", "it": "Tag"}', 'core', false, '{article}')
  ON CONFLICT ON CONSTRAINT taxonomies_site_slug_unique DO NOTHING;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_seed_site_defaults(uuid) FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE s record;
BEGIN
  FOR s IN SELECT id FROM sites LOOP
    PERFORM set_config('app.site_id', s.id::text, true);
    UPDATE taxonomies SET source = 'core' WHERE site_id = s.id AND slug IN ('category', 'tag');
  END LOOP;
  PERFORM set_config('app.site_id', '', true);
END
$$;
