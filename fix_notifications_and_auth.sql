-- Fix: ensure notifications table has title/body columns (required for Step 4 notification)
-- Fix: sync auth_id from auth.users so RLS helper my_user_id() / my_org_id() work correctly
-- Fix: backfill organization_id on lab_safety_progress rows that are missing it
-- Run once in Supabase SQL Editor. Safe to re-run.

-- ── 1. Notifications table: add title/body columns ────────────────────────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body  text;

-- ── 2. Sync auth_id from auth.users into public.users (by email match) ────────
-- Without auth_id set, my_user_id() and my_org_id() return NULL and RLS blocks
-- the lab user from seeing their own lab_safety_progress rows.
UPDATE public.users pu
SET auth_id = au.id::text
FROM auth.users au
WHERE LOWER(pu.email) = LOWER(au.email)
  AND pu.auth_id IS NULL;

-- ── 3. Backfill organization_id on lab_safety_progress rows ──────────────────
-- Rows inserted before organization_id was tracked have NULL, which prevents
-- the org-scoped RLS branch from matching even after auth_id is fixed.
UPDATE lab_safety_progress lsp
SET organization_id = u.organization_id
FROM users u
WHERE lsp.user_id = u.id
  AND lsp.organization_id IS NULL;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.users WHERE auth_id IS NULL AND is_active = true) AS users_missing_auth_id,
  (SELECT COUNT(*) FROM lab_safety_progress WHERE organization_id IS NULL)       AS safety_rows_missing_org;
