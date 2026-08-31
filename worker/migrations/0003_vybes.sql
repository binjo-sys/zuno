CREATE TABLE IF NOT EXISTS vybes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS vybe_likes (
  vybe_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(vybe_id, user_id),
  FOREIGN KEY(vybe_id) REFERENCES vybes(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS vybe_comments (
  id TEXT PRIMARY KEY,
  vybe_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(vybe_id) REFERENCES vybes(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS vybe_shares (
  vybe_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(vybe_id, user_id),
  FOREIGN KEY(vybe_id) REFERENCES vybes(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS vybes_created_idx ON vybes(created_at DESC);
CREATE INDEX IF NOT EXISTS vybe_comments_idx ON vybe_comments(vybe_id, created_at);
