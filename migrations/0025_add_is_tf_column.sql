-- Migration number: 0025 	 2026-01-21T10:39:00.000Z
-- Add is_TF column to regular_employees table
ALTER TABLE regular_employees ADD COLUMN is_TF INTEGER DEFAULT 0;
