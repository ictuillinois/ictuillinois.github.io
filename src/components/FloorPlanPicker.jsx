import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'

// ── Color constants ───────────────────────────────────────────
const C = {
  available_pallet: '#f0efe9',
  available_shelf: '#d4a520',
  selected: '#9FE1CB',
  occupied: '#e24b4a',
  selected_stroke: '#0F6E56',
  occupied_stroke: '#a32d2d',
  shelf_header: '#8b6914',
  floor: '#b06050',
}

// ── ICT room list (shared between ICTMap and ShelfUnitEditor) ─
const ICT_ROOMS = [
  { id: 'ICT-134', label: '134' },
  { id: 'ICT-132', label: '132' },
  { id: 'ICT-133', label: '133' },
  { id: 'ICT-137', label: '137' },
  { id: 'ICT-136', label: '136' },
  { id: 'ICT-HighBayA', label: 'High Bay A (130)' },
  { id: 'ICT-HighBayB', label: 'High Bay B (129)' },
  { id: 'ICT-ServoRoom', label: 'Servo Room (129A)' },
  { id: 'ICT-HighBayC', label: 'High Bay C (128)' },
  { id: 'ICT-127', label: '127' },
  { id: 'ICT-BinderLab', label: 'Binder Lab (126)' },
  { id: 'ICT-SolventRoom', label: 'Solvent Room (125)' },
  { id: 'ICT-VolumetricLab', label: 'Vol Lab (124)' },
  { id: 'ICT-SoilLab', label: 'Soil Lab (123)' },
  { id: 'ICT-REsOffice', label: 'REs (122)' },
  { id: 'ICT-101', label: '101' }, { id: 'ICT-102', label: '102' },
  { id: 'ICT-103', label: '103' }, { id: 'ICT-104', label: '104' },
  { id: 'ICT-104A', label: '104A' }, { id: 'ICT-105', label: '105' },
  { id: 'ICT-106', label: '106' }, { id: 'ICT-107', label: '107' },
  { id: 'ICT-108', label: '108' }, { id: 'ICT-109', label: '109' },
  { id: 'ICT-111', label: '111' }, { id: 'ICT-112', label: '112' },
  { id: 'ICT-113', label: '113' }, { id: 'ICT-114', label: '114' },
  { id: 'ICT-115', label: '115' }, { id: 'ICT-116', label: '116' },
  { id: 'ICT-117', label: '117' }, { id: 'ICT-118', label: '118' },
  { id: 'ICT-119', label: '119' }, { id: 'ICT-119A', label: '119A' },
  { id: 'ICT-122', label: '122' },
]

// default positions for shelf zones placed in their rooms
const ROOM_DEFAULT_POS = {
  'ICT-HighBayB': { x: 300, y: 10, w: 100, h: 50 },
  'ICT-HighBayC': { x: 476, y: 56, w: 148, h: 42 },
  'ICT-HighBayA': { x: 116, y: 10, w: 100, h: 50 },
  'ICT-ServoRoom': { x: 320, y: 90, w: 100, h: 40 },
  'ICT-134': { x: 8, y: 20, w: 46, h: 80 },
  'default': { x: 0, y: 0, w: 60, h: 40 },
}

const DEFAULT_SHELF_UNITS = []

const DEFAULT_FIXED_ZONES = [
  { id: 'ICT-Cooler1', label: 'Cooler 1', x: 118, y: 10, w: 72, h: 40 },
  { id: 'ICT-Cooler2', label: 'Cooler 2', x: 118, y: 54, w: 72, h: 40 },
  { id: 'ICT-ShelfB',  label: 'Shelf',    x: 305, y: 12, w: 150, h: 54 },
  { id: 'ICT-ShelfC',  label: 'Shelf',    x: 479, y: 58, w: 148, h: 38 },
]

// ── Shelf-slot sub-picker (HTML overlay, outside SVG) ─────────
function ShelfUnitPicker({ unit, occupancy, selected, onToggle, onClose }) {
  const unavail = unit.unavailable_shelves || []
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 480, width: '100%', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>📦 {unit.label}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>
          {unit.shelf_label || 'Shelf'} 1 = top · tap a row to select or deselect
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: unit.shelves }, (_, s) => {
            const shelfNum = s + 1
            const shelfName = unit.shelf_names ? (unit.shelf_names[s] || `${unit.shelf_label || 'Shelf'} ${shelfNum}`) : `${unit.shelf_label || 'Shelf'} ${shelfNum}`
            const isUnavail = unavail.includes(shelfName)
            return (
              <div key={shelfNum} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: isUnavail ? 0.45 : 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: isUnavail ? '#999' : 'var(--text2)', minWidth: 90, flexShrink: 0 }}>
                  {shelfName}
                  {isUnavail && <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 4, color: '#c84b2f' }}>(unavailable)</span>}
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Array.from({ length: unit.rows }, (_, r) => {
                    const rowNum = r + 1
                    const slotId = `${unit.id}-S${shelfNum}-R${rowNum}`
                    const isSel = selected.includes(slotId)
                    const occ = occupancy[slotId]
                    const isOcc = occ?.occupied && !isSel
                    const disabled = isOcc || isUnavail
                    return (
                      <button key={rowNum}
                        onClick={() => { if (!disabled) onToggle(slotId, `${unit.label} · ${shelfName} · Row ${rowNum}`) }}
                        title={isUnavail ? 'Marked unavailable by lab manager' : isOcc ? `Occupied by ${occ.project_name || 'another project'}` : `Row ${rowNum}`}
                        style={{ padding: '6px 14px', borderRadius: 6, border: `1.5px solid ${isSel ? C.selected_stroke : isUnavail ? '#bbb' : isOcc ? C.occupied_stroke : '#ccc'}`, background: isSel ? C.selected : isUnavail ? '#e8e8e8' : isOcc ? C.occupied : '#f8f7f4', color: isOcc ? '#fff' : isUnavail ? '#aaa' : '#333', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500 }}>
                        R{rowNum}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

const HIGH_BAY_ROOMS = [
  { id: 'ICT-HighBayB', label: 'High Bay B' },
  { id: 'ICT-HighBayC', label: 'High Bay C' },
]

const BIG_TEN_TEAMS = [
  'Illinois','Indiana','Iowa','Maryland','Michigan','Mich. St.',
  'Minnesota','Nebraska','Northwestern','Ohio St.','Oregon',
  'Penn St.','Purdue','Rutgers','UCLA','USC','Washington','Wisconsin',
]

// ── Shelf-unit admin editor ───────────────────────────────────
function ShelfUnitEditor({ shelfUnits, onSave, onClose }) {
  const [units, setUnits] = useState(shelfUnits)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ room_id: '', label: '', shelf_label: 'Shelf', shelves: 5, rows: 3 })
  const [selectedTeams, setSelectedTeams] = useState([])
  const [editingUnavailId, setEditingUnavailId] = useState(null)
  const [saving, setSaving] = useState(false)

  const isHBC = form.room_id === 'ICT-HighBayC'
  const isHBB = form.room_id === 'ICT-HighBayB'
  const isHBA = form.room_id === 'ICT-HighBayA'

  function handleRoomChange(room_id) {
    if (room_id === 'ICT-HighBayC') {
      setForm(f => ({ ...f, room_id, shelf_label: 'TOP 10 teams' }))
      setSelectedTeams([])
    } else if (room_id === 'ICT-HighBayB') {
      setForm(f => ({ ...f, room_id, shelf_label: 'Shelf', shelves: 1 }))
      setSelectedTeams([])
    } else if (room_id === 'ICT-HighBayA') {
      setForm(f => ({ ...f, room_id, shelf_label: 'Right cooler', shelves: 1, rows: 1 }))
      setSelectedTeams([])
    } else {
      setForm(f => ({ ...f, room_id, shelf_label: 'Shelf', shelves: 5 }))
      setSelectedTeams([])
    }
  }

  function toggleTeam(team) {
    setSelectedTeams(prev => prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team])
  }

  function toggleUnavail(unitId, shelfName) {
    setUnits(prev => prev.map(u => {
      if (u.id !== unitId) return u
      const unavail = u.unavailable_shelves || []
      return {
        ...u,
        unavailable_shelves: unavail.includes(shelfName)
          ? unavail.filter(n => n !== shelfName)
          : [...unavail, shelfName],
      }
    }))
  }

  function addUnit() {
    if (!form.room_id || !form.label.trim()) return
    if (isHBC && selectedTeams.length === 0) return
    const pos = ROOM_DEFAULT_POS[form.room_id] || ROOM_DEFAULT_POS['default']
    const clampedRows = Math.min(4, Math.max(1, parseInt(form.rows) || 1))
    const orderedTeams = BIG_TEN_TEAMS.filter(t => selectedTeams.includes(t))
    const unit = {
      id: `SU-${Date.now()}`,
      room_id: form.room_id,
      label: form.label.trim(),
      shelf_label: isHBC ? 'TOP 10 teams' : (form.shelf_label.trim() || 'Shelf'),
      shelves: isHBC ? orderedTeams.length : isHBA ? 1 : Math.max(1, parseInt(form.shelves) || 5),
      shelf_names: isHBC ? orderedTeams : isHBA ? [form.shelf_label] : undefined,
      rows: isHBA ? 1 : clampedRows,
      ...pos,
    }
    setUnits(prev => [...prev, unit])
    setForm({ room_id: '', label: '', shelf_label: 'Shelf', shelves: 5, rows: 3 })
    setSelectedTeams([])
    setShowForm(false)
  }

  async function save() {
    setSaving(true)
    await onSave(units)
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 520, width: '100%', border: '1px solid var(--border)', marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>✏️ Edit Shelf Units</div>
          <button className="btn btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        {/* existing units */}
        {units.length === 0 && (
          <div style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 16, padding: '12px', background: 'var(--surface2)', borderRadius: 8 }}>No shelf units yet. Click "+ Add shelf unit" to create one.</div>
        )}
        {units.map((u, idx) => {
          const isHBCUnit = u.room_id === 'ICT-HighBayC'
          const isHBAUnit = u.room_id === 'ICT-HighBayA'
          const editingThis = editingUnavailId === u.id
          const unavail = u.unavailable_shelves || []
          return (
            <div key={u.id} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: idx % 2 === 0 ? 'var(--row-a-strong)' : 'var(--row-b-strong)', borderRadius: editingThis ? '8px 8px 0 0' : 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{u.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    {HIGH_BAY_ROOMS.find(r => r.id === u.room_id)?.label || u.room_id}
                    {isHBAUnit
                      ? ` · ${u.shelf_names?.[0] || u.shelf_label || 'Cooler'}`
                      : ` · ${u.shelf_label || 'Shelf'} · ${u.shelves} shelves · ${u.rows} row${u.rows > 1 ? 's' : ''}/shelf`}
                    {unavail.length > 0 && <span style={{ color: '#c84b2f', marginLeft: 6 }}>({unavail.length} unavailable)</span>}
                  </div>
                </div>
                {isHBCUnit && (
                  <button className="btn btn-sm" style={{ fontSize: 11 }}
                    onClick={() => setEditingUnavailId(editingThis ? null : u.id)}>
                    {editingThis ? '▲ Done' : '⚙ Availability'}
                  </button>
                )}
                <button className="btn btn-sm" style={{ color: '#c84b2f', borderColor: '#c84b2f' }} onClick={() => { setEditingUnavailId(null); setUnits(prev => prev.filter(x => x.id !== u.id)) }}>Remove</button>
              </div>
              {editingThis && isHBCUnit && (
                <div style={{ padding: '12px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Mark shelves as unavailable (grayed out for lab users)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                    {(u.shelf_names || []).map(name => (
                      <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, padding: '2px 0', userSelect: 'none' }}>
                        <input type="checkbox" checked={unavail.includes(name)} onChange={() => toggleUnavail(u.id, name)} style={{ width: 'auto', margin: 0 }} />
                        <span style={{ color: unavail.includes(name) ? '#c84b2f' : 'inherit' }}>{name}</span>
                        {unavail.includes(name) && <span style={{ fontSize: 11, color: '#c84b2f' }}>— unavailable</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* add new — toggle form */}
        <button className="btn btn-sm btn-primary" style={{ marginTop: 16, marginBottom: showForm ? 0 : 4 }}
          onClick={() => setShowForm(v => !v)}>
          {showForm ? '▲ Cancel' : '+ Add shelf unit'}
        </button>

        {showForm && (
          <div style={{ marginTop: 14, padding: 16, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div className="field">
              <label>Room <span style={{ color: '#c84b2f' }}>*</span></label>
              <select value={form.room_id} onChange={e => handleRoomChange(e.target.value)}>
                <option value="">— Select room —</option>
                {HIGH_BAY_ROOMS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Label <span style={{ color: '#c84b2f' }}>*</span></label>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. North Shelves" />
            </div>
            <div className="field">
              <label>{isHBA ? 'Cooler' : 'Shelf label'}</label>
              {isHBA ? (
                <select value={form.shelf_label} onChange={e => setForm(f => ({ ...f, shelf_label: e.target.value }))}>
                  <option value="Right cooler">Right cooler</option>
                  <option value="Left cooler">Left cooler</option>
                </select>
              ) : isHBC ? (
                <div style={{ padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text2)', fontWeight: 600 }}>TOP 10 teams</div>
              ) : (
                <input value={form.shelf_label} onChange={e => setForm(f => ({ ...f, shelf_label: e.target.value }))} placeholder="e.g. Shelf, Rack, Bay" />
              )}
            </div>
            {isHBB && (
              <div className="field">
                <label>Number of shelves <span style={{ color: '#c84b2f' }}>*</span></label>
                <select value={form.shelves} onChange={e => setForm(f => ({ ...f, shelves: parseInt(e.target.value) }))}>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
            {isHBC ? (
              <div className="field">
                <label>Select shelves <span style={{ color: '#c84b2f' }}>*</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400, marginLeft: 8 }}>
                    {selectedTeams.length}/{BIG_TEN_TEAMS.length} selected
                  </span>
                </label>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                  <button type="button" className="btn btn-sm" style={{ fontSize: 11 }}
                    onClick={() => setSelectedTeams([])}>Clear</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface)' }}>
                  {BIG_TEN_TEAMS.map(team => (
                    <label key={team} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, padding: '3px 0', userSelect: 'none' }}>
                      <input type="checkbox" checked={selectedTeams.includes(team)} onChange={() => toggleTeam(team)} style={{ width: 'auto', margin: 0 }} />
                      {team}
                    </label>
                  ))}
                </div>
              </div>
            ) : !isHBB && !isHBA ? (
              <div className="field">
                <label>Number of shelves</label>
                <input type="number" min={1} max={30} value={form.shelves} onChange={e => setForm(f => ({ ...f, shelves: e.target.value }))} />
              </div>
            ) : null}
            {!isHBA && (
              <div className="field">
                <label>Rows in the selected shelf <span style={{ fontSize: 11, color: 'var(--text3)' }}>(bottom 1, top 4)</span></label>
                <input type="number" min={1} max={4} value={form.rows}
                  onChange={e => setForm(f => ({ ...f, rows: Math.min(4, Math.max(1, parseInt(e.target.value) || 1)) }))} />
              </div>
            )}
            <button className="btn btn-sm btn-primary" onClick={addUnit} disabled={!form.room_id || !form.label.trim() || (isHBC && selectedTeams.length === 0)}>+ Add</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Tooltip ───────────────────────────────────────────────────
function Tooltip({ x, y, info, onClose }) {
  if (!info) return null
  return (
    <g>
      <rect x={x - 70} y={y - 44} width={140} height={40} rx={4}
        fill="white" stroke="#e24b4a" strokeWidth={1} />
      <text x={x} y={y - 30} textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="#a32d2d" fontWeight="500">{info.project_name || 'Occupied'}</text>
      <text x={x} y={y - 18} textAnchor="middle" fontSize={8} fontFamily="sans-serif" fill="#666">{info.material_type || ''}</text>
    </g>
  )
}

// ══════════════════════════════════════════════════════════════
// ICT BUILDING MAP
// ══════════════════════════════════════════════════════════════
function ICTMap({ occupancy, selected, onToggle, canEdit, shelfUnits = [], onShelfUnitClick,
                  fixedZones = [], editZonesMode = false, onZoneAdded, onZoneDeleted }) {
  const [tooltip, setTooltip] = useState(null)
  const [drawing, setDrawing] = useState(null)   // { x0,y0,x1,y1 } while dragging
  const [pending, setPending] = useState(null)   // { x,y,w,h } waiting for label
  const [pendingLabel, setPendingLabel] = useState('')
  const svgRef = useRef(null)

  function svgCoords(e) {
    const el = svgRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: Math.round((e.clientX - rect.left) * (820 / rect.width)),
      y: Math.round((e.clientY - rect.top)  * (260 / rect.height)),
    }
  }
  function onSVGMouseDown(e) {
    if (!editZonesMode) return
    e.preventDefault()
    const p = svgCoords(e)
    setDrawing({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  function onSVGMouseMove(e) {
    if (!drawing) return
    const p = svgCoords(e)
    setDrawing(d => ({ ...d, x1: p.x, y1: p.y }))
  }
  function onSVGMouseUp(e) {
    if (!drawing) return
    const x = Math.min(drawing.x0, drawing.x1)
    const y = Math.min(drawing.y0, drawing.y1)
    const w = Math.abs(drawing.x1 - drawing.x0)
    const h = Math.abs(drawing.y1 - drawing.y0)
    setDrawing(null)
    if (w < 8 || h < 8) return
    setPending({ x, y, w, h })
    setPendingLabel('')
  }
  function confirmZone() {
    if (!pending) return
    const id = 'ICT-zone-' + Date.now()
    onZoneAdded && onZoneAdded({ id, label: pendingLabel.trim() || 'Box', ...pending })
    setPending(null)
  }

  function getRoomFill(id) {
    if (selected.includes(id)) return C.selected
    if (occupancy[id]?.occupied) return C.occupied
    return '#f8f7f4'
  }
  function getRoomStroke(id) {
    if (selected.includes(id)) return C.selected_stroke
    if (occupancy[id]?.occupied) return C.occupied_stroke
    return '#888'
  }

  function handleClick(id, label, cx, cy) {
    const occ = occupancy[id]
    if (occ?.occupied && !selected.includes(id)) {
      setTooltip({ id, x: cx, y: cy, ...occ })
      return
    }
    setTooltip(null)
    onToggle(id, label, 'ICT')
  }

  const coolers = [
    // High Bay A (130)
    { id: 'ICT-Cooler1', label: 'Cooler 1', x: 118, y: 10, w: 72, h: 40 },
    { id: 'ICT-Cooler2', label: 'Cooler 2', x: 118, y: 54, w: 72, h: 40 },
    // High Bay B (129)
    { id: 'ICT-ShelfB', label: 'Shelf', x: 305, y: 12, w: 150, h: 54 },
    // High Bay C (128)
    { id: 'ICT-ShelfC', label: 'Shelf', x: 479, y: 58, w: 148, h: 38 },
  ]

  const rooms = [
    { id: 'ICT-134', label: '134', x: 6, y: 6, w: 52, h: 140, tx: 32, ty: 80 },
    { id: 'ICT-132', label: '132', x: 60, y: 6, w: 52, h: 100, tx: 86, ty: 58 },
    { id: 'ICT-133', label: '133', x: 60, y: 108, w: 30, h: 38, tx: 75, ty: 130 },
    { id: 'ICT-137', label: '137', x: 92, y: 108, w: 30, h: 38, tx: 107, ty: 130 },
    { id: 'ICT-136', label: '136', x: 124, y: 108, w: 72, h: 38, tx: 160, ty: 130 },
    { id: 'ICT-HighBayA', label: 'High Bay A\n130', x: 114, y: 6, w: 182, h: 100, tx: 205, ty: 52 },
    { id: 'ICT-HighBayB', label: 'High Bay B\n129', x: 298, y: 6, w: 172, h: 80, tx: 384, ty: 44 },
    { id: 'ICT-ServoRoom', label: 'Servo Room\n129A', x: 318, y: 88, w: 132, h: 58, tx: 384, ty: 118 },
    { id: 'ICT-HighBayC', label: 'High Bay C\n128', x: 472, y: 6, w: 162, h: 100, tx: 553, ty: 52 },
    { id: 'ICT-127', label: '127', x: 636, y: 80, w: 38, h: 66, tx: 655, ty: 116 },
    { id: 'ICT-BinderLab', label: 'Binder Lab\n126', x: 676, y: 6, w: 56, h: 58, tx: 704, ty: 32 },
    { id: 'ICT-SolventRoom', label: 'Solvent Rm\n125', x: 734, y: 6, w: 58, h: 58, tx: 763, ty: 32 },
    { id: 'ICT-VolumetricLab', label: 'Vol Lab\n124', x: 676, y: 66, w: 56, h: 56, tx: 704, ty: 92 },
    { id: 'ICT-SoilLab', label: 'Soil Lab\n123', x: 734, y: 66, w: 56, h: 56, tx: 762, ty: 92 },
    { id: 'ICT-REsOffice', label: 'REs\n122', x: 792, y: 6, w: 24, h: 116, tx: 804, ty: 60 },
    { id: 'ICT-101', label: '101', x: 6, y: 158, w: 56, h: 96, tx: 34, ty: 208 },
    { id: 'ICT-102', label: '102', x: 64, y: 158, w: 56, h: 96, tx: 92, ty: 208 },
    { id: 'ICT-103', label: '103', x: 122, y: 158, w: 56, h: 96, tx: 150, ty: 208 },
    { id: 'ICT-104', label: '104', x: 180, y: 158, w: 48, h: 48, tx: 204, ty: 185 },
    { id: 'ICT-104A', label: '104A', x: 180, y: 208, w: 48, h: 46, tx: 204, ty: 234 },
    { id: 'ICT-105', label: '105', x: 230, y: 158, w: 56, h: 96, tx: 258, ty: 208 },
    { id: 'ICT-106', label: '106', x: 288, y: 158, w: 48, h: 48, tx: 312, ty: 185 },
    { id: 'ICT-107', label: '107', x: 288, y: 208, w: 48, h: 46, tx: 312, ty: 234 },
    { id: 'ICT-108', label: '108', x: 338, y: 158, w: 48, h: 96, tx: 362, ty: 208 },
    { id: 'ICT-109', label: '109', x: 388, y: 158, w: 48, h: 96, tx: 412, ty: 208 },
    { id: 'ICT-111', label: '111', x: 438, y: 158, w: 48, h: 96, tx: 462, ty: 208 },
    { id: 'ICT-112', label: '112', x: 488, y: 158, w: 36, h: 48, tx: 506, ty: 185 },
    { id: 'ICT-113', label: '113', x: 488, y: 208, w: 36, h: 46, tx: 506, ty: 234 },
    { id: 'ICT-114', label: '114', x: 526, y: 158, w: 36, h: 48, tx: 544, ty: 185 },
    { id: 'ICT-115', label: '115', x: 526, y: 208, w: 56, h: 46, tx: 554, ty: 234 },
    { id: 'ICT-116', label: '116', x: 584, y: 158, w: 56, h: 96, tx: 612, ty: 208 },
    { id: 'ICT-117', label: '117', x: 642, y: 158, w: 56, h: 96, tx: 670, ty: 208 },
    { id: 'ICT-118', label: '118', x: 700, y: 158, w: 42, h: 96, tx: 721, ty: 208 },
    { id: 'ICT-119', label: '119', x: 744, y: 158, w: 36, h: 60, tx: 762, ty: 190 },
    { id: 'ICT-119A', label: '119A', x: 744, y: 220, w: 36, h: 34, tx: 762, ty: 240 },
    { id: 'ICT-122', label: '122', x: 782, y: 158, w: 34, h: 96, tx: 799, ty: 208 },
  ]

  const drawRect = drawing ? {
    x: Math.min(drawing.x0, drawing.x1), y: Math.min(drawing.y0, drawing.y1),
    w: Math.abs(drawing.x1 - drawing.x0), h: Math.abs(drawing.y1 - drawing.y0),
  } : null

  return (
    <>
    <svg ref={svgRef} viewBox="0 0 820 260" width="100%"
      style={{ minWidth: 600, display: 'block', cursor: editZonesMode ? 'crosshair' : 'default' }}
      onClick={e => { if (e.target === svgRef.current) setTooltip(null) }}
      onMouseDown={onSVGMouseDown}
      onMouseMove={onSVGMouseMove}
      onMouseUp={onSVGMouseUp}
      onMouseLeave={() => setDrawing(null)}>
      <rect x="2" y="2" width="816" height="256" fill="#f5f4f0" stroke="#555" strokeWidth="2" rx="2"/>
      <rect x="6" y="148" width="810" height="8" fill="#ddd"/>

      {/* Room rects + click targets (no text yet — labels rendered last so they sit above coolers) */}
      {rooms.map(r => {
        const cx = r.x + r.w / 2
        const cy = r.y + r.h / 2
        const occ = occupancy[r.id]
        return (
          <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h}
            fill={getRoomFill(r.id)} stroke={getRoomStroke(r.id)} strokeWidth={selected.includes(r.id) ? 2 : 1.2} rx="1"
            style={{ cursor: occ?.occupied && !selected.includes(r.id) ? 'not-allowed' : 'pointer' }}
            onClick={() => handleClick(r.id, r.label.replace('\n', ' '), cx, cy)}/>
        )
      })}

      {/* ── Fixed zones (coolers, shelves — user-configurable) ── */}
      {fixedZones.map(c => {
        const sel = selected.includes(c.id)
        const occ = occupancy[c.id]
        const isOccupied = occ?.occupied && !sel
        const fill = sel ? C.selected : isOccupied ? C.occupied : '#e0f2fe'
        const stroke = editZonesMode ? '#7c3aed' : sel ? C.selected_stroke : isOccupied ? C.occupied_stroke : '#0369a1'
        const cx = c.x + c.w / 2
        const cy = c.y + c.h / 2
        return (
          <g key={c.id}
            style={{ cursor: editZonesMode ? 'default' : isOccupied ? 'not-allowed' : 'pointer' }}
            onClick={e => {
              e.stopPropagation()
              if (editZonesMode) return
              if (isOccupied) { setTooltip({ id: c.id, x: cx, y: cy, ...occ }); return }
              setTooltip(null)
              onToggle(c.id, c.label, 'ICT')
            }}>
            <rect x={c.x} y={c.y} width={c.w} height={c.h} fill={fill}
              stroke={stroke} strokeWidth={editZonesMode ? 1.5 : sel ? 2 : 1.2} rx="2"
              strokeDasharray={editZonesMode ? '4,2' : 'none'}/>
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize={7} fontFamily="sans-serif"
              fill={sel ? '#085041' : '#0369a1'} fontWeight="700" style={{ pointerEvents: 'none' }}>
              {c.label.toLowerCase().includes('shelf') ? '▤' : '❄'}
            </text>
            <text x={cx} y={cy + 6} textAnchor="middle" fontSize={6.5} fontFamily="sans-serif"
              fill={sel ? '#085041' : '#0369a1'} fontWeight="600" style={{ pointerEvents: 'none' }}>
              {c.label}
            </text>
            {/* Delete button in edit mode */}
            {editZonesMode && (
              <g style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onZoneDeleted && onZoneDeleted(c.id) }}>
                <circle cx={c.x + c.w - 5} cy={c.y + 5} r={5} fill="#c84b2f"/>
                <text x={c.x + c.w - 5} y={c.y + 8.5} textAnchor="middle" fontSize={7} fontFamily="sans-serif" fill="#fff" fontWeight="700" style={{ pointerEvents: 'none' }}>×</text>
              </g>
            )}
          </g>
        )
      })}

      {/* Drawing preview */}
      {drawRect && (
        <rect x={drawRect.x} y={drawRect.y} width={drawRect.w} height={drawRect.h}
          fill="rgba(124,58,237,0.12)" stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="4,2"
          style={{ pointerEvents: 'none' }}/>
      )}

      {/* ── Shelf unit zones (configurable large boxes — High Bay A excluded, coolers use fixed zones) ── */}
      {shelfUnits.filter(unit => unit.room_id !== 'ICT-HighBayA').map(unit => {
        // Build all slot IDs for this unit
        const slots = []
        for (let s = 1; s <= unit.shelves; s++)
          for (let r = 1; r <= unit.rows; r++)
            slots.push(`${unit.id}-S${s}-R${r}`)

        const hasSelected = slots.some(id => selected.includes(id))
        const hasOccupied = slots.some(id => occupancy[id]?.occupied && !selected.includes(id))
        const fill = hasSelected ? C.selected : hasOccupied ? '#fde8e8' : '#fef9ec'
        const stroke = hasSelected ? C.selected_stroke : hasOccupied ? C.occupied_stroke : '#c8a000'
        const selectedCount = slots.filter(id => selected.includes(id)).length
        const cx = unit.x + unit.w / 2
        const cy = unit.y + unit.h / 2

        return (
          <g key={unit.id} style={{ cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); onShelfUnitClick && onShelfUnitClick(unit) }}>
            <rect x={unit.x} y={unit.y} width={unit.w} height={unit.h}
              fill={fill} stroke={stroke} strokeWidth={hasSelected ? 2 : 1.5} rx="3" strokeDasharray={hasSelected ? 'none' : '4,2'}/>
            {/* icon */}
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize={10} fontFamily="sans-serif">📦</text>
            <text x={cx} y={cy + 6} textAnchor="middle" fontSize={7} fontFamily="sans-serif" fill={hasSelected ? '#085041' : '#6b4e00'} fontWeight="600">
              {unit.label.length > 16 ? unit.label.slice(0, 14) + '…' : unit.label}
            </text>
            {selectedCount > 0 && (
              <g>
                <circle cx={unit.x + unit.w - 6} cy={unit.y + 6} r={6} fill={C.selected_stroke}/>
                <text x={unit.x + unit.w - 6} y={unit.y + 10} textAnchor="middle" fontSize={6} fontFamily="sans-serif" fill="#fff" fontWeight="700">{selectedCount}</text>
              </g>
            )}
          </g>
        )
      })}

      {/* Room labels — rendered last so they appear above cooler boxes */}
      {rooms.map(r => {
        const lines = r.label.split('\n')
        const occ = occupancy[r.id]
        return lines.map((line, i) => (
          <text key={`${r.id}-lbl-${i}`} x={r.tx} y={r.ty + (i - (lines.length - 1) / 2) * 13}
            textAnchor="middle" fontSize={r.w < 40 ? 8 : 10} fontFamily="sans-serif"
            fill={occ?.occupied && !selected.includes(r.id) ? '#fff' : '#333'} fontWeight="500"
            style={{ pointerEvents: 'none' }}>
            {line}
          </text>
        ))
      })}

      {tooltip && <Tooltip x={tooltip.x} y={tooltip.y} info={tooltip} onClose={() => setTooltip(null)} />}
    </svg>

    {/* Label dialog — shown after user finishes drawing a box */}
    {pending && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 24, width: 280, border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Name this box</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>Position saved — enter a label for the new box.</div>
          <input autoFocus value={pendingLabel} onChange={e => setPendingLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmZone(); if (e.key === 'Escape') setPending(null) }}
            placeholder="e.g. Cooler, Shelf, Freezer…"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-sm" onClick={() => setPending(null)}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={confirmZone}>Add box</button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// MPF MAP
// ══════════════════════════════════════════════════════════════
function MPFMap({ occupancy, selected, onToggle, canEdit }) {
  const [tooltip, setTooltip] = useState(null)

  function getFill(id, isShelf) {
    if (selected.includes(id)) return C.selected
    if (occupancy[id]?.occupied) return C.occupied
    return isShelf ? C.available_shelf : C.available_pallet
  }
  function getStroke(id, isShelf) {
    if (selected.includes(id)) return C.selected_stroke
    if (occupancy[id]?.occupied) return C.occupied_stroke
    return isShelf ? C.shelf_header : '#999'
  }

  function handleClick(id, label, cx, cy) {
    const occ = occupancy[id]
    if (occ?.occupied && !selected.includes(id)) {
      setTooltip({ id, x: cx, y: cy, ...occ })
      return
    }
    setTooltip(null)
    onToggle(id, label, 'MPF')
  }

  // Shelves: 4 shelves x 3 rows
  const shelves = [
    { id: 'MPF-SD', label: 'Shelf D', hx: 40, hy: 30, rows: [
      { id: 'MPF-SD-R1', label: 'Shelf D · Row 1', x: 40, y: 50, w: 140, h: 26 },
      { id: 'MPF-SD-R2', label: 'Shelf D · Row 2', x: 40, y: 78, w: 140, h: 26 },
      { id: 'MPF-SD-R3', label: 'Shelf D · Row 3', x: 40, y: 106, w: 140, h: 26 },
    ]},
    { id: 'MPF-SC', label: 'Shelf C', hx: 330, hy: 30, rows: [
      { id: 'MPF-SC-R1', label: 'Shelf C · Row 1', x: 330, y: 50, w: 140, h: 26 },
      { id: 'MPF-SC-R2', label: 'Shelf C · Row 2', x: 330, y: 78, w: 140, h: 26 },
      { id: 'MPF-SC-R3', label: 'Shelf C · Row 3', x: 330, y: 106, w: 140, h: 26 },
    ]},
    { id: 'MPF-SB', label: 'Shelf B', hx: 330, hy: 200, rows: [
      { id: 'MPF-SB-R1', label: 'Shelf B · Row 1', x: 330, y: 220, w: 140, h: 26 },
      { id: 'MPF-SB-R2', label: 'Shelf B · Row 2', x: 330, y: 248, w: 140, h: 26 },
      { id: 'MPF-SB-R3', label: 'Shelf B · Row 3', x: 330, y: 276, w: 140, h: 26 },
    ]},
    { id: 'MPF-SA', label: 'Shelf A', hx: 330, hy: 360, rows: [
      { id: 'MPF-SA-R1', label: 'Shelf A · Row 1', x: 330, y: 380, w: 140, h: 26 },
      { id: 'MPF-SA-R2', label: 'Shelf A · Row 2', x: 330, y: 408, w: 140, h: 26 },
      { id: 'MPF-SA-R3', label: 'Shelf A · Row 3', x: 330, y: 436, w: 140, h: 26 },
    ]},
  ]

  // Floor pallets
  const palletGroups = [
    // Left column
    [34,35,36].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:40+i*37, y:178, w:32, h:24 })),
    [28,29,30].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:40+i*37, y:215, w:32, h:24 })),
    [22,23,24].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:40+i*37, y:252, w:32, h:24 })),
    [16,17,18].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:40+i*37, y:300, w:32, h:24 })),
    [10,11,12].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:40+i*37, y:337, w:32, h:24 })),
    [4,5,6].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:40+i*37, y:374, w:32, h:24 })),
    // Right column
    [31,32,33].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:190+i*37, y:178, w:32, h:24 })),
    [25,26,27].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:190+i*37, y:215, w:32, h:24 })),
    [19,20,21].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:190+i*37, y:252, w:32, h:24 })),
    [13,14,15].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:190+i*37, y:300, w:32, h:24 })),
    [7,8,9].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:190+i*37, y:337, w:32, h:24 })),
    [1,2,3].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:190+i*37, y:374, w:32, h:24 })),
  ].flat()

  return (
    <svg viewBox="0 0 540 500" width="100%" style={{ minWidth: 340, maxWidth: 520, display: 'block', margin: '0 auto' }}
      onClick={e => { if (e.target.tagName === 'svg') setTooltip(null) }}>
      <rect x="2" y="2" width="536" height="496" fill={C.floor} stroke="#555" strokeWidth="2" rx="2"/>

      {/* Shelves */}
      {shelves.map(shelf => (
        <g key={shelf.id}>
          <rect x={shelf.hx} y={shelf.hy} width={140} height={18} fill={C.shelf_header} rx="2"/>
          <text x={shelf.hx + 70} y={shelf.hy + 13} textAnchor="middle" fontSize={11} fontFamily="sans-serif" fill="#fff" fontWeight="500">{shelf.label}</text>
          {shelf.rows.map(row => {
            const occ = occupancy[row.id]
            const cx = row.x + row.w / 2
            const cy = row.y + row.h / 2
            return (
              <g key={row.id} style={{ cursor: occ?.occupied && !selected.includes(row.id) ? 'not-allowed' : 'pointer' }}
                onClick={() => handleClick(row.id, row.label, cx, cy)}>
                <rect x={row.x} y={row.y} width={row.w} height={row.h} rx="2"
                  fill={getFill(row.id, true)} stroke={getStroke(row.id, true)} strokeWidth={selected.includes(row.id) ? 2 : 1}/>
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9} fontFamily="sans-serif"
                  fill={occ?.occupied && !selected.includes(row.id) ? '#fff' : '#3d2a00'}>
                  {row.label.split('·')[1]?.trim() || row.label}
                </text>
              </g>
            )
          })}
        </g>
      ))}

      {/* Floor pallets */}
      {palletGroups.map(p => {
        const occ = occupancy[p.id]
        const cx = p.x + p.w / 2
        const cy = p.y + p.h / 2
        return (
          <g key={p.id} style={{ cursor: occ?.occupied && !selected.includes(p.id) ? 'not-allowed' : 'pointer' }}
            onClick={() => handleClick(p.id, p.label, cx, cy)}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="2"
              fill={getFill(p.id, false)} stroke={getStroke(p.id, false)} strokeWidth={selected.includes(p.id) ? 2 : 1}/>
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9} fontFamily="sans-serif"
              fill={occ?.occupied && !selected.includes(p.id) ? '#fff' : '#333'}>
              {p.label.replace('Pallet ', '')}
            </text>
          </g>
        )
      })}

      {/* Center label */}
      <text x="230" y="155" textAnchor="middle" fontSize={11} fontFamily="sans-serif" fill="#f5e0d0" fontWeight="500">0101 · N/A</text>

      {/* Doors */}
      <rect x="155" y="490" width="60" height="6" fill="#777" rx="1"/>
      <rect x="290" y="490" width="60" height="6" fill="#777" rx="1"/>

      {tooltip && <Tooltip x={tooltip.x} y={tooltip.y} info={tooltip} onClose={() => setTooltip(null)} />}
    </svg>
  )
}

// ══════════════════════════════════════════════════════════════
// CUSTOM FLOOR PLAN TAB (org-uploaded image + drawn zones)
// ══════════════════════════════════════════════════════════════
function CustomPlanTab({ plan, selected, onToggle, occupancy, canEdit }) {
  function getZoneStyle(zone) {
    const sel = selected.includes(zone.id)
    const occ = occupancy[zone.id]?.occupied && !sel
    return {
      position: 'absolute',
      left: `${zone.x}%`, top: `${zone.y}%`,
      width: `${zone.w}%`, height: `${zone.h}%`,
      border: `2px solid ${sel ? '#0F6E56' : occ ? '#a32d2d' : 'var(--accent)'}`,
      background: sel ? 'rgba(159,225,203,0.45)' : occ ? 'rgba(226,75,74,0.35)' : 'rgba(83,74,183,0.15)',
      borderRadius: 4, boxSizing: 'border-box',
      cursor: occ ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'background 0.12s, border-color 0.12s',
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      <img src={plan.image_url} alt={plan.name} draggable={false}
        style={{ display: 'block', width: '100%', userSelect: 'none' }} />
      {(plan.zones || []).map(zone => {
        const occ = occupancy[zone.id]
        const sel = selected.includes(zone.id)
        return (
          <div key={zone.id} style={getZoneStyle(zone)}
            onClick={() => {
              if (!canEdit) return
              if (occ?.occupied && !sel) return
              onToggle(zone.id, zone.label, plan.name)
            }}
            title={occ?.occupied && !sel ? `Occupied by ${occ.project_name || 'another project'}` : zone.label}>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: sel ? '#0F6E56' : occ?.occupied && !sel ? '#fff' : 'var(--accent)',
              background: sel || (occ?.occupied && !sel) ? 'transparent' : 'rgba(255,255,255,0.88)',
              padding: '1px 6px', borderRadius: 4,
              maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}>
              {zone.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN FLOOR PLAN PICKER
// ══════════════════════════════════════════════════════════════
export default function FloorPlanPicker({ projectId, projectName, materialId, materialType, currentLocations = [], onConfirm, onClose, viewOnly = false }) {
  const { session } = useAppStore()
  const [customPlans, setCustomPlans] = useState([])
  const [facility, setFacility] = useState(null)
  const [occupancy, setOccupancy] = useState({})
  const [selected, setSelected] = useState(
    currentLocations.map(l => l.location_id).filter(Boolean)
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [shelfUnits, setShelfUnits] = useState(DEFAULT_SHELF_UNITS)
  const [activeShelfUnit, setActiveShelfUnit] = useState(null)
  const [showShelfEditor, setShowShelfEditor] = useState(false)
  const [fixedZones, setFixedZones] = useState(DEFAULT_FIXED_ZONES)
  const [editingZones, setEditingZones] = useState(false)
  const canEdit = !!session
  const isSolo = session?.loginMode === 'solo'
  const isICTOrg = true  // ictlab is always the ICT org
  // ictlab: both org admin and lab manager can edit shelf unit layout
  const canEditLayout = !viewOnly && (session?.role === 'admin' || session?.role === 'user')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const orgId = session?.organizationId
    const isSolo = session?.loginMode === 'solo'

    let locQuery = sb.from('storage_locations').select('*')
    if (isSolo) {
      locQuery = locQuery.is('organization_id', null)
    } else if (orgId) {
      locQuery = locQuery.eq('organization_id', orgId)
    } else {
      locQuery = locQuery.eq('organization_id', '00000000-0000-0000-0000-000000000000')
    }

    const [{ data: locData }, { data: planData }, { data: shelfData }, { data: fzData }] = await Promise.all([
      locQuery,
      orgId
        ? sb.from('floor_plans').select('*').eq('organization_id', orgId).order('created_at')
        : Promise.resolve({ data: [] }),
      sb.from('ict_layout').select('value').eq('key', 'ict_shelf_units').single(),
      sb.from('ict_layout').select('value').eq('key', 'ict_fixed_zones').single(),
    ])

    const map = {}
    ;(locData || []).forEach(loc => {
      map[loc.location_id] = {
        occupied: loc.occupied,
        project_name: loc.project_name,
        material_type: loc.material_type,
        db_id: loc.id,
      }
    })
    setOccupancy(map)

    const plans = planData || []
    setCustomPlans(plans)

    if (shelfData?.value) {
      try { setShelfUnits(JSON.parse(shelfData.value)) } catch {}
    }
    if (fzData?.value) {
      try { setFixedZones(JSON.parse(fzData.value)) } catch {}
    }

    // Default tab: first custom plan if any, else ICT Building
    if (plans.length > 0) setFacility(`custom_${plans[0].id}`)
    else setFacility('ICT')

    setLoading(false)
  }

  function toggleLocation(id, label, fac) {
    if (!canEdit) return
    setSelected(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  function getLocationDetail(id) {
    // Shelf-unit slot: e.g. ICT-HBB-S2-R1
    const shelfMatch = id.match(/^(.+)-S(\d+)-R(\d+)$/)
    if (shelfMatch) {
      const unitId = shelfMatch[1]
      const unit = shelfUnits.find(u => u.id === unitId)
      const label = unit ? `${unit.label} · Shelf ${shelfMatch[2]} · Row ${shelfMatch[3]}` : id
      return { location: 'ICT Building', detail: label, facility: 'ICT' }
    }
    // Custom plan zones
    for (const plan of customPlans) {
      const zone = (plan.zones || []).find(z => z.id === id)
      if (zone) return { location: plan.name, detail: zone.label, facility: plan.name }
    }
    // ICT/MPF fallback
    return {
      location: id.startsWith('MPF') ? 'MPF' : 'ICT Building',
      detail: id,
      facility: id.startsWith('MPF') ? 'MPF' : 'ICT',
    }
  }

  async function saveShelfUnits(units) {
    setShelfUnits(units)
    await sb.from('ict_layout').upsert({ key: 'ict_shelf_units', value: JSON.stringify(units) }, { onConflict: 'key' })
    setShowShelfEditor(false)
  }

  async function saveFixedZones(zones) {
    setFixedZones(zones)
    const { error } = await sb.from('ict_layout').upsert(
      { key: 'ict_fixed_zones', value: JSON.stringify(zones) },
      { onConflict: 'key' }
    )
    if (error) {
      console.error('saveFixedZones failed:', error)
      alert('Box layout could not be saved: ' + (error.message || error.code || 'unknown error'))
    }
  }

  async function confirm() {
    if (!canEdit) { onConfirm([]); onClose(); return }
    setSaving(true)
    try {
      // Get previously assigned locations for this material
      const { data: existing } = await sb.from('storage_locations')
        .select('*').eq('material_id', materialId)

      const existingIds = (existing || []).map(e => e.location_id)

      // Release locations no longer selected
      const toRelease = existingIds.filter(id => !selected.includes(id))
      for (const id of toRelease) {
        await sb.from('storage_locations').update({
          occupied: false, project_id: null, material_id: null,
          project_name: null, material_type: null,
          occupied_at: null, occupied_by: null,
        }).eq('location_id', id)
      }

      // Occupy newly selected locations
      const toOccupy = selected.filter(id => !existingIds.includes(id))
      const isSolo = session?.loginMode === 'solo'
      const orgId = session?.organizationId || null
      for (const id of toOccupy) {
        const det = getLocationDetail(id)
        let locLookup = sb.from('storage_locations').select('id').eq('location_id', id)
        if (isSolo) locLookup = locLookup.is('organization_id', null)
        else locLookup = locLookup.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
        const { data: existing_loc } = await locLookup.single()
        const payload = {
          location_id: id,
          location_label: det.detail,
          facility: det.facility,
          occupied: true,
          project_id: projectId,
          material_id: materialId,
          project_name: projectName,
          material_type: materialType,
          occupied_at: new Date().toISOString(),
          occupied_by: session?.username,
          organization_id: isSolo ? null : orgId,
        }
        if (existing_loc) {
          await sb.from('storage_locations').update(payload).eq('location_id', id)
        } else {
          await sb.from('storage_locations').insert(payload)
        }
      }

      // Return selected as location objects
      const result = selected.map(id => {
        const det = getLocationDetail(id)
        return { location_id: id, location: det.location, detail: det.detail }
      })
      onConfirm(result)
      onClose()
    } catch (e) {
      console.error(e)
    }
    setSaving(false)
  }

  // Legend
  const legend = [
    { color: '#f0efe9', border: '#999', label: 'Available (pallet)' },
    { color: '#d4a520', border: '#8b6914', label: 'Available (shelf row)' },
    { color: '#fef9ec', border: '#c8a000', label: 'Shelf unit (tap to pick row)' },
    { color: '#9FE1CB', border: '#0F6E56', label: 'Selected' },
    { color: '#e24b4a', border: '#a32d2d', label: 'Occupied' },
  ]

  return (
    <>
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 900, border: '1px solid var(--border)', marginTop: 16 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{viewOnly ? '🗺️ Floor Map — Storage Locations' : 'Select storage location'}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{viewOnly ? 'Tap an occupied location to see project and material info' : 'Tap to select · Occupied locations show project info on tap'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {canEditLayout && facility === 'ICT' && !editingZones && (
              <button className="btn btn-sm" onClick={() => setShowShelfEditor(true)} style={{ fontSize: 13 }}>✏️ Edit shelves</button>
            )}
            {canEditLayout && facility === 'ICT' && (
              <button className="btn btn-sm" onClick={() => setEditingZones(v => !v)}
                style={{ fontSize: 13, background: editingZones ? '#7c3aed' : undefined, color: editingZones ? '#fff' : undefined, borderColor: editingZones ? '#7c3aed' : undefined }}>
                {editingZones ? '✓ Done' : '⊞ Edit boxes'}
              </button>
            )}
            <button className="btn btn-sm" onClick={onClose}>✕ Close</button>
          </div>
        </div>

        {/* Facility tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
          {customPlans.map(plan => (
            <button key={plan.id} onClick={() => setFacility(`custom_${plan.id}`)}
              style={{ padding: '10px 16px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: facility === `custom_${plan.id}` ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${facility === `custom_${plan.id}` ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              🗺️ {plan.name}
            </button>
          ))}
          {isICTOrg && ['ICT', 'MPF'].map(f => (
            <button key={f} onClick={() => setFacility(f)}
              style={{ padding: '10px 16px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: facility === f ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${facility === f ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              {f === 'ICT' ? 'ICT Building' : 'MPF'}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {legend.map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text2)' }}>
              <div style={{ width: 14, height: 10, borderRadius: 2, background: l.color, border: `1px solid ${l.border}` }} />
              {l.label}
            </div>
          ))}
        </div>

        {/* Map */}
        <div style={{ padding: 16, overflowX: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : !facility ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 14 }}>No floor plans available. Ask your admin to add a floor plan.</div>
          ) : facility.startsWith('custom_') ? (() => {
            const plan = customPlans.find(p => `custom_${p.id}` === facility)
            return plan ? <CustomPlanTab plan={plan} selected={selected} onToggle={toggleLocation} occupancy={occupancy} canEdit={!viewOnly && canEdit} /> : null
          })() : facility === 'ICT' ? (
            <ICTMap occupancy={occupancy} selected={selected} onToggle={toggleLocation} canEdit={!viewOnly && canEdit}
              shelfUnits={shelfUnits} onShelfUnitClick={!viewOnly ? setActiveShelfUnit : null}
              fixedZones={fixedZones}
              editZonesMode={editingZones}
              onZoneAdded={zone => saveFixedZones([...fixedZones, zone])}
              onZoneDeleted={id => saveFixedZones(fixedZones.filter(z => z.id !== id))} />
          ) : (
            <MPFMap occupancy={occupancy} selected={selected} onToggle={toggleLocation} canEdit={!viewOnly && canEdit} />
          )}
        </div>

        {/* Selected chips (hidden in view-only mode) */}
        {!viewOnly && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface2)', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {selected.length === 0
              ? <span style={{ fontSize: 12, color: 'var(--text3)' }}>No locations selected — tap a zone or room above</span>
              : selected.map(id => {
                  const det = getLocationDetail(id)
                  return (
                    <span key={id} style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 99, padding: '4px 10px 4px 12px', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      📍 {det.detail !== id ? det.detail : id.replace('ICT-', '').replace('MPF-', 'MPF ')}
                      {canEdit && <button onClick={() => toggleLocation(id, '', '')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>}
                    </span>
                  )
                })
            }
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {viewOnly ? (
            <button className="btn btn-primary" onClick={onClose}>Close</button>
          ) : (
            <>
              <button className="btn" onClick={onClose}>Cancel</button>
              {canEdit && (
                <button className="btn btn-primary" onClick={confirm} disabled={saving || selected.length === 0}>
                  {saving ? 'Saving…' : `Confirm ${selected.length} location${selected.length !== 1 ? 's' : ''}`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>

    {activeShelfUnit && (
      <ShelfUnitPicker
        unit={activeShelfUnit}
        occupancy={occupancy}
        selected={selected}
        onToggle={(slotId, label) => toggleLocation(slotId, label, 'ICT')}
        onClose={() => setActiveShelfUnit(null)}
      />
    )}

    {showShelfEditor && (
      <ShelfUnitEditor
        shelfUnits={shelfUnits}
        onSave={saveShelfUnits}
        onClose={() => setShowShelfEditor(false)}
      />
    )}
    </>
  )
}
