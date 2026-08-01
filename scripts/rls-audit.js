/*
 * RLS isolation audit — browser-console script (NOT SQL, NOT node).
 *
 * HOW TO RUN:
 *   1. Open the app (ictlab.app or localhost) and LOG IN as a lab user
 *      (role='student' or a lab manager) — NOT super admin (super admin
 *      legitimately sees everything, so it can't reveal a leak).
 *   2. Open DevTools → Console. If prompted, type "allow pasting" first.
 *   3. Paste this whole file and press Enter.
 *
 * WHAT IT PROVES:
 *   Reuses your logged-in Supabase session and reads every org-scoped table.
 *   Any ❌ LEAK line = that table's RLS policy is too loose (returns another
 *   org's rows). All ✅ + "PASS" = data is truly isolated, not just hidden in
 *   the UI. `organizations` and `users` are the key tells (they span all orgs).
 *
 * Re-run this after ANY schema change or rls_phase1.sql update.
 */
(async () => {
  const URL  = 'https://qhsxtpywfczqopcimykk.supabase.co'
  const ANON = 'sb_publishable_eXj0rGtAqMRX2Q3B9kgc1w_CE8rzWei'
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
  const sb = createClient(URL, ANON)                 // auto-restores your session from localStorage

  const { data: { session } } = await sb.auth.getSession()
  if (!session) return console.error('❌ No session in this client — make sure you are logged into the app in this tab.')
  const authId = session.user.id

  const { data: me } = await sb.from('users').select('id, organization_id, role').eq('auth_id', authId).maybeSingle()
  const myOrg = me?.organization_id
  console.log('%c── RLS isolation audit ──', 'font-weight:bold')
  console.log('auth uid:', authId, '| my org:', myOrg, '| role:', me?.role)
  if (!myOrg) console.warn('No org found for this user (solo account?). Org-scoping checks below only make sense for a team user.')

  const orgTables = [
    'users','equipment_inventory','equipment_categories','equipment_locations',
    'projects','rooms','supplies','inspections','meetings','tasks',
    're_messages','messages','training_schedule','retraining_requests',
    'floor_plans','student_lockers','feedback_responses','account_deletion_requests',
    'storage_locations','team_task_groups','equipment_booking_blocks'
  ]

  let leaks = 0
  for (const t of orgTables) {
    const { data, error } = await sb.from(t).select('organization_id').limit(2000)
    if (error) { console.log(`%c… ${t}: ${error.message}`, 'color:gray'); continue }
    const foreign = (data || []).filter(r => r.organization_id && r.organization_id !== myOrg)
    if (foreign.length) { leaks++; console.log(`%c❌ LEAK  ${t}: ${foreign.length}/${data.length} rows from OTHER orgs`, 'color:#c00;font-weight:bold') }
    else console.log(`%c✅ ${t}: ${data.length} rows, all mine`, 'color:#080')
  }

  {
    const { data } = await sb.from('organizations').select('id')
    const foreign = (data || []).filter(r => r.id !== myOrg)
    if (foreign.length) { leaks++; console.log(`%c❌ LEAK  organizations: sees ${foreign.length} other orgs`, 'color:#c00;font-weight:bold') }
    else console.log(`%c✅ organizations: only my own`, 'color:#080')
  }

  {
    const { data } = await sb.from('settings').select('key,value').in('key', ['admin_password','admin_email'])
    const exposed = (data || []).filter(r => r.value)
    if (exposed.length) { leaks++; console.log(`%c❌ LEAK  settings: can read ${exposed.map(r=>r.key).join(', ')}`, 'color:#c00;font-weight:bold') }
    else console.log(`%c✅ settings: admin_password / admin_email hidden`, 'color:#080')
  }

  console.log(leaks === 0
    ? '%c🎉 PASS — no cross-org data visible.'
    : `%c⚠️ ${leaks} table(s) leaking — send the ❌ lines to fix the policies.`,
    `font-weight:bold;color:${leaks===0?'#080':'#c00'}`)
})()
