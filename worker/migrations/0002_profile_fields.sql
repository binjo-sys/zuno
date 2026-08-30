-- ZUNO profile fields
ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN about TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
ON users(username)
WHERE username IS NOT NULL AND username <> '';
