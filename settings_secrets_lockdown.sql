-- settings_secrets_lockdown.sql — run in BOTH projects (same file in both folders).
-- Idempotent: safe to run again.
--
-- settings.anthropic_api_key was readable by ANYONE — the signed-out policy
-- (settings_read_anon) hid only admin_password / admin_email /
-- super_admin_auth_id, and the publishable key is in the website code. Found
-- Nov 2 2026; the key was revoked in the Anthropic console first.
--
-- 1. The key is deleted (it is revoked; it must not come back here).
-- 2. Both read policies now hide any *api_key* / *secret* row from everyone
--    but the super admin, so a key stored here later cannot leak the same way.
--    Secrets belong in Edge Function secrets, never in this table.
-- The same policies are in rls_phase1.sql.

DELETE FROM settings WHERE key = 'anthropic_api_key';

BEGIN;
DROP POLICY IF EXISTS settings_read_anon ON settings;
CREATE POLICY settings_read_anon ON settings FOR SELECT TO anon
  USING (key NOT IN ('admin_password', 'admin_email', 'super_admin_auth_id')
         AND key NOT ILIKE '%api_key%' AND key NOT ILIKE '%secret%');
DROP POLICY IF EXISTS settings_read_auth ON settings;
CREATE POLICY settings_read_auth ON settings FOR SELECT TO authenticated
  USING (is_super_admin()
         OR (key NOT IN ('admin_password', 'admin_email')
             AND key NOT ILIKE '%api_key%' AND key NOT ILIKE '%secret%'));
COMMIT;

NOTIFY pgrst, 'reload schema';

-- Check (expected: 0 | 2 | true)
SELECT
  (SELECT count(*) FROM settings WHERE key ILIKE '%api_key%' OR key ILIKE '%secret%') AS secret_rows_left,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'settings' AND policyname IN ('settings_read_anon', 'settings_read_auth')
     AND qual ILIKE '%api_key%') AS policies_hiding_keys,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'settings' AND relnamespace = 'public'::regnamespace) AS rls_on;
