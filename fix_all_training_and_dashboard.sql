-- ═══════════════════════════════════════════════════════════════
-- FIX: auth_id sync + notifications schema + retraining RLS
-- Run once in Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- 1. Sync auth_id from auth.users → public.users (by email match).
--    Without this, my_user_id() and my_org_id() return NULL for any
--    user whose auth_id was not set at creation time, which silently
--    blocks ALL RLS-protected reads and writes (dashboard prefs,
--    training requests, notifications, bookings, etc.).
UPDATE public.users pu
SET auth_id = au.id::text
FROM auth.users au
WHERE LOWER(pu.email) = LOWER(au.email)
  AND pu.auth_id IS NULL;

-- 2. Verify — should return 0 after running:
SELECT COUNT(*) AS users_still_missing_auth_id
FROM public.users
WHERE auth_id IS NULL AND is_active = true;

-- 3. Add title / body columns to notifications (required for all
--    training-request bell notifications — inserts fail silently without them).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body  text;

-- 4. Update retraining_requests RLS so lab users can always read
--    their own requests (even if organization_id was stored as null).
DROP POLICY IF EXISTS retraining_requests_policy ON retraining_requests;
CREATE POLICY retraining_requests_policy ON retraining_requests
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id = my_org_id()
  OR user_id::text = my_user_id()::text
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id = my_org_id())
)
WITH CHECK (
  is_super_admin()
  OR organization_id = my_org_id()
  OR user_id::text = my_user_id()::text
);

-- 5. Backfill organization_id on retraining_requests rows that were
--    inserted before the column was populated (fixes manager visibility).
UPDATE retraining_requests rr
SET organization_id = u.organization_id
FROM users u
WHERE rr.user_id::text = u.id::text
  AND rr.organization_id IS NULL;
