-- Default language of the current site (RF-SET-01). `sites` is read-only for
-- the application role, so the change goes through this function, limited to
-- the site of the transaction (app.site_id) and to an enabled language.
CREATE FUNCTION cleitext_app_set_default_locale(p_code text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  site uuid := public.cleitext_current_site_id();
BEGIN
  IF site IS NULL THEN
    RAISE EXCEPTION 'No site context';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_locales WHERE site_id = site AND code = p_code) THEN
    RAISE EXCEPTION 'Language % is not enabled on this site', p_code;
  END IF;
  UPDATE public.site_locales SET is_default = (code = p_code) WHERE site_id = site;
  UPDATE public.sites SET default_locale = p_code WHERE id = site;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_app_set_default_locale(text) FROM PUBLIC;
-- Executable by the application role: cleitext_grant_app (0004) grants every
-- SECURITY DEFINER cleitext_* function.
