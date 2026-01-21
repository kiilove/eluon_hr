-- Migration number: 0004 	 2026-01-07T16:00:00.000Z

-- Work Logs Table (Linked to regular_employees)
CREATE TABLE IF NOT EXISTS work_logs (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL, -- References regular_employees(id)
    work_date TEXT NOT NULL,   -- YYYY-MM-DD
    
    start_time TEXT,           -- HH:mm
    end_time TEXT,             -- HH:mm
    
    status TEXT DEFAULT 'NORMAL', -- NORMAL, ERROR, MISSING, etc.
    log_status TEXT,              -- VACATION, TRIP, etc.
    
    overtime_minutes INTEGER DEFAULT 0,
    actual_work_minutes INTEGER DEFAULT 0,
    
    created_at INTEGER DEFAULT (unixepoch()),
    
    FOREIGN KEY (employee_id) REFERENCES regular_employees(id) ON DELETE CASCADE,
    UNIQUE(employee_id, work_date) -- One log per user per day? Or allow multiple? Usually one summary log per day in this system.
);

CREATE INDEX IF NOT EXISTS idx_work_logs_employee_date ON work_logs(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_work_logs_date ON work_logs(work_date);
