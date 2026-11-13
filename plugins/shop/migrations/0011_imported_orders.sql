-- Orders imported from another shop (Cleishop 1.13, through the `shop` service of
-- plugin API 1.73): the reference in the old shop, so importing again adds only
-- what is new, and its data kept as they were (payment ids, tax details…).

ALTER TABLE orders ADD COLUMN external_ref text;
ALTER TABLE orders ADD COLUMN meta jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX orders_external_ref ON orders (site_id, external_ref) WHERE external_ref IS NOT NULL;
