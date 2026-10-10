-- Site management from the admin (RF-SIT-03). `sites` and `site_domains` are
-- read-only for the application role: these functions write them, only for
-- super admins (the user of the transaction, app.user_id).

CREATE FUNCTION cleitext_assert_super_admin() RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.super_admins WHERE user_id = public.cleitext_current_user_id()
  ) THEN
    RAISE EXCEPTION 'Only super admins can manage sites' USING ERRCODE = '42501';
  END IF;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_assert_super_admin() FROM PUBLIC;--> statement-breakpoint

CREATE FUNCTION cleitext_app_list_sites()
  RETURNS TABLE (id uuid, slug text, name text, status text, default_locale text, created_at timestamptz, domains jsonb)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  PERFORM public.cleitext_assert_super_admin();
  RETURN QUERY
    SELECT s.id, s.slug, s.name, s.status, s.default_locale, s.created_at,
      coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', d.id, 'host', d.host::text, 'isPrimary', d.is_primary, 'forceHttps', d.force_https)
                         ORDER BY d.is_primary DESC, d.host)
        FROM public.site_domains d WHERE d.site_id = s.id
      ), '[]'::jsonb)
    FROM public.sites s
    ORDER BY s.name;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_app_list_sites() FROM PUBLIC;--> statement-breakpoint

CREATE FUNCTION cleitext_app_create_site(p_slug text, p_name text, p_host text, p_locale text, p_force_https boolean)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  site uuid := gen_random_uuid();
  caller text := current_setting('app.user_id', true);
BEGIN
  PERFORM public.cleitext_assert_super_admin();
  INSERT INTO public.sites (id, slug, name, default_locale) VALUES (site, p_slug, p_name, p_locale);
  INSERT INTO public.site_domains (id, site_id, host, is_primary, force_https)
  VALUES (gen_random_uuid(), site, p_host, true, p_force_https);
  PERFORM set_config('app.site_id', site::text, true);
  INSERT INTO public.site_locales (site_id, code, name, is_default) VALUES (site, p_locale, upper(p_locale), true);
  PERFORM public.cleitext_seed_site_defaults(site);
  -- Back to the caller's context (the seed function changes app.site_id).
  PERFORM set_config('app.site_id', '', true);
  PERFORM set_config('app.user_id', coalesce(caller, ''), true);
  RETURN site;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_app_create_site(text, text, text, text, boolean) FROM PUBLIC;--> statement-breakpoint

CREATE FUNCTION cleitext_app_update_site(p_site uuid, p_name text, p_status text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  PERFORM public.cleitext_assert_super_admin();
  UPDATE public.sites SET name = coalesce(p_name, name), status = coalesce(p_status, status) WHERE id = p_site;
  IF NOT FOUND THEN RAISE EXCEPTION 'Site not found' USING ERRCODE = 'P0002'; END IF;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_app_update_site(uuid, text, text) FROM PUBLIC;--> statement-breakpoint

CREATE FUNCTION cleitext_app_add_domain(p_site uuid, p_host text, p_primary boolean, p_force_https boolean)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  domain uuid := gen_random_uuid();
BEGIN
  PERFORM public.cleitext_assert_super_admin();
  IF p_primary THEN
    UPDATE public.site_domains SET is_primary = false WHERE site_id = p_site;
  END IF;
  INSERT INTO public.site_domains (id, site_id, host, is_primary, force_https)
  VALUES (domain, p_site, p_host, p_primary, p_force_https);
  RETURN domain;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_app_add_domain(uuid, text, boolean, boolean) FROM PUBLIC;--> statement-breakpoint

CREATE FUNCTION cleitext_app_update_domain(p_domain uuid, p_primary boolean, p_force_https boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  site uuid;
BEGIN
  PERFORM public.cleitext_assert_super_admin();
  SELECT site_id INTO site FROM public.site_domains WHERE id = p_domain;
  IF site IS NULL THEN RAISE EXCEPTION 'Domain not found' USING ERRCODE = 'P0002'; END IF;
  IF p_primary THEN
    UPDATE public.site_domains SET is_primary = (id = p_domain) WHERE site_id = site;
  END IF;
  IF p_force_https IS NOT NULL THEN
    UPDATE public.site_domains SET force_https = p_force_https WHERE id = p_domain;
  END IF;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_app_update_domain(uuid, boolean, boolean) FROM PUBLIC;--> statement-breakpoint

CREATE FUNCTION cleitext_app_remove_domain(p_domain uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  PERFORM public.cleitext_assert_super_admin();
  IF EXISTS (SELECT 1 FROM public.site_domains WHERE id = p_domain AND is_primary) THEN
    RAISE EXCEPTION 'Make another domain primary first' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.site_domains WHERE id = p_domain;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_app_remove_domain(uuid) FROM PUBLIC;
