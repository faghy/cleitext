-- Agenda: services, exceptions and appointments of a site (Row Level Security).
-- The schema is the plugin's (`plg_<slug>`), so table names need no prefix.

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'archived')),
  position integer NOT NULL DEFAULT 0,
  -- Everything else (durations, schedule, fields, translations), normalized by the plugin.
  data jsonb NOT NULL,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX services_site_idx ON services (site_id, position);
CREATE UNIQUE INDEX services_external_idx ON services (site_id, external_id) WHERE external_id IS NOT NULL;
SELECT cleitext_enable_tenant_rls('services');

-- Closures and days with other hours, for one service or (service_id NULL) all.
CREATE TABLE exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  service_id uuid REFERENCES services (id) ON DELETE CASCADE,
  date_from date NOT NULL,
  date_to date NOT NULL,
  closed boolean NOT NULL DEFAULT true,
  hours jsonb NOT NULL DEFAULT '{}',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from)
);
CREATE INDEX exceptions_site_idx ON exceptions (site_id, date_to);
SELECT cleitext_enable_tenant_rls('exceptions');

-- Appointments. Never deleted: cancelled ones stay, and personal data are
-- erased (anonymized_at) after the retention period or on request.
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  service_id uuid NOT NULL REFERENCES services (id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  -- The service's buffers when it was booked, so later changes do not move it.
  buffer_before integer NOT NULL DEFAULT 0,
  buffer_after integer NOT NULL DEFAULT 0,
  seats integer NOT NULL DEFAULT 1 CHECK (seats > 0),
  status text NOT NULL CHECK (status IN ('confirmed', 'pending', 'cancelled', 'no_show')),
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  fields jsonb NOT NULL DEFAULT '[]',
  notes text NOT NULL DEFAULT '',
  locale text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT '',
  -- site, admin or import: the free limit counts some of them.
  source text NOT NULL CHECK (source IN ('site', 'admin', 'import')),
  external_id text,
  sequence integer NOT NULL DEFAULT 0,
  consent_at timestamptz,
  reminder_sent_at timestamptz,
  cancelled_at timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX appointments_site_time_idx ON appointments (site_id, starts_at);
CREATE INDEX appointments_site_status_idx ON appointments (site_id, status, starts_at);
CREATE INDEX appointments_site_email_idx ON appointments (site_id, lower(email));
CREATE UNIQUE INDEX appointments_external_idx ON appointments (site_id, external_id) WHERE external_id IS NOT NULL;
SELECT cleitext_enable_tenant_rls('appointments');
