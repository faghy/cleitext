-- Connected AI assistants (MCP): OAuth 2.1 clients registered by the assistants
-- themselves, short-lived authorization codes and refresh tokens. The access
-- tokens are API tokens (api_tokens), so they are listed, scoped and revoked
-- like any other; revoking one also drops its refresh tokens.
CREATE TABLE "oauth_clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL REFERENCES "public"."sites"("id") ON DELETE cascade,
	"client_id" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "oauth_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL REFERENCES "public"."sites"("id") ON DELETE cascade,
	"code_hash" text NOT NULL UNIQUE,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"scopes" text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "oauth_refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL REFERENCES "public"."sites"("id") ON DELETE cascade,
	"token_hash" text NOT NULL UNIQUE,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"api_token_id" uuid NOT NULL REFERENCES "public"."api_tokens"("id") ON DELETE cascade,
	"scopes" text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "oauth_client_id" text;--> statement-breakpoint
SELECT cleitext_enable_tenant_rls(t::regclass)
FROM unnest(ARRAY['oauth_clients', 'oauth_codes', 'oauth_refresh_tokens']) AS t;
