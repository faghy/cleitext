-- How many sites the installation has, for the application role, which sees
-- only the current site in `sites`: on an installation with one site its
-- administrators install plugins and themes (as in WordPress).
CREATE FUNCTION cleitext_app_site_count() RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$ SELECT count(*)::integer FROM public.sites $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_app_site_count() FROM PUBLIC;
-- Executable by the application role: cleitext_grant_app (0004) grants every
-- SECURITY DEFINER cleitext_* function.
