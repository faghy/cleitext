-- Proof of the cookie choices of visitors (GDPR art. 7.1), per site (Row Level Security).
CREATE TABLE consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  -- Random id kept in the visitor's cookie, to find their choices again.
  consent_id text NOT NULL,
  categories text[] NOT NULL,
  -- Version of the banner settings the visitor answered.
  version integer NOT NULL,
  -- The IP with its last part removed, and the browser.
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consents_site_time_idx ON consents (site_id, created_at DESC);
CREATE INDEX consents_site_consent_idx ON consents (site_id, consent_id);
SELECT cleitext_enable_tenant_rls('consents');

-- Requests to export or erase personal data, handled in the admin (accountability, art. 5.2).
CREATE TABLE requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('export', 'erase')),
  email text NOT NULL,
  handled_by text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX requests_site_time_idx ON requests (site_id, created_at DESC);
SELECT cleitext_enable_tenant_rls('requests');
