-- Migration number: 0005 	 2026-01-07T16:10:00.000Z

-- Drop legacy tables to cleanup schema
DROP TABLE IF EXISTS project_staff_work_logs;
DROP TABLE IF EXISTS project_staff;
