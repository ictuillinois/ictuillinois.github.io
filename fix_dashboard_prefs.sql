-- ═══════════════════════════════════════════════════════════════
-- iLab Dashboard Prefs Fix — run this ONCE in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Ensure has_set_dashboard column exists on both tables
ALTER TABLE user_dashboard_prefs ADD COLUMN IF NOT EXISTS has_set_dashboard boolean DEFAULT false;
ALTER TABLE solo_users           ADD COLUMN IF NOT EXISTS has_set_dashboard boolean DEFAULT false;

-- 2. For every user who already has active_modules saved, mark them as "has set dashboard"
--    This stops the icon picker from showing again for existing users.
UPDATE user_dashboard_prefs
  SET has_set_dashboard = true
  WHERE active_modules IS NOT NULL
    AND jsonb_array_length(active_modules) > 0;

UPDATE solo_users
  SET has_set_dashboard = true
  WHERE active_modules IS NOT NULL
    AND jsonb_array_length(active_modules) > 0;

-- 3. Remove broken image URLs that point to the old pro-ilab Supabase storage.
--    This makes module cards fall back to their colored emoji backgrounds
--    instead of showing broken images.
DELETE FROM settings
  WHERE key LIKE 'img_%'
    AND value LIKE '%lxjudxjcxhrynnlxodtg%';

-- 4. Make sure RLS allows anon full access on user_dashboard_prefs
--    (safe to run even if policy already exists)
ALTER TABLE user_dashboard_prefs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_dashboard_prefs'
      AND policyname = 'anon_all_user_dashboard_prefs'
  ) THEN
    EXECUTE 'CREATE POLICY anon_all_user_dashboard_prefs ON user_dashboard_prefs FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
END $$;

ALTER TABLE solo_users ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'solo_users'
      AND policyname = 'anon_all_solo_users'
  ) THEN
    EXECUTE 'CREATE POLICY anon_all_solo_users ON solo_users FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- Done. Now rebuild the frontend: npm run build
-- Then push docs/ to GitHub Pages.
-- ═══════════════════════════════════════════════════════════════
