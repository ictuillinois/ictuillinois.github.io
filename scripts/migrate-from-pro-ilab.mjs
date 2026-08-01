/**
 * migrate-from-pro-ilab.mjs
 *
 * Copies all ICT lab data from pro-ilab Supabase → ilab Supabase,
 * stamping every team table row with organization_id = ICT_ORG_UUID.
 *
 * Usage:  node scripts/migrate-from-pro-ilab.mjs
 */

import { createClient } from '@supabase/supabase-js'

const ICT_ORG_UUID = '5bab5b33-fff9-4a4a-b617-3dac179f9678'

const SRC = createClient(
  'https://lxjudxjcxhrynnlxodtg.supabase.co',
  'sb_publishable__xMbRgZhwKSq_7qKi3KGJg_6AJkaR7A'
)

const DST = createClient(
  'https://qhsxtpywfczqopcimykk.supabase.co',
  'sb_publishable_eXj0rGtAqMRX2Q3B9kgc1w_CE8rzWei'
)

// ── Helpers ────────────────────────────────────────────────────────────────

function pick(obj, keys) {
  const out = {}
  for (const k of keys) if (k in obj) out[k] = obj[k]
  return out
}

async function fetchAll(table) {
  let rows = [], from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await SRC.from(table).select('*').range(from, from + PAGE - 1)
    if (error) { console.log(`  ⚠️  ${table}: read failed (${error.message})`); return null }
    if (!data?.length) break
    rows = rows.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

async function upsertBatches(table, rows, conflictCol = 'id') {
  if (!rows.length) { console.log(`  —  ${table}: 0 rows`); return }
  const BATCH = 500
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await DST.from(table).upsert(rows.slice(i, i + BATCH), {
      onConflict: conflictCol,
      ignoreDuplicates: true,
    })
    if (error) { console.error(`  ❌  ${table}: write failed — ${error.message}`); return }
    total += rows.slice(i, i + BATCH).length
  }
  console.log(`  ✅  ${table}: ${total} rows`)
}

function addOrg(rows) {
  return rows.map(r => ({ ...r, organization_id: ICT_ORG_UUID }))
}

// ── Migration ──────────────────────────────────────────────────────────────

console.log(`\nMigrating pro-ilab → ilab (ICT org: ${ICT_ORG_UUID})\n`)

// ── settings (global, no org_id, use key as conflict) ─────────────────────
{
  const rows = await fetchAll('settings')
  if (rows) {
    const clean = rows.map(r => pick(r, ['id','key','value','created_at']))
    await upsertBatches('settings', clean, 'key')
  }
}

// ── users ──────────────────────────────────────────────────────────────────
{
  const rows = await fetchAll('users')
  if (rows) {
    const clean = addOrg(rows.map(r => ({
      ...pick(r, ['id','name','last_name','email','phone','password','pin',
                  'role','is_active','admin_level','degree','year_semester',
                  'supervisor','project_group','photo_url','avatar','created_at']),
      // avatar_url column (old name) → photo_url if photo_url not set
      photo_url: r.photo_url || r.avatar_url || null,
      must_change_password: false,
      organization_id: ICT_ORG_UUID,
    })))
    await upsertBatches('users', clean, 'id')
  }
}

// ── solo_users (no org_id) ─────────────────────────────────────────────────
{
  const rows = await fetchAll('solo_users')
  if (rows) {
    const clean = rows.map(r =>
      pick(r, ['id','name','email','password','is_active',
               'active_modules','has_set_dashboard','photo_url','created_at'])
    )
    await upsertBatches('solo_users', clean, 'id')
  }
}

// ── rooms ──────────────────────────────────────────────────────────────────
{
  const rows = await fetchAll('rooms')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      pick(r, ['id','name','icon','photo_url','created_at'])
    ))
    await upsertBatches('rooms', clean, 'id')
  }
}

// ── supplies ───────────────────────────────────────────────────────────────
{
  const rows = await fetchAll('supplies')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      pick(r, ['id','room_id','name','unit','min_qty','qty','notes','photo_url','created_at'])
    ))
    await upsertBatches('supplies', clean, 'id')
  }
}

// ── inspections ────────────────────────────────────────────────────────────
{
  const rows = await fetchAll('inspections')
  if (rows) {
    const clean = addOrg(rows.map(r => ({
      id: r.id,
      room_id: r.room_id,
      room_name: r.room_name,
      inspector: r.inspector || r.inspected_by || null,
      inspected_at: r.inspected_at || r.inspection_date || r.created_at,
      flag_count: r.flag_count ?? 0,
      results: r.results || r.items || null,
      created_at: r.created_at,
      organization_id: ICT_ORG_UUID,
    })))
    await upsertBatches('inspections', clean, 'id')
  }
}

// ── projects ───────────────────────────────────────────────────────────────
{
  const rows = await fetchAll('projects')
  if (rows) {
    const clean = addOrg(rows.map(r => ({
      id: r.id,
      name: r.name || r.project_name || null,
      project_id: r.project_id || null,
      cfop: r.cfop || null,
      status: r.status || 'active',
      pi_user_id: r.pi_user_id || null,
      student_ids: r.student_ids || null,
      sampling_date: r.sampling_date || null,
      storage_date: r.storage_date || null,
      notes: r.notes || null,
      created_at: r.created_at,
      organization_id: ICT_ORG_UUID,
    })))
    await upsertBatches('projects', clean, 'id')
  }
}

// ── project_materials ──────────────────────────────────────────────────────
{
  const rows = await fetchAll('project_materials')
  if (rows) {
    const clean = rows.map(r =>
      pick(r, ['id','project_id','material_type','barcode',
               'source_type','source_name','source_location',
               'aggregate_source','agg_nmas','agg_sieve_sizes','agg_raw_or_rap',
               'asphalt_source','ab_binder_pg','ab_mix_design','ab_has_polymer',
               'ab_polymer_info','ab_other_additives','pm_mix_design','pm_nmas',
               'pm_binder_pg','other_info','qty_total','qty_unit',
               'container_type','container_color','container_count','container_other',
               'locations','sampling_date','photos','barcode_id','barcode_scanned_at',
               'storage_confirmed','storage_notes','notes','date_received','qty','created_at'])
    )
    await upsertBatches('project_materials', clean, 'id')
  }
}

// ── project_files → project_record_files ──────────────────────────────────
{
  const rows = await fetchAll('project_files')
  if (rows) {
    const clean = rows.map(r =>
      pick(r, ['id','project_id','name','url','file_type','uploaded_by','created_at'])
    )
    await upsertBatches('project_record_files', clean, 'id')
  }
}

// ── test_result_entries ────────────────────────────────────────────────────
{
  const rows = await fetchAll('test_result_entries')
  if (rows) {
    const clean = rows.map(r =>
      pick(r, ['id','project_id','title','value','unit','notes','submitted_by','created_at'])
    )
    await upsertBatches('test_result_entries', clean, 'id')
  }
}

// ── storage_locations ──────────────────────────────────────────────────────
{
  const rows = await fetchAll('storage_locations')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      pick(r, ['id','name','location_id','location_label','facility',
               'occupied','project_id','material_id','project_name',
               'material_type','occupied_at','occupied_by','created_at'])
    ))
    await upsertBatches('storage_locations', clean, 'id')
  }
}

// ── equipment_categories ───────────────────────────────────────────────────
{
  const rows = await fetchAll('equipment_categories')
  if (rows) {
    const clean = addOrg(rows.map(r => pick(r, ['id','name','created_at'])))
    await upsertBatches('equipment_categories', clean, 'id')
  }
}

// ── equipment_inventory ────────────────────────────────────────────────────
{
  const rows = await fetchAll('equipment_inventory')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      pick(r, ['id','equipment_name','nickname','category','location','ref_id',
               'model_number','serial_number','manufacturer','date_received',
               'condition','notes','photo_url','is_active','out_of_service',
               'assigned_to','max_usage_hours','usage_hours_since_maintenance',
               'maintenance_interval_days','last_maintenance_date','next_maintenance_date',
               'created_at'])
    ))
    await upsertBatches('equipment_inventory', clean, 'id')
  }
}

// ── equipment child tables (no org_id needed) ──────────────────────────────
for (const [table, cols] of [
  ['equipment_details',   ['id','equipment_id','photo_url','website_url','notes','created_at']],
  ['equipment_videos',    ['id','equipment_id','title','video_url','description','created_at']],
  ['equipment_sop',       ['id','equipment_id','title','pdf_url','steps','created_at']],
  ['equipment_sop_notes', ['id','equipment_id','user_id','user_name','note','created_at']],
  ['equipment_standards', ['id','equipment_id','standard_type','standard_number',
                            'standard_name','file_url','link_url','created_at']],
]) {
  const rows = await fetchAll(table)
  if (rows) {
    const clean = rows.map(r => pick(r, cols))
    await upsertBatches(table, clean, 'id')
  }
}

// ── equipment_exam_questions (separate option columns) ─────────────────────
{
  const rows = await fetchAll('equipment_exam_questions')
  if (rows) {
    const clean = rows.map(r => ({
      id: r.id,
      equipment_id: r.equipment_id,
      question: r.question,
      option_a: r.option_a || (Array.isArray(r.options) ? r.options[0] : null),
      option_b: r.option_b || (Array.isArray(r.options) ? r.options[1] : null),
      option_c: r.option_c || (Array.isArray(r.options) ? r.options[2] : null),
      option_d: r.option_d || (Array.isArray(r.options) ? r.options[3] : null),
      correct_answer: r.correct_answer,
      order_num: r.order_num || null,
      created_at: r.created_at,
    }))
    await upsertBatches('equipment_exam_questions', clean, 'id')
  }
}

// ── equipment_exam_results ─────────────────────────────────────────────────
{
  const rows = await fetchAll('equipment_exam_results')
  if (rows) {
    const clean = addOrg(rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      equipment_id: r.equipment_id,
      score: r.score,
      passed: r.passed,
      created_at: r.created_at || r.taken_at,
      organization_id: ICT_ORG_UUID,
    })))
    await upsertBatches('equipment_exam_results', clean, 'id')
  }
}

// ── equipment_material_progress (composite PK) ─────────────────────────────
{
  const rows = await fetchAll('equipment_material_progress')
  if (rows) {
    const clean = rows.map(r =>
      pick(r, ['user_id','equipment_id','downloaded_sop','watched_video','updated_at'])
    ).map(r => ({ ...r, organization_id: ICT_ORG_UUID }))
    await upsertBatches('equipment_material_progress', clean, 'user_id,equipment_id')
  }
}

// ── equipment_temp_access (composite PK) ───────────────────────────────────
{
  const rows = await fetchAll('equipment_temp_access')
  if (rows) {
    const clean = rows.map(r =>
      pick(r, ['user_id','equipment_id','granted_by','granted_at','expires_at'])
    ).map(r => ({ ...r, organization_id: ICT_ORG_UUID }))
    await upsertBatches('equipment_temp_access', clean, 'user_id,equipment_id')
  }
}

// ── equipment_bookings ─────────────────────────────────────────────────────
{
  const rows = await fetchAll('equipment_bookings')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      // ilab has no 'purpose' column — it was removed in the new schema
      pick(r, ['id','equipment_id','user_id','user_name','title',
               'start_time','end_time','notes','status',
               'requires_approval','denied_by','denied_reason',
               'booked_on_behalf_of','created_by','created_at'])
    ))
    await upsertBatches('equipment_bookings', clean, 'id')
  }
}

// ── equipment_booking_settings ─────────────────────────────────────────────
{
  const rows = await fetchAll('equipment_booking_settings')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      pick(r, ['id','equipment_id','requires_approval'])
    ))
    await upsertBatches('equipment_booking_settings', clean, 'id')
  }
}

// ── booking_notifications ──────────────────────────────────────────────────
{
  const rows = await fetchAll('booking_notifications')
  if (rows) {
    const clean = rows.map(r =>
      pick(r, ['id','booking_id','user_id','type','message','read','created_at'])
    )
    await upsertBatches('booking_notifications', clean, 'id')
  }
}

// ── retraining_requests ────────────────────────────────────────────────────
{
  const rows = await fetchAll('retraining_requests')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      pick(r, ['id','user_id','user_name','equipment_id','status','created_at'])
    ))
    await upsertBatches('retraining_requests', clean, 'id')
  }
}

// ── re_messages ────────────────────────────────────────────────────────────
{
  const rows = await fetchAll('re_messages')
  if (rows) {
    // ilab uses sender_id/sender_name/receiver_id; pro-ilab used user_id/user_name/receiver_id
    const clean = addOrg(rows.map(r => ({
      id: r.id,
      sender_id: r.sender_id || r.user_id || null,
      sender_name: r.sender_name || r.user_name || null,
      receiver_id: r.receiver_id || null,
      subject: r.subject || null,
      body: r.body || null,
      category: r.category || null,
      status: r.status || 'open',
      reply: r.reply || null,
      edited: r.edited || false,
      edited_at: r.edited_at || null,
      created_at: r.created_at,
      organization_id: ICT_ORG_UUID,
    })))
    await upsertBatches('re_messages', clean, 'id')
  }
}

// ── training tables ────────────────────────────────────────────────────────
{
  const rows = await fetchAll('training_fresh')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      pick(r, ['id','user_id','instructions_read','certificate_url','certificate_name',
               'certificate_uploaded_at','extra_files','admin_approved',
               'admin_approved_by','admin_approved_at','created_at'])
    ))
    await upsertBatches('training_fresh', clean, 'id')
  }
}
{
  const rows = await fetchAll('training_golf_car')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      pick(r, ['id','user_id','trained','trained_date','trained_by','created_at'])
    ))
    await upsertBatches('training_golf_car', clean, 'id')
  }
}
{
  const rows = await fetchAll('training_building_alarm')
  if (rows) {
    const clean = addOrg(rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      trained: r.trained,
      trained_date: r.trained_date,
      trained_by: r.trained_by,
      // ilab uses alarm_pin; pro-ilab used alarm_code
      alarm_pin: r.alarm_pin || r.alarm_code || null,
      created_at: r.created_at,
      organization_id: ICT_ORG_UUID,
    })))
    await upsertBatches('training_building_alarm', clean, 'id')
  }
}
{
  const rows = await fetchAll('training_equipment')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      pick(r, ['id','user_id','equipment_id','trained_date','trained_by',
               'passed_exam','expires_at','created_at'])
    ))
    await upsertBatches('training_equipment', clean, 'id')
  }
}
{
  const rows = await fetchAll('training_schedule')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      pick(r, ['id','title','date','notes','created_at'])
    ))
    await upsertBatches('training_schedule', clean, 'id')
  }
}

// ── student_lockers ────────────────────────────────────────────────────────
{
  const rows = await fetchAll('student_lockers')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      pick(r, ['id','user_id','locker_number','user_name','assigned_by','assigned_at','notes'])
    ))
    await upsertBatches('student_lockers', clean, 'id')
  }
}

// ── project management tables ──────────────────────────────────────────────
{
  const rows = await fetchAll('tasks')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      pick(r, ['id','title','notes','status','progress','start_date','deadline',
               'assigned_to','created_by','is_meeting_task','meeting_id','created_at'])
    ))
    await upsertBatches('tasks', clean, 'id')
  }
}
{
  const rows = await fetchAll('task_comments')
  if (rows) {
    const clean = rows.map(r =>
      pick(r, ['id','task_id','user_id','user_name','body','created_at'])
    )
    await upsertBatches('task_comments', clean, 'id')
  }
}
{
  const rows = await fetchAll('meetings')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      pick(r, ['id','date','notes','created_by','created_at'])
    ))
    await upsertBatches('meetings', clean, 'id')
  }
}
{
  const rows = await fetchAll('messages')
  if (rows) {
    const clean = addOrg(rows.map(r => ({
      id: r.id,
      user_id: r.user_id ? String(r.user_id) : null,
      user_name: r.user_name,
      body: r.body,
      // pro-ilab used sent_at; ilab uses created_at
      created_at: r.created_at || r.sent_at,
      organization_id: ICT_ORG_UUID,
    })))
    await upsertBatches('messages', clean, 'id')
  }
}

// ── notifications ──────────────────────────────────────────────────────────
{
  const rows = await fetchAll('notifications')
  if (rows) {
    // ilab notifications: user_id (text), message, type, read, link, created_at
    // No title or task_id columns
    const clean = addOrg(rows.map(r => ({
      id: r.id,
      user_id: r.user_id ? String(r.user_id) : null,
      type: r.type || null,
      message: r.message || r.body || r.title || null,
      read: r.read || false,
      link: r.link || null,
      created_at: r.created_at,
      organization_id: ICT_ORG_UUID,
    })))
    await upsertBatches('notifications', clean, 'id')
  }
}
{
  const rows = await fetchAll('notification_prefs')
  if (rows) {
    const clean = rows.map(r =>
      pick(r, ['id','user_id','booking_inapp','booking_email','training_inapp',
               'training_email','pm_inapp','pm_email','messages_inapp',
               'messages_email','created_at'])
    )
    await upsertBatches('notification_prefs', clean, 'id')
  }
}

// ── user_screen_access ─────────────────────────────────────────────────────
{
  const rows = await fetchAll('user_screen_access')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      pick(r, ['id','user_id','screen_key'])
    ))
    await upsertBatches('user_screen_access', clean, 'id')
  }
}

// ── user_dashboard_prefs ───────────────────────────────────────────────────
{
  const rows = await fetchAll('user_dashboard_prefs')
  if (rows) {
    const clean = addOrg(rows.map(r =>
      pick(r, ['id','user_id','active_modules','has_set_dashboard','allowed_modules','created_at'])
    ))
    await upsertBatches('user_dashboard_prefs', clean, 'id')
  }
}

console.log('\nMigration complete.')
console.log('Note: Supabase Storage files (equipment photos, SOPs, cert uploads) must be re-uploaded manually.')
