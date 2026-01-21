-- Migration number: 0017 	 2026-01-14T20:45:00
-- Description: Create dedicated table for generated special work logs (Dual Table Architecture)

CREATE TABLE IF NOT EXISTS special_work_logs (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    work_date TEXT NOT NULL, -- YYYY-MM-DD
    start_time TEXT NOT NULL, -- HH:mm:ss
    end_time TEXT NOT NULL, -- HH:mm:ss
    break_minutes INTEGER DEFAULT 0,
    actual_work_minutes INTEGER DEFAULT 0,
    log_status TEXT DEFAULT 'SPECIAL', -- Always 'SPECIAL'
    persona TEXT, -- To track which logic generated this
    created_at INTEGER,
    updated_at INTEGER,
    UNIQUE(employee_id, work_date)
);

-- Index for fast retrieval by date range and employee
CREATE INDEX IF NOT EXISTS idx_special_work_logs_date ON special_work_logs(work_date);
CREATE INDEX IF NOT EXISTS idx_special_work_logs_emp_date ON special_work_logs(employee_id, work_date);
