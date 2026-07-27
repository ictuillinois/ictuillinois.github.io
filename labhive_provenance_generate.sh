#!/bin/bash
# LabHive Provenance Documentation Generator
#
# Purpose: creates a timestamped record of git history + current codebase state
# to help establish independent origination of LabHive, for your own records.
#
# Usage:
#   1. Place this script in the ROOT of your labhive git repo
#      (e.g. ~/Desktop/labhive or C:\Users\motlagh\labhive)
#   2. Run it from that folder:
#        bash labhive_provenance_generate.sh
#   3. It creates a dated zip file one level ABOVE your repo folder,
#      so it never gets committed into git by accident.
#
# Works on Mac (Terminal) and Windows (Git Bash).

set -e

# --- Config ---
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
DATE_HUMAN=$(date +"%Y-%m-%d")
OUTPUT_DIR="../labhive_provenance_${TIMESTAMP}"
ZIP_NAME="../LabHive_Provenance_${TIMESTAMP}.zip"

# --- Sanity check: are we in a git repo? ---
if [ ! -d ".git" ]; then
  echo "ERROR: No .git folder found here."
  echo "Run this script from the ROOT of your labhive repo (where .git lives)."
  exit 1
fi

echo "Generating LabHive provenance snapshot..."
mkdir -p "$OUTPUT_DIR"

# --- 1. Full commit log with timestamps, authors, and messages ---
echo "  - Exporting full git commit history..."
git log --all --date=iso --pretty=format:"Commit: %H%nAuthor: %an <%ae>%nDate: %ad%nMessage: %s%n%n%b%n-------------------------------------------%n" \
  > "$OUTPUT_DIR/full_commit_history.txt"

# --- 2. Compact one-line-per-commit summary (easy to skim) ---
echo "  - Exporting compact commit summary..."
git log --all --date=short --pretty=format:"%ad | %h | %an | %s" \
  > "$OUTPUT_DIR/commit_summary.txt"

# --- 3. List of all tags (e.g. your otm-version tag) with dates ---
echo "  - Exporting tag list..."
git for-each-ref --sort=creatordate --format '%(creatordate:iso) | %(refname:short) | %(subject)' refs/tags \
  > "$OUTPUT_DIR/tags.txt" 2>/dev/null || echo "No tags found." > "$OUTPUT_DIR/tags.txt"

# --- 4. Current file tree (structure of the app today) ---
echo "  - Exporting current file structure..."
if command -v tree >/dev/null 2>&1; then
  tree -I 'node_modules|.git|docs' > "$OUTPUT_DIR/file_structure.txt"
else
  find . -path ./node_modules -prune -o -path ./.git -prune -o -print \
    | sed 's|[^/]*/|  |g' > "$OUTPUT_DIR/file_structure.txt"
fi

# --- 5. Snapshot of the CURRENT working code (zipped separately inside) ---
echo "  - Archiving current codebase snapshot..."
git archive --format=zip --output="$OUTPUT_DIR/codebase_snapshot_${TIMESTAMP}.zip" HEAD

# --- 6. Repo metadata: remote URL, branch, current commit hash ---
echo "  - Recording repo metadata..."
{
  echo "Snapshot generated: $(date)"
  echo "Current branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "Current commit: $(git rev-parse HEAD)"
  echo "Remote(s):"
  git remote -v
} > "$OUTPUT_DIR/repo_metadata.txt"

# --- 7. Copy the prompt log template if present, otherwise note it's missing ---
if [ -f "LABHIVE_AI_BUILD_LOG.md" ]; then
  cp "LABHIVE_AI_BUILD_LOG.md" "$OUTPUT_DIR/LABHIVE_AI_BUILD_LOG.md"
else
  echo "No LABHIVE_AI_BUILD_LOG.md found in repo root. See the template provided separately." \
    > "$OUTPUT_DIR/LABHIVE_AI_BUILD_LOG_MISSING.txt"
fi

# --- 8. Zip the whole output folder ---
echo "  - Creating final zip archive..."
cd ..
REPO_FOLDER_NAME=$(basename "$OLDPWD")
zip -r -q "LabHive_Provenance_${TIMESTAMP}.zip" "$(basename "$OUTPUT_DIR")"
cd - > /dev/null

echo ""
echo "Done. Provenance snapshot created:"
echo "  ../LabHive_Provenance_${TIMESTAMP}.zip"
echo ""
echo "Store this outside your repo (external drive + cloud backup recommended)."
