import { useMemo } from 'react'
import { criticalPath, durationDays } from '../../lib/criticalPath'

// The network diagram: a box per task, an arrow per dependency, running from
// PROJECT START to PROJECT COMPLETION. The critical path is the highlighted
// chain — the one where no task has slack, so any slip moves the end date.
//
// This is the picture people mean by "critical path". A Gantt with some bars
// outlined does not show the chain; you cannot see what leads to what.

const NODE_W = 158, NODE_H = 58, COL_GAP = 68, ROW_GAP = 26
const CRIT = '#1a56db'          // the chain — blue, as in every PM textbook
const PLAIN = '#9aa3ad'
// Deliberately NOT red: red already means overdue on the Gantt, and one colour
// meaning two things is what made the first version hard to read.

// A box must sit to the right of everything it waits on, so its column is the
// longest path from any starting task.
function levelsOf(ids, preds) {
  const lvl = new Map(), seen = new Set()
  const walk = id => {
    if (lvl.has(id)) return lvl.get(id)
    if (seen.has(id)) return 0            // cycle guard: never recurse forever
    seen.add(id)
    const ps = (preds.get(id) || []).filter(p => ids.includes(p))
    const v = ps.length ? Math.max(...ps.map(walk)) + 1 : 0
    lvl.set(id, v)
    return v
  }
  ids.forEach(walk)
  return lvl
}

export default function TaskNetwork({ tasks, edges, onTaskClick }) {
  const model = useMemo(() => {
    const ids = tasks.map(t => t.id)
    const idSet = new Set(ids)
    const live = edges.filter(e => idSet.has(e.task_id) && idSet.has(e.depends_on_id))

    const preds = new Map(ids.map(id => [id, []]))
    const succs = new Map(ids.map(id => [id, []]))
    live.forEach(e => { preds.get(e.task_id).push(e.depends_on_id); succs.get(e.depends_on_id).push(e.task_id) })

    const lvl = levelsOf(ids, preds)
    const cpm = criticalPath(tasks, live)

    const cols = []
    ids.forEach(id => { const c = lvl.get(id) ?? 0; (cols[c] ??= []).push(id) })

    // Tallest column decides the canvas height; every column is centred in it
    // so the diagram reads as one flow rather than a top-aligned staircase.
    const rows = Math.max(1, ...cols.map(c => c.length))
    const height = rows * NODE_H + (rows - 1) * ROW_GAP
    const pos = new Map()
    cols.forEach((col, ci) => {
      const colH = col.length * NODE_H + (col.length - 1) * ROW_GAP
      const top = (height - colH) / 2
      col.forEach((id, ri) => pos.set(id, {
        x: (ci + 1) * (NODE_W + COL_GAP),
        y: top + ri * (NODE_H + ROW_GAP),
      }))
    })

    const width = (cols.length + 2) * (NODE_W + COL_GAP)
    const startY = height / 2 - NODE_H / 2
    const roots = ids.filter(id => (preds.get(id) || []).length === 0)
    const leaves = ids.filter(id => (succs.get(id) || []).length === 0)

    return { ids, live, preds, succs, pos, cpm, width, height, startY, roots, leaves, cols }
  }, [tasks, edges])

  const { pos, cpm, width, height, startY, roots, leaves, live } = model
  const byId = new Map(tasks.map(t => [t.id, t]))

  if (!tasks.length) return (
    <div className="empty-state" style={{ padding: 40 }}>
      <div className="empty-icon">🔗</div>
      <div>No tasks to chart.</div>
    </div>
  )

  const startX = 0
  const endX = width - NODE_W - COL_GAP

  // An arrow leaves the right edge of one box and enters the left edge of the
  // next. Curved, because straight lines between staggered rows cross the
  // boxes in between.
  const arrow = (x1, y1, x2, y2, crit, key) => {
    const mx = (x1 + x2) / 2
    return (
      <path key={key} d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 - 7} ${y2}`}
        fill="none" stroke={crit ? CRIT : PLAIN} strokeWidth={crit ? 2.2 : 1.3}
        markerEnd={crit ? 'url(#ah-crit)' : 'url(#ah-plain)'} opacity={crit ? 1 : 0.75} />
    )
  }

  const box = (x, y, label, sub, crit, onClick, key, filled) => (
    <g key={key} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <rect x={x} y={y} width={NODE_W} height={NODE_H} rx="9"
        fill={filled ? CRIT : 'var(--surface)'}
        stroke={crit ? CRIT : 'var(--border)'} strokeWidth={crit ? 2.2 : 1.4} />
      <text x={x + NODE_W / 2} y={y + (sub ? 23 : 33)} textAnchor="middle"
        style={{ fontSize: 12.5, fontWeight: 700, fill: filled ? '#fff' : 'var(--text)' }}>
        {label.length > 20 ? label.slice(0, 19) + '…' : label}
      </text>
      {sub && (
        <text x={x + NODE_W / 2} y={y + 41} textAnchor="middle"
          style={{ fontSize: 11, fill: filled ? 'rgba(255,255,255,0.85)' : 'var(--text3)' }}>
          {sub}
        </text>
      )}
    </g>
  )

  return (
    <div>
      {cpm.cyclic.length > 0 && (
        <div style={{ background: '#fdf0ed', border: '1px solid #e24b4a', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#c0392b', lineHeight: 1.6 }}>
          <strong>{cpm.cyclic.length} task{cpm.cyclic.length !== 1 ? 's' : ''} wait on each other in a loop.</strong> They are drawn,
          but left out of the critical path — a chain that waits on itself has no start.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginBottom: 12, fontSize: 13, color: 'var(--text2)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 22, height: 3, borderRadius: 2, background: CRIT }} /> Critical path
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 22, height: 2, borderRadius: 2, background: PLAIN }} /> Has slack
        </span>
        {live.length === 0 && (
          <span style={{ color: 'var(--text3)' }}>
            No dependencies yet — open a task and use <strong>Waits on</strong> to link them.
          </span>
        )}
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--surface2)', padding: 20 }}>
        <svg width={width} height={height} style={{ display: 'block', minWidth: '100%' }}>
          <defs>
            <marker id="ah-crit" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill={CRIT} />
            </marker>
            <marker id="ah-plain" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" fill={PLAIN} opacity="0.75" />
            </marker>
          </defs>

          {/* start -> first tasks */}
          {roots.map(id => {
            const p = pos.get(id)
            return arrow(startX + NODE_W, startY + NODE_H / 2, p.x, p.y + NODE_H / 2, cpm.critical.has(id), `s-${id}`)
          })}

          {/* dependency arrows */}
          {live.map((e, i) => {
            const a = pos.get(e.depends_on_id), b = pos.get(e.task_id)
            if (!a || !b) return null
            const crit = cpm.critical.has(e.depends_on_id) && cpm.critical.has(e.task_id)
            return arrow(a.x + NODE_W, a.y + NODE_H / 2, b.x, b.y + NODE_H / 2, crit, `e-${i}`)
          })}

          {/* last tasks -> completion */}
          {leaves.map(id => {
            const p = pos.get(id)
            return arrow(p.x + NODE_W, p.y + NODE_H / 2, endX, startY + NODE_H / 2, cpm.critical.has(id), `f-${id}`)
          })}

          {box(startX, startY, 'PROJECT START', null, true, null, 'start', true)}
          {tasks.map(t => {
            const p = pos.get(t.id)
            if (!p) return null
            const d = durationDays(t)
            const slack = cpm.slack.get(t.id)
            return box(p.x, p.y, t.title, `${d} day${d !== 1 ? 's' : ''}${slack > 0 ? ` · ${slack}d slack` : ''}`,
              cpm.critical.has(t.id), () => onTaskClick?.(t), `n-${t.id}`, false)
          })}
          {box(endX, startY, 'COMPLETION', cpm.finishDays ? `${cpm.finishDays} days total` : null, true, null, 'end', true)}
        </svg>
      </div>
    </div>
  )
}
