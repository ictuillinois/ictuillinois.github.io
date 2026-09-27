-- Equipment: "Lab user access" tick box (Sept 2026).
-- Run in BOTH projects (ICT-Lab and LabHive) — separate databases.
--
-- TRUE  = lab users see it in the equipment list, booking and training lists.
-- FALSE = lab managers and admins only (maintenance / calibration items).
-- Defaults TRUE so every existing item stays visible until someone unticks it.
--
-- Run this BEFORE lab users open the new build: their equipment queries filter
-- on this column, and PostgREST rejects the whole request if it is missing.
ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS lab_user_access BOOLEAN NOT NULL DEFAULT TRUE;

NOTIFY pgrst, 'reload schema';
