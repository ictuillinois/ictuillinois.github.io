import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'

function ILabLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <polygon points="256,4 468,126 468,378 256,500 44,378 44,126" fill="#ffb380"/>
      <polygon points="256,14 458,132 458,372 256,490 54,372 54,132" fill="#ff7f2a"/>
      <polygon points="256,30 450,140 450,362 256,472 62,362 62,140" fill="#000080"/>
      <polygon points="256,58 422,152 422,350 256,444 90,350 90,152" fill="none" stroke="#ff6b00" strokeWidth="1.2" opacity="0.25"/>
      <circle cx="256" cy="30"  r="9" fill="#ff6b00"/>
      <circle cx="450" cy="140" r="9" fill="#ff6b00"/>
      <circle cx="450" cy="362" r="9" fill="#ff6b00"/>
      <circle cx="256" cy="472" r="9" fill="#ff6b00"/>
      <circle cx="62"  cy="362" r="9" fill="#ff6b00"/>
      <circle cx="62"  cy="140" r="9" fill="#ff6b00"/>
      <ellipse cx="256" cy="224" rx="138" ry="44" fill="none" stroke="#ff6b00" strokeWidth="3.5" opacity="0.95"/>
      <circle cx="394" cy="224" r="16" fill="#ff6b00"/>
      <ellipse cx="256" cy="224" rx="138" ry="44" fill="none" stroke="#ff9a3c" strokeWidth="3" opacity="0.85" transform="rotate(60 256 224)"/>
      <circle cx="179.16718" cy="294.86069" r="15" fill="#ff9a3c"/>
      <ellipse cx="256" cy="224" rx="138" ry="44" fill="none" stroke="#ffba6e" strokeWidth="2.5" opacity="0.75" transform="rotate(-60 256 224)"/>
      <circle cx="325" cy="105" r="14" fill="#ffba6e"/>
      <circle cx="256" cy="224" r="38" fill="#ff6b00" opacity="0.10"/>
      <circle cx="256" cy="224" r="26" fill="#ff6b00" opacity="0.22"/>
      <circle cx="256" cy="224" r="16" fill="#ff8c00" opacity="0.80"/>
      <circle cx="256" cy="224" r="9"  fill="#ffb347"/>
      <text x="258.37772" y="415" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="92" fontWeight="700">
        <tspan fontStyle="italic" fill="#ff6b00">i</tspan>
        <tspan fill="#ffffff" dx="-5">Lab</tspan>
      </text>
    </svg>
  )
}

const OPTION_META = [
  { id: 'sop',         icon: '📋', label: 'Standard Operating Procedure',   sub: 'Watch how-to videos, read the SOP, or turn on/off guide',   color: '#0369a1', bg: '#e0f2fe' },
  { id: 'book',        icon: '📅', label: 'Book this Equipment',            sub: 'Reserve a time slot on the lab calendar',                   color: '#1D9E75', bg: '#E1F5EE' },
  { id: 'calibration', icon: '🔧', label: 'Calibration',                   sub: 'View calibration schedule and maintenance records',          color: '#92400e', bg: '#fef3c7' },
]

function SectionCard({ title, children, onClose }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 20px', marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', padding: '2px 6px', lineHeight: 1 }}>✕</button>
      </div>
      {children}
      <button
        onClick={onClose}
        style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 8, border: '1.5px solid #b2dfcb', background: '#E1F5EE', fontSize: 13, fontWeight: 700, color: '#1D9E75', cursor: 'pointer', width: '100%', justifyContent: 'center' }}
      >
        ← Back to options
      </button>
    </div>
  )
}

function HowToSection({ videos, sop, onClose }) {
  const [tab, setTab] = useState('video')

  return (
    <SectionCard title="📖 How to work with this equipment" onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[{ k: 'video', label: '🎥 Watch Video' }, { k: 'sop', label: '📄 Read SOP' }, { k: 'onoff', label: '💡 Turn On/Off' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ padding: '8px 14px', borderRadius: 8, border: tab === t.k ? '2px solid #0369a1' : '1px solid var(--border)', background: tab === t.k ? '#e0f2fe' : 'var(--surface)', color: tab === t.k ? '#0369a1' : 'var(--text2)', fontWeight: tab === t.k ? 700 : 500, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'video' && (
        videos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text3)', fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎥</div>
            No videos have been added for this equipment yet.<br/>Contact the lab manager for a demonstration.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {videos.map(v => (
              <a key={v.id} href={v.video_url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, textDecoration: 'none', background: 'var(--surface2)', transition: 'all 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor='#0369a1'}
                onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}>
                <div style={{ fontSize: 28, flexShrink: 0 }}>▶️</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{v.title}</div>
                  {v.description && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{v.description}</div>}
                  <div style={{ fontSize: 11, color: '#0369a1', marginTop: 4 }}>↗ Open video</div>
                </div>
              </a>
            ))}
          </div>
        )
      )}

      {tab === 'sop' && (
        !sop ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text3)', fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
            No SOP has been added for this equipment yet.<br/>Contact the lab manager for operating instructions.
          </div>
        ) : (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{sop.title}</div>
            {sop.pdf_url && (
              <a href={sop.pdf_url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: '#e0f2fe', color: '#0369a1', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 13, marginBottom: 16 }}>
                📄 Download PDF SOP ↗
              </a>
            )}
            {sop.steps?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sop.steps.map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, alignItems: 'flex-start' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#0369a1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{step}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {tab === 'onoff' && (
        !sop?.steps?.length ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text3)', fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💡</div>
            No startup/shutdown steps have been documented yet.<br/>Contact the lab manager for guidance.
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>Follow the SOP steps below to properly start up and shut down this equipment:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sop.steps.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: i === 0 ? '#E1F5EE' : i === sop.steps.length - 1 ? '#fef3c7' : 'var(--surface2)', borderRadius: 8, alignItems: 'flex-start', border: i === 0 ? '1px solid #b2dfcb' : i === sop.steps.length - 1 ? '1px solid #fde68a' : '1px solid transparent' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: i === 0 ? '#1D9E75' : i === sop.steps.length - 1 ? '#92400e' : '#0369a1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                    {i === 0 && <span style={{ fontWeight: 700, color: '#1D9E75' }}>START: </span>}
                    {i === sop.steps.length - 1 && <span style={{ fontWeight: 700, color: '#92400e' }}>SHUTDOWN: </span>}
                    {step}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </SectionCard>
  )
}

function MaintenanceSection({ equipment, session, onClose, onGoToInventory }) {
  const fmt = d => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
  const nextDate = equipment.next_maintenance_date ? new Date(equipment.next_maintenance_date) : null
  const isOverdue = nextDate && nextDate < new Date()
  const isStaff = session?.role === 'admin' || session?.role === 'user'

  const InfoRow = ({ label, value }) => value ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--surface2)' }}>
      <div style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0, marginRight: 16 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', textAlign: 'right' }}>{value}</div>
    </div>
  ) : null

  return (
    <SectionCard title="🔧 Calibration" onClose={onClose}>
      {isOverdue && (
        <div style={{ padding: '10px 14px', background: '#fcebeb', border: '1px solid #f5c0c0', borderRadius: 8, fontSize: 13, color: '#a32d2d', marginBottom: 16 }}>
          ⚠️ Maintenance is overdue. Please contact the lab manager.
        </div>
      )}

      {/* Calibration dates */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Last Maintenance', value: fmt(equipment.last_maintenance_date), color: '#0369a1' },
          { label: 'Next Maintenance', value: fmt(equipment.next_maintenance_date), color: isOverdue ? '#c84b2f' : '#1D9E75' },
          { label: 'Interval', value: equipment.maintenance_interval_days ? `${equipment.maintenance_interval_days} days` : '—', color: '#92400e' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Equipment details */}
      <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Equipment Details</div>
        <InfoRow label="Category"        value={equipment.category} />
        <InfoRow label="Location"        value={equipment.location} />
        <InfoRow label="Condition"       value={equipment.condition} />
        <InfoRow label="Manufacturer"    value={equipment.manufacturer} />
        <InfoRow label="Model"           value={equipment.model} />
        <InfoRow label="Serial Number"   value={equipment.serial_number} />
        <InfoRow label="Purchase Date"   value={fmt(equipment.purchase_date)} />
        <InfoRow label="Warranty Expiry" value={fmt(equipment.warranty_expiry)} />
        {equipment.notes && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, borderTop: '1px solid var(--surface2)', paddingTop: 10 }}>
            <span style={{ fontWeight: 600, color: 'var(--text3)' }}>Notes: </span>{equipment.notes}
          </div>
        )}
      </div>

      {/* Staff: link to Equipment List */}
      {isStaff && (
        <button
          onClick={onGoToInventory}
          style={{ width: '100%', padding: '12px', borderRadius: 9, fontSize: 13, fontWeight: 700, background: '#fef3c7', color: '#92400e', border: '1.5px solid #fde68a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          🔧 Edit / Explore in Equipment List →
        </button>
      )}
    </SectionCard>
  )
}




// URL param is the canonical source — survives re-mounts after navigation
const EQ_FROM_URL = new URLSearchParams(window.location.search).get('eq')

export default function EquipmentScan() {
  const { scanEquipmentId, setScreen, session, setScanEquipmentId } = useAppStore()
  const [equipment, setEquipment] = useState(null)
  const [videos, setVideos] = useState([])
  const [sop, setSop] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState(null)
  const isStaff = session?.role === 'admin' || session?.role === 'user'

  // Resolve the equipment ID: prefer store value, fall back to URL param.
  // Re-hydrate the store from URL if the store value was cleared (e.g. after
  // visiting the Booking screen and coming back).
  const resolvedId = scanEquipmentId || EQ_FROM_URL

  useEffect(() => {
    if (!scanEquipmentId && EQ_FROM_URL) setScanEquipmentId(EQ_FROM_URL)
  }, [])

  useEffect(() => {
    if (resolvedId) loadData(resolvedId)
  }, [resolvedId])

  async function loadData(id) {
    setLoading(true)
    try {
      const [eqRes, vidRes, sopRes] = await Promise.all([
        sb.from('equipment_inventory').select('*').eq('id', id).maybeSingle(),
        sb.from('equipment_videos').select('*').eq('equipment_id', id).order('created_at'),
        sb.from('equipment_sop').select('*').eq('equipment_id', id).maybeSingle(),
      ])
      setEquipment(eqRes?.data || null)
      setVideos(vidRes?.data || [])
      setSop(sopRes?.data || null)
    } catch(e) {}
    setLoading(false)
  }

  function handleOption(id) {
    if (id === 'book') {
      if (equipment?.id) setScanEquipmentId(equipment.id)
      setScreen('booking')
      return
    }
    setActiveSection(prev => prev === id ? null : id)
  }

  // Handle case where user navigates to this screen without a scan (e.g., admin)
  function handleEquipmentIdInput(e) {
    if (e.key === 'Enter' && e.target.value.trim()) {
      setScanEquipmentId(e.target.value.trim())
    }
  }

  if (loading && resolvedId) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 320, gap: 14 }}>
      <div className="spinner" />
      <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading equipment info…</div>
    </div>
  )

  if (!resolvedId) return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center', padding: '0 20px' }}>
      <ILabLogo size={64} />
      <div style={{ marginTop: 16, fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Equipment QR Lookup</div>
      <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24, lineHeight: 1.6 }}>
        Scan the QR code on a piece of equipment with your phone camera to access its information, book it, or contact the lab manager.
      </div>
      <div style={{ fontSize: 13, color: 'var(--text3)' }}>Or enter an equipment ID manually:</div>
      <input
        type="text"
        placeholder="Paste equipment UUID…"
        onKeyDown={handleEquipmentIdInput}
        style={{ marginTop: 10, width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: 'var(--mono)', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
      />
    </div>
  )

  if (!equipment) return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center', padding: '0 20px' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Equipment not found</div>
      <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>The QR code may be outdated or the equipment was removed from the system.</div>
      <button className="btn btn-primary" onClick={() => setScreen('dashboard')}>Back to Dashboard</button>
    </div>
  )

  const conditionColor = { Good: '#1D9E75', Fair: '#92400e', Poor: '#a32d2d', 'Out of Service': '#a32d2d' }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Equipment header */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <ILabLogo size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Equipment · ICT Lab
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, marginBottom: 6 }}>
              {equipment.equipment_name}
              {equipment.nickname && <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text3)', marginLeft: 8 }}>({equipment.nickname})</span>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {equipment.category && (
                <span style={{ fontSize: 12, padding: '4px 10px', background: '#e0f2fe', color: '#0369a1', borderRadius: 20, fontWeight: 500 }}>{equipment.category}</span>
              )}
              {equipment.location && (
                <span style={{ fontSize: 12, padding: '4px 10px', background: 'var(--surface2)', color: 'var(--text2)', borderRadius: 20 }}>📍 {equipment.location}</span>
              )}
              {equipment.condition && (
                <span style={{ fontSize: 12, padding: '4px 10px', background: `${conditionColor[equipment.condition]}18`, color: conditionColor[equipment.condition], borderRadius: 20, fontWeight: 500 }}>{equipment.condition}</span>
              )}
              {equipment.out_of_service && (
                <span style={{ fontSize: 12, padding: '4px 10px', background: '#fcebeb', color: '#a32d2d', borderRadius: 20, fontWeight: 700 }}>🚫 Out of Service</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4 option cards */}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        What would you like to do?
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {OPTION_META.map(opt => {
          const isActive = activeSection === opt.id
          const isNavigate = opt.id === 'book'
          return (
            <div key={opt.id}>
              <div
                onClick={() => handleOption(opt.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px 16px',
                  background: isActive ? opt.bg : 'var(--surface)',
                  border: isActive ? `2px solid ${opt.color}` : '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  cursor: 'pointer',
                  transition: 'all 0.13s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = opt.color }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <div style={{ fontSize: 26, flexShrink: 0 }}>{opt.icon}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isActive ? opt.color : 'var(--text)' }}>
                    {opt.label}
                    {equipment.out_of_service && opt.id === 'book' && <span style={{ marginLeft: 8, fontSize: 11, color: '#a32d2d', fontWeight: 400 }}>— Out of service</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{opt.sub}</div>
                </div>

                <div style={{ fontSize: 16, color: isActive ? opt.color : 'var(--text3)', flexShrink: 0, transition: 'transform 0.15s', transform: isActive ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  {isNavigate ? '→' : (isActive ? '▼' : '▶')}
                </div>
              </div>

              {/* Inline expanded sections */}
              {isActive && opt.id === 'sop' && (
                <HowToSection videos={videos} sop={sop} onClose={() => setActiveSection(null)} />
              )}
              {isActive && opt.id === 'calibration' && (
                <MaintenanceSection equipment={equipment} session={session} onClose={() => setActiveSection(null)} onGoToInventory={() => setScreen('equipment')} />
              )}
            </div>
          )
        })}
      </div>

      {/* Back to dashboard */}
      <div style={{ marginTop: 28, textAlign: 'center' }}>
        <button className="btn" onClick={() => setScreen('dashboard')} style={{ fontSize: 13 }}>
          ← Back to Dashboard
        </button>
      </div>
    </div>
  )
}
