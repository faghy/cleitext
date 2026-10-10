-- A language can have a domain of its own (one of the site's domains)
-- instead of an address prefix.
ALTER TABLE languages ADD COLUMN host text CHECK (host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$');
