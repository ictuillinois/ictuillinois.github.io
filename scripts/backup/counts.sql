-- Exact row count of every table the backup holds (public + auth), as one JSON
-- object. Written to row_counts.json at backup time and compared after a restore.
SELECT coalesce(json_object_agg(t.table_schema || '.' || t.table_name,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.table_schema, t.table_name), false, true, '')))[1]::text::bigint
  ORDER BY t.table_schema, t.table_name), '{}'::json)
FROM information_schema.tables t
WHERE t.table_schema IN ('public', 'auth') AND t.table_type = 'BASE TABLE';
