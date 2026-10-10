-- ===========================================================================
-- ICT vehicle list + vehicle requests (Oct 2026). ICT-Lab only. Idempotent.
-- Run AFTER training_privacy.sql (it reuses guard_training_approval()).
-- ===========================================================================
-- org_vehicles     the vehicles a lab user can ask to drive. Everyone in the
--                  organization reads it (lab users choose from it); only lab
--                  managers and admins add, edit or remove. "Remove" sets
--                  is_active = false, so past requests keep their vehicle.
-- vehicle_access   one row per person per vehicle: requested by the lab user,
--                  then confirmed or declined by a lab manager once the
--                  vehicle forms are approved. A lab user can create and
--                  withdraw their own request but never confirm it.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS org_vehicles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS org_vehicles_org_idx ON org_vehicles (organization_id, is_active);

CREATE TABLE IF NOT EXISTS vehicle_access (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  vehicle_id        UUID NOT NULL REFERENCES org_vehicles(id),   -- no CASCADE: vehicles are hidden, not deleted
  organization_id   UUID,
  status            TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'declined')),
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_by      TEXT,
  confirmed_by_name TEXT,
  confirmed_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_access_user_vehicle_uniq ON vehicle_access (user_id, vehicle_id);

ALTER TABLE org_vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_vehicles_read ON org_vehicles;
DROP POLICY IF EXISTS org_vehicles_manage ON org_vehicles;
CREATE POLICY org_vehicles_read ON org_vehicles FOR SELECT TO authenticated
  USING (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid));
CREATE POLICY org_vehicles_manage ON org_vehicles FOR ALL TO authenticated
  USING (is_super_admin() OR organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid))
  WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid));

ALTER TABLE vehicle_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicle_access_policy ON vehicle_access;
CREATE POLICY vehicle_access_policy ON vehicle_access FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid))
);

-- A lab user's own request always starts "requested", and they cannot change
-- its status or who confirmed it.
DROP TRIGGER IF EXISTS guard_training_approval_trg ON vehicle_access;
CREATE TRIGGER guard_training_approval_trg BEFORE INSERT OR UPDATE ON vehicle_access
  FOR EACH ROW EXECUTE FUNCTION guard_training_approval('status,confirmed_by,confirmed_by_name,confirmed_at', '{"status": "requested"}');

NOTIFY pgrst, 'reload schema';

-- Check: three policies across the two tables, and the guard.
SELECT tablename, string_agg(policyname, ', ') AS policies FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('org_vehicles', 'vehicle_access') GROUP BY 1 ORDER BY 1;
