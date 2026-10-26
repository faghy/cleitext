-- Old addresses of imported media (core 0.85): import_refs rows whose ref is
-- `path:/wp-content/uploads/2015/07/photo.jpg`, looked up by ref whatever the
-- source, to redirect a request for the old address to the new one.
CREATE INDEX "import_refs_ref_idx" ON "import_refs" USING btree ("site_id","ref");
