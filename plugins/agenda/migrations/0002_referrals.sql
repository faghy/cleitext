-- The referral codes the visitor came with (plugin API 1.58), by the slug
-- of the plugin that captured them: given with the booking's conversion
-- once it is confirmed, e.g. to an affiliate program.
ALTER TABLE appointments ADD COLUMN referrals jsonb NOT NULL DEFAULT '{}';
