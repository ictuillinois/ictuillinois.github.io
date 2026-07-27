-- ============================================================
-- original-ilab — Organization multi-tenancy migration
-- Run ONCE in Supabase SQL Editor on the original-ilab project.
-- Safe to re-run — all statements use IF NOT EXISTS / IF EXISTS.
-- ============================================================

-- ── 1. Create organizations table ────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DO $p$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'anon_all_organizations'
  ) THEN
    CREATE POLICY anon_all_organizations ON organizations FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $p$;

-- Seed ICT as the first organization (pro-ilab data will map to this)
INSERT INTO organizations (name, slug) VALUES ('ICT', 'ict')
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Add must_change_password to users ─────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- ── 3. Add organization_id to all team data tables ───────────
-- Solo tables (solo_users, solo_workspace_*) are NOT touched.
-- Pure child tables accessed only via parent FK are NOT touched.

-- Supply inventory
ALTER TABLE rooms          ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE supplies       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE inspections    ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- Projects (solo projects use solo_owner_id; team projects use organization_id)
ALTER TABLE projects       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE storage_locations ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- Equipment (main tables only; details/videos/sop/standards are child rows via equipment_id)
ALTER TABLE equipment_inventory      ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE equipment_categories     ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE equipment_exam_results   ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE equipment_material_progress ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE equipment_temp_access    ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE equipment_bookings       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE equipment_booking_settings ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE retraining_requests      ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- Training
ALTER TABLE training_fresh          ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE training_golf_car       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE training_building_alarm ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE training_equipment      ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE training_schedule       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE student_lockers         ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- Project management
ALTER TABLE tasks          ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE task_reminders ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE meetings       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE messages       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE re_messages    ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- Notifications & user prefs
ALTER TABLE notifications        ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE user_screen_access   ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE user_dashboard_prefs ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- ── 4. Indexes for performance ───────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_org          ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_rooms_org          ON rooms(organization_id);
CREATE INDEX IF NOT EXISTS idx_supplies_org       ON supplies(organization_id);
CREATE INDEX IF NOT EXISTS idx_inspections_org    ON inspections(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_org       ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_equipment_org      ON equipment_inventory(organization_id);
CREATE INDEX IF NOT EXISTS idx_bookings_org       ON equipment_bookings(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org          ON tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_org       ON messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_re_messages_org    ON re_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org  ON notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_training_fresh_org ON training_fresh(organization_id);

-- ── Done ─────────────────────────────────────────────────────
-- After running this:
-- 1. Note the ICT organization UUID:
--    SELECT id, name FROM organizations WHERE slug = 'ict';
-- 2. Use that UUID when running migrate.mjs to import pro-ilab data.
