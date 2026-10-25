-- Custom fields (plugin API 1.47). Field groups of the site's owners, shown
-- where their location rules match (content type, page template, parent,
-- terms, taxonomy, user role…); values stay in the revisions' fields JSON.
-- Entries get a page template, offered by the theme. Users get fields per
-- site (accounts are shared by sites, field groups are not).
CREATE TABLE "field_groups" (
	"site_id" uuid NOT NULL,
	"key" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_groups_site_id_key_pk" PRIMARY KEY("site_id","key")
);
--> statement-breakpoint
CREATE TABLE "user_fields" (
	"site_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_fields_site_id_user_id_pk" PRIMARY KEY("site_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "field_groups" ADD CONSTRAINT "field_groups_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_fields" ADD CONSTRAINT "user_fields_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_fields" ADD CONSTRAINT "user_fields_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "template" text;--> statement-breakpoint
-- Tenant tables: isolated per site like the others (0001).
SELECT cleitext_enable_tenant_rls('field_groups'::regclass);--> statement-breakpoint
SELECT cleitext_enable_tenant_rls('user_fields'::regclass);
