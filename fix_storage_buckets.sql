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

-- 2. Allow anon users to upload/read/delete in all three buckets
DO $$
DECLARE
  buckets text[] := ARRAY['project-files', 'item-photos', 'project-records'];
  b text;
BEGIN
  FOREACH b IN ARRAY buckets
  LOOP
    -- SELECT (read public URLs)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon_select_' || b) THEN
      EXECUTE format('CREATE POLICY "anon_select_%s" ON storage.objects FOR SELECT TO anon USING (bucket_id = %L)', b, b);
    END IF;
    -- INSERT (upload)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon_insert_' || b) THEN
      EXECUTE format('CREATE POLICY "anon_insert_%s" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = %L)', b, b);
    END IF;
    -- UPDATE (replace / upsert)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon_update_' || b) THEN
      EXECUTE format('CREATE POLICY "anon_update_%s" ON storage.objects FOR UPDATE TO anon USING (bucket_id = %L)', b, b);
    END IF;
    -- DELETE (remove old image)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon_delete_' || b) THEN
      EXECUTE format('CREATE POLICY "anon_delete_%s" ON storage.objects FOR DELETE TO anon USING (bucket_id = %L)', b, b);
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- Done. After running this:
-- 1. Go to Admin Panel → Module Images tab → upload an image for each module
-- 2. In Inspection/Supply screen → click Photo button on any supply item
-- ═══════════════════════════════════════════════════════════════
