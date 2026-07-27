-- ============================================================
-- pro-ilab Supabase schema fix
-- Run this in the Supabase SQL editor for the pro-ilab project
-- before running migrate.mjs
-- ============================================================

-- ── Existing tables: add missing columns ──────────────────

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
  ADD COLUMN IF NOT EXISTS project_id  text,
  ADD COLUMN IF NOT EXISTS cfop        text,
  ADD COLUMN IF NOT EXISTS pi_user_id  text,
  ADD COLUMN IF NOT EXISTS student_ids text[],
  ADD COLUMN IF NOT EXISTS assigned_to text,
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

-- ── New tables ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS equipment_categories (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_inventory (
  id                            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_name                text,
  nickname                      text,
  location                      text,
  category                      text,
  ref_id                        text,
  model_number                  text,
  serial_number                 text,
  manufacturer                  text,
  date_received                 date,
  condition                     text,
  notes                         text,
  photo_url                     text,
  maintenance_interval_days     integer,
  last_maintenance_date         date,
  next_maintenance_date         date,
  is_active                     boolean DEFAULT true,
  created_at                    timestamptz DEFAULT now(),
  updated_at                    timestamptz DEFAULT now(),
  max_usage_hours               numeric,
  usage_hours_since_maintenance numeric,
  assigned_to                   text,
  out_of_service                boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS equipment_details (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid,
  photo_url    text,
  website_url  text,
  notes        text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_videos (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid,
  title        text,
  video_url    text,
  description  text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_sop (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid,
  title        text,
  pdf_url      text,
  steps        jsonb,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_sop_notes (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid,
  note         text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_standards (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id    uuid,
  standard_type   text,
  standard_number text,
  standard_name   text,
  file_url        text,
  link_url        text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_exam_questions (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id   uuid,
  question       text,
  option_a       text,
  option_b       text,
  option_c       text,
  option_d       text,
  correct_answer text,
  order_num      integer,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_exam_results (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid,
  user_id      text,
  score        numeric,
  passed       boolean,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_material_progress (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid,
  user_id      text,
  progress     numeric,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_temp_access (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid,
  user_id      text,
  granted_by   text,
  expires_at   timestamptz,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_bookings (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id          uuid,
  user_id               text,
  user_name             text,
  title                 text,
  start_time            timestamptz,
  end_time              timestamptz,
  status                text,
  requires_approval     boolean DEFAULT false,
  denied_by             text,
  denied_reason         text,
  booked_on_behalf_of   text,
  created_by            text,
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_booking_settings (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid,
  setting_key  text,
  setting_val  text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS booking_notifications (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid,
  user_id    text,
  message    text,
  read       boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage_locations (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id    text,
  location_label text,
  facility       text,
  occupied       boolean DEFAULT false,
  project_id     uuid,
  material_id    uuid,
  project_name   text,
  material_type  text,
  occupied_at    timestamptz,
  occupied_by    text,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_lockers (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  locker_number text,
  user_id     text,
  user_name   text,
  assigned_by text,
  assigned_at timestamptz,
  notes       text
);

CREATE TABLE IF NOT EXISTS training_fresh (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 text,
  certificate_url         text,
  certificate_name        text,
  certificate_uploaded_at timestamptz,
  instructions_read       boolean DEFAULT false,
  extra_files             jsonb,
  admin_approved          boolean DEFAULT false,
  admin_approved_by       text,
  admin_approved_at       timestamptz,
  created_at              timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_golf_car (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    text,
  trained    boolean DEFAULT false,
  trained_date date,
  trained_by text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_building_alarm (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      text,
  alarm_pin    text,
  trained      boolean DEFAULT false,
  trained_date date,
  trained_by   text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_equipment (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      text,
  equipment_id uuid,
  trained_date date,
  expires_at   date,
  trained_by   text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_schedule (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title        text,
  scheduled_at timestamptz,
  notes        text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retraining_requests (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      text,
  equipment_id uuid,
  reason       text,
  status       text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title          text,
  assigned_to    text,
  created_by     text,
  status         text DEFAULT 'todo',
  progress       integer DEFAULT 0,
  notes          text,
  start_date     date,
  deadline       date,
  is_meeting_task boolean DEFAULT false,
  meeting_id     uuid,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meetings (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date       timestamptz,
  created_by text,
  notes      text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    text,
  user_name  text,
  body       text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_comments (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id    uuid,
  user_id    text,
  user_name  text,
  body       text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    text,
  message    text,
  type       text,
  read       boolean DEFAULT false,
  link       text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_prefs (
  id       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id  text,
  pref_key text,
  enabled  boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS user_dashboard_prefs (
  id       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id  text,
  pref_key text,
  pref_val text
);

-- user_screen_access may already exist; ensure all columns present
CREATE TABLE IF NOT EXISTS user_screen_access (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    text,
  screen_key text
);

-- test_result_entries already works; no changes needed

-- ── Enable RLS (open policies for now — tighten later) ─────

ALTER TABLE equipment_categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_inventory         ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_details           ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_videos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_sop               ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_sop_notes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_standards         ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_exam_questions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_exam_results      ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_material_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_temp_access       ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_bookings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_booking_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_locations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_lockers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_fresh              ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_golf_car           ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_building_alarm     ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_equipment          ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_schedule           ENABLE ROW LEVEL SECURITY;
ALTER TABLE retraining_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications               ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_prefs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_dashboard_prefs        ENABLE ROW LEVEL SECURITY;

-- Allow anon full access (matches pattern of existing tables)
DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'equipment_categories','equipment_inventory','equipment_details',
    'equipment_videos','equipment_sop','equipment_sop_notes',
    'equipment_standards','equipment_exam_questions','equipment_exam_results',
    'equipment_material_progress','equipment_temp_access','equipment_bookings',
    'equipment_booking_settings','booking_notifications','storage_locations',
    'student_lockers','training_fresh','training_golf_car',
    'training_building_alarm','training_equipment','training_schedule',
    'retraining_requests','tasks','meetings','messages','task_comments',
    'notifications','notification_prefs','user_dashboard_prefs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format(
      'CREATE POLICY IF NOT EXISTS "anon_all_%s" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;
