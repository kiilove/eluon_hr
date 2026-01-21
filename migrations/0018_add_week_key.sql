-- Clear existing data as requested to start fresh with Week Keys
DELETE FROM work_logs;
DELETE FROM special_work_logs;

-- Add week_key column for stable weekly management
ALTER TABLE work_logs ADD COLUMN week_key TEXT;
ALTER TABLE special_work_logs ADD COLUMN week_key TEXT;
