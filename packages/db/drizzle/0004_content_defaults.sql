-- Content: default content types and taxonomies, scheduled publishing.

-- Default content types and taxonomies of a site (RF-CNT-01, RF-TAX-01).
-- Runs in the site's context (tables are FORCEd); idempotent.
CREATE FUNCTION cleitext_seed_site_defaults(p_site uuid) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM set_config('app.site_id', p_site::text, true);
  INSERT INTO content_types (id, site_id, slug, name, source, hierarchical, supports, permalink)
  VALUES
    (gen_random_uuid(), p_site, 'page', '{"en": "Pages", "it": "Pagine"}', 'core', true,
     '{title,blocks,revisions,featured_image,parent}', '/{path}'),
    (gen_random_uuid(), p_site, 'article', '{"en": "Posts", "it": "Articoli"}', 'core', false,
     '{title,blocks,revisions,featured_image,excerpt,taxonomies}', '/{year}/{slug}')
  ON CONFLICT ON CONSTRAINT content_types_site_slug_unique DO NOTHING;
  INSERT INTO taxonomies (id, site_id, slug, name, hierarchical, content_types)
  VALUES
    (gen_random_uuid(), p_site, 'category', '{"en": "Categories", "it": "Categorie"}', true, '{article}'),
    (gen_random_uuid(), p_site, 'tag', '{"en": "Tags", "it": "Tag"}', false, '{article}')
  ON CONFLICT ON CONSTRAINT taxonomies_site_slug_unique DO NOTHING;
END
$$;
--> statement-breakpoint

-- Existing sites get the defaults too.
DO $$
DECLARE s record;
BEGIN
  FOR s IN SELECT id FROM sites LOOP
    PERFORM cleitext_seed_site_defaults(s.id);
  END LOOP;
END
$$;
--> statement-breakpoint

-- Publishes scheduled entries whose time has come, on every site (RF-CNT-08).
-- Called periodically by the server; returns the number of entries published.
CREATE FUNCTION cleitext_publish_due_entries() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  s record;
  total integer := 0;
  n integer;
BEGIN
  -- entries is FORCEd, so even the owner needs a site context: iterate over
  -- sites (not FORCEd) and set it for each one.
  FOR s IN SELECT id FROM public.sites WHERE status <> 'archived' LOOP
    PERFORM set_config('app.site_id', s.id::text, true);
    UPDATE public.entries
       SET status = 'published',
           published_revision_id = current_revision_id,
           published_at = scheduled_at,
           scheduled_at = NULL,
           updated_at = now()
     WHERE site_id = s.id AND status = 'scheduled' AND scheduled_at <= now();
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
  END LOOP;
  PERFORM set_config('app.site_id', '', true);
  RETURN total;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_publish_due_entries() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_seed_site_defaults(uuid) FROM PUBLIC;--> statement-breakpoint

-- Grants: from now on every SECURITY DEFINER function named cleitext_* is
-- executable by the application role, without listing them one by one.
CREATE OR REPLACE FUNCTION cleitext_grant_app(app_role name) RETURNS void
  LANGUAGE plpgsql
  AS $$
DECLARE
  t text;
  f regprocedure;
  read_only text[] := ARRAY['sites', 'site_domains', 'plugins', 'plugin_migrations', 'super_admins'];
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_role);
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    IF t = ANY (read_only) THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM %I', t, app_role);
      EXECUTE format('GRANT SELECT ON public.%I TO %I', t, app_role);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO %I', t, app_role);
    END IF;
  END LOOP;
  EXECUTE format('GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO %I', app_role);
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace
             AND p.proname LIKE 'cleitext\_%' AND p.prosecdef LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, app_role);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') THEN
    EXECUTE format('GRANT USAGE ON SCHEMA drizzle TO %I', app_role);
    EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO %I', app_role);
  END IF;
END
$$;
