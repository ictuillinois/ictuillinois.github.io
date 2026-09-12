// Inserts the 6 missing screenshots into the HTML guide at the right locations
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS_DIR = path.join(__dirname, '../guide-screenshots')
const HTML_PATH  = path.join(__dirname, '../ictlab-lab-manager-guide.html')

function b64img(file, alt) {
  const p = path.join(SHOTS_DIR, file)
  if (!fs.existsSync(p)) { console.warn('MISSING:', file); return '' }
  const b64 = fs.readFileSync(p).toString('base64')
  return `<div class="ss-img"><img src="data:image/png;base64,${b64}" alt="${alt}" style="max-width:720px;width:100%;border-radius:8px;border:1px solid #cdd8ea;display:block;box-shadow:0 2px 12px rgba(0,0,0,0.10);"></div>`
}

let html = fs.readFileSync(HTML_PATH, 'utf8')

// 1. Safety Tab screenshot — insert before "Lab User Documents Tab" heading
html = html.replace(
  '<h3>📄 Lab User Documents Tab</h3>',
  b64img('08-training-safety.png', 'Training Safety Tab') + '\n\n<h3>📄 Lab User Documents Tab</h3>'
)

// 2. Meetings Tab screenshot — insert before "Reminders Tab" heading
html = html.replace(
  '<h3>Reminders Tab</h3>',
  b64img('17-tasks-meetings.png', 'Meetings Tab') + '\n\n<h3>Reminders Tab</h3>'
)

// 3. Rooms Management screenshot — look for the Managing Rooms section closing
//    Insert before the "Managing Supplies" heading
html = html.replace(
  '<h3>Managing Supplies</h3>',
  b64img('20-supply-rooms.png', 'Rooms Management') + '\n\n<h3>Managing Supplies</h3>'
)

// 4. My Info Tab screenshot — insert before "Dashboard Icons Tab" heading
html = html.replace(
  '<h3>Dashboard Icons Tab</h3>',
  b64img('25-profile.png', 'My Info Tab') + '\n\n<h3>Dashboard Icons Tab</h3>'
)

// 5. Dashboard Icons Tab screenshot — insert before "Notifications Tab" heading
html = html.replace(
  '<h3>Notifications Tab</h3>',
  b64img('27-profile-icons.png', 'Dashboard Icons Panel') + '\n\n<h3>Notifications Tab</h3>'
)

// 6. Notifications Tab screenshot — insert before "Storage Tab" heading
html = html.replace(
  '<h3>Storage Tab</h3>',
  b64img('26-profile-notifications.png', 'Notification Preferences') + '\n\n<h3>Storage Tab</h3>'
)

fs.writeFileSync(HTML_PATH, html, 'utf8')
console.log('✅ Inserted 6 missing screenshots')
console.log('→', HTML_PATH)
