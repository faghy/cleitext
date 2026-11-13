-- A product's manual order (WordPress's menu_order) and short description,
-- copied from its entry (plugin API 1.74): the catalog may be sorted by the
-- first and its cards may show the second.
ALTER TABLE products ADD COLUMN position integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN excerpt text NOT NULL DEFAULT '';
