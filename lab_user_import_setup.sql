-- ═══════════════════════════════════════════════════════════════════════════
-- lab_user_import_setup.sql — Import lab users + yearly re-safety (ICT-Lab, Oct 2026)
--
-- ICT-Lab ONLY (LabHive's safety steps differ — decided later). Run after
-- training_privacy.sql (uses i_manage_people / my_managed_org_ids). Idempotent.
--
--   users.annual_resafety      redo all safety steps every Sep 1 (default ON,
--                              for existing lab users too)
--   users.safety_self_approve  a completed safety step counts as approved at
--                              once (lab users added by the Excel import)
--   users.password_set_at      when they first set their own password
--   users.import_batch_id      which import added them
--   lab_user_imports           one row per import (who, when, email timing)
--   email_notifications_queue.send_after   a scheduled email waits until then
--   lab_safety_progress_history            each Sep 1's progress, archived
--   annual_safety_reset() + cron 'annual-safety-reset'  Sep 1, 00:05 Chicago
--
-- Also closes a hole: users_policy lets ANY org member update ANY users row,
-- so a lab user could switch off their own safety steps (or change their
-- role) through the API. guard_user_admin_fields keeps those columns
-- unchanged unless the caller manages people.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS annual_resafety     boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS safety_self_approve boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set_at     timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS import_batch_id     uuid;

CREATE TABLE IF NOT EXISTS lab_user_imports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid,
  created_by       uuid,
  created_by_name  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  user_count       integer NOT NULL DEFAULT 0,
  email_send_at    timestamptz      -- null = sent at creation
);
-- "Save and finish later": an unfinished list is a row with status 'draft'
-- and its rows in draft_rows (names + emails + ticks; never passwords).
ALTER TABLE lab_user_imports ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'done';
ALTER TABLE lab_user_imports ADD COLUMN IF NOT EXISTS draft_rows jsonb;
ALTER TABLE lab_user_imports ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE lab_user_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_user_imports_policy ON lab_user_imports;
CREATE POLICY lab_user_imports_policy ON lab_user_imports FOR ALL TO authenticated
  USING      (is_super_admin() OR organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid))
  WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid));
REVOKE ALL ON lab_user_imports FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_user_imports TO authenticated, service_role;

-- Scheduled emails: the send-emails function skips a row until send_after.
ALTER TABLE email_notifications_queue ADD COLUMN IF NOT EXISTS send_after timestamptz;
-- Lab managers may move a scheduled send (Send now / Change time) for people
-- in an organization they manage. Unsent rows only.
DROP POLICY IF EXISTS email_queue_update_managers ON email_notifications_queue;
CREATE POLICY email_queue_update_managers ON email_notifications_queue FOR UPDATE TO authenticated
  USING (sent = false AND (is_super_admin() OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid))))
  WITH CHECK (sent = false AND (is_super_admin() OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid))));

-- The queue holds welcome emails WITH temporary passwords, and any member of
-- the organization could read every row. Now: your own rows, or those of the
-- people in an organization you manage (the import history needs these).
DROP POLICY IF EXISTS email_queue_select ON email_notifications_queue;
CREATE POLICY email_queue_select ON email_notifications_queue FOR SELECT TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid))
);

-- ── Self-approval of safety steps ──────────────────────────────────────────
-- Runs AFTER guard_training_approval (triggers fire in name order; "zz_"
-- sorts last): the guard resets `completed` for a lab user, this then sets
-- it when the person is marked safety_self_approve and has just submitted.
CREATE OR REPLACE FUNCTION safety_self_approve() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.submitted_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at)
     AND EXISTS (SELECT 1 FROM users WHERE id::text = NEW.user_id::text AND safety_self_approve)
  THEN
    NEW.completed := true;
    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_safety_self_approve ON lab_safety_progress;
CREATE TRIGGER zz_safety_self_approve BEFORE INSERT OR UPDATE ON lab_safety_progress
  FOR EACH ROW EXECUTE FUNCTION safety_self_approve();
REVOKE EXECUTE ON FUNCTION safety_self_approve() FROM PUBLIC, anon, authenticated;

-- ── Only people who manage people change these columns ────────────────────
CREATE OR REPLACE FUNCTION guard_user_admin_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  patch jsonb := '{}';
  c text;
BEGIN
  IF i_manage_people() THEN RETURN NEW; END IF;   -- also true for the SQL editor / cron
  -- Through jsonb rather than NEW.col := OLD.col, so a column missing from
  -- this database is skipped instead of failing every users update.
  FOREACH c IN ARRAY ARRAY['role', 'admin_level', 'is_active', 'organization_id',
      'required_safety_steps', 'annual_resafety', 'safety_self_approve', 'import_batch_id'] LOOP
    CONTINUE WHEN NOT (to_jsonb(OLD) ? c);
    patch := patch || jsonb_build_object(c, to_jsonb(OLD) -> c);
  END LOOP;
  -- A person may clear their own "must change password" (ForcePasswordChange),
  -- never set it back on.
  IF coalesce(NEW.must_change_password, false) AND NOT coalesce(OLD.must_change_password, false) THEN
    patch := patch || jsonb_build_object('must_change_password', OLD.must_change_password);
  END IF;
  RETURN jsonb_populate_record(NEW, patch);
END $$;
DROP TRIGGER IF EXISTS guard_user_admin_fields ON users;
CREATE TRIGGER guard_user_admin_fields BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_user_admin_fields();
REVOKE EXECUTE ON FUNCTION guard_user_admin_fields() FROM PUBLIC, anon, authenticated;

-- ── Yearly re-safety ───────────────────────────────────────────────────────
-- Sep 1: every active lab user with annual_resafety must redo ALL safety
-- steps. Their progress is archived, then cleared (so they are locked until
-- they pass again), their required steps go back to all three (a lab manager
-- can untick steps for someone afterwards), and each gets a bell notice.
CREATE TABLE IF NOT EXISTS lab_safety_progress_history (
  LIKE lab_safety_progress INCLUDING DEFAULTS,
  archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE lab_safety_progress_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_safety_history_read ON lab_safety_progress_history;
CREATE POLICY lab_safety_history_read ON lab_safety_progress_history FOR SELECT TO authenticated
  USING (is_super_admin() OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid)));
REVOKE ALL ON lab_safety_progress_history FROM anon;
GRANT SELECT ON public.lab_safety_progress_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_safety_progress_history TO service_role;

CREATE OR REPLACE FUNCTION annual_safety_reset() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  CREATE TEMP TABLE _redo ON COMMIT DROP AS
    SELECT id FROM users WHERE role = 'lab_user' AND is_active AND annual_resafety;
  INSERT INTO lab_safety_progress_history
    SELECT p.*, now() FROM lab_safety_progress p WHERE p.user_id::text IN (SELECT id::text FROM _redo);
  DELETE FROM lab_safety_progress WHERE user_id::text IN (SELECT id::text FROM _redo);
  UPDATE users SET required_safety_steps = NULL WHERE id IN (SELECT id FROM _redo);
  INSERT INTO notifications (user_id, type, title, body, read)
    SELECT id, 'safety_step_submitted', 'Yearly safety training is due',
           'Complete safety Steps 1, 2 and 3 again to get access back to ICT-Lab.', false
    FROM _redo;
  SELECT count(*) INTO n FROM _redo;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION annual_safety_reset() FROM PUBLIC, anon, authenticated;

-- Sep 1, 05:05 UTC = 00:05 Chicago (CDT is still in effect on Sep 1).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'annual-safety-reset') THEN
    PERFORM cron.unschedule('annual-safety-reset');
  END IF;
  PERFORM cron.schedule('annual-safety-reset', '5 5 1 9 *', 'SELECT annual_safety_reset()');
END $$;

NOTIFY pgrst, 'reload schema';

-- ── Check — run last. Expect: 4 new users columns, send_after, the import
--    table, two triggers, and the Sep 1 job.
SELECT 'users.' || column_name AS item FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'users'
   AND column_name IN ('annual_resafety', 'safety_self_approve', 'password_set_at', 'import_batch_id')
UNION ALL SELECT 'email_notifications_queue.send_after' FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'email_notifications_queue' AND column_name = 'send_after'
UNION ALL SELECT 'table lab_user_imports' WHERE to_regclass('public.lab_user_imports') IS NOT NULL
UNION ALL SELECT 'lab_user_imports.' || column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'lab_user_imports' AND column_name IN ('status', 'draft_rows', 'updated_at')
UNION ALL SELECT 'trigger ' || tgname FROM pg_trigger WHERE tgname IN ('zz_safety_self_approve', 'guard_user_admin_fields')
UNION ALL SELECT 'cron ' || jobname || ' ' || schedule FROM cron.job WHERE jobname = 'annual-safety-reset'
ORDER BY 1;
