-- Usernames, as in WordPress: an account signs in with its email or its username.
-- Optional and unique (case-insensitive); never contains "@", so a sign-in name
-- with "@" is always an email.
ALTER TABLE "users" ADD COLUMN "username" citext;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE ("username");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_check"
  CHECK ("username" ~ '^[A-Za-z0-9_.-]([A-Za-z0-9_. -]{0,58}[A-Za-z0-9_.-])?$');--> statement-breakpoint
-- The email comes back too: a password reset asked with the username goes to it.
-- Executable again by the application role through cleitext_grant_app after migrating.
DROP FUNCTION cleitext_find_login(text);--> statement-breakpoint
CREATE FUNCTION cleitext_find_login(p_email text)
  RETURNS TABLE (user_id uuid, password_hash text, status text, is_super_admin boolean, email text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT u.id, u.password_hash, u.status,
           EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = u.id),
           u.email::text
    FROM public.users u
    WHERE u.email = p_email::public.citext
       OR (strpos(p_email, '@') = 0 AND u.username = p_email::public.citext)
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_find_login(text) FROM PUBLIC;
