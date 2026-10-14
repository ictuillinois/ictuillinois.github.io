-- ═══════════════════════════════════════════════════════════════════════════
-- sub_projects_setup.sql — optional sub projects inside a project (Oct 2026)
--
-- The SAME file lives in ictlab/ and labhive/. Run it in BOTH databases.
-- Idempotent. The same rules are in rls_phase1.sql.
--
--   project → sub project (optional) → material folder → reductions
--
--   project_subprojects    a project's sub projects. Name ≤ 20 characters:
--                          it is printed on the 4×6 label.
--   material_subprojects   which sub projects a TOP-LEVEL material folder is
--                          in. A folder can be in several; a folder in none
--                          is on the main project. Reductions are never
--                          linked: they follow their folder.
--
-- Who: anyone who can see the project (the policies ask the projects table,
-- so its own rules decide). A sub project with folders connected cannot be
-- deleted (the link's foreign key refuses it) — disconnect them first.
-- Deleting a whole project removes its links and sub projects with it.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_subprojects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 20),
  organization_id uuid,
  solo_owner_id   uuid,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS project_subprojects_name_uniq ON project_subprojects (project_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS project_subprojects_project_idx ON project_subprojects (project_id);

CREATE TABLE IF NOT EXISTS material_subprojects (
  material_id     uuid NOT NULL REFERENCES project_materials(id) ON DELETE CASCADE,
  subproject_id   uuid NOT NULL REFERENCES project_subprojects(id),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (material_id, subproject_id)
);
CREATE INDEX IF NOT EXISTS material_subprojects_project_idx ON material_subprojects (project_id);

ALTER TABLE project_subprojects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_subprojects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON project_subprojects, material_subprojects FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON project_subprojects, material_subprojects TO authenticated;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN ('project_subprojects', 'material_subprojects')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- The subquery runs under the caller's own rules on projects, so these
-- tables are exactly as visible as the project they belong to.
CREATE POLICY project_subprojects_policy ON project_subprojects FOR ALL TO authenticated
USING      (is_super_admin() OR project_id IN (SELECT id FROM projects))
WITH CHECK (is_super_admin() OR project_id IN (SELECT id FROM projects));

-- A link must join a folder and a sub project of the SAME project.
CREATE POLICY material_subprojects_policy ON material_subprojects FOR ALL TO authenticated
USING (is_super_admin() OR project_id IN (SELECT id FROM projects))
WITH CHECK (
  (is_super_admin() OR project_id IN (SELECT id FROM projects))
  AND material_id   IN (SELECT id FROM project_materials   WHERE project_materials.project_id   = material_subprojects.project_id)
  AND subproject_id IN (SELECT id FROM project_subprojects WHERE project_subprojects.project_id = material_subprojects.project_id)
);

NOTIFY pgrst, 'reload schema';

-- ── Check — run last. Expect two rows, both rls_on = true.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_on,
       (SELECT string_agg(policyname, ', ') FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relname IN ('project_subprojects', 'material_subprojects')
ORDER BY c.relname;
