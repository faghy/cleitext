-- Page cache invalidation across processes (docs/ARCHITECTURE.md §15):
-- scheduled publishing, which happens inside the database, notifies the
-- `cleitext_cache` channel for every site where entries were published.
CREATE OR REPLACE FUNCTION cleitext_publish_due_entries() RETURNS integer
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
    IF n > 0 THEN
      PERFORM pg_notify('cleitext_cache', json_build_object('siteId', s.id, 'tags', json_build_array('site'))::text);
    END IF;
    total := total + n;
  END LOOP;
  PERFORM set_config('app.site_id', '', true);
  RETURN total;
END
$$;
