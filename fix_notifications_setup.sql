-- ============================================================
-- RUN THIS IN SUPABASE SQL EDITOR (ictlab project)
-- One-shot fix for all notification delivery issues
-- Safe to re-run — all statements are idempotent
-- ============================================================

-- ── DIAGNOSTIC: Check what already exists ────────────────────
SELECT 'rls_state' AS check_type, tablename AS name, rowsecurity::text AS detail
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('notifications','notification_prefs','email_notifications_queue','booking_notifications')
UNION ALL
SELECT 'policy', tablename || '.' || policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('notifications','notification_prefs','email_notifications_queue')
UNION ALL
SELECT 'realtime', tablename, schemaname
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('notifications','booking_notifications');


-- ── STEP 1: Ensure columns exist ─────────────────────────────
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS title  text,
  ADD COLUMN IF NOT EXISTS body   text,
  ADD COLUMN IF NOT EXISTS type   text,
  ADD COLUMN IF NOT EXISTS read   boolean DEFAULT false;


-- ── STEP 2: notifications — RLS + policies ───────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert (managers send to lab users)
DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications
  FOR INSERT TO authenticated WITH CHECK (true);

-- Lab user reads own rows; managers/admins read their org's rows
DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications
  FOR SELECT TO authenticated
  USING (
    user_id::text = (SELECT id::text FROM users WHERE auth_id = auth.uid()::text LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM users me
      JOIN users target ON target.id::text = notifications.user_id::text
      WHERE me.auth_id = auth.uid()::text
        AND me.organization_id = target.organization_id
        AND me.role IN ('admin', 'user')
    )
    OR EXISTS (
      SELECT 1 FROM settings
      WHERE key = 'super_admin_auth_id' AND value = auth.uid()::text
    )
  );

-- Users mark their own notifications read
DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications
  FOR UPDATE TO authenticated
  USING  (user_id::text = (SELECT id::text FROM users WHERE auth_id = auth.uid()::text LIMIT 1))
  WITH CHECK (user_id::text = (SELECT id::text FROM users WHERE auth_id = auth.uid()::text LIMIT 1));

DROP POLICY IF EXISTS notifications_delete ON notifications;
CREATE POLICY notifications_delete ON notifications
  FOR DELETE TO authenticated
  USING (user_id::text = (SELECT id::text FROM users WHERE auth_id = auth.uid()::text LIMIT 1));


-- ── STEP 3: notification_prefs — own row + org-wide SELECT ───
ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_prefs_own ON notification_prefs;
CREATE POLICY notification_prefs_own ON notification_prefs
  FOR ALL TO authenticated
  USING    (user_id::text = (SELECT id::text FROM users WHERE auth_id = auth.uid()::text LIMIT 1))
  WITH CHECK (user_id::text = (SELECT id::text FROM users WHERE auth_id = auth.uid()::text LIMIT 1));

-- Managers need to read a lab user's prefs to decide if email should be sent
DROP POLICY IF EXISTS notification_prefs_select_org ON notification_prefs;
CREATE POLICY notification_prefs_select_org ON notification_prefs
  FOR SELECT TO authenticated
  USING (
    user_id::text = (SELECT id::text FROM users WHERE auth_id = auth.uid()::text LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM users me
      JOIN users target ON target.id::text = notification_prefs.user_id::text
      WHERE me.auth_id = auth.uid()::text
        AND me.organization_id = target.organization_id
        AND me.role IN ('admin', 'user')
    )
  );


-- ── STEP 4: email_notifications_queue — create + allow INSERT ─
CREATE TABLE IF NOT EXISTS email_notifications_queue (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  to_email     text NOT NULL,
  subject      text,
  body         text,
  html_body    text,
  user_id      text,
  type         text,
  sent         boolean DEFAULT false,
  sent_at      timestamptz,
  attempts     integer DEFAULT 0,
  error        text,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE email_notifications_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_queue_insert ON email_notifications_queue;
CREATE POLICY email_queue_insert ON email_notifications_queue
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS email_queue_select ON email_notifications_queue;
CREATE POLICY email_queue_select ON email_notifications_queue
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM settings WHERE key = 'super_admin_auth_id' AND value = auth.uid()::text)
  );


-- ── STEP 5: Add tables to realtime publication ───────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE booking_notifications;
EXCEPTION WHEN others THEN NULL; END $$;


-- ── VERIFICATION ─────────────────────────────────────────────
SELECT 'AFTER: rls' AS check_type, tablename AS name, rowsecurity::text AS detail
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('notifications','notification_prefs','email_notifications_queue','booking_notifications')
UNION ALL
SELECT 'AFTER: policy', tablename || '.' || policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('notifications','notification_prefs','email_notifications_queue')
UNION ALL
SELECT 'AFTER: realtime', tablename, schemaname
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('notifications','booking_notifications');
