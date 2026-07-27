# LabHive — Context File for New Chat Session

## Project Identity
- **App name:** LabHive
- **Live URL:** https://labhive.app/
- **Repo:** github.com/mtt999/labhive
- **Stack:** React 18 + Vite + Zustand + Supabase
- **Deploy:** `npm run build` → `/docs` → GitHub Pages
- **Windows path:** `C:\Users\motlagh\labhive`
- **Mac path:** `~/Desktop/labhive`
- **Supabase client:** exported as `sb` from `src/lib/supabase.js`

---

## Roles
| Role | DB value | Description |
|---|---|---|
| Admin | `admin` | Owner only (Mohsen). Full access. Never shown as label in UI. |
| Staff | `user` | Research Engineers. PM access. Can manage students/staff. |
| Student | `student` | Limited access. Locked icons shown blurred. |

- Owner admin has `userId: null` in session (no row in users table)
- Regular admin/staff have a real UUID as `userId`

---

## Database Column Quirk (CRITICAL)
Students were imported with wrong headers — always use these mappings:
| DB Column | Actually stores |
|---|---|
| `name` | Last name |
| `email` | First name |
| `phone` | Email address |
| `degree` | Supervisor |

---

## Key Files
| File | Purpose |
|---|---|
| `src/App.jsx` | Routing + role guards |
| `src/components/Layout.jsx` | Nav bar with LabHive SVG logo + NotificationBell |
| `src/components/NotificationBell.jsx` | Bell icon with unread count dropdown |
| `src/screens/Dashboard.jsx` | Home dashboard — card grid + analytics view |
| `src/screens/Home.jsx` | Supply inventory + room inspection + Excel export |
| `src/screens/PM.jsx` | Full project management (tasks, team, meetings, chat) |
| `src/screens/Profile.jsx` | User profile + admin management + notifications |
| `src/screens/Projects.jsx` | Project inventory |
| `src/screens/TrainingRecords.jsx` | Training certs + approval workflow |
| `src/screens/EquipmentInventory.jsx` | Equipment tracking |
| `src/screens/BookingEquipment.jsx` | Equipment reservations |
| `src/store/useAppStore.js` | Zustand global state (session, screen, toast) |

---

## Supabase Tables
### Core tables
- `users` — all users (admin/staff/student), role, password, is_active
- `settings` — key/value store (admin credentials, URLs, module images)
- `user_screen_access` — per-staff screen access control

### Supply Inventory
- `rooms`, `supplies`, `inspections`, `inspection_items`

### Projects
- `projects`, `project_materials`, `project_files`

### Training
- `training_fresh`, `training_golf_car`, `training_building_alarm`, `training_equipment`

### Equipment
- `equipment`, `equipment_bookings`

### Project Management (PM)
- `tasks` — title, assigned_to, created_by, status, progress, start_date, deadline, notes, is_meeting_task, meeting_id
- `meetings` — date, notes, created_by
- `messages` — chat messages, sender_id, body, sent_at
- `task_comments` — task_id, user_id, user_name, body
- `notifications` — user_id, type, title, body, task_id, read
- `notification_prefs` — user_id + boolean flags per event type

### All tables have RLS enabled with `allow_all` policy

---

## PM App — Key Logic
- **Owner admin (userId=null)** → sees ALL tasks (no filter)
- **Regular staff** → sees tasks where `assigned_to` OR `created_by` = their userId
- **Assign others tab** → admin only, assigns tasks to staff
- **Staff shown in dropdowns** → always from `users` table where `role = 'user'`
- **profiles table** → must stay in sync with users (role='user')

---

## Notification System
### Bell (NotificationBell.jsx)
- Real-time via Supabase channel `notifications_{userId}`
- Red badge for unread count
- Mark all read button
- Click → navigates to PM screen

### Notification events by role
| Event key | Trigger | Roles |
|---|---|---|
| `task_assigned` | Task assigned to staff | staff |
| `task_comment` | Comment on task | staff |
| `meeting_added` | Meeting task assigned | staff |
| `task_status_changed` | Status changed | staff |
| `booking_confirmed` | Booking confirmed | all |
| `booking_reminder` | 1 day before booking | all |
| `booking_cancelled` | Booking cancelled | all |
| `training_approved` | Cert approved | student |
| `training_expiring` | Cert expiring soon | student |
| `training_submitted` | Submission received | student |
| `message_reply` | Reply to lab message | all |

Each event has `in-app` and `email_` boolean in `notification_prefs`

---

## Dashboard
- **Students** see all icons — locked ones blurred with 🔒 "Staff only"
- **Staff** see only their allowed modules (set in Access Control)
- **Admin** sees all modules + PM icon + edit admin cards
- PM icon only visible to admin and staff

---

## Deploy Commands
```bash
git pull
npm run build
git add docs -f
git commit -m "your message"
git push
```

---

## Pending Issues
- Supply Inventory room inspection — rooms not opening (bug under investigation)
- Email notifications need backend (Resend/SendGrid) — UI built, delivery not wired
- `profiles` table needs manual sync with `users` (role='user') via SQL upsert

---

## SQL to run if needed (new Supabase tables)
```sql
-- PM tables
CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL, user_id uuid, user_name text NOT NULL,
  body text NOT NULL, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, type text NOT NULL, title text NOT NULL,
  body text, task_id uuid, read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id uuid PRIMARY KEY,
  task_comment boolean DEFAULT true, task_assigned boolean DEFAULT true,
  meeting_added boolean DEFAULT true, task_status_changed boolean DEFAULT true,
  booking_confirmed boolean DEFAULT true, booking_reminder boolean DEFAULT true,
  booking_cancelled boolean DEFAULT true, training_approved boolean DEFAULT true,
  training_expiring boolean DEFAULT true, training_submitted boolean DEFAULT true,
  message_reply boolean DEFAULT true,
  email_task_comment boolean DEFAULT false, email_task_assigned boolean DEFAULT false,
  email_meeting_added boolean DEFAULT false, email_task_status_changed boolean DEFAULT false,
  email_booking_confirmed boolean DEFAULT false, email_booking_reminder boolean DEFAULT false,
  email_booking_cancelled boolean DEFAULT false, email_training_approved boolean DEFAULT false,
  email_training_expiring boolean DEFAULT false, email_training_submitted boolean DEFAULT false,
  email_message_reply boolean DEFAULT false
);
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON task_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON notification_prefs FOR ALL USING (true) WITH CHECK (true);
```

---

## Style Constants
```js
const BLUE = '#0d47a1'        // nav bar, primary buttons, active states
const ORANGE = '#ff6b00'      // accents, staff badges, orbit rings
const ORANGE_LIGHT = '#fff3e0'
```
