import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'


const OPTION_META = [
  { id: 'info',        icon: '🏷️',  label: 'Info',                        sub: 'View details and location',                              color: '#0369a1', bg: '#e0f2fe' },
  { id: 'sop',         icon: '📖',  label: 'Standard Operating Procedure', sub: 'Watch how-to videos, read the SOP, or turn on/off guide', color: '#1D9E75', bg: '#E1F5EE' },
  { id: 'calibration', icon: '🔧',  label: 'Calibration',                  sub: 'Maintenance schedule and records — Lab Manager access',   color: '#92400e', bg: '#fef3c7' },
  { id: 'book',        icon: '📅',  label: 'Book this Equipment',          sub: 'Reserve a time slot on the lab calendar',                 color: '#1D9E75', bg: '#E1F5EE' },
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

function EquipmentInfoSection({ equipment, onClose }) {
  const fmt = d => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
  const condColor = { Good: '#1D9E75', Fair: '#92400e', Poor: '#a32d2d', 'Out of Service': '#a32d2d' }
  const InfoRow = ({ label, value }) => value ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--surface2)' }}>
      <div style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0, marginRight: 16 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', textAlign: 'right' }}>{value}</div>
    </div>
  ) : null
  return (
    <SectionCard title="🏷️ Equipment Info" onClose={onClose}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {equipment.category     && <span style={{ fontSize: 12, padding: '4px 10px', background: '#e0f2fe', color: '#0369a1', borderRadius: 20, fontWeight: 500 }}>{equipment.category}</span>}
        {equipment.location     && <span style={{ fontSize: 12, padding: '4px 10px', background: 'var(--surface2)', color: 'var(--text2)', borderRadius: 20 }}>📍 {equipment.location}</span>}
        {equipment.condition    && <span style={{ fontSize: 12, padding: '4px 10px', background: `${condColor[equipment.condition] || '#888'}18`, color: condColor[equipment.condition] || '#888', borderRadius: 20, fontWeight: 500 }}>{equipment.condition}</span>}
        {equipment.out_of_service && <span style={{ fontSize: 12, padding: '4px 10px', background: '#fcebeb', color: '#a32d2d', borderRadius: 20, fontWeight: 700 }}>🚫 Out of Service</span>}
      </div>
      <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 16px' }}>
        <InfoRow label="Manufacturer"   value={equipment.manufacturer} />
        <InfoRow label="Model"          value={equipment.model} />
        <InfoRow label="Serial Number"  value={equipment.serial_number} />
        <InfoRow label="Purchase Date"  value={fmt(equipment.purchase_date)} />
        <InfoRow label="Warranty"       value={fmt(equipment.warranty_expiry)} />
        {equipment.notes && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, borderTop: '1px solid var(--surface2)', paddingTop: 10 }}>
            <span style={{ fontWeight: 600, color: 'var(--text3)' }}>Notes: </span>{equipment.notes}
          </div>
        )}
      </div>
    </SectionCard>
  )
}

const MTYPE_LABELS = { aggregate: 'Aggregate', asphalt_binder: 'Asphalt Binder', plant_mix: 'Plant Mix', cores: 'Cores', other: 'Other' }

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--surface2)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', width: 110, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{value}</div>
    </div>
  )
}

function MaterialInfoSection({ name, type, project, pid, mtype, sampled, barcode, source, owner, storage, qty, storedDate, onClose }) {
  const typeLabel = type === 'material' ? 'Material / Sample' : 'Item'
  const typeIcon  = type === 'material' ? '🧪' : '📦'
  const hasMaterialDetails = project || pid || mtype || sampled || barcode
  const hasOtherDetails = source || mtype || owner || storage || qty || storedDate
  const hasDetails = type === 'other' ? hasOtherDetails : hasMaterialDetails
  return (
    <SectionCard title={`🏷️ ${typeLabel} Info`} onClose={onClose}>
      <div style={{ padding: '16px 0 8px' }}>
        <div style={{ textAlign: 'center', marginBottom: hasDetails ? 20 : 0 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{typeIcon}</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>{name || 'Unknown Item'}</div>
        </div>
        {type === 'other' ? (
          hasOtherDetails && (
            <div>
              {source     && <InfoRow label="Source / Send From"     value={source} />}
              {mtype      && <InfoRow label="Type / Material / Item" value={mtype} />}
              {owner      && <InfoRow label="PI / Owner"             value={owner} />}
              {storage    && <InfoRow label="Storage Location"       value={storage} />}
              {qty        && <InfoRow label="Total / Weight"         value={qty} />}
              {storedDate && <InfoRow label="Date of Storage"        value={storedDate} />}
            </div>
          )
        ) : (
          hasMaterialDetails && (
            <div>
              {project  && <InfoRow label="Project"       value={project} />}
              {pid      && <InfoRow label="Title"         value={pid} />}
              {mtype    && <InfoRow label="Material Type" value={MTYPE_LABELS[mtype] || mtype} />}
              {sampled  && <InfoRow label="Sampled"       value={sampled} />}
              {barcode  && <InfoRow label="Barcode ID"    value={barcode} />}
            </div>
          )
        )}
      </div>
    </SectionCard>
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




// URL params are the canonical source — evaluated once at load, survive re-mounts
const EQ_FROM_URL        = new URLSearchParams(window.location.search).get('eq')
const SCAN_TYPE          = new URLSearchParams(window.location.search).get('type') || 'equipment'
const SCAN_ITEM_NAME     = new URLSearchParams(window.location.search).get('item') || ''
const SCAN_PROJECT       = new URLSearchParams(window.location.search).get('project') || ''
const SCAN_PID           = new URLSearchParams(window.location.search).get('pid') || ''
const SCAN_MATERIAL_TYPE = new URLSearchParams(window.location.search).get('mtype') || ''
const SCAN_SAMPLED       = new URLSearchParams(window.location.search).get('sampled') || ''
const SCAN_BARCODE       = new URLSearchParams(window.location.search).get('barcode') || ''
const SCAN_SOURCE        = new URLSearchParams(window.location.search).get('source') || ''
const SCAN_OWNER         = new URLSearchParams(window.location.search).get('owner') || ''
const SCAN_STORAGE_LOC   = new URLSearchParams(window.location.search).get('storage') || ''
const SCAN_QTY           = new URLSearchParams(window.location.search).get('qty') || ''
const SCAN_STORED_DATE   = new URLSearchParams(window.location.search).get('stored_date') || ''

export default function EquipmentScan() {
  const { scanEquipmentId, setScreen, session, setScanEquipmentId } = useAppStore()
  const [equipment, setEquipment] = useState(null)
  const [videos, setVideos] = useState([])
  const [sop, setSop] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState(null)
  const isStaff = session?.role === 'admin' || session?.role === 'user'
  const isEquipment = SCAN_TYPE === 'equipment'

  // For equipment labels: resolve the equipment ID (store → URL param)
  const resolvedId = isEquipment ? (scanEquipmentId || EQ_FROM_URL) : null

  useEffect(() => {
    if (isEquipment && !scanEquipmentId && EQ_FROM_URL) setScanEquipmentId(EQ_FROM_URL)
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
    if (id === 'openapp') {
      if (!session) { window.location.href = window.location.origin + '/'; return }
      setScreen('dashboard'); return
    }
    if (id === 'book') {
      if (!session) { window.location.href = window.location.origin + '/'; return }
      if (equipment?.id) setScanEquipmentId(equipment.id)
      setScreen('booking'); return
    }
    setActiveSection(prev => prev === id ? null : id)
  }

  // Handle case where user navigates to this screen without a scan (e.g., admin)
  function handleEquipmentIdInput(e) {
    if (e.key === 'Enter' && e.target.value.trim()) {
      setScanEquipmentId(e.target.value.trim())
    }
  }

  if (isEquipment && loading && resolvedId) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 320, gap: 14 }}>
      <div className="spinner" />
      <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading equipment info…</div>
    </div>
  )

  if (isEquipment && !resolvedId) return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center', padding: '0 20px' }}>
      <img src={import.meta.env.BASE_URL + 'ict-logo.png'} width={64} height={64} style={{ display: 'block', objectFit: 'contain', margin: '0 auto' }} alt="ICT-Lab" />
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

  // When logged in and equipment not found: show error. When public (no session): fall through to show boxes
  if (isEquipment && !equipment && session) return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center', padding: '0 20px' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Equipment not found</div>
      <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>The QR code may be outdated or the equipment was removed from the system.</div>
      <button className="btn btn-primary" onClick={() => setScreen('dashboard')}>Back to Dashboard</button>
    </div>
  )

  const conditionColor = { Good: '#1D9E75', Fair: '#92400e', Poor: '#a32d2d', 'Out of Service': '#a32d2d' }
  const typePrefix = isEquipment ? 'Equipment' : SCAN_TYPE === 'material' ? 'Material' : 'Item'

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Header — equipment name or material name */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <img src={import.meta.env.BASE_URL + 'ict-logo.png'} width={48} height={48} style={{ display: 'block', objectFit: 'contain', flexShrink: 0 }} alt="ICT-Lab" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              {typePrefix} · ICT Lab
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, marginBottom: 6 }}>
              {isEquipment
                ? <>{equipment ? equipment.equipment_name : 'Equipment'}{equipment?.nickname && <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text3)', marginLeft: 8 }}>({equipment.nickname})</span>}</>
                : (SCAN_ITEM_NAME || 'Unlabeled Item')}
            </div>
            {isEquipment && equipment && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
            </div>}
          </div>
        </div>
      </div>

      {/* Login banner for public (unauthenticated) scans */}
      {!session && (
        <div style={{ background: '#fef9ee', border: '1px solid #fde68a', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 22 }}>🔑</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 2 }}>Log in for full access</div>
            <div style={{ fontSize: 12, color: '#92400e', opacity: 0.85 }}>Select an option below — some features require an ICT-Lab account.</div>
          </div>
          <button onClick={() => { window.location.href = window.location.origin + '/' }} style={{ padding: '8px 14px', borderRadius: 8, background: '#92400e', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            Log In →
          </button>
        </div>
      )}

      {/* option cards */}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        What would you like to do?
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {OPTION_META.map(opt => {
          if (opt.id === 'book' && !isEquipment) return null
          const isActive = activeSection === opt.id
          const isNavigate = opt.id === 'openapp' || opt.id === 'book'
          const isLocked =
            (opt.id === 'sop' && !isEquipment) ||
            (opt.id === 'calibration' && (!isEquipment || !isStaff))
          const label = opt.id === 'info'
            ? (isEquipment ? 'Equipment Info' : SCAN_TYPE === 'material' ? 'Material Info' : 'Item Info')
            : opt.label
          const lockNote = opt.id === 'calibration' && !isStaff
            ? '— Lab Manager only'
            : isLocked ? '— Equipment only' : null
          return (
            <div key={opt.id}>
              <div
                onClick={() => isLocked ? undefined : handleOption(opt.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px 16px',
                  background: isActive ? opt.bg : 'var(--surface)',
                  border: isActive ? `2px solid ${opt.color}` : '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  cursor: isLocked ? 'default' : 'pointer',
                  transition: 'all 0.13s',
                  opacity: isLocked ? 0.5 : 1,
                }}
                onMouseEnter={e => { if (!isActive && !isLocked) e.currentTarget.style.borderColor = opt.color }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <div style={{ fontSize: 26, flexShrink: 0 }}>{isLocked ? '🔒' : opt.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isActive ? opt.color : 'var(--text)' }}>
                    {label}
                    {lockNote && <span style={{ marginLeft: 8, fontSize: 11, color: '#92400e', fontWeight: 400 }}>{lockNote}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{opt.sub}</div>
                </div>
                <div style={{ fontSize: 16, color: isActive ? opt.color : 'var(--text3)', flexShrink: 0, transition: 'transform 0.15s', transform: isActive ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  {isNavigate ? '→' : (isActive ? '▼' : '▶')}
                </div>
              </div>

              {isActive && opt.id === 'info' && isEquipment && (
                session && equipment
                  ? <EquipmentInfoSection equipment={equipment} onClose={() => setActiveSection(null)} />
                  : <SectionCard title="🏷️ Equipment Info" onClose={() => setActiveSection(null)}>
                      <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>🔑</div>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Log in to view equipment details</div>
                        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>Equipment information is only available to ICT-Lab users.</div>
                        <button onClick={() => { window.location.href = window.location.origin + '/' }} className="btn btn-primary">Log In to ICT-Lab</button>
                      </div>
                    </SectionCard>
              )}
              {isActive && opt.id === 'info' && !isEquipment && (
                <MaterialInfoSection name={SCAN_ITEM_NAME} type={SCAN_TYPE} project={SCAN_PROJECT} pid={SCAN_PID} mtype={SCAN_MATERIAL_TYPE} sampled={SCAN_SAMPLED} barcode={SCAN_BARCODE} source={SCAN_SOURCE} owner={SCAN_OWNER} storage={SCAN_STORAGE_LOC} qty={SCAN_QTY} storedDate={SCAN_STORED_DATE} onClose={() => setActiveSection(null)} />
              )}
              {isActive && opt.id === 'sop' && (
                session
                  ? <HowToSection videos={videos} sop={sop} onClose={() => setActiveSection(null)} />
                  : <SectionCard title="📖 Standard Operating Procedure" onClose={() => setActiveSection(null)}>
                      <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>🔑</div>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Log in to view SOPs and videos</div>
                        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>Standard operating procedures are only available to ICT-Lab users.</div>
                        <button onClick={() => { window.location.href = window.location.origin + '/' }} className="btn btn-primary">Log In to ICT-Lab</button>
                      </div>
                    </SectionCard>
              )}
              {isActive && opt.id === 'calibration' && (
                isStaff && isEquipment ? (
                  <MaintenanceSection equipment={equipment} session={session} onClose={() => setActiveSection(null)} onGoToInventory={() => setScreen('equipment')} />
                ) : (
                  <SectionCard title="🔧 Calibration" onClose={() => setActiveSection(null)}>
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text3)', fontSize: 13 }}>
                      <div style={{ fontSize: 36, marginBottom: 10 }}>🔒</div>
                      Calibration records are only available to Lab Managers.<br />Contact your lab manager for maintenance information.
                    </div>
                  </SectionCard>
                )
              )}
            </div>
          )
        })}
      </div>

      {/* Back to dashboard / go to login */}
      <div style={{ marginTop: 28, textAlign: 'center' }}>
        {session
          ? <button className="btn" onClick={() => setScreen('dashboard')} style={{ fontSize: 13 }}>← Back to Dashboard</button>
          : <button className="btn" onClick={() => { window.location.href = window.location.origin + '/' }} style={{ fontSize: 13 }}>← Go to ICT-Lab</button>
        }
      </div>
    </div>
  )
}
