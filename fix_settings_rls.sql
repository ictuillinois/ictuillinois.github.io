-- ═══════════════════════════════════════════════════════════════
-- iLab Settings Table RLS Fix — run this ONCE in Supabase SQL Editor
-- Allows the app (anon key) to read and write module image URLs.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT (dashboard reads img_* and url settings)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'settings' AND policyname = 'anon_select_settings') THEN
    EXECUTE 'CREATE POLICY anon_select_settings ON settings FOR SELECT TO anon USING (true)';
  END IF;

  -- INSERT (admin uploads new image URLs)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'settings' AND policyname = 'anon_insert_settings') THEN
    EXECUTE 'CREATE POLICY anon_insert_settings ON settings FOR INSERT TO anon WITH CHECK (true)';
  END IF;

  -- UPDATE (admin replaces image URLs via upsert)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'settings' AND policyname = 'anon_update_settings') THEN
    EXECUTE 'CREATE POLICY anon_update_settings ON settings FOR UPDATE TO anon USING (true)';
  END IF;

  -- DELETE (admin removes image URLs)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'settings' AND policyname = 'anon_delete_settings') THEN
    EXECUTE 'CREATE POLICY anon_delete_settings ON settings FOR DELETE TO anon USING (true)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- Done. Now:
-- 1. Log in as org-admin → Admin Panel → Module Images
-- 2. Re-upload the images (they were not saved before due to this bug)
-- 3. Log in as lab manager — images will now appear on the dashboard
-- ═══════════════════════════════════════════════════════════════
