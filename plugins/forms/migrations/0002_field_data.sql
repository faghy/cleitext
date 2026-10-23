-- Every field of a message sent with custom fields (Forms 1.3.0), in order:
-- [{ name, label, type, value }]. NULL for the classic form.
ALTER TABLE submissions ADD COLUMN data jsonb;
