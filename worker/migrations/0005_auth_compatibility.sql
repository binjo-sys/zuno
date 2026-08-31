-- Keep the live D1 schema compatible with the authenticated Worker session code.
-- Existing deployments use token_hash; newer Worker code also addresses sessions by id.
ALTER TABLE users ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN id TEXT;
ALTER TABLE sessions ADD COLUMN expires_at INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_id ON sessions(id);
