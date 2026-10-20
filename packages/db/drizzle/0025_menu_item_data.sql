-- Values of the options a theme (or a plugin extending it) declares for menu
-- items (`menuItemFields`, plugin API 1.34), e.g. a mega menu's columns, by
-- field name. Values of options no longer declared stay stored.
ALTER TABLE "menu_items" ADD COLUMN "data" jsonb DEFAULT '{}'::jsonb NOT NULL;
