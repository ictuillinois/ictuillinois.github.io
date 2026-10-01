-- Tested materials (Sept 2026) — the "Tested materials label" tab.
-- Run in BOTH projects (ICT-Lab and LabHive): separate databases. Idempotent.
--
-- One row per tested sample. A tested sample is its own physical thing on a
-- shelf, so it gets its own id, barcode and QR — never the material's.
-- A material can be tested more than once, hence a table, not columns.

CREATE TABLE IF NOT EXISTS tested_materials (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ON DELETE SET NULL, never CASCADE: deleting the material must not erase
  -- the record of a sample that physically exists.
  material_id             UUID REFERENCES project_materials(id) ON DELETE SET NULL,
  project_id              UUID,
  organization_id         UUID,
  solo_owner_id           UUID,
  test_type               TEXT NOT NULL,          -- max 30 chars (label width), enforced in the app
  test_date               DATE,
  storage_location        TEXT,                   -- Tent, Shed, High bay A/B/C, MPF, Other
  storage_location_other  TEXT,                   -- when storage_location = 'Other'
  photo_url               TEXT,                   -- not printed on the label
  barcode_id              TEXT,
  created_by              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS tested_materials_barcode_uniq ON tested_materials (barcode_id) WHERE barcode_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tested_materials_material_idx ON tested_materials (material_id);

-- The "Tested" pill (Sept 2026): a label for one or more projects or
-- non-project materials, or for something not in the app at all ("Other").
-- material_id stays NULL for those. label_lines is the label as printed, each
-- line with `off` if it was removed to fit, so Reprint gives the same label.
ALTER TABLE tested_materials
  ADD COLUMN IF NOT EXISTS items                JSONB,    -- [{ kind: 'project'|'material', id, name }]
  ADD COLUMN IF NOT EXISTS other_material_name  TEXT,
  ADD COLUMN IF NOT EXISTS other_project        TEXT,
  ADD COLUMN IF NOT EXISTS additional_info      TEXT,
  ADD COLUMN IF NOT EXISTS include_project_info BOOLEAN,
  ADD COLUMN IF NOT EXISTS label_lines          JSONB;

-- Same scoping as project_materials. Written out here because _apply_rls only
-- exists while rls_phase1.sql runs; that file carries the same policy too.
ALTER TABLE tested_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tested_materials_policy ON tested_materials;
CREATE POLICY tested_materials_policy ON tested_materials
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
);

NOTIFY pgrst, 'reload schema';

-- Check: expect one row, rls = true, policies = 1.
SELECT c.relname, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'tested_materials';
