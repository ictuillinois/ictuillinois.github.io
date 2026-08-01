# iLab (InteleLab-ICT) — Full Project Summary

## 🏗️ Stack & Infrastructure
- **Framework:** React + Vite
- **Database:** Supabase (PostgreSQL + Realtime)
- **State:** Zustand
- **Deploy:** GitHub Pages (`mtt999.github.io/Ilab`) from `/docs` folder
- **Repo:** `github.com/mtt999/Ilab`
- **Windows path:** `C:\Users\motlagh\ilab`
- **Mac path:** `~/Desktop/ilab`

---

## 🔐 Authentication & Roles
- Custom login system (no Supabase Auth) — credentials stored in `users` table
- **3 roles:**
  - `admin` — owner only (you), full access, hidden from UI labels
  - `user` — **Staff** (RE users), PM access, can manage students/staff roles
  - `student` — limited access, blurred locked icons
- Owner admin logs in via hardcoded credentials from `settings` table
- Role-based routing in `App.jsx` — students redirected from restricted screens

---

## 🧭 Navigation & Layout
- **Nav bar** (`Layout.jsx`) — iLab SVG logo, blue `#0d47a1` background, user avatar, 🔔 notification bell, sign out
- **Dashboard** — card grid view + dashboard analytics view toggle
- **All icons visible to students** — locked ones blurred with 🔒 "Staff only" overlay, not clickable
- External link confirmation modal (Mileage Form, Lab Safety)
- Admin can upload background images for each dashboard card

---

## 📦 Supply Inventory (`Home.jsx`)
- Weekly inspection workflow by room
- Unit dropdown: `%`, `Box`, `piece`, `pair`, `kg`, `L`, etc.
- Decimal min qty support
- **3-tab Excel export system:**
  - 📋 Inspection Dates — grouped by month, export per date
  - 📅 Specific Date — calendar picker, full room report
  - 📊 All Records — summary + one tab per date

---

## 🧪 Project Inventory
- Projects with CFOP budget codes, PI/student assignment
- Material tracking: aggregate, asphalt binder, plant mix, cores
- Auto-generated barcodes `[ProjectID]-[Type]-[Seq]`
- QR labels for Brother QL-1110NWB printer
- AI search + PDF extraction via Claude API

---

## 🎓 Training Records
- Fresh Student Training (with admin approval workflow)
- Golf Car Safety
- Equipment Training (365-day expiry tracking)
- Building Alarm PIN management

---

## 📋 Project Management (`PM.jsx`)
Embedded directly in iLab — Staff/Admin only

### Tabs:
- **My Tasks** — task list with progress bars, mini calendar showing deadlines, add task button (staff/admin), day popup on calendar click
- **Team** — staff members with task counts and progress bars
- **Meetings** — create meetings, assign tasks to staff, meeting notes
- **Chat** — real-time staff chat with Supabase Realtime
- **Assign others** — admin-only tab to create & assign tasks to staff

### Task Detail Modal:
- 📋 **Task detail** section
- **Editable start date & deadline** — date pickers in modal
- **Progress tape** — colored gradient bar (red → orange → blue → green) with 25/50/75/100% ticks
- **Quick % buttons** — 0/25/50/75/100
- **Status cycle** — click to cycle todo → in progress → done
- **💬 Comments** — threaded comments per task, real-time via Supabase
- Notifications sent when someone comments on your task

### Supabase tables added:
```sql
tasks, meetings, messages, profiles,
task_comments, notifications, notification_prefs
```

---

## 👤 Profile (`Profile.jsx`)

### Admin view tabs:
- 🔑 Admin Settings (password/email)
- 👥 Students — searchable, sorted by last name, import Excel
- 👨‍💼 Staff & Access — staff list + role switcher (Staff/Student only, no Admin option) + Access Control per staff member
- 🖼️ Icon Images — upload background photos for dashboard cards
- 🔔 Notifications

### Staff view tabs:
- 👤 My Profile
- 👥 Students
- 👨‍💼 Staff Members
- 🔔 Notifications

### Student view tabs:
- 👤 My Info
- 🔔 Notifications

### Access Control:
- Per-staff module toggle (11 screens including PM and Profile)
- Screens: Supply, Projects, Training, Equipment, Hub, Booking, Contact, Mileage, Lab Safety, PM, Profile

---

## 🔔 Notification System

### Bell in nav bar (`NotificationBell.jsx`):
- Red unread count badge
- Dropdown panel with mark-all-read
- Click navigates to relevant screen
- Real-time via Supabase channel subscription

### Notification preferences in Profile (role-based):

| Section | Students | Staff |
|---|---|---|
| 📅 Equipment Booking | ✅ | ✅ |
| 🎓 Training & Certs | ✅ | ❌ |
| 📋 Project Management | ❌ | ✅ |
| 💬 Lab Messages | ✅ | ✅ |

Each event has **In-app 🔔** and **Email 📧** toggle independently.

---

## 📚 Equipment
- Equipment Hub — SOPs & standards
- Equipment Inventory — lab equipment tracking
- Booking Equipment — reserve lab equipment with calendar

---

## 💬 Contact Lab Manager (REMessages)
- Students/staff submit notes, ideas, issue reports to lab manager

---

## 🗄️ Key Database Columns (quirk)
Students were imported with wrong headers:

| DB Column | Actually stores |
|---|---|
| `name` | Last name |
| `email` | First name |
| `phone` | Email address |
| `degree` | Supervisor |

---

## 🚀 Deploy Commands
```bash
# From Mac or Windows
git pull
npm run build
git add docs -f
git commit -m "message"
git push
```

---

## 📋 Pending / Known Issues
- Supply Inventory room inspection — rooms not opening (under investigation)
- Email notification delivery needs backend setup (Resend/SendGrid)
- `profiles` table needs to stay in sync with `users` (role = `user`)

---

## 📁 Key Files

| File | Purpose |
|---|---|
| `src/App.jsx` | Routing + role guards |
| `src/components/Layout.jsx` | Nav bar + notification bell |
| `src/components/NotificationBell.jsx` | Bell dropdown component |
| `src/screens/Dashboard.jsx` | Home dashboard with cards |
| `src/screens/Home.jsx` | Supply inventory + inspection |
| `src/screens/PM.jsx` | Full project management app |
| `src/screens/Profile.jsx` | User profile + admin management |
| `src/screens/Projects.jsx` | Project inventory |
| `src/screens/TrainingRecords.jsx` | Training management |
| `src/screens/EquipmentInventory.jsx` | Equipment tracking |
| `src/screens/BookingEquipment.jsx` | Equipment reservations |
| `src/lib/supabase.js` | Supabase client (`sb`) |
| `src/store/useAppStore.js` | Zustand global state |
