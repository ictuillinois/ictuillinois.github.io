-- ===========================================================================
-- Daily task reminders — scheduled delivery
-- ===========================================================================
-- Run once in the Supabase SQL Editor for THIS project. Idempotent.
--
-- Prerequisites:
--   1. reminder_sends table + RLS — created by rls_phase1.sql. Run that first.
--   2. Edge Function "daily-reminders" deployed (supabase/functions/daily-reminders).
--
-- The job runs EVERY HOUR and the function returns early unless it is 7am in
-- REMINDER_TZ (default America/Chicago). Scheduling the cron at a fixed UTC
-- hour instead would drift by an hour twice a year at daylight saving, and a
-- reminder that arrives at 6am trains people to ignore reminders.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- tasks.remind_daily is what the tick box in the task modal writes. Without
-- this column the Edge Function's whole SELECT fails and no reminder is ever
-- sent — a missing column fails the entire PostgREST request, not just itself.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS remind_daily BOOLEAN DEFAULT FALSE;

-- notification_prefs needs the two keys these reminders are filtered on.
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS reminder_daily          BOOLEAN DEFAULT TRUE;
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS email_reminder_daily    BOOLEAN DEFAULT FALSE;
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS deadline_reminder       BOOLEAN DEFAULT TRUE;
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS email_deadline_reminder BOOLEAN DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';

-- Re-running replaces the schedule rather than stacking a second copy.
SELECT cron.unschedule('daily-reminders-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-reminders-hourly');

SELECT cron.schedule(
  'daily-reminders-hourly',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://ilqnwprvxwbhvrjstwsd.supabase.co/functions/v1/daily-reminders',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer sb_publishable_HEl1HIKUs2vVmqa16LZhlQ_EwciS1M8',
                 'Content-Type',  'application/json'),
    body    := '{}'::jsonb
  );
  $cron$
);

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------
-- Is it scheduled?
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'daily-reminders-hourly';
--
-- Did the last few runs reach the function? (status 200 = yes)
--   SELECT status, content::text, created FROM net._http_response ORDER BY created DESC LIMIT 5;
--
-- What has been sent today?
--   SELECT kind, count(*) FROM reminder_sends WHERE sent_for = CURRENT_DATE GROUP BY kind;
--
-- Send NOW without waiting for 7am (curl, or paste the URL with ?force=1):
--   https://ilqnwprvxwbhvrjstwsd.supabase.co/functions/v1/daily-reminders?force=1
--   Clear today's claims first or it will find nothing left to send:
--   DELETE FROM reminder_sends WHERE sent_for = CURRENT_DATE;
--
-- Stop it:
--   SELECT cron.unschedule('daily-reminders-hourly');
-- ---------------------------------------------------------------------------
