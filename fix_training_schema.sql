-- Fix: create all Training Records tables missing from ictlab Supabase.
-- Run once in Supabase SQL Editor.
-- Safe to re-run — all statements use IF NOT EXISTS.

-- ── 1. lab_safety_progress ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_safety_progress (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  step_number     integer NOT NULL,
  completed       boolean DEFAULT false,
  certificate_url text,
  submitted_at    timestamptz,
  organization_id uuid,
  approved_by     text,
  approved_at     timestamptz,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, step_number)
);

-- ── 2. training_fresh (Documents tab — certificate uploads) ───────────────────
CREATE TABLE IF NOT EXISTS training_fresh (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   text,
  certificate_url           text,
  certificate_name          text,
  certificate_uploaded_at   timestamptz,
  admin_approved            boolean DEFAULT false,
  admin_approved_by         text,
  admin_approved_at         timestamptz,
  organization_id           uuid,
  created_at                timestamptz DEFAULT now()
);

-- ── 3. training_golf_car (Vehicle tab) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_golf_car (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text,
  vehicle_name    text,
  trained         boolean DEFAULT false,
  trained_date    date,
  trained_by      text,
  confirmation    text,
  trainer_name    text,
  organization_id uuid,
  created_at      timestamptz DEFAULT now()
);

-- ── 4. training_equipment (Equipment Exam tab) ────────────────────────────────
CREATE TABLE IF NOT EXISTS training_equipment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text,
  equipment_id    uuid,
  trained_date    date,
  trained_by      text,
  passed_exam     boolean DEFAULT false,
  expires_at      date,
  organization_id uuid,
  created_at      timestamptz DEFAULT now()
);

-- ── 5. training_building_alarm (Alarm tab) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_building_alarm (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text,
  trained         boolean DEFAULT false,
  trained_date    date,
  trained_by      text,
  key_given       boolean DEFAULT false,
  key_given_date  date,
  organization_id uuid,
  created_at      timestamptz DEFAULT now()
);

-- ── 6. student_lockers (Locker tab) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_lockers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locker_number   integer,
  user_id         text,
  user_name       text,
  assigned_by     text,
  is_unavailable  boolean DEFAULT false,
  organization_id uuid,
  created_at      timestamptz DEFAULT now()
);

-- ── Ensure organization_id exists on any pre-existing tables ─────────────────
-- (CREATE TABLE IF NOT EXISTS skips if table already exists, so these columns
--  might be missing from tables created by an older schema.)
ALTER TABLE lab_safety_progress     ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE training_fresh          ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE training_golf_car       ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE training_equipment      ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE training_building_alarm ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE student_lockers         ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Also add any other columns that may be missing on pre-existing tables
ALTER TABLE training_golf_car       ADD COLUMN IF NOT EXISTS confirmation  text;
ALTER TABLE training_golf_car       ADD COLUMN IF NOT EXISTS trainer_name  text;
ALTER TABLE training_building_alarm ADD COLUMN IF NOT EXISTS key_given      boolean DEFAULT false;
ALTER TABLE training_building_alarm ADD COLUMN IF NOT EXISTS key_given_date date;
ALTER TABLE lab_safety_progress     ADD COLUMN IF NOT EXISTS approved_by   text;
ALTER TABLE lab_safety_progress     ADD COLUMN IF NOT EXISTS approved_at   timestamptz;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_safety_prog_user  ON lab_safety_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_safety_prog_org   ON lab_safety_progress(organization_id);
CREATE INDEX IF NOT EXISTS idx_fresh_user        ON training_fresh(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_user         ON training_golf_car(user_id);
CREATE INDEX IF NOT EXISTS idx_equip_train_user  ON training_equipment(user_id);
CREATE INDEX IF NOT EXISTS idx_alarm_user        ON training_building_alarm(user_id);
CREATE INDEX IF NOT EXISTS idx_lockers_org       ON student_lockers(organization_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE lab_safety_progress  ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_fresh       ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_golf_car    ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_equipment   ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_building_alarm ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_lockers      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS safety_prog_policy ON lab_safety_progress;
DROP POLICY IF EXISTS fresh_policy       ON training_fresh;
DROP POLICY IF EXISTS golf_policy        ON training_golf_car;
DROP POLICY IF EXISTS equip_train_policy ON training_equipment;
DROP POLICY IF EXISTS alarm_policy       ON training_building_alarm;
DROP POLICY IF EXISTS lockers_policy     ON student_lockers;

-- lab_safety_progress: lab user sees their own; managers see org
CREATE POLICY safety_prog_policy ON lab_safety_progress FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR organization_id = my_org_id()
    OR user_id = my_user_id()
  )
  WITH CHECK (
    is_super_admin()
    OR organization_id = my_org_id()
    OR user_id = my_user_id()
  );

-- training_fresh: org-scoped
CREATE POLICY fresh_policy ON training_fresh FOR ALL TO authenticated
  USING    (is_super_admin() OR organization_id = my_org_id() OR user_id::text = my_user_id()::text)
  WITH CHECK (is_super_admin() OR organization_id = my_org_id() OR user_id::text = my_user_id()::text);

CREATE POLICY golf_policy ON training_golf_car FOR ALL TO authenticated
  USING    (is_super_admin() OR organization_id = my_org_id() OR user_id::text = my_user_id()::text)
  WITH CHECK (is_super_admin() OR organization_id = my_org_id() OR user_id::text = my_user_id()::text);

CREATE POLICY equip_train_policy ON training_equipment FOR ALL TO authenticated
  USING    (is_super_admin() OR organization_id = my_org_id() OR user_id::text = my_user_id()::text)
  WITH CHECK (is_super_admin() OR organization_id = my_org_id() OR user_id::text = my_user_id()::text);

CREATE POLICY alarm_policy ON training_building_alarm FOR ALL TO authenticated
  USING    (is_super_admin() OR organization_id = my_org_id() OR user_id::text = my_user_id()::text)
  WITH CHECK (is_super_admin() OR organization_id = my_org_id() OR user_id::text = my_user_id()::text);

CREATE POLICY lockers_policy ON student_lockers FOR ALL TO authenticated
  USING    (is_super_admin() OR organization_id = my_org_id())
  WITH CHECK (is_super_admin() OR organization_id = my_org_id());

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'lab_safety_progress','training_fresh','training_golf_car',
    'training_equipment','training_building_alarm','student_lockers'
  )
ORDER BY table_name;
