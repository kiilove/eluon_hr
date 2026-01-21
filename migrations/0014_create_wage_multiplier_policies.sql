-- Migration number: 0014 	 2026-01-09T00:00:00.000Z

-- Wage Multiplier Policies
CREATE TABLE IF NOT EXISTS wage_multiplier_policies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    effective_date TEXT NOT NULL, -- YYYY-MM-DD
    base_multiplier REAL NOT NULL DEFAULT 1.0,
    special_work_multiplier REAL NOT NULL DEFAULT 1.5,
    night_work_multiplier REAL NOT NULL DEFAULT 0.5,
    created_at INTEGER DEFAULT (unixepoch())
);
