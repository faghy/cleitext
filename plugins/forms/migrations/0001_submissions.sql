-- Messages sent with the contact form, per site (Row Level Security).
CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  form_name text NOT NULL,
  page_path text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX submissions_site_time_idx ON submissions (site_id, created_at DESC);
SELECT cleitext_enable_tenant_rls('submissions');
