-- Migration number: 0034 	 2026-02-06T11:20:00.000Z
-- Fix UNIQUE constraint on hourly_wage_sets to include company_id

PRAGMA foreign_keys=OFF;

-- 1. Create new table with correct constraint
CREATE TABLE hourly_wage_sets_new (
    id TEXT PRIMARY KEY,
    company_id TEXT DEFAULT 'comp_eluon',
    effective_date TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(effective_date, company_id)
);

-- 2. Copy data
INSERT INTO hourly_wage_sets_new (id, company_id, effective_date, created_at)
SELECT id, company_id, effective_date, created_at FROM hourly_wage_sets;

-- 3. Drop old table
DROP TABLE hourly_wage_sets;

-- 4. Rename new table
ALTER TABLE hourly_wage_sets_new RENAME TO hourly_wage_sets;

-- 5. Restore Foreign Key in hourly_wage_values (Constraint check might be needed if IDs changed, but here IDs are preserved)
-- Since hourly_wage_values references hourly_wage_sets(id), and we preserved IDs, data integrity is fine.
-- But we need to ensure the FK definition in hourly_wage_values is still valid. 
-- SQLite doesn't require re-adding FKs if the parent table is renamed back.

PRAGMA foreign_keys=ON;
