import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'

// ── Icons ─────────────────────────────────────────────────────
const ICONS = {
  fresh:     '📄',
  golf:      '🚗',
  equipment: '🔧',
  alarm:     '🔔',
  requests:  '📋',
  exam:      '📝',
  locker:    '🗄️',
}

// ── Tiny badge ─────────────────────────────────────────────────
function Badge({ label, color = '#2e7d32', bg = '#e8f5e9' }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: bg, color }}>{label}</span>
}

// ── Mock content per tab ───────────────────────────────────────
const MOCK_USERS = [
  { name: 'Alice Chen',    docs: true,  vehicle: true,  equip: 2,  alarm: true  },
  { name: 'Bob Martin',    docs: true,  vehicle: false, equip: 1,  alarm: true  },
  { name: 'Carlos Rivera', docs: false, vehicle: false, equip: 0,  alarm: false },
  { name: 'Dana Kim',      docs: true,  vehicle: true,  equip: 3,  alarm: true  },
  { name: 'Ethan Park',    docs: false, vehicle: false, equip: 1,  alarm: false },
]
const MOCK_EQUIPMENT = [
  { name: 'Marshall Compactor',   expires: '2026-09-01', trained: 3 },
  { name: 'Rotary Evaporator',    expires: '2026-07-15', trained: 2 },
  { name: 'QR Scanner Unit',      expires: '2027-01-20', trained: 4 },
  { name: 'Centrifuge X-200',     expires: '2026-08-10', trained: 1 },
]

const TH = { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'left', background: '#f9fafb' }
const TD = { fontSize: 13, padding: '10px 12px', borderBottom: '1px solid #f3f4f6', color: '#111827', verticalAlign: 'middle' }

function TabContent({ tab }) {
  if (tab === 'fresh') return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>Lab User Documents</div>
        <button style={{ fontSize: 12, padding: '4px 12px', borderRadius: 7, border: '1px solid #1D9E75', background: '#E1F5EE', color: '#1D9E75', cursor: 'pointer', fontWeight: 600 }}>+ Upload cert</button>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={TH}>Name</th><th style={TH}>Lab Safety</th><th style={TH}>WHMIS</th><th style={TH}>First Aid</th><th style={TH}>Certificate</th></tr></thead>
          <tbody>
            {MOCK_USERS.map((u, i) => (
              <tr key={i} style={{ transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background='#f9fafb'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                <td style={{ ...TD, fontWeight: 600 }}>{u.name}</td>
                <td style={TD}>{u.docs ? <Badge label="Done" /> : <Badge label="Pending" color="#92400e" bg="#fef3c7" />}</td>
                <td style={TD}>{u.docs ? <Badge label="Done" /> : <Badge label="Pending" color="#92400e" bg="#fef3c7" />}</td>
                <td style={TD}>{u.alarm ? <Badge label="Done" /> : <Badge label="Missing" color="#991b1b" bg="#fee2e2" />}</td>
                <td style={TD}>{u.docs ? <a href="#" style={{ fontSize: 12, color: '#1D9E75' }}>View PDF</a> : <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  if (tab === 'equipment') return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>Equipment Training Records</div>
        <button style={{ fontSize: 12, padding: '4px 12px', borderRadius: 7, border: '1px solid #1D9E75', background: '#E1F5EE', color: '#1D9E75', cursor: 'pointer', fontWeight: 600 }}>+ Add equipment</button>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={TH}>Equipment</th><th style={TH}>Trained users</th><th style={TH}>Expires</th><th style={TH}>Status</th></tr></thead>
          <tbody>
            {MOCK_EQUIPMENT.map((eq, i) => {
              const days = Math.round((new Date(eq.expires) - new Date()) / 86400000)
              const urgent = days < 30
              return (
                <tr key={i} style={{ transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background='#f9fafb'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                  <td style={{ ...TD, fontWeight: 600 }}>{eq.name}</td>
                  <td style={TD}><Badge label={`${eq.trained} users`} color="#0369a1" bg="#e0f2fe" /></td>
                  <td style={{ ...TD, color: urgent ? '#92400e' : '#374151' }}>{eq.expires}</td>
                  <td style={TD}>{urgent ? <Badge label="Renew soon" color="#92400e" bg="#fef3c7" /> : <Badge label="Current" />}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Training matrix</div>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
          <thead>
            <tr>
              <th style={TH}>User</th>
              {MOCK_EQUIPMENT.map(eq => <th key={eq.name} style={{ ...TH, maxWidth: 100, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{eq.name.split(' ')[0]}</th>)}
            </tr>
          </thead>
          <tbody>
            {MOCK_USERS.map((u, i) => (
              <tr key={i}>
                <td style={{ ...TD, fontWeight: 500 }}>{u.name.split(' ')[0]}</td>
                {MOCK_EQUIPMENT.map((eq, j) => (
                  <td key={j} style={{ ...TD, textAlign: 'center' }}>
                    {(i + j) % 3 !== 0 ? <span style={{ color: '#1D9E75', fontWeight: 700 }}>✓</span> : <span style={{ color: '#d1d5db' }}>—</span>}
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
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Training Requests</div>
      {[
        { user: 'Carlos Rivera', equip: 'Marshall Compactor', date: '2026-06-18', status: 'Pending' },
        { user: 'Ethan Park',    equip: 'Rotary Evaporator',  date: '2026-06-20', status: 'Pending' },
        { user: 'Bob Martin',    equip: 'Centrifuge X-200',   date: '2026-06-15', status: 'Approved' },
      ].map((r, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{r.user}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{r.equip} · Requested {r.date}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge label={r.status} color={r.status === 'Approved' ? '#2e7d32' : '#92400e'} bg={r.status === 'Approved' ? '#e8f5e9' : '#fef3c7'} />
            {r.status === 'Pending' && <>
              <button style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #1D9E75', background: '#E1F5EE', color: '#1D9E75', cursor: 'pointer', fontWeight: 600 }}>Approve</button>
              <button style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fee2e2', color: '#991b1b', cursor: 'pointer', fontWeight: 600 }}>Deny</button>
            </>}
          </div>
        </div>
      ))}
    </div>
  )

  // Generic placeholder for other tabs
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 32, textAlign: 'center', color: '#9ca3af' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{ICONS[tab]}</div>
      <div style={{ fontWeight: 600, fontSize: 14, color: '#374151', marginBottom: 6 }}>
        {{ golf: 'Vehicle Training', alarm: 'Building Alarm', exam: 'Exam', locker: 'Lab User Locker' }[tab]}
      </div>
      <div style={{ fontSize: 13 }}>Content for this section would appear here in the same layout.</div>
    </div>
  )
}

// ── Main prototype ─────────────────────────────────────────────
export default function TrainingRecordsProto() {
  const { session, setScreen } = useAppStore()
  const isSolo = session?.loginMode === 'solo'
  const [tab, setTab] = useState('fresh')

  const navItems = [
    { key: 'fresh',     label: 'Lab User Documents' },
    ...(!isSolo ? [{ key: 'golf', label: 'Vehicle' }] : []),
    { key: 'equipment', label: 'Equipment' },
    ...(!isSolo ? [{ key: 'alarm', label: 'Building Alarm' }] : []),
    { key: 'requests',  label: 'Training Requests' },
    { key: 'exam',      label: 'Exam' },
    { key: 'locker',    label: 'Lab User Locker' },
  ]

  const STATS = [
    { label: 'Lab users', value: 5, color: '#1D9E75', bg: '#E1F5EE' },
    { label: 'Docs complete', value: 3, color: '#0369a1', bg: '#e0f2fe' },
    { label: 'Expiring soon', value: 2, color: '#92400e', bg: '#fef3c7' },
    { label: 'Requests', value: 2, color: '#7c3aed', bg: '#EEEDFE' },
  ]

  return (
    <div style={{ display: 'flex', height: '100%', background: '#f3f4f6', overflow: 'hidden' }}>

      {/* ── Left sidebar ── */}
      <div style={{ width: 220, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#0C1140', letterSpacing: '-0.02em' }}>ICT-Lab</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, fontFamily: 'monospace' }}>Training Records</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          {navItems.map(item => {
            const active = tab === item.key
            return (
              <button key={item.key} onClick={() => setTab(item.key)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 8, border: 'none', marginBottom: 2,
                  background: active ? '#E1F5EE' : 'transparent',
                  color: active ? '#1D9E75' : '#4b5563',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f9fafb' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 15, flexShrink: 0 }}>{ICONS[item.key]}</span>
                <span style={{ lineHeight: 1.3 }}>{item.label}</span>
                {active && <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#1D9E75', flexShrink: 0 }} />}
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '10px 8px', borderTop: '1px solid #f3f4f6' }}>
          <button onClick={() => setScreen('training')}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'transparent', fontSize: 12, color: '#6b7280', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Back to current layout
          </button>
          <div style={{ fontSize: 10, color: '#d1d5db', textAlign: 'center', marginTop: 8, fontStyle: 'italic' }}>Design prototype only</div>
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Dense header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#0C1140' }}>Training Records</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>Lab Manager workspace · {session?.username || 'Lab Manager'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STATS.map(s => (
              <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 8, padding: '6px 14px', textAlign: 'center', minWidth: 70 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: s.color, marginTop: 2, whiteSpace: 'nowrap' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Expiry banner */}
        <div style={{ background: '#fef3c7', borderBottom: '1px solid #fcd34d', padding: '8px 24px', fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span>⏰</span>
          <span><strong>2 retraining reminders:</strong> Carlos Rivera — Marshall Compactor (expires 2026-08-10) · Bob Martin — Rotary Evaporator (expires 2026-07-15)</span>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <TabContent tab={tab} />
        </div>
      </div>
    </div>
  )
}
