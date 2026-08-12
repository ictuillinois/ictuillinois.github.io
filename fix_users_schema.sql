-- Fix: add all missing columns to the users table in ictlab Supabase.
-- Run once in Supabase SQL Editor.
-- Safe to re-run — all statements use IF NOT EXISTS or are idempotent.

-- ── Missing columns on the users table ───────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_id                text,
  ADD COLUMN IF NOT EXISTS organization_id        uuid REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS must_change_password   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted_version integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS storage_provider       text DEFAULT 'supabase',
  ADD COLUMN IF NOT EXISTS admin_level            integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nick_name              text,
  ADD COLUMN IF NOT EXISTS gender                 text,
  ADD COLUMN IF NOT EXISTS assigned_project_ids   uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS photo_denial_flagged   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_hash          text,
  ADD COLUMN IF NOT EXISTS last_name              text,
  ADD COLUMN IF NOT EXISTS photo_url              text,
  ADD COLUMN IF NOT EXISTS avatar                 text,
  ADD COLUMN IF NOT EXISTS supervisor             text,
  ADD COLUMN IF NOT EXISTS year_semester          text,
  ADD COLUMN IF NOT EXISTS project_group          text,
  ADD COLUMN IF NOT EXISTS pin                    text;

-- ── Index for org scoping ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_org   ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_auth  ON users(auth_id);

-- ── create_team_user RPC (SECURITY DEFINER — bypasses RLS for admin inserts) ─
CREATE OR REPLACE FUNCTION create_team_user(
  p_name           text,
  p_email          text,
  p_auth_id        text,
  p_role           text,
  p_organization_id uuid,
  p_last_name      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO users (
    name, last_name, email, auth_id,
    role, organization_id,
    is_active, admin_level, must_change_password,
    created_at
  ) VALUES (
    p_name, p_last_name, p_email, p_auth_id,
    p_role, p_organization_id,
    true, 0, true,
    now()
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- ── delete_auth_user RPC (SECURITY DEFINER — deletes from auth.users) ────────
CREATE OR REPLACE FUNCTION delete_auth_user(p_auth_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = p_auth_id::uuid;
END;
$$;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN (
    'auth_id','organization_id','must_change_password',
    'terms_accepted_version','admin_level','nick_name',
    'gender','assigned_project_ids','photo_denial_flagged'
  )
ORDER BY column_name;
