-- Palinsest: the rules of the editorial calendar and their slots (Row Level Security).
-- The schema is the plugin's (`plg_palinsest`), so table names need no prefix.

CREATE TABLE rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  name text NOT NULL,
  -- twice-daily | daily | 2 | 3 | 7 | 10 | 15 (days)
  cadence text NOT NULL,
  -- HH:MM in the site's time zone.
  times text[] NOT NULL,
  starts_on date NOT NULL,
  -- The producer that fills the slots ("tell-me-more"…); '' for slots written by hand.
  producer text NOT NULL DEFAULT '',
  content_type text NOT NULL DEFAULT 'article',
  locale text,
  -- Who the entries are written and published as: the person who saved the rule.
  author_id uuid NOT NULL,
  auto_publish boolean NOT NULL DEFAULT false,
  with_translations boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rules_site_idx ON rules (site_id, created_at);
SELECT cleitext_enable_tenant_rls('rules');

CREATE TABLE slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  rule_id uuid NOT NULL REFERENCES rules (id) ON DELETE CASCADE,
  -- When the rule placed it, and (moved or not) when it comes out.
  planned_at timestamptz NOT NULL,
  at timestamptz NOT NULL,
  -- planned | producing | draft | scheduled | published | empty | failed | skipped | missed
  status text NOT NULL DEFAULT 'planned',
  entry_id uuid,
  error text,
  started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX slots_planned_idx ON slots (rule_id, planned_at);
CREATE INDEX slots_due_idx ON slots (site_id, status, at);
SELECT cleitext_enable_tenant_rls('slots');
