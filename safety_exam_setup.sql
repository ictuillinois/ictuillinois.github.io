-- ===========================================================================
-- Step 1 Building Safety knowledge check — columns
-- ===========================================================================
-- Run once in the ICT-Lab SQL Editor. Idempotent.
--
-- The result lives on the existing lab_safety_progress row rather than in a
-- new table: it is one result per user per step, which is exactly that row's
-- grain, and it keeps the manager's approve/revoke flow reading one place.
--
-- Without these columns the whole upsert is rejected and a passed exam saves
-- nothing — PostgREST fails the entire request over one unknown column.
-- ===========================================================================

ALTER TABLE lab_safety_progress ADD COLUMN IF NOT EXISTS exam_score    INTEGER;
ALTER TABLE lab_safety_progress ADD COLUMN IF NOT EXISTS exam_total    INTEGER;
ALTER TABLE lab_safety_progress ADD COLUMN IF NOT EXISTS exam_passed   BOOLEAN;
ALTER TABLE lab_safety_progress ADD COLUMN IF NOT EXISTS exam_attempts INTEGER DEFAULT 0;
ALTER TABLE lab_safety_progress ADD COLUMN IF NOT EXISTS exam_at       TIMESTAMPTZ;

-- The upsert targets (user_id, step_number); without a unique index on that
-- pair, onConflict is rejected outright and every submission fails.
CREATE UNIQUE INDEX IF NOT EXISTS lab_safety_progress_user_step_uniq
  ON lab_safety_progress (user_id, step_number);

NOTIFY pgrst, 'reload schema';
SELECT 'safety exam columns ready' AS result;
