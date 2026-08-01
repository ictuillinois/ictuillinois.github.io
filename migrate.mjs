import { createClient } from '@supabase/supabase-js'

const SOURCE = createClient(
  'YOUR_SOURCE_SUPABASE_URL',
  'YOUR_SOURCE_SUPABASE_KEY'
)

const DEST = createClient(
  'YOUR_DEST_SUPABASE_URL',
  'YOUR_DEST_SUPABASE_KEY'
)

// Per-table conflict column (defaults to 'id')
const CONFLICT_KEY = {
  settings:                    'key',
  solo_users:                  'email',
  users:                       'email',
  equipment_material_progress: 'user_id,equipment_id',
  equipment_temp_access:       'user_id,equipment_id',
  notification_prefs:          'user_id',
}

// Order matters: parent tables before child tables (foreign keys)
const TABLES = [
  'settings',
  'users',
  'solo_users',
  'rooms',
  'supplies',
  'inspections',
  'projects',
  'project_materials',
  'project_supplies',
  'project_files',
  'equipment_categories',
  'equipment_inventory',
  'equipment_list',
  'equipment_details',
  'equipment_videos',
  'equipment_sop',
  'equipment_sop_notes',
  'equipment_standards',
  'equipment_exam_questions',
  'equipment_exam_results',
  'equipment_material_progress',
  'equipment_temp_access',
  'equipment_bookings',
  'equipment_booking_settings',
  'booking_notifications',
  're_messages',
  'storage_locations',
  'student_lockers',
  'training_fresh',
  'training_golf_car',
  'training_building_alarm',
  'training_equipment',
  'training_schedule',
  'retraining_requests',
  'tasks',
  'meetings',
  'messages',
  'task_comments',
  'notifications',
  'notification_prefs',
  'user_dashboard_prefs',
  'user_screen_access',
  'test_result_entries',
]

async function migrateTable(table) {
  // Fetch all rows in pages of 1000
  let allRows = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await SOURCE.from(table).select('*').range(from, from + PAGE - 1)
    if (error) {
      console.log(`  ⚠️  ${table}: skipped (${error.message})`)
      return
    }
    if (!data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }

  if (allRows.length === 0) {
    console.log(`  —  ${table}: empty`)
    return
  }

  // Insert in batches of 500 to avoid request size limits
  const BATCH = 500
  let inserted = 0
  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH)
    const conflictCol = CONFLICT_KEY[table] ?? 'id'
    const { error } = await DEST.from(table).upsert(batch, { onConflict: conflictCol, ignoreDuplicates: true })
    if (error) {
      console.error(`  ❌  ${table}: insert failed — ${error.message}`)
      return
    }
    inserted += batch.length
  }
  console.log(`  ✅  ${table}: ${inserted} rows copied`)
}

console.log('Starting migration from lab-inventory → pro-ilab...\n')
for (const table of TABLES) {
  await migrateTable(table)
}
console.log('\nDone. Check above for any ❌ errors or ⚠️ skipped tables.')
console.log('Storage files (icon images) must be re-uploaded manually in pro-ilab Supabase Storage.')
