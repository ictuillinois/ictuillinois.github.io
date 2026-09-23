-- ===========================================================================
-- Per-lab-user safety step requirements — ICT-Lab
-- ===========================================================================
-- Run once in the SQL Editor. Idempotent.
--
-- Which safety steps a lab user must complete. NULL means ALL of them, which
-- is why the default is NULL and not '[]': every existing lab user, and every
-- one created by a manager who does not think about it, ends up on the
-- STRICTEST setting. An empty array meaning "none" would silently let someone
-- skip safety training entirely.
-- ===========================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS required_safety_steps JSONB DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
SELECT 'required_safety_steps ready' AS result;
