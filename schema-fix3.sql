-- Add missing phone column to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone text;

-- Drop the NOT NULL constraint on storage_locations.name
ALTER TABLE storage_locations
  ALTER COLUMN name DROP NOT NULL;
