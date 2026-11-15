-- A product's sales counted by the shop it was imported from (WooCommerce's
-- total_sales): best sellers add them to Cleishop's own sales.
ALTER TABLE products ADD COLUMN imported_sales integer NOT NULL DEFAULT 0;
