-- maintenance_reminder_setup.sql — run in BOTH projects (ICT-Lab and LabHive).
-- Same file in both folders. Idempotent: safe to run again.
--
-- Maintenance reminders now come from the daily-reminders Edge Function
-- (7am local, deduplicated in reminder_sends), to the lab managers ticked
-- "Remind" under Responsible for Maintenance: 2 weeks before, 1 week before,
-- on the day, then weekly while overdue.
--
-- This retires the old pg_cron job "maintenance-reminders-daily", which was
-- made in the dashboard and is in no file. It messaged every assignee whether
-- ticked or not, fired only on the exact 14th and 7th day (a missed run meant
-- no reminder), ran at 08:00 UTC (3am Chicago), and queued emails with no
-- to_email — so none of its emails could ever be sent. Left running beside
-- the new reminders, everyone would get two.
--
-- After running this: paste the updated supabase/functions/daily-reminders/
-- index.ts into the "daily-reminders" Edge Function and Deploy.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'maintenance-reminders-daily') THEN
    PERFORM cron.unschedule('maintenance-reminders-daily');
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.send_maintenance_reminders();

-- The Profile → Notifications switch for these reminders (in-app on, email off
-- by default, like the other events).
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS maintenance_reminder       BOOLEAN DEFAULT TRUE;
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS email_maintenance_reminder BOOLEAN DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';

-- Check (expected: 0 | 0 | 2 | 4)
SELECT
  (SELECT count(*) FROM cron.job WHERE jobname = 'maintenance-reminders-daily')            AS old_job_left,
  (SELECT count(*) FROM pg_proc WHERE proname = 'send_maintenance_reminders')               AS old_function_left,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'notification_prefs'
       AND column_name IN ('maintenance_reminder', 'email_maintenance_reminder'))           AS pref_columns,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'equipment_inventory'
       AND column_name IN ('next_maintenance_date', 'maintenance_assignees', 'is_active', 'organization_id')) AS equipment_columns;
