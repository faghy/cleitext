-- Maintenance mode of the current site from the admin (RF-SIT-06). `sites` is
-- read-only for the application role: the status changes through this
-- function, limited to the site of the transaction (app.site_id), between
-- `active` and `maintenance` only. The server checks that the user may
-- manage the settings.
CREATE FUNCTION cleitext_app_set_site_status(p_status text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  site uuid := public.cleitext_current_site_id();
BEGIN
  IF site IS NULL THEN
    RAISE EXCEPTION 'No site context';
  END IF;
  IF p_status NOT IN ('active', 'maintenance') THEN
    RAISE EXCEPTION 'Invalid status %', p_status USING ERRCODE = '22023';
  END IF;
  UPDATE public.sites SET status = p_status
    WHERE id = site AND status IN ('active', 'maintenance');
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_app_set_site_status(text) FROM PUBLIC;
