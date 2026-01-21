-- Migration number: 0013 	 2026-01-08T17:05:00.000Z

ALTER TABLE special_work_items ADD COLUMN hourly_wage INTEGER;
ALTER TABLE special_work_items ADD COLUMN calculated_hours INTEGER;
