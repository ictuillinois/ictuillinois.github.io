# LabHive — Build Prompt & Session Log

Purpose: a running record of when and how you directed AI tools (Claude Code,
Claude.ai, etc.) to build or modify LabHive. This is supporting evidence of
independent origination — combined with your git history, it documents that
the app was built from your own specifications, not copied from another
product.

Place this file in the root of your labhive repo. It will be picked up
automatically by labhive_provenance_generate.sh and included in each snapshot.

How to use: add a new entry below each time you have a significant session
(new feature, major redesign, architecture change). Doesn't need to be
exhaustive — the goal is a dated trail showing your own direction of the work,
not a full transcript of every conversation.

---

## Entry template (copy this block for each new entry)

### [YYYY-MM-DD] — Short description of what was built/changed

**Tool used:** Claude Code / Claude.ai / other

**What I asked for (summary, not full transcript):**
-

**Resulting changes (files/features affected):**
-

**Related git commit(s):** (paste hash or range, e.g. abc1234..def5678)

---

## Log

### 2026-07-25 — Lab Messages: delete convs, bubble fix, chat background picker, Sara

**Tool used:** Claude Code

**What I asked for (summary, not full transcript):**
- Remove the duplicate "+ New" button from the top-right of Lab Messages (keep sidebar one)
- Give org admin the ability to delete conversations one-by-one or all at once
- Fix bubble alignment in Lab Messages for org admin viewing others' conversations (all bubbles were showing on the left)
- Add optional chat background picker (7 themes) for all users, saved to localStorage
- Make the chat window shorter so Sara's floating icon fits on the page

**Resulting changes (files/features affected):**
- `src/screens/messaging/LabMessage.jsx` — removed page-header + New button; `isOrgAdmin` flag; `deleteConv()` / `deleteAllConvs()` with confirm modal; 🗑 Delete button in thread header and "Delete all" in sidebar footer; `adminObserving` flag + corrected `isOwn` logic; `CHAT_BACKGROUNDS` constant with 7 themes; 🎨 picker button + popover in thread header; background applied to bubbles container; height changed to `calc(100% - 68px)` to leave room for Sara
- `src/components/Layout.jsx` — removed `screen !== 'remessages'` Sara exclusion

**Related git commit(s):** (current session)

---

### 2026-07-25 — App versioning, Overview interactivity, provenance kit (v2.0.0)

**Tool used:** Claude Code

**What I asked for (summary, not full transcript):**
- Fix reminder showing in "Past History" panel when added for today (timezone bug)
- Add version numbers to the app: v1.0 = before June 2 / June 2, v2.0 = July 2026
- When user clicks on "High / Medium / Low" priority pills in Overview, show a list of tasks in that category (user's tasks only)
- When user clicks a task in the Overview panel (Upcoming or Overdue), automatically open My Tasks tab and pop up that task's detail
- Add provenance documentation files to the repo root

**Resulting changes (files/features affected):**
- `src/lib/version.js` — new file: APP_VERSION, VERSION_DATE, CHANGELOG
- `src/components/AboutModal.jsx` — version badge (v2.0.0) in header; collapsible "What's new" changelog panel
- `src/screens/maintenance/PM.jsx` — priority pills now expand a filtered task list; Overview task rows clickable to open My Tasks detail; reminder timezone fix (local date instead of UTC); Out-of-Lab and checkNotifications also fixed
- `package.json` — bumped to 2.0.0
- `LABHIVE_AI_BUILD_LOG.md`, `LABHIVE_PROVENANCE_README.md`, `labhive_provenance_generate.sh`, `labhive_provenance_hook_setup.sh` — provenance kit files added

**Related git commit(s):** 700b6a6..a6e714b

---

### 2026-07-24 — Task Board: private task fix, Out-of-Lab date ranges, daily reminders, reminder table

**Tool used:** Claude Code

**What I asked for (summary, not full transcript):**
- Fix "Private task" checkbox in the Add Task modal — text was overflowing outside the modal or not visible
- Allow users to select a date range (not just a single day) when marking Out-of-Lab days
- Connect tasks to the Reminder tab: add a "Remind me daily at 8 AM" toggle on tasks; only the task owner can opt in; multi-day tasks fire every day until done
- Tasks with daily reminders enabled should appear in the Reminders tab Upcoming panel

**Resulting changes (files/features affected):**
- `src/screens/maintenance/PM.jsx` — private task toggle rewritten as div (fixed global CSS conflict); OutOfLabPanel accepts start + end date range and inserts one row per day; daily reminder toggle in Add Task modal and TaskModal; Reminders component fetches and displays remind_daily tasks in Today/Active and Upcoming panels; TaskReminderRow component added

**Related git commit(s):** 54947f7..b2d3503

---

### 2026-07-21 — Auth improvements, welcome email, messages recipient dropdown

**Tool used:** Claude Code

**What I asked for (summary, not full transcript):**
- When admin creates a new user, send them a welcome email with their credentials
- Auto-confirm email after sign-up so admin-created accounts can log in immediately
- Handle reused emails (deleted users) — delete orphaned auth user and retry
- Lab Messages: make the recipient dropdown searchable; include lab users as recipients for staff/admin senders

**Resulting changes (files/features affected):**
- `src/lib/welcomeEmail.js` — new file: queues a styled welcome email via email_notifications_queue
- `src/screens/profile/Profile.jsx` — triggers welcome email on user creation; auto-confirm; orphaned-auth cleanup
- `src/screens/messaging/LabMessage.jsx` — searchable recipient dropdown; lab users included for staff/admin

**Related git commit(s):** 1d38e6b..ef1df00

---

### 2026-07-20 — Staff form name fields, password screen icons, notifications SQL

**Tool used:** Claude Code

**What I asked for (summary, not full transcript):**
- Staff add/edit form: split into First Name and Last Name fields
- Role conversion (staff ↔ student) should remap name/email/phone columns correctly
- Replace emoji icons (key, eye, monkey) in password screens with clean line icons
- Fix stale password policy text
- Document the notification and email pipeline architecture

**Resulting changes (files/features affected):**
- `src/screens/profile/Profile.jsx` — First/Last name split in staff form; role conversion column remapping
- Password-related components — line icons replacing emoji

**Related git commit(s):** c426e46..c00e904

---

### 2026-07-18–19 — Data Analysis, Project Workspace restructure, Lab Management sidebar, performance

**Tool used:** Claude Code

**What I asked for (summary, not full transcript):**
- Data Analysis: chart type toggle (Points / Box plot / Control chart / Histogram); PDF export with chart image and stats table; cap chart and results panel width; per-project separation with filter
- Project Workspace: merge Records into Test Results tab; promote Project Members to sidebar; photo upload per project card
- Lab Management: move tabs to sidebar (Lab Users / Lab Managers / Approval Requests)
- Performance: lazy-load all screens so entry bundle drops from ~3 MB to ~520 KB
- Sidebar: hide the Apps section on portal screens so the module list gets full height

**Resulting changes (files/features affected):**
- `src/screens/projects/ProjectDetail.jsx` — chart types, PDF export, data analysis per-project
- `src/screens/projects/ProjectMaterial.jsx` — restructured tabs, photo upload
- `src/screens/labmanagement/LabManagement.jsx` — sidebar-tab layout
- `src/screens/App.jsx` — React.lazy() for every screen
- `src/components/Layout.jsx` — sidebar Apps section hidden on portal screens

**Related git commit(s):** f51f574..2de6330

---

### 2026-07-19 — Team invites, password policy, RLS fixes

**Tool used:** Claude Code

**What I asked for (summary, not full transcript):**
- Fix team invite emails being blocked by RLS
- Surface notification errors on failed invites; allow resending reminder to pending invites
- Shared password policy validation (upper/lower/number/symbol) with live checklist in add-user modals

**Resulting changes (files/features affected):**
- `src/screens/profile/Profile.jsx` — invite flow RLS fix, resend reminder
- Password modals — shared PasswordPolicyChecklist component
- `rls_phase1.sql` — org-read prefs policy

**Related git commit(s):** b584470..be516a5

---

### 2026-06-02 — OTM disclosure snapshot (reference point)

This is the version disclosed to UIUC OTM under Invention Disclosure
Number 2026-137. Anything logged after this date represents development
that occurred following the disclosed version.

<!-- Add new entries above this line, most recent at the top -->
