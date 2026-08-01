-- Solo Workspace Sharing Migration
-- Run this in your Supabase SQL Editor

-- 1. Track which solo user owns each project
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS solo_owner_id uuid REFERENCES solo_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_solo_owner ON projects(solo_owner_id);

-- 2. Workspace invitations sent by a solo user to a teammate email
CREATE TABLE IF NOT EXISTS solo_workspace_invites (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id      uuid        NOT NULL REFERENCES solo_users(id) ON DELETE CASCADE,
  invitee_email text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, invitee_email)
);

CREATE INDEX IF NOT EXISTS idx_swi_owner    ON solo_workspace_invites(owner_id);
CREATE INDEX IF NOT EXISTS idx_swi_invitee  ON solo_workspace_invites(invitee_email);

-- 3. Accepted workspace memberships
CREATE TABLE IF NOT EXISTS solo_workspace_members (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id   uuid        NOT NULL REFERENCES solo_users(id) ON DELETE CASCADE,
  member_id  uuid        NOT NULL REFERENCES solo_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_swm_owner  ON solo_workspace_members(owner_id);
CREATE INDEX IF NOT EXISTS idx_swm_member ON solo_workspace_members(member_id);

-- 4. Project test results (linked to a project)
CREATE TABLE IF NOT EXISTS project_results (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id   uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submitted_by text,
  result_type  text,
  description  text        NOT NULL,
  result_date  date,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pr_project ON project_results(project_id);

-- 5. Project links (linked to a project)
CREATE TABLE IF NOT EXISTS project_links (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title      text        NOT NULL,
  url        text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pl_project ON project_links(project_id);
