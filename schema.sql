PRAGMA defer_foreign_keys=TRUE;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  company_id TEXT,
  name TEXT,
  role TEXT DEFAULT 'admin',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE user_credentials (
  user_id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT UNIQUE, -- e.g. "eluon.com"
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE regular_employees (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL, -- Auto-assigned via email domain
  employee_code TEXT,
  name TEXT NOT NULL,
  department TEXT,
  position TEXT,
  email TEXT,
  phone TEXT,
  source TEXT DEFAULT 'excel',
  last_synced_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()), is_TF INTEGER DEFAULT 0, profile_image TEXT, is_pregnant INTEGER DEFAULT 0, is_discretionary INTEGER DEFAULT 0, discretionary_start_time TEXT, discretionary_end_time TEXT, discretionary_start_date TEXT, discretionary_end_date TEXT, pregnancy_reduced_start_date TEXT, pregnancy_reduced_end_date TEXT, pregnancy_reduced_start_time TEXT, pregnancy_reduced_end_time TEXT, join_date TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE TABLE outsourced_employees (
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

CREATE TABLE project_staff_leaves (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  leave_date TEXT NOT NULL, -- YYYY-MM-DD
  reason TEXT DEFAULT '정기 연차', -- Fixed Leave
  details TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (staff_id) REFERENCES project_staff(id) ON DELETE CASCADE
);

CREATE TABLE work_policies (
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
  created_by TEXT, weekly_basic_work_minutes INTEGER DEFAULT 2400, -- user_id
  
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE work_logs (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL, 
    work_date TEXT NOT NULL,   
    
    start_time TEXT,           
    end_time TEXT,             
    
    status TEXT DEFAULT 'NORMAL', 
    log_status TEXT,              
    
    overtime_minutes INTEGER DEFAULT 0,
    actual_work_minutes INTEGER DEFAULT 0,
    
    created_at INTEGER DEFAULT (unixepoch()), week_key TEXT, company_id TEXT DEFAULT 'comp_eluon',
    
    FOREIGN KEY (employee_id) REFERENCES regular_employees(id) ON DELETE CASCADE,
    UNIQUE(employee_id, work_date) 
);

CREATE TABLE special_work_reports (
    id TEXT PRIMARY KEY, 
    title TEXT NOT NULL, 
    target_month TEXT NOT NULL, 
    total_payout INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE special_work_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id TEXT NOT NULL, 
    employee_id TEXT NOT NULL, 
    work_date TEXT NOT NULL, 
    work_type TEXT NOT NULL, 
    amount INTEGER NOT NULL, hourly_wage INTEGER, calculated_hours INTEGER, special_hourly_wage INTEGER, record_id TEXT, 
    
    FOREIGN KEY (report_id) REFERENCES special_work_reports(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES regular_employees(id) ON DELETE CASCADE
);

CREATE TABLE special_work_policy_sets (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    effective_date TEXT NOT NULL, 
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(company_id, effective_date)
);

CREATE TABLE special_work_config_items (
    id TEXT PRIMARY KEY,
    policy_id TEXT NOT NULL, 
    name TEXT NOT NULL,
    code TEXT NOT NULL, 
    symbol TEXT NOT NULL,
    rate INTEGER NOT NULL,
    FOREIGN KEY (policy_id) REFERENCES special_work_policy_sets(id) ON DELETE CASCADE
);

CREATE TABLE hourly_wage_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    amount REAL NOT NULL,
    
    FOREIGN KEY (set_id) REFERENCES hourly_wage_sets(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES regular_employees(id) ON DELETE CASCADE
);

CREATE TABLE employee_memos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (employee_id) REFERENCES regular_employees(id) ON DELETE CASCADE
);

CREATE TABLE wage_multiplier_policies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    effective_date TEXT NOT NULL, 
    base_multiplier REAL NOT NULL DEFAULT 1.0,
    special_work_multiplier REAL NOT NULL DEFAULT 1.5,
    night_work_multiplier REAL NOT NULL DEFAULT 0.5,
    created_at INTEGER DEFAULT (unixepoch())
, company_id TEXT DEFAULT 'comp_eluon');

CREATE TABLE special_work_employee_records (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    base_hourly_wage INTEGER,
    special_hourly_wage INTEGER,
    total_amount INTEGER,
    calculated_hours INTEGER,
    created_at INTEGER,
    FOREIGN KEY (report_id) REFERENCES special_work_reports(id),
    FOREIGN KEY (employee_id) REFERENCES regular_employees(id)
);

CREATE TABLE special_work_logs (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    work_date TEXT NOT NULL, 
    start_time TEXT NOT NULL, 
    end_time TEXT NOT NULL, 
    break_minutes INTEGER DEFAULT 0,
    actual_work_minutes INTEGER DEFAULT 0,
    log_status TEXT DEFAULT 'SPECIAL', 
    persona TEXT, 
    created_at INTEGER,
    updated_at INTEGER, week_key TEXT, status TEXT DEFAULT 'NORMAL', overtime_minutes INTEGER DEFAULT 0, company_id TEXT DEFAULT 'comp_eluon',
    UNIQUE(employee_id, work_date)
);

CREATE TABLE monthly_closings (
    month TEXT PRIMARY KEY, 
    is_locked INTEGER DEFAULT 0,
    updated_at INTEGER
);

CREATE TABLE employee_status_history (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    status TEXT NOT NULL, -- 'ACTIVE' | 'RESIGNED' | 'LEAVE'
    effective_date TEXT NOT NULL, -- ISO Date YYYY-MM-DD
    reason TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY(employee_id) REFERENCES regular_employees(id) ON DELETE CASCADE
);

CREATE TABLE employee_position_history (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    department TEXT,
    position TEXT,
    effective_date TEXT NOT NULL, -- YYYY-MM-DD
    reason TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY(employee_id) REFERENCES regular_employees(id) ON DELETE CASCADE
);

CREATE TABLE password_resets (
    email TEXT PRIMARY KEY,
    pin TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE query_temp (dummy TEXT);

CREATE TABLE holidays (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    date TEXT NOT NULL, 
    name TEXT NOT NULL,
    type TEXT DEFAULT 'public', 
    is_recurring INTEGER DEFAULT 0, 
    created_at INTEGER
);

CREATE TABLE IF NOT EXISTS "hourly_wage_sets" (
    id TEXT PRIMARY KEY,
    company_id TEXT DEFAULT 'comp_eluon',
    effective_date TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(effective_date, company_id)
);

CREATE INDEX idx_reg_email ON regular_employees(email);

CREATE INDEX idx_reg_code ON regular_employees(employee_code);

CREATE INDEX idx_reg_company ON regular_employees(company_id);

CREATE INDEX idx_staff_leaves_staff_id ON project_staff_leaves(staff_id);

CREATE INDEX idx_staff_leaves_date ON project_staff_leaves(leave_date);

CREATE INDEX idx_policies_company_date ON work_policies(company_id, effective_date);

CREATE INDEX idx_regular_employees_company_id ON regular_employees(company_id);

CREATE INDEX idx_work_logs_employee_date ON work_logs(employee_id, work_date);

CREATE INDEX idx_work_logs_date ON work_logs(work_date);

CREATE INDEX idx_sw_items_report_id ON special_work_items(report_id);

CREATE INDEX idx_sw_items_emp_date ON special_work_items(employee_id, work_date);

CREATE INDEX idx_hw_values_set_id ON hourly_wage_values(set_id);

CREATE INDEX idx_employee_memos_emp_id ON employee_memos(employee_id);

CREATE INDEX idx_special_work_logs_date ON special_work_logs(work_date);

CREATE INDEX idx_special_work_logs_emp_date ON special_work_logs(employee_id, work_date);

CREATE INDEX idx_work_logs_company ON work_logs(company_id);

CREATE INDEX idx_special_work_logs_company ON special_work_logs(company_id);

CREATE INDEX idx_employee_status_history_employee_id ON employee_status_history(employee_id);

CREATE INDEX idx_employee_status_history_effective_date ON employee_status_history(effective_date);

CREATE INDEX idx_employee_position_history_employee_id ON employee_position_history(employee_id);

CREATE INDEX idx_employee_position_history_effective_date ON employee_position_history(effective_date);

CREATE INDEX idx_holidays_company_date ON holidays(company_id, date);
