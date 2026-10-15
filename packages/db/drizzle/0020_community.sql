CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"parent_id" uuid,
	"type" text DEFAULT 'comment' NOT NULL,
	"user_id" uuid,
	"author_name" text NOT NULL,
	"author_email" text DEFAULT '' NOT NULL,
	"author_url" text,
	"content" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notify_replies" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_status_check" CHECK ("comments"."status" in ('pending', 'approved', 'spam', 'trash'))
);
--> statement-breakpoint
CREATE TABLE "entry_likes" (
	"site_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"liker" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_likes_unique" UNIQUE("entry_id","liker")
);
--> statement-breakpoint
ALTER TABLE "user_tokens" DROP CONSTRAINT "user_tokens_kind_check";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_status_check";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "slug" "citext";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "comment_status" text DEFAULT 'closed' NOT NULL;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "comment_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_likes" ADD CONSTRAINT "entry_likes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_likes" ADD CONSTRAINT "entry_likes_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_entry_idx" ON "comments" USING btree ("site_id","entry_id","status","created_at");--> statement-breakpoint
CREATE INDEX "comments_status_idx" ON "comments" USING btree ("site_id","status","created_at");--> statement-breakpoint
CREATE INDEX "comments_email_idx" ON "comments" USING btree ("site_id","author_email");--> statement-breakpoint
CREATE INDEX "entry_likes_site_idx" ON "entry_likes" USING btree ("site_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_kind_check" CHECK ("user_tokens"."kind" in ('password_reset', 'invitation', 'login_2fa', 'email_verify'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'invited', 'suspended', 'pending'));--> statement-breakpoint

-- Comments and likes belong to a site (Row Level Security).
SELECT cleitext_enable_tenant_rls('comments'::regclass);--> statement-breakpoint
SELECT cleitext_enable_tenant_rls('entry_likes'::regclass);--> statement-breakpoint

-- People already here confirmed their address one way or another.
UPDATE users SET email_verified_at = created_at WHERE status = 'active';--> statement-breakpoint

-- Posts take comments, as in WordPress: new sites, existing sites and their posts.
CREATE OR REPLACE FUNCTION cleitext_seed_site_defaults(p_site uuid) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM set_config('app.site_id', p_site::text, true);
  INSERT INTO content_types (id, site_id, slug, name, source, hierarchical, supports, permalink)
  VALUES
    (gen_random_uuid(), p_site, 'page', '{"en": "Pages", "it": "Pagine"}', 'core', true,
     '{title,blocks,revisions,featured_image,parent}', '/{path}'),
    (gen_random_uuid(), p_site, 'article', '{"en": "Posts", "it": "Articoli"}', 'core', false,
     '{title,blocks,revisions,featured_image,excerpt,taxonomies,comments}', '/{year}/{slug}')
  ON CONFLICT ON CONSTRAINT content_types_site_slug_unique DO NOTHING;
  INSERT INTO taxonomies (id, site_id, slug, name, hierarchical, content_types)
  VALUES
    (gen_random_uuid(), p_site, 'category', '{"en": "Categories", "it": "Categorie"}', true, '{article}'),
    (gen_random_uuid(), p_site, 'tag', '{"en": "Tags", "it": "Tag"}', false, '{article}')
  ON CONFLICT ON CONSTRAINT taxonomies_site_slug_unique DO NOTHING;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_seed_site_defaults(uuid) FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE s record;
BEGIN
  FOR s IN SELECT id FROM sites LOOP
    PERFORM set_config('app.site_id', s.id::text, true);
    UPDATE content_types SET supports = array_append(supports, 'comments')
     WHERE site_id = s.id AND slug = 'article' AND NOT ('comments' = ANY (supports));
    UPDATE entries SET comment_status = 'open'
     WHERE site_id = s.id AND type_slug = 'article';
  END LOOP;
  PERFORM set_config('app.site_id', '', true);
END
$$;
--> statement-breakpoint

-- Editors and administrators moderate comments.
UPDATE roles SET capabilities = array_append(capabilities, 'moderate_comments')
 WHERE site_id IS NULL AND slug IN ('administrator', 'editor')
   AND NOT ('moderate_comments' = ANY (capabilities));
--> statement-breakpoint

-- Author pages need an address: existing people get one from their name.
WITH base AS (
  SELECT id,
         coalesce(nullif(trim(BOTH '-' FROM regexp_replace(lower(display_name), '[^a-z0-9]+', '-', 'g')), ''), 'user') AS s,
         created_at
    FROM users WHERE slug IS NULL
), numbered AS (
  SELECT id, s, row_number() OVER (PARTITION BY s ORDER BY created_at, id) AS n FROM base
)
UPDATE users u
   SET slug = CASE WHEN n.n = 1 AND NOT EXISTS (SELECT 1 FROM users x WHERE x.slug = n.s)
                   THEN n.s ELSE n.s || '-' || right(replace(u.id::text, '-', ''), 8) END
  FROM numbered n WHERE n.id = u.id;
--> statement-breakpoint

-- Removes an account that belongs to no site any more (someone leaving the
-- only site they joined). Super admins are never removed this way.
CREATE OR REPLACE FUNCTION cleitext_delete_orphan_user(p_user uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE s record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = p_user) THEN
    RETURN false;
  END IF;
  -- site_members is FORCEd: look in every site's context.
  FOR s IN SELECT id FROM public.sites LOOP
    PERFORM set_config('app.site_id', s.id::text, true);
    IF EXISTS (SELECT 1 FROM public.site_members WHERE site_id = s.id AND user_id = p_user) THEN
      PERFORM set_config('app.site_id', '', true);
      RETURN false;
    END IF;
  END LOOP;
  PERFORM set_config('app.site_id', '', true);
  DELETE FROM public.users WHERE id = p_user;
  RETURN true;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cleitext_delete_orphan_user(uuid) FROM PUBLIC;
