-- Online payments (Stripe, PayPal): the provider's reference of the payment
-- under way (a Checkout Session, a PayPal order), and the amounts refunded
-- through the provider.
ALTER TABLE orders ADD COLUMN payment_ref text NOT NULL DEFAULT '';
CREATE INDEX orders_payment_ref ON orders (site_id, payment_ref) WHERE payment_ref <> '';
ALTER TABLE refunds ADD COLUMN gateway_ref text NOT NULL DEFAULT '';
