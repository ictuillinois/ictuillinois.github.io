-- Solo data isolation migration
-- Run this in the Supabase SQL Editor

-- Rooms
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS login_mode text DEFAULT 'team';
UPDATE rooms SET login_mode = 'team' WHERE login_mode IS NULL;

-- Supplies
ALTER TABLE supplies ADD COLUMN IF NOT EXISTS login_mode text DEFAULT 'team';
UPDATE supplies SET login_mode = 'team' WHERE login_mode IS NULL;

-- Inspections
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS login_mode text DEFAULT 'team';
UPDATE inspections SET login_mode = 'team' WHERE login_mode IS NULL;

-- Equipment inventory
ALTER TABLE equipment_inventory ADD COLUMN IF NOT EXISTS login_mode text DEFAULT 'team';
UPDATE equipment_inventory SET login_mode = 'team' WHERE login_mode IS NULL;

-- Equipment bookings
ALTER TABLE equipment_bookings ADD COLUMN IF NOT EXISTS login_mode text DEFAULT 'team';
UPDATE equipment_bookings SET login_mode = 'team' WHERE login_mode IS NULL;
