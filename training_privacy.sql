-- ===========================================================================
-- Personal training records: only their owner, and that owner's lab managers
-- and admins (Oct 2026). Run in BOTH projects — separate databases. Idempotent.
-- ===========================================================================
-- Before this, these tables let ANY member of the organization — lab users
-- included — read and change EVERY person's rows through the API. The app
-- never did that (each lab-user screen asks only for its own rows), so
-- nothing looked wrong, but the database allowed it.
--
-- After it:
--   • a person reads and writes only their OWN rows (any of their accounts —
--     one person can have a lab-user and a lab-manager row; solo users too);
--   • lab managers and admins read and write every row of people in an
--     organization they manage;
--   • a lab user can no longer approve themselves: when a lab user saves, the
--     approval fields keep their old value (a new row starts "not approved").
--     The equipment exam pass is deliberately NOT guarded — passing the exam
--     is how a lab user earns it.
-- ===========================================================================

-- Organizations where I am an active org admin or lab manager.
CREATE OR REPLACE FUNCTION my_managed_org_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT organization_id FROM users
  WHERE auth_id::text = auth.uid()::text AND is_active AND role IN ('admin', 'user') AND organization_id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION i_manage_people() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NULL OR is_super_admin()
      OR EXISTS (SELECT 1 FROM users WHERE auth_id::text = auth.uid()::text AND is_active AND role IN ('admin', 'user'))
$$;

DO $$
DECLARE
  t text; p record;
  body text := $q$
    is_super_admin()
    OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
    OR user_id::text = my_solo_id()::text
    OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_managed_org_ids() AS oid))
  $q$;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'training_fresh', 'training_golf_car', 'training_building_alarm', 'training_equipment',
    'lab_safety_progress', 'equipment_exam_results', 'retraining_requests', 'training_schedule',
    'vehicle_agreements'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN RAISE NOTICE '% not in this database — skipped', t; CONTINUE; END IF;
    -- Every old policy goes: permissive policies are OR-ed, so one left
    -- behind would keep the whole organization's access open.
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON %I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY personal_training_policy ON %I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)', t, body, body);
  END LOOP;
END $$;

-- ── No self-approval ────────────────────────────────────────────────────────
-- TG_ARGV[0]: the approval columns; TG_ARGV[1]: their values on a new row.
CREATE OR REPLACE FUNCTION guard_training_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cols text[] := string_to_array(TG_ARGV[0], ',');
  fresh jsonb := COALESCE(TG_ARGV[1], '{}')::jsonb;
  patch jsonb := '{}';
  c text;
BEGIN
  IF i_manage_people() THEN RETURN NEW; END IF;
  FOREACH c IN ARRAY cols LOOP
    CONTINUE WHEN NOT (to_jsonb(NEW) ? c);
    patch := patch || jsonb_build_object(c, CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) -> c ELSE COALESCE(fresh -> c, 'null'::jsonb) END);
  END LOOP;
  -- A lab user's own vehicle forms are filed as pending (or acknowledged, for
  -- the manual), never approved.
  -- to_jsonb(NEW)->>'status', not NEW.status: plpgsql does not promise to skip
  -- the right side of AND, and the other tables have no status column.
  IF TG_TABLE_NAME = 'vehicle_agreements' AND TG_OP = 'INSERT'
     AND COALESCE(to_jsonb(NEW) ->> 'status', '') NOT IN ('pending', 'acknowledged') THEN
    patch := patch || jsonb_build_object('status', 'pending');
  END IF;
  RETURN jsonb_populate_record(NEW, patch);
END $$;

DO $$
DECLARE g record;
BEGIN
  FOR g IN SELECT * FROM (VALUES
    ('training_fresh',          'admin_approved,admin_approved_by,admin_approved_at', '{"admin_approved": false}'),
    ('training_golf_car',       'trained,trained_date,trained_by',                   '{"trained": false}'),
    ('training_building_alarm', 'trained,trained_date,trained_by',                   '{"trained": false}'),
    ('lab_safety_progress',     'completed,approved_by,approved_at',                 '{"completed": false}'),
    ('vehicle_agreements',      'approved_by,approved_by_name,approved_at',          '{}')
  ) AS v(tbl, cols, fresh) LOOP
    IF to_regclass('public.' || g.tbl) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS guard_training_approval_trg ON %I', g.tbl);
    EXECUTE format('CREATE TRIGGER guard_training_approval_trg BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION guard_training_approval(%L, %L)', g.tbl, g.cols, g.fresh);
  END LOOP;
END $$;
-- vehicle_agreements.status on UPDATE by a lab user: they never update it in
-- the app, and approval is done by managers — keep it.
CREATE OR REPLACE FUNCTION guard_vehicle_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT i_manage_people() THEN NEW.status := OLD.status; END IF;
  RETURN NEW;
END $$;
DO $$
BEGIN
  IF to_regclass('public.vehicle_agreements') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS guard_vehicle_status_trg ON vehicle_agreements;
    CREATE TRIGGER guard_vehicle_status_trg BEFORE UPDATE OF status ON vehicle_agreements FOR EACH ROW EXECUTE FUNCTION guard_vehicle_status();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Check: one policy per table, all named personal_training_policy.
SELECT tablename, string_agg(policyname, ', ') AS policies
FROM pg_policies WHERE schemaname = 'public'
  AND tablename IN ('training_fresh','training_golf_car','training_building_alarm','training_equipment',
                    'lab_safety_progress','equipment_exam_results','retraining_requests','training_schedule','vehicle_agreements')
GROUP BY tablename ORDER BY tablename;
