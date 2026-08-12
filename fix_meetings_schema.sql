-- Fix: meetings table missing organization_id column.
-- Without this column, the meetings tab cannot load or create meetings.
-- Run once in Supabase SQL Editor.

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

CREATE INDEX IF NOT EXISTS idx_meetings_org ON meetings(organization_id);

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'meetings' ORDER BY ordinal_position;
