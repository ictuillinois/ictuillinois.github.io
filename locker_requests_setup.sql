-- ═══════════════════════════════════════════════════════════════════════════
-- locker_requests_setup.sql — lab users request a locker (Oct 2026)
--
-- The SAME file lives in ictlab/ and labhive/. Run it in BOTH databases, after
-- training_privacy.sql (it uses my_managed_org_ids()). Idempotent. The same
-- rules are in rls_phase1.sql.
--
--   locker_requests   one waiting request per lab user. A lab user asks for
--                     "a locker", not a number; a lab manager or admin picks
--                     which one. Assigning or declining deletes the row.
--   lab_user_lockers  lab users now read ONLY their own locker. They used to
--                     read every locker in the organization (with names),
--                     which is what the Locker tab's grid showed them. Only
--                     lab managers and admins write.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS locker_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  organization_id uuid,
  user_name       text,
  note            text,
  requested_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS locker_requests_user_uniq ON locker_requests (user_id);

ALTER TABLE locker_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON locker_requests FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON locker_requests TO authenticated;

-- Every old policy on both tables goes: permissive policies are OR-ed, so one
-- left behind would keep the org-wide read open.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN ('locker_requests', 'lab_user_lockers')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- The owner (any of their accounts) and the lab managers / admins of the org.
-- A lab user may only file a request in an organization they belong to.
CREATE POLICY locker_requests_policy ON locker_requests FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid)
  OR (user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
      AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
);

ALTER TABLE lab_user_lockers ENABLE ROW LEVEL SECURITY;

CREATE POLICY lab_user_lockers_policy ON lab_user_lockers FOR SELECT TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid)
);

CREATE POLICY lab_user_lockers_manage ON lab_user_lockers FOR ALL TO authenticated
USING      (is_super_admin() OR organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid));

NOTIFY pgrst, 'reload schema';

-- ── Check — run last. Expect three rows: locker_requests_policy (ALL),
--    lab_user_lockers_policy (SELECT), lab_user_lockers_manage (ALL),
--    each with rls_on = true.
SELECT p.tablename, p.policyname, p.cmd, c.relrowsecurity AS rls_on
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE p.schemaname = 'public' AND p.tablename IN ('locker_requests', 'lab_user_lockers')
ORDER BY p.tablename, p.policyname;
