-- Title and description of a media item, per language like alt and caption
-- (issue #40): WordPress's attachment title and description. The title is
-- rendered as the image's `title` attribute when it is set.
ALTER TABLE "media" ADD COLUMN "title" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "description" jsonb DEFAULT '{}'::jsonb NOT NULL;
