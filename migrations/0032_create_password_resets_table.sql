-- Create password_resets table
CREATE TABLE query_temp (dummy TEXT); -- Placeholder to ensure file is treated as valid SQL by some parsers if empty, but we have content.

CREATE TABLE IF NOT EXISTS password_resets (
    email TEXT NOT NULL,
    pin TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (email)
);
