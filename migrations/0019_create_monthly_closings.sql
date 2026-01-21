-- Migration number: 0019 	 2026-01-15T00:00:00
-- Description: Create table for monthly closing status (Lock)

CREATE TABLE IF NOT EXISTS monthly_closings (
    month TEXT PRIMARY KEY, -- YYYY-MM
    is_locked INTEGER DEFAULT 0,
    updated_at INTEGER
);
