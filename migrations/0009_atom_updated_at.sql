-- Preserve Atom's last entry update time separately from its publication time.
ALTER TABLE articles ADD COLUMN updated_at TEXT;
