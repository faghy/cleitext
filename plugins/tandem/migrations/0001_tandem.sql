-- Tandem: affiliates, their visits, referrals (commissions) and payouts
-- of a site (Row Level Security). The schema is the plugin's (`plg_<slug>`),
-- so table names need no prefix. Money is in cents.

-- An affiliate is a member of the site with a code. The email is the one of
-- their account when they applied, for the emails and the self-referral check.
CREATE TABLE affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  user_id uuid NOT NULL,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'rejected', 'suspended')),
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  locale text NOT NULL DEFAULT '',
  -- Their own rate (percent or fixed, as the program); null: the program's.
  rate numeric(12, 2),
  website text NOT NULL DEFAULT '',
  promotion text NOT NULL DEFAULT '',
  paypal_email text NOT NULL DEFAULT '',
  iban text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  terms_accepted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX affiliates_user_idx ON affiliates (site_id, user_id);
CREATE UNIQUE INDEX affiliates_code_idx ON affiliates (site_id, code);
CREATE INDEX affiliates_status_idx ON affiliates (site_id, status, created_at);
SELECT cleitext_enable_tenant_rls('affiliates');

-- Visits through an affiliate's link: a count per day, nothing about people.
CREATE TABLE visits (
  site_id uuid NOT NULL,
  affiliate_id uuid NOT NULL REFERENCES affiliates (id) ON DELETE CASCADE,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, affiliate_id, day)
);
SELECT cleitext_enable_tenant_rls('visits');

-- Payouts made by hand (PayPal, bank transfer).
CREATE TABLE payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  affiliate_id uuid NOT NULL REFERENCES affiliates (id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL,
  currency text NOT NULL,
  method text NOT NULL DEFAULT '',
  -- The payment details when it was made (PayPal email or IBAN).
  details text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payouts_affiliate_idx ON payouts (site_id, affiliate_id, paid_at);
SELECT cleitext_enable_tenant_rls('payouts');

-- A commission for a conversion brought by an affiliate, or (kind
-- 'adjustment') a negative one taking back part of a paid commission after
-- a refund. One per conversion: (source, conversion_id) is unique.
CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  affiliate_id uuid NOT NULL REFERENCES affiliates (id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'conversion' CHECK (kind IN ('conversion', 'adjustment')),
  parent_id uuid REFERENCES referrals (id) ON DELETE CASCADE,
  source text NOT NULL,
  conversion_kind text NOT NULL DEFAULT '',
  conversion_id text NOT NULL,
  label text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  amount_cents bigint NOT NULL DEFAULT 0,
  original_cents bigint NOT NULL DEFAULT 0,
  adjusted_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT '',
  conversion_cents bigint NOT NULL DEFAULT 0,
  reversed_cents bigint NOT NULL DEFAULT 0,
  payout_id uuid REFERENCES payouts (id) ON DELETE SET NULL,
  converted_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX referrals_conversion_idx ON referrals (site_id, source, conversion_id)
  WHERE kind = 'conversion';
CREATE INDEX referrals_affiliate_idx ON referrals (site_id, affiliate_id, created_at);
CREATE INDEX referrals_status_idx ON referrals (site_id, status, created_at);
SELECT cleitext_enable_tenant_rls('referrals');

-- Conversions of sources that do not count in the free version, by month:
-- shown in the admin with the invitation to Tandem Pro.
CREATE TABLE missed (
  site_id uuid NOT NULL,
  source text NOT NULL,
  month date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, source, month)
);
SELECT cleitext_enable_tenant_rls('missed');
