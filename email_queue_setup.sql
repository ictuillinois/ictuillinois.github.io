-- ================================================================
-- Email queue processor setup — run in Supabase SQL Editor.
-- Pairs with the send-emails Edge Function (supabase/functions/send-emails).
-- ================================================================

-- 1. Add the columns the processor needs (idempotent).
ALTER TABLE email_notifications_queue
  ADD COLUMN IF NOT EXISTS sent       boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sent_at    timestamptz,
  ADD COLUMN IF NOT EXISTS attempts   integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error      text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Fast lookup of the unsent backlog.
CREATE INDEX IF NOT EXISTS idx_email_queue_unsent
  ON email_notifications_queue (sent, created_at) WHERE sent = false;

-- 2. ⚠️ IMPORTANT — clear the STALE backlog BEFORE scheduling the cron.
--    Every notification the app ever "sent" is still sitting in this table
--    unsent. If you enable the cron without this, users get flooded with
--    weeks of old emails on the first run. This marks all existing rows as
--    already handled so only NEW notifications go out.
--    (Comment this out only if you truly want the backlog delivered.)
UPDATE email_notifications_queue SET sent = true WHERE sent = false;

-- 3. Schedule the Edge Function every minute via pg_cron + pg_net.
--    Requires the extensions (Supabase: Database → Extensions → enable
--    `pg_cron` and `pg_net`).  You can also do this in the dashboard under
--    Integrations → Cron instead of this SQL.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Replace <ANON_KEY> with your project's anon/publishable key (safe to use
-- here — it only authorizes invoking the function; the function itself uses
-- the service role internally).
SELECT cron.schedule(
  'send-emails-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://ilqnwprvxwbhvrjstwsd.supabase.co/functions/v1/send-emails',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer sb_publishable_HEl1HIKUs2vVmqa16LZhlQ_EwciS1M8',
                 'Content-Type',  'application/json'),
    body    := '{}'::jsonb
  );
  $cron$
);

-- To inspect / remove the schedule later:
--   SELECT * FROM cron.job;
--   SELECT cron.unschedule('send-emails-every-minute');
