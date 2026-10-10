CREATE TABLE "entry_locks" (
	"entry_id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry_locks" ADD CONSTRAINT "entry_locks_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_locks" ADD CONSTRAINT "entry_locks_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_locks" ADD CONSTRAINT "entry_locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Tenant table: isolated per site like the others (0001).
SELECT cleitext_enable_tenant_rls('entry_locks'::regclass);
