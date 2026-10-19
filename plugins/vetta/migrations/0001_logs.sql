-- Pages not found: one row per address, with the number of visits (Row Level Security).
CREATE TABLE not_found (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  path text NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  referrer text,
  user_agent text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, path)
);
CREATE INDEX not_found_site_seen_idx ON not_found (site_id, last_seen DESC);
SELECT cleitext_enable_tenant_rls('not_found');

-- Addresses sent to search engines with IndexNow, newest first (the last 100 per site).
CREATE TABLE indexnow_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  urls text[] NOT NULL,
  status integer NOT NULL,
  manual boolean NOT NULL DEFAULT false,
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX indexnow_log_site_time_idx ON indexnow_log (site_id, created_at DESC);
SELECT cleitext_enable_tenant_rls('indexnow_log');
