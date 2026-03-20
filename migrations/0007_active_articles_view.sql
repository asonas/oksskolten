-- View that excludes soft-deleted (purged) articles.
-- All read queries should use this view instead of the base articles table.
CREATE VIEW IF NOT EXISTS active_articles AS
SELECT * FROM articles WHERE purged_at IS NULL;
