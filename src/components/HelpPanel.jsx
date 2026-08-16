import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import CustomerServiceModal from './CustomerServiceModal'

const HELP_CONTENT = {
  dashboard: {
    title: 'Dashboard',
    description: 'Your home screen. All modules you have access to are shown as cards. Click any card to navigate to that section.',
    tips: [
      'Click the ICT-Lab logo anytime to return to the dashboard',
      'Your profile picture or avatar is in the top right — click it to go to your profile',
      'Use Cards view for a quick overview, or Dashboard view for a detailed layout',
      'Org admins can customize background images for each module card',
      'Solo users can pick which modules appear on their dashboard from Profile → Dashboard Icons',
      'Admin users see an Admin Panel shortcut at the top of the dashboard',
    ],
  },
  home: {
    title: 'Supply Inventory',
    description: 'Track lab supplies across all rooms. Log inspections, import/export data, and monitor supply levels. Data is fully isolated to your organization.',
    tips: [
      'Use the Rooms tab to browse and manage supplies by location',
      'Run an inspection to record current supply counts and flag low-stock items',
      'Export to Excel for reports — single inspection or full history',
      'Import bulk supply data via Excel upload (Admin only)',
      'Supplies highlighted in red are below the minimum quantity threshold',
      'Each organization sees only its own rooms and supplies',
    ],
  },
  projects: {
    title: 'Project & Material',
    description: 'Manage research projects, track materials used, and store project files. Each project has its own materials log, file storage, and status tracking.',
    tips: [
      'Create a project first, then add materials and upload files to it',
      'Use the floor plan picker to assign storage locations to materials',
      'Project Database tab shows a cross-project material summary',
      'Staff can manage all projects; students see only their assigned projects',
      'Use the barcode scanner to look up materials by QR code',
    ],
  },
  training: {
    title: 'Training Records',
    description: 'Track training status across 4 categories: Fresh Student orientation, Golf Car, Equipment, and Building Alarm.',
    tips: [
      'Fresh Student tab: upload certificates and track admin approval',
      'Equipment tab: view your training status per piece of equipment',
      'Request retraining if you have not used equipment in 3+ months',
      'Exam tab: take a knowledge exam before your training session',
      'Training Requests tab (admin): schedule and approve training sessions',
    ],
  },
  equipmenthub: {
    title: 'Equipment',
    description: 'Browse all lab equipment. View photos, training videos, SOPs, and standards for each piece of equipment.',
    tips: [
      'Search or filter by category in the left panel',
      'Training videos and SOPs are visible only after completing training',
      'Admin can grant 1-week temporary access for pre-training review',
      'Scroll to the bottom of an equipment page to take the knowledge exam',
      'SOP Notes section lets you leave feedback or improvement suggestions',
      'Standards tab shows applicable safety and calibration standards',
    ],
  },
  equipment: {
    title: 'Equipment List',
    description: 'Full inventory of all lab equipment with condition tracking, maintenance scheduling, and usage records.',
    tips: [
      'Import your full equipment list from Excel in one click',
      'Maintenance Due tab shows equipment approaching service intervals',
      'Maintenance Records shows usage hours pulled from booking data',
      'Admin can assign maintenance responsibility to specific staff',
      'Settings tab lets you add and edit equipment categories',
      'Each organization sees only its own equipment',
    ],
  },
  booking: {
    title: 'Reserve Equipment',
    description: 'Reserve lab equipment using the calendar. Drag to select your time slot. All bookings within your organization are visible.',
    tips: [
      'Select an equipment item on the left first, then drag on the calendar to book',
      'Drag across multiple days for multi-day bookings',
      'Equipment with a red RETRAIN badge requires retraining before booking',
      'Admin can book on behalf of any user',
      'History & Usage tab lets you export booking records as CSV',
      'Team tab shows booking requests from teammates',
    ],
  },
  profile: {
    title: 'Profile',
    description: 'Manage your personal information, profile photo, login password, and dashboard icons. Org admins can manage users and customize module images here.',
    tips: [
      'Upload a photo or choose an emoji avatar — shown in the navigation bar',
      'Change your password in the Password tab',
      'Dashboard Icons tab: choose which module cards appear on your home screen',
      'Org admin — Module Images tab: upload a background photo for each dashboard card',
      'Org admin — Users and Lab Users tabs: add, edit, and manage all accounts',
      'Admin 1 and Admin 2 levels can be assigned to trusted lab managers',
    ],
  },
  pm: {
    title: 'Task Board',
    description: 'Personal and team task tracking — tasks, meetings, calendar, reminders, and collaboration. Each organisation sees only its own data.',
    tips: [
      'My Tasks: add tasks with deadlines, priority, and notes — click the status circle to cycle through progress',
      'Mark a task as Private to hide it from group teammates (lab users default to private)',
      'Calendar tab: three-month view of all deadlines — red ✕ marks days you marked as out-of-lab',
      'Out of Lab panel (sidebar): log days you won\'t be in to let teammates see your availability',
      'Meetings tab: use "📅 Schedule" to log a new meeting date, then "＋ Task for [date]" to assign action items',
      'Meetings — filter tasks by Priority, Person, Deadline, or Sort; use the year pills to jump between years',
      'Meeting tasks support multi-person assignment, a date-range calendar picker, a task icon, and a reference URL',
      'Live Drawing board (🎨): open from any meeting task modal to sketch and share ideas in real time — save to attach permanently or discard to close without saving',
      'Team tab (staff): kanban board of all lab manager tasks across the org',
      'Reminders tab: set personal time-based reminders independent of tasks',
      'Assign Others tab (org admin only): create and assign tasks directly to any lab manager',
    ],
  },
  labmanagement: {
    title: 'Lab Management',
    description: 'Centralized hub for lab administration — manage safety documents, compliance records, lab policies, and facility information.',
    tips: [
      'Upload and organize lab safety documents and SOPs',
      'Track compliance and certification expiry dates',
      'Admins can publish announcements visible to all lab members',
      'Each organization manages its own lab documents independently',
    ],
  },
  barcode: {
    title: 'Barcode Scanner',
    description: 'Scan QR codes and barcodes to quickly look up equipment, supplies, or project materials.',
    tips: [
      'Point the camera at any ICT-Lab QR code to pull up the linked item',
      'Equipment QR codes open the full equipment detail page',
      'Use the Barcode Manager (admin) to generate and print QR labels',
    ],
  },
}

export default function HelpPanel({ screen }) {
  const { session } = useAppStore()
  const [open, setOpen] = useState(false)
  const [showCS, setShowCS] = useState(false)
  const help = HELP_CONTENT[screen]
  if (!help) return null

  const isSolo = session?.loginMode === 'solo'

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
            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, marginBottom: 20 }}>
              {help.description}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Key tips
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {help.tips.map((tip, i) => (
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
