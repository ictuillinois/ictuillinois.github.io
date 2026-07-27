-- ============================================================
-- original-ilab — Complete fresh schema
-- Run this ONCE on a brand-new Supabase project.
-- No ALTER TABLE — everything is CREATE TABLE IF NOT EXISTS.
-- ============================================================

-- ── Core user tables ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text,
  email          text,
  phone          text,
  password       text,
  pin            text,
  role           text,
  is_active      boolean DEFAULT true,
  admin_level    text,
  degree         text,
  year_semester  text,
  supervisor     text,
  project_group  text,
  last_name      text,
  photo_url      text,
  avatar         text,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS solo_users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text,
  email            text,
  password         text,
  is_active        boolean DEFAULT true,
  active_modules   jsonb,
  has_set_dashboard boolean DEFAULT false,
  photo_url        text,
  avatar           text,
  created_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text UNIQUE,
  value      text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_screen_access (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text,
  screen_key text
);

CREATE TABLE IF NOT EXISTS user_dashboard_prefs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid,
  active_modules    jsonb,
  has_set_dashboard boolean DEFAULT false,
  allowed_modules   jsonb,
  created_at        timestamptz DEFAULT now()
);

-- ── Supply inventory ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rooms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text,
  icon       text,
  photo_url  text,
  login_mode text DEFAULT 'team',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    uuid,
  name       text,
  unit       text,
  min_qty    numeric DEFAULT 0,
  qty        numeric DEFAULT 0,
  notes      text,
  photo_url  text,
  links      jsonb,
  login_mode text DEFAULT 'team',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inspections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      uuid,
  room_name    text,
  inspector    text,
  inspected_at timestamptz DEFAULT now(),
  flag_count   int DEFAULT 0,
  results      jsonb,
  login_mode   text DEFAULT 'team',
  created_at   timestamptz DEFAULT now()
);

-- ── Projects & materials ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text,
  project_id      text,
  cfop            text,
  status          text DEFAULT 'active',
  pi_user_id      text,
  student_ids     text[],
  sampling_date   date,
  storage_date    date,
  notes           text,
  solo_owner_id   uuid REFERENCES solo_users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_solo_owner ON projects(solo_owner_id);

CREATE TABLE IF NOT EXISTS project_materials (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid,
  material_type        text,
  barcode              text,
  source_type          text,
  source_name          text,
  source_location      text,
  aggregate_source     text,
  agg_nmas             text,
  agg_sieve_sizes      text,
  agg_raw_or_rap       text,
  asphalt_source       text,
  ab_binder_pg         text,
  ab_mix_design        text,
  ab_has_polymer       boolean,
  ab_polymer_info      text,
  ab_other_additives   text,
  pm_mix_design        text,
  pm_nmas              text,
  pm_binder_pg         text,
  other_info           text,
  qty_total            numeric,
  qty_unit             text,
  container_type       text,
  container_color      text,
  container_count      integer,
  container_other      text,
  locations            jsonb,
  sampling_date        date,
  photos               text[],
  barcode_id           text,
  barcode_scanned_at   timestamptz,
  storage_confirmed    boolean,
  storage_notes        text,
  notes                text,
  date_received        date,
  qty                  numeric,
  created_at           timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  submitted_by text,
  result_type  text,
  description  text,
  result_date  date,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  title      text,
  url        text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS test_result_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid,
  title       text,
  value       text,
  unit        text,
  notes       text,
  submitted_by text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_record_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid,
  name         text,
  url          text,
  file_type    text,
  uploaded_by  text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage_locations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text,
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

-- ── Equipment ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS equipment_inventory (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_name                 text,
  nickname                       text,
  category                       text,
  location                       text,
  ref_id                         text,
  model_number                   text,
  serial_number                  text,
  manufacturer                   text,
  date_received                  date,
  condition                      text,
  notes                          text,
  photo_url                      text,
  is_active                      boolean DEFAULT true,
  out_of_service                 boolean DEFAULT false,
  assigned_to                    text,
  max_usage_hours                numeric,
  usage_hours_since_maintenance  numeric DEFAULT 0,
  maintenance_interval_days      integer,
  last_maintenance_date          date,
  next_maintenance_date          date,
  login_mode                     text DEFAULT 'team',
  updated_at                     timestamptz DEFAULT now(),
  created_at                     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_details (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid,
  photo_url    text,
  website_url  text,
  notes        text,
  updated_at   timestamptz DEFAULT now(),
  created_at   timestamptz DEFAULT now()
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
  updated_at   timestamptz DEFAULT now(),
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_sop_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid,
  user_id      text,
  user_name    text,
  note         text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_standards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id    uuid,
  standard_type   text,
  standard_number text,
  standard_name   text,
  file_url        text,
  link_url        text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_exam_questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid,
  user_id      text,
  score        numeric,
  passed       boolean,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_material_progress (
  user_id        text,
  equipment_id   uuid,
  downloaded_sop boolean DEFAULT false,
  watched_video  boolean DEFAULT false,
  updated_at     timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, equipment_id)
);

CREATE TABLE IF NOT EXISTS equipment_temp_access (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text,
  equipment_id uuid,
  granted_by   text,
  granted_at   timestamptz DEFAULT now(),
  expires_at   timestamptz
);

CREATE TABLE IF NOT EXISTS equipment_bookings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id        uuid,
  user_id             text,
  user_name           text,
  title               text,
  start_time          timestamptz,
  end_time            timestamptz,
  notes               text,
  status              text DEFAULT 'confirmed',
  requires_approval   boolean DEFAULT false,
  denied_by           text,
  denied_reason       text,
  booked_on_behalf_of text,
  created_by          text,
  login_mode          text DEFAULT 'team',
  updated_at          timestamptz DEFAULT now(),
  created_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_booking_settings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id      uuid UNIQUE,
  requires_approval boolean DEFAULT false,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS booking_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid,
  user_id    text,
  type       text,
  message    text,
  read       boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retraining_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text,
  user_name    text,
  equipment_id uuid,
  reason       text,
  status       text DEFAULT 'pending',
  created_at   timestamptz DEFAULT now()
);

-- ── Training ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_fresh (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  text,
  instructions_read        boolean DEFAULT false,
  certificate_url          text,
  certificate_name         text,
  certificate_uploaded_at  timestamptz,
  extra_files              jsonb,
  admin_approved           boolean DEFAULT false,
  admin_approved_by        text,
  admin_approved_at        timestamptz,
  created_at               timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_golf_car (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text,
  trained      boolean DEFAULT false,
  trained_date date,
  trained_by   text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_building_alarm (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text,
  alarm_pin    text,
  trained      boolean DEFAULT false,
  trained_date date,
  trained_by   text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_equipment (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text,
  equipment_id uuid,
  trained_date date,
  expires_at   date,
  trained_by   text,
  passed_exam  boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_schedule (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text,
  scheduled_at timestamptz,
  date         date,
  notes        text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_lockers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locker_number text,
  user_id       text,
  user_name     text,
  assigned_by   text,
  assigned_at   timestamptz,
  notes         text
);

-- ── Project management (PM) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text,
  notes           text,
  status          text DEFAULT 'todo',
  progress        integer DEFAULT 0,
  start_date      date,
  deadline        date,
  assigned_to     text,
  created_by      text,
  is_meeting_task boolean DEFAULT false,
  meeting_id      uuid,
  is_private      boolean DEFAULT false,
  login_mode      text DEFAULT 'team',
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_reminders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text,
  title      text,
  due_date   date,
  is_done    boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meetings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date       timestamptz,
  created_by text,
  notes      text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text,
  user_name  text,
  body       text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid,
  user_id    text,
  user_name  text,
  body       text,
  created_at timestamptz DEFAULT now()
);

-- ── Messages (RE Messages) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS re_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   text,
  sender_name text,
  receiver_id text,
  subject     text,
  body        text,
  category    text,
  status      text DEFAULT 'open',
  reply       text,
  attachment_url text,
  edited      boolean DEFAULT false,
  edited_at   timestamptz,
  created_at  timestamptz DEFAULT now()
);

-- ── Notifications ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text,
  message    text,
  type       text,
  read       boolean DEFAULT false,
  link       text,
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

-- ── Solo workspace sharing ───────────────────────────────────

CREATE TABLE IF NOT EXISTS solo_workspace_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES solo_users(id) ON DELETE CASCADE,
  invitee_email text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','declined')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, invitee_email)
);

CREATE TABLE IF NOT EXISTS solo_workspace_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES solo_users(id) ON DELETE CASCADE,
  member_id  uuid NOT NULL REFERENCES solo_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, member_id)
);

-- ── RLS: enable and allow anon full access ───────────────────

DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'users','solo_users','settings','user_screen_access','user_dashboard_prefs',
    'rooms','supplies','inspections',
    'projects','project_materials','project_results','project_links',
    'test_result_entries','project_record_files','storage_locations',
    'equipment_inventory','equipment_categories','equipment_details',
    'equipment_videos','equipment_sop','equipment_sop_notes','equipment_standards',
    'equipment_exam_questions','equipment_exam_results','equipment_material_progress',
    'equipment_temp_access','equipment_bookings','equipment_booking_settings',
    'booking_notifications','retraining_requests',
    'training_fresh','training_golf_car','training_building_alarm',
    'training_equipment','training_schedule','student_lockers',
    'tasks','task_reminders','meetings','messages','task_comments',
    're_messages','notifications','notification_prefs',
    'solo_workspace_invites','solo_workspace_members'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'DO $p$ BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_policies WHERE tablename = %L AND policyname = %L
         ) THEN
           EXECUTE format(''CREATE POLICY %%I ON %%I FOR ALL TO anon USING (true) WITH CHECK (true)'', %L, %L);
         END IF;
       END $p$',
      tbl, 'anon_all_' || tbl, 'anon_all_' || tbl, tbl
    );
  END LOOP;
END $$;
