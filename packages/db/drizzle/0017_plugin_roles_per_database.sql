-- Plugin roles are cluster-wide, databases are not: two Cleitext installations on
-- one PostgreSQL server both wanted "cleitext_plg_seo", and the second could not
-- use the first one's. The name now carries a tag of the database, and this
-- function is the only place that builds it (CLI and server ask for it).
CREATE OR REPLACE FUNCTION cleitext_plugin_role(p_slug text) RETURNS text
  LANGUAGE sql STABLE
  SET search_path = pg_catalog
  AS $$
    SELECT 'cleitext_plg_' || replace(p_slug, '-', '_') || '_'
      || left(encode(sha256(convert_to(current_database(), 'UTF8')), 'hex'), 8)
  $$;--> statement-breakpoint

-- Roles of plugins installed before: renamed when they belong to this
-- installation (its owner created them, so it holds the ADMIN option).
DO $$
DECLARE
  p record;
  old_name text;
  new_name text;
BEGIN
  FOR p IN SELECT slug FROM public.plugins LOOP
    old_name := 'cleitext_plg_' || replace(p.slug, '-', '_');
    new_name := cleitext_plugin_role(p.slug);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = old_name)
       AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = new_name)
       AND (
         (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
         OR EXISTS (
           SELECT 1 FROM pg_auth_members a
           JOIN pg_roles r ON r.oid = a.roleid
           JOIN pg_roles m ON m.oid = a.member
           WHERE r.rolname = old_name AND m.rolname = current_user AND a.admin_option
         )
       )
    THEN
      EXECUTE format('ALTER ROLE %I RENAME TO %I', old_name, new_name);
    END IF;
  END LOOP;
END $$;
