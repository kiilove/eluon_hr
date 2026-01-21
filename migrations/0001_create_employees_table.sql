-- Migration number: 0001 	 2026-01-07T08:00:00.000Z
CREATE TABLE IF NOT EXISTS regular_employees (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    employee_code TEXT,
    name TEXT NOT NULL,
    department TEXT,
    position TEXT,
    email TEXT,
    phone TEXT,
    source TEXT DEFAULT 'manual',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    last_synced_at INTEGER,
    UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_regular_employees_company_id ON regular_employees(company_id);
