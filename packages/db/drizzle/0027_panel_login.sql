-- One-time sign-in links of a hosting panel (`cleitext login-link`): a new
-- kind of single-use token, issued by the CLI with the owner connection.
ALTER TABLE "user_tokens" DROP CONSTRAINT "user_tokens_kind_check";--> statement-breakpoint
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_kind_check" CHECK ("user_tokens"."kind" in ('password_reset', 'invitation', 'login_2fa', 'email_verify', 'panel_login'));
