-- Several tests on one instrument, each with its own SOP and exam, plus an
-- explanation on each exam question (Nov 2026). ICT-Lab copy — LabHive has its
-- own, whose policy also covers solo equipment. Safe to run again.
-- Rules: src/lib/equipmentTests.js

CREATE TABLE IF NOT EXISTS equipment_tests (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID NOT NULL REFERENCES equipment_inventory(id) ON DELETE CASCADE,
  standard     TEXT,
  name         TEXT NOT NULL,
  order_num    INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS equipment_tests_equipment_idx ON equipment_tests (equipment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_tests TO authenticated, service_role;
ALTER TABLE equipment_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eq_hub_policy ON equipment_tests;
CREATE POLICY eq_hub_policy ON equipment_tests FOR ALL TO authenticated
USING (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
);

-- NULL test_id = the instrument's own SOP / exam, as before.
-- Removing a test removes its SOP and questions; results already taken stay.
ALTER TABLE equipment_sop            ADD COLUMN IF NOT EXISTS test_id UUID REFERENCES equipment_tests(id) ON DELETE CASCADE;
ALTER TABLE equipment_exam_questions ADD COLUMN IF NOT EXISTS test_id UUID REFERENCES equipment_tests(id) ON DELETE CASCADE;
ALTER TABLE equipment_exam_questions ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE equipment_exam_results   ADD COLUMN IF NOT EXISTS test_id UUID REFERENCES equipment_tests(id) ON DELETE SET NULL;

-- The tests a lab user asked for; copied to the session when a date is proposed.
ALTER TABLE retraining_requests ADD COLUMN IF NOT EXISTS test_ids UUID[];
ALTER TABLE training_schedule   ADD COLUMN IF NOT EXISTS test_ids UUID[];

NOTIFY pgrst, 'reload schema';

-- Check: 7 rows expected.
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public' AND (
  (table_name = 'equipment_tests' AND column_name = 'equipment_id')
  OR (column_name = 'test_id' AND table_name IN ('equipment_sop', 'equipment_exam_questions', 'equipment_exam_results'))
  OR (column_name = 'explanation' AND table_name = 'equipment_exam_questions')
  OR (column_name = 'test_ids' AND table_name IN ('retraining_requests', 'training_schedule'))
) ORDER BY 1, 2;
