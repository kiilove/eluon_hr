-- Migration number: 0008 	 2026-01-08T12:00:00.000Z

-- 1. Parent Table: special_work_reports
CREATE TABLE IF NOT EXISTS special_work_reports (
    id TEXT PRIMARY KEY, -- UUID
    title TEXT NOT NULL, -- e.g. "이루온 11월 특근&휴일 근무 집계"
    target_month TEXT NOT NULL, -- YYYY-MM (The "label" month)
    total_payout INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
);

-- 2. Child Table: special_work_items
CREATE TABLE IF NOT EXISTS special_work_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id TEXT NOT NULL, -- FK to special_work_reports
    employee_id TEXT NOT NULL, -- FK to regular_employees
    work_date TEXT NOT NULL, -- YYYY-MM-DD (Actual date from header)
    work_type TEXT NOT NULL, -- 'REGULAR' | 'REMOTE'
    amount INTEGER NOT NULL, -- 70000 | 50000
    
    FOREIGN KEY (report_id) REFERENCES special_work_reports(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES regular_employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sw_items_report_id ON special_work_items(report_id);
CREATE INDEX IF NOT EXISTS idx_sw_items_emp_date ON special_work_items(employee_id, work_date);
