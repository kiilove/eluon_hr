-- Add company_id to work_logs
ALTER TABLE work_logs ADD COLUMN company_id TEXT DEFAULT 'comp_eluon';

-- Add company_id to special_work_logs
ALTER TABLE special_work_logs ADD COLUMN company_id TEXT DEFAULT 'comp_eluon';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_work_logs_company ON work_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_special_work_logs_company ON special_work_logs(company_id);
