-- What a plugin's add-to-cart link said a line is for (Cleishop 1.22), e.g. the
-- license a renewal extends.
ALTER TABLE order_items ADD COLUMN ref text NOT NULL DEFAULT '';
