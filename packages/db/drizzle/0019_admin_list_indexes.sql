-- Orders of the admin lists (RNF-03: p95 < 150 ms with 50,000 entries per site):
-- latest changes (the default), title and publication date; and the latest
-- published entries of the dashboard. The directions and
-- null orders match the ORDER BY of the queries exactly, or PostgreSQL ignores them.
CREATE INDEX "entries_admin_updated_idx" ON "entries" USING btree ("site_id","type_slug","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "entries_admin_title_idx" ON "entries" USING btree ("site_id","type_slug","title","id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "entries_admin_date_idx" ON "entries" USING btree ("site_id","type_slug","published_at" DESC NULLS LAST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "entries_admin_published_idx" ON "entries" USING btree ("site_id","status","published_at" DESC NULLS FIRST);
