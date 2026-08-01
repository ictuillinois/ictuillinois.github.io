-- ─────────────────────────────────────────────────────────────
-- pro-ilab schema setup
-- Run this ONCE in the pro-ilab SQL editor (lxjudxjcxhrynnlxodtg)
-- All statements use IF NOT EXISTS — safe to re-run
-- ─────────────────────────────────────────────────────────────

-- ── Patch existing tables with any missing columns ───────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password       text,
  ADD COLUMN IF NOT EXISTS role           text,
  ADD COLUMN IF NOT EXISTS is_active      boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS project_group  text,
  ADD COLUMN IF NOT EXISTS avatar_url     text,
  ADD COLUMN IF NOT EXISTS created_at     timestamptz DEFAULT now();

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS is_active  boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order int;

ALTER TABLE supplies
  ADD COLUMN IF NOT EXISTS room_id    uuid,
  ADD COLUMN IF NOT EXISTS category   text,
  ADD COLUMN IF NOT EXISTS unit       text,
  ADD COLUMN IF NOT EXISTS min_qty    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty        numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_id   text,
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS cfop         text,
  ADD COLUMN IF NOT EXISTS pi_name      text,
  ADD COLUMN IF NOT EXISTS student_name text,
  ADD COLUMN IF NOT EXISTS status       text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS notes        text,
  ADD COLUMN IF NOT EXISTS created_at   timestamptz DEFAULT now();

ALTER TABLE project_materials
  ADD COLUMN IF NOT EXISTS project_id      uuid,
  ADD COLUMN IF NOT EXISTS material_type   text,
  ADD COLUMN IF NOT EXISTS barcode         text,
  ADD COLUMN IF NOT EXISTS aggregate_source text,
  ADD COLUMN IF NOT EXISTS asphalt_source  text,
  ADD COLUMN IF NOT EXISTS date_received   date,
  ADD COLUMN IF NOT EXISTS qty             numeric,
  ADD COLUMN IF NOT EXISTS notes           text,
  ADD COLUMN IF NOT EXISTS created_at      timestamptz DEFAULT now();

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS user_id    uuid,
  ADD COLUMN IF NOT EXISTS type       text,
  ADD COLUMN IF NOT EXISTS title      text,
  ADD COLUMN IF NOT EXISTS body       text,
  ADD COLUMN IF NOT EXISTS task_id    uuid,
  ADD COLUMN IF NOT EXISTS read       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE re_messages
  ADD COLUMN IF NOT EXISTS user_id    uuid,
  ADD COLUMN IF NOT EXISTS user_name  text,
  ADD COLUMN IF NOT EXISTS subject    text,
  ADD COLUMN IF NOT EXISTS body       text,
  ADD COLUMN IF NOT EXISTS category   text,
  ADD COLUMN IF NOT EXISTS status     text DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS reply      text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS room_id        uuid,
  ADD COLUMN IF NOT EXISTS inspected_by   text,
  ADD COLUMN IF NOT EXISTS inspection_date date,
  ADD COLUMN IF NOT EXISTS items          jsonb,
  ADD COLUMN IF NOT EXISTS created_at     timestamptz DEFAULT now();

ALTER TABLE project_supplies
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS name        text,
  ADD COLUMN IF NOT EXISTS qty         numeric,
  ADD COLUMN IF NOT EXISTS unit        text,
  ADD COLUMN IF NOT EXISTS notes       text,
  ADD COLUMN IF NOT EXISTS created_at  timestamptz DEFAULT now();

ALTER TABLE project_files
  ADD COLUMN IF NOT EXISTS project_id  uuid,
  ADD COLUMN IF NOT EXISTS name        text,
  ADD COLUMN IF NOT EXISTS url         text,
  ADD COLUMN IF NOT EXISTS file_type   text,
  ADD COLUMN IF NOT EXISTS uploaded_by text,
  ADD COLUMN IF NOT EXISTS created_at  timestamptz DEFAULT now();

-- ── Create missing tables ────────────────────────────────────

CREATE TABLE IF NOT EXISTS equipment_categories (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name  text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_inventory (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_name                 text NOT NULL,
  nickname                       text,
  category                       text,
  location                       text,
  condition                      text,
  date_received                  date,
  serial_number                  text,
  notes                          text,
  is_active                      boolean DEFAULT true,
  out_of_service                 boolean DEFAULT false,
  assigned_to                    text,
  max_usage_hours                numeric,
  usage_hours_since_maintenance  numeric DEFAULT 0,
  maintenance_interval_days      int,
  last_maintenance_date          date,
  next_maintenance_date          date,
  updated_at                     timestamptz DEFAULT now(),
  created_at                     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_list (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_name text NOT NULL,
  description    text,
  is_active      boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_details (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid,
  photo_url    text,
  website_url  text,
  notes        text,
  updated_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_videos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid,
  title        text,
  video_url    text,
  description  text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_sop (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid,
  title        text,
  pdf_url      text,
  steps        jsonb,
  updated_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_sop_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid,
  user_id      uuid,
  user_name    text,
  note         text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_standards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id    uuid,
  standard_type   text,
  standard_number text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_exam_questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id   uuid,
  question       text,
  options        jsonb,
  correct_answer text,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_exam_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,
  equipment_id uuid,
  score        numeric,
  passed       boolean,
  taken_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_material_progress (
  user_id        uuid,
  equipment_id   uuid,
  downloaded_sop boolean DEFAULT false,
  watched_video  boolean DEFAULT false,
  updated_at     timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, equipment_id)
);

CREATE TABLE IF NOT EXISTS equipment_temp_access (
  user_id      uuid,
  equipment_id uuid,
  granted_by   text,
  granted_at   timestamptz DEFAULT now(),
  expires_at   timestamptz,
  PRIMARY KEY (user_id, equipment_id)
);

CREATE TABLE IF NOT EXISTS equipment_bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id     uuid,
  user_id          uuid,
  user_name        text,
  start_time       timestamptz,
  end_time         timestamptz,
  purpose          jsonb,
  notes            text,
  status           text DEFAULT 'confirmed',
  requires_approval boolean DEFAULT false,
  denied_by        text,
  denied_reason    text,
  updated_at       timestamptz DEFAULT now(),
  created_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_booking_settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id     uuid,
  requires_approval boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS booking_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid,
  user_id    uuid,
  type       text,
  message    text,
  read       boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage_locations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_lockers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  locker_number text,
  assigned_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_fresh (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid,
  instructions_read        boolean DEFAULT false,
  certificate_url          text,
  certificate_name         text,
  certificate_uploaded_at  timestamptz,
  admin_approved           boolean DEFAULT false,
  admin_approved_by        text,
  admin_approved_at        timestamptz,
  created_at               timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_golf_car (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,
  trained      boolean DEFAULT false,
  trained_date date,
  trained_by   text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_building_alarm (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,
  trained      boolean DEFAULT false,
  trained_date date,
  trained_by   text,
  alarm_code   text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_equipment (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,
  equipment_id uuid,
  trained_date date,
  trained_by   text,
  passed_exam  boolean DEFAULT false,
  expires_at   date,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_schedule (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text,
  date       date,
  notes      text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retraining_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,
  user_name    text,
  equipment_id uuid,
  status       text DEFAULT 'pending',
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  notes           text,
  status          text DEFAULT 'todo',
  progress        int DEFAULT 0,
  start_date      date,
  deadline        date,
  assigned_to     uuid,
  created_by      uuid,
  is_meeting_task boolean DEFAULT false,
  meeting_id      uuid,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meetings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date,
  notes      text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid,
  user_name text,
  body      text,
  sent_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid,
  user_id    uuid,
  user_name  text,
  body       text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_prefs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid UNIQUE,
  booking_inapp   boolean DEFAULT true,
  booking_email   boolean DEFAULT false,
  training_inapp  boolean DEFAULT true,
  training_email  boolean DEFAULT false,
  pm_inapp        boolean DEFAULT true,
  pm_email        boolean DEFAULT false,
  messages_inapp  boolean DEFAULT true,
  messages_email  boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid UNIQUE,
  role       text,
  created_at timestamptz DEFAULT now()
);
