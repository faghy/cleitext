ALTER TABLE "plugins" ADD COLUMN "network" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plugins" ADD COLUMN "must_use" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Network activation (RF-PLG-15). `plugins` is read-only for the application
-- role: super admins change the flag through this function.
CREATE FUNCTION cleitext_app_set_plugin_network(p_slug text, p_network boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  PERFORM public.cleitext_assert_super_admin();
  UPDATE public.plugins SET network = p_network WHERE slug = p_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plugin % is not installed', p_slug;
  END IF;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_app_set_plugin_network(text, boolean) FROM PUBLIC;
