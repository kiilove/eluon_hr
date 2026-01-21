-- Migration number: 0016 	 2026-01-09T09:05:00.000Z

-- 1. Create Aggregated Records Table
CREATE TABLE special_work_employee_records (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    base_hourly_wage INTEGER,
    special_hourly_wage INTEGER,
    total_amount INTEGER,
    calculated_hours INTEGER,
    created_at INTEGER,
    FOREIGN KEY (report_id) REFERENCES special_work_reports(id),
    FOREIGN KEY (employee_id) REFERENCES regular_employees(id)
);

-- 2. Link Items to Record
ALTER TABLE special_work_items ADD COLUMN record_id TEXT;
-- We don't strictly enforce FK here for now to simplify, or we can:
-- FOREIGN KEY (record_id) REFERENCES special_work_employee_records(id)
