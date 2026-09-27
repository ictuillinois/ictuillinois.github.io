-- Equipment form columns (Sept 2026). Run in BOTH projects (ICT-Lab and
-- LabHive) — separate databases. Idempotent: safe to re-run.
--
-- Every column the equipment form (EquipmentInventory.jsx → EquipmentModal)
-- writes. PostgREST rejects the WHOLE save if even one is missing, and until
-- Sept 2026 the form ignored that error and toasted "Equipment saved." —
-- maintenance_assignees was never created anywhere, so equipment saves were
-- failing silently. ADD COLUMN IF NOT EXISTS leaves existing columns alone.

ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS equipment_name            TEXT,
  ADD COLUMN IF NOT EXISTS nickname                  TEXT,
  ADD COLUMN IF NOT EXISTS location                  TEXT,
  ADD COLUMN IF NOT EXISTS category                  TEXT,
  ADD COLUMN IF NOT EXISTS ref_id                    TEXT,
  ADD COLUMN IF NOT EXISTS model_number              TEXT,
  ADD COLUMN IF NOT EXISTS serial_number             TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer              TEXT,
  ADD COLUMN IF NOT EXISTS date_received             DATE,
  ADD COLUMN IF NOT EXISTS condition                 TEXT DEFAULT 'Good',
  ADD COLUMN IF NOT EXISTS notes                     TEXT,
  ADD COLUMN IF NOT EXISTS website                   TEXT,
  ADD COLUMN IF NOT EXISTS out_of_service            BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS maintenance_interval_days INTEGER,
  ADD COLUMN IF NOT EXISTS last_maintenance_date     DATE,
  ADD COLUMN IF NOT EXISTS next_maintenance_date     DATE,
  -- [{ id, name, remind }] — lab managers assigned to this item's maintenance
  ADD COLUMN IF NOT EXISTS maintenance_assignees     JSONB,
  ADD COLUMN IF NOT EXISTS updated_at                TIMESTAMPTZ DEFAULT NOW(),
  -- "Lab user access" tick box. TRUE = lab users see it in the equipment
  -- list, booking and training lists; FALSE = lab managers and admins only
  -- (maintenance / calibration items). Defaults TRUE so nothing disappears
  -- until someone unticks it. Lab users' equipment queries filter on this,
  -- so it must exist before they open the new build.
  ADD COLUMN IF NOT EXISTS lab_user_access           BOOLEAN NOT NULL DEFAULT TRUE,
  -- With access on, the areas it is still hidden from lab users in:
  -- list, maintenance, sop, booking, training, exam (see equipmentAccess.js).
  -- 'training' hidden = no training needed; booking stops requiring it.
  -- NOT NULL matters: lab users' queries use not.cs, which drops NULL rows.
  ADD COLUMN IF NOT EXISTS lab_user_hidden_areas     TEXT[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
