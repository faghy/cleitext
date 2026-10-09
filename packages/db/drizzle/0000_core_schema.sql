-- Trusted extensions: the database owner can create them without superuser rights (PostgreSQL 13+).
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "site_domains" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"host" "citext" NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"force_https" boolean DEFAULT true NOT NULL,
	CONSTRAINT "site_domains_host_unique" UNIQUE("host")
);
--> statement-breakpoint
CREATE TABLE "site_locales" (
	"site_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"url_prefix" text,
	CONSTRAINT "site_locales_site_id_code_pk" PRIMARY KEY("site_id","code")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"default_locale" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"theme_slug" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_slug_unique" UNIQUE("slug"),
	CONSTRAINT "sites_status_check" CHECK ("sites"."status" in ('active', 'maintenance', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"capabilities" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "roles_site_slug_unique" UNIQUE NULLS NOT DISTINCT("site_id","slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_members" (
	"site_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "site_members_site_id_user_id_pk" PRIMARY KEY("site_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text,
	"status" text DEFAULT 'active' NOT NULL,
	"totp_secret" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'invited', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "content_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"source" text DEFAULT 'core' NOT NULL,
	"hierarchical" boolean DEFAULT false NOT NULL,
	"supports" text[] DEFAULT '{title,blocks,revisions}'::text[] NOT NULL,
	"fields_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"permalink" text DEFAULT '/{slug}' NOT NULL,
	CONSTRAINT "content_types_site_slug_unique" UNIQUE("site_id","slug")
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"type_slug" text NOT NULL,
	"locale" text NOT NULL,
	"translation_group" uuid NOT NULL,
	"parent_id" uuid,
	"slug" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"author_id" uuid,
	"current_revision_id" uuid,
	"published_revision_id" uuid,
	"published_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"search" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trashed_at" timestamp with time zone,
	CONSTRAINT "entries_site_id_unique" UNIQUE("site_id","id"),
	CONSTRAINT "entries_site_type_locale_slug_unique" UNIQUE("site_id","type_slug","locale","slug"),
	CONSTRAINT "entries_status_check" CHECK ("entries"."status" in ('draft', 'pending', 'scheduled', 'published', 'private', 'trashed'))
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"kind" text DEFAULT 'manual' NOT NULL,
	"title" text NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"document" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revisions_site_id_unique" UNIQUE("site_id","id"),
	CONSTRAINT "revisions_kind_check" CHECK ("revisions"."kind" in ('manual', 'autosave', 'import', 'restore'))
);
--> statement-breakpoint
CREATE TABLE "entry_terms" (
	"site_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "entry_terms_entry_id_term_id_pk" PRIMARY KEY("entry_id","term_id")
);
--> statement-breakpoint
CREATE TABLE "taxonomies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"hierarchical" boolean DEFAULT false NOT NULL,
	"content_types" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "taxonomies_site_id_unique" UNIQUE("site_id","id"),
	CONSTRAINT "taxonomies_site_slug_unique" UNIQUE("site_id","slug")
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"taxonomy_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"translation_group" uuid NOT NULL,
	"parent_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "terms_site_id_unique" UNIQUE("site_id","id"),
	CONSTRAINT "terms_taxonomy_locale_slug_unique" UNIQUE("taxonomy_id","locale","slug")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"checksum" text NOT NULL,
	"alt" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"caption" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"focal_point" jsonb,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_site_id_unique" UNIQUE("site_id","id")
);
--> statement-breakpoint
CREATE TABLE "media_variants" (
	"site_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"variant" text NOT NULL,
	"format" text NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"size_bytes" bigint NOT NULL,
	CONSTRAINT "media_variants_media_id_variant_format_pk" PRIMARY KEY("media_id","variant","format")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"menu_id" uuid NOT NULL,
	"parent_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"entry_id" uuid,
	"term_id" uuid,
	"url" text,
	"label" text,
	"target" text,
	"attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "menu_items_site_id_unique" UNIQUE("site_id","id"),
	CONSTRAINT "menu_items_kind_check" CHECK ("menu_items"."kind" in ('entry', 'term', 'url', 'custom'))
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"locale" text NOT NULL,
	"location" text,
	CONSTRAINT "menus_site_id_unique" UNIQUE("site_id","id"),
	CONSTRAINT "menus_site_slug_locale_unique" UNIQUE("site_id","slug","locale")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"site_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_migrations" (
	"plugin_slug" text NOT NULL,
	"migration" text NOT NULL,
	"checksum" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_migrations_plugin_slug_migration_pk" PRIMARY KEY("plugin_slug","migration")
);
--> statement-breakpoint
CREATE TABLE "plugins" (
	"slug" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"api_version" text NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"manifest" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"from_path" text NOT NULL,
	"to_path" text NOT NULL,
	"status" integer DEFAULT 301 NOT NULL,
	"hits" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "redirects_site_from_unique" UNIQUE("site_id","from_path"),
	CONSTRAINT "redirects_status_check" CHECK ("redirects"."status" in (301, 302, 307, 308, 410))
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"site_id" uuid NOT NULL,
	"namespace" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "settings_site_id_namespace_key_pk" PRIMARY KEY("site_id","namespace","key")
);
--> statement-breakpoint
CREATE TABLE "site_plugins" (
	"site_id" uuid NOT NULL,
	"plugin_slug" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp with time zone,
	CONSTRAINT "site_plugins_site_id_plugin_slug_pk" PRIMARY KEY("site_id","plugin_slug")
);
--> statement-breakpoint
ALTER TABLE "site_domains" ADD CONSTRAINT "site_domains_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_locales" ADD CONSTRAINT "site_locales_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_members" ADD CONSTRAINT "site_members_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_members" ADD CONSTRAINT "site_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_members" ADD CONSTRAINT "site_members_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_types" ADD CONSTRAINT "content_types_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_type_fk" FOREIGN KEY ("site_id","type_slug") REFERENCES "public"."content_types"("site_id","slug") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_parent_fk" FOREIGN KEY ("site_id","parent_id") REFERENCES "public"."entries"("site_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_entry_fk" FOREIGN KEY ("site_id","entry_id") REFERENCES "public"."entries"("site_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_terms" ADD CONSTRAINT "entry_terms_entry_fk" FOREIGN KEY ("site_id","entry_id") REFERENCES "public"."entries"("site_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_terms" ADD CONSTRAINT "entry_terms_term_fk" FOREIGN KEY ("site_id","term_id") REFERENCES "public"."terms"("site_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomies" ADD CONSTRAINT "taxonomies_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_taxonomy_fk" FOREIGN KEY ("site_id","taxonomy_id") REFERENCES "public"."taxonomies"("site_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_parent_fk" FOREIGN KEY ("site_id","parent_id") REFERENCES "public"."terms"("site_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_media_fk" FOREIGN KEY ("site_id","media_id") REFERENCES "public"."media"("site_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_fk" FOREIGN KEY ("site_id","menu_id") REFERENCES "public"."menus"("site_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_parent_fk" FOREIGN KEY ("site_id","parent_id") REFERENCES "public"."menu_items"("site_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_entry_fk" FOREIGN KEY ("site_id","entry_id") REFERENCES "public"."entries"("site_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_term_fk" FOREIGN KEY ("site_id","term_id") REFERENCES "public"."terms"("site_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirects" ADD CONSTRAINT "redirects_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_plugins" ADD CONSTRAINT "site_plugins_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_plugins" ADD CONSTRAINT "site_plugins_plugin_slug_plugins_slug_fk" FOREIGN KEY ("plugin_slug") REFERENCES "public"."plugins"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_list_idx" ON "entries" USING btree ("site_id","type_slug","status","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entries_translation_group_idx" ON "entries" USING btree ("translation_group");--> statement-breakpoint
CREATE INDEX "entries_search_idx" ON "entries" USING gin ("search");--> statement-breakpoint
CREATE INDEX "revisions_entry_idx" ON "revisions" USING btree ("entry_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_site_time_idx" ON "audit_log" USING btree ("site_id","created_at" DESC NULLS LAST);