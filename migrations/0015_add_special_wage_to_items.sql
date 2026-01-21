-- Migration: Add special_hourly_wage to special_work_items
ALTER TABLE special_work_items ADD COLUMN special_hourly_wage INTEGER;
