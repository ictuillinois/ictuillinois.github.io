-- Fix notification_prefs columns to match the event keys the app reads/writes.
-- The old generic columns (booking_inapp, booking_email, etc.) are left in place
-- and the new per-event columns are added.
-- Run once in Supabase SQL Editor.

ALTER TABLE notification_prefs
  -- Equipment Booking
  ADD COLUMN IF NOT EXISTS booking_confirmed          boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_booking_confirmed    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_reminder           boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_booking_reminder     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_cancelled          boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_booking_cancelled    boolean DEFAULT false,
  -- Training & Certifications
  ADD COLUMN IF NOT EXISTS training_approved          boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_training_approved    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS training_expiring          boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_training_expiring    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS training_submitted         boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_training_submitted   boolean DEFAULT false,
  -- Task Board
  ADD COLUMN IF NOT EXISTS task_assigned              boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_task_assigned        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_comment               boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_task_comment         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS meeting_added              boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_meeting_added        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_status_changed        boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_task_status_changed  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deadline_reminder          boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_deadline_reminder    boolean DEFAULT false,
  -- Daily Reminders
  ADD COLUMN IF NOT EXISTS reminder_daily             boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_reminder_daily       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_items             boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_reminder_items       boolean DEFAULT false,
  -- Project Team
  ADD COLUMN IF NOT EXISTS team_invite                boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_team_invite          boolean DEFAULT false,
  -- Equipment Maintenance
  ADD COLUMN IF NOT EXISTS maintenance_reminder       boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_maintenance_reminder boolean DEFAULT false;

-- Also ensure the notifications table has title + body columns
-- (the app inserts these; the original table only had 'message' which no longer exists)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body  text;
