-- Migration number: 0011 	 2026-01-08T16:00:00.000Z

-- 1. Hourly Wage Sets (Version by Date)
CREATE TABLE IF NOT EXISTS hourly_wage_sets (
    id TEXT PRIMARY KEY,
    effective_date TEXT NOT NULL, -- YYYY-MM-DD
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(effective_date)
);

-- 2. Hourly Wage Values (Actual Data)
CREATE TABLE IF NOT EXISTS hourly_wage_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    amount REAL NOT NULL,
    
    FOREIGN KEY (set_id) REFERENCES hourly_wage_sets(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES regular_employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hw_values_set_id ON hourly_wage_values(set_id);
