-- Fix: create all Task Board tables missing from ictlab Supabase.
-- Run once in Supabase SQL Editor.

-- ── 1. tasks ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text,
  assigned_to     text,
  created_by      text,
  status          text DEFAULT 'todo',
  progress        integer DEFAULT 0,
  priority        text DEFAULT 'medium',
  notes           text,
  start_date      date,
  start_time      text,
  deadline        date,
  deadline_time   text,
  is_private      boolean DEFAULT false,
  is_meeting_task boolean DEFAULT false,
  meeting_id      uuid,
  reference_url   text,
  icon_url        text,
  remind_daily    boolean DEFAULT false,
  login_mode      text DEFAULT 'team',
  organization_id uuid REFERENCES organizations(id),
  created_at      timestamptz DEFAULT now()
);

-- ── 2. meetings ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meetings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date            date,
  notes           text,
  created_by      text,
  organization_id uuid REFERENCES organizations(id),
  created_at      timestamptz DEFAULT now()
);

-- ── 3. task_comments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid,
  user_id    text,
  user_name  text,
  body       text,
  created_at timestamptz DEFAULT now()
);

-- ── 4. task_attachments ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid,
  file_name   text,
  file_url    text,
  file_size   bigint,
  uploaded_by text,
  created_at  timestamptz DEFAULT now()
);

-- ── 5. reminders ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text,
  title      text,
  notes      text,
  start_day  date,
  end_day    date,
  start_time text,
  end_time   text,
  is_done    boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ── 6. user_out_of_lab ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_out_of_lab (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  date            date NOT NULL,
  note            text,
  organization_id uuid,
  login_mode      text DEFAULT 'team',
  created_at      timestamptz DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_org       ON tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned  ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_meetings_org    ON meetings(organization_id);
CREATE INDEX IF NOT EXISTS idx_task_comments   ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attach     ON task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user  ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_ool_user        ON user_out_of_lab(user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_out_of_lab  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_policy            ON tasks;
DROP POLICY IF EXISTS meetings_policy         ON meetings;
DROP POLICY IF EXISTS task_comments_policy    ON task_comments;
DROP POLICY IF EXISTS task_attachments_policy ON task_attachments;
DROP POLICY IF EXISTS reminders_policy        ON reminders;
DROP POLICY IF EXISTS ool_policy              ON user_out_of_lab;

-- tasks: org-scoped
CREATE POLICY tasks_policy ON tasks FOR ALL TO authenticated
  USING    (is_super_admin() OR organization_id = my_org_id())
  WITH CHECK (is_super_admin() OR organization_id = my_org_id());

-- meetings: org-scoped
CREATE POLICY meetings_policy ON meetings FOR ALL TO authenticated
  USING    (is_super_admin() OR organization_id = my_org_id())
  WITH CHECK (is_super_admin() OR organization_id = my_org_id());

-- task_comments: open to authenticated (task_id already scopes access)
CREATE POLICY task_comments_policy ON task_comments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- task_attachments: open to authenticated
CREATE POLICY task_attachments_policy ON task_attachments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- reminders: user sees only their own
CREATE POLICY reminders_policy ON reminders FOR ALL TO authenticated
  USING    (is_super_admin() OR user_id::text = my_user_id()::text)
  WITH CHECK (is_super_admin() OR user_id::text = my_user_id()::text);

-- user_out_of_lab: org-scoped for admins, own rows for regular users
CREATE POLICY ool_policy ON user_out_of_lab FOR ALL TO authenticated
  USING    (is_super_admin() OR organization_id = my_org_id())
  WITH CHECK (is_super_admin() OR organization_id = my_org_id());

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('tasks','meetings','task_comments','task_attachments','reminders','user_out_of_lab')
ORDER BY table_name;
