-- ===========================================================================
-- Vehicle use agreement — ICT-Lab
-- ===========================================================================
-- Run once in the SQL Editor. Idempotent.
--
-- A lab user reads the agreement, signs it and submits; a lab manager approves;
-- the row is the archive. One row per signing, never updated in place beyond
-- the approval decision — a signed agreement is a record of what someone
-- agreed to on a date, so it is kept rather than edited.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS vehicle_agreements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  organization_id   UUID,

  vehicle_name      TEXT NOT NULL,          -- which vehicle the access is for

  -- What they actually agreed to. Stored WITH the row, not looked up later:
  -- the agreement text can be edited, and an archive that shows today's wording
  -- against a signature from last year is not a record of anything.
  agreement_text    TEXT NOT NULL,
  agreement_version INTEGER NOT NULL DEFAULT 1,

  signature_name    TEXT NOT NULL,          -- typed name, as signed
  signed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  status            TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | denied
  approved_by       UUID,
  approved_by_name  TEXT,                   -- kept as text so the archive still
                                            -- reads correctly if that manager
                                            -- account is later deactivated
  approved_at       TIMESTAMPTZ,
  decision_note     TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vehicle_agreements_user_idx ON vehicle_agreements (user_id);
CREATE INDEX IF NOT EXISTS vehicle_agreements_org_idx  ON vehicle_agreements (organization_id, status);

ALTER TABLE vehicle_agreements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicle_agreements_policy ON vehicle_agreements;
CREATE POLICY vehicle_agreements_policy ON vehicle_agreements
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
);

-- The agreement wording itself lives in settings so a lab manager can write and
-- revise it in the app. Bumping vehicle_agreement_version marks everything
-- signed before it as signed against older wording.
INSERT INTO settings (key, value) VALUES ('vehicle_agreement_text', '')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('vehicle_agreement_version', '1')
  ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
SELECT 'vehicle_agreements ready' AS result;
