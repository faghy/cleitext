-- The sites where each plugin is active, for plugins' scheduled tasks
-- (plugin API 1.18), which run outside any request.
CREATE OR REPLACE FUNCTION cleitext_plugin_sites() RETURNS TABLE (site_id uuid, plugin_slug text)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  s record;
BEGIN
  FOR s IN SELECT id FROM public.sites WHERE status <> 'archived' LOOP
    PERFORM set_config('app.site_id', s.id::text, true);
    RETURN QUERY
      SELECT s.id, sp.plugin_slug FROM public.site_plugins sp
       WHERE sp.site_id = s.id AND sp.active
      UNION
      SELECT s.id, p.slug FROM public.plugins p WHERE p.network OR p.must_use;
  END LOOP;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_plugin_sites() FROM PUBLIC;
