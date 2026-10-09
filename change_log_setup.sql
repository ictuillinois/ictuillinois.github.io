-- ===========================================================================
-- Change log (Oct 2026) — record every settings change, alert, report daily.
-- Run in BOTH projects (ICT-Lab and LabHive): separate databases. Idempotent.
-- ===========================================================================
-- Why: ICT-Lab's material types changed with no record of who or when, and
-- nothing in the app could answer it. These are TRIGGERS, so they record a
-- change however it is made — any screen, the SQL editor, a script — not only
-- the paths the app knows about.
--
-- Watched:
--   organizations       every column (material types, category, icon pools…)
--   settings            every key (global icon pools, URLs, images…);
--                       admin_password / super_admin_auth_id values hidden
--   users               added, removed, or role / active / admin level /
--                       organization / email / name changed (not logins)
--   user_screen_access  screen access granted or removed
--
-- Each change → one change_log row + one super-admin bell alert. Each morning
-- (8am Chicago) the previous day's changes are emailed to settings.admin_email.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS change_log (
  id              BIGSERIAL PRIMARY KEY,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  table_name      TEXT NOT NULL,
  action          TEXT NOT NULL,            -- added | changed | removed
  row_label       TEXT,                     -- org / user / setting name
  fields          TEXT[],                   -- which columns changed
  old_values      JSONB,
  new_values      JSONB,
  changed_by      TEXT,                     -- name, or "SQL editor / system"
  changed_by_auth UUID,
  organization_id UUID,
  digested        BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS change_log_changed_at_idx ON change_log (changed_at DESC);
CREATE INDEX IF NOT EXISTS change_log_digest_idx ON change_log (digested) WHERE NOT digested;

-- Readable by the super admin only. Written only by the trigger below, which
-- runs as its owner and so is not subject to these policies.
ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS change_log_select ON change_log;
CREATE POLICY change_log_select ON change_log FOR SELECT TO authenticated USING (is_super_admin());
REVOKE ALL ON change_log FROM anon;

CREATE OR REPLACE FUNCTION log_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o      jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  n      jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  rec    jsonb := COALESCE(n, o);
  watch  text[] := CASE WHEN TG_NARGS > 0 AND TG_ARGV[0] <> '*' THEN string_to_array(TG_ARGV[0], ',') END;
  secret text[] := '{}';
  k text; ov jsonb := '{}'; nv jsonb := '{}'; flds text[] := '{}';
  who text; uid uuid := auth.uid(); act text; lbl text; org uuid;
BEGIN
  -- The bell's own on/off preferences: logging them would alert about the alerts
  IF TG_TABLE_NAME = 'settings' AND rec->>'key' = 'admin_notif_prefs' THEN RETURN NULL; END IF;

  IF TG_TABLE_NAME = 'settings' AND rec->>'key' IN ('admin_password', 'super_admin_auth_id') THEN
    secret := ARRAY['value'];
  END IF;

  FOR k IN SELECT jsonb_object_keys(rec) LOOP
    CONTINUE WHEN watch IS NOT NULL AND NOT (k = ANY (watch));
    CONTINUE WHEN k IN ('updated_at', 'created_at', 'password_hash', 'last_login', 'last_seen');
    CONTINUE WHEN TG_OP = 'UPDATE' AND (o->k) IS NOT DISTINCT FROM (n->k);
    flds := flds || k;
    ov := ov || jsonb_build_object(k, CASE WHEN k = ANY (secret) AND o IS NOT NULL THEN to_jsonb('(hidden)'::text) ELSE o->k END);
    nv := nv || jsonb_build_object(k, CASE WHEN k = ANY (secret) AND n IS NOT NULL THEN to_jsonb('(hidden)'::text) ELSE n->k END);
  END LOOP;

  -- An update that touched only unwatched columns (a login, a photo) is not news
  IF TG_OP = 'UPDATE' AND cardinality(flds) = 0 THEN RETURN NULL; END IF;

  act := CASE TG_OP WHEN 'INSERT' THEN 'added' WHEN 'DELETE' THEN 'removed' ELSE 'changed' END;
  lbl := COALESCE(rec->>'name', rec->>'key', rec->>'email', rec->>'screen_key', rec->>'id');
  IF TG_TABLE_NAME = 'user_screen_access' THEN
    lbl := COALESCE((SELECT name FROM users WHERE id::text = rec->>'user_id' LIMIT 1), rec->>'user_id') || ' → ' || COALESCE(rec->>'screen_key', '?');
  END IF;
  org := CASE WHEN TG_TABLE_NAME = 'organizations' THEN (rec->>'id')::uuid
              WHEN rec ? 'organization_id' THEN NULLIF(rec->>'organization_id', '')::uuid END;

  IF uid IS NULL THEN
    who := 'SQL editor / system';
  ELSIF EXISTS (SELECT 1 FROM settings WHERE key = 'super_admin_auth_id' AND value = uid::text) THEN
    who := 'Super admin';
  ELSE
    SELECT COALESCE(NULLIF(trim(nick_name), ''), name) || ' (' || role || ')' INTO who
      FROM users WHERE auth_id = uid ORDER BY is_active DESC LIMIT 1;
    IF who IS NULL AND to_regclass('public.solo_users') IS NOT NULL THEN
      EXECUTE 'SELECT name || '' (solo)'' FROM solo_users WHERE auth_id = $1 LIMIT 1' INTO who USING uid;
    END IF;
    who := COALESCE(who, 'User ' || uid::text);
  END IF;

  INSERT INTO change_log (table_name, action, row_label, fields, old_values, new_values, changed_by, changed_by_auth, organization_id)
  VALUES (TG_TABLE_NAME, act, lbl, flds,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE ov END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE nv END,
          who, uid, org);

  -- The super admin's bell. Best effort: never block the change itself.
  BEGIN
    INSERT INTO admin_notifications (type, title, body)
    VALUES ('setting_change',
            initcap(TG_TABLE_NAME) || ' ' || act || ': ' || COALESCE(lbl, '—'),
            CASE WHEN TG_OP = 'UPDATE' THEN array_to_string(flds, ', ') || ' — by ' ELSE 'By ' END || who);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Logging must never break the change it is logging
  RAISE WARNING 'log_change failed on %: %', TG_TABLE_NAME, SQLERRM;
  RETURN NULL;
END $$;

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('organizations',      '*'),
    ('settings',           '*'),
    ('users',              'role,is_active,admin_level,organization_id,email,name,last_name'),
    ('user_screen_access', '*')
  ) AS v(tbl, cols) LOOP
    IF to_regclass('public.' || t.tbl) IS NULL THEN
      RAISE NOTICE 'change_log: % does not exist here — skipped', t.tbl;
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS log_change_trg ON %I', t.tbl);
    EXECUTE format('CREATE TRIGGER log_change_trg AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION log_change(%L)', t.tbl, t.cols);
  END LOOP;
END $$;

-- ── Daily report ────────────────────────────────────────────────────────────
-- One email with every change not yet reported. Nothing changed → no email.
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
         || initcap(r.table_name) || ' ' || r.action || ': ' || COALESCE(r.row_label, '—')
         || CASE WHEN vals <> '' THEN ' (' || vals || ')' ELSE '' END || ' — ' || r.changed_by || E'\n';
    html := html || '<tr><td style="padding:4px 10px;color:#666;white-space:nowrap">'
         || to_char(r.changed_at AT TIME ZONE 'America/Chicago', 'Mon DD HH24:MI') || '</td><td style="padding:4px 10px"><b>'
         || initcap(r.table_name) || ' ' || r.action || '</b>: ' || replace(replace(COALESCE(r.row_label, '—'), '<', '&lt;'), '>', '&gt;')
         || CASE WHEN vals <> '' THEN ' <span style="color:#666">(' || vals || ')</span>' ELSE '' END
         || '</td><td style="padding:4px 10px;color:#666">' || replace(replace(r.changed_by, '<', '&lt;'), '>', '&gt;') || '</td></tr>';
  END LOOP;
  html := html || '</table><p style="font-family:Arial,sans-serif;color:#666">Before and after values are in the Change log in the super admin panel.</p>';

  INSERT INTO email_notifications_queue (to_email, subject, body, html_body, type)
  VALUES (to_addr, 'Daily change report — ' || n || ' change' || CASE WHEN n = 1 THEN '' ELSE 's' END, txt, html, 'change_digest');
  UPDATE change_log SET digested = TRUE WHERE NOT digested;
  RETURN n;
END $$;

-- 13:00 UTC = 8am Chicago in summer, 7am in winter.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'daily-change-digest';
  PERFORM cron.schedule('daily-change-digest', '0 13 * * *', 'SELECT queue_change_digest()');
END $$;

NOTIFY pgrst, 'reload schema';

-- Check: four triggers and the daily job.
SELECT event_object_table AS watched_table, count(*) AS trigger_events
FROM information_schema.triggers WHERE trigger_name = 'log_change_trg'
GROUP BY 1 ORDER BY 1;
SELECT jobname, schedule FROM cron.job WHERE jobname = 'daily-change-digest';
