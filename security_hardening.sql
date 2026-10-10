-- ═══════════════════════════════════════════════════════════════════════════
-- security_hardening.sql — the Supabase security linter fixes (Oct 2026)
--
-- The SAME file lives in ictlab/ and labhive/; it is written to run in either
-- database (every auth_id comparison is cast to text, and tables only one
-- project has are checked for first). Run it in BOTH. Idempotent — safe to
-- re-run, and worth re-running after adding any new function.
--
-- What it closes, worst first:
--   1. Storage: fix_storage_buckets.sql gave the `anon` role INSERT / UPDATE /
--      DELETE on every app bucket. Anyone on the internet, signed in or not,
--      could overwrite or delete the lab's files. Now anon may only upload a
--      support screenshot (project-files/support/...), which the signed-out
--      Contact Us form needs.
--   2. reset_auth_user_password(...) was callable signed-out: set anyone's
--      password, including the super admin's. Nothing in either app calls it
--      any more (removed in labhive 2734adf8) — dropped.
--   3. delete_auth_user / create_team_user / confirm_auth_user_email /
--      get_auth_user_id_by_email were callable by anyone, signed in or not.
--      A lab user could delete another person's login or create an org admin
--      in any organisation. Now: signed-in admins and lab managers only, and
--      delete_auth_user refuses a login that any account still uses.
--   4. Trigger / cron / RLS-helper functions callable signed-out over
--      /rest/v1/rpc. Low risk, but there is no reason for it.
--   5. Functions without a fixed search_path.
--
-- Deliberately NOT changed (the linter will still list these):
--   • INSERT ... WITH CHECK (true) on notifications, admin_notifications,
--     email_notifications_queue, support_messages. Sending a notification to
--     someone else IS an insert of a row that is not yours, and guests file
--     support messages. Narrowing these needs a per-sender rule — separate job.
--   • "Signed-in users can execute SECURITY DEFINER" on the RLS helpers
--     (is_super_admin, my_user_ids, ...). Every policy calls them as the
--     signed-in user; revoking that would lock every table.
--   • "Public bucket allows listing" for SIGNED-IN users. Upsert and remove
--     need SELECT on storage.objects; removing it breaks uploads.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Who may manage accounts ──────────────────────────────────────────────
-- Super admin, or an active org admin / lab manager. Unlike i_manage_people()
-- this is FALSE with no signed-in user: i_manage_people() treats "no user" as
-- the SQL editor, but a signed-out REST call has no user either.
CREATE OR REPLACE FUNCTION can_manage_accounts() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    is_super_admin()
    OR EXISTS (SELECT 1 FROM users
               WHERE auth_id::text = auth.uid()::text AND is_active AND role IN ('admin', 'user'))
  )
$$;


-- ── 2. Replace the account functions ────────────────────────────────────────
-- Dropped by name, every overload: ICT-Lab had two create_team_user
-- signatures, LabHive two reset_auth_user_password ones, and delete_auth_user
-- takes text in one database and uuid in the other. The apps pass named JSON
-- arguments, so one text signature serves both.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('delete_auth_user', 'confirm_auth_user_email', 'get_auth_user_id_by_email',
                        'reset_auth_user_password', 'create_team_user')
  LOOP
    EXECUTE 'DROP FUNCTION ' || f.sig;
  END LOOP;
END $$;

-- Removes a Supabase login so its email can be used again. Refuses while any
-- account row still points at it: one person routinely holds several users
-- rows on one login (one per role), and deleting one role must not lock them
-- out of the others. Callers delete the row first, then call this.
CREATE FUNCTION delete_auth_user(p_auth_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT can_manage_accounts() THEN
    RAISE EXCEPTION 'Only admins and lab managers can remove a login' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_auth_id, '') = '' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM settings WHERE key = 'super_admin_auth_id' AND trim(both '"' from value::text) = p_auth_id) THEN
    RAISE EXCEPTION 'The super admin login cannot be removed' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE auth_id::text = p_auth_id) THEN
    RAISE EXCEPTION 'This login is still used by another account' USING ERRCODE = '42501';
  END IF;
  IF to_regclass('public.solo_users') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM solo_users WHERE auth_id::text = p_auth_id) THEN
      RAISE EXCEPTION 'This login belongs to a solo account' USING ERRCODE = '42501';
    END IF;
  END IF;
  DELETE FROM auth.users WHERE id::text = p_auth_id;
END;
$$;

CREATE FUNCTION get_auth_user_id_by_email(p_email text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT can_manage_accounts() THEN
    RAISE EXCEPTION 'Only admins and lab managers can look up logins' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1);
END;
$$;

-- confirmed_at is a generated column in current Supabase Auth — only
-- email_confirmed_at is written.
CREATE FUNCTION confirm_auth_user_email(p_email text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT can_manage_accounts() THEN
    RAISE EXCEPTION 'Only admins and lab managers can confirm a login' USING ERRCODE = '42501';
  END IF;
  UPDATE auth.users SET email_confirmed_at = now()
  WHERE lower(email) = lower(trim(p_email)) AND email_confirmed_at IS NULL;
END;
$$;

-- Creates a users row bypassing RLS (the admin's session can shift during
-- signUp). Super admin: any org, any role. Org admin: their own org. Lab
-- manager: their own org, never an org admin (mirrors StaffListPanel's rule).
CREATE FUNCTION create_team_user(
  p_name text, p_email text, p_auth_id text, p_role text,
  p_organization_id uuid, p_last_name text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  IF p_role NOT IN ('admin', 'user', 'lab_user') THEN
    RAISE EXCEPTION 'Unknown role %', p_role USING ERRCODE = '22023';
  END IF;
  IF NOT (
    (auth.uid() IS NOT NULL AND is_super_admin())
    OR EXISTS (SELECT 1 FROM users
               WHERE auth_id::text = auth.uid()::text AND is_active
                 AND organization_id = p_organization_id
                 AND (role = 'admin' OR (role = 'user' AND p_role IN ('user', 'lab_user'))))
  ) THEN
    RAISE EXCEPTION 'Not allowed to create this account in this organisation' USING ERRCODE = '42501';
  END IF;
  INSERT INTO users (name, last_name, email, auth_id, role, organization_id,
                     is_active, admin_level, must_change_password, created_at)
  VALUES (p_name, p_last_name, p_email, p_auth_id, p_role, p_organization_id,
          true, 0, true, now())
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION can_manage_accounts(), delete_auth_user(text), get_auth_user_id_by_email(text),
  confirm_auth_user_email(text), create_team_user(text, text, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_manage_accounts(), delete_auth_user(text), get_auth_user_id_by_email(text),
  confirm_auth_user_email(text), create_team_user(text, text, text, text, uuid, text) TO authenticated, service_role;


-- ── 3. Trigger functions: nobody calls these directly ───────────────────────
-- A trigger's function needs no EXECUTE grant when the trigger fires (only
-- when it is created), so this changes nothing about how the triggers run.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;


-- ── 4. Scheduled / script-only functions ────────────────────────────────────
-- pg_cron runs as postgres (the owner) and the migration script uses the
-- service key, so neither needs anon or authenticated.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('queue_change_digest', 'send_maintenance_reminders', 'array_replace_text')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;


-- ── 5. RLS helpers: signed-in only ──────────────────────────────────────────
-- Skipped (with a NOTICE) for any helper that a policy open to anon / public
-- calls: revoking it there would make every signed-out read of that table
-- fail with "permission denied for function" instead of returning nothing.
DO $$
DECLARE f record; used text;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('is_super_admin', 'my_user_id', 'my_user_ids', 'my_org_id', 'my_org_ids',
                        'my_solo_id', 'my_solo_email', 'my_managed_org_ids', 'i_manage_people',
                        'get_my_org_id', 'get_my_solo_id', 'get_my_user_id')
  LOOP
    SELECT string_agg(pol.schemaname || '.' || pol.tablename || ' / ' || pol.policyname, ', ') INTO used
    FROM pg_policies pol
    WHERE ('anon' = ANY (pol.roles) OR 'public' = ANY (pol.roles))
      AND (coalesce(pol.qual, '') ~ ('\m' || f.proname || '\(') OR coalesce(pol.with_check, '') ~ ('\m' || f.proname || '\('));
    IF used IS NOT NULL THEN
      RAISE NOTICE '% left callable by anon — used by: %', f.sig, used;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END $$;


-- ── 6. Fixed search_path on every app function that lacks one ───────────────
-- `extensions` is included because Supabase installs pgcrypto there, and a
-- function calling crypt() unqualified would otherwise stop finding it.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', f.sig);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE '% not changed (owned by another role): %', f.sig, SQLERRM;
    END;
  END LOOP;
END $$;


-- ── 7. Functions created from now on are not signed-out callable ────────────
-- Postgres grants EXECUTE to PUBLIC on every new function by default, which
-- is how all of the above happened. New functions still reach authenticated
-- and service_role through Supabase's own default grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;


-- ── 8. Storage: signed-out visitors may upload a support screenshot, nothing else
-- Policies only for anon are dropped. Policies for anon AND others (or for
-- PUBLIC, which includes anon) are narrowed to authenticated, so signed-in
-- users keep exactly what they had. Public buckets stay public: their file
-- URLs are served without any policy, so every existing link keeps working.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname, roles FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND ('anon' = ANY (roles) OR 'public' = ANY (roles))
      AND policyname <> 'anon_support_screenshot'
  LOOP
    IF p.roles = ARRAY['anon']::name[] THEN
      EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
    ELSE
      EXECUTE format('ALTER POLICY %I ON storage.objects TO authenticated', p.policyname);
    END IF;
  END LOOP;

  DROP POLICY IF EXISTS anon_support_screenshot ON storage.objects;
  -- Contact Us / Report an issue while signed out (reportIssue.js,
  -- CustomerServiceModal.jsx): upload only, only into support/.
  CREATE POLICY anon_support_screenshot ON storage.objects
    FOR INSERT TO anon
    WITH CHECK (bucket_id = 'project-files' AND name LIKE 'support/%');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Storage policies not changed — this role may not alter storage.objects: %', SQLERRM;
END $$;


-- ── Check — run last. Each row is something still open; EMPTY = done. ───────
-- (anon_support_screenshot is the one intended anon storage policy.)
SELECT 'anon can run function' AS issue, p.oid::regprocedure::text AS what
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
UNION ALL
SELECT 'no fixed search_path', p.oid::regprocedure::text
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
UNION ALL
SELECT 'anon storage policy', policyname || ' (' || cmd || ')'
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND ('anon' = ANY (roles) OR 'public' = ANY (roles))
  AND policyname <> 'anon_support_screenshot'
UNION ALL
SELECT 'reset_auth_user_password still exists', p.oid::regprocedure::text
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'reset_auth_user_password';
