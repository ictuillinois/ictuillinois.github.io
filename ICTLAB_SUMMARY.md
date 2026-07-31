# ICT-Lab — Project Summary & Session Handoff

**Last updated:** July 30, 2026  
**For:** Claude Code sessions working on the ICT-Lab project

---

## What is ICT-Lab?

ICT-Lab is a **fork of LabHive** customized exclusively for the **Illinois Center for Transportation (ICT)** at the University of Illinois Urbana-Champaign. It is a React 18 + Vite SPA for research lab management: equipment booking, safety training, projects, task board, supply inventory, messaging, and more.

It is a **single-organization, team-only** deployment — no solo mode, no multi-tenant. All users belong to one ICT organization.

---

## Tech Stack

| Layer | Detail |
|---|---|
| UI | React 18.3 + Vite 5.4 |
| State | Zustand 4.5 |
| Backend | Supabase JS v2.45 — custom auth via `users` table, `signInWithPassword` |
| Security | bcryptjs (password hashing), vite-plugin-javascript-obfuscator (prod) |
| Export | ExcelJS, xlsx-js-style |

---

## Deployment

| | |
|---|---|
| **Production URL** | https://ictlab.labhive.app |
| **Admin URL** | https://ictlab.labhive.app/admin |
| **Hosting** | Cloudflare Pages (project: `ictlab`) — **auto-deploy via GitHub Actions** |
| **Source repo** | https://github.com/ictuillinois/ictuillinois.github.io (PRIVATE) |
| **Domain DNS** | Cloudflare — `ictlab.labhive.app` is a subdomain of `labhive.app` |
| **Build output** | `docs/` folder |
| **Vite base** | `/` |

### Deploy workflow (automatic — push to main triggers CI)
```bash
# In /Users/mohsenmotlagh/Desktop/ictlab/
npm run build
git add docs/ src/ scripts/
git commit -m "..."
git push
# → GitHub Actions builds + deploys to Cloudflare Pages automatically
```

**GitHub push authentication:** The org has SAML SSO enforced. VS Code OAuth occasionally expires and blocks push. Use the PAT directly in the remote URL if that happens:
```bash
git remote set-url origin https://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@github.com/ictuillinois/ictuillinois.github.io.git
git push
```

**GitHub Actions workflow:** `.github/workflows/deploy.yml` — uses secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set in the repo settings.
- Cloudflare API Token: `cfut_bfMgjEENoPfyLtOHoOghwOo2a4aiXJxZmvISavPL769a805c`
- Cloudflare Account ID: `464bca1d681e599979d588a5f1c39ab2`

---

## Supabase

- **Project URL:** `https://ilqnwprvxwbhvrjstwsd.supabase.co` — **separate project from LabHive**
- **Anon key:** `sb_publishable_HEl1HIKUs2vVmqa16LZhlQ_EwciS1M8` (in `src/lib/supabase.js`)
- **Auth:** `signInWithPassword` → `users` table → `auth_id` links to Supabase auth
- **RLS:** Enforced on all tables via `rls_phase1.sql`
- **Helper functions (SECURITY DEFINER):** `my_org_id()`, `my_user_id()`, `is_super_admin()`
- **Super admin credentials:** email `admin@ictlab.app`, password bcrypt-hashed in `settings.admin_password`

### Module images
Module card background images are stored as `img_{key}` rows in the `settings` table. Currently **all point to labhive's public Supabase storage** (`qhsxtpywfczqopcimykk.supabase.co`) — this is intentional and works because labhive's `project-files` bucket is public.

The 8 images already set: `img_projects`, `img_booking`, `img_supply`, `img_barcode`, `img_barcodeqr`, `img_profile`, `img_mileage`, `img_labsafety`.

To write to the settings table from code or API, you need an authenticated super-admin JWT (anon key has no write access). Use the **Supabase SQL Editor** to insert/update settings directly (bypasses RLS).

---

## User Roles

| Role | Description |
|---|---|
| **ICT Admin** (super admin) | `userId = null`, `adminLevel: 3` — logs in at `/admin` |
| **Lab Manager** | `role = 'user'` — staff; full access to staff-only modules |
| **Lab User** | `role = 'lab_user'` — restricted module set (no staff-only modules) |

There is no org admin role in ICT-Lab — the ICT Admin IS the super admin.

---

## Module System

### `ALL_MODULES_META` — source of truth
Defined in `src/components/DashboardIconPicker.jsx`.

### Staff-only modules (`staffOnly: true`) — lab managers & admin only
| Key | Screen | Label |
|---|---|---|
| `training` | training | Training Records |
| `labmanagement` | labmanagement | Lab Management |
| `pm` | pm | Task Board |
| `equipment` | equipment | Equipment List |
| `equipmenthub` | equipmenthub | Equipment Hub |
| `supply` | home | Supply Inventory |
| `remessages` | remessages | Lab Messages (internal chat, staff only) |

### Lab user modules — visible to all roles
| Key | Screen | Notes |
|---|---|---|
| `projects` | projects | Project workspace |
| `booking` | booking | Reserve equipment |
| `barcode` | barcode | QR scan |
| `training` | training | Training Records (Safety tab + own certs) — no longer staffOnly |
| `barcodeqr` | barcodeqr | QR labels — `studentLocked: true` (visible but locked for lab users) |
| `mileage` | null | External link (mileage form) |
| `profile` | profile | Always shown |

### `studentAllowed` list (Dashboard.jsx)
```js
['projects', 'booking', 'mileage', 'barcode', 'training', 'profile']
```
Lab users ONLY see modules in this list. `remessages` is NOT in this list.

---

## Lab Safety Screen (`src/screens/labsafety/LabSafety.jsx`)

A 4-step safety onboarding flow.

- **Lab manager view:** Grid of lab user cards with step progress dots. Click a card → step panel with Approve/Revoke buttons per step.
- **Lab user view:** Step tabs (STEP 1–4) with content + "waiting for approval" notice. Once all 4 steps approved → "Upload Certificates →" button navigates to Training Records.

### Step content
All 4 steps are currently `type: 'placeholder'` — content details not yet provided by user. The `StepContentArea` component supports `type: 'video'`, `type: 'pdf'`, `type: 'download'` when ready.

### Required SQL (run once in Supabase SQL Editor)
```sql
CREATE TABLE IF NOT EXISTS lab_safety_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  step_number INTEGER NOT NULL CHECK (step_number BETWEEN 1 AND 4),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, step_number)
);
ALTER TABLE lab_safety_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab_safety_progress_org" ON lab_safety_progress
  FOR ALL USING (organization_id = my_org_id())
  WITH CHECK (organization_id = my_org_id());
```

### First-login onboarding prompt
When a new lab user logs in (after password change + terms), a "Safety Training Required" modal appears once (guarded by `localStorage.getItem('ictlab_training_prompted_{userId}')`). "Start Safety Training →" navigates to the labsafety screen.

---

## What Has Been Customized vs LabHive

| Feature | ICT-Lab behavior |
|---|---|
| Solo mode | Completely removed — team-only |
| Privacy Policy | Removed from entire site — Terms of Service only |
| Lab Messages | Staff-only (lab managers & admin) — not visible to lab users |
| Lab Safety | Converted from external link to internal 4-step screen |
| Module defaults | Lab users default to all `studentAllowed` modules (not profile-only) |
| Login branding | ICT-Lab logo, ICT-specific text |
| Sara chatbot | ICT-specific FAQ (REs contact, mileage, lab policy, etc.) |
| Staff modules | 7 modules marked `staffOnly: true` — hidden from lab users |
| Dashboard fix | Staff with only 'profile' saved get full module set restored automatically |

---

## Profile Tabs (by role)

| Role | Tabs |
|---|---|
| Lab User | My Info, Password, Dashboard Icons, Notifications, Storage, Project Team, Delete Account |
| Lab Manager | My Info, Password, Dashboard Icons, Notifications, Storage, Project Team, Delete Account |
| ICT Admin | Admin Settings, Icon Images, Dashboard Icons, Notifications, Organization |

**Privacy tab removed from all roles.**

---

## Key Files

| File | Purpose |
|---|---|
| `src/screens/labsafety/LabSafety.jsx` | Lab safety onboarding screen (NEW — ICT-Lab only) |
| `src/components/DashboardIconPicker.jsx` | `ALL_MODULES_META` — single source of truth for all modules |
| `src/screens/dashboard/Dashboard.jsx` | Dashboard; `studentAllowed` list; module loading logic |
| `src/screens/admin/Admin.jsx` | Admin panel; `STUDENT_ICON_OPTIONS` for lab user icon picker |
| `src/App.jsx` | Routes, `INTERNAL` set, first-login training prompt |
| `scripts/post-build.mjs` | Recreates admin/index.html, oauth-callback, terms page — NO privacy page |

---

## Bugs Fixed (this session)

### 1. ProjectMaterial blank page for lab managers
`ProjectMaterial.jsx` imports `sharedWorkspaces` from the Zustand store (a solo-workspace feature). ICT-Lab's store didn't define it, causing `undefined.find()` crash on load.

**Fix:** Added safe stubs to `src/store/useAppStore.js`:
```js
sharedWorkspaces: [],
viewingWorkspaceOwnerId: null,
setViewingWorkspaceOwnerId: () => {},
```

### 2. Password Show/Hide toggle not working
The eye button on password fields was not revealing the password. Three root causes were found and fixed together:

1. **Browser native controls** blocked the click (CSS fix added to `src/index.css`)
2. **Browser security restriction** — browsers refuse to change `type="password"` to `type="text"` on an existing DOM element in-place
3. **Fix:** Replaced all absolute-positioned eye-button patterns with a `PasswordInput` component using `key={show ? 'txt' : 'pwd'}` — the key change forces React to unmount/remount the input as a fresh element, bypassing the browser restriction. Toggle is now a "Show password" / "Hide password" text link below the input field.

Applies to all password fields: solo password change, admin account settings, staff modal, user modal, `PasswordChangePanel`.

---

## Pending Work

1. **Lab Safety step content** — User said "I will give you more details for each step later." Update `STEPS` array in `LabSafety.jsx` with real content (video URLs, PDF links, download files) for each of the 4 steps.

2. **SQL migrations** — Run in ICT-Lab Supabase SQL Editor if not already done:
   - `CREATE TABLE lab_safety_progress` (see above)
   - `UPDATE users SET role = 'lab_user' WHERE role = 'student';` (fixes users created with wrong role before the bug was fixed)
   - `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_modules_labusers JSONB DEFAULT NULL;`
   - `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_modules_labmanagers JSONB DEFAULT NULL;`
   - Add the 6 missing module images (run in SQL Editor — see Module images section above):
     ```sql
     INSERT INTO settings (key, value) VALUES
       ('img_equipment',    'https://qhsxtpywfczqopcimykk.supabase.co/storage/v1/object/public/project-files/module-images/global/img_equipment-1780783736553.jpg'),
       ('img_training',     'https://qhsxtpywfczqopcimykk.supabase.co/storage/v1/object/public/project-files/module-images/global/img_training-1780784615661.jpg'),
       ('img_labmanagement','https://qhsxtpywfczqopcimykk.supabase.co/storage/v1/object/public/project-files/module-images/global/img_labmanagement-1780779972069.jpg'),
       ('img_equipmenthub', 'https://qhsxtpywfczqopcimykk.supabase.co/storage/v1/object/public/project-files/module-images/global/img_equipmenthub-1780781440126.jpg'),
       ('img_remessages',   'https://qhsxtpywfczqopcimykk.supabase.co/storage/v1/object/public/project-files/module-images/global/img_remessages-1780783744599.jpg'),
       ('img_pm',           'https://qhsxtpywfczqopcimykk.supabase.co/storage/v1/object/public/project-files/module-images/global/img_pm-1780785108745.jpg')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
     ```

3. **Lab Messages screen** — Currently using the LabHive `REMessages` component. May need ICT-specific customization (staff-to-staff internal chat).

---

## Important Rules (do not break)

1. **No solo mode** — ICT-Lab is team-only. Never add solo login paths or solo-only code.
2. **No Privacy Policy** — Removed intentionally. Do not re-add links to `/privacy` anywhere.
3. **`remessages` is staff-only** — Do not add it back to `studentAllowed` or lab user defaults.
4. **`staffOnly` modules** — Any new staff-only module must have `staffOnly: true` in `ALL_MODULES_META` AND must not appear in `studentAllowed` in Dashboard.jsx.
5. **Lab user defaults** — `setActiveModules(null)` (not `['profile']`) when no saved prefs, so `getModules()` returns the full `studentAllowed` list.
6. **Deploy = push to GitHub** — GitHub Actions auto-deploys to Cloudflare Pages. Never drag-and-drop anymore.
7. **Settings table writes need SQL Editor** — The anon key cannot write to the `settings` table. Use the Supabase SQL Editor (service role) for any direct settings inserts/updates.
