-- Migration number: 0026 	 2026-01-29T03:19:00.000Z
-- Re-create users table if missing or corrupt
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  company_id TEXT,
  name TEXT,
  role TEXT DEFAULT 'admin',
  created_at INTEGER DEFAULT (unixepoch())
);
