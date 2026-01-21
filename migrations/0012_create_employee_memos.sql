-- Migration number: 0012 	 2026-01-08T16:30:00.000Z

CREATE TABLE IF NOT EXISTS employee_memos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (employee_id) REFERENCES regular_employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_employee_memos_emp_id ON employee_memos(employee_id);
