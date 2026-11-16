-- Each person can turn off the notification emails (automatic updates,
-- comments, plugins' notices). Account emails (password reset, sign-in codes,
-- address confirmations, invitations) always go.
ALTER TABLE "users" ADD COLUMN "notifications" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
-- Of these addresses, the ones of people who turned the notifications off
-- (across sites, no context needed). Executable by the application role
-- through cleitext_grant_app after migrating.
CREATE FUNCTION cleitext_muted_emails(p_emails text[])
  RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT lower(u.email::text) FROM public.users u
    WHERE NOT u.notifications AND u.email = ANY (p_emails::public.citext[])
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_muted_emails(text[]) FROM PUBLIC;
