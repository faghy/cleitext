-- Translations of products (with a language plugin): the versions of a
-- product in other languages share a group, and so their prices, codes,
-- stock and variations. A product's group is the entry it was translated
-- from; a variation's is the variation it was copied from. Codes are unique
-- per language; a variation's code is checked by the plugin.
ALTER TABLE products ADD COLUMN group_id uuid;
ALTER TABLE variations ADD COLUMN group_id uuid;
CREATE INDEX products_group ON products (site_id, group_id) WHERE group_id IS NOT NULL;
CREATE INDEX variations_group ON variations (site_id, group_id) WHERE group_id IS NOT NULL;
DROP INDEX products_sku;
CREATE UNIQUE INDEX products_sku ON products (site_id, locale, lower(sku)) WHERE sku <> '';
DROP INDEX variations_sku;
CREATE INDEX variations_sku ON variations (site_id, lower(sku)) WHERE sku <> '';
