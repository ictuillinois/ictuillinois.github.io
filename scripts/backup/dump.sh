#!/usr/bin/env bash
# Makes one complete backup package of the ICT-Lab Supabase project in <dir>:
#   roles.sql, schema.sql      the database structure
#   data.sql.gz                all data in public + auth (auth = logins, so
#                              everyone keeps their password after a restore)
#   cron_jobs.json             the scheduled jobs, for reference
#   row_counts.json            exact rows per table, checked after a restore
#   files/                     every Supabase Storage file + bucket settings
#   manifest.json              what is inside, and when it was made
# Needs: SUPABASE_DB_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, the supabase CLI, psql.
# Prints counts only — this repo's workflow logs are public.
set -euo pipefail
OUT="$1"
mkdir -p "$OUT"

supabase db dump --db-url "$SUPABASE_DB_URL" -f "$OUT/roles.sql" --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$OUT/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$OUT/data.sql" --use-copy --data-only --schema public,auth
gzip -9 "$OUT/data.sql"

psql "$SUPABASE_DB_URL" -At -v ON_ERROR_STOP=1 -f "$(dirname "$0")/counts.sql" > "$OUT/row_counts.json"
psql "$SUPABASE_DB_URL" -At -c "SELECT coalesce(json_agg(json_build_object('jobname', jobname, 'schedule', schedule, 'command', command)), '[]') FROM cron.job" > "$OUT/cron_jobs.json" 2>/dev/null || echo '[]' > "$OUT/cron_jobs.json"

node "$(dirname "$0")/storage.mjs" download "$OUT/files"

node -e '
const fs = require("fs"), path = require("path"), out = process.argv[1]
const rows = JSON.parse(fs.readFileSync(path.join(out, "row_counts.json"), "utf8"))
const files = JSON.parse(fs.readFileSync(path.join(out, "files/_totals.json"), "utf8"))
const size = f => fs.statSync(path.join(out, f)).size
const manifest = {
  app: "ICT-Lab", made_at: new Date().toISOString(), website_commit: process.env.GITHUB_SHA || null,
  tables: Object.keys(rows).length, rows_total: Object.values(rows).reduce((a, b) => a + Number(b), 0),
  auth_users: rows["auth.users"] ?? null, storage: files,
  bytes: { "schema.sql": size("schema.sql"), "data.sql.gz": size("data.sql.gz") },
  restore: "GitHub → Actions → Restore ICT-Lab → Run workflow, with this folder name as the week.",
}
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2))
console.log(`database: ${manifest.tables} tables, ${manifest.rows_total} rows, ${manifest.auth_users} logins`)
' "$OUT"
