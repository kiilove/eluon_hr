-- Migration number: 0010 	 2026-01-08T14:00:00.000Z

-- Drop the previous flat table
DROP TABLE IF EXISTS special_work_configs;

-- The "Set" or "Version" of the policy
CREATE TABLE IF NOT EXISTS special_work_policy_sets (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    effective_date TEXT NOT NULL, -- "YYYY-MM-DD"
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(company_id, effective_date)
);

-- The individual rules within a set
CREATE TABLE IF NOT EXISTS special_work_config_items (
    id TEXT PRIMARY KEY,
    policy_id TEXT NOT NULL, -- FK to special_work_policy_sets
    name TEXT NOT NULL,
    code TEXT NOT NULL, -- REGULAR, REMOTE
    symbol TEXT NOT NULL,
    rate INTEGER NOT NULL,
    FOREIGN KEY (policy_id) REFERENCES special_work_policy_sets(id) ON DELETE CASCADE
);

-- Note: We are starting fresh, no data migration needed from the table we just dropped 
-- since it was only dev data.
