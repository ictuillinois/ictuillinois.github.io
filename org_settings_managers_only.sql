-- ═══════════════════════════════════════════════════════════════════════════
-- org_settings_managers_only.sql — the SAME file in ictlab and labhive; run it
-- in BOTH databases (Oct 2026). Idempotent. Run after training_privacy.sql
-- (uses my_managed_org_ids).
--
-- organizations had one policy, FOR ALL to every member of the org. So any
-- lab user could change the organization's settings through the API: the
-- supervisor list, icon pools, material types, contact, logo, module images…
-- The app only hid the buttons.
--
-- Now:  read   — every member (the app reads its own org's settings everywhere)
--       change — org admins and lab managers of that org, and the super admin
--       create / delete — the super admin only
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS orgs_policy ON organizations;
DROP POLICY IF EXISTS orgs_select ON organizations;
DROP POLICY IF EXISTS orgs_update ON organizations;
DROP POLICY IF EXISTS orgs_insert ON organizations;
DROP POLICY IF EXISTS orgs_delete ON organizations;

CREATE POLICY orgs_select ON organizations FOR SELECT TO authenticated
  USING (is_super_admin() OR id IN (SELECT oid FROM my_org_ids() AS oid));
CREATE POLICY orgs_update ON organizations FOR UPDATE TO authenticated
  USING      (is_super_admin() OR id IN (SELECT oid FROM my_managed_org_ids() AS oid))
  WITH CHECK (is_super_admin() OR id IN (SELECT oid FROM my_managed_org_ids() AS oid));
CREATE POLICY orgs_insert ON organizations FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());
CREATE POLICY orgs_delete ON organizations FOR DELETE TO authenticated
  USING (is_super_admin());
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';

-- Check — run last. Expect four rows: orgs_delete, orgs_insert, orgs_select,
-- orgs_update (and no orgs_policy).
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'organizations' ORDER BY policyname;
