-- Copies of the pictures of the feed (posts and profile pictures), served by
-- the site instead of Meta's servers, whose addresses expire. Rows not used
-- by the cached posts any more are deleted after each refresh.
CREATE TABLE images (
  site_id uuid NOT NULL,
  key text NOT NULL,
  mime text NOT NULL,
  bytes bytea NOT NULL,
  size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, key)
);
SELECT cleitext_enable_tenant_rls('images');
