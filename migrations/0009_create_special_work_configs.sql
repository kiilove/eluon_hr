-- Migration number: 0009 	 2026-01-08T13:00:00.000Z

CREATE TABLE IF NOT EXISTS special_work_configs (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL, -- e.g. "정규 특근", "재택 근무"
    code TEXT NOT NULL, -- e.g. "REGULAR", "REMOTE"
    symbol TEXT NOT NULL, -- e.g. "◎", "★"
    rate INTEGER NOT NULL, -- e.g. 70000, 50000
    created_at INTEGER DEFAULT (unixepoch()),
    
    -- Constraints
    UNIQUE(company_id, symbol), -- Can't use same symbol for two things in same company
    UNIQUE(company_id, code)    -- Code implies internal system meaning
);

-- Seed default values for Eluon (or generic if company_id is dynamic)
-- We will seed them in the API or manually. 
-- But good to have initial data if possible. 
-- Assuming 'comp_eluon' is the main one used in logic or we insert on demand.
