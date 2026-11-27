-- Clicks on the bar per site, day and bar (the site's bar is `default`): counts only, no personal data.
CREATE TABLE clicks (
  site_id uuid NOT NULL,
  day date NOT NULL,
  bar text NOT NULL,
  clicks integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, bar)
);
SELECT cleitext_enable_tenant_rls('clicks');
