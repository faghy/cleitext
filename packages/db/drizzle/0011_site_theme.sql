-- Theme of the current site (RF-THM-01). `sites` is read-only for the
-- application role: activation goes through this function, limited to the
-- site of the transaction (app.site_id). The server checks that the theme is
-- installed and that the user may manage themes.
CREATE FUNCTION cleitext_app_set_theme(p_theme text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  site uuid := public.cleitext_current_site_id();
BEGIN
  IF site IS NULL THEN
    RAISE EXCEPTION 'No site context';
  END IF;
  IF p_theme !~ '^[a-z0-9][a-z0-9-]{0,62}$' THEN
    RAISE EXCEPTION 'Invalid theme slug %', p_theme;
  END IF;
  UPDATE public.sites SET theme_slug = p_theme WHERE id = site;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_app_set_theme(text) FROM PUBLIC;
