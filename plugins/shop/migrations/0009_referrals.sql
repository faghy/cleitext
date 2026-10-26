-- The referral codes the customer came with (plugin API 1.58), by the slug
-- of the plugin that captured them: given with the order's conversion
-- when it is paid, e.g. to an affiliate program.
ALTER TABLE orders ADD COLUMN referrals jsonb NOT NULL DEFAULT '{}';
