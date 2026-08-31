CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower_id, following_id),
  FOREIGN KEY(follower_id) REFERENCES users(id),
  FOREIGN KEY(following_id) REFERENCES users(id),
  CHECK(follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  responded_at INTEGER,
  FOREIGN KEY(sender_id) REFERENCES users(id),
  FOREIGN KEY(receiver_id) REFERENCES users(id),
  CHECK(sender_id <> receiver_id),
  CHECK(status IN ('pending','accepted','declined','cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS friend_pending_pair_idx ON friend_requests(sender_id, receiver_id, status);
CREATE INDEX IF NOT EXISTS friend_requests_receiver_idx ON friend_requests(receiver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS friend_requests_sender_idx ON friend_requests(sender_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS follows_follower_idx ON follows(follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS follows_following_idx ON follows(following_id, created_at DESC);
