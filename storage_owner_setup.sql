-- storage_owner_setup.sql — ICT-Lab. Idempotent: safe to run again.
--
-- Storage places now have an OWNER: the person who stored there first. They
-- may keep adding materials to that place (one storage_locations row per
-- material); nobody else may, except lab managers / admins, who can also move
-- anyone's material (the owner is notified).
--
-- The app records the owner in occupied_by_id. Rows stored before this only
-- have a name (occupied_by); the backfill below links a name to its person
-- when that name belongs to exactly one person in the organization.

ALTER TABLE storage_locations ADD COLUMN IF NOT EXISTS occupied_by_id UUID;

UPDATE storage_locations s
SET    occupied_by_id = m.id
FROM  (SELECT organization_id, name, (array_agg(id ORDER BY created_at))[1] AS id
       FROM users
       WHERE name IS NOT NULL
       GROUP BY organization_id, name
       HAVING count(DISTINCT lower(email)) = 1) m
WHERE  s.occupied = TRUE
  AND  s.occupied_by_id IS NULL
  AND  s.occupied_by = m.name
  AND  s.organization_id = m.organization_id;

CREATE INDEX IF NOT EXISTS storage_locations_org_loc_idx ON storage_locations (organization_id, location_id);

NOTIFY pgrst, 'reload schema';

-- Check: stored rows, how many have an owner id, and any left with a name only
SELECT count(*) FILTER (WHERE occupied)                                   AS stored_rows,
       count(*) FILTER (WHERE occupied AND occupied_by_id IS NOT NULL)    AS with_owner_id,
       string_agg(DISTINCT occupied_by, ', ') FILTER (WHERE occupied AND occupied_by_id IS NULL) AS names_not_linked
FROM storage_locations;
