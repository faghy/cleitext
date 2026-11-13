-- Wishlist (Cleishop add-on): one list per account, or per guest (a cookie
-- token), with the products saved. A guest's list joins the account's at sign-in.

CREATE TABLE lists (
  site_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  -- For a guest's cookie and for the shared link (read-only).
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, id)
);
CREATE UNIQUE INDEX lists_user ON lists (site_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX lists_token ON lists (site_id, token);
SELECT cleitext_enable_tenant_rls('lists');

CREATE TABLE items (
  site_id uuid NOT NULL,
  list_id uuid NOT NULL,
  product_id uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, list_id, product_id)
);
CREATE INDEX items_product ON items (site_id, product_id);
SELECT cleitext_enable_tenant_rls('items');
