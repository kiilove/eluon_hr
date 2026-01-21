DROP TABLE IF EXISTS user_credentials;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS regular_employees;
DROP TABLE IF EXISTS outsourced_employees;
DROP TABLE IF EXISTS project_staff;
DROP TABLE IF EXISTS companies;

-- Users (Profile)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  company_id TEXT,
  name TEXT,
  role TEXT DEFAULT 'admin',
  created_at INTEGER DEFAULT (unixepoch())
);

-- Credentials (Security)
CREATE TABLE IF NOT EXISTS user_credentials (
  user_id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Companies (Tenant)
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT UNIQUE, -- e.g. "eluon.com"
  created_at INTEGER DEFAULT (unixepoch())
);

-- Seed Initial Companies
INSERT OR IGNORE INTO companies (id, name, domain) VALUES
('comp_eluon', 'ELUON', 'eluon.com'),
('comp_eluonins', 'ELUON INS', 'eluonins.com');

-- 1. Regular Employees
CREATE TABLE IF NOT EXISTS regular_employees (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL, -- Auto-assigned via email domain
  employee_code TEXT,
  name TEXT NOT NULL,
  department TEXT,
  position TEXT,
  email TEXT,
  phone TEXT,
  is_TF INTEGER DEFAULT 0,
  source TEXT DEFAULT 'excel',
  last_synced_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (company_id) REFERENCES companies(id)
);
CREATE INDEX IF NOT EXISTS idx_reg_email ON regular_employees(email);
CREATE INDEX IF NOT EXISTS idx_reg_code ON regular_employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_reg_company ON regular_employees(company_id);

-- 2. Outsourced Employees
CREATE TABLE IF NOT EXISTS outsourced_employees (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  role_description TEXT,
  contract_start TEXT,
  contract_end TEXT,
  status TEXT DEFAULT 'active',
  created_at INTEGER DEFAULT (unixepoch())
);

-- 3. Project Staff (Strategic/Ghost)
CREATE TABLE IF NOT EXISTS project_staff (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  employee_code TEXT, -- NEW: For fake ID
  target_persona TEXT,
  daily_work_hours TEXT, -- Legacy, kept for backward compat or display "09:00-18:00"
  work_start_time TEXT DEFAULT '09:00', -- NEW
  work_end_time TEXT DEFAULT '18:00', -- NEW
  attendance_rate REAL DEFAULT 1.0,
  risk_level TEXT DEFAULT 'low',
  created_at INTEGER DEFAULT (unixepoch())
);

-- 4. Project Staff Leaves
CREATE TABLE IF NOT EXISTS project_staff_leaves (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  leave_date TEXT NOT NULL, -- YYYY-MM-DD
  reason TEXT DEFAULT '정기 연차', -- Fixed Leave
  details TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (staff_id) REFERENCES project_staff(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_staff_leaves_staff_id ON project_staff_leaves(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_leaves_date ON project_staff_leaves(leave_date);

-- 5. Project Staff Work Logs (Fake Attendance)
CREATE TABLE IF NOT EXISTS project_staff_work_logs (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  work_date TEXT NOT NULL, -- YYYY-MM-DD
  start_time TEXT, -- HH:mm:ss
  end_time TEXT, -- HH:mm:ss
  status TEXT DEFAULT 'NORMAL',
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (staff_id) REFERENCES project_staff(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_staff_logs_staff_id ON project_staff_work_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_logs_date ON project_staff_work_logs(work_date);

-- Work Policies Table
CREATE TABLE IF NOT EXISTS work_policies (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  standard_start_time TEXT DEFAULT '09:00',
  standard_end_time TEXT DEFAULT '18:00',
  break_time_4h_deduction INTEGER DEFAULT 30,
  break_time_8h_deduction INTEGER DEFAULT 60,
  clock_in_grace_minutes INTEGER DEFAULT 0,
  clock_in_cutoff_time TEXT,
  clock_out_cutoff_time TEXT,
  max_weekly_overtime_minutes INTEGER DEFAULT 720,
  created_at INTEGER DEFAULT (unixepoch()),
  created_by TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);
CREATE INDEX IF NOT EXISTS idx_policies_company_date ON work_policies(company_id, effective_date);

-- 6. Work Logs (Real Audit Data for Dashboard)
CREATE TABLE IF NOT EXISTS work_logs (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL, -- YYYY-MM-DD
  start_time TEXT, -- HH:mm
  end_time TEXT, -- HH:mm
  status TEXT DEFAULT 'NORMAL', -- NORMAL, ERROR, WARNING
  log_status TEXT DEFAULT 'NORMAL', -- Original Status
  overtime_minutes INTEGER DEFAULT 0,
  actual_work_minutes INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (employee_id) REFERENCES regular_employees(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_work_logs_emp_date ON work_logs(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_work_logs_date ON work_logs(work_date);
