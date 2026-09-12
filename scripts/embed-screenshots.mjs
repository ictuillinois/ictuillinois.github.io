// Reads guide-screenshots/*.png, converts to base64, replaces existing
// <img alt="TITLE"> src values (or .ss placeholder divs) in the HTML guide.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS_DIR = path.join(__dirname, '../guide-screenshots')
const HTML_PATH  = path.join(__dirname, '../ictlab-lab-manager-guide.html')

// Map: screenshot filename → the alt/title text it corresponds to
const MAP = [
  { file: '01-login.png',                  title: 'Login Page' },
  { file: '02-dashboard.png',              title: 'Dashboard — Module Grid' },
  { file: '03-labmanagement-users.png',    title: 'Lab Users Tab' },
  { file: '04-labmanagement-approvals.png',title: 'Approval Requests' },
  { file: '05-training-cards.png',         title: 'Training Records — User Card Grid' },
  { file: '06-training-user-open.png',     title: 'Training Records — Full User View with Inner Tabs' },
  { file: '07-training-documents.png',     title: 'Lab User Documents — Certificate Review' },
  { file: '08-training-safety.png',        title: 'Training Safety Tab' },
  { file: '09-equipment-list.png',         title: 'Equipment List' },
  { file: '10-equipment-maintenance.png',  title: 'Maintenance Records' },
  { file: '11-sop-hub.png',               title: 'Equipment SOP Hub — Equipment Detail Edit View' },
  { file: '13-booking-calendar.png',       title: 'Booking Calendar' },
  { file: '14-booking-special.png',        title: 'Special Treatment Note Editor' },
  { file: '15-tasks-mytasks.png',          title: 'My Tasks with Mini-Calendar' },
  { file: '16-tasks-calendar.png',         title: 'Calendar View' },
  { file: '17-tasks-meetings.png',         title: 'Meetings Tab' },
  { file: '18-supply-inspection.png',      title: 'Inspection — Item Count Entry' },
  { file: '19-supply-supplies.png',        title: 'Supplies — Room Grouping' },
  { file: '20-supply-rooms.png',           title: 'Rooms Management' },
  { file: '21-messages.png',               title: 'Lab Messages' },
  { file: '22-projects.png',               title: 'Project Workspace — Material Inventory' },
  { file: '24-qr-labels.png',             title: 'Equipment QR Label Generator' },
  { file: '25-profile.png',               title: 'My Info Tab' },
  { file: '26-profile-notifications.png', title: 'Notification Preferences' },
  { file: '27-profile-icons.png',         title: 'Dashboard Icons Panel' },
]

let html = fs.readFileSync(HTML_PATH, 'utf8')
let replaced = 0
let notFound = 0

for (const { file, title } of MAP) {
  const imgPath = path.join(SHOTS_DIR, file)
  if (!fs.existsSync(imgPath)) {
    console.warn('MISSING file:', file)
    notFound++
    continue
  }

  const b64 = fs.readFileSync(imgPath).toString('base64')
  const newSrc = `data:image/png;base64,${b64}`
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Strategy 1: replace src in an existing <img ... alt="TITLE" ...> tag
  // The tag was written by a previous embed run as:
  //   <img src="data:image/png;base64,..." alt="TITLE" style="...">
  const before = html

  // Replace src="..." up to the alt attribute marker for this title
  // We replace chunk by chunk to avoid massive regex over base64 blobs
  const altMarker = `alt="${title}"`
  let idx = html.indexOf(altMarker)
  while (idx !== -1) {
    // Find the <img opening before this alt
    const imgStart = html.lastIndexOf('<img ', idx)
    if (imgStart !== -1) {
      // Find the closing > of this img tag
      const imgEnd = html.indexOf('>', imgStart) + 1
      const imgTag = html.slice(imgStart, imgEnd)
      // Replace src value inside this img tag
      const newImgTag = imgTag.replace(/src="[^"]*"/, `src="${newSrc}"`)
      html = html.slice(0, imgStart) + newImgTag + html.slice(imgEnd)
      console.log('✓ Updated:', file, '→', title)
      replaced++
      break
    }
    idx = html.indexOf(altMarker, idx + 1)
  }

  if (html === before) {
    // Strategy 2: find an original .ss placeholder block and replace it
    const ssBlockRe = new RegExp(
      `<div class="ss">[\\s\\S]*?<div class="ss-title">${escapedTitle}</div>[\\s\\S]*?</div>(?=\\s*<)`,
      ''
    )
    const replacement = `<div class="ss-img"><img src="${newSrc}" alt="${title}" style="max-width:720px;width:100%;border-radius:8px;border:1px solid #cdd8ea;display:block;box-shadow:0 2px 12px rgba(0,0,0,0.10);"></div>`
    const html2 = html.replace(ssBlockRe, replacement)
    if (html2 !== html) {
      html = html2
      console.log('✓ Embedded (new):', file, '→', title)
      replaced++
    } else {
      console.warn('⚠ No match for:', title)
      notFound++
    }
  }
}

// Ensure .ss-img style exists once
if (!html.includes('.ss-img {')) {
  html = html.replace('</style>', `.ss-img { margin: 14px 0 22px; }\n</style>`)
}

fs.writeFileSync(HTML_PATH, html, 'utf8')
console.log(`\n✅ Done — ${replaced} replaced, ${notFound} not found`)
console.log('→', HTML_PATH)
