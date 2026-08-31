CREATE TABLE IF NOT EXISTS pulse_rooms (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  title TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(creator_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS pulse_polls (
  id TEXT PRIMARY KEY,
  room_id TEXT,
  creator_id TEXT NOT NULL,
  question TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(room_id) REFERENCES pulse_rooms(id),
  FOREIGN KEY(creator_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS pulse_poll_options (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL,
  FOREIGN KEY(poll_id) REFERENCES pulse_polls(id)
);

CREATE TABLE IF NOT EXISTS pulse_votes (
  poll_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(poll_id, user_id),
  FOREIGN KEY(poll_id) REFERENCES pulse_polls(id),
  FOREIGN KEY(option_id) REFERENCES pulse_poll_options(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS pulse_rooms_created_idx ON pulse_rooms(created_at DESC);
CREATE INDEX IF NOT EXISTS pulse_polls_created_idx ON pulse_polls(created_at DESC);
CREATE INDEX IF NOT EXISTS pulse_options_poll_idx ON pulse_poll_options(poll_id, position);
CREATE INDEX IF NOT EXISTS pulse_votes_option_idx ON pulse_votes(option_id);
