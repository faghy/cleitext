-- Multi-tenant isolation with Row Level Security (see docs/ARCHITECTURE.md §8).
--
-- The application connects with a dedicated role that does NOT own the tables.
-- Each request runs in a transaction that sets `app.site_id` with SET LOCAL
-- (set_config(..., true)); the policies below only expose that site's rows.

-- Current tenant, or NULL when no site context is set. `nullif` matters: once a
-- transaction that used SET LOCAL ends, the setting reverts to '' (not NULL)
-- for the rest of the session, and ''::uuid would raise an error.
CREATE FUNCTION cleitext_current_site_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.site_id', true), '')::uuid $$;
--> statement-breakpoint

-- Enables RLS on a tenant table (one with a `site_id` column) and creates the
-- standard isolation policy. Also used by plugin migrations for their tables.
CREATE FUNCTION cleitext_enable_tenant_rls(tbl regclass, force_rls boolean DEFAULT true)
  RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  IF force_rls THEN
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  END IF;
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s
       USING (site_id = cleitext_current_site_id())
       WITH CHECK (site_id = cleitext_current_site_id())',
    tbl);
END
$$;
--> statement-breakpoint

-- Standard tenant tables. FORCE also applies the policies to the table owner,
-- so a misconfigured deployment that connects as the owner is still isolated.
SELECT cleitext_enable_tenant_rls(t::regclass)
FROM unnest(ARRAY[
  'site_locales', 'site_members', 'api_tokens',
  'content_types', 'entries', 'revisions',
  'taxonomies', 'terms', 'entry_terms',
  'media', 'media_variants',
  'menus', 'menu_items',
  'settings', 'redirects', 'site_plugins', 'audit_log'
]) AS t;
--> statement-breakpoint

-- Roles: system roles (site_id IS NULL) are visible to every site, but the
-- application can only create or modify roles of the current site. Not
-- FORCEd, so that the owner (installer) can create the system roles.
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY roles_read ON roles FOR SELECT
  USING (site_id IS NULL OR site_id = cleitext_current_site_id());--> statement-breakpoint
CREATE POLICY roles_write ON roles FOR ALL
  USING (site_id = cleitext_current_site_id())
  WITH CHECK (site_id = cleitext_current_site_id());--> statement-breakpoint

-- Sites and domains: the application may only see the current site. These two
-- tables are not FORCEd: the owner needs to read them to resolve hosts (below)
-- and to manage sites from the CLI.
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON sites
  USING (id = cleitext_current_site_id())
  WITH CHECK (id = cleitext_current_site_id());--> statement-breakpoint
ALTER TABLE site_domains ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON site_domains
  USING (site_id = cleitext_current_site_id())
  WITH CHECK (site_id = cleitext_current_site_id());--> statement-breakpoint

-- Users are global. The application sees only members of the current site.
-- Not FORCEd, so that the owner (CLI, installer) can manage super admins.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY users_read ON users FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM site_members m
    WHERE m.user_id = users.id AND m.site_id = cleitext_current_site_id()
  ));--> statement-breakpoint
CREATE POLICY users_update ON users FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM site_members m
    WHERE m.user_id = users.id AND m.site_id = cleitext_current_site_id()
  ));--> statement-breakpoint
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (cleitext_current_site_id() IS NOT NULL);--> statement-breakpoint

-- Host → site resolution, callable before any site context exists. Runs with
-- the owner's rights and returns only the site id.
CREATE FUNCTION cleitext_resolve_site(p_host text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT d.site_id
    FROM public.site_domains d
    JOIN public.sites s ON s.id = d.site_id
    WHERE d.host = p_host::public.citext AND s.status <> 'archived'
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_resolve_site(text) FROM PUBLIC;--> statement-breakpoint

-- Grants the application role its privileges. Run by the owner after every
-- migration (new tables are picked up automatically).
CREATE FUNCTION cleitext_grant_app(app_role name) RETURNS void
  LANGUAGE plpgsql
  AS $$
DECLARE
  t text;
  read_only text[] := ARRAY['sites', 'site_domains', 'plugins', 'plugin_migrations'];
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_role);
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    IF t = ANY (read_only) THEN
      EXECUTE format('GRANT SELECT ON public.%I TO %I', t, app_role);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO %I', t, app_role);
    END IF;
  END LOOP;
  EXECUTE format('GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO %I', app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.cleitext_resolve_site(text) TO %I', app_role);
  -- Read access to the migration journal, used by the readiness check.
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') THEN
    EXECUTE format('GRANT USAGE ON SCHEMA drizzle TO %I', app_role);
    EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO %I', app_role);
  END IF;
END
$$;
