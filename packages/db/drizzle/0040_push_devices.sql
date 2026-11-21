-- Push notifications of the official app: the phones of a
-- person on a site, with the Firebase Cloud Messaging token and the events
-- chosen in the app (comment.pending, form.message, shop.order). The site
-- sends the notifications through the relay of cleitext.com, which drops
-- tokens that stopped working; they are then removed here too.
CREATE TABLE "push_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_devices_site_token_unique" UNIQUE("site_id","token"),
	CONSTRAINT "push_devices_platform_check" CHECK ("push_devices"."platform" in ('ios', 'android'))
);
--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_devices_user_idx" ON "push_devices" USING btree ("site_id","user_id");--> statement-breakpoint
-- A tenant table: isolated per site like the others (0001).
SELECT cleitext_enable_tenant_rls('push_devices'::regclass);
