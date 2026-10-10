-- Vehicle agreements: lab users may read only their own signed forms (Oct 2026).
-- ICT-Lab only. Run once in the SQL Editor. Same policy as vehicle_agreement_setup.sql.
DROP POLICY IF EXISTS vehicle_agreements_policy ON vehicle_agreements;
-- A lab user sees only their OWN signed forms; the whole organization's are
-- visible to its lab managers and admins (who approve them). The first version
-- let any member of the organization read every row — the app only showed lab
-- users their own, but the API returned everyone's (fixed Oct 2026).
CREATE POLICY vehicle_agreements_policy ON vehicle_agreements
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR (organization_id IN (SELECT oid FROM my_org_ids() AS oid)
      AND EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.is_active
                  AND u.role IN ('admin', 'user') AND u.organization_id = vehicle_agreements.organization_id))
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR (organization_id IN (SELECT oid FROM my_org_ids() AS oid)
      AND EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.is_active
                  AND u.role IN ('admin', 'user') AND u.organization_id = vehicle_agreements.organization_id))
);

-- Check: should list one policy.
SELECT policyname FROM pg_policies WHERE tablename = 'vehicle_agreements';
