-- Fix: create training_schedule table missing from ictlab Supabase.
-- Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS training_schedule (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid,
  user_id         uuid,
  equipment_id    uuid,
  organization_id uuid,
  proposed_by     text,
  proposed_date   timestamptz,
  confirmed_date  timestamptz,
  counter_date    timestamptz,
  status          text DEFAULT 'proposed',  -- proposed | confirmed | countered | cancelled
  notes           text,
  updated_at      timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_sched_user   ON training_schedule(user_id);
CREATE INDEX IF NOT EXISTS idx_training_sched_req    ON training_schedule(request_id);
CREATE INDEX IF NOT EXISTS idx_training_sched_org    ON training_schedule(organization_id);
CREATE INDEX IF NOT EXISTS idx_training_sched_eq     ON training_schedule(equipment_id);

ALTER TABLE training_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_schedule_policy ON training_schedule;

CREATE POLICY training_schedule_policy ON training_schedule FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR organization_id::text = my_org_id()::text
    OR user_id::text = my_user_id()::text
  )
  WITH CHECK (
    is_super_admin()
    OR organization_id::text = my_org_id()::text
    OR user_id::text = my_user_id()::text
  );

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'training_schedule'
ORDER BY ordinal_position;
