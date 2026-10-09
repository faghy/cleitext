-- Identity: user context, login lookup, host resolution, default roles.

-- Current authenticated user, or NULL. Set per request together with the site.
CREATE FUNCTION cleitext_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

-- Users: visible when member of the current site, or when it is the current user
-- (a super admin is not necessarily a member of the site being administered).
DROP POLICY users_read ON users;--> statement-breakpoint
DROP POLICY users_update ON users;--> statement-breakpoint
CREATE POLICY users_read ON users FOR SELECT
  USING (
    id = cleitext_current_user_id()
    OR EXISTS (
      SELECT 1 FROM site_members m
      WHERE m.user_id = users.id AND m.site_id = cleitext_current_site_id()
    )
  );--> statement-breakpoint
CREATE POLICY users_update ON users FOR UPDATE
  USING (
    id = cleitext_current_user_id()
    OR EXISTS (
      SELECT 1 FROM site_members m
      WHERE m.user_id = users.id AND m.site_id = cleitext_current_site_id()
    )
  );--> statement-breakpoint

-- Login lookup by email, before any context exists. Returns only what the
-- password check needs.
CREATE FUNCTION cleitext_find_login(p_email text)
  RETURNS TABLE (user_id uuid, password_hash text, status text, is_super_admin boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT u.id, u.password_hash, u.status,
           EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = u.id)
    FROM public.users u
    WHERE u.email = p_email::public.citext
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_find_login(text) FROM PUBLIC;--> statement-breakpoint

-- Full host resolution: site, primary host and HTTPS policy (RF-SIT-04/05).
CREATE FUNCTION cleitext_resolve_host(p_host text)
  RETURNS TABLE (site_id uuid, site_status text, is_primary boolean, force_https boolean, primary_host text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT d.site_id, s.status, d.is_primary, d.force_https,
           (SELECT p.host::text FROM public.site_domains p
             WHERE p.site_id = d.site_id AND p.is_primary
             LIMIT 1)
    FROM public.site_domains d
    JOIN public.sites s ON s.id = d.site_id
    WHERE d.host = p_host::public.citext AND s.status <> 'archived'
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_resolve_host(text) FROM PUBLIC;--> statement-breakpoint

-- Sites the current user can access (all active sites for super admins).
CREATE FUNCTION cleitext_my_sites()
  RETURNS TABLE (site_id uuid, name text, primary_host text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT s.id, s.name,
           (SELECT p.host::text FROM public.site_domains p
             WHERE p.site_id = s.id AND p.is_primary LIMIT 1)
    FROM public.sites s
    WHERE s.status <> 'archived'
      AND (
        EXISTS (SELECT 1 FROM public.super_admins a WHERE a.user_id = cleitext_current_user_id())
        OR EXISTS (SELECT 1 FROM public.site_members m
                   WHERE m.site_id = s.id AND m.user_id = cleitext_current_user_id())
      )
    ORDER BY s.name
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_my_sites() FROM PUBLIC;--> statement-breakpoint

-- A membership may only use a system role or a role of the same site. A plain
-- foreign key cannot express this (system roles have a NULL site_id).
CREATE FUNCTION cleitext_check_member_role() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM roles r
    WHERE r.id = NEW.role_id AND (r.site_id IS NULL OR r.site_id = NEW.site_id)
  ) THEN
    RAISE EXCEPTION 'role % is not available on site %', NEW.role_id, NEW.site_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER site_members_role_check
  BEFORE INSERT OR UPDATE OF role_id, site_id ON site_members
  FOR EACH ROW EXECUTE FUNCTION cleitext_check_member_role();
--> statement-breakpoint

-- Default system roles (docs/SPECIFICATIONS.md §3.1). Mirrors DEFAULT_ROLES in
-- @cleitext/shared; later changes go through new migrations.
INSERT INTO roles (id, site_id, slug, name, capabilities) VALUES
  (gen_random_uuid(), NULL, 'administrator', 'Administrator', ARRAY[
    'read', 'edit_entries', 'delete_entries', 'publish_entries', 'upload_media',
    'manage_menus', 'edit_others_entries', 'publish_others_entries', 'manage_terms',
    'read_private_entries', 'activate_plugins', 'manage_themes', 'edit_theme_settings',
    'manage_users', 'promote_users', 'manage_settings', 'manage_content_types',
    'manage_taxonomies', 'unfiltered_html', 'view_audit_log']),
  (gen_random_uuid(), NULL, 'editor', 'Editor', ARRAY[
    'read', 'edit_entries', 'delete_entries', 'publish_entries', 'upload_media',
    'manage_menus', 'edit_others_entries', 'publish_others_entries', 'manage_terms',
    'read_private_entries']),
  (gen_random_uuid(), NULL, 'author', 'Author', ARRAY[
    'read', 'edit_entries', 'delete_entries', 'publish_entries', 'upload_media']),
  (gen_random_uuid(), NULL, 'contributor', 'Contributor', ARRAY[
    'read', 'edit_entries', 'delete_entries']),
  (gen_random_uuid(), NULL, 'subscriber', 'Subscriber', ARRAY['read'])
ON CONFLICT ON CONSTRAINT roles_site_slug_unique DO NOTHING;
--> statement-breakpoint

-- Application grants: super_admins is read-only; new functions are executable.
CREATE OR REPLACE FUNCTION cleitext_grant_app(app_role name) RETURNS void
  LANGUAGE plpgsql
  AS $$
DECLARE
  t text;
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
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.cleitext_resolve_site(text) TO %I', app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.cleitext_resolve_host(text) TO %I', app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.cleitext_find_login(text) TO %I', app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.cleitext_my_sites() TO %I', app_role);
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') THEN
    EXECUTE format('GRANT USAGE ON SCHEMA drizzle TO %I', app_role);
    EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO %I', app_role);
  END IF;
END
$$;
