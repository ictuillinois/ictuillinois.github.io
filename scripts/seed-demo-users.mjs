// Seed 10 demo lab users for the Demo organization.
// Run: node scripts/seed-demo-users.mjs
//
// PREREQUISITE: In Supabase Dashboard → Authentication → Settings
//   disable "Enable email confirmations" so signUp works without email links.
//
// All demo users share the password: LabDemo@2025

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qhsxtpywfczqopcimykk.supabase.co'
const SUPABASE_KEY = 'sb_publishable_eXj0rGtAqMRX2Q3B9kgc1w_CE8rzWei'
const DEMO_PASSWORD = 'LabDemo@2025'

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// ── Demo user data ──────────────────────────────────────────────────────────
const STUDENTS = [
  { firstName: 'Emma',    lastName: 'Johnson',   email: 'emma.johnson@demo.ictlab.app',   supervisor: 'Prof. James Carter',   year: '2nd Year / Fall 2025',   nickname: 'Emma' },
  { firstName: 'Liam',    lastName: 'Martinez',  email: 'liam.martinez@demo.ictlab.app',  supervisor: 'Prof. Sarah Kim',      year: '1st Year / Fall 2025',   nickname: 'Liam' },
  { firstName: 'Olivia',  lastName: 'Chen',      email: 'olivia.chen@demo.ictlab.app',    supervisor: 'Prof. James Carter',   year: '3rd Year / Spring 2025', nickname: 'Olivia' },
  { firstName: 'Noah',    lastName: 'Patel',     email: 'noah.patel@demo.ictlab.app',     supervisor: 'Prof. Sarah Kim',      year: '2nd Year / Spring 2025', nickname: 'Noah' },
  { firstName: 'Ava',     lastName: 'Thompson',  email: 'ava.thompson@demo.ictlab.app',   supervisor: 'Prof. Robert Lee',     year: '1st Year / Fall 2025',   nickname: 'Ava' },
  { firstName: 'Ethan',   lastName: 'Williams',  email: 'ethan.williams@demo.ictlab.app', supervisor: 'Prof. Robert Lee',     year: '3rd Year / Fall 2025',   nickname: 'Ethan' },
  { firstName: 'Sophia',  lastName: 'Brown',     email: 'sophia.brown@demo.ictlab.app',   supervisor: 'Prof. James Carter',   year: '2nd Year / Fall 2025',   nickname: 'Sophia' },
  { firstName: 'Mason',   lastName: 'Davis',     email: 'mason.davis@demo.ictlab.app',    supervisor: 'Prof. Sarah Kim',      year: '1st Year / Spring 2025', nickname: 'Mason' },
  { firstName: 'Isabella','lastName': 'Wilson',  email: 'isabella.wilson@demo.ictlab.app',supervisor: 'Prof. Robert Lee',     year: '4th Year / Fall 2025',   nickname: 'Bella' },
  { firstName: 'James',   lastName: 'Garcia',    email: 'james.garcia@demo.ictlab.app',   supervisor: 'Prof. James Carter',   year: '3rd Year / Spring 2025', nickname: 'James' },
]

// Modules visible on each student's dashboard
const STUDENT_MODULES = [
  'dashboard', 'projects', 'training', 'equipmenthub',
  'booking', 'remessages', 'pm', 'home', 'equipment', 'profile',
]

// Sample tasks per student (cycled)
const TASK_TEMPLATES = [
  { title: 'Calibrate spectrometer', priority: 'high',   status: 'in_progress', progress: 45, deadline_offset: 5  },
  { title: 'Submit weekly progress report', priority: 'medium', status: 'todo', progress: 0, deadline_offset: 2 },
  { title: 'Review SOP for centrifuge', priority: 'low',  status: 'done',       progress: 100, deadline_offset: -3 },
  { title: 'Prepare samples for analysis', priority: 'high', status: 'in_progress', progress: 60, deadline_offset: 7 },
  { title: 'Document experimental results', priority: 'medium', status: 'todo', progress: 0, deadline_offset: 10 },
]

function addDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

async function main() {
  // ── 1. Find demo org ────────────────────────────────────────────────────
  const { data: orgs, error: orgErr } = await sb.from('organizations').select('id, name').ilike('name', '%demo%')
  if (orgErr || !orgs?.length) { console.error('Demo org not found:', orgErr); process.exit(1) }
  const demoOrg = orgs[0]
  console.log(`✓ Demo org: "${demoOrg.name}" (${demoOrg.id})`)

  // ── 2. Find or create a demo project ────────────────────────────────────
  const { data: projects } = await sb.from('projects').select('id, name').eq('organization_id', demoOrg.id).limit(3)
  let projectIds = (projects || []).map(p => p.id)

  if (!projectIds.length) {
    console.log('  No projects found — creating demo projects...')
    const demoProjects = [
      { name: 'Material Characterization Study', organization_id: demoOrg.id, login_mode: 'team' },
      { name: 'Environmental Monitoring Project', organization_id: demoOrg.id, login_mode: 'team' },
      { name: 'Biomechanics Research Initiative', organization_id: demoOrg.id, login_mode: 'team' },
    ]
    for (const proj of demoProjects) {
      const { data: p } = await sb.from('projects').insert(proj).select('id').single()
      if (p) { projectIds.push(p.id); console.log(`  Created project: ${proj.name}`) }
    }
  } else {
    console.log(`✓ Using ${projectIds.length} existing project(s)`)
  }

  // ── 3. Save admin session so we can restore it after each signUp ─────────
  const { data: { session: adminSession } } = await sb.auth.getSession()

  // ── 4. Create each student ───────────────────────────────────────────────
  for (let i = 0; i < STUDENTS.length; i++) {
    const s = STUDENTS[i]
    console.log(`\n[${i + 1}/10] Creating ${s.firstName} ${s.lastName}…`)

    // Check if already exists
    const { data: existing } = await sb.from('users').select('id').eq('phone', s.email).eq('organization_id', demoOrg.id).maybeSingle()
    if (existing) { console.log(`  ⚠  Already exists — skipping`); continue }

    // Create Supabase auth user
    let authId = null
    try {
      const { data: authData, error: authErr } = await sb.auth.signUp({ email: s.email, password: DEMO_PASSWORD })
      if (adminSession) await sb.auth.setSession({ access_token: adminSession.access_token, refresh_token: adminSession.refresh_token })
      if (authErr) {
        console.warn(`  ⚠  Auth signUp failed (${authErr.message}) — user will need manual auth setup`)
      } else {
        authId = authData.user?.id || null
        console.log(`  ✓ Auth account: ${s.email}`)
      }
    } catch (e) {
      console.warn(`  ⚠  signUp exception: ${e.message}`)
    }

    // Insert into users table
    // Note: DB schema uses name=lastName, email=firstName, phone=actualEmail (legacy layout)
    const assignedProjects = projectIds.length
      ? [projectIds[i % projectIds.length], ...(projectIds[(i + 1) % projectIds.length] ? [projectIds[(i + 1) % projectIds.length]] : [])].slice(0, 2)
      : []

    const { data: newUser, error: insertErr } = await sb.from('users').insert({
      name:                  s.lastName,
      email:                 s.firstName,
      phone:                 s.email,
      degree:                s.supervisor,
      year_semester:         s.year,
      nickname:              s.nickname,
      organization_id:       demoOrg.id,
      role:                  'student',
      is_active:             true,
      admin_level:           0,
      pin:                   '',
      auth_id:               authId,
      assigned_project_ids:  assignedProjects,
      must_change_password:  false,    // demo — skip forced password change
      terms_accepted_version: 2,       // demo — skip terms modal so the demo flows cleanly
    }).select('id').single()

    if (insertErr) { console.error(`  ✗ Insert failed: ${insertErr.message}`); continue }
    const userId = newUser.id
    console.log(`  ✓ User record: ${userId}`)

    // Dashboard prefs
    await sb.from('user_dashboard_prefs').upsert({
      user_id:         userId,
      active_modules:  STUDENT_MODULES,
      allowed_modules: STUDENT_MODULES,
      has_set_dashboard: true,
    }, { onConflict: 'user_id' })
    console.log(`  ✓ Dashboard icons set`)

    // Screen access (grant standard student screens)
    const screens = ['projects', 'training', 'equipmenthub', 'booking', 'remessages', 'pm', 'home', 'equipment']
    await sb.from('user_screen_access').delete().eq('user_id', userId)
    if (screens.length) {
      await sb.from('user_screen_access').insert(screens.map(screen_key => ({ user_id: userId, screen_key })))
    }
    console.log(`  ✓ Screen access granted`)

    // Sample tasks
    const taskPayloads = TASK_TEMPLATES.map((t, ti) => ({
      title:           t.title,
      priority:        t.priority,
      status:          t.status,
      progress:        t.progress,
      deadline:        addDays(t.deadline_offset),
      start_date:      addDays(t.deadline_offset - 7),
      login_mode:      'team',
      organization_id: demoOrg.id,
      assigned_to:     userId,
      created_by:      userId,
      is_private:      false,
      is_meeting_task: false,
      notes:           '',
    }))
    await sb.from('tasks').insert(taskPayloads)
    console.log(`  ✓ ${taskPayloads.length} tasks created`)
  }

  console.log('\n✅ Done! All demo lab users created.')
  console.log(`   Login password for all demo users: ${DEMO_PASSWORD}`)
  console.log('   If auth signUp failed, go to Supabase Dashboard → Auth → Settings and disable email confirmation, then re-run.')
}

main().catch(e => { console.error(e); process.exit(1) })
