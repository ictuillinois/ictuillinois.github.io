# LabHive — Claude Code Instructions

This file applies to every session working on the `labhive` project. Read it in full before making any changes.

---

## Project overview

**LabHive** is a React 18 + Vite SPA for lab management — inspections, equipment, training, projects, booking, messaging, and more.

### Tech stack
| Layer | Library / Version |
|-------|-------------------|
| UI | React 18.3, Vite 5.4 |
| State | Zustand 4.5 |
| Backend | Supabase JS v2.45 · custom auth via `users` / `solo_users` (Supabase Auth `signInWithPassword`) · **RLS enforced on all tables** (see `rls_phase1.sql`) |
| Mobile | Capacitor 8.3 (iOS + Android), MLKit barcode scanning, jailbreak detection |
| Data export | ExcelJS 4.4, xlsx-js-style |
| Security | bcryptjs (password hashing), vite-plugin-javascript-obfuscator (prod builds) |

### URLs & deployment
- **Local dev:** `http://localhost:5174/` | Admin: `http://localhost:5174/admin`
- **Production:** `https://labhive.app` | Admin: `https://labhive.app/admin`
- **Git repo:** `https://github.com/mtt999/ilab`
- Vite base: `/` (both web and mobile — custom domain serves from root)
- Build output: `docs/` (web) | `dist/` (mobile)
- CNAME: `labhive.app` (recreated by post-build script on every build)

**Build & deploy (web):**
```bash
npm run build   # builds to docs/, postbuild recreates docs/admin/index.html
git add docs/ && git commit -m "..." && git push
```

**Mobile build:**
```bash
npm run build:mobile   # BUILD_TARGET=mobile → outputs to dist/
npm run sync           # build + cap sync
npm run ios            # build + sync + open iOS simulator
```

### Supabase
- URL: `https://qhsxtpywfczqopcimykk.supabase.co`
- Anon key: in `src/lib/supabase.js`
- **Storage buckets:** `project-files` (module images, SOPs, avatars, floor plans) · `project-records` (material record files) · `item-photos` (supply/inventory photos) · `task-files` (maintenance attachments) · `lab-files` (general lab documents)

### Mobile app config (`capacitor.config.json`)
- App ID: `com.motlagh.ilab` | Name: `LabHive`
- SplashScreen: 1500ms, navy background
- StatusBar: dark style, teal `#1D9E75`
- Deep-link scheme: `ilab://?eq=<uuid>` (QR scan)
- Jailbreak detection blocks app on compromised devices

### All screens & route keys
| Route key | File | Description |
|-----------|------|-------------|
| `dashboard` | `dashboard/Dashboard.jsx` | Main home; all 4 user types; icon grid |
| `profile` | `profile/Profile.jsx` | Profile, avatar, password, dashboard icons panel |
| `home` | `inspection/Home.jsx` | Room/supply inspection start page |
| `inspection` | `inspection/Inspection.jsx` | Active inspection form |
| `results` | `inspection/Results.jsx` | Inspection results viewer |
| `history` | `inspection/History.jsx` | Past inspections + export |
| `projects` | `projects/ProjectMaterial.jsx` | Project & material management (route must go here, NOT Projects.jsx) |
| `project-detail` | `projects/ProjectDetail.jsx` | Single project detail + test results |
| `equipment` | `equipment/EquipmentInventory.jsx` | Equipment inventory tracking |
| `equipmenthub` | `equipment/EquipmentHub.jsx` | Equipment catalog: SOPs, videos, standards, exams |
| `booking` | `equipment/BookingEquipment.jsx` | Equipment booking calendar + approvals |
| `equipmentscan` | `EquipmentScan.jsx` | QR scan landing (SOP · Book · Contact · Calibration) |
| `training` | `training/TrainingRecords.jsx` | Training certs, file uploads, admin approval |
| `pm` | `maintenance/PM.jsx` | Preventive maintenance task tracking |
| `barcode` | `barcode/BarcodeScannerScreen.jsx` | Project material barcode scanner |
| `barcodeqr` | `barcode/BarcodeManager.jsx` | QR label generation + records (studentLocked) |
| `remessages` | `messaging/REMessages.jsx` | Staff ↔ user messaging |
| `orgadmin` | `admin/Admin.jsx` | Admin panel (super admin + org admin) |
| `labmanagement` | `labmanagement/LabManagement.jsx` | Lab users + lab managers management |

### Key components
| File | Purpose |
|------|---------|
| `DashboardIconPicker.jsx` | Full-screen icon picker + `ALL_MODULES_META` (single source of truth for all modules) |
| `Layout.jsx` | App shell, header, mobile bottom nav (<768px), `useIsMobile()` hook |
| `TeammatesPanel.jsx` | Solo workspace sharing — always import, never inline |
| `ForcePasswordChange.jsx` | Blocks app (zIndex 9999) until password changed on first login |
| `FloorPlanEditor.jsx` | Interactive floor plan drawing + photo upload |
| `CustomerServiceModal.jsx` | Support ticket submission |
| `NotificationBell.jsx` | Real-time notification bell in header |
| `StudentIconManager.jsx` | Admin tool to set per-student module visibility |
| `StorageProviderModal.jsx` | Storage provider selection UI + explainer + WebDAV setup |

### Global store fields (`src/store/useAppStore.js`)
| Field | Purpose |
|-------|---------|
| `session` | Current user (role, username, userId, email, adminLevel, photoUrl, avatar, loginMode, organizationId, mustChangePassword) |
| `activeModules` | Array of module keys visible on dashboard (`null` = show all) |
| `loginMode` | `'team'` \| `'solo'` \| `null` |
| `sharedWorkspaces` | Solo workspaces the user is a member of |
| `viewingWorkspaceOwnerId` | `null` = own workspace; uuid = viewing shared workspace |
| `scanEquipmentId` | UUID from `?eq=` QR param — cleared after use |
| `pendingAdminTab` | Tab to switch to when navigating to `orgadmin` |
| `pendingProfileTab` | Tab to switch to when navigating to `profile` |
| `rooms` / `supplies` / `settings` | Org-scoped cache; reload via `refreshCache()` |
| `inspection` / `lastRecord` | Active inspection state |
| `currentProjectId` | Selected project UUID |

### Scripts
| Script | Purpose |
|--------|---------|
| `scripts/post-build.mjs` | Recreates `docs/admin/index.html` after every build (never edit that file manually) |
| `scripts/migrate-supplies.mjs` | One-time: migrated rooms + supplies from pro-ilab → ilab |
| `scripts/migrate-from-pro-ilab.mjs` | One-time: full 46-table migration from old Supabase project |
| `docs/oauth-callback.html` | OAuth bridge page — catches Google/OneDrive redirect, forwards to `ilab://` deep link |

### Required SQL (run once in Supabase SQL Editor if not applied)
```sql
-- Session Sept 2026 — run in BOTH projects, they are separate databases:
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS additional_info TEXT;
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS icons_granted       BOOLEAN DEFAULT TRUE;
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS email_icons_granted BOOLEAN DEFAULT FALSE;
NOTIFY pgrst, 'reload schema';

-- ICT-Lab ONLY — these columns never existed here. Without the role columns,
-- OrgPoolEditor's SELECT fails entirely and every icon pool reads as empty:
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_modules             JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_modules_labusers    JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_modules_labmanagers JSONB;
-- SDS tab: create sds_documents via rls_phase1.sql (it carries the policy too).
NOTIFY pgrst, 'reload schema';

-- Material Reduction (Sept 2026) — without these, saving a fraction fails with
-- PGRST204 "Could not find the 'parent_material_id' column ... in the schema
-- cache". Separate databases: run in BOTH the ICT-Lab and LabHive projects.
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS parent_material_id UUID;
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS reduction_method   TEXT;
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS reduction_value    TEXT;
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS reduction_date     DATE;
-- FK is ON DELETE SET NULL (see rls_phase1.sql) — never CASCADE.
NOTIFY pgrst, 'reload schema';

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_modules JSONB DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS module_images  JSONB DEFAULT NULL;
ALTER TABLE users      ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'supabase';
ALTER TABLE solo_users ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'supabase';

-- Terms of Service acceptance tracking (required — without these columns the
-- acceptance modal re-appears on every login because the DB update silently fails)
ALTER TABLE users      ADD COLUMN IF NOT EXISTS terms_accepted_version INTEGER DEFAULT NULL;
ALTER TABLE solo_users ADD COLUMN IF NOT EXISTS terms_accepted_version INTEGER DEFAULT NULL;

-- Solo workspace sharing:
-- Run supabase_solo_workspace.sql in Supabase SQL Editor

-- Super admin notifications:
CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'app_error',
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE admin_notifications DISABLE ROW LEVEL SECURITY;

-- Out of lab days (Task Board → My Tasks sidebar):
CREATE TABLE IF NOT EXISTS user_out_of_lab (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  date DATE NOT NULL,
  note TEXT,
  organization_id UUID,
  login_mode TEXT DEFAULT 'team',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_out_of_lab ENABLE ROW LEVEL SECURITY;
-- Real RLS policy applied by rls_phase1.sql (org/owner scoped) — NOT allow_all.
```

### Row Level Security (RLS) — July 2026

All ~60 tables enforce real org/owner isolation. The full policy set lives in
**`rls_phase1.sql`** (repo root) — idempotent, safe to re-run.

- Auth: every query runs as role `authenticated` with `auth.uid()` (app uses `sb.auth.signInWithPassword()`). `users.auth_id` / `solo_users.auth_id` link to Supabase auth.
- Helper functions (SECURITY DEFINER, permanent — do NOT drop): `is_super_admin()`, `my_user_id()`, `my_org_id()`, `my_solo_id()`, `my_solo_email()`.
- Super admin = `settings.super_admin_auth_id = auth.uid()::text`.
- Scoping: team tables by `organization_id = my_org_id()`; solo by `solo_owner_id = my_solo_id()`; child tables via parent FK subquery.
- Identity columns (`user_id`, `created_by`, `sender_id`, …) are `text` in some tables and `uuid` in others → policies cast BOTH sides `::text`.
- **To secure a NEW table:** add a `SELECT _apply_rls(...)` call in `rls_phase1.sql` AND add its policy name to the `keep` array in STEP 22 (the legacy-policy pruner), then re-run.
- `_apply_rls` skips missing tables and, on any error, DISABLES RLS (leaves the table open, never locked) + emits a NOTICE.

### Key components added (June 2026)
| File | Purpose |
|------|---------|
| `SuperAdminBell.jsx` | Super admin notification bell — new solo users, support requests, system errors |
| `logAdminError.js` | Helper to log JS errors to `admin_notifications` table |
| `favicon.svg` | Square-cropped hexagon icon for browser tab (viewBox cropped from labhive_logo.svg) |

### Out of Lab feature (PM.jsx — Task Board)
Users can mark days they will be out of the lab from the **My Tasks** sidebar. These days appear as red ✕ markers on the deadline mini-calendar.

- **`OutOfLabPanel`** — component rendered in the My Tasks right sidebar (below deadline calendar); lets the current user add a date + optional reason and delete existing entries; calls `onChanged` to refresh the parent calendar immediately
- **`MiniCalendar`** now accepts `outOfLabDays` prop (array of `{ date: 'YYYY-MM-DD', ... }` or plain date strings); out-of-lab days get a light red background and a red `✕` indicator; legend text updates to explain both markers
- **`CalendarView`** fetches `user_out_of_lab` in parallel with tasks; visibility rule: admins/owners see the whole org, regular users see only their own; day popup shows a red out-of-lab banner above the task list when both exist on the same day
- **`MyTasks`** loads the current user's upcoming out-of-lab days on mount via `loadOutOfLab()` and passes them to the sidebar `MiniCalendar`

**Do not** query `user_out_of_lab` without an `organization_id` filter for team users — it would leak cross-org data.

### Cross-browser layout fixes (June 2026)
- **Windows scrollbar**: `src/index.css` sets a global 6px thin scrollbar (`::-webkit-scrollbar` + Firefox `scrollbar-width: thin`) so Chrome on Windows doesn't use a 17px gutter that collapses the 4-column icon grid. `<main>` in `Layout.jsx` has `scrollbar-gutter: stable` to reserve constant gutter width.
- **Dashboard fill-viewport**: On desktop (≥769px) the `.module-icon-grid` uses `align-content: stretch` so icon rows fill the available viewport height without scrolling. Each card has `min-height: 100px` and the grid has a `maxHeight` cap so single-row users don't see absurdly tall cards. Footer link is hidden on the dashboard screen to avoid adding extra scroll height.

### Google Analytics
- **Measurement ID:** `G-62P1FB2VDT`
- Added to `index.html` as official gtag.js snippet
- Screen changes tracked as `page_view` events in `App.jsx`
- Super admin panel has **📊 View Analytics** button linking to GA4 dashboard

### ICT/MPF floor maps — ICT org only
- `FloorPlanPicker.jsx` shows ICT Building + MPF tabs ONLY for org ID `5bab5b33-fff9-4a4a-b617-3dac179f9678`
- Non-ICT orgs see only their custom floor plans (or an empty state)
- `isSolo` must be defined at component level (not inside `loadAll()`)

### Login page layout — LOCKED, do not change without explicit user permission
- Logo size: `200px`, `marginBottom: -40px` (compensates SVG bottom whitespace — the hexagon artwork sits within a larger transparent viewBox; do NOT add negative marginTop, it clips against container overflow:auto)
- Container: `height: 100%`, `overflowY: auto`, `justifyContent: flex-start`, `padding: 8px 20px 8px`

### Customer Service modal — `?support=1` URL param
- Visiting `https://labhive.app/?support=1` auto-opens `CustomerServiceModal`
- Works on both login page and when logged in
- Logged-in users see their email displayed (read-only); guests get an email input field
- Privacy policy and Terms of Service contact sections link to `/?support=1`

---

## Critical rules — do NOT break these

### 1. activeModules lives in the Zustand store — never move it back to local state

`activeModules` (which icons show on the dashboard) is stored in `useAppStore` (`src/store/useAppStore.js`).

**Why:** It used to be local state in Dashboard.jsx. Changes made from Profile (solo users) were never reflected until a page reload. The fix moved it to the global store so the icon picker can update it from any screen instantly.

**Rules:**
- `Dashboard.jsx` must read `activeModules` from `useAppStore()` — never `useState(null)`
- `DashboardIconPicker.jsx` must call `setActiveModules(modules)` from `useAppStore()` inside its `save()` function, after every save
- `clearSession` in the store must reset `activeModules: null`
- Do NOT add a separate `activeModules` state to any screen or component

**`loadDashboardPrefs()` early-return rule:** The function in `Dashboard.jsx` must return immediately if `activeModules !== null` (after the `!session?.loginMode` guard). This prevents a DB re-fetch from overwriting the store value that Profile's icon save just set when the user navigates back to Dashboard.

```js
async function loadDashboardPrefs() {
  try {
    if (!session?.loginMode) return
    if (activeModules !== null) return  // store already set — don't overwrite with stale DB fetch
    // ... rest of function
  }
}
```

Only fetch from DB when `activeModules === null` (initial load after login, page reload, or after `clearSession`).

### 2. Mileage (and labsafety) icons must respect activeModules — never hardcode them

- Any module list rendered in Dashboard must be filtered by `activeModules` if it is set
- `StudentDashboardView` receives `activeModules` as a prop and filters `allQuickLinks` with it
- `CardGridView` for students uses `activeModules` to filter `getAllModulesForStudent()`
- Never add a hardcoded list of modules that bypasses `activeModules`

### 3. External link icons (mileage, labsafety) use the ExternalLinkModal — never open URLs directly

Clicking an external module card must go through `setConfirmExternal({ url })` → `ExternalLinkModal`. Do not call `window.open()` directly. `ExternalLinkModal` handles empty/invalid URLs gracefully.

### 4. Lab managers cannot edit, deactivate, or delete org admin accounts

In `StaffListPanel` (`src/screens/profile/Profile.jsx`), the Edit / Deactivate / Delete buttons for a staff row are conditionally hidden when the viewer is a lab manager (`session.role === 'user'`) and the row belongs to an org admin (`s.role === 'admin'`):

```jsx
{!(session?.role === 'user' && s.role === 'admin') && (
  <div ...>
    <button>Edit</button>
    <button>Deactivate / Activate</button>
    <button>Delete</button>
  </div>
)}
```

Org admin rows are visible to lab managers (read-only) but not actionable. Only org admins and super admin may modify org admin accounts.

### 5. Module icon grid uses `.module-icon-grid` CSS class — do NOT use inline grid styles

The dashboard icon grid for team and solo users uses the `.module-icon-grid` flexbox class defined in `src/index.css`. This is the only correct way to lay out module cards so the last row is centered.

- Desktop (≥769px): cards are `220px` wide, 4 per row; `align-content: stretch` distributes available viewport height across rows; cards have `height: auto; min-height: 100px` so they fill the row height
- Mobile (≤768px): cards are `calc(50% - 7px)`, 2 per row, fixed `height: 160px`

**Viewport-filling layout (desktop):** `Dashboard.jsx` makes its outer div `height: 100%; display: flex; flex-direction: column`. The header/admin-card sections are `flexShrink: 0`. The views section is `flex: 1; minHeight: 0`. `CardGridView` sets `height: 100%` on the `.module-icon-grid` div plus a `maxHeight` cap of `rows × 190px + gaps` (computed from `gridMaxHeight(count)`) to prevent single-row cards from becoming absurdly tall. Cards themselves have no inline `height` — the CSS controls it via media query.

**Do not:**
- Replace this class with `display: grid` + `gridTemplateColumns: repeat(auto-fill, ...)` — CSS Grid cannot center a lone last-row item. Flexbox with `justify-content: center` is required.
- Add back a fixed `height: 160` inline style to `ModuleCard` or `LockedCard` on desktop — it prevents the flex-stretch height from working.
- Remove `scrollbar-gutter: stable` from `<main>` in Layout.jsx — it prevents Windows Chrome's 17px scrollbar from stealing content width and collapsing the grid to 3 columns.

### 6. Storage system — Mode B hybrid, never bypass StorageService for personal uploads

Personal file uploads (training certificates, project records) must go through `StorageService.upload(bucket, path, file, { personal: true })` — never call `sb.storage.from(...).upload()` directly for these.

**Architecture:** `src/lib/storage/`
| File | Purpose |
|------|---------|
| `StorageService.js` | Singleton router + `useStorageUrl(stored)` hook |
| `config.js` | Google + Azure OAuth client IDs |
| `SupabaseProvider.js` | Default — wraps existing sb.storage calls |
| `FilesystemProvider.js` | iCloud (iOS) / local Documents (Android) |
| `GoogleDriveProvider.js` | Google Drive PKCE OAuth — stores in "LabHive Files" folder |
| `OneDriveProvider.js` | OneDrive PKCE OAuth — stores in app AppFolder |
| `WebDAVProvider.js` | Personal computer / NAS via WebDAV |

**Mode B rule:** `personal: false` → always Supabase (SOPs, equipment photos, module images, org content). `personal: true` → user's chosen provider.

**OAuth redirect:** Uses `https://labhive.app/oauth-callback` (bridge page at `docs/oauth-callback.html`) → redirects to `ilab://oauth-callback` deep link → App.jsx handles token exchange.

**Storage tab:** Available in Profile for ALL user types — solo, lab user (student), staff (lab manager), and org admin. Implemented as `<StorageTab toast={toast} />` in each profile variant.

**localStorage keys used by storage system:**
- `ilab_storage_provider` — active provider key (`supabase`, `filesystem`, `gdrive`, `onedrive`, `webdav`)
- `ilab_gdrive_token` — Google Drive OAuth token (JSON)
- `ilab_gdrive_folder_id` — cached "iLab Files" folder ID
- `ilab_onedrive_token` — OneDrive OAuth token (JSON)
- `ilab_webdav_config` — WebDAV server URL + credentials (JSON)

**External file refs** are stored in the DB as `ext:provider:id` strings (e.g. `ext:gdrive:FILE_ID`). Use `StorageService.resolveUrl(stored)` or the `useStorageUrl(stored)` hook to get a displayable URL.

**Do not** call `sb.storage.from(...).upload()` directly for training certificates or project record files — always use `StorageService.upload(..., { personal: true })`.

**Required SQL (run once):**
```sql
ALTER TABLE users      ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'supabase';
ALTER TABLE solo_users ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'supabase';
```

### 7. New screens must be added to BOTH UNMANAGED_SCREENS and INTERNAL

- **`UNMANAGED_SCREENS`** in `Dashboard.jsx` — controls whether the icon *shows* on the dashboard for team users
- **`INTERNAL`** in `App.jsx` — controls whether navigating to the screen is *allowed* without a `user_screen_access` entry

**Current values (must match):**
- `UNMANAGED_SCREENS` (Dashboard.jsx): `profile`, `dashboard`, `pm`, `barcode`, `barcodeqr`, `orgadmin`, `home`, `equipment`, `labmanagement`
- `INTERNAL` (App.jsx): `dashboard`, `profile`, `inspection`, `results`, `project-detail`, `pm`, `barcode`, `equipmentscan`, `barcodeqr`, `orgadmin`, `home`, `equipment`, `projects`, `training`, `history`, `equipmenthub`, `booking`, `remessages`, `labmanagement`

### 7. clearSession must always remove the login-mode localStorage key

`clearSession()` in `useAppStore.js` must call:
```js
localStorage.removeItem('ilab_login_mode')
```
before calling `set(...)`. Never remove this line. (`ilab_login_mode` controls whether the cache refresh runs on startup; removing it on logout ensures the next login starts clean.)

### 9. Icon pool: org pool OVERRIDES global pool — never intersect them

The effective module pool for a team user is computed as:
```js
const effectivePool = orgPool ?? appPool
```
**Not** `orgPool.filter(k => appPool.includes(k))`. If an org has its own pool set by super admin, that pool is authoritative for that org, regardless of the global app pool.

This rule applies in three places (all must be consistent):
- `Dashboard.jsx` `loadDashboardPrefs()`
- `DashboardIconPicker.jsx` `loadSaved()`
- `Profile.jsx` `DashboardIconsPanel.load()`

### 10. Pool filtering must append newly-enabled modules — not silently drop them

When applying an effective pool to a user's saved `active_modules`:
```js
if (effectivePool !== null) {
  if (mods?.length) {
    const filtered = mods.filter(k => effectivePool.includes(k) || k === 'profile')
    const missing = effectivePool.filter(k => !filtered.includes(k) && k !== 'profile')
    mods = [...filtered, ...missing]  // preserve order + add newly-allowed
  } else {
    mods = effectivePool  // no saved prefs → use pool as initial list
  }
}
```
Never do `mods = mods.filter(...)` alone — that drops newly-enabled modules for users who saved before the module was added.

---

## Architecture overview

### Login modes
| Mode | Table | Accent color | Notes |
|------|-------|--------------|-------|
| `solo` | `solo_users` | `#534AB7` purple | Personal lab workspace |
| `team` | `users` | `#1D9E75` green | Org-based team account |
| `admin` (team) | `users` | `#1D9E75` green | `role = 'admin'`; org admin or super admin |

### Role hierarchy
| Role | `userId` | Access |
|------|----------|--------|
| Super admin | `null` | All orgs, all data. Logs in at `/ilab/admin` via `settings.admin_email` + `settings.admin_password` |
| Org admin | non-null UUID | Their own `organizationId` only. Entry via Admin Panel card on dashboard |
| Lab manager | non-null UUID | `role = 'user'`. Access controlled by `user_screen_access` table |
| Lab user | non-null UUID | `role = 'lab_user'`. Restricted module set |

`Admin.jsx` (`src/screens/admin/Admin.jsx`) detects super admin via `session.userId === null`.

### Multi-tenancy
- `organizations` table: `id` (UUID), `name`, `slug`, `created_at`, `allowed_modules` (JSONB), `module_images` (JSONB)
- **ICT org UUID**: `5bab5b33-fff9-4a4a-b617-3dac179f9678`
- All team data tables have `organization_id` UUID FK

**Required SQL migrations (run in Supabase SQL Editor if not done):**
```sql
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_modules JSONB DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS module_images JSONB DEFAULT NULL;
```

### Global store (`src/store/useAppStore.js`)
| Field | Purpose |
|-------|---------|
| `session` | Current user session |
| `activeModules` | Array of module keys visible on dashboard (`null` = show all) |
| `sharedWorkspaces` | Solo workspaces the user is a member of |
| `viewingWorkspaceOwnerId` | `null` = own workspace; uuid = shared workspace |
| `scanEquipmentId` | UUID from `?eq=` URL param — set on QR scan, cleared after use |
| `pendingAdminTab` | Tab key to switch to when navigating to `orgadmin` screen |

---

## Module icon pool system

### Three-layer hierarchy
```
Super admin → Global app pool (settings.app_allowed_modules)
           OR per-org pool (organizations.allowed_modules)
                    ↓
          Org admin → User's saved selection (user_dashboard_prefs.active_modules)
```

Solo users have a separate pool: `settings.solo_allowed_modules`.

### How the pool is resolved (team users)
1. Fetch `organizations.allowed_modules` for the user's org (`orgPool`)
2. Fetch `settings.app_allowed_modules` (`appPool`)
3. `effectivePool = orgPool ?? appPool` — org pool wins if set; global is fallback
4. If `effectivePool !== null`: filter user's saved modules, append any newly-enabled ones
5. If no saved prefs: `activeModules = effectivePool`

### Settings table keys
| Key | Meaning |
|-----|---------|
| `app_allowed_modules` | JSON array of module keys allowed globally for all team orgs (fallback) |
| `solo_allowed_modules` | JSON array of module keys allowed globally for solo users |
| `img_{key}` | Global background image URL for team module card (e.g. `img_supply`) |
| `solo_img_{key}` | Global background image URL for solo module card |
| `mileage_url` | External URL for the mileage form |
| `labsafety_url` | External URL for the lab safety portal |
| `admin_email` | Super admin login email |
| `admin_password` | Super admin login password (bcrypt hashed) |

### Module image priority (Dashboard.jsx `loadSettings`)
1. Default SVG (`/ilab/icon-pm.svg`, etc.) for pm, barcode, barcodeqr, profile
2. Global images from `settings` (`img_*` for team, `solo_img_*` for solo) override defaults
3. Per-org images from `organizations.module_images` override global images for team users

### ALL_MODULES_META — single source of truth
Defined and exported from `src/components/DashboardIconPicker.jsx`. Every module definition lives here. Fields: `key`, `screen`, `label`, `sub`, `icon`, `bg`, `color`, `roles`, `external?`, `adminOnly?`, `studentLocked?`, `soloLocked?`, `hideForStaff?`

---

## Admin panel structure

### Super admin view (`session.userId === null`)
- No tab bar — all content renders directly
- Shows greeting + **Admin Panel** button + **Profile** button on home page (no icon grid)
- `Admin.jsx` shows:
  - "🌐 Main App (Global)" card → `AppModulesModal` (tabbed: Icon Access / Icon Images)
  - "👤 Solo Users (Global)" card → `SoloModulesModal` (tabbed: Icon Access / Icon Images)
  - Organization list — each org row shows inline org admin card(s) + Icons / Edit / Delete buttons
- Org admin is shown inline in the org row as a clickable card (name + email); clicking opens `UserModal` for editing

### Org admin view (`session.userId !== null`, `session.role === 'admin'`)
- Tabs: Users | Lab Users | Module Images | Org Settings
- Module Images tab uses `ModuleImagesPanel` which reads/writes `organizations.module_images` (JSONB) for their own org

### Key modal components in Admin.jsx
| Component | Purpose | Close button |
|-----------|---------|--------------|
| `AppModulesModal` | Super admin sets global team icon pool + uploads global images | × button in header |
| `SoloModulesModal` | Super admin sets global solo icon pool + uploads solo images | × button in header |
| `OrgModulesModal` | Super admin sets icon pool for a specific org | × button in header |
| `UserModal` | Add/edit user account | standard |
| `OrgModal` | Add/edit organization | standard |
| `AccessModal` | Set per-user screen access | standard |

### GlobalImageGrid component (inside Admin.jsx)
- Uploads to Supabase storage path: `module-images/global/${imagePrefix}${moduleKey}-${Date.now()}.${ext}`
- Saves URL to `settings` table as `${imagePrefix}${moduleKey}` via upsert
- `imagePrefix` is `img_` for app global, `solo_img_` for solo global

---

## Session & navigation flows

### Session persistence
1. Login → `Login.jsx` calls `setSession(obj)`. Session lives only in the Zustand store.
2. App reopened → `App.jsx` `init()` calls `sb.auth.getSession()`. If a Supabase auth session exists, `restoreSessionFromAuth(authUser)` reads fresh user data from DB and calls `setSession(...)`.
3. Solo users: workspace memberships re-fetched from Supabase after restore.
4. Sign out → `clearSession()` calls `sb.auth.signOut()` + removes `ilab_login_mode` from localStorage → login page.

Note: `ilab_session` is written by `TermsAcceptance.jsx` and `ForcePasswordChange.jsx` (to update the stored session after those actions), but is **never read back** — session restoration is entirely through the Supabase auth session. The `localStorage.setItem('ilab_session', ...)` calls are kept for consistency but are not load-bearing.

### Terms of Service versioning
- `CURRENT_TERMS_VERSION` is defined in `src/lib/termsVersion.js` (currently `2`)
- Bump this integer whenever terms are updated — all users will be re-prompted on next login
- `TermsAcceptance.jsx` writes the accepted version to `users.terms_accepted_version` (or `solo_users.terms_accepted_version`) via Supabase update, then updates the session in-memory
- **If the `terms_accepted_version` column is missing** from the DB, the update fails silently and users see the modal on every login. Run the required SQL migration to fix.
- `TermsAcceptance` now checks the Supabase error and shows a toast if the DB update fails

### Super admin session object
```js
{ role: 'admin', username: 'Admin', userId: null, adminLevel: 3, loginMode: 'team' }
```

### First-login forced password change
- `users.must_change_password` boolean — set `true` when admin creates a new user
- `ForcePasswordChange.jsx` (full-screen, `zIndex: 9999`) renders in `App.jsx` when `session?.mustChangePassword === true`
- Blocks entire app until user sets a new password (≥ 6 chars, different from current)
- Team users cannot change their email — email field is `readOnly` in Profile/UserModal

### QR scan flow
1. User scans QR code → URL `?eq=<uuid>`
2. `App.jsx` stores UUID in `scanEquipmentId`
3. After login → `setScreen('equipmentscan')` automatically
4. `EquipmentScan.jsx` loads equipment; user sees: SOP | Book | Contact | Calibration
5. `book` → `BookingEquipment` with equipment pre-selected
6. `sop`, `contact`, `calibration` → expand inline as `SectionCard` (back button at **bottom**)
7. Contact → "Open Messages →" sets `sessionStorage.ilab_return_scan = '1'` before navigating to `remessages`

### BookingEquipment QR back button
- `fromQRScan = useState(() => !!scanEquipmentId)` — captured at mount
- Shows "← Back to options" button (do NOT rename) → `setScreen('equipmentscan')`

### BookingEquipment drag-to-reschedule
- Existing confirmed bookings can be dragged to a new time or day by the booking owner (or any admin)
- Three drag handles per booking block: top 8px = `resize-start` (n-resize cursor), bottom 8px = `resize-end` (s-resize cursor), body = `move` (grab cursor)
- `canRescheduleBooking(booking)`: admins can reschedule any non-cancelled/denied booking; regular users only their own
- `bookingDragRef` (ref) mirrors `bookingDrag` state to avoid stale closures in window mousemove/mouseup listeners
- Click vs drag: `hasMoved` flag set when pointer moves > 4px from start; mouseup with no movement → `onBookingClick` (view modal); with movement → reschedule via Supabase update
- Preview block: dashed teal overlay rendered at new position while dragging; original block shown at 35% opacity
- **Select All** checkbox: selects all equipment at once so users can view all their bookings across all equipment on one calendar; uses indeterminate state when partial selection

### LabHive branding assets
- **Final logo:** `public/labhive_logo.svg` — navy outer hexagon (#0C1140, orange border #FF6B1A), three specialty hexes (purple atom left, lime green flask+DNA right, coral gears top), white PCB chip center hex, "LabHive" wordmark in Georgia serif at bottom
- viewBox `0 0 680 860`, main group `translate(340,310)`
- Do NOT add `&` unescaped in SVG `<style>` or `<desc>` — use `&amp;`

---

## Key screens & components

| Screen/File | Route key | Notes |
|-------------|-----------|-------|
| `src/screens/dashboard/Dashboard.jsx` | `dashboard` | Main home; handles all 4 user types |
| `src/screens/auth/Login.jsx` | — | 3 login paths: super admin, team, solo |
| `src/screens/admin/Admin.jsx` | `orgadmin` | Admin panel for super admin and org admin |
| `src/screens/profile/Profile.jsx` | `profile` | Profile + DashboardIconsPanel (inline icon picker) |
| `src/screens/equipment/EquipmentInventory.jsx` | `equipment` | — |
| `src/screens/equipment/EquipmentHub.jsx` | `equipmenthub` | Student equipment browser |
| `src/screens/training/TrainingRecords.jsx` | `training` | — |
| `src/screens/projects/ProjectMaterial.jsx` | `projects` | Route MUST go here, not Projects.jsx |
| `src/screens/barcode/BarcodeManager.jsx` | `barcodeqr` | 3 tabs: Equipment Barcode, Records, Project Materials |
| `src/screens/EquipmentScan.jsx` | `equipmentscan` | QR scan landing page |
| `src/components/DashboardIconPicker.jsx` | — | Full-screen icon picker modal + ALL_MODULES_META |
| `src/components/Layout.jsx` | — | App shell; mobile bottom nav (< 768px) |
| `src/components/TeammatesPanel.jsx` | — | Solo workspace sharing; imported, never inline |
| `src/store/useAppStore.js` | — | Zustand global store |

### Mobile bottom navigation (Layout.jsx)
- Shown on screens < 768px wide only
- 5 tabs: Home | Booking | Messages | Projects | Profile
- `useIsMobile()` hook defined in Layout.jsx — do NOT duplicate it elsewhere
- Main content gets `paddingBottom: calc(72px + Xpx)` to avoid hiding behind nav

### BarcodeManager
- 3 tabs: Equipment Barcode | Records | Project Materials
- No Settings tab — access control is in Profile → Dashboard Icons
- `barcodeqr` is `studentLocked: true` — lab users see it locked, lab managers use freely
- Print logo is pure B&W SVG (no gray — invisible on monochrome printers)

### Solo workspace sharing
- `solo_workspace_invites` — pending/accepted/declined invites
- `solo_workspace_members` — accepted memberships
- `TeammatesPanel` component shared between Profile and ProjectMaterial

### Post-build script
`scripts/post-build.mjs` runs after `npm run build`. Copies `docs/index.html` → `docs/admin/index.html` with title "iLab — Admin". **Never manually edit `docs/admin/index.html`.**

---

## SQL — all tables & key columns

### Core tables (team)
- `users`: `id`, `name`, `email`, `password_hash`, `role` (admin/user/lab_user), `organization_id`, `is_active`, `must_change_password`, `photo_url`, `avatar`, `terms_accepted_version` (INTEGER)
- `organizations`: `id`, `name`, `slug`, `created_at`, `allowed_modules` (JSONB), `module_images` (JSONB)
- `user_screen_access`: `user_id`, `screen_key` — per-user screen grants
- `user_dashboard_prefs`: `user_id`, `active_modules` (array), `allowed_modules` (array), `has_set_dashboard`

### Core tables (solo)
- `solo_users`: `id`, `name`, `email`, `password_hash`, `active_modules` (array), `has_set_dashboard`, `terms_accepted_version` (INTEGER)
- `solo_workspace_invites`, `solo_workspace_members`
- `projects`: includes `solo_owner_id` column
- `project_results`, `project_links`

### Global settings
- `settings`: `key` (PK), `value` — key/value store for URLs, passwords, module pools, images

### Task Board tables
- `tasks`: `id`, `title`, `status` (todo/in_progress/done), `progress` (0–100), `priority`, `deadline`, `deadline_time`, `start_date`, `start_time`, `notes`, `is_private`, `is_meeting_task`, `assigned_to`, `created_by`, `organization_id`, `login_mode`
- `task_attachments`: `id`, `task_id`, `file_name`, `file_url`, `file_size`, `uploaded_by`, `created_at`
- `user_out_of_lab`: `id`, `user_id`, `date` (DATE), `note`, `organization_id`, `login_mode`, `created_at`

### Required SQL (run once if not applied)
```sql
-- Multi-tenancy org columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_modules JSONB DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS module_images JSONB DEFAULT NULL;

-- Terms of Service acceptance (missing = modal repeats every login)
ALTER TABLE users      ADD COLUMN IF NOT EXISTS terms_accepted_version INTEGER DEFAULT NULL;
ALTER TABLE solo_users ADD COLUMN IF NOT EXISTS terms_accepted_version INTEGER DEFAULT NULL;

-- Solo workspace sharing (from supabase_solo_workspace.sql)
-- Run supabase_solo_workspace.sql in Supabase SQL Editor

-- Out of lab days (Task Board):
CREATE TABLE IF NOT EXISTS user_out_of_lab (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, user_id UUID, date DATE NOT NULL, note TEXT, organization_id UUID, login_mode TEXT DEFAULT 'team', created_at TIMESTAMPTZ DEFAULT NOW());
-- RLS policy applied by rls_phase1.sql (org/owner scoped). Do NOT use allow_all.

-- All tables: run rls_phase1.sql for the full org/owner-scoped RLS policy set.

-- Notifications (applied July 2026 — was broken for a month without these):
-- app inserts title/body but table only had "message"
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body  text;
-- notification_prefs needs one boolean column per event key the Profile →
-- Notifications panel saves ({key} default true, email_{key} default false):
-- booking_confirmed/reminder/cancelled, training_approved/expiring/submitted,
-- task_assigned, task_comment, meeting_added, task_status_changed,
-- deadline_reminder, reminder_daily, reminder_items, team_invite, message_reply
-- (see July 2026 chat or git history for the full ALTER block)
```

### Notifications & email pipeline (July 2026 — WORKING, do not regress)

- **In-app**: insert into `notifications` (`user_id, type, title, body, read`);
  bell (NotificationBell) reads `notifications` + `booking_notifications`, has
  realtime INSERT subscriptions. RLS: INSERT open to authenticated, SELECT own.
- **Email**: opt-in per event. Sender-side code reads the RECIPIENT's
  `notification_prefs` — this requires the `notification_prefs_select_org`
  RLS policy (org-wide SELECT) in rls_phase1.sql, or no email is ever queued.
- **Queue**: rows go to `email_notifications_queue`; a pg_cron job
  (`send-emails-every-minute`) POSTs the **`send-emails`** Edge Function
  (NOT the old `send-email-queue` one) which sends via **Resend** and marks
  `sent/sent_at/attempts/error`. `MAX_ATTEMPTS = 5` — after 5 failures a row
  is abandoned; reset with `UPDATE email_notifications_queue SET attempts=0,
  error=NULL WHERE sent=false` to retry.
- **Resend**: domain `labhive.app` verified (DNS on Cloudflare). Secrets on
  Edge Functions: `RESEND_API_KEY`, `RESEND_FROM` = `LabHive <noreply@labhive.app>`.
- Setup lives in `email_queue_setup.sql` (idempotent; marks stale backlog sent
  before scheduling so users don't get flooded).

---

## Design system standards (July 2026)

### Brand palette — canonical values, use ONLY these
| Role | Hex | Usage |
|------|-----|-------|
| Teal (brand / Team) | `#1D9E75` | `--accent`; buttons, links, focus rings, Team UI |
| Teal light | `#E1F5EE` | `--accent-light`; tinted backgrounds |
| Teal dark (text on light teal) | `#085041` | status text, badges on `#E1F5EE` |
| Teal hover | `#178A66` | `.btn-primary:hover` |
| Purple (Solo) | `#534AB7` | `--accent3`; Solo UI, Sara chat |
| Purple light | `#EEEDFE` | `--accent3-light` |
| Purple hover | `#463D9E` | `.btn-purple:hover` |

Never reintroduce the retired greens/purples: `#2a6049`, `#e8f2ee`, `#1e4d39`, `#0d47a1`, `#7c4dbd`, `#f3eeff`, `#6a3aab`. Semantic colors (role badges `#5B21B6`/`#7e22ce`, status red `#c84b2f`, blue `#0369a1`) are separate and intentional.

### Spacing standard — enforced
Allowed `padding` / `margin` / `gap` values: **even numbers 0–16** (0, 2, 4, 6, 8, 10, 12, 14, 16), then **multiples of 4** (20, 24, 28, 32, 36, 40, 44, 48). No odd values; no 18, 22, 26, 30.

- Audit with `node scripts/normalize-spacing.mjs` (dry run) — must report **0 line changes**; `--write` applies fixes
- Exempt: negative margins (artwork compensation), values coupled to positioned elements, `calc()`, print CSS (`@page`), values > 48 (e.g. the 72px bottom-nav clearance)
- Run the audit after adding any new screen or large UI change

### UI icons — line icons, not emoji
New UI chrome (buttons, banners, toggles) must use the shared line-icon set in `src/components/Icons.jsx` (1.7px stroke, rounded caps, inherits `currentColor`) — not raw emoji, which render inconsistently across platforms. Add new icons to that file in the same style. (Module-card emoji in `ALL_MODULES_META` are content, not chrome — they stay until the app-wide icon rollout.)

### Alternating row colors — standard for every list/table
Tokens in `index.css`: `--row-a` `#f8faff` (even, blue tint) / `--row-b` `#f5f7f2` (odd, green tint); header/emphasis variants `--row-a-strong` `#eef2ff` / `--row-b-strong` `#edf5ea`.

- **JSX card/div row lists:** `background: idx % 2 === 0 ? 'var(--row-a-strong)' : 'var(--row-b-strong)'` — the STRONG variants; the soft `--row-a`/`--row-b` read as white on standalone cards and are only for large expanded content areas (e.g. Training row bodies) and table zebra
- **`<table>` screens:** zebra applied globally by CSS (`tbody tr:nth-child` rules in index.css) — do not add per-table backgrounds
- **Semantic states override the stripe:** flagged yellow (`#fefce8` + orange border), selected (`--accent-light`), unread tint, `.flag-red`
- Never hardcode the old hexes — always the `--row-*` tokens

### Typography scale
26px page greeting / 24px `.section-title` screen headings / 15px body / 13px labels-captions. DM Sans is loaded in weights 300–700 (700 was added July 2026 — do not remove it; `fontWeight: 700` is used app-wide).

---

## Feature updates — July 2026 session (do not regress)

### Login
- **"Keep me signed in on this device" checkbox** (default checked). Custom auth
  storage adapter in `src/lib/supabase.js` routes Supabase tokens to
  localStorage (checked) or sessionStorage (unchecked) via the
  `ilab_keep_signed_in` flag, which Login sets BEFORE `signInWithPassword`.
  Each write clears the other store. Checked also stores
  `ilab_remembered_email` (prefilled next visit). **Never store passwords** —
  browser password managers handle that via the existing autocomplete attrs.
- **LoginBackground.jsx** — animated canvas scene (benzene rings + the four
  logo hexes: atom/flask/gears/chip + DNA ribbons + sparkles). Retina-scaled
  (DPR-capped 2), pauses on visibilitychange, static frame under
  prefers-reduced-motion, reduced density on mobile. Floating items **bounce
  off the login card** (`.card` rect re-measured every 15 frames). Login only —
  never mount behind data screens.

### Booking / calendar (Phase 1 shipped)
- `src/lib/calendarLinks.js` — Google/Outlook template URLs + .ics download.
  Title `{Org} - Lab booking: {Equipment}`; location `{Org} - {eq.location}`;
  narrative description with times in generator's local zone (event times UTC);
  booking-page deep link `https://labhive.app/?screen=booking` — clickable via
  HTML details (Google), X-ALT-DESC (ics), bare-URL-on-own-line (Outlook).
- **CalendarPromptModal** pops after every NEW booking (both BookingModal
  instances via `onBooked`) — this is how users discover the feature; edits
  don't re-prompt. Buttons also remain in BookingDetail.
- **Cancelling/denying a booking retires its photo reminders** (all three
  types marked read) and `loadNotifications` sweeps reminders whose booking is
  cancelled/denied (hides + marks read). Past-booking reminders keep the
  bell-only behavior.
- Phase 2 (not built yet): Google Calendar busy-overlay in the booking grid —
  requires Calendar API enabled in the same Google Cloud project as Drive.

### Supply Inventory (inspection flow)
- **Results screen buttons:** "Save" (was "Done") + primary
  "Save & next room: {name} →" that starts inspecting the next room in rooms
  order that has supplies (hidden when none remain). Record is already saved
  before this screen — buttons are navigation.
- **Export Data tab: Edit button per record** → `EditRecordModal` (Home.jsx):
  edit count + needed per item after the fact; low flags and `flag_count`
  recomputed on save. Available to all users (delete stays manager/admin).
- **Count box template:** last inspection's qty per supply id shown as gray
  placeholder + "Last inspected: N unit" caption. **Untouched box saves the
  template value, not 0** (deliberate — placeholder must never lie); +/-
  steppers start from the template; clearing the box restores it.
- **Low-item popup:** Next/Finish with count < min and empty "needs to be
  ordered" shows a reminder — "Enter amount" (focuses the needs input) or
  "Next item anyway →". Empty string triggers it; explicit 0 does not.
- **Rooms + Supplies tabs are card grids** (176px `.manage-card` cards, photo
  strip on top, Photo/Edit/Delete buttons under each). `.manage-card` has the
  same hover lift/teal as `.room-card` but no pointer cursor. Supplies groups
  by room under **light-teal divider bars** (accent-light bg, #9FE1CB border,
  #085041 name, room photo thumb, teal mono item count) — do NOT revert to
  small mono labels or heavy navy bars.

### Reports (PDF + Excel)
- **Clickable purchase-link column** in all three builders: PDF (autotable
  "Link" col + `doc.link` annotation via didDrawCell), Excel report (8-column
  layout, `{ text, hyperlink }` cells, blue underlined), Results-screen xlsx
  (`cell.l = { Target }`). One hyperlink per cell = first link; text shows
  "+N more".
- **Alignment standard:** Item Name and Notes columns left+middle; every other
  column center+middle — in PDF, ExcelJS report, and xlsx-js-style exports.

### Training Records — user-centric hub (do not revert to per-tab lists)
- **`UserTrainingHub`** (TrainingRecords.jsx) is the main view for all
  training sub-tabs except `requests`: one avatar card grid of lab users
  (photo or gender scientist-emoji fallback via `UserAvatar`; gender from
  `users.gender`, self-selected in Profile → My Info); clicking a card opens a
  detail panel below with **inner tabs** Documents / Vehicle / Equipment /
  Alarm / Exam / Locker. Inner tabs = sidebar sub-tab keys
  (fresh/golf/equipment/alarm/exam/locker) driven by `setSidebarSubTab`, so
  sidebar and panel tabs are the same state.
- **Status dots** on each inner tab (✓ complete / ⏳ pending / — none) from
  hub-level queries on training_fresh, training_golf_car, training_equipment
  (passed_exam), training_building_alarm, student_lockers.
- **"This user / All users" toggle** (managers only): 'all' renders the
  original full-list tab component — that IS the audit view; do not delete
  the old list rendering from the tab components.
- Tab components accept **`hideChrome`** prop: skips their SectionHeader/
  search/pills (+ FreshTraining's own grid) and renders records for the single
  student passed. `selectedArr` is memoized by user id — do NOT pass a fresh
  `[user]` array inline or child `useEffect([students])` re-fires each render.
- Lab users (non-editable) auto-select themselves; managers get a hint until
  they pick a card. Panel tables use the global zebra stripes (cert rows must
  NOT set inline row backgrounds — approval state lives in the chips).
- **Required SQL (run once):**
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT NULL;`
  `ALTER TABLE solo_users ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT NULL;`
  Without the column, saving My Info fails (payload includes gender).

### Mobile
- **Sidebar drawer:** hamburger in header (mobile only) slides the full
  sidebar in as a left drawer (`.mobile-drawer`, 220ms, backdrop). Closes on
  backdrop tap or any screen/sub-tab change. Sidebar's `forceExpanded` prop
  keeps it out of icon-only mode and no-ops the collapse toggle. Bottom nav
  unchanged.

### Dashboard
- **Module image cache:** `moduleImages` initializes synchronously from
  localStorage (`ilab_module_imgs_{mode}_{org}`), refreshed in background by
  `loadSettings()` (stale-while-revalidate) — kills the ~1s emoji flash.
  Local default SVGs seed the initializer. Do not revert to `useState({})`.

---

## Build — obfuscator vs dynamic imports (July 2026)

**Route-level code splitting:** every screen in `App.jsx` is `React.lazy`-loaded
(one `<Suspense>` wrapper inside `<Layout>`). This cut the entry bundle from
~3 MB to ~520 KB (146 KB gzip). Do NOT convert screens back to static imports —
it re-merges everything into one chunk. New screens must follow the same
`const X = lazy(() => import('./screens/...'))` pattern in App.jsx.

**Obfuscator `stringArray` is OFF** (base64-encoding every string doubled the
bundle and added per-call decode overhead; compact + identifier mangling stay).
If it is ever re-enabled, the rule below is what keeps code splitting alive:

The prod obfuscator (`vite.config.js`) MUST keep `reservedStrings` covering every
dynamically-imported package (`jspdf`, `jspdf-autotable`, `exceljs`, `xlsx`,
`@capacitor/*`, …) plus relative paths (`^\./`, `^\.\./`). Without it, string
encoding hides import specifiers from Rollup → NO lazy chunks are emitted →
browsers throw `failed to resolve module specifier "jspdf"` in production.
**When adding a new `import('some-pkg')` anywhere, add `'^some-pkg$'` to
`reservedStrings`.** Sanity check after build: `ls docs/assets` must show
multiple chunks (jspdf/exceljs/web-*), and
`grep -oE 'import\([a-zA-Z_$]+\(' docs/assets/*.js` must return nothing.
`main.jsx` also has a `vite:preloadError` one-shot reload that heals stale-cache
chunk 404s after deploys — do not remove it.

---

## Common mistakes to avoid

- **Do not** re-introduce `const [activeModules, setActiveModules] = useState(null)` in Dashboard.jsx
- **Do not** use `orgPool.filter(k => appPool.includes(k))` — use `orgPool ?? appPool`
- **Do not** filter saved modules by pool without also appending newly-enabled modules
- **Do not** add mileage or labsafety to any hardcoded module list that bypasses `activeModules`
- **Do not** route `projects` to `<Projects />` — it must go to `<ProjectMaterial />`
- **Do not** define `TeammatesPanel` inline in Profile.jsx — import from `src/components/TeammatesPanel.jsx`
- **Do not** remove `setActiveModules(modules)` from `DashboardIconPicker.save()`
- **Do not** remove localStorage cleanup from `clearSession()` — users will never sign out properly
- **Do not** call `window.open()` directly from QR scan or external link handlers — use `ExternalLinkModal`
- **Do not** add a Settings tab back to BarcodeManager — access control lives in Profile → Dashboard Icons
- **Do not** move the "← Back to options" button to the top of a `SectionCard` — it must be at the **bottom**
- **Do not** manually edit `docs/admin/index.html` — it is regenerated by `scripts/post-build.mjs` on every build
- **Do not** add a tab bar for super admin in `Admin.jsx` — super admin sees all content directly without tabs
- **Do not** add `orgadmins` as a tab for super admin — org admin profiles are shown inline in each org row
- **Do not** allow lab managers (`session.role === 'user'`) to edit, deactivate, or delete org admin rows (`s.role === 'admin'`) in `StaffListPanel`
- **Do not** replace `.module-icon-grid` with an inline CSS Grid — the flexbox class is required to center the last row of icons
- **Do not** add back a fixed `height: 160` (or any fixed height) inline style to `ModuleCard` or `LockedCard` on desktop — it breaks the `align-content: stretch` viewport-fill layout; card height is controlled by CSS media query
- **Do not** remove `scrollbar-gutter: stable` from `<main>` in Layout.jsx — without it, Windows Chrome's 17px scrollbar collapses the icon grid from 4 columns to 3
- **Do not** remove the `if (activeModules !== null) return` early-return from `loadDashboardPrefs()` in Dashboard.jsx — it prevents DB re-fetch from overwriting icon selections just saved via Profile
- **Do not** remove the `terms_accepted_version` DB columns from `users`/`solo_users` — they are required for the Terms acceptance modal to dismiss permanently
- **Do not** call `sb.storage.from(...).upload()` directly for training certs or project record files — use `StorageService.upload(..., { personal: true })`
- **Do not** store external file refs as plain URLs — they are `ext:provider:id` strings; use `StorageService.resolveUrl()` or `useStorageUrl()` to display them
- **Do not** add a Storage tab only to some profile variants — it must appear in all four: `SoloProfile`, `StaffProfile`, `UserProfile`, and `AdminProfile` (org admin)

---

## Making the app public — App Store deployment

### Current deployment (web)
The app is a static SPA served from GitHub Pages:
- Production URL: `https://mtt999.github.io/ilab/`
- Admin URL: `https://mtt999.github.io/ilab/admin`
- All routing is handled client-side (SPA) — only `docs/index.html` and `docs/admin/index.html` are physical HTML files

### iOS App Store — recommended path: Capacitor

[Capacitor](https://capacitorjs.com/) by Ionic wraps the existing React web app in a native iOS WebView shell. This is the lowest-effort path to the App Store since no rewrite is needed.

**Steps to add Capacitor:**
```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios
npx cap init "iLab" "com.yourcompany.ilab" --web-dir docs
npx cap add ios
npm run build
npx cap sync
npx cap open ios   # opens Xcode
```

**Key Capacitor config changes needed in `capacitor.config.ts`:**
- `webDir: 'docs'` — points to the Vite build output
- `server.url` — can point to the live GitHub Pages URL during development for hot reload

**Vite base path issue:** The app uses `base: '/ilab/'` in vite.config.js. For Capacitor (file:// serving), change base to `'/'` for the mobile build, OR configure Capacitor's `server.hostname` appropriately. Use a separate build script or env variable to toggle between web (`/ilab/`) and mobile (`/`) base paths.

**Native APIs to add via Capacitor plugins:**
| Need | Plugin |
|------|--------|
| Camera / QR scan | `@capacitor/camera` or `@capacitor-community/barcode-scanner` |
| Push notifications | `@capacitor/push-notifications` |
| Haptics | `@capacitor/haptics` |
| Status bar | `@capacitor/status-bar` |
| Safe area insets | Already handled via `env(safe-area-inset-*)` CSS in Layout.jsx |

**App Store requirements checklist:**
- [ ] Apple Developer account ($99/year) at developer.apple.com
- [ ] App ID / Bundle ID registered (e.g. `com.yourcompany.ilab`)
- [ ] App icons: 1024×1024 PNG (no alpha), plus all required sizes (Xcode generates from single source via AppIcon)
- [ ] Launch screen / splash screen
- [ ] Privacy policy URL (required if app collects any user data)
- [ ] App Store Connect listing: description, screenshots (6.5" iPhone, 5.5" iPhone, iPad if universal)
- [ ] Xcode signing: Automatically managed signing with your Apple Developer account
- [ ] Build and archive in Xcode → submit via Xcode or Transporter

**iOS-specific issues to watch for:**
- `localStorage` works inside WKWebView (Capacitor uses WKWebView) ✓
- Supabase fetch calls work in WKWebView ✓
- The `base: '/ilab/'` path must be changed to `'/'` for local file serving
- Safe area insets are already handled in Layout.jsx (`env(safe-area-inset-top)`)
- Camera permission: add `NSCameraUsageDescription` to `ios/App/App/Info.plist`

### Android (Google Play) — same Capacitor approach
```bash
npm install @capacitor/android
npx cap add android
npx cap open android   # opens Android Studio
```

### Alternative: PWA (Progressive Web App)
Add a `manifest.json` and service worker to make the web app installable on iOS home screen without App Store review. Simpler but limited native API access and not listed in App Store.

---

## Material Reduction (Sept 2026) — fractions live under their parent

A material can be **reduced** into new materials — today that means
fractionation, splitting an aggregate across sieves. Each selected size becomes
its **own** `project_materials` row, because that is what fractionation
physically produces: a separate container per fraction, each needing its own
barcode, quantity, storage location and QR label.

**Entry point:** `⚗️ Material Reduction` button beside `+ Non-Project Material`
on the Projects & Materials screen → `src/components/MaterialReductionModal.jsx`
(project → material → type → method → sieve sizes, coarse to Pan).

**Schema** (`project_materials`, applied via `rls_phase1.sql`):

| Column | Meaning |
|---|---|
| `parent_material_id` UUID | the material this was derived from; FK `ON DELETE SET NULL` |
| `reduction_method` TEXT | `fractionation` today |
| `reduction_value` TEXT | the sieve size this fraction is |
| `reduction_date` DATE | date of fractionation |

`ON DELETE SET NULL`, never CASCADE — deleting a parent must not destroy
fractions that physically exist on a shelf.

**Fractions are NOT top-level cards.** `ProjectMaterials.jsx` lists
`materials.filter(m => !m.parent_material_id)`; fractionating into 13 sieves
otherwise added 13 sibling rows. They are reached through the parent's
**Material Reduction** tab. Consequences that must stay in sync:
- the parent card shows a `⚗️ N reductions` badge, and the header reads
  `N materials · N reductions` — the count is never silently hidden
- `ProjectMaterial.jsx`'s project-card `matCount` also excludes fractions, and
  its materials `select()` must include `parent_material_id` or that filter is
  a silent no-op
- a fraction reduced further gets a nested `Reduced into` sub-tab; without it a
  grandchild is unreachable (hidden from the list, linked from nothing)

**Reduction row sub-tabs:** `Info` · `Material` · `Reduction material label`.
- `Material` = `ReductionMaterialForm`, NOT the main-material `MaterialModal`.
  A fraction must not be asked Source Type / Name / Location again — those are
  the parent's, and asking twice invites the two records to disagree.
  It asks: reduction type, (aggregate) parent gradation shown read-only +
  sieve size + date of fractionation, additional info, quantity, container
  colour + count, location, photos.
- `Info` is `MaterialInfoView` with `editHint`, which points at the Material
  tab — shown only where an editable tab exists (`!readOnly`).

**`MaterialInfoView` is shared** between the Material Info tab and the reduction
rows. Do not duplicate that markup — a second copy drifts the moment a question
is added to the material form.

**`ReductionRow` is declared at module scope.** Defined inside
`MaterialReductionTab` it would be a new component type on every render, so
React remounts it and the expanded row + selected sub-tab reset on each parent
re-render.

**Not copied to a fraction** (`NOT_COPIED` in the modal): `barcode_id` (a unique
index forbids duplicates and each fraction needs its own label), `locations` /
storage fields (not stored yet), `photos` (they show the parent's container),
and `organization_id` / `solo_owner_id` — those are **stamped from the session**,
because a parent predating those columns has them NULL and the RLS `WITH CHECK`
would reject the whole batch.

**Materials are fetched by `project_id` alone** in the reduction modal, the same
access path the Materials tab uses. Filtering by `organization_id` there instead
silently hid every pre-column row, reading a full project as empty.

## Module visibility — ONE resolver, four layers (Sept 2026)

**`src/lib/modulePools.js` owns every pool rule. Never compose pools inline.**

Five screens each had their own inline version and drifted apart; the symptom
was an org admin granting 9 icons, the picker offering 7, and the dashboard
rendering 5, with no error anywhere.

```
1. Super admin   settings.app_allowed_modules            global default
                 organizations.allowed_modules           per-org grant
2. Org admin     organizations.allowed_modules_labusers  role pools
                 organizations.allowed_modules_labmanagers
3. Lab manager   user_dashboard_prefs.allowed_modules    per lab user
4. The user      user_dashboard_prefs.active_modules     their own picks
```

Each layer **narrows** the one above. One documented exception: a per-org grant
**replaces** the global pool rather than intersecting it (rule 9 above).

| Function | Layers | Use for |
|---|---|---|
| `orgCapabilityPool()` | 1–2 | what the organisation may use |
| `capabilityPool()` | 1–3 | what this user may use |
| `visibleModules()` | 4 | what they actually see |
| `orgPoolForRole()` | — | role → correct org pool column |

- A per-user assignment can never introduce a module the org admin did not
  grant. Letting per-user win outright put Equipment & Maintenance on the
  dashboard while the picker could not deselect it.
- `PINNED_MODULES` (profile) and `LAB_MANAGER_PINNED_MODULES` (labmanagement)
  are force-shown regardless of any pool. Never render them as locked and never
  offer them as pool choices — unticking them has no effect, so offering them
  only misleads whoever sets the pool.
- Capability pools are **capabilities, not preferences**: load them before any
  early return. `loadDashboardPrefs()` returns early when `activeModules` is set
  and again for demo accounts, which is why the pool moved to
  `loadLabUserGate()`.

# Session — September 2026

## Printed material labels — ONE renderer (Sept 2026)

`src/lib/materialLabel.js` + `src/components/MaterialLabel.jsx` own everything
about a printed 4×6 material label. This markup previously existed **three**
times (project storage tab, single-material storage tab, material label tab)
with three different field sets, so the same container could be labelled
differently depending on which button was pressed.

| Export | Purpose |
|---|---|
| `labelSections(material, project, parent)` | what goes on the label, grouped |
| `LABEL_TYPE` | type sizes — header 17, barcode 25, title 17, field 20 |
| `FIELD_LIMITS` | `name` 30, `pi_name` 30, `project_name` 40 |
| `generateBarcodeId(project, material)` | uuid-derived, unique and stable |
| `buildScanUrl(material, project)` | the QR target |
| `overLimit(label, value, max)` | save-time guard |

**Layout:** three groups, each with a grey rule above it and an underlined
title — `Project info:` / `Original Material:` / `Reduced Material:` (the last
only on a reduction). Only those three titles are printed as words; everything
under them is the value as entered. Arial, every line bold.

- On a reduction, *Original Material* is the **parent**; on a plain material it
  is that material itself.
- Non-aggregate types substitute their identifying spec in the sieve slot: PG
  grade for binder and plant mix, plus NMAS for plant mix, and Split Into /
  Samples on the reduced side.
- **QR is 120px.** Three headings and three rules cost real height, and a
  plant-mix reduction (four lines under Original Material) is the tallest label
  there is. At 132 it had no spare line for a value that wraps; a long project
  name is the likely one, since project names get 40 characters. Do the
  arithmetic before adding a line.

**Never fall back to the material NAME for a barcode.** Two materials can share
a name; two labels must never share an identity. Both storage tabs used to,
which meant two containers could carry the same QR.

**Character limits are hard limits, enforced twice:** `maxLength` on the input
AND `overLimit()` on save. The save check is not redundant — a value stored
before the limit existed is still in the box when the form opens and would
otherwise be carried forward unchanged.

## Material type icons

`src/components/MaterialIcon.jsx` draws the five team types (aggregate = a pile
of crushed stone, other = a white 5-gallon bucket, binder = a drum, plant mix =
a road, cores = a cut cylinder). Emoji could not carry these: there is one rock
glyph and it reads as a pebble, and no emoji is a 5-gallon bucket. They are
coloured rather than inheriting `currentColor` like `Icons.jsx`, because they
stand in for a photo rather than being UI chrome. The eleven solo types keep
their emoji (`materialIcon()` in `materialFields.js`); an unknown type falls
back to the beaker.

## Icon hierarchy — what changed (Sept 2026)

- **`labManagerOnly` is a DEFAULT, not a wall.** An org admin may grant those
  modules to lab users, and every downstream filter honours an explicit grant:
  the dashboard card, the sidebar entry, the icon picker's available list,
  Profile's icon panel, and the per-lab-user icon manager. Changing only the
  admin panel makes the checkbox a lie — it saves, and the icon never appears.
- **`neverLabUser`** is the wall. Only `labmanagement` carries it: it is the
  console for managing users, so granting it to a lab user is a privilege
  escalation rather than a feature toggle.
- **The org grant saves an explicit list, never `null`.** `null` does not mean
  "grant everything" — it means "inherit the global app pool", which is
  normally narrower. Ticking Select all used to save `null`, so the org admin
  still saw those icons locked with every checkbox showing enabled.
- **`LabUserIconManager` is role-aware.** One person can hold several `users`
  rows (Login links every row sharing an email), each with its own pool. The
  modal offers a Lab User / Lab Manager switch and saves to the selected role's
  row. Pools come from `orgPoolForRole()`, never composed inline.
- **A write that saves nothing now says so.** Both org icon saves `.select()`
  the updated rows: an update matching zero rows returns 200 with an empty
  body, so an RLS-blocked write used to toast "saved" and change nothing.

## Granting an icon notifies the lab user

Saving an icon pool for a **lab user** appends the newly granted keys to their
`active_modules` (appends only — it must never undo a module they hid), then
sends an in-app notification and an opt-in email via
`notification_prefs` → `email_notifications_queue`. Only genuinely new keys are
announced: the pool held at load is captured in a ref. A one-time dismissible
hint on the lab user home screen points at Profile → Dashboard Icons.

Needs `notification_prefs.icons_granted` / `email_icons_granted`.

## ICT-Lab-only icon rules

**The org grant is the ONLY authority.** `orgCapabilityPool()` in
`src/lib/modulePools.js` deliberately ignores `appPool`
(`settings.app_allowed_modules`). That is LabHive's global default across many
orgs; ICT-Lab is one organisation and the super admin already says what it gets
in that org's Icons modal.

Keeping both was not merely redundant — it was unfixable from the UI. The
global modal has **no entry point**: `setAppModulesOpen(true)` is never called
anywhere in this app. So the row could not be edited, yet a leftover narrow
value still won whenever the org grant was `null`, and icons the super admin
had granted showed as "contact us to enable" in the org admin's own panel.

**`organizations` needs all three pool columns here** — `allowed_modules`,
`allowed_modules_labusers`, `allowed_modules_labmanagers`. The role columns
never existed on this database, and `OrgPoolEditor` SELECTs
`allowed_modules, <poolKey>` in one query: PostgREST fails the **whole** request
when one named column is missing, so the org grant came back empty on every
load and every icon outside the fallback locked itself, silently. That load now
reads its `error`.

**Lab user cards derive from `ALL_MODULES_META`.**
`getAllModulesForLabUser()` was a hardcoded array of six keys, and the lab user
card grid *starts* from it, so every grant below could only narrow. A module
granted by the org admin, assigned by the lab manager and ticked by the lab
user still rendered nothing. With no per-user assignment the fallback excludes
`labManagerOnly`, which resolves to exactly the six keys the old array held.

## SDS tab (Training Records)

`src/screens/training/SDSTab.jsx`, sidebar key `sds`, sits under Exam. Lab
managers and admins upload PDFs, Word documents and video, or add a link; lab
users get the same list read-only.

- Files go to the **`project-files`** bucket directly, NOT through
  `StorageService`. These are org content — everyone reads the same sheets — and
  the per-user provider would put a manager's upload in their own Drive.
- **There is no `lab-files` bucket on this project.** It is named in
  `LabMessage.jsx` and nowhere else, and uploads there fail with "Bucket not
  found" — which that screen swallowed, sending messages with the attachment
  silently missing.
- Writes are restricted to `admin`/`user` in the **policy** as well as the UI,
  so a lab user calling the API cannot delete the lab's SDS library.
- Deletion removes the row first and the stored file second.

Needs the `sds_documents` table (see `rls_phase1.sql`).

## Safety training steps

Approving a step now shows a bar naming the next one, on every step but the
last. Progress here is an object with a `completed` flag (LabHive's is a plain
boolean) — a truthy test lights the bar on every step.

## Sign-in page — LOCKED, do not change without explicit permission (ICT-Lab)

The backdrop and the card were tuned together over many rounds against real
window sizes. Changing one value in isolation reliably breaks the composition,
because the card is a **fixed pixel size** while the photo **scales with the
window**.

### The constraint, so it is not rediscovered

- The wall lettering spans **8–45% of the photo's width**; the card occupies
  about **6–34% of the screen**. They overlap horizontally *however the photo
  is panned* — no crop or `background-position` puts the sign clear to the
  right of the card. **Only vertical separation exists.**
- The card + credit line is **~650px fixed**. On the Windows machine
  (~884px viewport) that is 76% of the height and there is room below the
  sign. On a Mac (~739px — menu bar and dock) it is 91% and there is not.
  This is the entire reason the two platforms looked different; nothing about
  the rendering differs.
- Lowering the card and giving the sign sky above it move the two **toward**
  each other. Doing both at once is what broke it twice.

### What is set, and why

| Where | Value | Why |
|---|---|---|
| `public/ict-building.jpg` | 2000×1501, 518 KB | original is 9.4 MB — far too heavy for the first page anyone loads |
| `background-size` | `cover` | full-bleed; a right-hand band reads as a split screen, which was rejected |
| `background-position` | `62% 42%` | tall windows |
| short windows | `62% 80%` + `zoom: 0.85` | see below |
| `padding-left` | `min(7vw, 110px)` | every pixel right is a pixel more lettering covered |
| `padding-top` | `min(34vh, max(40px, calc(100vh - 580px)))` | as low as the sign needs, yielding before the credit line clips |

**The `@media (min-width: 900px) and (max-height: 820px)` rule is the Mac fix.**
It scales the column to 85% (freeing ~100px) and lifts the focal point to 80%
so the sign sits at the top of the frame. `zoom`, not `transform: scale` —
zoom changes the layout box so `padding-top` sees the smaller height; a
transform leaves a 670px hole and the offset is computed from the old size.

### The card

Title is **ICTlab**. Below the Sign in button: Terms of Service, then
**Contact Us** alone, then **Developed by Mohsen Motlagh** outside the card.

Removed deliberately — do not restore: the ICT-Lab / Integrated Lab Management
Platform / copyright block, the standalone Contact Us button, and the
"Need help logging in?" toggle (its panel only showed an email address, which
Contact Us covers properly).

`.login-shell .login-meta` sets the credit line light explicitly; the page's
`--text2` / `--text3` tokens are tuned for a light background and are almost
invisible on the scrim.

## The sign-in URL must stay clean

`https://ictlab.labhive.app` — **not** `…/?_v=mu77t63s`.

`main.jsx` force-navigates with a `_v` cache-buster when `version.json` reports
a build the tab is not running; that is the stale-index recovery and it must
stay. What must also stay is the `history.replaceState` immediately after it
that strips `_v` once the fresh build is running. Without it the parameter
sticks in the address bar, and that is the URL people copy, bookmark and send
on. `replaceState` costs no request and leaves no extra history entry.

## Silent-failure classes seen in this codebase — check for these

Every one of these shipped and went unnoticed; none produced an error.

1. **Unchecked Supabase errors.** ~271 write call sites do
   `await sb.from(t).update(...)` without reading `error`. `supabase.js` now
   logs every non-OK REST response centrally, but see #2.
2. **A write that matches zero rows is not an error.** `.update()` on a row
   that doesn't exist returns 200 and changes nothing — the locker "Unavailable"
   checkbox looked saved and reverted on reload. Use `upsert` with a real unique
   index when the row may not exist yet.
3. **`.catch()` on a Supabase query builder throws.** It is a *thenable*, not a
   Promise. `sb.from(x).update(y).eq(...).catch(...)` raises
   "catch is not a function". Use `.then(ok, err)` or `await` in a try/catch.
4. **Querying a column that doesn't exist** fails the whole request; if the call
   site ignores `error`, the feature silently shows nothing. `projects.students`
   never existed and lab users' "My active projects" read 0 for months.
5. **`onConflict` needs a matching unique index**, or the upsert is rejected
   outright (`feedback_responses`, `lab_user_lockers`).
6. **Schema drift between ictlab and labhive.** The same shared component hits
   different columns — and sometimes the same column with a different TYPE.
   Verify per project before relying on it, especially in raw SQL:
   - `projects.lab_user_ids` is `uuid[]` here but `text[]` in labhive, so a
     statement written against one fails on the other ("COALESCE could not
     convert type uuid[] to text[]"). PostgREST coerces at runtime, so only
     hand-written SQL notices.
   - `lab_user_lockers` had `created_at` here but `assigned_at`/`notes` in
     labhive; `organizations.lab_user_default_modules` existed only in
     labhive. Check `information_schema.columns` (udt_name for array element
     types) before writing a migration.

7. **The same relationship stored in two directions.** The Edit lab user modal
   wrote `users.assigned_project_ids` while the whole Projects screen reads
   `projects.lab_user_ids` — assigning projects had no visible effect and the
   lab user saw "No projects found". When a link is denormalised both ways,
   one side must be authoritative and written by every path that changes it
   (`syncProjectAssignments()` in Profile.jsx).

## Before changing a conditional that gates UI

Read to the closing brace first. Three regressions in one session came from
widening a gate that wrapped more than expected (the locker grid gate also
wrapped the management table), or from editing a branch the target role never
reaches (lab users hit `panelUser` mode, which early-returns before the grid).
Ask "which branch does this role actually take?" before editing.

## Terminology — locked

**lab manager** (never "staff") and **lab user** (never "student"), in UI text,
code identifiers and the database. The DB rename is done:
`lab_user_ids`, `lab_user_lockers`, `lab_user_default_modules`. `projects.students` does not exist — use `lab_user_ids`. There is no `student` role; the three roles
are `admin`, `user` (lab manager), `lab_user`.

## RLS helpers must be set-returning

`my_user_id()` / `my_org_id()` use `LIMIT 1` with no `ORDER BY`. One auth
account routinely owns several `users` rows (Login auto-links every row sharing
an email), so they return an arbitrary row and ownership checks intermittently
evaluate false for rows the user genuinely owns — a notification was hidden from
the very identity it was addressed to. **Use `my_user_ids()` / `my_org_ids()`**
(set-returning, `is_active`-aware) for all ownership and org scoping.

`_apply_rls` **fails open**: a broken policy disables RLS rather than erroring.
After any change to `rls_phase1.sql`, run the exposure check — an empty result
is the only proof nothing silently opened up:

```sql
SELECT c.relname, c.relrowsecurity,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND (c.relrowsecurity=false
       OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname));
```
