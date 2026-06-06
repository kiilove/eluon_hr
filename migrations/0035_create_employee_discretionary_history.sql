-- Migration: Create Employee Discretionary History Table
CREATE TABLE employee_discretionary_history (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    start_date TEXT NOT NULL, -- YYYY-MM-DD
    end_date TEXT NOT NULL,   -- YYYY-MM-DD
    start_time TEXT DEFAULT '09:00',
    end_time TEXT DEFAULT '18:00',
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(employee_id) REFERENCES regular_employees(id) ON DELETE CASCADE
);

CREATE INDEX idx_emp_disc_hist_emp_id ON employee_discretionary_history(employee_id);

-- Migrate existing discretionary data
INSERT INTO employee_discretionary_history (id, employee_id, start_date, end_date, start_time, end_time, created_at)
SELECT 
    lower(hex(randomblob(16))) as id, 
    id as employee_id, 
    discretionary_start_date as start_date, 
    discretionary_end_date as end_date, 
    CASE WHEN discretionary_start_time IS NULL OR discretionary_start_time = 'null' THEN '09:00' ELSE discretionary_start_time END as start_time,
    CASE WHEN discretionary_end_time IS NULL OR discretionary_end_time = 'null' THEN '18:00' ELSE discretionary_end_time END as end_time,
    unixepoch() as created_at
FROM regular_employees 
WHERE is_discretionary = 1 AND discretionary_start_date IS NOT NULL AND discretionary_start_date != '' AND discretionary_start_date != 'null';

-- Drop old discretionary columns from regular_employees
ALTER TABLE regular_employees DROP COLUMN is_discretionary;
ALTER TABLE regular_employees DROP COLUMN discretionary_start_time;
ALTER TABLE regular_employees DROP COLUMN discretionary_end_time;
ALTER TABLE regular_employees DROP COLUMN discretionary_start_date;
ALTER TABLE regular_employees DROP COLUMN discretionary_end_date;
