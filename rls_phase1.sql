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

-- my_user_id() is NON-DETERMINISTIC when one auth account owns several users
-- rows, which happens whenever a person holds more than one role: Login.jsx
-- auto-links every users row sharing an email to the same auth_id. `LIMIT 1`
-- with no ORDER BY then returns an arbitrary one, so an ownership check like
-- `user_id = my_user_id()` can silently evaluate false for rows the user
-- genuinely owns — on LabHive this hid a notification addressed to someone's
-- Lab User row while they were signed in under that very row. Intermittent,
-- because the row Postgres happens to return can change.
--
-- Ownership checks therefore use this set-returning version: every identity
-- behind the same auth account. That is the correct boundary — one human who
-- may sign in as any of their rows — and it does NOT widen access across
-- accounts or organizations.
CREATE OR REPLACE FUNCTION my_user_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  -- COALESCE rather than a bare equality test: a NULL is_active must not
  -- lock anyone out.
  -- Deactivating a user has to revoke DATA access, not just block the
  -- login screen — Supabase auth sessions survive deactivation, so
  -- without this a deactivated account keeps reading its org's rows.
  SELECT id FROM users WHERE auth_id::text = auth.uid()::text AND COALESCE(is_active, true)
$$;

CREATE OR REPLACE FUNCTION my_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT organization_id FROM users WHERE auth_id::text = auth.uid()::text LIMIT 1
$$;

-- Same LIMIT 1 hazard as my_user_id(): one auth account can own users rows in
-- more than one organization (a person who works with two labs), and with no
-- ORDER BY this returns an arbitrary one. Every org-scoped policy would then
-- resolve to a random org — the user sees one org's data at random, and a
-- write whose organization_id came from the app session is REJECTED by
-- WITH CHECK whenever the two disagree. Silent and intermittent.
--
-- Org scoping therefore uses this set-returning version: every organization
-- the account actually belongs to. This does not widen access — a row is only
-- reachable if one of the user's own rows is in that organization.
CREATE OR REPLACE FUNCTION my_org_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT DISTINCT organization_id FROM users
  WHERE auth_id::text = auth.uid()::text AND organization_id IS NOT NULL
    AND COALESCE(is_active, true)
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
USING    (is_super_admin() OR id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR id IN (SELECT oid FROM my_org_ids() AS oid))
$b$);


-- Per-role icon pools (layer 2 of the icon hierarchy). These never existed on
-- this database, and their absence broke far more than saving: OrgPoolEditor
-- SELECTs `allowed_modules, allowed_modules_labusers`, and PostgREST fails the
-- WHOLE request when one named column is missing. The org grant therefore came
-- back empty on every load, so icons the super admin HAD granted rendered as
-- "contact us to enable" in the org admin's own panel, with no error shown.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_modules             JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_modules_labusers    JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_modules_labmanagers JSONB;

-- ────────────────────────────────────────────────────────────────
-- STEP 5: users
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('users', 'users_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
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
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);

SELECT _apply_rls('user_dashboard_prefs', 'user_dashboard_prefs_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 8: equipment_inventory + org metadata tables
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('equipment_inventory', 'equipment_inventory_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
)
$b$);

SELECT _apply_rls('equipment_categories', 'equipment_categories_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
$b$);

SELECT _apply_rls('equipment_locations', 'equipment_locations_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
$b$);

SELECT _apply_rls('equipment_booking_settings', 'equipment_booking_settings_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 9: equipment_bookings, booking_notifications, equipment_booking_blocks
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('equipment_bookings', 'equipment_bookings_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);

SELECT _apply_rls('booking_notifications', 'booking_notifications_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);

SELECT _apply_rls('equipment_booking_blocks', 'equipment_booking_blocks_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
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
        OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
      )
      WITH CHECK (
        is_super_admin()
        OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
      )
    $b$);
  END LOOP;
END $$;

SELECT _apply_rls('equipment_sop_notes', 'equipment_sop_notes_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
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
      USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
      WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
    $b$);
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────
-- STEP 12: floor_plans, storage_locations, student_lockers
-- ────────────────────────────────────────────────────────────────

-- floor_plans never existed on this database either — same class of bug as
-- storage_locations below: _apply_rls() has been silently SKIPping this
-- policy every run (table-not-found is a no-op by design), so saving a
-- custom org-uploaded floor plan (FloorPlanEditor.jsx) failed outright with
-- "Could not find the table 'public.floor_plans' in the schema cache".
-- Schema inferred from FloorPlanEditor.jsx / FloorPlanPicker.jsx's own
-- read/write columns. Found + fixed Sept 2026.
CREATE TABLE IF NOT EXISTS floor_plans (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID,
  name            TEXT,
  image_url       TEXT,
  zones           JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS floor_plans_organization_id_idx ON floor_plans(organization_id);

SELECT _apply_rls('floor_plans', 'floor_plans_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
$b$);

-- storage_locations never existed on this database — _apply_rls() has been
-- silently SKIPping this policy every run (table-not-found is a no-op by
-- design), so the floor-plan "show zones occupied by other materials"
-- cross-material tracking has never worked here. A material's OWN saved
-- location still displays fine (that lives on project_materials.locations),
-- only the shared occupancy table was missing. Schema mirrors LabHive's
-- working table, inferred from FloorPlanPicker.jsx's own read/write columns.
-- Found + fixed Sept 2026.
CREATE TABLE IF NOT EXISTS storage_locations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id     TEXT NOT NULL,
  location_label  TEXT,
  facility        TEXT,
  occupied        BOOLEAN DEFAULT FALSE,
  project_id      UUID,
  material_id     UUID,
  project_name    TEXT,
  material_type   TEXT,
  occupied_at     TIMESTAMPTZ,
  occupied_by     TEXT,
  organization_id UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS storage_locations_location_id_idx ON storage_locations(location_id);
CREATE INDEX IF NOT EXISTS storage_locations_material_id_idx ON storage_locations(material_id);

SELECT _apply_rls('storage_locations', 'storage_locations_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR (organization_id IS NULL AND my_solo_id() IS NOT NULL)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR (organization_id IS NULL AND my_solo_id() IS NOT NULL)
)
$b$);

-- lab_user_lockers schema repair. The two projects' locker tables had drifted
-- apart: ICT-Lab was missing assigned_at and notes entirely, so assigning a
-- locker failed with "Could not find the 'assigned_at' column" — the shared
-- TrainingRecords upsert writes both. Added with IF NOT EXISTS so whichever
-- project already has them is untouched.
ALTER TABLE lab_user_lockers ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE lab_user_lockers ADD COLUMN IF NOT EXISTS notes       TEXT;

-- The assign upsert uses onConflict 'organization_id,locker_number', and
-- Postgres rejects that outright without a matching unique index (same trap as
-- feedback_responses). Created only when no duplicate pair exists, so a table
-- with existing duplicates reports instead of failing the whole script.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM lab_user_lockers
    GROUP BY organization_id, locker_number HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS lab_user_lockers_org_number_uniq
      ON lab_user_lockers (organization_id, locker_number);
  ELSE
    RAISE NOTICE 'lab_user_lockers: duplicate (organization_id, locker_number) rows — unique index NOT created; locker assignment will keep failing until they are resolved';
  END IF;
END $$;

SELECT _apply_rls('lab_user_lockers', 'lab_user_lockers_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
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
-- Who created a project. Recorded from the session at insert time and shown
-- in Project Info; rows that predate this column read as "Not recorded".
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by TEXT;

SELECT _apply_rls('projects', 'projects_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR solo_owner_id = my_solo_id()
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR solo_owner_id = my_solo_id()
)
$b$);

-- project_results / project_links never existed in this project. ICT has no
-- Test Results tab, so nothing reads them — but Profile.jsx's user-deletion
-- and data-export paths DELETE from both, which errored every time and (since
-- Sept 2026's REST logging) writes an admin_notifications row on each attempt.
-- Creating them empty makes those cleanup paths no-ops instead of failures.
-- Columns mirror labhive. project_files is intentionally NOT created: nothing
-- in this app reads or writes it (ProjectDatabase.jsx is not routed).
CREATE TABLE IF NOT EXISTS project_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID,
  submitted_by TEXT,
  result_type  TEXT,
  description  TEXT,
  result_date  DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_results_project_idx ON project_results(project_id);

CREATE TABLE IF NOT EXISTS project_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  title      TEXT,
  url        TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_links_project_idx ON project_links(project_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_files','project_results','project_links']
  LOOP
    PERFORM _apply_rls(t, 'project_child_policy', $b$
      FOR ALL TO authenticated
      USING (
        is_super_admin()
        OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR solo_owner_id = my_solo_id())
      )
      WITH CHECK (
        is_super_admin()
        OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR solo_owner_id = my_solo_id())
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

-- barcode_id identifies a physically printed label, so duplicates are a real
-- hazard: two containers scanning to the same record. There was no constraint
-- at all, and the old generator numbered by position within the loaded list,
-- so collisions were easy to produce. Guarded so a table that already holds
-- duplicates reports them instead of failing the whole script.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM project_materials
    WHERE barcode_id IS NOT NULL
    GROUP BY barcode_id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'project_materials: duplicate barcode_id values — unique index NOT created. Resolve them, then re-run.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS project_materials_barcode_id_uniq
      ON project_materials (barcode_id) WHERE barcode_id IS NOT NULL;
  END IF;
END $$;

-- Material reduction: a derived material (e.g. one sieve fraction) points back
-- at the material it came from. Kept on project_materials rather than a join
-- table because a fraction IS a material — it needs its own barcode, storage
-- location, quantity and QR label like any other.
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS parent_material_id UUID;
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS reduction_method   TEXT;
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS reduction_value    TEXT;
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS reduction_date     DATE;
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS reduction_count    INTEGER;
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS additional_info    TEXT;
CREATE INDEX IF NOT EXISTS project_materials_parent_idx ON project_materials(parent_material_id);

-- ON DELETE SET NULL, not CASCADE: deleting a parent must not silently destroy
-- fractions that physically exist on a shelf.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_materials_parent_fkey') THEN
    ALTER TABLE project_materials
      ADD CONSTRAINT project_materials_parent_fkey
      FOREIGN KEY (parent_material_id) REFERENCES project_materials(id) ON DELETE SET NULL;
  END IF;
END $$;

SELECT _apply_rls('project_materials', 'project_materials_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR (organization_id IS NOT NULL AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR (solo_owner_id IS NOT NULL AND solo_owner_id = my_solo_id())
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR solo_owner_id = my_solo_id())
)
WITH CHECK (
  is_super_admin()
  OR (organization_id IS NOT NULL AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR (solo_owner_id IS NOT NULL AND solo_owner_id = my_solo_id())
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR solo_owner_id = my_solo_id())
)
$b$);

SELECT _apply_rls('project_record_files', 'project_record_files_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR solo_owner_id = my_solo_id())
)
WITH CHECK (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR solo_owner_id = my_solo_id())
)
$b$);

SELECT _apply_rls('project_supplies', 'project_supplies_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR project_id IN (SELECT id FROM projects WHERE solo_owner_id = my_solo_id())
)
WITH CHECK (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR project_id IN (SELECT id FROM projects WHERE solo_owner_id = my_solo_id())
)
$b$);

SELECT _apply_rls('test_result_entries', 'test_result_entries_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR project_id IN (SELECT id FROM projects WHERE solo_owner_id = my_solo_id())
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR project_id IN (SELECT id FROM projects WHERE solo_owner_id = my_solo_id())
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);

SELECT _apply_rls('analysis_comments', 'analysis_comments_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 14: training tables
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('training_schedule', 'training_schedule_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
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
        OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
        OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
      )
      WITH CHECK (
        is_super_admin()
        OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
        OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
      )
    $b$);
  END LOOP;
END $$;

SELECT _apply_rls('retraining_requests', 'retraining_requests_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid))
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 15: tasks, attachments, comments, out-of-lab, reminders, groups
-- ────────────────────────────────────────────────────────────────

-- Tasks belong to a project. Before this the Task Board and Projects were two
-- unconnected worlds: project_id appeared nowhere in PM.jsx at all.
-- Nullable on purpose — plenty of lab work is not tied to one project.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID;
CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks(project_id);

-- One row per change to a task's progress or status. tasks.progress holds only
-- the CURRENT value, so a chart of the past cannot be derived from it — the
-- history has to be written as it happens or it does not exist.
CREATE TABLE IF NOT EXISTS task_progress_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL,
  progress        INTEGER NOT NULL DEFAULT 0,
  status          TEXT,
  changed_by      UUID,
  organization_id UUID,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS task_progress_log_task_idx ON task_progress_log(task_id, changed_at);

SELECT _apply_rls('task_progress_log', 'task_progress_log_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'solo' AND created_by::text = my_solo_id()::text)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'solo' AND created_by::text = my_solo_id()::text)
)
$b$);

-- Task dependencies: task_id waits on depends_on_id.
-- The unique index is not cosmetic — the "waits on" picker would otherwise
-- happily add the same edge twice and double-count it in the critical path.
-- Cycles are prevented in the app before the insert; the database cannot
-- express "no cycles" as a constraint.
CREATE TABLE IF NOT EXISTS task_dependencies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL,
  depends_on_id   UUID NOT NULL,
  organization_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_dependencies_no_self CHECK (task_id <> depends_on_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS task_dependencies_pair_uniq
  ON task_dependencies (task_id, depends_on_id);
CREATE INDEX IF NOT EXISTS task_dependencies_task_idx ON task_dependencies(task_id);

-- ---------------------------------------------------------------------------
-- reminder_sends — one row per reminder actually delivered.
--
-- Dedup lives in the database, not in localStorage, for two reasons: the cron
-- job and the browser both send daily reminders and must not both send the
-- same one, and a per-browser marker meant a user with a laptop and a phone
-- got the same reminder twice.
--
-- The unique index COALESCEs ref_id: the daily summary has no task id, and in
-- a plain unique index NULLs never collide, so every run would insert a fresh
-- row and nothing would ever be deduped.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminder_sends (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  kind            TEXT NOT NULL,          -- 'daily_tasks' | 'deadline_tomorrow'
  ref_id          UUID,                   -- task id where the reminder is per-task
  sent_for        DATE NOT NULL,
  organization_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS reminder_sends_uniq ON reminder_sends
  (user_id, kind, COALESCE(ref_id, '00000000-0000-0000-0000-000000000000'::uuid), sent_for);
CREATE INDEX IF NOT EXISTS reminder_sends_day_idx ON reminder_sends (sent_for);

SELECT _apply_rls('reminder_sends', 'reminder_sends_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);

SELECT _apply_rls('task_dependencies', 'task_dependencies_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'solo' AND created_by::text = my_solo_id()::text)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'solo' AND created_by::text = my_solo_id()::text)
)
$b$);

SELECT _apply_rls('tasks', 'tasks_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR (login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR (login_mode = 'solo' AND created_by::text = my_solo_id()::text)
  OR assigned_to::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR assigned_to::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR (login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR (login_mode = 'solo' AND created_by::text = my_solo_id()::text)
)
$b$);

SELECT _apply_rls('task_attachments', 'task_attachments_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'solo' AND created_by::text = my_solo_id()::text)
)
WITH CHECK (
  is_super_admin()
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'solo' AND created_by::text = my_solo_id()::text)
)
$b$);

SELECT _apply_rls('task_comments', 'task_comments_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);

SELECT _apply_rls('user_out_of_lab', 'user_out_of_lab_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR (login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR (login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);

-- 'reminders' IS the table the app actually uses — PM.jsx reads and writes it
-- and Admin.jsx deletes from it, while 'task_reminders' below is referenced
-- nowhere in src/. The old comment claiming otherwise meant this table went
-- unsecured: it holds per-user reminders keyed only by user_id, and the client
-- filters by user_id alone, so without a policy any authenticated user could
-- read or edit anyone else's. Both names are covered — _apply_rls skips
-- whichever does not exist.
SELECT _apply_rls('reminders', 'reminders_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);

-- lab_safety_progress — per-user safety step completion. Was missing entirely;
-- TrainingRecords.jsx queries it by user_id list with no org filter.
SELECT _apply_rls('lab_safety_progress', 'lab_safety_progress_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);

-- ict_layout — floor-plan spots and facility tab order (key/value, org-wide
-- config). Single-org today, but it was the last table with no policy at all.
SELECT _apply_rls('ict_layout', 'ict_layout_policy', $b$
FOR ALL TO authenticated
USING    (true)
WITH CHECK (is_super_admin() OR my_user_id() IS NOT NULL)
$b$);

SELECT _apply_rls('task_reminders', 'task_reminders_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);

-- team_task_groups / team_task_group_members back the Task Board's Team tab,
-- which is in the PM sidebar for every non-solo user. Neither table existed
-- here, so the tab never worked — and PM.jsx queries team_task_group_members
-- on EVERY Task Board load, so each visit also logged a failed REST call.
-- Columns mirror labhive.
CREATE TABLE IF NOT EXISTS team_task_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  organization_id UUID,
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS team_task_groups_org_idx ON team_task_groups(organization_id);

CREATE TABLE IF NOT EXISTS team_task_group_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID,
  user_id    UUID,
  invited_by UUID,
  status     TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS team_task_group_members_group_idx ON team_task_group_members(group_id);
CREATE INDEX IF NOT EXISTS team_task_group_members_user_idx  ON team_task_group_members(user_id);

SELECT _apply_rls('team_task_groups', 'team_task_groups_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
$b$);

SELECT _apply_rls('team_task_group_members', 'team_task_group_members_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR group_id IN (SELECT id FROM team_task_groups WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR group_id IN (SELECT id FROM team_task_groups WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 16: meetings
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('meetings', 'meetings_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 17: messages, re_messages
-- ────────────────────────────────────────────────────────────────

-- messages: real columns are user_id (text) + organization_id. Org-scoped.
SELECT _apply_rls('messages', 'messages_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
$b$);

-- re_messages — backs the Lab Messages screen (routed in App.jsx, shown as a
-- staff-only dashboard icon). The table was never created in this project, so
-- every read came back empty and every send failed. Columns mirror labhive.
-- sender_id / receiver_id are TEXT here, matching labhive and the ::text casts
-- the policy below uses.
CREATE TABLE IF NOT EXISTS re_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id       TEXT,
  sender_name     TEXT,
  receiver_id     TEXT,
  receiver_name   TEXT,
  subject         TEXT,
  body            TEXT,
  category        TEXT,
  status          TEXT DEFAULT 'open',
  reply           TEXT,
  attachment_url  TEXT,
  file_url        TEXT,
  file_name       TEXT,
  parent_id       UUID,
  is_read         BOOLEAN DEFAULT FALSE,
  edited          BOOLEAN DEFAULT FALSE,
  edited_at       TIMESTAMPTZ,
  organization_id UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS re_messages_org_idx    ON re_messages(organization_id);
CREATE INDEX IF NOT EXISTS re_messages_parent_idx ON re_messages(parent_id);

SELECT _apply_rls('re_messages', 're_messages_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
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
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);
SELECT _apply_rls('notifications', 'notifications_update', $b$
FOR UPDATE TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);
SELECT _apply_rls('notifications', 'notifications_delete', $b$
FOR DELETE TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);

SELECT _apply_rls('admin_notifications', 'admin_notif_insert',
  $b$FOR INSERT TO authenticated WITH CHECK (true)$b$);
SELECT _apply_rls('admin_notifications', 'admin_notif_select',
  $b$FOR SELECT TO authenticated USING (is_super_admin())$b$);
SELECT _apply_rls('admin_notifications', 'admin_notif_update',
  $b$FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin())$b$);

-- feedback_responses — backs the FeedbackWidget, which is mounted in this app.
-- The UNIQUE constraint is REQUIRED, not cosmetic: FeedbackWidget upserts with
-- onConflict 'organization_id,user_id,module_key', and Postgres rejects that
-- outright without a matching unique index.
CREATE TABLE IF NOT EXISTS feedback_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  user_id         UUID,
  module_key      TEXT NOT NULL,
  comment         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT feedback_responses_org_user_module_key UNIQUE (organization_id, user_id, module_key)
);

SELECT _apply_rls('feedback_responses', 'feedback_responses_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
)
$b$);

SELECT _apply_rls('notification_prefs', 'notification_prefs_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
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
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);

SELECT _apply_rls('support_messages', 'support_messages_insert',
  $b$FOR INSERT TO authenticated WITH CHECK (true)$b$);
SELECT _apply_rls('support_messages', 'support_messages_select',
  $b$FOR SELECT TO authenticated USING (is_super_admin() OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid))$b$);

-- account_deletion_requests — backs the account-deletion flow in Profile, and
-- the review UI in Admin and LabManagement. Never created in this project, so
-- requests could not be submitted or reviewed.
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL,
  user_name               TEXT NOT NULL,
  organization_id         UUID NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'pending',
  suggested_transfer_to   UUID,
  suggested_transfer_name TEXT,
  requested_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by             UUID,
  reviewed_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS account_deletion_requests_org_idx ON account_deletion_requests(organization_id);

SELECT _apply_rls('account_deletion_requests', 'account_deletion_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
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
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
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
-- team_workspace_invites / team_workspace_members back TeamMembersPanel, shown
-- as the "Project Team" tab in every lab manager's and lab user's profile
-- sidebar. Neither table existed here, so the tab was non-functional.
-- Columns mirror labhive.
CREATE TABLE IF NOT EXISTS team_workspace_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id      UUID NOT NULL,
  invitee_id      UUID NOT NULL,
  organization_id UUID NOT NULL,
  status          TEXT DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS team_workspace_invites_invitee_idx ON team_workspace_invites(invitee_id);

CREATE TABLE IF NOT EXISTS team_workspace_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL,
  member_id       UUID NOT NULL,
  organization_id UUID NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS team_workspace_members_owner_idx  ON team_workspace_members(owner_id);
CREATE INDEX IF NOT EXISTS team_workspace_members_member_idx ON team_workspace_members(member_id);

-- Safety Data Sheets shown under Training Records. Org-wide reference
-- material: everyone in the lab reads the same sheets, so the whole org can
-- SELECT, while only lab managers and admins write. The write restriction is
-- enforced in the UI and here — a lab user who called the API directly would
-- otherwise be able to delete the lab's SDS library.
CREATE TABLE IF NOT EXISTS sds_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'file',
  file_url        TEXT,
  file_path       TEXT,
  file_name       TEXT,
  file_size       BIGINT,
  link_url        TEXT,
  organization_id UUID,
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sds_documents_org_idx ON sds_documents(organization_id);

SELECT _apply_rls('sds_documents', 'sds_documents_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
)
WITH CHECK (
  is_super_admin()
  OR (
    organization_id IN (SELECT oid FROM my_org_ids() AS oid)
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
        AND u.role IN ('admin', 'user')
    )
  )
)
$b$);

SELECT _apply_rls('team_workspace_invites', 'team_workspace_invites_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR inviter_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR invitee_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR inviter_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
$b$);

SELECT _apply_rls('team_workspace_members', 'team_workspace_members_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR owner_id::text  IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR member_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
WITH CHECK (
  is_super_admin()
  OR owner_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
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
    'org_scope_policy','floor_plans_policy','storage_locations_policy','lab_user_lockers_policy',
    'projects_policy','project_child_policy','project_materials_policy','project_record_files_policy','project_supplies_policy',
    'test_result_entries_policy','analysis_comments_policy',
    'training_schedule_policy','training_policy','retraining_requests_policy',
    'task_progress_log_policy',
    'task_dependencies_policy',
    'reminder_sends_policy',
    'vehicle_agreements_policy',
    'tasks_policy','task_attachments_policy','task_comments_policy','user_out_of_lab_policy',
    'task_reminders_policy','reminders_policy','lab_safety_progress_policy',
    'ict_layout_policy',
    'team_task_groups_policy','team_task_group_members_policy',
    'meetings_policy','messages_policy','re_messages_policy',
    'notifications_insert','notifications_select','notifications_update','notifications_delete',
    'admin_notif_insert','admin_notif_select','admin_notif_update',
    'feedback_responses_policy','notification_prefs_policy','notification_prefs_select_org',
    'support_messages_insert','support_messages_select',
    'account_deletion_policy','email_queue_insert','email_queue_select',
    'solo_workspace_invites_policy','solo_workspace_members_policy','solo_transfer_policy',
    'team_workspace_invites_policy','team_workspace_members_policy',
    'sds_documents_policy',
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
