-- ================================================================
-- LabHive RLS — Complete row-level security for all tables
-- Run this entire script in Supabase SQL Editor (single block).
-- ================================================================
-- Architecture:
--   • Team users:    users.auth_id  = auth.uid(), scoped by organization_id
--   • Solo users:    solo_users.auth_id = auth.uid(), scoped by solo_owner_id / user_id
--   • Super admin:   settings.super_admin_auth_id = auth.uid()::text
--   • After sb.auth.signInWithPassword() all queries run as 'authenticated' role
--
-- Identity columns (user_id, created_by, uploaded_by, sender_id, …) are 'text'
-- in some tables and 'uuid' in others, so every comparison against the
-- uuid-returning helpers casts BOTH sides to ::text.
--
-- Every policy is applied through _apply_rls(), which SKIPS any table that
-- does not exist — so tables referenced only in code (e.g. equipment_list)
-- are ignored rather than aborting the whole script.
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- STEP 1: Helper functions
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM settings
    WHERE key = 'super_admin_auth_id' AND value = auth.uid()::text
  )
$$;

-- NOTE (Sept 2026): ICT-Lab's users.auth_id is TEXT, not UUID (LabHive's is
-- UUID) — these two projects' schemas have diverged. auth.uid() always
-- returns uuid, so every comparison here casts BOTH sides to ::text
-- (matching this file's own documented convention above, which the original
-- STEP 1 functions never actually followed). Without this cast,
-- `auth_id = auth.uid()` throws "operator does not exist: text = uuid" and
-- the entire script aborts at the first CREATE FUNCTION statement.
CREATE OR REPLACE FUNCTION my_user_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM users WHERE auth_id::text = auth.uid()::text LIMIT 1
$$;

CREATE OR REPLACE FUNCTION my_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT organization_id FROM users WHERE auth_id::text = auth.uid()::text LIMIT 1
$$;

-- ICT-Lab has no solo_users table at all (team-only deployment) — a plain
-- LANGUAGE sql function referencing a non-existent table fails at CREATE
-- time, not just at call time, which would abort the whole script. plpgsql
-- defers that check to runtime, so creation always succeeds; the exception
-- handler makes every caller of my_solo_id()/my_solo_email() safely see NULL
-- (i.e. "not a solo user") instead of erroring, so every `OR solo_owner_id =
-- my_solo_id()` clause elsewhere in this file just evaluates false — correct
-- behavior for a team-only project, and forward-compatible if solo_users is
-- ever added later.
CREATE OR REPLACE FUNCTION my_solo_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN (SELECT id FROM solo_users WHERE auth_id::text = auth.uid()::text LIMIT 1);
EXCEPTION WHEN undefined_table THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION my_solo_email()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN (SELECT email FROM solo_users WHERE auth_id::text = auth.uid()::text LIMIT 1);
EXCEPTION WHEN undefined_table THEN
  RETURN NULL;
END;
$$;

-- Applies a single policy to a table.
--   • Skips tables that don't exist.
--   • Drops the common blanket policies (allow_all/anon_all/p) for THIS
--     table only — so tables we don't cover keep their existing open policy
--     and are never locked out. "p" was found Sept 2026: an older, separate
--     RLS attempt on this project left several tables (projects, bookings,
--     equipment, inspection_items, inspection_records, material_suppliers)
--     with a wide-open ALL/public policy literally named "p" that this
--     cleanup never knew to remove, silently coexisting with (or replacing,
--     via failed creation, see below) our real policy.
--   • If the policy body references a column/type that doesn't exist, it
--     DISABLES RLS on the table (leaving it open, as it is today) and reports
--     the problem via NOTICE instead of aborting the whole script.
-- body = everything after "CREATE POLICY <name> ON <table> "
CREATE OR REPLACE FUNCTION _apply_rls(tbl text, pol text, body text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('public.' || tbl) IS NULL THEN
    RAISE NOTICE 'SKIP (no table): %', tbl;
    RETURN;
  END IF;
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'allow_all', tbl);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'anon_all', tbl);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'p', tbl);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
  BEGIN
    EXECUTE format('CREATE POLICY %I ON public.%I %s', pol, tbl, body);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  EXCEPTION WHEN OTHERS THEN
    -- leave the table OPEN rather than locked-out; report for manual fix
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
    RAISE NOTICE 'SKIP (mismatch) %/%  [%] %', tbl, pol, SQLSTATE, SQLERRM;
  END;
END $$;


-- ────────────────────────────────────────────────────────────────
-- STEP 3: settings
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('settings', 'settings_read_anon', $b$
FOR SELECT TO anon
USING (key NOT IN ('admin_password','admin_email','super_admin_auth_id'))
$b$);

-- Authenticated users may read super_admin_auth_id (it's only a UUID and the
-- login flow compares it after signInWithPassword). Credentials stay hidden.
SELECT _apply_rls('settings', 'settings_read_auth', $b$
FOR SELECT TO authenticated
USING (is_super_admin() OR key NOT IN ('admin_password','admin_email'))
$b$);

SELECT _apply_rls('settings', 'settings_write', $b$
FOR ALL TO authenticated
USING (is_super_admin()) WITH CHECK (is_super_admin())
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 4: organizations
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('organizations', 'orgs_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR id = my_org_id())
WITH CHECK (is_super_admin() OR id = my_org_id())
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 5: users
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('users', 'users_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id = my_org_id())
WITH CHECK (is_super_admin() OR organization_id = my_org_id())
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 6: solo_users
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('solo_users', 'solo_users_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR auth_id = auth.uid())
WITH CHECK (is_super_admin() OR auth_id = auth.uid())
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 7: user_screen_access, user_dashboard_prefs
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('user_screen_access', 'user_screen_access_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id = my_org_id())
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id = my_org_id())
)
$b$);

SELECT _apply_rls('user_dashboard_prefs', 'user_dashboard_prefs_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id = my_org_id())
)
WITH CHECK (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id = my_org_id())
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 8: equipment_inventory + org metadata tables
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('equipment_inventory', 'equipment_inventory_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id = my_org_id()
)
WITH CHECK (
  is_super_admin()
  OR organization_id = my_org_id()
)
$b$);

SELECT _apply_rls('equipment_categories', 'equipment_categories_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id = my_org_id())
WITH CHECK (is_super_admin() OR organization_id = my_org_id())
$b$);

SELECT _apply_rls('equipment_locations', 'equipment_locations_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id = my_org_id())
WITH CHECK (is_super_admin() OR organization_id = my_org_id())
$b$);

SELECT _apply_rls('equipment_booking_settings', 'equipment_booking_settings_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id())
)
WITH CHECK (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id())
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 9: equipment_bookings, booking_notifications, equipment_booking_blocks
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('equipment_bookings', 'equipment_bookings_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id())
)
WITH CHECK (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id())
)
$b$);

SELECT _apply_rls('booking_notifications', 'booking_notifications_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id = my_org_id())
)
WITH CHECK (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id = my_org_id())
)
$b$);

SELECT _apply_rls('equipment_booking_blocks', 'equipment_booking_blocks_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id = my_org_id()
  OR user_id::text = my_user_id()::text
)
WITH CHECK (
  is_super_admin()
  OR organization_id = my_org_id()
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 10: equipment hub (SOPs, videos, exams, calibration, details, …)
-- ────────────────────────────────────────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'equipment_sop','equipment_videos','equipment_standards',
    'equipment_exam_questions','equipment_exam_results',
    'equipment_calibration','equipment_temp_access',
    'equipment_material_progress','equipment_details'
  ]
  LOOP
    PERFORM _apply_rls(t, 'eq_hub_policy', $b$
      FOR ALL TO authenticated
      USING (
        is_super_admin()
        OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id())
      )
      WITH CHECK (
        is_super_admin()
        OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id())
      )
    $b$);
  END LOOP;
END $$;

SELECT _apply_rls('equipment_sop_notes', 'equipment_sop_notes_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id())
)
WITH CHECK (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id())
)
$b$);

SELECT _apply_rls('equipment_list', 'equipment_list_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin())
WITH CHECK (is_super_admin())
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 11: rooms, supplies, inspections
-- ────────────────────────────────────────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['rooms','supplies','inspections']
  LOOP
    PERFORM _apply_rls(t, 'org_scope_policy', $b$
      FOR ALL TO authenticated
      USING    (is_super_admin() OR organization_id = my_org_id())
      WITH CHECK (is_super_admin() OR organization_id = my_org_id())
    $b$);
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────
-- STEP 12: floor_plans, storage_locations, student_lockers
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('floor_plans', 'floor_plans_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id = my_org_id())
WITH CHECK (is_super_admin() OR organization_id = my_org_id())
$b$);

SELECT _apply_rls('storage_locations', 'storage_locations_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id = my_org_id()
  OR (organization_id IS NULL AND my_solo_id() IS NOT NULL)
)
WITH CHECK (
  is_super_admin()
  OR organization_id = my_org_id()
  OR (organization_id IS NULL AND my_solo_id() IS NOT NULL)
)
$b$);

SELECT _apply_rls('student_lockers', 'student_lockers_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id = my_org_id())
WITH CHECK (is_super_admin() OR organization_id = my_org_id())
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 13: projects + child tables
-- ────────────────────────────────────────────────────────────────

-- No solo_workspace_members OR-clause here (unlike LabHive's version) —
-- ICT-Lab has no solo_workspace_members table (team-only deployment), and a
-- CREATE POLICY body referencing a nonexistent table fails at creation time.
-- That failure was silently caught by _apply_rls()'s exception handler,
-- which DISABLES RLS on the table as a fail-safe — meaning `projects` has
-- been running with RLS OFF and only its old, unrelated wide-open `p` policy
-- (ALL/public) in effect. Found + fixed Sept 2026.
SELECT _apply_rls('projects', 'projects_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id = my_org_id()
  OR solo_owner_id = my_solo_id()
)
WITH CHECK (
  is_super_admin()
  OR organization_id = my_org_id()
  OR solo_owner_id = my_solo_id()
)
$b$);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_files','project_results','project_links']
  LOOP
    PERFORM _apply_rls(t, 'project_child_policy', $b$
      FOR ALL TO authenticated
      USING (
        is_super_admin()
        OR project_id IN (SELECT id FROM projects WHERE organization_id = my_org_id() OR solo_owner_id = my_solo_id())
      )
      WITH CHECK (
        is_super_admin()
        OR project_id IN (SELECT id FROM projects WHERE organization_id = my_org_id() OR solo_owner_id = my_solo_id())
      )
    $b$);
  END LOOP;
END $$;

-- project_materials is NOT a simple project child: materials can exist
-- "standalone" (project_id NULL, "None / standalone" in NewMaterialModal),
-- and NewMaterialModal has always inserted solo_owner_id directly on this
-- table for that case — but the column never existed here, so every solo
-- user creating a standalone material has been silently rejected by RLS
-- since this table's schema was created. Found Sept 2026 while porting the
-- equivalent LabHive fix; independent pre-existing bug, not caused by any
-- code change this session. organization_id and storage_date already exist
-- and the project_id FK is already in place on this database.
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS solo_owner_id UUID;

-- agg_sieve_sizes: on LabHive this column was typed `text` instead of
-- `jsonb`, causing the app's array value to round-trip as a literal string
-- and crash any code doing `.map()` on it. Applying the same defensive
-- conversion here — safe no-op if this column is already jsonb.
UPDATE project_materials SET agg_sieve_sizes = NULL
WHERE agg_sieve_sizes IS NOT NULL AND agg_sieve_sizes::text !~ '^\s*\[.*\]\s*$';
ALTER TABLE project_materials
  ALTER COLUMN agg_sieve_sizes TYPE jsonb
  USING CASE
    WHEN agg_sieve_sizes IS NULL OR agg_sieve_sizes::text = '' THEN '[]'::jsonb
    ELSE agg_sieve_sizes::jsonb
  END;
ALTER TABLE project_materials ALTER COLUMN agg_sieve_sizes SET DEFAULT '[]'::jsonb;

SELECT _apply_rls('project_materials', 'project_materials_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR (organization_id IS NOT NULL AND organization_id = my_org_id())
  OR (solo_owner_id IS NOT NULL AND solo_owner_id = my_solo_id())
  OR project_id IN (SELECT id FROM projects WHERE organization_id = my_org_id() OR solo_owner_id = my_solo_id())
)
WITH CHECK (
  is_super_admin()
  OR (organization_id IS NOT NULL AND organization_id = my_org_id())
  OR (solo_owner_id IS NOT NULL AND solo_owner_id = my_solo_id())
  OR project_id IN (SELECT id FROM projects WHERE organization_id = my_org_id() OR solo_owner_id = my_solo_id())
)
$b$);

SELECT _apply_rls('project_record_files', 'project_record_files_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id = my_org_id() OR solo_owner_id = my_solo_id())
)
WITH CHECK (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id = my_org_id() OR solo_owner_id = my_solo_id())
)
$b$);

SELECT _apply_rls('project_supplies', 'project_supplies_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id = my_org_id())
  OR project_id IN (SELECT id FROM projects WHERE solo_owner_id = my_solo_id())
)
WITH CHECK (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id = my_org_id())
  OR project_id IN (SELECT id FROM projects WHERE solo_owner_id = my_solo_id())
)
$b$);

SELECT _apply_rls('test_result_entries', 'test_result_entries_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id = my_org_id())
  OR project_id IN (SELECT id FROM projects WHERE solo_owner_id = my_solo_id())
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id())
)
WITH CHECK (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id = my_org_id())
  OR project_id IN (SELECT id FROM projects WHERE solo_owner_id = my_solo_id())
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id())
)
$b$);

SELECT _apply_rls('analysis_comments', 'analysis_comments_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id())
)
WITH CHECK (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id())
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 14: training tables
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('training_schedule', 'training_schedule_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id = my_org_id()
  OR user_id::text = my_user_id()::text
)
WITH CHECK (
  is_super_admin()
  OR organization_id = my_org_id()
  OR user_id::text = my_user_id()::text
)
$b$);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'training_fresh','training_golf_car',
    'training_building_alarm','training_equipment'
  ]
  LOOP
    PERFORM _apply_rls(t, 'training_policy', $b$
      FOR ALL TO authenticated
      USING (
        is_super_admin()
        OR user_id::text = my_user_id()::text
        OR user_id::text IN (SELECT id::text FROM users WHERE organization_id = my_org_id())
      )
      WITH CHECK (
        is_super_admin()
        OR user_id::text = my_user_id()::text
        OR user_id::text IN (SELECT id::text FROM users WHERE organization_id = my_org_id())
      )
    $b$);
  END LOOP;
END $$;

SELECT _apply_rls('retraining_requests', 'retraining_requests_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id = my_org_id() OR user_id::text = my_user_id()::text)
WITH CHECK (is_super_admin() OR organization_id = my_org_id() OR user_id::text = my_user_id()::text)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 15: tasks, attachments, comments, out-of-lab, reminders, groups
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('tasks', 'tasks_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR (login_mode = 'team' AND organization_id = my_org_id())
  OR (login_mode = 'solo' AND created_by::text = my_solo_id()::text)
  OR assigned_to::text = my_user_id()::text
  OR assigned_to::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR (login_mode = 'team' AND organization_id = my_org_id())
  OR (login_mode = 'solo' AND created_by::text = my_solo_id()::text)
)
$b$);

SELECT _apply_rls('task_attachments', 'task_attachments_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'team' AND organization_id = my_org_id())
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'solo' AND created_by::text = my_solo_id()::text)
)
WITH CHECK (
  is_super_admin()
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'team' AND organization_id = my_org_id())
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'solo' AND created_by::text = my_solo_id()::text)
)
$b$);

SELECT _apply_rls('task_comments', 'task_comments_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'team' AND organization_id = my_org_id())
)
WITH CHECK (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'team' AND organization_id = my_org_id())
)
$b$);

SELECT _apply_rls('user_out_of_lab', 'user_out_of_lab_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR (login_mode = 'team' AND organization_id = my_org_id())
  OR user_id::text = my_user_id()::text
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR (login_mode = 'team' AND organization_id = my_org_id())
  OR user_id::text = my_user_id()::text
  OR user_id::text = my_solo_id()::text
)
$b$);

-- task_reminders (the 'reminders' name in code targets a non-existent table).
SELECT _apply_rls('task_reminders', 'task_reminders_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR user_id::text = my_solo_id()::text
)
$b$);

SELECT _apply_rls('team_task_groups', 'team_task_groups_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id = my_org_id())
WITH CHECK (is_super_admin() OR organization_id = my_org_id())
$b$);

SELECT _apply_rls('team_task_group_members', 'team_task_group_members_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR group_id IN (SELECT id FROM team_task_groups WHERE organization_id = my_org_id())
)
WITH CHECK (
  is_super_admin()
  OR group_id IN (SELECT id FROM team_task_groups WHERE organization_id = my_org_id())
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 16: meetings
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('meetings', 'meetings_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id = my_org_id())
WITH CHECK (is_super_admin() OR organization_id = my_org_id())
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 17: messages, re_messages
-- ────────────────────────────────────────────────────────────────

-- messages: real columns are user_id (text) + organization_id. Org-scoped.
SELECT _apply_rls('messages', 'messages_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id = my_org_id()
  OR user_id::text = my_user_id()::text
)
WITH CHECK (
  is_super_admin()
  OR organization_id = my_org_id()
  OR user_id::text = my_user_id()::text
)
$b$);

SELECT _apply_rls('re_messages', 're_messages_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id = my_org_id())
WITH CHECK (is_super_admin() OR organization_id = my_org_id())
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 18: notifications, admin_notifications, feedback_responses,
--          notification_prefs, support_messages, account_deletion_requests
-- ────────────────────────────────────────────────────────────────

-- notifications has only user_id (no organization_id). Managers create
-- notifications for their students, so INSERT is open; reads are owner-only.
SELECT _apply_rls('notifications', 'notifications_insert',
  $b$FOR INSERT TO authenticated WITH CHECK (true)$b$);
SELECT _apply_rls('notifications', 'notifications_select', $b$
FOR SELECT TO authenticated
USING (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR user_id::text = my_solo_id()::text
)
$b$);
SELECT _apply_rls('notifications', 'notifications_update', $b$
FOR UPDATE TO authenticated
USING (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR user_id::text = my_solo_id()::text
)
$b$);
SELECT _apply_rls('notifications', 'notifications_delete', $b$
FOR DELETE TO authenticated
USING (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR user_id::text = my_solo_id()::text
)
$b$);

SELECT _apply_rls('admin_notifications', 'admin_notif_insert',
  $b$FOR INSERT TO authenticated WITH CHECK (true)$b$);
SELECT _apply_rls('admin_notifications', 'admin_notif_select',
  $b$FOR SELECT TO authenticated USING (is_super_admin())$b$);
SELECT _apply_rls('admin_notifications', 'admin_notif_update',
  $b$FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin())$b$);

SELECT _apply_rls('feedback_responses', 'feedback_responses_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id = my_org_id()
  OR user_id::text = my_user_id()::text
)
WITH CHECK (
  is_super_admin()
  OR organization_id = my_org_id()
)
$b$);

SELECT _apply_rls('notification_prefs', 'notification_prefs_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR user_id::text = my_solo_id()::text
)
$b$);

-- Same-org members may READ each other's prefs: email notifications are
-- gated on the SENDER's session (team invites, lab messages, training) —
-- without this read the sender always sees NULL and no email is ever queued.
SELECT _apply_rls('notification_prefs', 'notification_prefs_select_org', $b$
FOR SELECT TO authenticated
USING (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR user_id::text = my_solo_id()::text
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id = my_org_id())
)
$b$);

SELECT _apply_rls('support_messages', 'support_messages_insert',
  $b$FOR INSERT TO authenticated WITH CHECK (true)$b$);
SELECT _apply_rls('support_messages', 'support_messages_select',
  $b$FOR SELECT TO authenticated USING (is_super_admin() OR user_id::text = my_user_id()::text)$b$);

SELECT _apply_rls('account_deletion_requests', 'account_deletion_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id = my_org_id()
  OR user_id::text = my_user_id()::text
)
WITH CHECK (
  is_super_admin()
  OR organization_id = my_org_id()
  OR user_id::text = my_user_id()::text
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 19: email_notifications_queue
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('email_notifications_queue', 'email_queue_insert',
  $b$FOR INSERT TO authenticated WITH CHECK (true)$b$);
SELECT _apply_rls('email_notifications_queue', 'email_queue_select', $b$
FOR SELECT TO authenticated
USING (
  is_super_admin()
  OR user_id::text = my_user_id()::text
  OR user_id::text = my_solo_id()::text
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id = my_org_id())
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 20: solo workspace tables
-- ────────────────────────────────────────────────────────────────

-- solo_workspace_invites: owner_id + invitee_email (no invitee_id).
SELECT _apply_rls('solo_workspace_invites', 'solo_workspace_invites_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR owner_id = my_solo_id()
  OR invitee_email = my_solo_email()
)
WITH CHECK (
  is_super_admin()
  OR owner_id = my_solo_id()
)
$b$);

SELECT _apply_rls('solo_workspace_members', 'solo_workspace_members_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR owner_id = my_solo_id()
  OR member_id = my_solo_id()
)
WITH CHECK (
  is_super_admin()
  OR owner_id = my_solo_id()
)
$b$);

-- solo_workspace_transfer_requests: owner_id + member_id (both FK solo_users).
SELECT _apply_rls('solo_workspace_transfer_requests', 'solo_transfer_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR owner_id  = my_solo_id()
  OR member_id = my_solo_id()
)
WITH CHECK (
  is_super_admin()
  OR owner_id  = my_solo_id()
  OR member_id = my_solo_id()
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 21: team workspace sharing
-- ────────────────────────────────────────────────────────────────

-- team_workspace_invites: inviter_id + invitee_id + organization_id.
SELECT _apply_rls('team_workspace_invites', 'team_workspace_invites_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id = my_org_id()
  OR inviter_id::text = my_user_id()::text
  OR invitee_id::text = my_user_id()::text
)
WITH CHECK (
  is_super_admin()
  OR organization_id = my_org_id()
  OR inviter_id::text = my_user_id()::text
)
$b$);

SELECT _apply_rls('team_workspace_members', 'team_workspace_members_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR owner_id::text  = my_user_id()::text
  OR member_id::text = my_user_id()::text
)
WITH CHECK (
  is_super_admin()
  OR owner_id::text = my_user_id()::text
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 21b: Legacy unused tables — lock down, don't scope
--
-- bookings, equipment, inspection_items, inspection_records,
-- material_suppliers are not referenced anywhere in the current app code —
-- leftovers from before the schema was renamed to equipment_bookings/
-- equipment_inventory/supplies/inspections. They previously carried a
-- wide-open "p" (ALL, public) policy from an older RLS attempt. Rather than
-- reverse-engineer per-org scoping for tables nothing reads, deny all access
-- except super admin — neutralizes the exposure regardless of whether the
-- data in them still matters. Found + fixed Sept 2026.
-- ────────────────────────────────────────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bookings','equipment','inspection_items','inspection_records','material_suppliers']
  LOOP
    PERFORM _apply_rls(t, 'legacy_lockdown_policy', $b$
      FOR ALL TO authenticated
      USING (is_super_admin())
      WITH CHECK (is_super_admin())
    $b$);
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────
-- STEP 22: Remove leftover permissive policies from earlier RLS attempts.
--
-- Postgres OR-combines permissive policies, so a stray "auth only" (public,
-- ALL) or "org_access" policy would grant everything and defeat the policies
-- above. We drop every policy on a table that ISN'T one we just created —
-- but only for tables that DID receive one of our policies, so any table we
-- couldn't secure (or don't manage) keeps its existing policy and is never
-- locked out.
-- ────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
  keep text[] := ARRAY[
    'settings_read_anon','settings_read_auth','settings_write',
    'orgs_policy','users_policy','solo_users_policy',
    'user_screen_access_policy','user_dashboard_prefs_policy',
    'equipment_inventory_policy','equipment_categories_policy','equipment_locations_policy',
    'equipment_booking_settings_policy','equipment_bookings_policy','booking_notifications_policy',
    'equipment_booking_blocks_policy','eq_hub_policy','equipment_sop_notes_policy','equipment_list_policy',
    'org_scope_policy','floor_plans_policy','storage_locations_policy','student_lockers_policy',
    'projects_policy','project_child_policy','project_materials_policy','project_record_files_policy','project_supplies_policy',
    'test_result_entries_policy','analysis_comments_policy',
    'training_schedule_policy','training_policy','retraining_requests_policy',
    'tasks_policy','task_attachments_policy','task_comments_policy','user_out_of_lab_policy',
    'task_reminders_policy','team_task_groups_policy','team_task_group_members_policy',
    'meetings_policy','messages_policy','re_messages_policy',
    'notifications_insert','notifications_select','notifications_update','notifications_delete',
    'admin_notif_insert','admin_notif_select','admin_notif_update',
    'feedback_responses_policy','notification_prefs_policy','notification_prefs_select_org',
    'support_messages_insert','support_messages_select',
    'account_deletion_policy','email_queue_insert','email_queue_select',
    'solo_workspace_invites_policy','solo_workspace_members_policy','solo_transfer_policy',
    'team_workspace_invites_policy','team_workspace_members_policy',
    'legacy_lockdown_policy'
  ];
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    IF r.policyname = ANY(keep) THEN CONTINUE; END IF;
    -- only prune tables we actually secured with one of our policies
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = r.tablename
        AND policyname = ANY(keep)
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
      RAISE NOTICE 'pruned legacy policy %.%', r.tablename, r.policyname;
    END IF;
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────
-- CLEANUP + VERIFY
-- ────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS _apply_rls(text, text, text);

-- After running, every table below should show ONLY our own policies.
-- Any table still showing 'auth only' / 'org_access' / etc. was NOT secured
-- (its policy failed) — check the NOTICE output for the reason.
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
