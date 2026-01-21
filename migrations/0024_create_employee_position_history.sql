-- Migration number: 0024 	 2026-01-21T10:11:00.000Z
-- Feature: Employee Position/Department History Tracking
CREATE TABLE IF NOT EXISTS employee_position_history (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    department TEXT,
    position TEXT,
    effective_date TEXT NOT NULL, -- YYYY-MM-DD
    reason TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY(employee_id) REFERENCES regular_employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_employee_position_history_employee_id ON employee_position_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_position_history_effective_date ON employee_position_history(effective_date);
