-- exam_skip_setup.sql — run in BOTH projects (same file in both folders).
-- Idempotent. Run AFTER training_exam_waiver.sql.
--
-- A lab manager can skip the equipment exam for a lab user who could not pass
-- it or did not attempt it, and send them straight to their training session
-- (Training Records → Equipment → "Skip the exam → training session").
-- The skip is kept on the training session; when the manager then confirms
-- the training, the record is saved as "Trained · exam skipped by …".
-- The next retraining needs the exam as usual.

ALTER TABLE training_schedule  ADD COLUMN IF NOT EXISTS exam_skipped     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE training_schedule  ADD COLUMN IF NOT EXISTS exam_skipped_by  TEXT;
ALTER TABLE training_schedule  ADD COLUMN IF NOT EXISTS exam_skipped_at  TIMESTAMPTZ;
ALTER TABLE training_schedule  ADD COLUMN IF NOT EXISTS exam_skip_reason TEXT;
-- On the record: which kind of waiver (NULL = "trained before", the older kind)
ALTER TABLE training_equipment ADD COLUMN IF NOT EXISTS exam_waiver_kind TEXT;
ALTER TABLE training_equipment ADD COLUMN IF NOT EXISTS exam_skip_reason TEXT;

-- Lab users update their own training_schedule rows (accepting / countering a
-- time), so the skip columns are guarded: only managers can set them.
DROP TRIGGER IF EXISTS guard_training_approval_trg ON training_schedule;
CREATE TRIGGER guard_training_approval_trg BEFORE INSERT OR UPDATE ON training_schedule
  FOR EACH ROW EXECUTE FUNCTION guard_training_approval('exam_skipped,exam_skipped_by,exam_skipped_at,exam_skip_reason', '{"exam_skipped": false}');
DROP TRIGGER IF EXISTS guard_training_approval_trg ON training_equipment;
CREATE TRIGGER guard_training_approval_trg BEFORE INSERT OR UPDATE ON training_equipment
  FOR EACH ROW EXECUTE FUNCTION guard_training_approval('exam_waived,exam_waived_by,exam_waived_at,exam_waiver_kind,exam_skip_reason', '{"exam_waived": false}');

NOTIFY pgrst, 'reload schema';

-- Check (expected: 6 | 2)
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE
     (table_name = 'training_schedule'  AND column_name IN ('exam_skipped', 'exam_skipped_by', 'exam_skipped_at', 'exam_skip_reason'))
  OR (table_name = 'training_equipment' AND column_name IN ('exam_waiver_kind', 'exam_skip_reason'))) AS new_columns,
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname IN ('training_schedule', 'training_equipment') AND t.tgname = 'guard_training_approval_trg') AS guards;
