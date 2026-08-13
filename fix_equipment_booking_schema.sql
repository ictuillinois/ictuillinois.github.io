-- Fix: create all equipment booking tables missing from ictlab Supabase.
-- Run once in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).

-- ── 1. equipment_bookings ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_bookings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id             uuid,
  user_id                  uuid,
  user_name                text,
  title                    text,
  notes                    text,
  status                   text DEFAULT 'confirmed',  -- confirmed | pending | denied | cancelled
  requires_approval        boolean DEFAULT false,
  start_time               timestamptz NOT NULL,
  end_time                 timestamptz NOT NULL,
  created_by               text,
  booked_on_behalf_of      text,
  denied_by                text,
  denied_reason            text,
  before_photo_url         text,
  after_photo_url          text,
  before_photo_waived      boolean DEFAULT false,
  after_photo_denied       boolean DEFAULT false,
  after_photo_attempt_count integer DEFAULT 0,
  before_photo_notified_at  timestamptz,
  lab_notified_at          timestamptz,
  organization_id          uuid,
  updated_at               timestamptz DEFAULT now(),
  created_at               timestamptz DEFAULT now()
);

-- ── 2. booking_notifications ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid,
  user_id      uuid,
  type         text,   -- approved | denied | cancelled | before_photo_reminder | after_photo_reminder | after_photo_last_warning | retraining | waive_request | review_request
  message      text,
  read         boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

-- ── 3. equipment_booking_settings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_booking_settings (
  equipment_id          uuid PRIMARY KEY,
  requires_approval     boolean DEFAULT false,
  bookable              boolean DEFAULT true,
  reference_photo_url   text,
  photo_instruction     text,
  created_at            timestamptz DEFAULT now()
);

-- ── 4. equipment_booking_blocks ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_booking_blocks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid,
  user_name        text,
  equipment_id     uuid,          -- null = block applies to all equipment
  organization_id  uuid,
  blocked_by_name  text,
  reason           text,
  block_type       text DEFAULT 'all',  -- 'all' | 'equipment'
  unblock_at       timestamptz,
  created_at       timestamptz DEFAULT now()
);

-- ── 5. retraining_requests ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retraining_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  equipment_id    uuid,
  status          text DEFAULT 'pending',  -- pending | approved | denied
  organization_id uuid,
  created_at      timestamptz DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_eq_bookings_eq       ON equipment_bookings(equipment_id);
CREATE INDEX IF NOT EXISTS idx_eq_bookings_user     ON equipment_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_eq_bookings_org      ON equipment_bookings(organization_id);
CREATE INDEX IF NOT EXISTS idx_eq_bookings_status   ON equipment_bookings(status);
CREATE INDEX IF NOT EXISTS idx_eq_bookings_time     ON equipment_bookings(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_bk_notif_user        ON booking_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_bk_notif_booking     ON booking_notifications(booking_id);
CREATE INDEX IF NOT EXISTS idx_bk_blocks_user       ON equipment_booking_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_bk_blocks_org        ON equipment_booking_blocks(organization_id);
CREATE INDEX IF NOT EXISTS idx_retrain_user         ON retraining_requests(user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE equipment_bookings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_booking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_booking_blocks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE retraining_requests        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eq_bookings_policy         ON equipment_bookings;
DROP POLICY IF EXISTS bk_notifications_policy    ON booking_notifications;
DROP POLICY IF EXISTS eq_bk_settings_policy      ON equipment_booking_settings;
DROP POLICY IF EXISTS eq_bk_blocks_policy        ON equipment_booking_blocks;
DROP POLICY IF EXISTS retrain_policy             ON retraining_requests;

-- equipment_bookings: org members see all org bookings; can insert/update own
CREATE POLICY eq_bookings_policy ON equipment_bookings FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR organization_id = my_org_id()
    OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id())
    OR user_id = my_user_id()
  )
  WITH CHECK (
    is_super_admin()
    OR organization_id = my_org_id()
    OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id())
    OR user_id = my_user_id()
  );

-- booking_notifications: users see their own
CREATE POLICY bk_notifications_policy ON booking_notifications FOR ALL TO authenticated
  USING    (is_super_admin() OR user_id = my_user_id())
  WITH CHECK (is_super_admin() OR user_id = my_user_id());

-- equipment_booking_settings: org-scoped via equipment
CREATE POLICY eq_bk_settings_policy ON equipment_booking_settings FOR ALL TO authenticated
  USING    (is_super_admin() OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id()))
  WITH CHECK (is_super_admin() OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id = my_org_id()));

-- equipment_booking_blocks: org-scoped
CREATE POLICY eq_bk_blocks_policy ON equipment_booking_blocks FOR ALL TO authenticated
  USING    (is_super_admin() OR organization_id = my_org_id())
  WITH CHECK (is_super_admin() OR organization_id = my_org_id());

-- retraining_requests: users see own + org admins/managers see all org
CREATE POLICY retrain_policy ON retraining_requests FOR ALL TO authenticated
  USING    (is_super_admin() OR organization_id = my_org_id() OR user_id = my_user_id())
  WITH CHECK (is_super_admin() OR organization_id = my_org_id() OR user_id = my_user_id());

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'equipment_bookings', 'booking_notifications',
    'equipment_booking_settings', 'equipment_booking_blocks', 'retraining_requests'
  )
ORDER BY table_name;
