-- training_exam_waiver.sql — run in BOTH projects (same file in both folders).
-- Idempotent: safe to run again. Run AFTER training_privacy.sql.
--
-- Training Records → Equipment → Add equipment training gets a tick box
-- "Trained before. Give access without the exam": for a lab user who really
-- was trained, but whose training was never recorded in the app. Access is
-- given THIS ONCE without the exam; retraining still needs the exam (the box
-- is switched off for a retraining record).
--
--   exam_waived       the record gives access with no exam taken
--   exam_waived_by    the lab manager who gave it
--   exam_waived_at    when
--   is_retraining     "Mark as retraining" — the app showed a Retraining badge
--                     for it but never saved it, so the badge never appeared

ALTER TABLE training_equipment ADD COLUMN IF NOT EXISTS exam_waived    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE training_equipment ADD COLUMN IF NOT EXISTS exam_waived_by TEXT;
ALTER TABLE training_equipment ADD COLUMN IF NOT EXISTS exam_waived_at TIMESTAMPTZ;
ALTER TABLE training_equipment ADD COLUMN IF NOT EXISTS is_retraining  BOOLEAN NOT NULL DEFAULT FALSE;

-- A lab user cannot give themselves the waiver through the API: the existing
-- no-self-approval guard (training_privacy.sql) keeps these columns unchanged
-- unless the writer manages people. Only the waiver columns are guarded here —
-- passed_exam stays as it was.
DROP TRIGGER IF EXISTS guard_training_approval_trg ON training_equipment;
CREATE TRIGGER guard_training_approval_trg BEFORE INSERT OR UPDATE ON training_equipment
  FOR EACH ROW EXECUTE FUNCTION guard_training_approval('exam_waived,exam_waived_by,exam_waived_at', '{"exam_waived": false}');

NOTIFY pgrst, 'reload schema';

-- Check (expected: 4 | 1)
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'training_equipment'
     AND column_name IN ('exam_waived', 'exam_waived_by', 'exam_waived_at', 'is_retraining')) AS new_columns,
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'training_equipment' AND t.tgname = 'guard_training_approval_trg')  AS guard;
