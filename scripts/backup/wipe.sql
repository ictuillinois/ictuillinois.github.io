-- Used ONLY by the Restore workflow, restoring over the SAME project, inside
-- one transaction together with the backup's data.sql: if loading the backup
-- fails at any point, this wipe is rolled back too and nothing is lost.
-- Empties every table in public and auth (keeping the structure, and auth's
-- own migration bookkeeping) so the week's data can be loaded back exactly.
SET session_replication_role = replica;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname IN ('public', 'auth') AND NOT (schemaname = 'auth' AND tablename = 'schema_migrations')
  LOOP
    EXECUTE format('TRUNCATE TABLE %I.%I CASCADE', r.schemaname, r.tablename);
  END LOOP;
END $$;
