-- ═══════════════════════════════════════════════════════════════
-- iLab Storage Buckets Fix — run this ONCE in Supabase SQL Editor
-- This creates the 3 storage buckets the app needs.
-- ═══════════════════════════════════════════════════════════════

-- 1. Create buckets (public = anyone can read the URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('project-files',   'project-files',   true, 10485760),   -- 10 MB — module images, training certs
  ('item-photos',     'item-photos',     true, 10485760),   -- 10 MB — supply & room photos
  ('project-records', 'project-records', true, 52428800)    -- 50 MB — project record files
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Policies — NOT here any more.
-- This step used to give the anon role INSERT / UPDATE / DELETE on all three
-- buckets: anyone on the internet could overwrite or delete the lab's files.
-- security_hardening.sql removed those policies (Oct 2026). Do not put them
-- back. Public bucket URLs need no policy to be read; signed-in uploads use
-- the authenticated policies; signed-out support screenshots use
-- anon_support_screenshot (security_hardening.sql).

-- ═══════════════════════════════════════════════════════════════
-- Done. After running this:
-- 1. Go to Admin Panel → Module Images tab → upload an image for each module
-- 2. In Inspection/Supply screen → click Photo button on any supply item
-- ═══════════════════════════════════════════════════════════════
