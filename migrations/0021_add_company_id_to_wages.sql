-- Add company_id to hourly_wage_sets
ALTER TABLE hourly_wage_sets ADD COLUMN company_id TEXT DEFAULT 'comp_eluon';

-- Add company_id to wage_multiplier_policies
ALTER TABLE wage_multiplier_policies ADD COLUMN company_id TEXT DEFAULT 'comp_eluon';
