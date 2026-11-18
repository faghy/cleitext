-- Deliveries of form messages to webhooks, per site (Row Level Security): the
-- queue (payload kept until the final outcome) and the log of the latest ones.
CREATE TABLE deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  webhook_id text NOT NULL,
  webhook_label text NOT NULL,
  form_name text NOT NULL,
  message_id text,
  -- queued, retrying, sent or failed.
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  next_at timestamptz NOT NULL DEFAULT now(),
  http_status integer,
  error text,
  -- The names of the fields sent, never their values.
  field_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The JSON sent, until the final outcome (a failed one for a few days, to try again).
  payload jsonb,
  -- The visitor's email address in the payload, for privacy requests.
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deliveries_due_idx ON deliveries (site_id, next_at) WHERE status IN ('queued', 'retrying');
CREATE INDEX deliveries_site_time_idx ON deliveries (site_id, created_at DESC);
CREATE INDEX deliveries_email_idx ON deliveries (site_id, email) WHERE email IS NOT NULL;
SELECT cleitext_enable_tenant_rls('deliveries');
