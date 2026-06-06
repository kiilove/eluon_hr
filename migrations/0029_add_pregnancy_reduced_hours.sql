-- Migration: Add Pregnancy Reduced Working Hours Fields
ALTER TABLE regular_employees ADD COLUMN pregnancy_reduced_start_date TEXT;
ALTER TABLE regular_employees ADD COLUMN pregnancy_reduced_end_date TEXT;
ALTER TABLE regular_employees ADD COLUMN pregnancy_reduced_start_time TEXT;
ALTER TABLE regular_employees ADD COLUMN pregnancy_reduced_end_time TEXT;
