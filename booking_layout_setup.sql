-- Booking page layout (Nov 2026) — ICT-Lab.
-- Each person picks how the Booking page draws bookings: Classic (the original
-- Day / Week / Month calendar), Timeline, Agenda or Calendar. The choice is
-- saved on their users row so phone and laptop match (BookingLayouts.jsx).
-- Until this runs, the choice is kept in that browser only.
-- Idempotent. LabHive has its own copy (it also adds solo_users).

ALTER TABLE users ADD COLUMN IF NOT EXISTS booking_layout TEXT DEFAULT NULL;

NOTIFY pgrst, 'reload schema';

-- Check: one row, users.booking_layout
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'booking_layout'
ORDER BY table_name;
