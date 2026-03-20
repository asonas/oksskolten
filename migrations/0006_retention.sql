-- Add purged_at column for retention policy (soft delete)
ALTER TABLE articles ADD COLUMN purged_at TEXT;
CREATE INDEX idx_articles_purged_at ON articles(purged_at);
