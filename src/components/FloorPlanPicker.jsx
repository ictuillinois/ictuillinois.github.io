import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'
import { sendTaskNotification } from '../lib/notify'

export function formatLocation(loc) {
  if (!loc) return ''
  if (loc.location && loc.detail && loc.location !== loc.detail) return `${loc.location} — ${loc.detail}`
  return loc.detail || loc.location || ''
}

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

// ── ICT room list (used to resolve a spot's room label outside the SVG) ─
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

// ── Racks: shelves and places (Oct 2026) ────────────────────────
// Shelves are lettered from the TOP: A = the top shelf (the old "Shelf 1").
// A rack spot may divide every shelf into places (placesPerShelf). A place is
// named by its shelf letter and number — A1, A2, A3 — and has its own id:
//   <spot>-R<rack>-S<shelf>           whole shelf   (placesPerShelf = 1)
//   <spot>-R<rack>-S<shelf>-P<place>  one place     (placesPerShelf > 1)
// In the spot window a shelf is one row; clicking it lists its places
// A1, A2, A3 underneath to choose from.
export const shelfLetter = n => String.fromCharCode(64 + Number(n))
const RACK_SLOT = /^(.+)-R(\d+)-S(\d+)(?:-P(\d+))?$/
const placeCount = spot => Math.max(1, parseInt(spot?.placesPerShelf) || 1)
function slotName(spot, r, sh, pl) {
  const rack = spot?.rackNames?.[r - 1] || `Rack ${r}`
  return pl ? `${rack} · ${shelfLetter(sh)}${pl}` : `${rack} · Shelf ${shelfLetter(sh)}`
}
const APP_PROJECTS_URL = 'https://ictlab.labhive.app/?screen=projects'

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
function ICTMap({ occupancy, selected, onToggle, canEdit, spots = [],
                  editingSpots = false, onSpotAdded, onSpotUpdated, onSpotDeleted, onSpotView, disableRoomSelect = false }) {
  const [tooltip, setTooltip] = useState(null)
  const [newSpotRoom, setNewSpotRoom] = useState('')
  const [draftSpot, setDraftSpot] = useState(null)   // { id?, room_id, x, y, name, type, rackNames, shelvesPerRack } — id present = editing an existing spot
  const [draggingDraft, setDraggingDraft] = useState(false)
  const [pickMode, setPickMode] = useState(false)
  const [pendingRoomConfirm, setPendingRoomConfirm] = useState(null)   // { x, y, room_id, room_label }
  const [liveDragPos, setLiveDragPos] = useState(null)   // { id, x, y } — live position of a saved spot being dragged
  const svgRef = useRef(null)
  const dragSpotIdRef = useRef(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const dragMovedRef = useRef(false)
  const rotatingRef = useRef(false)

  function svgCoords(e) {
    const el = svgRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: Math.round((e.clientX - rect.left) * (820 / rect.width)),
      y: Math.round((e.clientY - rect.top)  * (260 / rect.height)),
    }
  }
  function onRotationHandleMouseDown(e) {
    e.preventDefault()
    e.stopPropagation()
    rotatingRef.current = true
  }
  function findRoomAt(x, y) {
    return rooms.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
  }
  function onMapClickForPick(e) {
    if (!pickMode) return
    const p = svgCoords(e)
    const room = findRoomAt(p.x, p.y)
    if (!room) { alert('Please click inside a room.'); return }
    setPendingRoomConfirm({ x: p.x, y: p.y, room_id: room.id, room_label: room.label.replace('\n', ' ') })
  }
  function confirmRoomPick() {
    if (!pendingRoomConfirm) return
    setDraftSpot({ id: null, room_id: pendingRoomConfirm.room_id, x: pendingRoomConfirm.x, y: pendingRoomConfirm.y, name: '', type: 'pallet', rackNames: ['Rack 1'], shelvesPerRack: 1, rotation: 0 })
    setPendingRoomConfirm(null)
    setPickMode(false)
  }
  function startDraft() {
    const room = rooms.find(r => r.id === newSpotRoom)
    if (!room) return
    setDraftSpot({ id: null, room_id: room.id, x: room.x + room.w / 2, y: room.y + room.h / 2, name: '', type: 'pallet', rackNames: ['Rack 1'], shelvesPerRack: 1, rotation: 0 })
  }
  function editSpot(spot) {
    setDraftSpot({ ...spot, rackNames: spot.rackNames ? [...spot.rackNames] : ['Rack 1'], rotation: spot.rotation || 0 })
    setNewSpotRoom(spot.room_id)
  }
  function onDraftMouseDown(e) {
    e.preventDefault()
    e.stopPropagation()
    setDraggingDraft(true)
  }
  function onSpotMouseDown(e, spot) {
    if (!editingSpots) return
    e.preventDefault()
    e.stopPropagation()
    dragSpotIdRef.current = spot.id
    dragMovedRef.current = false
    dragStartRef.current = svgCoords(e)
    setLiveDragPos({ id: spot.id, x: spot.x, y: spot.y })
  }
  function onSpotClick(e, spot) {
    e.stopPropagation()
    if (editingSpots) {
      if (!dragMovedRef.current) editSpot(spot)
      dragMovedRef.current = false
      return
    }
    // Everyone can see what's stored where and who's in charge — just can't edit/move the spot.
    onSpotView && onSpotView(spot.id)
  }
  function onSVGMouseMove(e) {
    if (rotatingRef.current && draftSpot) {
      const p = svgCoords(e)
      const dx = p.x - draftSpot.x, dy = p.y - draftSpot.y
      const angle = Math.round((((Math.atan2(dx, -dy) * 180 / Math.PI) % 360) + 360) % 360)
      setDraftSpot(d => d && ({ ...d, rotation: angle }))
      return
    }
    if (draggingDraft) {
      const p = svgCoords(e)
      setDraftSpot(d => d && ({ ...d, x: p.x, y: p.y }))
      return
    }
    if (dragSpotIdRef.current) {
      const p = svgCoords(e)
      if (Math.abs(p.x - dragStartRef.current.x) > 2 || Math.abs(p.y - dragStartRef.current.y) > 2) dragMovedRef.current = true
      setLiveDragPos({ id: dragSpotIdRef.current, x: p.x, y: p.y })
    }
  }
  function onSVGMouseUp() {
    rotatingRef.current = false
    setDraggingDraft(false)
    if (dragSpotIdRef.current) {
      const id = dragSpotIdRef.current
      if (dragMovedRef.current && liveDragPos) {
        const spot = spots.find(s => s.id === id)
        if (spot) {
          onSpotUpdated && onSpotUpdated({ ...spot, x: liveDragPos.x, y: liveDragPos.y })
          setDraftSpot(d => (d && d.id === id) ? { ...d, x: liveDragPos.x, y: liveDragPos.y } : d)
        }
      }
      dragSpotIdRef.current = null
      setLiveDragPos(null)
    }
  }
  function setRackCount(n) {
    const count = Math.max(1, parseInt(n) || 1)
    setDraftSpot(d => {
      const names = d.rackNames || []
      return { ...d, rackNames: Array.from({ length: count }, (_, i) => names[i] || `Rack ${i + 1}`) }
    })
  }
  function renameRack(i, value) {
    setDraftSpot(d => {
      const next = [...(d.rackNames || [])]
      next[i] = value
      return { ...d, rackNames: next }
    })
  }
  function confirmDraft() {
    if (!draftSpot || !draftSpot.name.trim()) return
    const spot = {
      id: draftSpot.id || ('spot_' + Date.now()),
      name: draftSpot.name.trim(),
      facility: 'ICT',
      room_id: draftSpot.room_id,
      x: draftSpot.x, y: draftSpot.y,
      type: draftSpot.type,
      rotation: parseInt(draftSpot.rotation) || 0,
      ...(draftSpot.type === 'racks' ? {
        rackNames: (draftSpot.rackNames?.length ? draftSpot.rackNames : ['Rack 1']).map((n, i) => n.trim() || `Rack ${i + 1}`),
        shelvesPerRack: Math.max(1, parseInt(draftSpot.shelvesPerRack) || 1),
      } : {}),
    }
    if (draftSpot.id) { onSpotUpdated && onSpotUpdated(spot) }
    else { onSpotAdded && onSpotAdded(spot) }
    setDraftSpot(null)
    setNewSpotRoom('')
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

  return (
    <>
    {editingSpots && (
      <div style={{ marginBottom: 10, padding: 12, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
        {pendingRoomConfirm ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, fontSize: 13 }}>This location is in <strong>{pendingRoomConfirm.room_label}</strong> — place the spot here?</div>
            <button className="btn btn-sm" onClick={() => { setPendingRoomConfirm(null); setPickMode(false) }}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={confirmRoomPick}>Confirm</button>
          </div>
        ) : !draftSpot ? (
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={newSpotRoom} onChange={e => setNewSpotRoom(e.target.value)} style={{ flex: 1 }}>
                <option value="">— Select room for new spot —</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.label.replace('\n', ' ')}</option>)}
              </select>
              <button className="btn btn-sm btn-primary" disabled={!newSpotRoom} onClick={startDraft}>+ Place spot</button>
            </div>
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => setPickMode(v => !v)}
                style={{ background: pickMode ? '#7c3aed' : undefined, color: pickMode ? '#fff' : undefined, borderColor: pickMode ? '#7c3aed' : undefined }}>
                {pickMode ? '✕ Cancel — tap a room on the map' : '📍 Or tap a location on the map'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
              {draftSpot.id ? 'Drag the marker directly on the map to reposition, or edit the details below.' : 'Drag the purple marker on the map to position it.'}
            </div>
            <div className="grid-2">
              <div className="field"><label>Spot Name <span style={{ color: '#c84b2f' }}>*</span></label>
                <input autoFocus value={draftSpot.name} onChange={e => setDraftSpot(d => ({ ...d, name: e.target.value }))} placeholder="e.g. North Rack" />
              </div>
              <div className="field"><label>Type</label>
                <select value={draftSpot.type} onChange={e => setDraftSpot(d => ({ ...d, type: e.target.value }))}>
                  <option value="pallet">Pallet</option>
                  <option value="floor">Floor</option>
                  <option value="racks">Racks</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Label rotation</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>↻ Drag the purple handle above the spot on the map to rotate its label</span>
                <input type="number" value={draftSpot.rotation || 0} onChange={e => setDraftSpot(d => ({ ...d, rotation: e.target.value }))}
                  style={{ width: 60, textAlign: 'center', marginLeft: 'auto' }} />
              </div>
            </div>
            {draftSpot.type === 'racks' && (
              <>
                <div className="grid-2">
                  <div className="field"><label>Number of racks</label>
                    <input type="number" min={1} value={draftSpot.rackNames?.length || 1} onChange={e => setRackCount(e.target.value)} />
                  </div>
                  <div className="field"><label>Shelves per rack</label>
                    <input type="number" min={1} value={draftSpot.shelvesPerRack} onChange={e => setDraftSpot(d => ({ ...d, shelvesPerRack: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label>Rack names</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(draftSpot.rackNames || []).map((name, i) => (
                      <input key={i} value={name} onChange={e => renameRack(i, e.target.value)} placeholder={`Rack ${i + 1}`} />
                    ))}
                  </div>
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
              {draftSpot.id ? (
                <button className="btn btn-sm" style={{ color: '#c84b2f' }}
                  onClick={() => { onSpotDeleted && onSpotDeleted(draftSpot.id); setDraftSpot(null); setNewSpotRoom('') }}>🗑 Delete spot</button>
              ) : <span />}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => { setDraftSpot(null); setNewSpotRoom('') }}>Cancel</button>
                <button className="btn btn-sm btn-primary" disabled={!draftSpot.name.trim()} onClick={confirmDraft}>{draftSpot.id ? 'Save changes' : 'Add spot'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )}
    <svg ref={svgRef} viewBox="0 0 820 260" width="100%"
      style={{ minWidth: 600, display: 'block', cursor: pickMode ? 'crosshair' : undefined }}
      onClick={e => { if (pickMode) { onMapClickForPick(e); return } if (e.target === svgRef.current) setTooltip(null) }}
      onMouseMove={onSVGMouseMove}
      onMouseUp={onSVGMouseUp}
      onMouseLeave={() => { rotatingRef.current = false; setDraggingDraft(false); dragSpotIdRef.current = null; setLiveDragPos(null) }}>
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
            style={{ cursor: (editingSpots || disableRoomSelect) ? 'default' : occ?.occupied && !selected.includes(r.id) ? 'not-allowed' : 'pointer' }}
            onClick={() => { if (!editingSpots && !disableRoomSelect) handleClick(r.id, r.label.replace('\n', ' '), cx, cy) }}/>
        )
      })}

      {/* ── Spots ── */}
      {spots.map(spot => {
        const isRacks = spot.type === 'racks'
        const anySelected = isRacks
          ? selected.some(id => id.startsWith(spot.id + '-'))
          : selected.includes(spot.id)
        const isOccupied = !isRacks && occupancy[spot.id]?.occupied && !anySelected
        const isEditing = draftSpot?.id === spot.id
        const pos = liveDragPos?.id === spot.id ? liveDragPos : spot
        const fill = anySelected ? C.selected : isOccupied ? C.occupied : '#fef9ec'
        const stroke = isEditing ? '#7c3aed' : anySelected ? C.selected_stroke : isOccupied ? C.occupied_stroke : '#c8a000'
        const label = spot.name
        const pillWidth = Math.max(30, label.length * 7.6 + 14)
        const rotation = spot.rotation || 0
        return (
          <g key={spot.id}
            transform={rotation ? `rotate(${rotation} ${pos.x} ${pos.y})` : undefined}
            style={{ cursor: editingSpots ? 'grab' : 'pointer' }}
            onMouseDown={e => onSpotMouseDown(e, spot)}
            onClick={e => onSpotClick(e, spot)}>
            <rect x={pos.x - pillWidth / 2} y={pos.y - 10} width={pillWidth} height={20} rx={10}
              fill={fill} stroke={stroke} strokeWidth={isEditing ? 2.5 : 1.5} />
            <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central" fontSize={14} fontFamily="sans-serif"
              fill={isOccupied ? '#fff' : '#3d2a00'} fontWeight="700" style={{ pointerEvents: 'none' }}>
              {label}
            </text>
            {editingSpots && (
              <g style={{ cursor: 'pointer' }} onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onSpotDeleted && onSpotDeleted(spot.id) }}>
                <circle cx={pos.x + pillWidth / 2 + 6} cy={pos.y - 10} r={7} fill="#c84b2f"/>
                <text x={pos.x + pillWidth / 2 + 6} y={pos.y - 6.5} textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="#fff" fontWeight="700" style={{ pointerEvents: 'none' }}>×</text>
              </g>
            )}
          </g>
        )
      })}

      {/* Pending click-to-place marker, awaiting room confirmation */}
      {pendingRoomConfirm && (
        <circle cx={pendingRoomConfirm.x} cy={pendingRoomConfirm.y} r={7} fill="#7c3aed" stroke="#fff" strokeWidth={1.5} opacity={0.7} />
      )}

      {/* Draft marker for a brand-new, not-yet-saved spot */}
      {draftSpot && draftSpot.id === null && (
        <circle cx={draftSpot.x} cy={draftSpot.y} r={7} fill="#7c3aed" stroke="#fff" strokeWidth={1.5}
          onMouseDown={onDraftMouseDown} style={{ cursor: 'grab' }} />
      )}

      {/* Rotation handle — drag in a circle around the spot to set its label angle */}
      {draftSpot && (() => {
        const rot = draftSpot.rotation || 0
        const dist = 24
        const hx = draftSpot.x + dist * Math.sin(rot * Math.PI / 180)
        const hy = draftSpot.y - dist * Math.cos(rot * Math.PI / 180)
        return (
          <g>
            <line x1={draftSpot.x} y1={draftSpot.y} x2={hx} y2={hy} stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="2,2" style={{ pointerEvents: 'none' }} />
            <circle cx={hx} cy={hy} r={8} fill="#7c3aed" stroke="#fff" strokeWidth={1.5}
              onMouseDown={onRotationHandleMouseDown} style={{ cursor: 'grab' }} />
            <text x={hx} y={hy + 3} textAnchor="middle" fontSize={9} fill="#fff" fontWeight="700" style={{ pointerEvents: 'none' }}>↻</text>
          </g>
        )
      })()}

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
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// MPF MAP
// ══════════════════════════════════════════════════════════════
function MPFMap({ occupancy, selected, onToggle, canEdit, spots = [],
                  editingSpots = false, onSpotAdded, onSpotUpdated, onSpotDeleted, disableRoomSelect = false }) {
  const [tooltip, setTooltip] = useState(null)
  const [draftSpot, setDraftSpot] = useState(null)   // { id?, x, y, name, type, rackNames, shelvesPerRack }
  const [draggingDraft, setDraggingDraft] = useState(false)
  const [pickMode, setPickMode] = useState(false)
  const [liveDragPos, setLiveDragPos] = useState(null)   // { id, x, y } — live position of a saved spot being dragged
  const svgRef = useRef(null)
  const dragSpotIdRef = useRef(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const dragMovedRef = useRef(false)
  const rotatingRef = useRef(false)

  function svgCoords(e) {
    const el = svgRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: Math.round((e.clientX - rect.left) * (540 / rect.width)),
      y: Math.round((e.clientY - rect.top)  * (500 / rect.height)),
    }
  }
  function onRotationHandleMouseDown(e) {
    e.preventDefault()
    e.stopPropagation()
    rotatingRef.current = true
  }
  function onMapClickForPick(e) {
    if (!pickMode) return
    const p = svgCoords(e)
    setDraftSpot({ id: null, x: p.x, y: p.y, name: '', type: 'pallet', rackNames: ['Rack 1'], shelvesPerRack: 1, rotation: 0 })
    setPickMode(false)
  }
  function editSpot(spot) {
    setDraftSpot({ ...spot, rackNames: spot.rackNames ? [...spot.rackNames] : ['Rack 1'], rotation: spot.rotation || 0 })
  }
  function onDraftMouseDown(e) {
    e.preventDefault()
    e.stopPropagation()
    setDraggingDraft(true)
  }
  function onSpotMouseDown(e, spot) {
    if (!editingSpots) return
    e.preventDefault()
    e.stopPropagation()
    dragSpotIdRef.current = spot.id
    dragMovedRef.current = false
    dragStartRef.current = svgCoords(e)
    setLiveDragPos({ id: spot.id, x: spot.x, y: spot.y })
  }
  function onSpotClick(e, spot) {
    e.stopPropagation()
    if (editingSpots) {
      if (!dragMovedRef.current) editSpot(spot)
      dragMovedRef.current = false
      return
    }
    // Everyone can see what's stored where and who's in charge — just can't edit/move the spot.
    onSpotView && onSpotView(spot.id)
  }
  function onSVGMouseMove(e) {
    if (rotatingRef.current && draftSpot) {
      const p = svgCoords(e)
      const dx = p.x - draftSpot.x, dy = p.y - draftSpot.y
      const angle = Math.round((((Math.atan2(dx, -dy) * 180 / Math.PI) % 360) + 360) % 360)
      setDraftSpot(d => d && ({ ...d, rotation: angle }))
      return
    }
    if (draggingDraft) {
      const p = svgCoords(e)
      setDraftSpot(d => d && ({ ...d, x: p.x, y: p.y }))
      return
    }
    if (dragSpotIdRef.current) {
      const p = svgCoords(e)
      if (Math.abs(p.x - dragStartRef.current.x) > 2 || Math.abs(p.y - dragStartRef.current.y) > 2) dragMovedRef.current = true
      setLiveDragPos({ id: dragSpotIdRef.current, x: p.x, y: p.y })
    }
  }
  function onSVGMouseUp() {
    rotatingRef.current = false
    setDraggingDraft(false)
    if (dragSpotIdRef.current) {
      const id = dragSpotIdRef.current
      if (dragMovedRef.current && liveDragPos) {
        const spot = spots.find(s => s.id === id)
        if (spot) {
          onSpotUpdated && onSpotUpdated({ ...spot, x: liveDragPos.x, y: liveDragPos.y })
          setDraftSpot(d => (d && d.id === id) ? { ...d, x: liveDragPos.x, y: liveDragPos.y } : d)
        }
      }
      dragSpotIdRef.current = null
      setLiveDragPos(null)
    }
  }
  function setRackCount(n) {
    const count = Math.max(1, parseInt(n) || 1)
    setDraftSpot(d => {
      const names = d.rackNames || []
      return { ...d, rackNames: Array.from({ length: count }, (_, i) => names[i] || `Rack ${i + 1}`) }
    })
  }
  function renameRack(i, value) {
    setDraftSpot(d => {
      const next = [...(d.rackNames || [])]
      next[i] = value
      return { ...d, rackNames: next }
    })
  }
  function confirmDraft() {
    if (!draftSpot || !draftSpot.name.trim()) return
    const spot = {
      id: draftSpot.id || ('spot_' + Date.now()),
      name: draftSpot.name.trim(),
      facility: 'MPF',
      x: draftSpot.x, y: draftSpot.y,
      type: draftSpot.type,
      rotation: parseInt(draftSpot.rotation) || 0,
      ...(draftSpot.type === 'racks' ? {
        rackNames: (draftSpot.rackNames?.length ? draftSpot.rackNames : ['Rack 1']).map((n, i) => n.trim() || `Rack ${i + 1}`),
        shelvesPerRack: Math.max(1, parseInt(draftSpot.shelvesPerRack) || 1),
      } : {}),
    }
    if (draftSpot.id) { onSpotUpdated && onSpotUpdated(spot) }
    else { onSpotAdded && onSpotAdded(spot) }
    setDraftSpot(null)
  }

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
    <>
    {editingSpots && (
      <div style={{ marginBottom: 10, padding: 12, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
        {!draftSpot ? (
          <div>
            <button className="btn btn-sm" onClick={() => setPickMode(v => !v)}
              style={{ background: pickMode ? '#7c3aed' : undefined, color: pickMode ? '#fff' : undefined, borderColor: pickMode ? '#7c3aed' : undefined }}>
              {pickMode ? '✕ Cancel — tap the map to place' : '📍 Tap a location on the map to add a spot'}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
              {draftSpot.id ? 'Drag the marker directly on the map to reposition, or edit the details below.' : 'Drag the purple marker on the map to position it.'}
            </div>
            <div className="grid-2">
              <div className="field"><label>Spot Name <span style={{ color: '#c84b2f' }}>*</span></label>
                <input autoFocus value={draftSpot.name} onChange={e => setDraftSpot(d => ({ ...d, name: e.target.value }))} placeholder="e.g. North Rack" />
              </div>
              <div className="field"><label>Type</label>
                <select value={draftSpot.type} onChange={e => setDraftSpot(d => ({ ...d, type: e.target.value }))}>
                  <option value="pallet">Pallet</option>
                  <option value="floor">Floor</option>
                  <option value="racks">Racks</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Label rotation</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>↻ Drag the purple handle above the spot on the map to rotate its label</span>
                <input type="number" value={draftSpot.rotation || 0} onChange={e => setDraftSpot(d => ({ ...d, rotation: e.target.value }))}
                  style={{ width: 60, textAlign: 'center', marginLeft: 'auto' }} />
              </div>
            </div>
            {draftSpot.type === 'racks' && (
              <>
                <div className="grid-2">
                  <div className="field"><label>Number of racks</label>
                    <input type="number" min={1} value={draftSpot.rackNames?.length || 1} onChange={e => setRackCount(e.target.value)} />
                  </div>
                  <div className="field"><label>Shelves per rack</label>
                    <input type="number" min={1} value={draftSpot.shelvesPerRack} onChange={e => setDraftSpot(d => ({ ...d, shelvesPerRack: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label>Rack names</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(draftSpot.rackNames || []).map((name, i) => (
                      <input key={i} value={name} onChange={e => renameRack(i, e.target.value)} placeholder={`Rack ${i + 1}`} />
                    ))}
                  </div>
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
              {draftSpot.id ? (
                <button className="btn btn-sm" style={{ color: '#c84b2f' }}
                  onClick={() => { onSpotDeleted && onSpotDeleted(draftSpot.id); setDraftSpot(null) }}>🗑 Delete spot</button>
              ) : <span />}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setDraftSpot(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" disabled={!draftSpot.name.trim()} onClick={confirmDraft}>{draftSpot.id ? 'Save changes' : 'Add spot'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )}
    <svg ref={svgRef} viewBox="0 0 540 500" width="100%"
      style={{ minWidth: 340, maxWidth: 520, display: 'block', margin: '0 auto', cursor: pickMode ? 'crosshair' : undefined }}
      onClick={e => { if (pickMode) { onMapClickForPick(e); return } if (e.target.tagName === 'svg') setTooltip(null) }}
      onMouseMove={onSVGMouseMove}
      onMouseUp={onSVGMouseUp}
      onMouseLeave={() => { rotatingRef.current = false; setDraggingDraft(false); dragSpotIdRef.current = null; setLiveDragPos(null) }}>
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
              <g key={row.id} style={{ cursor: (editingSpots || disableRoomSelect) ? 'default' : occ?.occupied && !selected.includes(row.id) ? 'not-allowed' : 'pointer' }}
                onClick={() => { if (!editingSpots && !disableRoomSelect) handleClick(row.id, row.label, cx, cy) }}>
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
          <g key={p.id} style={{ cursor: (editingSpots || disableRoomSelect) ? 'default' : occ?.occupied && !selected.includes(p.id) ? 'not-allowed' : 'pointer' }}
            onClick={() => { if (!editingSpots && !disableRoomSelect) handleClick(p.id, p.label, cx, cy) }}>
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

      {/* ── Spots ── */}
      {spots.map(spot => {
        const isRacks = spot.type === 'racks'
        const anySelected = isRacks
          ? selected.some(id => id.startsWith(spot.id + '-'))
          : selected.includes(spot.id)
        const isOccupied = !isRacks && occupancy[spot.id]?.occupied && !anySelected
        const isEditing = draftSpot?.id === spot.id
        const pos = liveDragPos?.id === spot.id ? liveDragPos : spot
        const fill = anySelected ? C.selected : isOccupied ? C.occupied : '#fef9ec'
        const stroke = isEditing ? '#7c3aed' : anySelected ? C.selected_stroke : isOccupied ? C.occupied_stroke : '#c8a000'
        const label = spot.name
        const pillWidth = Math.max(30, label.length * 7.6 + 14)
        const rotation = spot.rotation || 0
        return (
          <g key={spot.id}
            transform={rotation ? `rotate(${rotation} ${pos.x} ${pos.y})` : undefined}
            style={{ cursor: editingSpots ? 'grab' : 'pointer' }}
            onMouseDown={e => onSpotMouseDown(e, spot)}
            onClick={e => onSpotClick(e, spot)}>
            <rect x={pos.x - pillWidth / 2} y={pos.y - 10} width={pillWidth} height={20} rx={10}
              fill={fill} stroke={stroke} strokeWidth={isEditing ? 2.5 : 1.5} />
            <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central" fontSize={14} fontFamily="sans-serif"
              fill={isOccupied ? '#fff' : '#3d2a00'} fontWeight="700" style={{ pointerEvents: 'none' }}>
              {label}
            </text>
            {editingSpots && (
              <g style={{ cursor: 'pointer' }} onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onSpotDeleted && onSpotDeleted(spot.id) }}>
                <circle cx={pos.x + pillWidth / 2 + 6} cy={pos.y - 10} r={7} fill="#c84b2f"/>
                <text x={pos.x + pillWidth / 2 + 6} y={pos.y - 6.5} textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="#fff" fontWeight="700" style={{ pointerEvents: 'none' }}>×</text>
              </g>
            )}
          </g>
        )
      })}

      {/* Draft marker for a brand-new, not-yet-saved spot */}
      {draftSpot && draftSpot.id === null && (
        <circle cx={draftSpot.x} cy={draftSpot.y} r={7} fill="#7c3aed" stroke="#fff" strokeWidth={1.5}
          onMouseDown={onDraftMouseDown} style={{ cursor: 'grab' }} />
      )}

      {/* Rotation handle — drag in a circle around the spot to set its label angle */}
      {draftSpot && (() => {
        const rot = draftSpot.rotation || 0
        const dist = 24
        const hx = draftSpot.x + dist * Math.sin(rot * Math.PI / 180)
        const hy = draftSpot.y - dist * Math.cos(rot * Math.PI / 180)
        return (
          <g>
            <line x1={draftSpot.x} y1={draftSpot.y} x2={hx} y2={hy} stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="2,2" style={{ pointerEvents: 'none' }} />
            <circle cx={hx} cy={hy} r={8} fill="#7c3aed" stroke="#fff" strokeWidth={1.5}
              onMouseDown={onRotationHandleMouseDown} style={{ cursor: 'grab' }} />
            <text x={hx} y={hy + 3} textAnchor="middle" fontSize={9} fill="#fff" fontWeight="700" style={{ pointerEvents: 'none' }}>↻</text>
          </g>
        )
      })()}

      {tooltip && <Tooltip x={tooltip.x} y={tooltip.y} info={tooltip} onClose={() => setTooltip(null)} />}
    </svg>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// CUSTOM FLOOR PLAN TAB (org-uploaded image + drawn zones)
// ══════════════════════════════════════════════════════════════
function CustomPlanTab({ plan, selected, onToggle, occupancy, canEdit }) {
  // Rendered as a clean diagram (matching the ICT Building / MPF maps' look)
  // rather than zones overlaid on the raw uploaded photo. The photo is kept
  // in the DOM at zero opacity purely so the container inherits its aspect
  // ratio — the percentage-based zone coordinates are relative to it.
  function getZoneStyle(zone) {
    const sel = selected.includes(zone.id)
    const occ = occupancy[zone.id]?.occupied && !sel
    return {
      position: 'absolute',
      left: `${zone.x}%`, top: `${zone.y}%`,
      width: `${zone.w}%`, height: `${zone.h}%`,
      border: `1.5px solid ${sel ? C.selected_stroke : occ ? C.occupied_stroke : '#888'}`,
      background: sel ? C.selected : occ ? C.occupied : '#f8f7f4',
      borderRadius: 3, boxSizing: 'border-box',
      cursor: occ ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'background 0.12s, border-color 0.12s',
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: '100%', background: '#f5f4f0', border: '2px solid #555', borderRadius: 2, overflow: 'hidden' }}>
      <img src={plan.image_url} alt="" draggable={false} aria-hidden="true"
        style={{ display: 'block', width: '100%', userSelect: 'none', opacity: 0 }} />
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
              color: occ?.occupied && !sel ? '#fff' : '#333',
              padding: '1px 6px',
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
export default function FloorPlanPicker({ projectId, projectName, materialId, materialType, currentLocations = [], onConfirm, onClose, viewOnly = false, allowLayoutEdit = false }) {
  const { session } = useAppStore()
  const [customPlans, setCustomPlans] = useState([])
  const [facility, setFacility] = useState(null)
  const [occupancy, setOccupancy] = useState({})
  const [selected, setSelected] = useState(
    currentLocations.map(l => l.location_id).filter(Boolean)
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [spots, setSpots] = useState([])
  const [editingSpots, setEditingSpots] = useState(!!allowLayoutEdit)
  const [viewSpotId, setViewSpotId] = useState('')
  // In the spot window: the place clicked (details + actions below the racks)
  const [focusId, setFocusId] = useState('')
  // A shelf divided into places opens as a list (A1, A2, A3) under its row
  const [openShelf, setOpenShelf] = useState('')
  // A lab manager moving someone's material: the storage row being moved
  const [moveItem, setMoveItem] = useState(null)
  // "Set up shelves" (lab managers / admins): the spot being set up + its draft
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupSpotId, setSetupSpotId] = useState('')
  const [setupDraft, setSetupDraft] = useState(null)
  const [setupError, setSetupError] = useState('')
  const [busy, setBusy] = useState(false)
  // Every users row of the signed-in person (one login can hold a lab-user and
  // a lab-manager row): a place stored from either is theirs.
  const [myIds, setMyIds] = useState(session?.userId ? [String(session.userId)] : [])
  const [facilityOrder, setFacilityOrder] = useState(null) // saved tab order (array of facility keys), null until loaded
  const [dragTabKey, setDragTabKey] = useState(null)
  const canEdit = !!session
  const isSolo = session?.loginMode === 'solo'
  const isICTOrg = true  // ictlab is always the ICT org
  // Spot layout (Edit Spots) is admin-only, and only reachable from the
  // dedicated Admin → Floor Plan entry point (allowLayoutEdit) — never from
  // the regular material storage picker, regardless of role.
  const canEditLayout = allowLayoutEdit && !viewOnly && session?.role === 'admin'
  // Lab managers/admins can store anywhere, move anyone's material and set up
  // the shelves; lab users store only in free places or places they own.
  const isManagerOrAdmin = session?.role === 'admin' || session?.role === 'user' || session?.userId === null
  // The window picks a place for THIS material only when opened from a material
  const picking = !viewOnly && canEdit && !!materialId && !allowLayoutEdit

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

    if (session?.email && !isSolo) {
      sb.from('users').select('id').ilike('email', session.email).then(({ data }) => {
        if (data?.length) setMyIds([...new Set([String(session.userId), ...data.map(u => String(u.id))])])
      }, () => {})
    }

    const [{ data: locData }, { data: planData }, { data: spotsData }, { data: orderData }] = await Promise.all([
      locQuery,
      orgId
        ? sb.from('floor_plans').select('*').eq('organization_id', orgId).order('created_at')
        : Promise.resolve({ data: [] }),
      sb.from('ict_layout').select('value').eq('key', 'ict_spots').single(),
      sb.from('ict_layout').select('value').eq('key', 'facility_tab_order').single(),
    ])

    setOccupancy(buildOccupancy(locData))

    const plans = planData || []
    setCustomPlans(plans)

    if (spotsData?.value) {
      try { setSpots(JSON.parse(spotsData.value)) } catch {}
    }

    if (orderData?.value) {
      try { setFacilityOrder(JSON.parse(orderData.value)) } catch { setFacilityOrder([]) }
    } else {
      setFacilityOrder([])
    }

    // Default tab: first custom plan if any, else ICT Building.
    // Layout-edit mode always lands on ICT Building — that's the only facility with spots.
    if (allowLayoutEdit) setFacility('ICT')
    else if (plans.length > 0) setFacility(`custom_${plans[0].id}`)
    else setFacility('ICT')

    setLoading(false)
  }

  // One storage row per material; rows grouped by place
  function buildOccupancy(locData) {
    // One place can now hold several materials (one storage row each), all
    // placed by the same person: whoever stored there first owns the place.
    const map = {}
    ;(locData || []).forEach(loc => {
      const e = map[loc.location_id] || (map[loc.location_id] = { occupied: false, items: [], db_id: loc.id })
      if (!loc.occupied) return
      e.occupied = true
      e.items.push({
        row_id: loc.id, material_id: loc.material_id, project_id: loc.project_id,
        project_name: loc.project_name, material_type: loc.material_type,
        occupied_by: loc.occupied_by, occupied_by_id: loc.occupied_by_id || null, occupied_at: loc.occupied_at,
      })
    })
    Object.values(map).forEach(e => {
      if (!e.items.length) return
      e.items.sort((x, y) => String(x.occupied_at || '').localeCompare(String(y.occupied_at || '')))
      const first = e.items[0]
      e.project_name = first.project_name
      e.material_type = first.material_type
      e.occupied_by = first.occupied_by
      e.owner_id = first.occupied_by_id
    })
    return map
  }

  async function reloadOccupancy() {
    const isSolo = session?.loginMode === 'solo'
    const orgId = session?.organizationId
    let q = sb.from('storage_locations').select('*')
    q = isSolo ? q.is('organization_id', null) : q.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
    const { data } = await q
    setOccupancy(buildOccupancy(data))
  }

  // ── Who may use a place ──
  // Owner = the person who stored there first. Rows from before the owner id
  // was recorded fall back to the name they were stored under.
  function isMine(occ) {
    if (!occ?.occupied) return false
    if (occ.owner_id) return myIds.includes(String(occ.owner_id))
    return !!occ.occupied_by && occ.occupied_by === session?.username
  }
  // 'free' | 'here' (this material is already there) | 'mine' | 'taken'
  function placeState(id) {
    const occ = occupancy[id]
    if (selected.includes(id)) return 'here'
    if (!occ?.occupied) return 'free'
    return isMine(occ) ? 'mine' : 'taken'
  }

  // Clicking the place that holds THIS material again takes it back out
  async function unstore(id) {
    setFocusId('')
    await saveLocations(selected.filter(x => x !== id), { keepOpen: true })
  }

  // Picking a location on a room/zone saves and closes immediately — single
  // slot, no separate staging + "Confirm N locations" step.
  function pickLocation(id) {
    if (!canEdit) return
    saveLocations([id])
  }

  function getLocationDetail(id, list = spots) {
    // Rack slot: spot_123-R2-S3 (whole shelf) or spot_123-R2-S3-P1 (one place)
    const rackMatch = id.match(RACK_SLOT)
    if (rackMatch) {
      const spot = list.find(s => s.id === rackMatch[1])
      const fac = spot?.facility || 'ICT'
      const room = fac === 'ICT' ? ICT_ROOMS.find(r => r.id === spot?.room_id) : null
      const label = spot ? `${spot.name} · ${slotName(spot, +rackMatch[2], +rackMatch[3], rackMatch[4] ? +rackMatch[4] : null)}` : id
      return { location: fac === 'ICT' ? (room?.label || 'ICT Building') : 'MPF', detail: label, facility: fac }
    }
    // Spot itself (pallet/floor — single slot)
    const spot = list.find(s => s.id === id)
    if (spot) {
      const fac = spot.facility || 'ICT'
      const room = fac === 'ICT' ? ICT_ROOMS.find(r => r.id === spot.room_id) : null
      return { location: fac === 'ICT' ? (room?.label || 'ICT Building') : 'MPF', detail: spot.name, facility: fac }
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

  async function saveFacilityOrder(next) {
    setFacilityOrder(next)
    const { error } = await sb.from('ict_layout').upsert(
      { key: 'facility_tab_order', value: JSON.stringify(next) },
      { onConflict: 'key' }
    )
    if (error) console.error('saveFacilityOrder failed:', error)
  }

  async function saveSpots(next) {
    setSpots(next)
    const { error } = await sb.from('ict_layout').upsert(
      { key: 'ict_spots', value: JSON.stringify(next) },
      { onConflict: 'key' }
    )
    if (error) {
      console.error('saveSpots failed:', error)
      alert('Spots could not be saved: ' + (error.message || error.code || 'unknown error'))
      return false
    }
    return true
  }

  const spotsForFacility = spots.filter(s => (s.facility || 'ICT') === (facility === 'MPF' ? 'MPF' : 'ICT'))
  const viewSpot = spots.find(s => s.id === viewSpotId) || null

  // A storage row write. occupied_by_id is new (storage_owner_setup.sql): if
  // the column is not there yet, store without it rather than fail the save.
  async function writeRow(kind, payload, rowId) {
    const run = body => kind === 'update'
      ? sb.from('storage_locations').update(body).eq('id', rowId)
      : sb.from('storage_locations').insert(body)
    let { error } = await run(payload)
    if (error && /occupied_by_id/.test(error.message || '')) {
      const { occupied_by_id, ...rest } = payload
      ;({ error } = await run(rest))
    }
    if (error) throw error
  }

  async function saveLocations(idsArray, { keepOpen = false } = {}) {
    if (!canEdit) { onConfirm([]); onClose(); return }
    setSaving(true)
    try {
      const isSolo = session?.loginMode === 'solo'
      const orgId = session?.organizationId || null
      const orgFilter = q => isSolo ? q.is('organization_id', null) : q.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')

      // This material's current storage rows
      const { data: existing } = await sb.from('storage_locations')
        .select('*').eq('material_id', materialId)
      const existingIds = (existing || []).map(e => e.location_id)

      // Release only THIS material's row — a place can hold other materials
      // too, and they stay put.
      const toRelease = (existing || []).filter(e => !idsArray.includes(e.location_id))
      for (const row of toRelease) {
        await sb.from('storage_locations').update({
          occupied: false, project_id: null, material_id: null,
          project_name: null, material_type: null,
          occupied_at: null, occupied_by: null,
        }).eq('id', row.id)
      }

      // Store in the newly chosen places: reuse a free row for that place, or add one
      const toOccupy = idsArray.filter(id => !existingIds.includes(id))
      for (const id of toOccupy) {
        const det = getLocationDetail(id)
        const { data: freeRows } = await orgFilter(sb.from('storage_locations').select('id')
          .eq('location_id', id).eq('occupied', false)).limit(1)
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
          occupied_by_id: session?.userId || null,
          organization_id: isSolo ? null : orgId,
        }
        if (freeRows?.length) await writeRow('update', payload, freeRows[0].id)
        else await writeRow('insert', payload)
      }

      const result = idsArray.map(id => {
        const det = getLocationDetail(id)
        return { location_id: id, location: det.location, detail: det.detail }
      })
      onConfirm(result)
      if (keepOpen) { setSelected(idsArray); await reloadOccupancy() }
      else onClose()
    } catch (e) {
      console.error(e)
      alert('The storage location could not be saved: ' + (e?.message || e))
    }
    setSaving(false)
  }

  // ── A lab manager moves someone's material to another place ──
  async function moveMaterial(item, toId) {
    setBusy(true)
    try {
      const fromLabel = getLocationDetail(item.from_id).detail
      const det = getLocationDetail(toId)
      const { data: moved, error } = await sb.from('storage_locations')
        .update({ location_id: toId, location_label: det.detail, facility: det.facility })
        .eq('id', item.row_id).select('id')
      if (error) throw error
      if (!moved?.length) throw new Error('nothing was changed — the material may have been moved already')

      // The material's own record shows where it is stored
      let materialName = item.material_type || 'material'
      if (item.material_id) {
        const { data: m } = await sb.from('project_materials').select('id, name, locations').eq('id', item.material_id).maybeSingle()
        if (m) {
          materialName = m.name || materialName
          const locs = (m.locations || []).map(l => l.location_id === item.from_id
            ? { location_id: toId, location: det.location, detail: det.detail } : l)
          await sb.from('project_materials').update({ locations: locs }).eq('id', m.id)
        }
      }

      // Tell the person who stored it (not when you move your own)
      let ownerId = item.occupied_by_id
      if (!ownerId && item.occupied_by && session?.organizationId) {
        const { data: u } = await sb.from('users').select('id').eq('name', item.occupied_by)
          .eq('organization_id', session.organizationId).eq('is_active', true).limit(1)
        ownerId = u?.[0]?.id || null
      }
      if (ownerId && String(ownerId) !== String(session?.userId)) {
        await sendTaskNotification(ownerId, 'storage_moved',
          `📦 Your material was moved: ${materialName}`,
          `${session?.username || 'A lab manager'} moved ${materialName}${item.project_name ? ` (${item.project_name})` : ''} from ${fromLabel} to ${det.detail}.`,
          null, { label: 'Open Project Workspace →', url: APP_PROJECTS_URL })
      }
      setMoveItem(null)
      setFocusId(toId)
      await reloadOccupancy()
    } catch (e) {
      alert('The material could not be moved: ' + (e?.message || e))
    }
    setBusy(false)
  }

  // ── Set up shelves (lab managers / admins) ──
  function openSetup(spotId = '') {
    setSetupOpen(true)
    setSetupError('')
    chooseSetupSpot(spotId)
  }
  function chooseSetupSpot(id) {
    setSetupSpotId(id)
    setSetupError('')
    const sp = spots.find(x => x.id === id)
    setSetupDraft(sp ? {
      type: sp.type || 'pallet',
      rackNames: sp.rackNames?.length ? [...sp.rackNames] : ['Rack 1'],
      shelvesPerRack: sp.shelvesPerRack || 1,
      placesPerShelf: placeCount(sp),
    } : null)
  }
  function setDraftRackCount(n) {
    const count = Math.min(12, Math.max(1, parseInt(n) || 1))
    setSetupDraft(d => ({ ...d, rackNames: Array.from({ length: count }, (_, i) => d.rackNames[i] || `Rack ${i + 1}`) }))
  }

  // Where a stored row goes when its spot's layout changes, or null if its
  // place would disappear. Whole shelf → place 1 when places are added (the
  // owner can move it to 2 or 3 later); place 1 → whole shelf when removed.
  function remapSlot(id, spot, next) {
    if (id === spot.id) return next.type === 'racks' ? null : id
    const m = id.match(RACK_SLOT)
    if (!m || m[1] !== spot.id || next.type !== 'racks') return null
    const r = +m[2], sh = +m[3], pl = m[4] ? +m[4] : null
    if (r > next.rackNames.length || sh > next.shelvesPerRack) return null
    const base = `${spot.id}-R${r}-S${sh}`
    if (next.placesPerShelf > 1) {
      if (!pl) return `${base}-P1`
      return pl <= next.placesPerShelf ? id : null
    }
    if (!pl || pl === 1) return base
    return null
  }

  async function saveSetup() {
    const spot = spots.find(x => x.id === setupSpotId)
    if (!spot || !setupDraft) return
    const next = {
      type: setupDraft.type,
      rackNames: setupDraft.rackNames.map((n, i) => n.trim() || `Rack ${i + 1}`),
      shelvesPerRack: Math.min(26, Math.max(1, parseInt(setupDraft.shelvesPerRack) || 1)),
      placesPerShelf: Math.min(12, Math.max(1, parseInt(setupDraft.placesPerShelf) || 1)),
    }
    const nextSpot = next.type === 'racks'
      ? { ...spot, type: 'racks', rackNames: next.rackNames, shelvesPerRack: next.shelvesPerRack, placesPerShelf: next.placesPerShelf }
      : (({ rackNames, shelvesPerRack, placesPerShelf, ...rest }) => ({ ...rest, type: next.type }))(spot)
    const nextSpots = spots.map(x => x.id === spot.id ? nextSpot : x)

    setBusy(true)
    setSetupError('')
    try {
      // Everything stored in this spot right now
      const orgId = session?.organizationId
      let q = sb.from('storage_locations').select('id, location_id, material_id, project_name, occupied_by')
        .eq('occupied', true).or(`location_id.eq.${spot.id},location_id.like.${spot.id}-R*`)
      q = orgId ? q.eq('organization_id', orgId) : q.is('organization_id', null)
      const { data: rows, error } = await q
      if (error) throw error

      // Nothing stored may vanish: those materials have to be moved first
      const lost = (rows || []).filter(r => remapSlot(r.location_id, spot, next) === null)
      if (lost.length) {
        setSetupError('These places still hold materials and would disappear with this change: '
          + lost.map(r => `${getLocationDetail(r.location_id).detail} (${r.project_name || 'material'}, ${r.occupied_by || 'unknown'})`).join('; ')
          + '. Move those materials first, then change the layout.')
        setBusy(false)
        return
      }
      if (!(await saveSpots(nextSpots))) { setBusy(false); return }

      // Re-file what is stored here under the new names (A2 rather than Shelf 2)
      for (const r of rows || []) {
        const newId = remapSlot(r.location_id, spot, next)
        const det = getLocationDetail(newId, nextSpots)
        await sb.from('storage_locations').update({ location_id: newId, location_label: det.detail }).eq('id', r.id)
        if (!r.material_id) continue
        const { data: m } = await sb.from('project_materials').select('id, locations').eq('id', r.material_id).maybeSingle()
        if (!m) continue
        const locs = (m.locations || []).map(l => l.location_id === r.location_id
          ? { location_id: newId, location: det.location, detail: det.detail } : l)
        await sb.from('project_materials').update({ locations: locs }).eq('id', m.id)
      }
      // This material's own selection follows its place too
      setSelected(sel => sel.map(id => {
        const hit = (rows || []).find(r => r.location_id === id)
        return hit ? remapSlot(id, spot, next) : id
      }))
      await reloadOccupancy()
      setSetupOpen(false)
    } catch (e) {
      setSetupError('Could not save: ' + (e?.message || e))
    }
    setBusy(false)
  }

  // Legend
  const legend = [
    { color: '#f0efe9', border: '#999', label: 'Available (pallet)' },
    { color: '#fef9ec', border: '#c8a000', label: 'Spot' },
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
            <div style={{ fontWeight: 700, fontSize: 16 }}>{allowLayoutEdit ? '🗺️ Manage Floor Plan Spots' : viewOnly ? '🗺️ Floor Map — Storage Locations' : 'Select storage location'}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{allowLayoutEdit ? 'Create and reposition spots for lab managers and lab users to reserve' : viewOnly ? 'Tap an occupied location to see project and material info' : 'Tap a spot to open it, then pick a shelf or place · Taken places show who has them'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {!allowLayoutEdit && isManagerOrAdmin && (facility === 'ICT' || facility === 'MPF') && !editingSpots && (
              <button className="btn btn-sm" onClick={() => openSetup('')} style={{ fontSize: 13 }}>🛠 Set up shelves</button>
            )}
            {canEditLayout && (facility === 'ICT' || facility === 'MPF') && (
              <button className="btn btn-sm" onClick={() => setEditingSpots(v => !v)}
                style={{ fontSize: 13, background: editingSpots ? '#7c3aed' : undefined, color: editingSpots ? '#fff' : undefined, borderColor: editingSpots ? '#7c3aed' : undefined }}>
                {editingSpots ? '✓ Done' : '✏️ Edit Spots'}
              </button>
            )}
            <button className="btn btn-sm" onClick={onClose}>✕ Close</button>
          </div>
        </div>

        {/* Facility tabs — order is admin-configurable (drag to reorder in Edit Spots mode) */}
        {(() => {
          const allTabs = [
            ...(isICTOrg ? ['ICT', 'MPF'] : []),
            ...customPlans.map(plan => `custom_${plan.id}`),
          ]
          const order = facilityOrder || []
          const ordered = [
            ...order.filter(k => allTabs.includes(k)),
            ...allTabs.filter(k => !order.includes(k)),
          ]
          const tabLabel = key => {
            if (key === 'ICT') return { icon: null, text: 'ICT Building' }
            if (key === 'MPF') return { icon: null, text: 'MPF' }
            const plan = customPlans.find(p => `custom_${p.id}` === key)
            return { icon: '🗺️ ', text: plan?.name || key }
          }
          function handleTabDrop(targetKey) {
            if (!dragTabKey || dragTabKey === targetKey) { setDragTabKey(null); return }
            const next = [...ordered]
            const from = next.indexOf(dragTabKey)
            const to = next.indexOf(targetKey)
            next.splice(from, 1)
            next.splice(to, 0, dragTabKey)
            setDragTabKey(null)
            saveFacilityOrder(next)
          }
          return (
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
              {ordered.map(key => {
                const { icon, text } = tabLabel(key)
                return (
                  <button key={key} onClick={() => setFacility(key)}
                    draggable={canEditLayout}
                    onDragStart={() => setDragTabKey(key)}
                    onDragOver={e => canEditLayout && e.preventDefault()}
                    onDrop={() => handleTabDrop(key)}
                    onDragEnd={() => setDragTabKey(null)}
                    style={{
                      padding: '10px 16px', border: 'none',
                      background: dragTabKey === key ? 'var(--surface2)' : 'transparent',
                      fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500,
                      cursor: canEditLayout ? 'grab' : 'pointer',
                      color: facility === key ? 'var(--accent)' : 'var(--text2)',
                      borderBottom: `2px solid ${facility === key ? 'var(--accent)' : 'transparent'}`,
                      transition: 'all 0.15s', whiteSpace: 'nowrap', opacity: dragTabKey === key ? 0.5 : 1,
                    }}>
                    {icon}{text}
                  </button>
                )
              })}
            </div>
          )
        })()}

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
            return plan ? <CustomPlanTab plan={plan} selected={selected} onToggle={pickLocation} occupancy={occupancy} canEdit={!viewOnly && canEdit} /> : null
          })() : facility === 'ICT' ? (
            <ICTMap occupancy={occupancy} selected={selected} onToggle={pickLocation} canEdit={!viewOnly && canEdit}
              spots={spots.filter(s => (s.facility || 'ICT') === 'ICT')}
              editingSpots={editingSpots}
              disableRoomSelect
              onSpotAdded={spot => saveSpots([...spots, spot])}
              onSpotUpdated={spot => saveSpots(spots.map(s => s.id === spot.id ? spot : s))}
              onSpotDeleted={id => saveSpots(spots.filter(s => s.id !== id))}
              onSpotView={id => setViewSpotId(id)} />
          ) : (
            <MPFMap occupancy={occupancy} selected={selected} onToggle={pickLocation} canEdit={!viewOnly && canEdit}
              spots={spots.filter(s => s.facility === 'MPF')}
              editingSpots={editingSpots}
              disableRoomSelect
              onSpotAdded={spot => saveSpots([...spots, spot])}
              onSpotUpdated={spot => saveSpots(spots.map(s => s.id === spot.id ? spot : s))}
              onSpotDeleted={id => saveSpots(spots.filter(s => s.id !== id))}
              onSpotView={id => setViewSpotId(id)} />
          )}
        </div>
      </div>
    </div>

    {/* ── Set up shelves: lab managers / admins shape the space; nothing is stored here ── */}
    {setupOpen && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 520, width: '100%', border: '1px solid var(--border)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>🛠 Set up shelves</div>
            <button className="btn btn-sm" onClick={() => setSetupOpen(false)}>✕ Close</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
            Shape the space: racks, shelves and the places on each shelf. Materials are not stored here — people pick their place by opening the spot on the map.
          </div>
          {spotsForFacility.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text3)', padding: '10px 0' }}>No spots on this map yet. An admin adds spots in Admin → Floor Plan → Edit Spots.</div>
          ) : (
            <>
              <div className="field">
                <label>Spot</label>
                <select value={setupSpotId} onChange={e => chooseSetupSpot(e.target.value)}>
                  <option value="">— Select a spot —</option>
                  {spotsForFacility.map(sp => {
                    const room = (sp.facility || 'ICT') === 'ICT' ? ICT_ROOMS.find(r => r.id === sp.room_id) : null
                    return <option key={sp.id} value={sp.id}>{(sp.facility || 'ICT') === 'ICT' ? (room?.label || sp.room_id) : 'MPF'} — {sp.name}</option>
                  })}
                </select>
              </div>
              {setupDraft && (
                <>
                  <div className="field">
                    <label>Type</label>
                    <select value={setupDraft.type} onChange={e => setSetupDraft(d => ({ ...d, type: e.target.value }))}>
                      <option value="pallet">Pallet (one place)</option>
                      <option value="floor">Floor (one place)</option>
                      <option value="racks">Racks with shelves</option>
                    </select>
                  </div>
                  {setupDraft.type === 'racks' && (
                    <>
                      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                        <div className="field"><label>Racks</label>
                          <input type="number" min={1} max={12} value={setupDraft.rackNames.length} onChange={e => setDraftRackCount(e.target.value)} />
                        </div>
                        <div className="field"><label>Shelves per rack</label>
                          <input type="number" min={1} max={26} value={setupDraft.shelvesPerRack} onChange={e => setSetupDraft(d => ({ ...d, shelvesPerRack: e.target.value }))} />
                        </div>
                        <div className="field"><label>Places per shelf</label>
                          <input type="number" min={1} max={12} value={setupDraft.placesPerShelf} onChange={e => setSetupDraft(d => ({ ...d, placesPerShelf: e.target.value }))} />
                        </div>
                      </div>
                      <div className="field">
                        <label>Rack names</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
                          {setupDraft.rackNames.map((name, i) => (
                            <input key={i} value={name} placeholder={`Rack ${i + 1}`}
                              onChange={e => setSetupDraft(d => { const n = [...d.rackNames]; n[i] = e.target.value; return { ...d, rackNames: n } })} />
                          ))}
                        </div>
                      </div>
                      {/* What the shelves will be called, top shelf first */}
                      {(() => {
                        const sh = Math.min(26, Math.max(1, parseInt(setupDraft.shelvesPerRack) || 1))
                        const pl = Math.min(12, Math.max(1, parseInt(setupDraft.placesPerShelf) || 1))
                        return (
                          <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10, fontSize: 12, display: 'grid', gap: 4 }}>
                            <div style={{ color: 'var(--text3)', fontWeight: 600 }}>Each rack will read, top to bottom:</div>
                            {Array.from({ length: sh }, (_, i) => i + 1).map(n => (
                              <div key={n} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <b style={{ width: 18 }}>{shelfLetter(n)}</b>
                                {pl > 1
                                  ? Array.from({ length: pl }, (_, k) => k + 1).map(p => <span key={p} style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '1px 8px', background: 'var(--surface)' }}>{shelfLetter(n)}{p}</span>)
                                  : <span style={{ color: 'var(--text3)' }}>whole shelf</span>}
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                    </>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
                    When places are added, anything already on a shelf moves to place 1; its owner can move it to another free place. A place that still holds materials cannot be removed.
                  </div>
                </>
              )}
              {setupError && <div style={{ fontSize: 13, color: '#c84b2f', background: '#fdecea', borderRadius: 8, padding: '8px 10px', marginTop: 10 }}>{setupError}</div>}
            </>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn" onClick={() => setSetupOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveSetup} disabled={!setupDraft || busy}>{busy ? 'Saving…' : 'Save layout'}</button>
          </div>
        </div>
      </div>
    )}

    {/* ── A spot's window: pick a place here ── */}
    {viewSpot && (() => {
      const isRacks = viewSpot.type === 'racks'
      const places = placeCount(viewSpot)
      const focus = isRacks ? focusId : viewSpot.id
      const focusOcc = focus ? occupancy[focus] : null
      const focusState = focus ? placeState(focus) : null
      const focusName = focus ? (isRacks ? getLocationDetail(focus).detail.replace(`${viewSpot.name} · `, '') : viewSpot.name) : ''
      const closeWindow = () => { setViewSpotId(''); setFocusId(''); setMoveItem(null); setOpenShelf('') }

      const tileColours = st => st === 'here' ? { bg: '#E1F5EE', bd: '#1D9E75', fg: '#085041' }
        : st === 'mine' ? { bg: '#fef3c7', bd: '#d4a520', fg: '#7a4a00' }
        : st === 'taken' ? { bg: '#fdecea', bd: '#e6a5a4', fg: '#a32d2d' }
        : { bg: 'var(--surface)', bd: 'var(--border)', fg: 'var(--text2)' }
      const stateText = (st, occ) => st === 'here' ? (picking ? 'This material · click to undo' : 'This material') : st === 'mine' ? `Yours · ${occ.items.length}` : st === 'taken' ? (occ.occupied_by || 'Taken') : 'Free'

      function tile(id, label, wide) {
        const st = placeState(id)
        const occ = occupancy[id]
        const c = tileColours(st)
        const on = focusId === id
        return (
          <button key={id} type="button" disabled={saving} title={picking && st === 'here' ? 'Click again to take this material out of here' : undefined}
            onClick={() => (picking && st === 'here') ? unstore(id) : setFocusId(id)}
            style={{ flex: wide ? 1 : '1 1 0', minWidth: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              background: c.bg, border: `1.5px solid ${on ? 'var(--accent)' : c.bd}`, borderRadius: 8, padding: '6px 8px',
              boxShadow: on ? '0 0 0 3px var(--accent-light)' : 'none' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{label}</div>
            <div style={{ fontSize: 11, color: c.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stateText(st, occ)}</div>
          </button>
        )
      }

      return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 20, maxWidth: isRacks && places > 1 ? 560 : 440, width: '100%', border: '1px solid var(--border)', maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{viewSpot.name}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {isManagerOrAdmin && !allowLayoutEdit && <button className="btn btn-sm" onClick={() => openSetup(viewSpot.id)}>🛠 Set up</button>}
                <button className="btn btn-sm" onClick={closeWindow}>✕ Close</button>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
              {(viewSpot.facility || 'ICT') === 'ICT' ? (ICT_ROOMS.find(r => r.id === viewSpot.room_id)?.label || 'ICT Building') : 'MPF'}
              {isRacks && ' · shelves A (top) down'}{isRacks && places > 1 && ` · ${places} places per shelf`}
            </div>

            {moveItem && (
              <div style={{ background: '#EEEDFE', border: '1px solid #C5C2F5', color: '#3730a3', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>Moving <b>{moveItem.project_name || 'material'}</b> from {getLocationDetail(moveItem.from_id).detail.replace(`${viewSpot.name} · `, '')}. Pick its new place.</span>
                <button className="btn btn-sm" onClick={() => setMoveItem(null)}>Cancel</button>
              </div>
            )}

            {/* The racks: every shelf, and its places */}
            {isRacks && (
              <div style={{ overflowY: 'auto', display: 'grid', gap: 10, paddingRight: 2 }}>
                {(viewSpot.rackNames || []).map((rackName, ri) => (
                  <div key={ri}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{rackName}</div>
                    <div style={{ display: 'grid', gap: 4 }}>
                      {Array.from({ length: viewSpot.shelvesPerRack }, (_, i) => i + 1).map(n => {
                        const base = `${viewSpot.id}-R${ri + 1}-S${n}`
                        const letter = shelfLetter(n)
                        if (places === 1) return (
                          <div key={n} style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
                            <div style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>{letter}</div>
                            {tile(base, `Shelf ${letter}`, true)}
                          </div>
                        )
                        // Divided shelf: one row with a summary; click to list A1, A2, A3
                        const ids = Array.from({ length: places }, (_, k) => `${base}-P${k + 1}`)
                        const states = ids.map(placeState)
                        const free = states.filter(x => x === 'free').length
                        const hereIdx = states.indexOf('here')
                        const shelfState = hereIdx >= 0 ? 'here' : states.includes('mine') ? 'mine' : free === 0 ? 'taken' : 'free'
                        const c = tileColours(shelfState)
                        const open = openShelf === base
                        const summary = hereIdx >= 0 ? `This material · ${letter}${hereIdx + 1}`
                          : free === places ? `${places} places free`
                          : free === 0 ? 'Full' : `${free} of ${places} places free`
                        return (
                          <div key={n}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
                              <div style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>{letter}</div>
                              <button type="button" onClick={() => setOpenShelf(open ? '' : base)}
                                style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                                  background: c.bg, border: `1.5px solid ${open ? 'var(--accent)' : c.bd}`, borderRadius: 8, padding: '6px 8px' }}>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Shelf {letter}</span>
                                  <span style={{ display: 'block', fontSize: 11, color: c.fg }}>{summary}</span>
                                </span>
                                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{open ? '▴' : '▾'}</span>
                              </button>
                            </div>
                            {open && (
                              <div style={{ display: 'grid', gap: 4, margin: '4px 0 6px 26px', paddingLeft: 8, borderLeft: '2px solid var(--accent-light)' }}>
                                {ids.map((id, k) => (
                                  <div key={id} style={{ display: 'flex' }}>{tile(id, `${letter}${k + 1}`, true)}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* The chosen place: what is there, and what you can do */}
            {focus ? (
              <div style={{ borderTop: isRacks ? '1px solid var(--border)' : 'none', marginTop: isRacks ? 10 : 0, paddingTop: isRacks ? 10 : 0, display: 'grid', gap: 8, flexShrink: 0 }}>
                <div style={{ fontSize: 13 }}>
                  <b>{focusName}</b>{' · '}
                  <span style={{ color: tileColours(focusState).fg }}>
                    {focusState === 'free' ? 'Available' : focusState === 'here' ? 'This material is stored here'
                      : focusState === 'mine' ? 'Your place — you can store more here' : `Taken by ${focusOcc?.occupied_by || 'someone else'}`}
                  </span>
                </div>
                {focusOcc?.occupied && (
                  <div style={{ display: 'grid', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                    {focusOcc.items.map(it => (
                      <div key={it.row_id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, background: 'var(--row-a-strong)', borderRadius: 6, padding: '5px 8px' }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b style={{ color: '#a32d2d' }}>{it.project_name || 'Project'}</b>
                          {it.material_type && <span style={{ color: 'var(--text3)' }}> · {it.material_type}</span>}
                          <span style={{ display: 'block', color: 'var(--text3)' }}>Stored by {it.occupied_by || 'unknown'}</span>
                        </span>
                        {isManagerOrAdmin && it.material_id !== materialId && !moveItem && (
                          <button className="btn btn-sm" onClick={() => setMoveItem({ ...it, from_id: focus })}>Move</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {moveItem ? (
                  focus !== moveItem.from_id && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {focusState === 'taken' && <span style={{ fontSize: 12, color: '#a32d2d', flex: 1 }}>Someone else has this place — the material will share it.</span>}
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => moveMaterial(moveItem, focus)}>{busy ? 'Moving…' : `Move here (${focusName})`}</button>
                    </div>
                  )
                ) : picking && focusState === 'here' ? (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-sm" disabled={saving} onClick={() => unstore(focus)}>{saving ? 'Saving…' : `Take this material out of ${focusName}`}</button>
                  </div>
                ) : picking && (
                  focusState === 'taken' && !isManagerOrAdmin ? (
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>Only the person who stores here first can add to this place. Pick a free place, or ask a lab manager.</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {focusState === 'taken' && <span style={{ fontSize: 12, color: '#a32d2d', flex: 1 }}>This place belongs to {focusOcc?.occupied_by || 'someone else'}. As a lab manager you can still store here.</span>}
                      <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => saveLocations([focus])}>
                        {saving ? 'Saving…' : selected.length ? `Move this material to ${focusName}` : `Store this material in ${focusName}`}
                      </button>
                    </div>
                  )
                )}
              </div>
            ) : isRacks && (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10, flexShrink: 0 }}>
                {picking ? 'Click a shelf or place to choose it.' : 'Click a shelf or place to see what is stored there.'}
              </div>
            )}
          </div>
        </div>
      )
    })()}
    </>
  )
}
