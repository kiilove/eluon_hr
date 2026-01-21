-- Migration number: 0023 	 2026-01-21T09:50:00.000Z
-- Feature: Employee Status History Tracking
CREATE TABLE IF NOT EXISTS employee_status_history (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    status TEXT NOT NULL, -- 'ACTIVE' | 'RESIGNED' | 'LEAVE'
    effective_date TEXT NOT NULL, -- ISO Date YYYY-MM-DD
    reason TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY(employee_id) REFERENCES regular_employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_employee_status_history_employee_id ON employee_status_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_status_history_effective_date ON employee_status_history(effective_date);
