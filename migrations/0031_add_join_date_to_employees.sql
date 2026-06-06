-- Migration to add join_date to regular_employees
ALTER TABLE regular_employees ADD COLUMN join_date TEXT;
