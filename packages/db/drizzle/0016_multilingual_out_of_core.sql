-- Multilingual moves to a plugin (M7): the core keeps only the language of
-- each entry, term and menu, and the site's default language.
--
-- 1. Sites that used several languages or linked translations keep that data
--    as "pending language data" (settings namespace `languages`); a language
--    plugin takes it over when it is activated there.
-- 2. The front, posts and error page settings stored a translation group:
--    they now store the id of the page in the site's default language.
-- Tenant tables force Row Level Security, so each site is handled in its context.
DO $$
DECLARE
  site record;
  legacy jsonb;
  setting record;
  page uuid;
BEGIN
  FOR site IN SELECT id, default_locale FROM public.sites LOOP
    PERFORM set_config('app.site_id', site.id::text, true);

    SELECT jsonb_build_object(
      'locales', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'code', l.code, 'name', l.name, 'isDefault', l.is_default,
          'position', l.position, 'urlPrefix', l.url_prefix) ORDER BY l.position, l.code)
        FROM public.site_locales l), '[]'::jsonb),
      'entries', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', e.id, 'group', e.translation_group))
        FROM public.entries e
        WHERE e.translation_group IN (
          SELECT translation_group FROM public.entries GROUP BY translation_group HAVING count(*) > 1)
      ), '[]'::jsonb),
      'terms', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', t.id, 'group', t.translation_group))
        FROM public.terms t
        WHERE t.translation_group IN (
          SELECT translation_group FROM public.terms GROUP BY translation_group HAVING count(*) > 1)
      ), '[]'::jsonb)
    ) INTO legacy;

    IF jsonb_array_length(legacy->'locales') > 1
       OR jsonb_array_length(legacy->'entries') > 0
       OR jsonb_array_length(legacy->'terms') > 0 THEN
      INSERT INTO public.settings (site_id, namespace, key, value)
      VALUES (site.id, 'languages', 'pending', legacy)
      ON CONFLICT (site_id, namespace, key) DO UPDATE SET value = EXCLUDED.value;
    END IF;

    FOR setting IN
      SELECT key, value FROM public.settings
      WHERE namespace = 'core' AND key IN ('frontPage', 'postsPage', 'errorPage')
        AND jsonb_typeof(value) = 'string'
    LOOP
      SELECT e.id INTO page FROM public.entries e
      WHERE e.translation_group = (setting.value #>> '{}')::uuid
      ORDER BY (e.locale = site.default_locale) DESC, e.created_at
      LIMIT 1;
      UPDATE public.settings
      SET value = CASE WHEN page IS NULL THEN 'null'::jsonb ELSE to_jsonb(page::text) END
      WHERE site_id = site.id AND namespace = 'core' AND key = setting.key;
    END LOOP;
  END LOOP;
  PERFORM set_config('app.site_id', '', true);
END
$$;--> statement-breakpoint

-- The default language is no longer checked against a core list of languages:
-- the application validates it (with the language plugin, against its list).
CREATE OR REPLACE FUNCTION cleitext_app_set_default_locale(p_code text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  site uuid := public.cleitext_current_site_id();
BEGIN
  IF site IS NULL THEN
    RAISE EXCEPTION 'No site context';
  END IF;
  IF p_code !~ '^[a-z]{2,3}(-[A-Z]{2})?$' THEN
    RAISE EXCEPTION 'Invalid language code %', p_code;
  END IF;
  UPDATE public.sites SET default_locale = p_code WHERE id = site;
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION cleitext_app_create_site(p_slug text, p_name text, p_host text, p_locale text, p_force_https boolean)
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
  PERFORM public.cleitext_seed_site_defaults(site);
  -- Back to the caller's context (the seed function changes app.site_id).
  PERFORM set_config('app.site_id', '', true);
  PERFORM set_config('app.user_id', coalesce(caller, ''), true);
  RETURN site;
END
$$;--> statement-breakpoint

ALTER TABLE "site_locales" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "site_locales" CASCADE;--> statement-breakpoint
DROP INDEX "entries_translation_group_idx";--> statement-breakpoint
ALTER TABLE "entries" DROP COLUMN "translation_group";--> statement-breakpoint
ALTER TABLE "terms" DROP COLUMN "translation_group";
