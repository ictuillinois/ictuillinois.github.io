-- ═══════════════════════════════════════════════════════════════════════════
-- lab_user_no_supply.sql — Supply Inventory is for lab managers and admins
-- only (ICT-Lab + LabHive, Oct 2026 — same file in both). Idempotent.
--
-- The app now walls it off (neverLabUser), so these leftovers do nothing —
-- but they make the saved settings say something that is not true. Removes
-- 'supply' from:
--   organizations.allowed_modules_labusers / lab_user_default_modules
--   user_dashboard_prefs.allowed_modules / active_modules of lab users
-- Column types differ between the two databases (jsonb or text[]), so each
-- update is built for the type the column actually has.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE c record; n bigint;
BEGIN
  FOR c IN
    SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'organizations' AND column_name IN ('allowed_modules_labusers', 'lab_user_default_modules'))
        OR (table_name = 'user_dashboard_prefs' AND column_name IN ('allowed_modules', 'active_modules')))
  LOOP
    IF c.data_type = 'jsonb' THEN
      EXECUTE format(
        'UPDATE %I SET %I = %I - ''supply'' WHERE %I ? ''supply'' %s', c.table_name, c.column_name, c.column_name, c.column_name,
        CASE WHEN c.table_name = 'user_dashboard_prefs' THEN 'AND user_id::text IN (SELECT id::text FROM users WHERE role = ''lab_user'')' ELSE '' END);
    ELSIF c.data_type = 'ARRAY' THEN
      EXECUTE format(
        'UPDATE %I SET %I = array_remove(%I, ''supply'') WHERE ''supply'' = ANY(%I) %s', c.table_name, c.column_name, c.column_name, c.column_name,
        CASE WHEN c.table_name = 'user_dashboard_prefs' THEN 'AND user_id::text IN (SELECT id::text FROM users WHERE role = ''lab_user'')' ELSE '' END);
    ELSE
      RAISE NOTICE 'skipped %.% (type %)', c.table_name, c.column_name, c.data_type;
      CONTINUE;
    END IF;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '%.%: % row(s) cleaned', c.table_name, c.column_name, n;
  END LOOP;
END $$;

-- Check — run last. Expect 0 in every row.
SELECT 'organizations with supply in the lab user pool' AS what,
       count(*) FILTER (WHERE allowed_modules_labusers::text LIKE '%"supply"%') AS n
FROM organizations
UNION ALL
SELECT 'lab users with supply assigned or picked',
       count(*) FILTER (WHERE allowed_modules::text LIKE '%supply%' OR active_modules::text LIKE '%supply%')
FROM user_dashboard_prefs WHERE user_id::text IN (SELECT id::text FROM users WHERE role = 'lab_user');
