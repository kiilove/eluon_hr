-- Migration number: 0030 	 2026-02-03T12:00:00.000Z

CREATE TABLE IF NOT EXISTS password_resets (
    email TEXT PRIMARY KEY,
    pin TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
);
