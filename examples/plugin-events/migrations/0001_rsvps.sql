-- RSVPs to events. Rows belong to a site (Row Level Security).
CREATE TABLE rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  event_id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, event_id, email)
);
CREATE INDEX rsvps_event_idx ON rsvps (site_id, event_id);
SELECT cleitext_enable_tenant_rls('rsvps');
