-- Migration number: 0003 	 2026-01-07T15:10:00.000Z

-- Work Policies Table
-- Stores versioned configuration for work rules
CREATE TABLE IF NOT EXISTS work_policies (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  
  -- Effective Date (When this rule starts applying)
  effective_date TEXT NOT NULL, -- YYYY-MM-DD
  
  -- 1. Standard Time
  standard_start_time TEXT DEFAULT '09:00',
  standard_end_time TEXT DEFAULT '18:00',
  
  -- 2. Break Time Rules
  -- IF work_hours >= 4 THEN deduct 30m, IF >= 8 THEN deduct 60m
  break_time_4h_deduction INTEGER DEFAULT 30, -- Minutes
  break_time_8h_deduction INTEGER DEFAULT 60, -- Minutes
  
  -- 3. Buffer Rules (Grace Periods & Cut-offs)
  clock_in_grace_minutes INTEGER DEFAULT 0, -- Late allowance
  clock_in_cutoff_time TEXT, -- e.g. "08:45" (Before this = 09:00)
  clock_out_cutoff_time TEXT, -- e.g. "18:15" (After this = 18:00)
  
  -- 4. Overtime Rules
  max_weekly_overtime_minutes INTEGER DEFAULT 720, -- 12 hours * 60
  
  -- Meta
  created_at INTEGER DEFAULT (unixepoch()),
  created_by TEXT, -- user_id
  
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE INDEX IF NOT EXISTS idx_policies_company_date ON work_policies(company_id, effective_date);
