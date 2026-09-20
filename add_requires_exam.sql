-- TrainingSchedule reads AND writes equipment_inventory.requires_exam
-- (select at :54 and :593, update at :602) but the column exists in NEITHER
-- database — so the equipment list query failed outright and the exam toggle
-- saved nothing. Run in BOTH projects.
ALTER TABLE equipment_inventory ADD COLUMN IF NOT EXISTS requires_exam BOOLEAN DEFAULT FALSE;
NOTIFY pgrst, 'reload schema';
SELECT 'requires_exam added' AS result;
