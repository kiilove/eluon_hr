-- Migration number: 0027 	 2026-01-29T03:22:00.000Z
-- Re-create user_credentials table if missing
CREATE TABLE IF NOT EXISTS user_credentials (
  user_id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
