import { useState, useEffect } from 'react'
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
function ICTMap({ occupancy, selected, onToggle, canEdit }) {
  const [tooltip, setTooltip] = useState(null)

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
    <svg viewBox="0 0 820 260" width="100%" style={{ minWidth: 600, display: 'block' }}
      onClick={e => { if (e.target.tagName === 'svg') setTooltip(null) }}>
      <rect x="2" y="2" width="816" height="256" fill="#f5f4f0" stroke="#555" strokeWidth="2" rx="2"/>
      <rect x="6" y="148" width="810" height="8" fill="#ddd"/>

      {rooms.map(r => {
        const lines = r.label.split('\n')
        const cx = r.x + r.w / 2
        const cy = r.y + r.h / 2
        const occ = occupancy[r.id]
        return (
          <g key={r.id} style={{ cursor: occ?.occupied && !selected.includes(r.id) ? 'not-allowed' : 'pointer' }}
            onClick={() => handleClick(r.id, r.label.replace('\n', ' '), cx, cy)}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h}
              fill={getRoomFill(r.id)} stroke={getRoomStroke(r.id)} strokeWidth={selected.includes(r.id) ? 2 : 1.2} rx="1"/>
            {lines.map((line, i) => (
              <text key={i} x={r.tx} y={r.ty + (i - (lines.length - 1) / 2) * 13}
                textAnchor="middle" fontSize={r.w < 40 ? 8 : 10} fontFamily="sans-serif"
                fill={occ?.occupied && !selected.includes(r.id) ? '#fff' : '#333'} fontWeight="500">
                {line}
              </text>
            ))}
          </g>
        )
      })}

      {/* ── High Bay C shelves: 14 shelves along right wall, numbered 1-14 bottom to top ── */}
      {Array.from({ length: 14 }, (_, i) => {
        const shelfNum = i + 1
        const id = `ICT-HBC-S${shelfNum}`
        // Right wall of HBC: x=472, y=6, w=162, h=100
        // Shelves along right wall (x ~620), stacked bottom to top
        // Each shelf unit is ~6px wide, rows are 3 cols
        const shelfX = 620
        const shelfH = 6  // shelf header height
        const rowH = 8
        const unitH = shelfH + 3 * rowH
        const shelfY = 6 + 100 - (i + 1) * (unitH + 2)  // bottom to top
        return (
          <g key={id}>
            <rect x={shelfX} y={shelfY} width={12} height={shelfH} fill="#8b6914" rx="1"/>
            <text x={shelfX + 6} y={shelfY + 5} textAnchor="middle" fontSize={4} fontFamily="sans-serif" fill="#fff">{shelfNum}</text>
            {[1,2,3].map(row => {
              const rowId = `${id}-R${row}`
              const ry0 = shelfY + shelfH + (row - 1) * rowH
              const occ = occupancy[rowId]
              return (
                <g key={rowId} style={{ cursor: occ?.occupied && !selected.includes(rowId) ? 'not-allowed' : 'pointer' }}
                  onClick={e => { e.stopPropagation(); handleClick(rowId, `HBC Shelf ${shelfNum} · Row ${row}`, shelfX + 6, ry0 + rowH/2) }}>
                  <rect x={shelfX} y={ry0} width={12} height={rowH - 1} rx="1"
                    fill={selected.includes(rowId) ? C.selected : occ?.occupied ? C.occupied : '#d4a520'}
                    stroke={selected.includes(rowId) ? C.selected_stroke : occ?.occupied ? C.occupied_stroke : '#8b6914'}
                    strokeWidth={selected.includes(rowId) ? 1.5 : 0.8}/>
                  <text x={shelfX + 6} y={ry0 + rowH - 2} textAnchor="middle" fontSize={4} fontFamily="sans-serif"
                    fill={occ?.occupied && !selected.includes(rowId) ? '#fff' : '#3d2a00'}>R{row}</text>
                </g>
              )
            })}
          </g>
        )
      })}

      {/* ── High Bay B shelves: 5 shelves clustered at LEFT side of top wall, numbered 1-5 left to right ── */}
      {Array.from({ length: 5 }, (_, i) => {
        const shelfNum = i + 1
        const id = `ICT-HBB-S${shelfNum}`
        // HBB: x=298, y=6, w=172, h=80
        // All 5 shelves packed at the left side of top wall starting at x=300
        const unitW = 18
        const gap = 2
        const startX = 300 + i * (unitW + gap)
        const shelfY = 10
        const shelfHeaderH = 5
        const rowH = 7
        return (
          <g key={id}>
            <rect x={startX} y={shelfY} width={unitW} height={shelfHeaderH} fill="#8b6914" rx="1"/>
            <text x={startX + unitW/2} y={shelfY + 4} textAnchor="middle" fontSize={4} fontFamily="sans-serif" fill="#fff">S{shelfNum}</text>
            {[1,2,3].map(row => {
              const rowId = `${id}-R${row}`
              const ry0 = shelfY + shelfHeaderH + (row - 1) * rowH
              const occ = occupancy[rowId]
              return (
                <g key={rowId} style={{ cursor: occ?.occupied && !selected.includes(rowId) ? 'not-allowed' : 'pointer' }}
                  onClick={e => { e.stopPropagation(); handleClick(rowId, `HBB Shelf ${shelfNum} · Row ${row}`, startX + unitW/2, ry0 + rowH/2) }}>
                  <rect x={startX} y={ry0} width={unitW} height={rowH - 1} rx="1"
                    fill={selected.includes(rowId) ? C.selected : occ?.occupied ? C.occupied : '#d4a520'}
                    stroke={selected.includes(rowId) ? C.selected_stroke : occ?.occupied ? C.occupied_stroke : '#8b6914'}
                    strokeWidth={selected.includes(rowId) ? 1.5 : 0.8}/>
                  <text x={startX + unitW/2} y={ry0 + rowH - 2} textAnchor="middle" fontSize={4} fontFamily="sans-serif"
                    fill={occ?.occupied && !selected.includes(rowId) ? '#fff' : '#3d2a00'}>R{row}</text>
                </g>
              )
            })}
          </g>
        )
      })}

      {tooltip && <Tooltip x={tooltip.x} y={tooltip.y} info={tooltip} onClose={() => setTooltip(null)} />}
    </svg>
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
export default function FloorPlanPicker({ projectId, projectName, materialId, materialType, currentLocations = [], onConfirm, onClose }) {
  const { session } = useAppStore()
  const [customPlans, setCustomPlans] = useState([])
  const [facility, setFacility] = useState(null)   // set after load
  const [occupancy, setOccupancy] = useState({})   // { location_id: { occupied, project_name, material_type } }
  const [selected, setSelected] = useState(        // pre-populate with existing locations
    currentLocations.map(l => l.location_id).filter(Boolean)
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const canEdit = !!session
  const isSolo = session?.loginMode === 'solo'
  const isICTOrg = session?.organizationId === '5bab5b33-fff9-4a4a-b617-3dac179f9678'

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

    const [{ data: locData }, { data: planData }] = await Promise.all([
      locQuery,
      orgId
        ? sb.from('floor_plans').select('*').eq('organization_id', orgId).order('created_at')
        : Promise.resolve({ data: [] }),
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

    // Default tab: first custom plan if any, else ICT
    if (plans.length > 0) setFacility(`custom_${plans[0].id}`)
    else if (session?.organizationId === '5bab5b33-fff9-4a4a-b617-3dac179f9678') setFacility('ICT')
    else setFacility(null)

    setLoading(false)
  }

  function toggleLocation(id, label, fac) {
    if (!canEdit) return
    setSelected(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  function getLocationDetail(id) {
    // Try to find the zone label from custom plans
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
    { color: '#9FE1CB', border: '#0F6E56', label: 'Selected' },
    { color: '#e24b4a', border: '#a32d2d', label: 'Occupied' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 900, border: '1px solid var(--border)', marginTop: 16 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Select storage location</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Tap to select · Occupied locations show project info on tap</div>
          </div>
          <button className="btn btn-sm" onClick={onClose}>✕ Close</button>
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
            return plan ? <CustomPlanTab plan={plan} selected={selected} onToggle={toggleLocation} occupancy={occupancy} canEdit={canEdit} /> : null
          })() : facility === 'ICT' ? (
            <ICTMap occupancy={occupancy} selected={selected} onToggle={toggleLocation} canEdit={canEdit} />
          ) : (
            <MPFMap occupancy={occupancy} selected={selected} onToggle={toggleLocation} canEdit={canEdit} />
          )}
        </div>

        {/* Selected chips */}
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

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          {canEdit && (
            <button className="btn btn-primary" onClick={confirm} disabled={saving || selected.length === 0}>
              {saving ? 'Saving…' : `Confirm ${selected.length} location${selected.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
