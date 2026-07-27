-- ============================================================
-- pro-ilab schema fix #2
-- Adds missing columns to tables that already existed but
-- were created with fewer columns than the source DB.
-- Safe to re-run (all use ADD COLUMN IF NOT EXISTS).
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pin            text,
  ADD COLUMN IF NOT EXISTS degree         text,
  ADD COLUMN IF NOT EXISTS year_semester  text,
  ADD COLUMN IF NOT EXISTS supervisor     text,
  ADD COLUMN IF NOT EXISTS project_group  text,
  ADD COLUMN IF NOT EXISTS is_active      boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_name      text,
  ADD COLUMN IF NOT EXISTS photo_url      text,
  ADD COLUMN IF NOT EXISTS password       text,
  ADD COLUMN IF NOT EXISTS admin_level    text;

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS icon      text,
  ADD COLUMN IF NOT EXISTS photo_url text;

ALTER TABLE supplies
  ADD COLUMN IF NOT EXISTS qty       numeric,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS notes     text,
  ADD COLUMN IF NOT EXISTS links     text[];

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_id    text,
  ADD COLUMN IF NOT EXISTS cfop          text,
  ADD COLUMN IF NOT EXISTS pi_user_id    text,
  ADD COLUMN IF NOT EXISTS student_ids   text[],
  ADD COLUMN IF NOT EXISTS assigned_to   text,
  ADD COLUMN IF NOT EXISTS sampling_date date,
  ADD COLUMN IF NOT EXISTS storage_date  date;

ALTER TABLE project_materials
  ADD COLUMN IF NOT EXISTS agg_nmas              text,
  ADD COLUMN IF NOT EXISTS agg_sieve_sizes        text,
  ADD COLUMN IF NOT EXISTS agg_raw_or_rap         text,
  ADD COLUMN IF NOT EXISTS ab_binder_pg           text,
  ADD COLUMN IF NOT EXISTS ab_mix_design          text,
  ADD COLUMN IF NOT EXISTS ab_has_polymer         boolean,
  ADD COLUMN IF NOT EXISTS ab_polymer_info        text,
  ADD COLUMN IF NOT EXISTS ab_other_additives     text,
  ADD COLUMN IF NOT EXISTS pm_mix_design          text,
  ADD COLUMN IF NOT EXISTS pm_nmas                text,
  ADD COLUMN IF NOT EXISTS pm_binder_pg           text,
  ADD COLUMN IF NOT EXISTS other_info             text,
  ADD COLUMN IF NOT EXISTS source_type            text,
  ADD COLUMN IF NOT EXISTS source_name            text,
  ADD COLUMN IF NOT EXISTS source_location        text,
  ADD COLUMN IF NOT EXISTS qty_total              numeric,
  ADD COLUMN IF NOT EXISTS qty_unit               text,
  ADD COLUMN IF NOT EXISTS container_type         text,
  ADD COLUMN IF NOT EXISTS container_color        text,
  ADD COLUMN IF NOT EXISTS container_count        integer,
  ADD COLUMN IF NOT EXISTS container_other        text,
  ADD COLUMN IF NOT EXISTS locations              jsonb,
  ADD COLUMN IF NOT EXISTS sampling_date          date,
  ADD COLUMN IF NOT EXISTS photos                 text[],
  ADD COLUMN IF NOT EXISTS barcode_id             text,
  ADD COLUMN IF NOT EXISTS barcode_scanned_at     timestamptz,
  ADD COLUMN IF NOT EXISTS storage_confirmed      boolean,
  ADD COLUMN IF NOT EXISTS storage_notes          text;

ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS equipment_name                text,
  ADD COLUMN IF NOT EXISTS nickname                      text,
  ADD COLUMN IF NOT EXISTS location                      text,
  ADD COLUMN IF NOT EXISTS category                      text,
  ADD COLUMN IF NOT EXISTS ref_id                        text,
  ADD COLUMN IF NOT EXISTS model_number                  text,
  ADD COLUMN IF NOT EXISTS serial_number                 text,
  ADD COLUMN IF NOT EXISTS manufacturer                  text,
  ADD COLUMN IF NOT EXISTS date_received                 date,
  ADD COLUMN IF NOT EXISTS condition                     text,
  ADD COLUMN IF NOT EXISTS notes                         text,
  ADD COLUMN IF NOT EXISTS photo_url                     text,
  ADD COLUMN IF NOT EXISTS maintenance_interval_days     integer,
  ADD COLUMN IF NOT EXISTS last_maintenance_date         date,
  ADD COLUMN IF NOT EXISTS next_maintenance_date         date,
  ADD COLUMN IF NOT EXISTS is_active                     boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at                    timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS max_usage_hours               numeric,
  ADD COLUMN IF NOT EXISTS usage_hours_since_maintenance numeric,
  ADD COLUMN IF NOT EXISTS assigned_to                   text,
  ADD COLUMN IF NOT EXISTS out_of_service                boolean DEFAULT false;

ALTER TABLE equipment_details
  ADD COLUMN IF NOT EXISTS equipment_id uuid,
  ADD COLUMN IF NOT EXISTS photo_url    text,
  ADD COLUMN IF NOT EXISTS website_url  text,
  ADD COLUMN IF NOT EXISTS notes        text,
  ADD COLUMN IF NOT EXISTS created_at   timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();

ALTER TABLE equipment_sop
  ADD COLUMN IF NOT EXISTS equipment_id uuid,
  ADD COLUMN IF NOT EXISTS title        text,
  ADD COLUMN IF NOT EXISTS pdf_url      text,
  ADD COLUMN IF NOT EXISTS steps        jsonb,
  ADD COLUMN IF NOT EXISTS created_at   timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();

ALTER TABLE equipment_standards
  ADD COLUMN IF NOT EXISTS equipment_id    uuid,
  ADD COLUMN IF NOT EXISTS standard_type   text,
  ADD COLUMN IF NOT EXISTS standard_number text,
  ADD COLUMN IF NOT EXISTS standard_name   text,
  ADD COLUMN IF NOT EXISTS file_url        text,
  ADD COLUMN IF NOT EXISTS link_url        text,
  ADD COLUMN IF NOT EXISTS created_at      timestamptz DEFAULT now();

ALTER TABLE equipment_exam_questions
  ADD COLUMN IF NOT EXISTS equipment_id   uuid,
  ADD COLUMN IF NOT EXISTS question       text,
  ADD COLUMN IF NOT EXISTS option_a       text,
  ADD COLUMN IF NOT EXISTS option_b       text,
  ADD COLUMN IF NOT EXISTS option_c       text,
  ADD COLUMN IF NOT EXISTS option_d       text,
  ADD COLUMN IF NOT EXISTS correct_answer text,
  ADD COLUMN IF NOT EXISTS order_num      integer,
  ADD COLUMN IF NOT EXISTS created_at     timestamptz DEFAULT now();

ALTER TABLE equipment_bookings
  ADD COLUMN IF NOT EXISTS equipment_id          uuid,
  ADD COLUMN IF NOT EXISTS user_id               text,
  ADD COLUMN IF NOT EXISTS user_name             text,
  ADD COLUMN IF NOT EXISTS title                 text,
  ADD COLUMN IF NOT EXISTS start_time            timestamptz,
  ADD COLUMN IF NOT EXISTS end_time              timestamptz,
  ADD COLUMN IF NOT EXISTS status                text,
  ADD COLUMN IF NOT EXISTS requires_approval     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS denied_by             text,
  ADD COLUMN IF NOT EXISTS denied_reason         text,
  ADD COLUMN IF NOT EXISTS booked_on_behalf_of   text,
  ADD COLUMN IF NOT EXISTS created_by            text,
  ADD COLUMN IF NOT EXISTS notes                 text,
  ADD COLUMN IF NOT EXISTS created_at            timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz DEFAULT now();

ALTER TABLE storage_locations
  ADD COLUMN IF NOT EXISTS location_id    text,
  ADD COLUMN IF NOT EXISTS location_label text,
  ADD COLUMN IF NOT EXISTS facility       text,
  ADD COLUMN IF NOT EXISTS occupied       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS project_id     uuid,
  ADD COLUMN IF NOT EXISTS material_id    uuid,
  ADD COLUMN IF NOT EXISTS project_name   text,
  ADD COLUMN IF NOT EXISTS material_type  text,
  ADD COLUMN IF NOT EXISTS occupied_at    timestamptz,
  ADD COLUMN IF NOT EXISTS occupied_by    text,
  ADD COLUMN IF NOT EXISTS created_at     timestamptz DEFAULT now();

ALTER TABLE student_lockers
  ADD COLUMN IF NOT EXISTS locker_number text,
  ADD COLUMN IF NOT EXISTS user_id       text,
  ADD COLUMN IF NOT EXISTS user_name     text,
  ADD COLUMN IF NOT EXISTS assigned_by   text,
  ADD COLUMN IF NOT EXISTS assigned_at   timestamptz,
  ADD COLUMN IF NOT EXISTS notes         text;

ALTER TABLE training_fresh
  ADD COLUMN IF NOT EXISTS user_id                 text,
  ADD COLUMN IF NOT EXISTS certificate_url         text,
  ADD COLUMN IF NOT EXISTS certificate_name        text,
  ADD COLUMN IF NOT EXISTS certificate_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS instructions_read       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra_files             jsonb,
  ADD COLUMN IF NOT EXISTS admin_approved          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_approved_by       text,
  ADD COLUMN IF NOT EXISTS admin_approved_at       timestamptz,
  ADD COLUMN IF NOT EXISTS created_at              timestamptz DEFAULT now();

ALTER TABLE training_building_alarm
  ADD COLUMN IF NOT EXISTS user_id      text,
  ADD COLUMN IF NOT EXISTS alarm_pin    text,
  ADD COLUMN IF NOT EXISTS trained      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS trained_date date,
  ADD COLUMN IF NOT EXISTS trained_by   text,
  ADD COLUMN IF NOT EXISTS created_at   timestamptz DEFAULT now();

-- user_screen_access: drop FK on user_id so migration can insert
-- regardless of whether users migrated first
ALTER TABLE user_screen_access
  ADD COLUMN IF NOT EXISTS user_id    text,
  ADD COLUMN IF NOT EXISTS screen_key text;

-- Drop the FK constraint so user_screen_access can insert freely
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'user_screen_access'
    AND constraint_type = 'FOREIGN KEY'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE user_screen_access DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'user_screen_access'
      AND constraint_type = 'FOREIGN KEY'
      LIMIT 1
    );
  END IF;
END $$;

-- Same for project_supplies
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'project_supplies'
    AND constraint_type = 'FOREIGN KEY'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE project_supplies DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'project_supplies'
      AND constraint_type = 'FOREIGN KEY'
      LIMIT 1
    );
  END IF;
END $$;

-- Same for supplies (room_id FK)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'supplies'
    AND constraint_name = 'supplies_room_id_fkey'
  ) THEN
    ALTER TABLE supplies DROP CONSTRAINT supplies_room_id_fkey;
  END IF;
END $$;

-- settings: key/value store for admin password, email, icon images
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS key        text,
  ADD COLUMN IF NOT EXISTS value      text;

-- solo_users: individual solo-login accounts
ALTER TABLE solo_users
  ADD COLUMN IF NOT EXISTS name              text,
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS password          text,
  ADD COLUMN IF NOT EXISTS is_active         boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS active_modules    jsonb,
  ADD COLUMN IF NOT EXISTS has_set_dashboard boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_url         text;

-- user_dashboard_prefs: per-user dashboard icon selection
ALTER TABLE user_dashboard_prefs
  ADD COLUMN IF NOT EXISTS user_id           uuid,
  ADD COLUMN IF NOT EXISTS active_modules    jsonb,
  ADD COLUMN IF NOT EXISTS has_set_dashboard boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_modules   jsonb;

-- notification_prefs
ALTER TABLE notification_prefs
  ADD COLUMN IF NOT EXISTS user_id        uuid,
  ADD COLUMN IF NOT EXISTS booking_inapp  boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_email  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS training_inapp boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS training_email boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pm_inapp       boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS pm_email       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS messages_inapp boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS messages_email boolean DEFAULT false;
