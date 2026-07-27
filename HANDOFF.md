# iLab — Handoff Summary

**Date:** May 15, 2026
**Purpose:** Bring Claude Code (or any future session) up to speed on the iLab project
state, the open architecture decision, and the planned work. Read this before making
any changes to the codebase.

---

## Project context (one paragraph)

iLab is a React 18 + Vite + Zustand + Supabase SPA for lab management, currently
deployed to GitHub Pages at https://mtt999.github.io/ilab/. It is a personal
project built by Moe (UIUC ICT lab manager) on personal time, on a personal
machine, with a personal Claude subscription. The current goal is to ship it
publicly — to the Apple App Store and Google Play Store via Capacitor — and
eventually monetize via a Bring-Your-Own-Backend (BYOB) multi-tenant pattern
where each customer connects the app to their own Supabase project.

---

## Where the conversation left off

We were preparing to refactor iLab to BYOB, but a code review of the existing
project (via the Claude-Code-generated CLAUDE.md) surfaced a **blocking
security issue** that must be resolved before BYOB or App Store work can
safely proceed. We are paused at an architecture decision point.

---

## The blocking issue (read this carefully)

**Current state of the backend:**
- Supabase URL and anon key are hardcoded in `src/lib/supabase.js` and shipped
  in the client bundle.
- **Row Level Security (RLS) is NOT enabled on the tables.**
- Custom auth: passwords are bcrypt-hashed and verified in client code against
  rows in `users` and `solo_users` tables.
- The super admin email and bcrypt-hashed password live as rows in a `settings`
  table (`admin_email`, `admin_password` keys) — readable by anyone with the
  anon key.

**Why this is blocking:**
The Supabase anon key is public by design. Anyone who installs the App Store
build, or visits the GitHub Pages site and opens DevTools, can extract the key.
Without RLS, that key gives full read/write access to every table:
- Read every user's email + bcrypt password hash.
- Read the super admin password hash from `settings`.
- Read every organization's data and module config.
- Write to any table — drop rows, create fake admins, modify records.

For internal UIUC use this is "probably fine." For an App Store release — and
absolutely for BYOB, where every customer's database would be in the same
position — this is a serious liability for Moe and for any customer trusting
iLab with their data.

This was missed earlier in the conversation when Moe said RLS was "partial."
The Assistant should have pushed harder on this and is flagging it now.

---

## The architecture decision (PENDING — Moe to choose)

Three viable paths, each with different scope and timeline:

### Path A — Migrate to Supabase Auth + RLS (the "right way")
- Replace custom `users` / `solo_users` bcrypt-in-client auth with Supabase's
  built-in `auth.users` + `auth.signInWithPassword()`.
- Keep `users` and `solo_users` as *profile* tables joined to `auth.users` by id.
- Move the super admin password out of the `settings` table entirely
  (use Supabase Auth + a `role` column or a separate admin check).
- Enable RLS on every table; write explicit SELECT/INSERT/UPDATE/DELETE
  policies scoped to `auth.uid()` and org membership.
- **Estimated effort: 2–4 weeks of focused work on the 20K-line codebase.**
- This is the foundation a BYOB / App Store / commercial product needs.

### Path B — Keep custom auth, add Supabase Edge Functions
- Move every privileged operation (admin login, password verify, user create,
  settings read/write) into Edge Functions that run server-side with the
  service role key.
- Client only calls Edge Functions over HTTPS — never touches tables with the
  anon key directly.
- RLS still recommended as defense-in-depth.
- Less invasive to existing client code, but requires writing and securing an
  Edge Function for every privileged operation.
- **Estimated effort: 1–2 weeks.**

### Path C — Defer the refactor; ship to UIUC internally only
- Keep the current architecture.
- Use iLab as a UIUC-internal web app for the foreseeable future.
- Do NOT publish to the App Store, do NOT pursue BYOB, do NOT take on outside
  customers until Path A or Path B is done.
- **Estimated effort: zero (status quo).**
- Honest answer if the real near-term goal is "use it at UIUC this semester."

**Until this is decided, no further BYOB or App Store work should happen.**

---

## Other open items (lower priority, but worth recording)

These came up in conversation and should be tracked, but none of them block
the architecture decision above.

### IP ownership
- iLab was built on personal time, personal machine, personal Claude account,
  with brief incidental use of workplace VS Code for a few minutes of bug fixes.
- Moe is preparing an email to UIUC's Office of Technology Management (OTM)
  requesting written confirmation that iLab is outside the scope of employment.
- This is the single most important non-code task before commercializing.
- **Draft email exists in the conversation history.** Send before App Store
  submission.

### Apple Developer account
- Moe will enroll as an **individual** (not as UIUC) under his legal name,
  paying $99/year, to keep 100% ownership and future monetization rights.
- Enrollment not started yet. Can be done in parallel with the security
  refactor (Apple approval takes 24–48 hours).

### Funding (NSF / DCEO SBIR)
- Moe asked about the DCEO SBIR/STTR matching program. That program is a
  *match* on top of a federal SBIR/STTR award; you cannot apply directly.
  Not applicable until a federal SBIR Phase I award lands.
- Federal SBIR is a stretch for iLab as currently scoped ("lab management app"
  is not obviously a research project). Would need a research/technical-novelty
  angle to be competitive.
- Recommended next step (if pursuing): free intake call with the FAST Center
  at Illinois Research Park. They specifically help Illinois entrepreneurs
  prepare SBIR proposals.

### Bring-Your-Own-Backend (BYOB) plan
- The architectural pattern is sound and was sketched out in detail during
  the conversation. Reference scaffold code (configStore, supabase factory,
  validation, probe, SetupScreen) was generated as a v0.1 example.
- BYOB cannot ship safely without RLS or Edge-Function isolation — see the
  architecture decision above.
- Once architecture is fixed, BYOB refactor on the existing iLab is straightforward:
  1. Replace hardcoded Supabase URL/key in `src/lib/supabase.js` with a lazy
     factory that reads from a Zustand config store persisted to Capacitor
     Preferences.
  2. Add a SetupScreen rendered on first launch when no workspace is configured.
  3. Validate URL + anon key locally (reject service_role keys), then probe
     against a `_ilab_meta` table for schema version.
  4. Ship a `bootstrap.sql` that customers run in their own Supabase SQL Editor.
  5. Each customer's deployment runs against their own Supabase project; iLab
     never sees or hosts any customer data.

### App Store path
- Wrap with Capacitor (Capacitor 6).
- iOS build requires macOS + Xcode. Moe has a MacBook Pro available.
- Android build works on Windows via Android Studio.
- Vite `base: '/ilab/'` must be toggled to `'/'` for the Capacitor build.
- App Store reviewer notes must include demo workspace credentials (URL + anon
  key for a seeded demo Supabase project) so reviewers can test BYOB.
- Apple may flag a thin-wrapper concern under guideline 4.2. Defense:
  Capacitor native plugins for camera/barcode (`@capacitor-mlkit/barcode-scanning`),
  storage (`@capacitor/preferences`), filesystem, share. The more genuine
  native integration, the safer.

---

## Recommended next actions (in order)

1. **Decide on architecture path (A, B, or C).** No code changes until this
   is settled. The decision determines literally everything else.
2. **Send the OTM email** (if not already sent). This unblocks commercialization
   regardless of which technical path is chosen, and the reply takes days, so
   start the clock now.
3. **Phase the work.** Whichever path is chosen, run it as a series of small,
   reviewable commits in Claude Code. Do not let any AI assistant — including
   Claude Code in auto-accept mode — make sweeping changes across many files
   without per-file review. On a 20K-line refactor, "trust but verify" loses to
   "verify everything."
4. **Maintain CLAUDE.md as the living source of truth.** The existing CLAUDE.md
   is genuinely good and reflects the real codebase. Update it as the
   architecture changes — every "Critical rule — do NOT break this" entry that
   gets superseded by the refactor should be updated, not silently abandoned.
5. **Resume App Store and BYOB work only after step 1 is complete.**

---

## What NOT to do (until architecture is decided)

- Do NOT start the Capacitor wrap.
- Do NOT submit to the App Store or Play Store.
- Do NOT enable RLS on individual tables piecemeal — RLS without a proper auth
  flow will lock the app out of its own data. RLS and auth migration must
  happen together.
- Do NOT advertise iLab publicly or take on non-UIUC users yet.
- Do NOT add new features to the existing custom-auth codebase that will make
  the eventual Auth-migration harder. Bug fixes and small UI changes are fine;
  new tables, new auth flows, new admin paths are not.

---

## Files generated during this conversation (for reference)

These were created as scaffolds/examples in the chat. They are NOT in the
real iLab repo and should be treated as design references, not drop-in code:

- `ilab/src/config/configStore.ts` — Zustand BYOB config store
- `ilab/src/lib/supabase.ts` — lazy Supabase client factory
- `ilab/src/lib/validation.ts` — URL + JWT validators (rejects service_role keys)
- `ilab/src/lib/probe.ts` — workspace health/schema probe
- `ilab/src/screens/Setup/SetupScreen.tsx` — first-launch credential entry
- `ilab/src/sql/bootstrap.sql` — minimal `_ilab_meta` schema with RLS
- `ilab/src/App.tsx` — example shell routing between Setup/Auth/Main

The real iLab codebase is JavaScript (not TypeScript), uses the patterns
documented in the existing CLAUDE.md, and has 20K+ lines of production logic
that must be preserved through any refactor.

---

## How to use this file with Claude Code

Drop this file at the root of the iLab repo as `HANDOFF.md` (sibling to
CLAUDE.md). When starting a new Claude Code session, the model will read both:

- `CLAUDE.md` — what the project IS (current architecture, rules, conventions)
- `HANDOFF.md` — where the project is GOING (open decisions, planned work)

When the architecture decision is made and the security refactor is complete,
update CLAUDE.md to reflect the new state and delete or archive this HANDOFF.md.
