-- NewLetter: the log of subscriptions of a site (Row Level Security).
-- No email or IP address in clear: keyed hashes, and a hint such as m•••@e•••.com.
-- Table names start with the plugin's TABLE_PREFIX (src/config.ts).

CREATE TABLE newletter_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- The signup form, or the plugin of a "subscribe me" box: forms, shop, agenda.
  source text NOT NULL,
  provider text NOT NULL,
  -- queued, subscribed, pending, already, error, spam
  status text NOT NULL,
  error text,
  email_hash text NOT NULL,
  email_hint text NOT NULL,
  list_ids text[] NOT NULL DEFAULT '{}',
  locale text NOT NULL DEFAULT '',
  -- { at, text, ipHash, source, page? }
  consent jsonb,
  notes text
);
CREATE INDEX newletter_log_site_idx ON newletter_log (site_id, created_at DESC);
CREATE INDEX newletter_log_email_idx ON newletter_log (site_id, email_hash);
SELECT cleitext_enable_tenant_rls('newletter_log');
