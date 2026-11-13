-- Project start / end dates (Nov 2026). Run in BOTH projects (ICT-Lab and
-- LabHive) — they are separate databases. Idempotent.
--
-- The New project and Edit project info forms ask for the PI and the
-- project's start and end dates instead of a sampling and storage date.
-- sampling_date / storage_date stay on projects (existing projects keep what
-- they hold); materials keep their own sampling and storage dates.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date   DATE;
NOTIFY pgrst, 'reload schema';

-- Check: two rows, start_date and end_date.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'projects' AND column_name IN ('start_date', 'end_date');
