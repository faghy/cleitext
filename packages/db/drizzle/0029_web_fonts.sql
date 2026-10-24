-- Web fonts kept on the site (Settings → Privacy → Web fonts): the server
-- downloads the Google Fonts and Bunny Fonts stylesheets that pages link,
-- with their font files, once, and serves them at /_fonts/<name>, so that
-- visitors' browsers never reach the font services. Files by content hash;
-- sheets map the hash of a service address to the site's stylesheet.
CREATE TABLE "web_font_files" (
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" bytea NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web_font_files_site_id_name_pk" PRIMARY KEY("site_id","name")
);
--> statement-breakpoint
CREATE TABLE "web_font_sheets" (
	"site_id" uuid NOT NULL,
	"key" text NOT NULL,
	"css" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web_font_sheets_site_id_key_pk" PRIMARY KEY("site_id","key")
);
--> statement-breakpoint
ALTER TABLE "web_font_files" ADD CONSTRAINT "web_font_files_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_font_sheets" ADD CONSTRAINT "web_font_sheets_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Tenant tables: isolated per site like the others (0001).
SELECT cleitext_enable_tenant_rls('web_font_files'::regclass);--> statement-breakpoint
SELECT cleitext_enable_tenant_rls('web_font_sheets'::regclass);
