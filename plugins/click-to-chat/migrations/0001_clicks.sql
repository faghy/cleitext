-- Clicks on WhatsApp per site and day: counts only, no personal data.
CREATE TABLE clicks (
  site_id uuid NOT NULL,
  day date NOT NULL,
  clicks integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day)
);
SELECT cleitext_enable_tenant_rls('clicks');
