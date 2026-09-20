-- ===========================================================================
-- ICT-Lab schema sync — columns the shared code uses that this database lacks
-- ===========================================================================
-- Found by scripts/schema-audit.mjs (Sept 20 2026). Types copied from LabHive,
-- where every one of these already exists — this is pure drift between the two
-- databases, not new design.
--
-- Each of these was silently breaking a feature: PostgREST rejects the WHOLE
-- request over one unknown column, and the call sites do not read `error`.
-- Idempotent; safe to re-run.
-- ===========================================================================

-- Equipment photo reminders and waive responses. Every insert into this table
-- supplies message + meta, so ALL of them were failing.
ALTER TABLE booking_notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE booking_notifications ADD COLUMN IF NOT EXISTS meta    JSONB;

-- Before/after photo review + cleanliness findings.
ALTER TABLE equipment_bookings ADD COLUMN IF NOT EXISTS cleanliness_status           TEXT;
ALTER TABLE equipment_bookings ADD COLUMN IF NOT EXISTS cleanliness_findings         JSONB;
ALTER TABLE equipment_bookings ADD COLUMN IF NOT EXISTS after_photo_last_reminded_at TIMESTAMPTZ;
ALTER TABLE equipment_bookings ADD COLUMN IF NOT EXISTS after_photo_reminder_count   INTEGER DEFAULT 0;

-- Calibration could not be saved at all: the insert carries all six.
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS next_due_date            DATE;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS interval_months          INTEGER;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS calibration_document_url TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS calibration_sop_url      TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS notification_enabled     BOOLEAN DEFAULT FALSE;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS updated_at               TIMESTAMPTZ DEFAULT NOW();

-- Org logo, material types, support contact, feedback flag, photo requirement.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url                 TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS material_types           JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_name             TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_email            TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_feedback_org          BOOLEAN DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS require_equipment_photos BOOLEAN DEFAULT FALSE;

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS icon TEXT;

-- Building alarm training toggle.
ALTER TABLE training_building_alarm ADD COLUMN IF NOT EXISTS trained      BOOLEAN DEFAULT FALSE;
ALTER TABLE training_building_alarm ADD COLUMN IF NOT EXISTS trained_by   TEXT;
ALTER TABLE training_building_alarm ADD COLUMN IF NOT EXISTS trained_date DATE;

-- Expiring-training query filters on this.
ALTER TABLE training_equipment ADD COLUMN IF NOT EXISTS expires_at DATE;

-- TeammatesPanel selects it, so the whole member list came back empty.
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT;

NOTIFY pgrst, 'reload schema';

SELECT 'schema sync applied' AS result;
