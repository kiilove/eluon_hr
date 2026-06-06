-- Migration: Add Discretionary Work and Pregnancy Management Fields
ALTER TABLE regular_employees ADD COLUMN is_pregnant INTEGER DEFAULT 0;
ALTER TABLE regular_employees ADD COLUMN is_discretionary INTEGER DEFAULT 0;
ALTER TABLE regular_employees ADD COLUMN discretionary_start_time TEXT;
ALTER TABLE regular_employees ADD COLUMN discretionary_end_time TEXT;
ALTER TABLE regular_employees ADD COLUMN discretionary_start_date TEXT;
ALTER TABLE regular_employees ADD COLUMN discretionary_end_date TEXT;
