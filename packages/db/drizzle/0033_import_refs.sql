-- What each record of an import became (core 0.82): the source's ref (a
-- WordPress post id) and the entry or media item made of it. Importing the
-- same source again recognises its records by ref, not by title and address:
-- two posts with the same title whose addresses differ only after the 80th
-- character are no longer taken for one.
CREATE TABLE "import_refs" (
	"site_id" uuid NOT NULL,
	"source" text NOT NULL,
	"ref" text NOT NULL,
	"entry_id" uuid,
	"media_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_refs_site_id_source_ref_pk" PRIMARY KEY("site_id","source","ref"),
	CONSTRAINT "import_refs_target_check" CHECK (num_nonnulls("import_refs"."entry_id", "import_refs"."media_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "import_refs" ADD CONSTRAINT "import_refs_entry_fk" FOREIGN KEY ("site_id","entry_id") REFERENCES "public"."entries"("site_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_refs" ADD CONSTRAINT "import_refs_media_fk" FOREIGN KEY ("site_id","media_id") REFERENCES "public"."media"("site_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_refs_entry_idx" ON "import_refs" USING btree ("site_id","entry_id");--> statement-breakpoint
CREATE INDEX "import_refs_media_idx" ON "import_refs" USING btree ("site_id","media_id");--> statement-breakpoint
-- A tenant table: isolated per site like the others (0001).
SELECT cleitext_enable_tenant_rls('import_refs'::regclass);
