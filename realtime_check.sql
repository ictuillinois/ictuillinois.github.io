-- Which tables THIS project subscribes to, and whether realtime is on.
--
-- A subscription to a table that is not in the supabase_realtime publication
-- does not error — it connects, waits, and never fires. The "live" feature
-- built on it silently becomes a refresh-only one. ICT-Lab had five such
-- tables (tasks, task_comments, re_messages, support_messages,
-- admin_notifications) and nobody had noticed.
--
-- Regenerate after adding a subscription:
--   grep -rhoE "table: '[a-z_]+'" src | sed "s/table: '//;s/'//" | sort -u

WITH subscribed(tbl) AS (VALUES
  ('admin_notifications'),
  ('booking_notifications'),
  ('equipment_exam_results'),
  ('equipment_material_progress'),
  ('lab_safety_progress'),
  ('notifications'),
  ('re_messages'),
  ('solo_users'),
  ('support_messages'),
  ('task_comments'),
  ('tasks'),
  ('training_fresh')
)
SELECT s.tbl AS table_name,
       CASE
         WHEN t.table_name IS NULL THEN 'table does not exist here'
         WHEN p.tablename  IS NULL THEN '❌ REALTIME OFF — subscriptions never fire'
         ELSE                           '✅ realtime on'
       END AS status
FROM subscribed s
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = s.tbl
LEFT JOIN pg_publication_tables p
  ON p.pubname = 'supabase_realtime' AND p.tablename = s.tbl
ORDER BY 2, 1;
