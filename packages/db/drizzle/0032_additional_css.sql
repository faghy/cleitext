-- Additional CSS (core 0.79): CSS written by the site owner in Customize now
-- belongs to the site (settings namespace `additional-css`, keys `site` and
-- `theme:<slug>`), printed after every theme's CSS. Zenit kept its own
-- "Additional CSS" option among its settings (`customCss`): its value moves
-- here once, for every theme when Zenit is the site's theme (as it was
-- printed), else for Zenit only; Zenit 1.0.x then drops the option.
-- Tenant tables force Row Level Security, so each site is handled in its context.
DO $$
DECLARE
  site record;
  css text;
BEGIN
  FOR site IN SELECT id, theme_slug FROM public.sites LOOP
    PERFORM set_config('app.site_id', site.id::text, true);
    SELECT s.value->>'customCss' INTO css
      FROM public.settings s
      WHERE s.namespace = 'theme:zenit' AND s.key = 'values'
        AND jsonb_typeof(s.value->'customCss') = 'string';
    IF css IS NOT NULL AND btrim(css) <> '' THEN
      INSERT INTO public.settings (site_id, namespace, key, value)
      VALUES (
        site.id,
        'additional-css',
        CASE WHEN site.theme_slug = 'zenit' THEN 'site' ELSE 'theme:zenit' END,
        to_jsonb(css)
      )
      ON CONFLICT (site_id, namespace, key) DO NOTHING;
    END IF;
    UPDATE public.settings SET value = value - 'customCss'
      WHERE namespace = 'theme:zenit' AND key = 'values' AND jsonb_typeof(value) = 'object'
        AND value->'customCss' IS NOT NULL;
  END LOOP;
  PERFORM set_config('app.site_id', '', true);
END
$$;
