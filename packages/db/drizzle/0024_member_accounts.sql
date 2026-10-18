-- How far an account reaches beyond the current site, for administrators
-- editing members' accounts (RF-USR-10): accounts are global, so a site's
-- administrator may change them only when they belong to that site alone
-- and are not super admins. Memberships of other sites are hidden by RLS
-- (forced on the owner too): each site is looked at in its own context, and
-- only the counts come back.
CREATE FUNCTION cleitext_app_account_reach(p_user uuid)
  RETURNS TABLE (other_sites integer, is_super_admin boolean)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  current_site uuid := public.cleitext_current_site_id();
  found integer := 0;
  s record;
BEGIN
  FOR s IN SELECT id FROM public.sites WHERE id IS DISTINCT FROM current_site LOOP
    PERFORM set_config('app.site_id', s.id::text, true);
    IF EXISTS (SELECT 1 FROM public.site_members m WHERE m.user_id = p_user AND m.site_id = s.id) THEN
      found := found + 1;
    END IF;
  END LOOP;
  PERFORM set_config('app.site_id', coalesce(current_site::text, ''), true);
  other_sites := found;
  is_super_admin := EXISTS (SELECT 1 FROM public.super_admins a WHERE a.user_id = p_user);
  RETURN NEXT;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_app_account_reach(uuid) FROM PUBLIC;
