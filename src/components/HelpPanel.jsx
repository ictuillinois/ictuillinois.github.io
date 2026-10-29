import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import CustomerServiceModal from './CustomerServiceModal'

// Who a tip is for. A plain string is for everyone; T(text, who) narrows it:
// 'manager' = org admins + lab managers · 'admin' = org admins (and super
// admin) · 'editor' = managers + solo users · 'nonadmin' · 'labuser' ·
// 'solo' · 'team'. Keep this in step with the app: a tip
// for a tab or button that no longer exists is worse than no tip. (Oct 2026)
const T = (t, who) => ({ t, who })

const HELP_CONTENT = {
  dashboard: {
    title: 'Dashboard',
    description: 'Your home screen. Each card opens a module you have access to.',
    tips: [
      'Click the ICT-Lab logo anytime to come back here',
      'Choose which cards you see in Profile → Dashboard Icons',
      'The bell (top right) holds your notifications; click one to go straight to it',
      T('Admins see an Admin Panel card at the top', 'admin'),
    ],
  },
  home: {
    title: 'Supply Inventory',
    description: 'Count the supplies in each room, flag what is running low, and export the results.',
    tips: [
      'Inspection: pick a room and count each supply. The box starts at the last count (in grey); leave it untouched to keep that number',
      'A count below the minimum asks how many need to be ordered before you move on',
      'On the results screen, "Save & next room" starts the next room that has supplies',
      'Export Data: download one inspection or the full history as Excel or PDF. Use Edit on a record to correct a count afterwards',
      T('Rooms and Supplies: add, edit and photograph rooms and items. Import loads a supply list from Excel', 'editor'),
    ],
  },
  projects: {
    title: 'Project & Material',
    description: 'Projects and the materials stored for them. Every material has its own label, QR code and storage location.',
    tips: [
      'Use the Projects · Materials · Search row at the top to switch views',
      'Open a project card to see its materials. "Add material" and "Material Reduction" appear while a project is open',
      'Material Reduction splits a material into new ones, such as fractions by sieve size. Each fraction gets its own label and is listed under its parent',
      'The small sign beside "Project Materials" opens that project\'s materials as folders, with reductions branching off their parent',
      'Every material has a printable 4×6 label with its own barcode and QR code',
      'Tested samples get their own label: use the Tested pill, or the Tested materials label tab on a material. Tested Materials (sidebar) lists them all',
      'Non-Project Material (on the Materials view) is for material that belongs to no project',
      T('You see the projects you are assigned to', 'labuser'),
      T('Manage Projects: create projects and assign lab users. Material Types: the types offered in the Add material form', 'manager'),
    ],
  },
  training: {
    title: 'Training Records',
    description: 'Everything a lab user completes and keeps current: safety, documents, vehicle, equipment, building alarm, locker, exam and SDS.',
    tips: [
      T('Your own records open automatically. The mark on each tab shows ✓ done, ⏳ waiting, or — not started', 'labuser'),
      T('Pick a lab user\'s card to open their records. "All users" lists everyone\'s at once', 'manager'),
      'Safety: watch the safety video, read the safety guide and complete DRS training, then watch both videos and pass the test. A lab manager approves each step',
      T('Some modules stay locked until your safety training is approved', 'labuser'),
      'Lab User Documents: upload a certificate; a lab manager approves it',
      'Vehicle → Forms: tick the vehicles you need, read the Golf Cart Manual page by page, then download, sign and upload the two forms',
      T('Vehicle → Training records: confirm requested vehicles once that person\'s forms are approved. Add or remove vehicles in the ICT vehicle list', 'manager'),
      'Equipment: training per instrument. Equipment you have not used for 3 months needs retraining before you can book it',
      T('Lab User Locker: request a locker. A lab manager assigns one and you get a notification', 'labuser'),
      T('Lab User Locker: assign or decline requests in the Locker requests box, or on a lab user\'s card', 'manager'),
      'Exam: take the equipment knowledge exam',
      'SDS: the lab\'s safety data sheets. Lab managers upload them; everyone can read them',
      'Training records are private: only you and your lab managers can see yours',
    ],
  },
  equipmenthub: {
    title: 'Equipment SOP',
    description: 'The library for each instrument: SOPs, training videos, standards and the knowledge exam.',
    tips: [
      'Search, or pick a category on the left, then open an instrument',
      'Videos and SOPs unlock once you complete that equipment\'s training, or with temporary access from ICT-RE',
      'Take the knowledge exam at the bottom of an instrument\'s page',
      'SOP Notes: leave feedback or suggest an improvement',
      T('Lab-only equipment (calibration and maintenance) is hidden here. Turn on "Show lab-only equipment" to see it', 'manager'),
    ],
  },
  equipment: {
    title: 'Equipment & Maintenance',
    description: 'The lab\'s equipment list, its maintenance records, and what lab users may see of each item.',
    tips: [
      'List of Equipment: every item with its location, condition and details',
      T('Each item needs a Lab user access choice: Lab only (calibration & maintenance), or the areas lab users may use — SOP, booking calendar, request training, exam. Items not yet set show "Waiting for decision"', 'manager'),
      T('Untick Request training to let lab users book an item without a training record', 'manager'),
      T('Maintenance Records: usage hours from bookings, and maintenance history', 'manager'),
      T('Responsible for Maintenance (in an item\'s Edit form): tick Remind next to a lab manager and they are reminded 2 weeks and 1 week before the next maintenance date, on the day, then weekly while it is overdue', 'manager'),
      T('Import Excel loads a whole equipment list at once', 'manager'),
      'Settings: equipment categories',
    ],
  },
  booking: {
    title: 'Booking Equipment',
    description: 'Book lab equipment on a shared calendar. Lab managers approve requests.',
    tips: [
      'Select one or more instruments on the left (Select all shows everything), then drag on the calendar to pick a time',
      'Drag across several days for a multi-day booking. Every booking needs a purpose: project, thesis or other',
      'After booking, add it to Google Calendar or Outlook, or download an .ics file',
      'Drag your own booking to move it, or drag its top or bottom edge to change the time',
      'Cancel a booking any time before it starts. Edit it until it ends; a finished booking is locked',
      T('Admins can still correct a finished booking', 'admin'),
      'Equipment that needs training, or retraining after 3 months unused, asks for it before you can book',
      'ICT vehicles: a lab manager must approve your vehicle request (Training Records → Vehicle → Forms) before you can book one',
      T('History & Usage: Show all lists every instrument\'s booked hours, not just the six busiest', 'manager'),
      'Some equipment asks for a photo of the area before and after use',
      'History & Usage: past bookings, exportable as CSV',
      T('Book on behalf of a lab user from the booking form, or use "View lab user" to see one person\'s bookings', 'manager'),
      T('Special Treatment: instructions shown to anyone booking that equipment', 'manager'),
      T('Lab-only equipment is hidden. Turn on "Show lab-only equipment" to see it', 'manager'),
      T('Settings: booking rules, such as required photos', 'admin'),
    ],
  },
  profile: {
    title: 'Profile',
    description: 'Your details, password, dashboard cards and notification settings.',
    tips: [
      T('My Info: your name, photo or avatar, and contact details', 'team'),
      'Password: change your password',
      'Dashboard Icons: choose which cards appear on your home screen',
      'Notifications: choose what you hear about in the app and by email',
      T('Delete Account: ask for your account to be removed; an admin reviews the request', 'team'),
      T('Admin Settings, Icon Images and Organization: organization-wide settings and the picture on each dashboard card', 'admin'),
    ],
  },
  pm: {
    title: 'Task Board',
    description: 'Tasks, meetings, deadlines and reminders for you and your team.',
    tips: [
      'Overview: what is due soon and what is moving',
      'My Tasks: add a task with a deadline, priority and project; click the status circle to move it along',
      'Private tasks are hidden from teammates (lab users\' tasks start private)',
      'Calendar: deadlines by month. Days you mark out of lab (My Tasks sidebar) show a red ✕',
      'Timeline: each task as a bar from start to deadline, grouped by project. Link tasks ("waits on") to see the critical path',
      T('Meetings: schedule a meeting, add action items for that date, and sketch together on the live drawing board', 'team'),
      'Reminders: tick "Remind me daily" on a task to get a reminder each morning at 7am until it is done',
      T('Team: every lab manager\'s tasks on one board', 'manager'),
      T('Assign Others: create tasks for lab managers', 'admin'),
    ],
  },
  remessages: {
    title: 'Lab Messages',
    description: 'Messages between lab managers and admins, kept as conversations.',
    tips: [
      'Start a message, then reply inside its thread',
      'Attach a file or photo to a message or a reply',
      'You are told about replies in the app, and by email if you turn that on in Profile → Notifications',
      'Pick a background for the message board',
    ],
  },
  labmanagement: {
    title: 'Lab Management',
    description: 'The people in your lab: lab users, lab managers and org admins, account requests, and data export.',
    tips: [
      'Lab Users / Lab Managers: add people, edit them, set their dashboard icons, or deactivate them',
      T('Lab Users: switch between Cards and List, filter by advisor, or sort by advisor', 'manager'),
      T('Import lab users: up to 50 per Excel file. Review the list and tick each person\'s safety steps — nothing is sent until you confirm, and Save and finish later keeps the list. Then email them now or at a set time. The history shows who got the email and who has signed in', 'manager'),
      T('Yearly re-safety: every Sep 1 lab users redo Steps 1–3 and are locked until they pass. Untick steps in Edit to excuse someone', 'manager'),
      'A new account gets a temporary password and must change it at first sign-in',
      'One person can be a lab user and a lab manager on the same email; they sign in once',
      T('Organization Admins: read only for lab managers. Only admins change org admin accounts', 'manager'),
      'Approval Requests: account deletion requests; choose who takes over that person\'s records',
      'Export Data: one ZIP with each person\'s records, training, bookings, projects and uploaded files',
      'Lab Manager Guide: how to run the lab in ICT-Lab',
    ],
  },
  barcodeqr: {
    title: 'QR Labels',
    description: 'Print QR labels for equipment and project materials.',
    tips: [
      T('Equipment Barcode: make and print a QR label for each instrument. Scanning it opens its SOP, booking, contact and calibration', 'manager'),
      T('Records: pick several instruments and print their labels together', 'manager'),
      'Material Labels: print or reprint the 4×6 label of a project material',
      T('Summary: materials by type across projects', 'manager'),
    ],
  },
  barcode: {
    title: 'QR Scan',
    description: 'Scan a QR code to open the equipment or material it belongs to.',
    tips: [
      'Point the camera at any ICT-Lab QR label',
      'An equipment label opens its SOP, booking, contact and calibration options',
      'A material label opens that material\'s record',
    ],
  },
}

// onTour: a screen with a guided tour (Booking Equipment) offers it here, so
// it can be replayed any time.
// placement: 'page' (in the screen's own header) or 'tip' (beside the green
// tip banner, drawn by ModuleTip). While the banner shows, the page copy
// steps aside, so the "?" shares the banner's row instead of taking its own.
export default function HelpPanel({ screen, onTour, placement = 'page' }) {
  const { session, moduleTipScreen } = useAppStore()
  const [open, setOpen] = useState(false)
  const [showCS, setShowCS] = useState(false)
  const help = HELP_CONTENT[screen]
  if (!help) return null
  if (placement === 'page' && moduleTipScreen === screen) return null

  const isSolo = session?.loginMode === 'solo'
  const role = session?.role
  const forMe = who => !who
    || (who === 'manager' && (role === 'admin' || role === 'user'))
    || (who === 'editor' && (role === 'admin' || role === 'user' || isSolo))
    || (who === 'admin' && role === 'admin')
    || (who === 'nonadmin' && role !== 'admin')
    || (who === 'labuser' && role === 'lab_user' && !isSolo)
    || (who === 'solo' && isSolo)
    || (who === 'team' && !isSolo)
  const tips = help.tips.map(x => typeof x === 'string' ? { t: x } : x).filter(x => forMe(x.who))

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Help & tips"
        style={{
          width: 28, height: 28, borderRadius: '50%',
          background: open ? 'var(--accent)' : 'var(--accent-light)',
          border: `1px solid var(--accent)`,
          color: open ? '#fff' : 'var(--accent)',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'all 0.15s',
        }}>
        ?
      </button>

      {open && (
        <div style={{
          position: 'fixed', top: 52, right: 0, width: 300,
          height: 'calc(100vh - 52px)', background: 'var(--surface)',
          borderLeft: '1px solid var(--border)', zIndex: 200,
          overflowY: 'auto', boxShadow: '-4px 0 20px rgba(0,0,0,0.08)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-light)' }}>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Help & Tips</div>
              <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--accent)' }}>{help.title}</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: 'var(--accent)', padding: 4 }}>✕</button>
          </div>

          <div style={{ padding: 20, flex: 1 }}>
            {onTour && (
              <button className="btn btn-sm btn-primary" style={{ marginBottom: 16 }} onClick={() => { setOpen(false); onTour() }}>
                ▶ Take the tour of this page
              </button>
            )}
            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, marginBottom: 20 }}>
              {help.description}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Key tips
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tips.map(({ t: tip }, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent-light)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{tip}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
              {isSolo ? (
                <>
                  Need more help?{' '}
                  <button
                    onClick={() => { setOpen(false); setShowCS(true) }}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 12, textDecoration: 'underline' }}>
                    Contact customer service
                  </button>
                </>
              ) : (
                'Need more help? Contact your admin.'
              )}
            </div>
          </div>
        </div>
      )}

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.2)' }} />
      )}

      {showCS && <CustomerServiceModal onClose={() => setShowCS(false)} />}
    </>
  )
}
