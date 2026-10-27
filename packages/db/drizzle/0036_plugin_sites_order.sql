-- The sites where each plugin is active, oldest site first (plugin API 1.59):
-- a free plugin limited to one site keeps it on the site that had it first.
CREATE OR REPLACE FUNCTION cleitext_plugin_sites() RETURNS TABLE (site_id uuid, plugin_slug text)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  s record;
BEGIN
  FOR s IN SELECT id FROM public.sites WHERE status <> 'archived' ORDER BY created_at, id LOOP
    PERFORM set_config('app.site_id', s.id::text, true);
    RETURN QUERY
      SELECT s.id, sp.plugin_slug FROM public.site_plugins sp
       WHERE sp.site_id = s.id AND sp.active
      UNION
      SELECT s.id, p.slug FROM public.plugins p WHERE p.network OR p.must_use;
  END LOOP;
END
$$;
