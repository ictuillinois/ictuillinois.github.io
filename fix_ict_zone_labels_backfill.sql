-- One-time backfill: resolve raw 'ICT-zone-<timestamp>' IDs that got saved as
-- a material's stored location label, before the getLocationDetail() lookup
-- fix (FloorPlanPicker.jsx) started checking fixedZones. Safe to re-run —
-- once a label is fixed it no longer matches the pattern below, so this
-- becomes a no-op on subsequent runs. Safe to skip entirely if ict_layout
-- has no 'ict_fixed_zones' key (temp table will just be empty).

CREATE TEMP TABLE _zone_labels AS
SELECT x.id, x.label
FROM ict_layout, jsonb_to_recordset(value::jsonb) AS x(id text, label text)
WHERE key = 'ict_fixed_zones';

-- NOTE: the storage_locations table does not exist on this database (confirmed
-- Sept 2026 — rls_phase1.sql's _apply_rls('storage_locations', ...) call has
-- been silently skipping it this whole time), so there is no location_label
-- column to backfill there. Only project_materials.locations[].detail (below)
-- is affected.

-- Backfill project_materials.locations[].detail
UPDATE project_materials pm
SET locations = (
  SELECT jsonb_agg(
    CASE
      WHEN (loc->>'detail') ~ '^ICT-zone-\d+$' AND z.label IS NOT NULL
        THEN jsonb_set(loc, '{detail}', to_jsonb(z.label))
      ELSE loc
    END
  )
  FROM jsonb_array_elements(pm.locations) AS loc
  LEFT JOIN _zone_labels z ON z.id = loc->>'location_id'
)
WHERE pm.locations IS NOT NULL AND jsonb_array_length(pm.locations) > 0;

DROP TABLE _zone_labels;
