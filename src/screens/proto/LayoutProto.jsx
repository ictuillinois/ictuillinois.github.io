/**
 * LayoutProto — design prototype only, not production code.
 * Shows the proposed sidebar navigation layout.
 * Access at: localhost:5174 → console → useAppStore.getState().setScreen('layout-proto')
 * Or navigate directly from the Training Records page.
 */
import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'

// ─── Real module list (matches production app) ────────────────
const MODULES = [
  { key: 'dashboard',    icon: '🏠', label: 'Dashboard' },
  { key: 'inspection',   icon: '🔍', label: 'Inspections' },
  { key: 'equipment',    icon: '🔧', label: 'Equipment' },
  { key: 'equipmenthub', icon: '📖', label: 'Equipment Hub' },
  { key: 'booking',      icon: '📅', label: 'Booking' },
  { key: 'training',     icon: '📚', label: 'Training Records' },
  { key: 'projects',     icon: '🧪', label: 'Project Workspace' },
  { key: 'remessages',   icon: '💬', label: 'Lab Messages' },
  { key: 'pm',           icon: '📋', label: 'Task Board' },
  { key: 'barcodeqr',    icon: '🔲', label: 'QR Labels' },
  { key: 'labmanagement',icon: '⚙️',  label: 'Lab Management' },
]

// ─── Sub-tabs per module (real names) ────────────────────────
const SUB_TABS = {
  training: [
    { key: 'fresh',     icon: '📄', label: 'Lab User Documents' },
    { key: 'golf',      icon: '🚗', label: 'Vehicle' },
    { key: 'equipment', icon: '🔧', label: 'Equipment Training' },
    { key: 'alarm',     icon: '🔔', label: 'Building Alarm' },
    { key: 'requests',  icon: '📋', label: 'Training Requests' },
    { key: 'exam',      icon: '📝', label: 'Exam' },
    { key: 'locker',    icon: '🗄️', label: 'Lab User Locker' },
  ],
  equipment: [
    { key: 'list',      icon: '📋', label: 'All Equipment' },
    { key: 'add',       icon: '➕', label: 'Add Equipment' },
    { key: 'calibrate', icon: '📐', label: 'Calibration' },
    { key: 'sop',       icon: '📄', label: 'SOPs' },
  ],
  projects: [
    { key: 'inventory', icon: '📦', label: 'Material Inventory' },
    { key: 'results',   icon: '✏️',  label: 'Project Test Results' },
    { key: 'workspace', icon: '📋', label: 'Workspace' },
    { key: 'types',     icon: '🏷️', label: 'Material Types' },
  ],
  booking: [
    { key: 'calendar',  icon: '📅', label: 'Booking Calendar' },
    { key: 'approvals', icon: '✅', label: 'Approvals' },
    { key: 'history',   icon: '🕘', label: 'History' },
  ],
  pm: [
    { key: 'overview',  icon: '📊', label: 'Overview' },
    { key: 'tasks',     icon: '✅', label: 'My Tasks' },
    { key: 'team',      icon: '👥', label: 'Team' },
    { key: 'calendar',  icon: '📅', label: 'Calendar' },
    { key: 'meetings',  icon: '🤝', label: 'Meetings' },
    { key: 'reminder',  icon: '⏰', label: 'Reminders' },
    { key: 'assign',    icon: '📌', label: 'Assign Others' },
  ],
  barcodeqr: [
    { key: 'equipment', icon: '🔲', label: 'Equipment Barcode' },
    { key: 'records',   icon: '📋', label: 'Records' },
    { key: 'materials', icon: '📷', label: 'Project Materials' },
  ],
}

// ─── Helpers ──────────────────────────────────────────────────
function Badge({ label, color, bg }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: bg, color }}>{label}</span>
}

const TH = { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'left', background: '#f9fafb' }
const TD = { fontSize: 13, padding: '10px 12px', borderBottom: '1px solid #f3f4f6', color: '#111827', verticalAlign: 'middle' }

// ─── Mock dashboard content ───────────────────────────────────
function DashboardContent() {
  const CARDS = [
    { icon: '🔍', label: 'Inspections',        sub: 'Room & supply checks',         color: '#059669', bg: '#d1fae5' },
    { icon: '🔧', label: 'Equipment',           sub: 'Track & manage equipment',     color: '#0369a1', bg: '#e0f2fe' },
    { icon: '📅', label: 'Booking',             sub: 'Reserve equipment time',       color: '#7c3aed', bg: '#ede9fe' },
    { icon: '📚', label: 'Training Records',    sub: 'Certs, exams & schedules',     color: '#1D9E75', bg: '#E1F5EE' },
    { icon: '🧪', label: 'Project Workspace',   sub: 'Materials, results & storage', color: '#9333ea', bg: '#f3e8ff' },
    { icon: '💬', label: 'Lab Messages',        sub: 'Notes, ideas & issue reports', color: '#0891b2', bg: '#e0f7fa' },
    { icon: '📋', label: 'Task Board',          sub: 'Tasks, meetings & reminders',  color: '#d97706', bg: '#fef3c7' },
    { icon: '🔲', label: 'QR Labels',           sub: 'Generate & print QR codes',    color: '#374151', bg: '#f3f4f6' },
    { icon: '⚙️',  label: 'Lab Management',     sub: 'Users & permissions',          color: '#6b7280', bg: '#f9fafb' },
  ]
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 22, color: '#0C1140', marginBottom: 4 }}>Good morning 👋</div>
        <div style={{ fontSize: 14, color: '#6b7280' }}>Demo Lab · Staff workspace</div>
      </div>
      {/* Stat row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
        {[
          { label: 'Active equipment', value: 24, color: '#1D9E75', bg: '#E1F5EE' },
          { label: 'Bookings today',   value: 3,  color: '#0369a1', bg: '#e0f2fe' },
          { label: 'Open tasks',       value: 7,  color: '#d97706', bg: '#fef3c7' },
          { label: 'Cert pending',     value: 2,  color: '#dc2626', bg: '#fee2e2' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '12px 16px', minWidth: 110 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: s.color, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
      {/* Module cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {CARDS.map(c => (
          <div key={c.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 16px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 8 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = c.color; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.transform = 'none' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{c.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{c.label}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.4 }}>{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Mock training content ────────────────────────────────────
const USERS = [
  { name: 'Alice Chen',    docs: true,  vehicle: true,  certs: 3 },
  { name: 'Bob Martin',    docs: true,  vehicle: false, certs: 1 },
  { name: 'Carlos Rivera', docs: false, vehicle: false, certs: 0 },
  { name: 'Dana Kim',      docs: true,  vehicle: true,  certs: 4 },
  { name: 'Ethan Park',    docs: false, vehicle: false, certs: 1 },
]
const EQUIPMENT_TRAINING = [
  { name: 'Marshall Compactor',  expires: '2026-08-10', users: 3 },
  { name: 'Rotary Evaporator',   expires: '2026-07-15', users: 2 },
  { name: 'QR Scanner Unit',     expires: '2027-01-20', users: 4 },
  { name: 'Centrifuge X-200',    expires: '2026-09-01', users: 1 },
]

function TrainingContent({ tab }) {
  if (tab === 'fresh') return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17, color: '#0C1140' }}>Lab User Documents</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Lab safety certs, WHMIS, first aid & uploaded files</div>
        </div>
        <button style={{ fontSize: 12, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>+ Upload certificate</button>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={TH}>Lab User</th><th style={TH}>Lab Safety Doc</th><th style={TH}>Vehicle Auth.</th><th style={TH}>Certificates</th><th style={TH}>Actions</th></tr></thead>
          <tbody>
            {USERS.map((u, i) => (
              <tr key={i} onMouseEnter={e => e.currentTarget.style.background='#f9fafb'} onMouseLeave={e => e.currentTarget.style.background='#fff'} style={{ transition: 'background 0.1s' }}>
                <td style={{ ...TD, fontWeight: 600 }}>{u.name}</td>
                <td style={TD}>{u.docs ? <Badge label="Approved" color="#065f46" bg="#d1fae5" /> : <Badge label="Pending" color="#92400e" bg="#fef3c7" />}</td>
                <td style={TD}>{u.vehicle ? <Badge label="Authorised" color="#065f46" bg="#d1fae5" /> : <Badge label="No" color="#6b7280" bg="#f3f4f6" />}</td>
                <td style={TD}><Badge label={`${u.certs} file${u.certs !== 1 ? 's' : ''}`} color="#0369a1" bg="#e0f2fe" /></td>
                <td style={TD}><button style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#374151' }}>Manage</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  if (tab === 'equipment') return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 17, color: '#0C1140', marginBottom: 4 }}>Equipment Training Records</div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>Trained users per equipment, expiry dates & retraining requests</div>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={TH}>Equipment</th><th style={TH}>Trained Users</th><th style={TH}>Expiry</th><th style={TH}>Status</th><th style={TH}></th></tr></thead>
          <tbody>
            {EQUIPMENT_TRAINING.map((eq, i) => {
              const days = Math.round((new Date(eq.expires) - new Date()) / 86400000)
              const urgent = days < 60
              return (
                <tr key={i} onMouseEnter={e => e.currentTarget.style.background='#f9fafb'} onMouseLeave={e => e.currentTarget.style.background='#fff'} style={{ transition: 'background 0.1s' }}>
                  <td style={{ ...TD, fontWeight: 600 }}>{eq.name}</td>
                  <td style={TD}><Badge label={`${eq.users} users`} color="#0369a1" bg="#e0f2fe" /></td>
                  <td style={{ ...TD, color: urgent ? '#92400e' : '#374151', fontWeight: urgent ? 600 : 400 }}>{eq.expires}</td>
                  <td style={TD}>{urgent ? <Badge label="Renew soon" color="#92400e" bg="#fef3c7" /> : <Badge label="Current" color="#065f46" bg="#d1fae5" />}</td>
                  <td style={TD}><button style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#374151' }}>View users</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: '#0C1140' }}>Training matrix</div>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead><tr>
            <th style={TH}>User</th>
            {EQUIPMENT_TRAINING.map(eq => <th key={eq.name} style={{ ...TH, maxWidth: 120 }}>{eq.name.split(' ')[0]}</th>)}
          </tr></thead>
          <tbody>
            {USERS.map((u, i) => (
              <tr key={i} onMouseEnter={e => e.currentTarget.style.background='#f9fafb'} onMouseLeave={e => e.currentTarget.style.background='#fff'} style={{ transition: 'background 0.1s' }}>
                <td style={{ ...TD, fontWeight: 500 }}>{u.name.split(' ')[0]}</td>
                {EQUIPMENT_TRAINING.map((_, j) => (
                  <td key={j} style={{ ...TD, textAlign: 'center' }}>
                    {(i + j) % 3 !== 0 ? <span style={{ color: '#1D9E75', fontWeight: 700, fontSize: 15 }}>✓</span> : <span style={{ color: '#d1d5db', fontSize: 15 }}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  if (tab === 'requests') return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 17, color: '#0C1140', marginBottom: 4 }}>Training Requests</div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>Lab users requesting access to equipment training</div>
      {[
        { user: 'Carlos Rivera', equip: 'Marshall Compactor', date: '2026-06-18', status: 'Pending' },
        { user: 'Ethan Park',    equip: 'Rotary Evaporator',  date: '2026-06-20', status: 'Pending' },
        { user: 'Bob Martin',    equip: 'Centrifuge X-200',   date: '2026-06-15', status: 'Approved' },
      ].map((r, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#1D9E75', flexShrink: 0 }}>{r.user[0]}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{r.user}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Requesting: <strong>{r.equip}</strong> · {r.date}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <Badge label={r.status} color={r.status === 'Approved' ? '#065f46' : '#92400e'} bg={r.status === 'Approved' ? '#d1fae5' : '#fef3c7'} />
            {r.status === 'Pending' && <>
              <button style={{ fontSize: 12, padding: '4px 12px', borderRadius: 7, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Approve</button>
              <button style={{ fontSize: 12, padding: '4px 12px', borderRadius: 7, border: 'none', background: '#fee2e2', color: '#991b1b', cursor: 'pointer', fontWeight: 600 }}>Deny</button>
            </>}
          </div>
        </div>
      ))}
    </div>
  )

  const labels = { golf: 'Vehicle Training', alarm: 'Building Alarm', exam: 'Exam', locker: 'Lab User Locker' }
  const icons  = { golf: '🚗', alarm: '🔔', exam: '📝', locker: '🗄️' }
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 40, textAlign: 'center', color: '#9ca3af' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icons[tab] || '📄'}</div>
      <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>{labels[tab] || tab}</div>
      <div style={{ fontSize: 13 }}>This section's content would appear here in the same full-width layout.</div>
    </div>
  )
}

// ─── Main prototype ───────────────────────────────────────────
export default function LayoutProto() {
  const { setScreen } = useAppStore()
  const [activeModule, setActiveModule] = useState('dashboard') // which module is open
  const [activeTab, setActiveTab]       = useState('fresh')     // sub-tab within module

  const subTabs  = SUB_TABS[activeModule] || []
  const modMeta  = MODULES.find(m => m.key === activeModule) || MODULES[0]
  const isDash   = activeModule === 'dashboard'

  function openModule(key) {
    setActiveModule(key)
    const tabs = SUB_TABS[key]
    if (tabs?.length) setActiveTab(tabs[0].key)
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: '#f3f4f6', overflow: 'hidden' }}>

        {/* ── Sidebar ─────────────────────────────────────── */}
        <div style={{ width: 230, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>

          {isDash ? (
            /* HOME STATE: show all module icons */
            <>
              <div style={{ padding: '14px 12px 8px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Modules</div>
              </div>
              <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
                {MODULES.filter(m => m.key !== 'dashboard').map(m => (
                  <button key={m.key} onClick={() => openModule(m.key)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: '#4b5563', fontSize: 13, fontWeight: 400, cursor: 'pointer', textAlign: 'left', marginBottom: 1, transition: 'all 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#111827' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4b5563' }}
                  >
                    <span style={{ fontSize: 16, width: 22, textAlign: 'center', flexShrink: 0 }}>{m.icon}</span>
                    <span>{m.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#d1d5db' }}>›</span>
                  </button>
                ))}
              </nav>
            </>
          ) : (
            /* MODULE STATE: back button + sub-tabs */
            <>
              {/* Back to home */}
              <button onClick={() => setActiveModule('dashboard')}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', border: 'none', borderBottom: '1px solid #f3f4f6', background: 'transparent', color: '#6b7280', fontSize: 13, cursor: 'pointer', fontWeight: 500, textAlign: 'left', transition: 'all 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.color = '#111827' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280' }}
              >
                <span style={{ fontSize: 14 }}>←</span>
                <span>All Modules</span>
              </button>

              {/* Module title */}
              <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{modMeta.icon}</span>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#0C1140', lineHeight: 1.3 }}>{modMeta.label}</div>
                </div>
              </div>

              {/* Sub-tabs */}
              <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
                {subTabs.length > 0 ? subTabs.map(t => {
                  const active = activeTab === t.key
                  return (
                    <button key={t.key} onClick={() => setActiveTab(t.key)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: 'none', background: active ? '#E1F5EE' : 'transparent', color: active ? '#1D9E75' : '#4b5563', fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer', textAlign: 'left', marginBottom: 2, transition: 'all 0.12s' }}
                      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#111827' } }}
                      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4b5563' } }}
                    >
                      <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{t.icon}</span>
                      <span style={{ lineHeight: 1.3 }}>{t.label}</span>
                      {active && <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#1D9E75', flexShrink: 0 }} />}
                    </button>
                  )
                }) : (
                  <div style={{ padding: '20px 12px', fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>This module has no sub-tabs in the prototype.</div>
                )}
              </nav>

              {/* Bottom: switch module */}
              <div style={{ padding: '8px', borderTop: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: 10, color: '#d1d5db', padding: '4px 12px 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Other modules</div>
                {MODULES.filter(m => m.key !== 'dashboard' && m.key !== activeModule).slice(0, 4).map(m => (
                  <button key={m.key} onClick={() => openModule(m.key)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 7, border: 'none', background: 'transparent', color: '#9ca3af', fontSize: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.color = '#374151' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
                  >
                    <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>{m.icon}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Content area (full remaining width) ─────────── */}
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>

          {isDash ? (
            /* Dashboard: dense header + full-width card grid */
            <div style={{ padding: 28 }}>
              <DashboardContent />
            </div>
          ) : (
            <>
              {/* Page header bar */}
              <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: '#0C1140' }}>{modMeta.label}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                    {subTabs.find(t => t.key === activeTab)?.label || ''} · Staff workspace
                  </div>
                </div>
                {/* Stat pills — only for training */}
                {activeModule === 'training' && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Lab users',     value: 5, color: '#1D9E75', bg: '#E1F5EE' },
                      { label: 'Docs complete', value: 3, color: '#0369a1', bg: '#e0f2fe' },
                      { label: 'Expiring',      value: 2, color: '#92400e', bg: '#fef3c7' },
                      { label: 'Requests',      value: 2, color: '#7c3aed', bg: '#EEEDFE' },
                    ].map(s => (
                      <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: '6px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: s.color, marginTop: 2, whiteSpace: 'nowrap' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Expiry warning banner (training only) */}
              {activeModule === 'training' && (
                <div style={{ background: '#fef3c7', borderBottom: '1px solid #fcd34d', padding: '8px 28px', fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⏰</span>
                  <span><strong>2 retraining reminders:</strong> Carlos Rivera — Marshall Compactor · Bob Martin — Rotary Evaporator</span>
                </div>
              )}

              {/* Tab content */}
              <div style={{ padding: 28 }}>
                {activeModule === 'training'
                  ? <TrainingContent tab={activeTab} />
                  : <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 40, textAlign: 'center', color: '#9ca3af' }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>{modMeta.icon}</div>
                      <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>{modMeta.label}</div>
                      <div style={{ fontSize: 13 }}>Full content for <strong>{subTabs.find(t => t.key === activeTab)?.label || activeModule}</strong> would appear here. Only Training Records has full mock content in this prototype.</div>
                    </div>
                }
              </div>
            </>
          )}
        </div>
    </div>
  )
}
