-- Fix: create meetings table (was missing entirely in ictlab Supabase).
-- Run once in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS meetings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date            date,
  notes           text,
  created_by      uuid,
  organization_id uuid REFERENCES organizations(id),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meetings_org ON meetings(organization_id);

-- Enable RLS and add org-scoped policy
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meetings_policy ON meetings;
CREATE POLICY meetings_policy ON meetings
  FOR ALL TO authenticated
  USING    (is_super_admin() OR organization_id = my_org_id())
  WITH CHECK (is_super_admin() OR organization_id = my_org_id());

-- Also ensure tasks table has meeting_id column (used to link tasks to meetings)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS meeting_id uuid;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_meeting_task boolean DEFAULT false;

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'meetings' ORDER BY ordinal_position;
