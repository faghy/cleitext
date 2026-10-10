ALTER TABLE "revisions" ADD COLUMN "excerpt" text;--> statement-breakpoint
ALTER TABLE "revisions" ADD COLUMN "featured_media_id" uuid;--> statement-breakpoint
-- The featured image belongs to the same site; deleting it only clears the reference.
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_featured_media_fk"
  FOREIGN KEY ("site_id", "featured_media_id") REFERENCES "media" ("site_id", "id")
  ON DELETE SET NULL ("featured_media_id");--> statement-breakpoint

-- Empties the trash (RF-CNT-14): entries trashed more than `trashDays` days
-- ago (core setting, default 30; 0 keeps them forever), on every site.
CREATE OR REPLACE FUNCTION cleitext_purge_trash() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  s record;
  days integer;
  total integer := 0;
  n integer;
BEGIN
  FOR s IN SELECT id FROM public.sites WHERE status <> 'archived' LOOP
    PERFORM set_config('app.site_id', s.id::text, true);
    SELECT CASE WHEN jsonb_typeof(value) = 'number' THEN value::text::integer END
      INTO days
      FROM public.settings
     WHERE site_id = s.id AND namespace = 'core' AND key = 'trashDays';
    days := coalesce(days, 30);
    CONTINUE WHEN days <= 0;
    -- Children of purged entries are kept, without a parent.
    UPDATE public.entries SET parent_id = NULL
     WHERE site_id = s.id AND parent_id IN (
       SELECT id FROM public.entries
        WHERE site_id = s.id AND status = 'trashed' AND trashed_at < now() - make_interval(days => days));
    DELETE FROM public.entries
     WHERE site_id = s.id AND status = 'trashed' AND trashed_at < now() - make_interval(days => days);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
  END LOOP;
  PERFORM set_config('app.site_id', '', true);
  RETURN total;
END
$$;
