# LabHive Provenance Kit

This kit helps you keep a dated, evidence-backed record that LabHive was
built independently by you — useful if anyone ever claims you copied their
product, and separately useful as backup documentation around the OTM
assignment (which is scoped to the codebase as of June 2, 2026).

**Important limitation:** this kit works from your local git repository. It
cannot retrieve or reconstruct past Claude Code conversations — those live in
Claude Code's own session storage, which isn't accessible from here. Use
`LABHIVE_AI_BUILD_LOG.md` to manually log sessions going forward; it won't recover
history you haven't already saved elsewhere.

## What's included

1. **labhive_provenance_generate.sh** — run this from your repo root any time you
   want a snapshot. It creates a zip containing:
   - Full commit history (every commit, author, date, message)
   - A compact one-line-per-commit summary
   - A list of all git tags (including your `otm-version` tag)
   - Current file structure
   - A zipped snapshot of the current codebase
   - Repo metadata (branch, current commit hash, remote URL)
   - Your LABHIVE_AI_BUILD_LOG.md, if present

2. **labhive_provenance_hook_setup.sh** — optional. Installs a lightweight git hook
   that reminds you to run the snapshot periodically. Does not auto-run the
   full snapshot on every commit (that's usually overkill).

3. **LABHIVE_AI_BUILD_LOG.md** — a template file to manually log significant AI-assisted
   build sessions over time (what you asked for, what changed, which commits
   it relates to). Keep this in your repo root going forward.

## Setup (one-time)

**Mac (Terminal) or Windows (Git Bash):**

```bash
cd ~/Desktop/labhive        # Mac
# or
cd /c/Users/motlagh/labhive # Windows, Git Bash path style

# Copy these three files into your repo root:
#   labhive_provenance_generate.sh
#   labhive_provenance_hook_setup.sh
#   LABHIVE_AI_BUILD_LOG.md

chmod +x labhive_provenance_generate.sh labhive_provenance_hook_setup.sh

# Optional: install the commit-reminder hook
bash labhive_provenance_hook_setup.sh
```

## Ongoing use

Run this whenever you want an updated snapshot — recommended after any
significant design change, new feature, or roughly every 1-2 weeks:

```bash
bash labhive_provenance_generate.sh
```

This produces a zip file named like `LabHive_Provenance_2026-07-25_143000.zip`
one directory ABOVE your repo (so it's never accidentally committed or
pushed to GitHub). Move each one to an external drive and/or cloud backup —
don't rely on a single local copy.

Before each snapshot, take 2 minutes to add an entry to `LABHIVE_AI_BUILD_LOG.md`
describing what you built or changed since the last entry.

## Why this matters

- **Git history** with real timestamps is hard-to-fake evidence of when code
  was written and by whom.
- **The `otm-version` tag** (if you created it per our earlier conversation)
  marks the exact state of the code UIUC's assignment covers — keep this
  snapshot process going so you always have a clear "before assignment" /
  "after assignment" record.
- **LABHIVE_AI_BUILD_LOG.md** adds the missing piece git can't show on its own: your
  own intent and direction behind the code, which supports independent
  origination if anyone ever raises an "idea theft" claim (a legally weak
  claim to begin with, but good documentation makes it a non-starter).

This is a personal record-keeping tool, not a legal filing. It doesn't
replace registering a trademark for the LabHive name/logo, or having a
lawyer review anything with real stakes attached.
