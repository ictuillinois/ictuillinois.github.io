import { useState, useEffect, useMemo } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import { criticalPath } from '../../lib/criticalPath'
import TaskNetwork from './TaskNetwork'

// Task timeline (Gantt).
//
// Its own file rather than another branch inside PM.jsx, which is already ~3000
// lines. Nothing here is new data: a bar spans start_date → deadline and its
// fill is `progress`, all of which tasks already carried. What was missing was
// a way to see them against each other.

const DAY = 86400000
const iso = d => d.toISOString().slice(0, 10)
const parse = s => (s ? new Date(`${s}T00:00:00`) : null)

const PRIORITY = {
  high:   { bar: '#c84b2f', soft: '#fdf0ed' },
  medium: { bar: '#1D9E75', soft: '#E1F5EE' },
  low:    { bar: '#0369a1', soft: '#e0f2fe' },
}
const barColors = t => PRIORITY[t.priority] || PRIORITY.medium

// A task with neither date cannot be placed on a timeline at all. Rather than
// inventing dates for it, it is listed separately underneath so it is not
// silently dropped — a task that vanishes from a view is worse than one that
// admits it is unscheduled.
function schedulable(t) { return !!(t.start_date || t.deadline) }

function span(t) {
  const s = parse(t.start_date) || parse(t.deadline)
  const e = parse(t.deadline) || parse(t.start_date)
  return e < s ? { start: e, end: s } : { start: s, end: e }
}

// Progress over time for the tasks currently in view.
//
// Built from task_progress_log, not from tasks.progress — the latter is only
// today's number. Each day takes the last value LOGGED ON OR BEFORE it for
// every task and averages them: carrying forward matters, because a task
// nobody touched for a week has not gone back to zero.
//
// Tasks with no log entries at all (created before logging existed) count as
// 0 until their first recorded change, which is the honest reading — their
// past is genuinely unknown.
function ProgressChart({ tasks, log, height = 150 }) {
  const ids = new Set(tasks.map(t => t.id))
  const points = log.filter(r => ids.has(r.task_id))

  if (!tasks.length) return null
  if (!points.length) return (
    <div style={{ border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 16px', marginBottom: 20, fontSize: 13, color: 'var(--text3)', lineHeight: 1.6 }}>
      No progress history yet. The chart fills in as people move tasks along —
      it is recorded from now on, so it cannot show anything from before today.
    </div>
  )

  const dayOf = ts => new Date(ts).toISOString().slice(0, 10)
  const firstDay = points.reduce((m, r) => { const d = dayOf(r.changed_at); return !m || d < m ? d : m }, null)
  const from = new Date(firstDay + 'T00:00:00')
  const to = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')
  const days = Math.max(1, Math.round((to - from) / 86400000) + 1)

  // last value per task, walked forward one day at a time
  const byTask = new Map()
  points.forEach(r => {
    if (!byTask.has(r.task_id)) byTask.set(r.task_id, [])
    byTask.get(r.task_id).push(r)
  })
  for (const arr of byTask.values()) arr.sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at))

  const series = []
  const cursor = new Map()
  for (let i = 0; i < days; i++) {
    const d = new Date(+from + i * 86400000)
    const key = d.toISOString().slice(0, 10)
    byTask.forEach((arr, id) => {
      const upto = arr.filter(r => dayOf(r.changed_at) <= key)
      if (upto.length) cursor.set(id, upto[upto.length - 1].progress)
    })
    let sum = 0
    tasks.forEach(t => { sum += cursor.get(t.id) ?? 0 })
    series.push({ key, avg: sum / tasks.length })
  }

  const W = 100, H = 100      // viewBox units; the svg scales to its box
  const x = i => (days === 1 ? W / 2 : (i / (days - 1)) * W)
  const y = v => H - (v / 100) * H
  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(p.avg).toFixed(2)}`).join(' ')
  const area = `${line} L ${x(series.length - 1).toFixed(2)} ${H} L ${x(0).toFixed(2)} ${H} Z`
  const latest = series[series.length - 1].avg

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 20, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Average progress
        </span>
        <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{Math.round(latest)}%</span>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>
          across {tasks.length} task{tasks.length !== 1 ? 's' : ''} · since {firstDay}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block', overflow: 'visible' }}>
        {[0, 25, 50, 75, 100].map(v => (
          <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill="var(--accent)" opacity="0.14" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(series.length - 1)} cy={y(latest)} r="3" fill="var(--accent)" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 4 }}>
        <span>{firstDay}</span><span>{series[series.length - 1].key}</span>
      </div>
    </div>
  )
}

export default function Timeline({ userId, isOwnerAdmin, isSolo, orgId, onTaskClick, reloadKey = 0 }) {
  const { toast } = useAppStore()
  const [tasks, setTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [log, setLog] = useState([])
  const [edges, setEdges] = useState([])
  const [showCritical, setShowCritical] = useState(true)
  const [view, setView] = useState('gantt')   // 'gantt' | 'network'
  const [loading, setLoading] = useState(true)
  const [projectFilter, setProjectFilter] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const [zoom, setZoom] = useState(26)          // px per day

  useEffect(() => { load() }, [userId, isOwnerAdmin, orgId, isSolo, reloadKey])

  async function load() {
    setLoading(true)
    let tq = sb.from('tasks').select('*').eq('login_mode', isSolo ? 'solo' : 'team')
    if (isSolo) tq = tq.eq('created_by', userId || '00000000-0000-0000-0000-000000000000')
    else {
      tq = tq.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
      // A lab manager sees the whole board; everyone else sees their own, plus
      // nothing marked private that is not theirs.
      if (!isOwnerAdmin) tq = tq.eq('assigned_to', userId || '00000000-0000-0000-0000-000000000000')
    }

    let pq = sb.from('projects').select('id, name, project_id')
    pq = isSolo ? pq.eq('solo_owner_id', userId || '00000000-0000-0000-0000-000000000000')
                : pq.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')

    // 180 days is plenty for a chart nobody reads further back than, and it
    // keeps the payload bounded as the log grows.
    const since = new Date(Date.now() - 180 * 86400000).toISOString()
    const lq = sb.from('task_progress_log').select('task_id, progress, changed_at')
      .gte('changed_at', since).order('changed_at')

    let dq = sb.from('task_dependencies').select('id, task_id, depends_on_id')
    if (!isSolo) dq = dq.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')

    const [{ data: t, error: te }, { data: p, error: pe }, { data: lg, error: le }, { data: dp, error: de }] =
      await Promise.all([tq, pq, lq, dq])
    if (de) console.error('[Timeline] dependencies failed:', de)
    setEdges(dp || [])
    if (le) console.error('[Timeline] progress history failed:', le)
    setLog(lg || [])
    setLoading(false)
    if (te) { toast('Could not load tasks: ' + te.message, true); return }
    if (pe) console.error('[Timeline] project load failed:', pe)
    setTasks((t || []).filter(x => !x.is_private || String(x.assigned_to) === String(userId)))
    setProjects(p || [])
  }

  const projectName = id => {
    const p = projects.find(x => x.id === id)
    return p ? (p.name + (p.project_id ? ` · ${p.project_id}` : '')) : null
  }

  const shown = useMemo(() => tasks
    .filter(t => !projectFilter || (projectFilter === '__none__' ? !t.project_id : t.project_id === projectFilter))
    .filter(t => !hideDone || t.status !== 'done'), [tasks, projectFilter, hideDone])

  const placed = shown.filter(schedulable)
  const unscheduled = shown.filter(t => !schedulable(t))

  // The window covers every bar, padded either side, and always includes today
  // so the "now" line has somewhere to land on a board that is entirely past
  // or entirely future.
  const range = useMemo(() => {
    const today = new Date(iso(new Date()) + 'T00:00:00')
    if (!placed.length) return { from: new Date(today - 3 * DAY), to: new Date(+today + 18 * DAY) }
    let lo = null, hi = null
    placed.forEach(t => {
      const { start, end } = span(t)
      if (!lo || start < lo) lo = start
      if (!hi || end > hi) hi = end
    })
    if (today < lo) lo = today
    if (today > hi) hi = today
    return { from: new Date(+lo - 2 * DAY), to: new Date(+hi + 3 * DAY) }
  }, [placed])

  const days = Math.max(1, Math.round((range.to - range.from) / DAY) + 1)
  const width = days * zoom
  const xOf = d => Math.round(((d - range.from) / DAY) * zoom)

  const grouped = useMemo(() => {
    const m = new Map()
    placed.forEach(t => {
      const k = t.project_id || '__none__'
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(t)
    })
    for (const list of m.values()) list.sort((a, b) => span(a).start - span(b).start)
    // Unassigned tasks last, projects alphabetical before them.
    return [...m.entries()].sort(([a], [b]) =>
      a === '__none__' ? 1 : b === '__none__' ? -1 : (projectName(a) || '').localeCompare(projectName(b) || ''))
  }, [placed, projects])

  // Critical path over what is on screen. Computed from the filtered set, so
  // narrowing to one project answers "what drives THIS project's finish date"
  // rather than the whole board's.
  const liveEdges = useMemo(() => {
    const on = new Set(placed.map(t => t.id))
    return edges.filter(e => on.has(e.task_id) && on.has(e.depends_on_id))
  }, [placed, edges])

  const cpm = useMemo(() => criticalPath(placed, liveEdges), [placed, liveEdges])

  const today = new Date(iso(new Date()) + 'T00:00:00')
  const todayX = xOf(today)

  const ticks = []
  for (let i = 0; i < days; i++) {
    const d = new Date(+range.from + i * DAY)
    ticks.push({ d, x: i * zoom, weekend: d.getDay() === 0 || d.getDay() === 6, first: d.getDate() === 1 })
  }

  const lbl = { fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Timeline</div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          {placed.length} scheduled{unscheduled.length ? ` · ${unscheduled.length} undated` : ''}
        </div>
      </div>

      <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
        {[['gantt', 'Timeline'], ['network', 'Critical path']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setView(k)}
            style={{ padding: '8px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: view === k ? 'var(--accent)' : 'var(--surface)',
              color: view === k ? '#fff' : 'var(--text2)' }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">All projects</option>
          <option value="__none__">No project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 0, cursor: 'pointer' }}>
          <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} style={{ width: 'auto' }} />
          Hide done
        </label>
        {view === 'gantt' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 0, cursor: 'pointer' }}>
            <input type="checkbox" checked={showCritical} onChange={e => setShowCritical(e.target.checked)} style={{ width: 'auto' }} />
            Mark critical path
          </label>
        )}
        <div style={{ marginLeft: 'auto', display: view === 'gantt' ? 'flex' : 'none', alignItems: 'center', gap: 8 }}>
          <span style={lbl}>Zoom</span>
          <input type="range" min="12" max="56" value={zoom} onChange={e => setZoom(+e.target.value)} style={{ width: 120 }} />
        </div>
      </div>

      {cpm.cyclic.length > 0 && (
        <div style={{ background: '#fdf0ed', border: '1px solid #e24b4a', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#c0392b', lineHeight: 1.6 }}>
          <strong>{cpm.cyclic.length} task{cpm.cyclic.length !== 1 ? 's' : ''} form a dependency loop</strong> and are left out of
          the critical path — a chain that waits on itself has no start. Open one and remove a "waits on" entry to break it.
        </div>
      )}

      {showCritical && liveEdges.length > 0 && cpm.critical.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>
          <span style={{ display: 'inline-block', width: 22, height: 10, borderRadius: 3, background: '#1a56db' }} />
          <span><strong>{cpm.critical.size}</strong> task{cpm.critical.size !== 1 ? 's' : ''} on the critical path — slipping any of
          them moves the finish date. The chain runs <strong>{cpm.finishDays}</strong> day{cpm.finishDays !== 1 ? 's' : ''} end to end.</span>
        </div>
      )}

      {view === 'network' ? (
        <TaskNetwork tasks={placed} edges={liveEdges} onTaskClick={onTaskClick} />
      ) : (<>

      <ProgressChart tasks={shown} log={log} />

      {placed.length === 0 ? (
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="empty-icon">📈</div>
          <div>No scheduled tasks. Give a task a start date or a deadline and it appears here.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface)' }}>
          {/* Names stay put while the bars scroll — a Gantt is unreadable if the
              row labels slide out of view. */}
          <div style={{ flexShrink: 0, width: 210, borderRight: '1px solid var(--border)', background: 'var(--surface2)' }}>
            <div style={{ height: 44, borderBottom: '1px solid var(--border)' }} />
            {grouped.map(([key, list]) => (
              <div key={key}>
                <div style={{ ...lbl, padding: '8px 12px 6px', background: 'var(--row-b-strong)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {key === '__none__' ? 'No project' : (projectName(key) || 'Project')}
                </div>
                {list.map(t => (
                  <div key={t.id} onClick={() => onTaskClick?.(t)}
                    style={{ height: 34, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13, cursor: onTaskClick ? 'pointer' : 'default', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: t.status === 'done' ? 'var(--text3)' : 'var(--text)', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>
                    {t.title}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ overflowX: 'auto', flex: 1 }}>
            <div style={{ width, position: 'relative' }}>
              {/* day ruler */}
              <div style={{ height: 44, borderBottom: '1px solid var(--border)', position: 'relative' }}>
                {ticks.map((t, i) => (
                  <div key={i} style={{ position: 'absolute', left: t.x, top: 0, bottom: 0, width: zoom, borderLeft: t.first ? '1px solid var(--border)' : 'none', background: t.weekend ? 'var(--surface2)' : 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {zoom >= 20 && <span>{t.d.toLocaleDateString(undefined, { month: 'short' })}</span>}
                    <span style={{ fontWeight: 600 }}>{t.d.getDate()}</span>
                  </div>
                ))}
              </div>

              {grouped.map(([key, list]) => (
                <div key={key}>
                  <div style={{ height: 29, background: 'var(--row-b-strong)', borderBottom: '1px solid var(--border)', position: 'relative' }}>
                    {ticks.map((t, i) => t.weekend ? <div key={i} style={{ position: 'absolute', left: t.x, top: 0, bottom: 0, width: zoom, background: 'rgba(0,0,0,0.03)' }} /> : null)}
                  </div>
                  {list.map(t => {
                    const { start, end } = span(t)
                    const x = xOf(start)
                    const w = Math.max(zoom - 4, xOf(end) - x + zoom - 4)
                    const c = barColors(t)
                    const pct = Math.max(0, Math.min(100, t.progress ?? 0))
                    const overdue = t.status !== 'done' && parse(t.deadline) && parse(t.deadline) < today
                    const isCritical = showCritical && cpm.critical.has(t.id) && liveEdges.length > 0
                    const slack = cpm.slack.get(t.id)
                    return (
                      <div key={t.id} style={{ height: 34, position: 'relative', borderBottom: '1px solid var(--border)' }}>
                        {ticks.map((tk, i) => tk.weekend ? <div key={i} style={{ position: 'absolute', left: tk.x, top: 0, bottom: 0, width: zoom, background: 'rgba(0,0,0,0.03)' }} /> : null)}
                        <div onClick={() => onTaskClick?.(t)}
                          title={`${t.title}\n${t.start_date || '—'} → ${t.deadline || '—'}\n${pct}% complete${overdue ? ' · overdue' : ''}${isCritical ? '\ncritical path — no slack' : (slack > 0 ? `\n${slack} day${slack !== 1 ? 's' : ''} of slack` : '')}`}
                          style={{ position: 'absolute', left: x + 2, top: 6, width: w, height: 22, borderRadius: 6, background: c.soft, border: `${isCritical ? 2.5 : 1.5}px solid ${isCritical ? '#1a56db' : overdue ? '#c84b2f' : c.bar}`,
                            boxShadow: isCritical ? '0 0 0 2px rgba(26,86,219,0.18)' : 'none', cursor: onTaskClick ? 'pointer' : 'default', overflow: 'hidden', opacity: t.status === 'done' ? 0.55 : 1 }}>
                          {/* progress fill */}
                          <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: c.bar, opacity: 0.55 }} />
                          <div style={{ position: 'relative', fontSize: 10, fontWeight: 600, color: 'var(--text)', padding: '3px 6px', whiteSpace: 'nowrap' }}>
                            {pct > 0 ? `${pct}%` : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}

              {/* today */}
              {todayX >= 0 && todayX <= width && (
                <div style={{ position: 'absolute', left: todayX + zoom / 2, top: 0, bottom: 0, width: 2, background: '#c84b2f', pointerEvents: 'none' }} />
              )}
            </div>
          </div>
        </div>
      )}

      </>)}

      {view === 'gantt' && unscheduled.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ ...lbl, marginBottom: 8 }}>Undated — not on the timeline ({unscheduled.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {unscheduled.map(t => (
              <button key={t.id} onClick={() => onTaskClick?.(t)} className="btn btn-sm"
                title="Give this task a start date or deadline to place it on the timeline">
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
