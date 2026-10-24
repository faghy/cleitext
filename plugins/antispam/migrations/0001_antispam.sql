-- Antispam 1.0.0. No visitor address is stored in clear: only salted hashes.

-- The spam queue: form messages kept aside (released with "Not spam"),
-- submissions refused as spam by forms that cannot keep them, and what the
-- plugin knows of the spam comments it flagged (the comments themselves
-- stay in the core). Deleted after the days set in the settings.
CREATE TABLE queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  kind text NOT NULL,
  form text NOT NULL,
  ref text,
  locale text NOT NULL DEFAULT '',
  fields jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  score integer NOT NULL DEFAULT 0,
  reasons text[] NOT NULL DEFAULT '{}',
  ip_hash text,
  fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX queue_site_time_idx ON queue (site_id, created_at DESC);
CREATE INDEX queue_ref_idx ON queue (site_id, ref);
SELECT cleitext_enable_tenant_rls('queue');

-- Fingerprints of texts (salted hashes): how often a text came lately, and
-- what people decided about it (spam or not spam).
CREATE TABLE fingerprints (
  site_id uuid NOT NULL,
  hash text NOT NULL,
  seen integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  spam integer NOT NULL DEFAULT 0,
  ham integer NOT NULL DEFAULT 0,
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, hash)
);
SELECT cleitext_enable_tenant_rls('fingerprints');

-- Senders of spam, as salted hashes of their address, forgotten with the queue.
CREATE TABLE senders (
  site_id uuid NOT NULL,
  hash text NOT NULL,
  spam integer NOT NULL DEFAULT 0,
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, hash)
);
SELECT cleitext_enable_tenant_rls('senders');

-- Blocked submissions per day, outcome and reason, for the statistics.
CREATE TABLE stats (
  site_id uuid NOT NULL,
  day date NOT NULL,
  outcome text NOT NULL,
  reason text NOT NULL,
  n integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, outcome, reason)
);
SELECT cleitext_enable_tenant_rls('stats');
