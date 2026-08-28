CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT UNIQUE,
  avatar TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(sender_id) REFERENCES users(id),
  FOREIGN KEY(recipient_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages(sender_id, recipient_id, created_at);
