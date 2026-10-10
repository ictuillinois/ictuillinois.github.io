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

-- ── create_team_user / delete_auth_user ───────────────────────────────────────
-- Defined in security_hardening.sql, with the caller checks these versions
-- lacked (anyone, even signed out, could call them). Re-running the old
-- definitions here would remove those checks, so they are no longer in this file.

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
