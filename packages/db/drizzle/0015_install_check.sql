-- Whether a first site exists, for the web installer (RF-SIT-02): the
-- application role cannot read `sites` across tenants.
CREATE FUNCTION cleitext_is_installed()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.sites) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_is_installed() FROM PUBLIC;
