-- Texts entered in the admin, in the site's other languages (with a
-- language plugin): { "it": { "name": "Taglia" } }. Without one, the text
-- itself is shown.
ALTER TABLE attributes ADD COLUMN translations jsonb NOT NULL DEFAULT '{}';
ALTER TABLE attribute_values ADD COLUMN translations jsonb NOT NULL DEFAULT '{}';
ALTER TABLE product_attributes ADD COLUMN translations jsonb NOT NULL DEFAULT '{}';
ALTER TABLE shipping_methods ADD COLUMN translations jsonb NOT NULL DEFAULT '{}';
ALTER TABLE tax_rates ADD COLUMN translations jsonb NOT NULL DEFAULT '{}';
