-- Reports (Cleishop 1.11): when a customer's account joined the shop (empty
-- for those saved before: their first order stands in), and indexes for the
-- days orders and refunds count on.
ALTER TABLE customers ADD COLUMN created_at timestamptz;
ALTER TABLE customers ALTER COLUMN created_at SET DEFAULT now();
CREATE INDEX orders_counted_at ON orders (site_id, (coalesce(paid_at, created_at)));
CREATE INDEX refunds_created ON refunds (site_id, created_at);
