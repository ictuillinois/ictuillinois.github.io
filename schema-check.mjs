import { createClient } from '@supabase/supabase-js'

const SOURCE = createClient(
  'https://odipiepbhnabcdjofgfc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kaXBpZXBiaG5hYmNkam9mZ2ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMTEzNzQsImV4cCI6MjA5MDg4NzM3NH0.lVvAgU3s1HHJiUi_Nwk2TLhA7bAgyiR_PDXYQcxJgtc'
)

const TABLES = [
  'settings','users','solo_users','rooms','supplies','projects',
  'project_materials','project_supplies','equipment_categories',
  'equipment_inventory','equipment_details','equipment_videos',
  'equipment_sop','equipment_standards','equipment_exam_questions',
  'equipment_bookings','storage_locations','student_lockers',
  'training_fresh','training_building_alarm','tasks','meetings',
  'task_comments','user_dashboard_prefs','user_screen_access',
]

for (const table of TABLES) {
  const { data, error } = await SOURCE.from(table).select('*').limit(1)
  if (error) {
    console.log(`❌ ${table}: ${error.message}`)
  } else if (!data || data.length === 0) {
    console.log(`— ${table}: empty (no rows to infer schema)`)
  } else {
    const cols = Object.keys(data[0])
    console.log(`✅ ${table}: [${cols.join(', ')}]`)
  }
}
