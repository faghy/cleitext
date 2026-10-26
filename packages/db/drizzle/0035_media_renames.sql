-- Media files given another name by `cleitext media:rename-imported` (core
-- 0.86): a request for the old /media/<old_key> whose file is gone answers
-- 301 to /media/<new_key>. The old file is kept until delete_after, then
-- removed by `cleitext media:purge-renamed` (purged_at); the row stays, so
-- the redirect keeps working.
CREATE TABLE "media_renames" (
	"site_id" uuid NOT NULL,
	"old_key" text NOT NULL,
	"new_key" text NOT NULL,
	"media_id" uuid,
	"delete_after" timestamp with time zone NOT NULL,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_renames_site_id_old_key_pk" PRIMARY KEY("site_id","old_key")
);
--> statement-breakpoint
ALTER TABLE "media_renames" ADD CONSTRAINT "media_renames_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_renames_purge_idx" ON "media_renames" USING btree ("site_id","delete_after") WHERE "purged_at" IS NULL;--> statement-breakpoint
-- A tenant table: isolated per site like the others (0001).
SELECT cleitext_enable_tenant_rls('media_renames'::regclass);
