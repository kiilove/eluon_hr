-- Migration number: 0020 	 2026-01-15T15:00:00
-- Description: Unify special_work_logs schema with work_logs for maintenance and audit

-- Add missing columns to match work_logs
ALTER TABLE special_work_logs ADD COLUMN status TEXT DEFAULT 'NORMAL'; -- NORMAL, WARNING, etc.
ALTER TABLE special_work_logs ADD COLUMN overtime_minutes INTEGER DEFAULT 0; -- Explicit overtime tracking
