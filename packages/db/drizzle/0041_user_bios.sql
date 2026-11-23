-- The bio of a person in other languages, by locale code (core 0.118):
-- pages in that language show it, else the main bio.
ALTER TABLE "users" ADD COLUMN "bios" jsonb DEFAULT '{}'::jsonb NOT NULL;
