-- migrations/0033_create_holidays_table.sql
DROP TABLE IF EXISTS holidays;
CREATE TABLE holidays (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    name TEXT NOT NULL,
    type TEXT DEFAULT 'public', -- public, company
    is_recurring INTEGER DEFAULT 0, -- 0: false, 1: true
    created_at INTEGER
);
CREATE INDEX idx_holidays_company_date ON holidays(company_id, date);
