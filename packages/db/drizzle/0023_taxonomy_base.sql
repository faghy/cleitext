-- The first part of the addresses of a taxonomy's archives: NULL is the
-- taxonomy's slug (/category/news), '' none (/news, as WordPress sites with
-- the category base stripped), another word replaces it (/topics/news).
ALTER TABLE "taxonomies" ADD COLUMN "base" text;
