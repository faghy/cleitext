-- Options pages (plugin API 1.48). Pages of the site's owners, and the values
-- of every options page (owners', plugins', theme's): the default language's
-- values under an empty locale, each other language's translations of
-- translatable fields under its code.
CREATE TABLE "options_pages" (
	"site_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "options_pages_site_id_slug_pk" PRIMARY KEY("site_id","slug")
);
--> statement-breakpoint
CREATE TABLE "option_values" (
	"site_id" uuid NOT NULL,
	"page" text NOT NULL,
	"locale" text DEFAULT '' NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "option_values_site_id_page_locale_pk" PRIMARY KEY("site_id","page","locale")
);
--> statement-breakpoint
ALTER TABLE "options_pages" ADD CONSTRAINT "options_pages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_values" ADD CONSTRAINT "option_values_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Tenant tables: isolated per site like the others (0001).
SELECT cleitext_enable_tenant_rls('options_pages'::regclass);--> statement-breakpoint
SELECT cleitext_enable_tenant_rls('option_values'::regclass);
