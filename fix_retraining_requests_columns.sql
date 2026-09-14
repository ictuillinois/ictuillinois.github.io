-- Fix: add missing columns to retraining_requests table.
-- The table was created without these columns; code inserts/reads all of them.
-- Safe to re-run (IF NOT EXISTS / IF EXISTS checks used throughout).

ALTER TABLE retraining_requests ADD COLUMN IF NOT EXISTS user_name      text;
ALTER TABLE retraining_requests ADD COLUMN IF NOT EXISTS equipment_name text;
ALTER TABLE retraining_requests ADD COLUMN IF NOT EXISTS requested_at   timestamptz DEFAULT now();
ALTER TABLE retraining_requests ADD COLUMN IF NOT EXISTS reviewed_by    text;
ALTER TABLE retraining_requests ADD COLUMN IF NOT EXISTS reviewed_at    timestamptz;

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'retraining_requests'
ORDER BY ordinal_position;
