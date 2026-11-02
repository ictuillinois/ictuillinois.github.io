-- email_subjects_setup.sql — ICT-Lab ONLY. Idempotent: safe to run again.
--
-- Emails to the ICT engineers / admin say what they are and who sent them,
-- and Reply answers the sender (reply_to, passed to Resend by send-emails):
--   [ICT-Lab · Customer Service] <subject> — <sender>   → ictengineers@mx.uillinois.edu
--   [ICT-Lab · Problem report] <who> (<screen>)         → ictengineers@mx.uillinois.edu
--   [ICT-Lab · Settings report] <n> changes              → settings.admin_email
-- The digest function also lives in change_log_setup.sql (updated together).
-- After running: redeploy the send-emails Edge Function.

ALTER TABLE email_notifications_queue ADD COLUMN IF NOT EXISTS reply_to TEXT;

CREATE OR REPLACE FUNCTION queue_change_digest() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  to_addr text; n integer; txt text; html text; r record; vals text;
BEGIN
  SELECT value INTO to_addr FROM settings WHERE key = 'admin_email';
  SELECT count(*) INTO n FROM change_log WHERE NOT digested;
  IF n = 0 OR to_addr IS NULL OR to_addr = '' THEN RETURN 0; END IF;

  txt  := n || ' change' || CASE WHEN n = 1 THEN '' ELSE 's' END || ' since the last report:' || E'\n\n';
  html := '<p style="font-family:Arial,sans-serif">' || n || ' change' || CASE WHEN n = 1 THEN '' ELSE 's' END
       || ' since the last report:</p><table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse">';
  FOR r IN SELECT * FROM change_log WHERE NOT digested ORDER BY changed_at LOOP
    vals := CASE WHEN r.action = 'changed' THEN array_to_string(r.fields, ', ') ELSE '' END;
    txt  := txt || to_char(r.changed_at AT TIME ZONE 'America/Chicago', 'Mon DD HH24:MI') || '  '
         || CASE r.table_name WHEN 'organizations' THEN 'Organization settings' ELSE 'App settings' END
         || ' ' || r.action || ': ' || COALESCE(r.row_label, '—')
         || CASE WHEN vals <> '' THEN ' (' || vals || ')' ELSE '' END || ' — ' || r.changed_by || E'\n';
    html := html || '<tr><td style="padding:4px 10px;color:#666;white-space:nowrap">'
         || to_char(r.changed_at AT TIME ZONE 'America/Chicago', 'Mon DD HH24:MI') || '</td><td style="padding:4px 10px"><b>'
         || CASE r.table_name WHEN 'organizations' THEN 'Organization settings' ELSE 'App settings' END
         || ' ' || r.action || '</b>: ' || replace(replace(COALESCE(r.row_label, '—'), '<', '&lt;'), '>', '&gt;')
         || CASE WHEN vals <> '' THEN ' <span style="color:#666">(' || vals || ')</span>' ELSE '' END
         || '</td><td style="padding:4px 10px;color:#666">' || replace(replace(r.changed_by, '<', '&lt;'), '>', '&gt;') || '</td></tr>';
  END LOOP;
  html := html || '</table><p style="font-family:Arial,sans-serif;color:#666">Before and after values are in the Change log in the super admin panel.</p>';

  INSERT INTO email_notifications_queue (to_email, subject, body, html_body, type)
  VALUES (to_addr, '[ICT-Lab · Settings report] ' || n || ' change' || CASE WHEN n = 1 THEN '' ELSE 's' END, txt, html, 'change_digest');
  UPDATE change_log SET digested = TRUE WHERE NOT digested;
  RETURN n;
END $$;

NOTIFY pgrst, 'reload schema';

-- Check (expected: 1 | 1 | the address the daily settings report goes to)
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'email_notifications_queue' AND column_name = 'reply_to') AS reply_to_column,
  (SELECT count(*) FROM pg_proc WHERE proname = 'queue_change_digest' AND prosrc LIKE '%ICT-Lab · Settings report%')     AS digest_subject,
  (SELECT trim(both '"' from value) FROM settings WHERE key = 'admin_email')                                              AS settings_report_goes_to;
