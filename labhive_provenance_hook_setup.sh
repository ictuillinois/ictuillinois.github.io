#!/bin/bash
# OPTIONAL: Installs a git hook that reminds you to run the provenance
# script after every commit. It does NOT auto-run the full snapshot
# (that would slow down every commit) — it just prints a reminder.
#
# If you want it to run automatically and silently, see the commented
# alternative at the bottom of this file.
#
# Usage: run this ONCE from your repo root:
#   bash labhive_provenance_hook_setup.sh

set -e

if [ ! -d ".git" ]; then
  echo "ERROR: Run this from the ROOT of your labhive repo (where .git lives)."
  exit 1
fi

HOOK_FILE=".git/hooks/post-commit"

cat > "$HOOK_FILE" << 'EOF'
#!/bin/bash
echo ""
echo "📌 Reminder: run 'bash labhive_provenance_generate.sh' periodically to keep"
echo "   your provenance documentation up to date (e.g. weekly, or after"
echo "   major feature changes) — not required after every single commit."
echo ""
EOF

chmod +x "$HOOK_FILE"
echo "Installed reminder hook at $HOOK_FILE"
echo ""
echo "NOTE: Running the full snapshot script after every commit is usually"
echo "overkill and slows you down. Recommended cadence: weekly, or after"
echo "any significant design/feature change — not every commit."
echo ""
echo "If you truly want it fully automatic on every commit instead, replace"
echo "the contents of $HOOK_FILE with:"
echo '  bash labhive_provenance_generate.sh'
echo "(uncomment/edit as needed)"
