-- ============================================================
-- RUN THIS IN SUPABASE SQL EDITOR (ictlab project)
-- One-shot fix for all notification delivery issues
-- Safe to re-run — all statements are idempotent
-- ============================================================

-- ── DIAGNOSTIC: Check what already exists ────────────────────
-- (scroll through results before / after)
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
-- user_id is already there; skip re-adding to avoid type conflicts


-- ── STEP 2: notifications — RLS + policies ───────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert (managers send to lab users)
DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications
  FOR INSERT TO authenticated WITH CHECK (true);

-- Lab user can read their own rows; managers/admins can read their org's rows
DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications
  FOR SELECT TO authenticated
  USING (
    -- row belongs to the current user (by internal users.id)
    user_id::text = (SELECT id::text FROM users WHERE auth_id = auth.uid() LIMIT 1)
    OR user_id::text = (SELECT id::text FROM solo_users WHERE auth_id = auth.uid() LIMIT 1)
    -- or current user is an admin/manager in the same org as the notification target
    OR EXISTS (
      SELECT 1 FROM users me
      JOIN users target ON target.id = notifications.user_id
      WHERE me.auth_id = auth.uid()
        AND me.organization_id = target.organization_id
        AND me.role IN ('admin', 'user')
    )
    -- super admin
    OR EXISTS (
      SELECT 1 FROM settings
      WHERE key = 'super_admin_auth_id' AND value = auth.uid()::text
    )
  );

-- Users can mark their own notifications read
DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications
  FOR UPDATE TO authenticated
  USING (
    user_id::text = (SELECT id::text FROM users WHERE auth_id = auth.uid() LIMIT 1)
    OR user_id::text = (SELECT id::text FROM solo_users WHERE auth_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    user_id::text = (SELECT id::text FROM users WHERE auth_id = auth.uid() LIMIT 1)
    OR user_id::text = (SELECT id::text FROM solo_users WHERE auth_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS notifications_delete ON notifications;
CREATE POLICY notifications_delete ON notifications
  FOR DELETE TO authenticated
  USING (
    user_id::text = (SELECT id::text FROM users WHERE auth_id = auth.uid() LIMIT 1)
    OR user_id::text = (SELECT id::text FROM solo_users WHERE auth_id = auth.uid() LIMIT 1)
  );


-- ── STEP 3: notification_prefs — org-wide SELECT ─────────────
-- Managers need to read a lab user's prefs to decide if email should be queued
ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_prefs_own ON notification_prefs;
CREATE POLICY notification_prefs_own ON notification_prefs
  FOR ALL TO authenticated
  USING (
    user_id::text = (SELECT id::text FROM users WHERE auth_id = auth.uid() LIMIT 1)
    OR user_id::text = (SELECT id::text FROM solo_users WHERE auth_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    user_id::text = (SELECT id::text FROM users WHERE auth_id = auth.uid() LIMIT 1)
    OR user_id::text = (SELECT id::text FROM solo_users WHERE auth_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS notification_prefs_select_org ON notification_prefs;
CREATE POLICY notification_prefs_select_org ON notification_prefs
  FOR SELECT TO authenticated
  USING (
    user_id::text = (SELECT id::text FROM users WHERE auth_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM users me
      JOIN users target ON target.id = notification_prefs.user_id
      WHERE me.auth_id = auth.uid()
        AND me.organization_id = target.organization_id
        AND me.role IN ('admin', 'user')
    )
  );


-- ── STEP 4: email_notifications_queue — allow INSERT ─────────
ALTER TABLE email_notifications_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_queue_insert ON email_notifications_queue;
CREATE POLICY email_queue_insert ON email_notifications_queue
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS email_queue_select ON email_notifications_queue;
CREATE POLICY email_queue_select ON email_notifications_queue
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM settings WHERE key='super_admin_auth_id' AND value=auth.uid()::text)
  );


-- ── STEP 5: Add both tables to realtime publication ──────────
-- (safe even if already added — ALTER PUBLICATION is idempotent for tables)
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE booking_notifications;


-- ── VERIFICATION: Run once more after the above ───────────────
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
