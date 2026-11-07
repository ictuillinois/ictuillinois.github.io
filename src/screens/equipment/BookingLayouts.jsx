// Booking page layouts (Nov 2026). Each person picks how the Booking page
// draws bookings: Classic (the original Day / Week / Month grid, still in
// BookingEquipment.jsx), Timeline, Agenda or Calendar. With many instruments
// selected, Classic split each day into slivers and nobody could read who had
// booked what — the three layouts here show the person, time and purpose on
// every booking at first look.
//
// Booking itself is NOT reimplemented here: every view hands a time (and, for
// Timeline, the instruments) back to BookingCalendar, which opens the same
// booking form / multi-booking bar as Classic.
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { sb } from '../../lib/supabase'
import { IconGrid, IconTimeline, IconList, IconCalendar } from '../../components/Icons'

const APP = 'ictlab'
const DAY = 86400000
const HOUR = 3600000
const SNAP = 30 * 60000

export const LAYOUTS = [
  { key: 'current',  label: 'Classic',  Icon: IconGrid,     hint: 'Day, Week and Month calendar' },
  { key: 'timeline', label: 'Timeline', Icon: IconTimeline, hint: 'One row per instrument — who has it, and when' },
  { key: 'agenda',   label: 'Agenda',   Icon: IconList,     hint: 'Every booking in time order' },
  { key: 'calendar', label: 'Calendar', Icon: IconCalendar, hint: 'Week grid with overlapping bookings grouped' },
]
const LAYOUT_KEYS = LAYOUTS.map(l => l.key)

const STATUS = {
  confirmed: { label: 'Confirmed', fg: '#085041', bg: '#E1F5EE', bd: '#1D9E75' },
  pending:   { label: 'Pending',   fg: '#92400e', bg: '#fef3c7', bd: '#d4a017' },
  denied:    { label: 'Denied',    fg: '#a32d2d', bg: '#fcebeb', bd: '#c84b2f' },
  cancelled: { label: 'Cancelled', fg: '#5f5e5a', bg: '#f1efe8', bd: '#a09d96' },
}
const statusOf = b => STATUS[b.status] || STATUS.confirmed
const live = b => b.status !== 'cancelled' && b.status !== 'denied'
function shape(b) {
  const s = statusOf(b)
  return { background: s.bg, color: s.fg, border: `1.5px ${b.status === 'pending' ? 'dashed' : 'solid'} ${s.bd}` }
}

// ── names, colours, times ─────────────────────────────────────
const eqName = e => e?.equipment_name || e?.nickname || 'Equipment'
const eqNick = e => (e?.nickname && e.nickname !== e.equipment_name ? e.nickname : '')
// The person the booking is for: someone booked on behalf of, else the booker
const personName = b => b.booked_on_behalf_of || b.user_name || 'Unknown'
const personKey = b => (b.booked_on_behalf_of ? `for:${b.booked_on_behalf_of}` : (b.user_id || b.user_name || '?'))
const PALETTE = ['#1D9E75', '#534AB7', '#c2410c', '#0369a1', '#a21caf', '#4d7c0f', '#9a5b06', '#be123c']
function colourFor(key) {
  let h = 0
  for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
const initials = n => n.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()

function Avatar({ b, size = 22 }) {
  const name = personName(b)
  return (
    <span className="bkl-av" aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45), background: colourFor(personKey(b)) }}>
      {initials(name)}
    </span>
  )
}

const fmtT = d => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const fmtDay = d => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()
const isMulti = b => !sameDay(b.start_time, new Date(new Date(b.end_time) - 1))
function whenText(b) {
  return isMulti(b)
    ? `${fmtDay(b.start_time)} ${fmtT(b.start_time)} → ${fmtDay(b.end_time)} ${fmtT(b.end_time)}`
    : `${fmtDay(b.start_time)} · ${fmtT(b.start_time)} – ${fmtT(b.end_time)}`
}
const midnight = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

// ── the per-person layout choice ──────────────────────────────
// Saved to the person's account (users.booking_layout) so phone and laptop
// match, and to this browser so the page opens in it before the row loads.
// Before booking_layout_setup.sql runs, the column is missing: the choice then
// lives in this browser only (the read and the save both report the error).
export function useBookingLayout(session, isMobile) {
  const key = `${APP}_booking_layout_${session?.userId || 'x'}`
  const table = session?.loginMode === 'solo' ? 'solo_users' : 'users'
  const [layout, setLayoutState] = useState(() => {
    try { const v = localStorage.getItem(key); if (LAYOUT_KEYS.includes(v)) return v } catch { /* private window */ }
    return null
  })
  useEffect(() => {
    if (!session?.userId) return
    let off = false
    sb.from(table).select('booking_layout').eq('id', session.userId).maybeSingle()
      .then(({ data, error }) => {
        if (off) return
        if (error) { console.warn('[booking layout] not read from the account:', error.message); return }
        const v = data?.booking_layout
        if (LAYOUT_KEYS.includes(v)) {
          setLayoutState(v)
          try { localStorage.setItem(key, v) } catch { /* ignore */ }
        }
      })
    return () => { off = true }
  }, [session?.userId])
  async function setLayout(v) {
    setLayoutState(v)
    try { localStorage.setItem(key, v) } catch { /* ignore */ }
    if (!session?.userId) return
    const { data, error } = await sb.from(table).update({ booking_layout: v }).eq('id', session.userId).select('id')
    if (error || !data?.length) console.warn('[booking layout] not saved to the account:', error?.message || 'no row matched')
  }
  // No choice yet: Timeline on a computer, Agenda on a phone
  return [layout || (isMobile ? 'agenda' : 'timeline'), setLayout]
}

export function LayoutSwitch({ value, onChange }) {
  return (
    <div className="bkl-switch">
      <span className="bkl-switch-label">Layout</span>
      <div className="bkl-seg" role="radiogroup" aria-label="Booking page layout">
        {LAYOUTS.map(({ key, label, Icon, hint }) => (
          <button key={key} type="button" role="radio" aria-checked={value === key} title={hint}
            className={value === key ? 'on' : ''} onClick={() => onChange(key)}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>
      <span className="bkl-switch-note">Saved to your account</span>
    </div>
  )
}

// Pinned column headings live outside the sideways-scrolling body; this keeps
// them lined up with it when it scrolls sideways.
function useHeadSync() {
  const headRef = useRef(null)
  const syncHead = e => { if (headRef.current) headRef.current.scrollLeft = e.currentTarget.scrollLeft }
  return [headRef, syncHead]
}

// ── hover card: the full details the moment the pointer is on a booking ──
function useBookingHover() {
  const [hover, setHover] = useState(null)
  useEffect(() => {
    if (!hover) return
    const off = () => setHover(null)
    window.addEventListener('scroll', off, true)
    return () => window.removeEventListener('scroll', off, true)
  }, [hover])
  const bind = b => ({
    onMouseEnter: e => setHover({ b, rect: e.currentTarget.getBoundingClientRect() }),
    onMouseLeave: () => setHover(null),
  })
  return [hover, bind, () => setHover(null)]
}

function HoverCard({ hover, eqById }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  useLayoutEffect(() => {
    if (!hover || !ref.current) { setPos(null); return }
    const w = ref.current.offsetWidth, h = ref.current.offsetHeight, r = hover.rect
    const x = Math.min(Math.max(12, r.left), window.innerWidth - w - 12)
    let y = r.bottom + 8
    if (y + h > window.innerHeight - 12) y = Math.max(12, r.top - h - 8)
    setPos({ x, y })
  }, [hover])
  if (!hover) return null
  const b = hover.b, e = eqById[b.equipment_id], s = statusOf(b)
  return createPortal(
    <div ref={ref} className="bkl-hover" style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}>
      <div className="bkl-hover-eq">{eqName(e)}</div>
      {(eqNick(e) || e?.location) && <div className="bkl-hover-sub">{[eqNick(e), e?.location].filter(Boolean).join(' · ')}</div>}
      <div className="bkl-hover-row"><span>{b.booked_on_behalf_of ? 'Booked for' : 'Booked by'}</span><Avatar b={b} /><b>{personName(b)}</b></div>
      {b.booked_on_behalf_of && <div className="bkl-hover-row"><span>Booked by</span>{b.user_name}</div>}
      <div className="bkl-hover-row"><span>Purpose</span>{b.title || '—'}</div>
      <div className="bkl-hover-row"><span>When</span><span className="bkl-mono">{whenText(b)}</span></div>
      <div className="bkl-hover-row"><span>Status</span><span className="bkl-chip" style={{ background: s.bg, color: s.fg, borderColor: s.bd }}>{s.label}</span></div>
      {b.notes && <div className="bkl-hover-row"><span>Notes</span><span className="bkl-clamp">{b.notes}</span></div>}
      <div className="bkl-hover-foot">Click for the full booking</div>
    </div>,
    document.body
  )
}

// Hours shown for one day: 7 AM–7 PM, widened to fit the bookings that start
// and end on that day (one running through the night is clipped, not allowed
// to stretch the view to 24 hours)
function hourRange(items, day) {
  let lo = 7, hi = 19
  const d0 = +midnight(day)
  items.forEach(b => {
    const s = (new Date(b.start_time) - d0) / HOUR, e = (new Date(b.end_time) - d0) / HOUR
    if (s < 0 || e > 24) return
    lo = Math.min(lo, Math.floor(s))
    hi = Math.max(hi, Math.ceil(e))
  })
  return [lo, hi]
}
const hourLabel = h => (h === 0 || h === 24 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`)

// Greedy lanes so overlapping items stack instead of covering each other
function laneUp(items, startOf, endOf) {
  const ends = []
  items.forEach(it => {
    let l = ends.findIndex(e => e <= startOf(it))
    if (l < 0) { l = ends.length; ends.push(0) }
    ends[l] = endOf(it); it.lane = l
  })
  return Math.max(1, ends.length)
}

// ══════════════════════════════════════════════════════════════
// TIMELINE — one row per instrument (or per person)
// Week zoom: a cell per day with a card per booking (name, time, purpose).
// Day zoom: hours left to right; drag along a row to book that instrument,
// down across rows to book several at the same time.
// ══════════════════════════════════════════════════════════════
export function TimelineView({ zoom, weekStart, dayDate, rows, bookings, eqById, canBook, isLocked, onBookingClick, onRangeBook, onOpenDay, onLockedRow, flashId }) {
  const [group, setGroup] = useState(() => {
    try { return localStorage.getItem(`${APP}_booking_tl_rows`) === 'people' ? 'people' : 'eq' } catch { return 'eq' }
  })
  const [showIdle, setShowIdle] = useState(false)
  const [hover, bind, clearHover] = useBookingHover()
  const [headRef, syncHead] = useHeadSync()
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)
  const trackRefs = useRef([])
  const rowsRef = useRef([])
  const flashRef = useRef(null)

  function pickGroup(g) {
    setGroup(g)
    try { localStorage.setItem(`${APP}_booking_tl_rows`, g) } catch { /* ignore */ }
  }

  const isDay = zoom === 'day'
  const from = isDay ? midnight(dayDate) : midnight(weekStart)
  const to = addDays(from, isDay ? 1 : 7)
  const inRange = bookings.filter(b => new Date(b.end_time) > from && new Date(b.start_time) < to)

  // Rows. Instruments with nothing booked are folded away past 12 rows, so
  // Select all stays short; the one just opened from "+ Book" always shows.
  let rowList, idleCount = 0
  if (group === 'eq') {
    const busy = new Set(inRange.map(b => b.equipment_id))
    const all = rows.length <= 12 || showIdle
    rowList = rows.filter(e => all || busy.has(e.id) || e.id === flashId)
      .map(e => ({ key: e.id, eq: e, items: inRange.filter(b => b.equipment_id === e.id) }))
    idleCount = all ? 0 : rows.length - rowList.length
  } else {
    const people = {}
    inRange.forEach(b => {
      const k = personKey(b)
      if (!people[k]) people[k] = { key: k, name: personName(b), sample: b, items: [] }
      people[k].items.push(b)
    })
    rowList = Object.values(people).sort((a, b) => a.name.localeCompare(b.name))
  }
  rowsRef.current = rowList
  const canDrag = isDay && group === 'eq' && canBook

  useEffect(() => {
    if (flashId) flashRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [flashId, zoom])

  // ── Day zoom geometry ──
  const [h0, h1] = isDay ? hourRange(inRange, from) : [0, 24]
  const r0 = +from + h0 * HOUR, r1 = +from + h1 * HOUR
  const pct = t => ((t - r0) / (r1 - r0)) * 100

  function timeAt(x, el) {
    const r = el.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (x - r.left) / r.width))
    return r0 + Math.round((f * (r1 - r0)) / SNAP) * SNAP
  }
  function rowAt(y) {
    const els = trackRefs.current
    for (let i = 0; i < rowsRef.current.length; i++) {
      const r = els[i]?.getBoundingClientRect()
      if (r && y >= r.top && y <= r.bottom) return i
    }
    const first = els[0]?.getBoundingClientRect()
    return first && y < first.top ? 0 : rowsRef.current.length - 1
  }
  function busyIn(row, s, e) {
    return row.items.some(b => live(b) && +new Date(b.start_time) < e && +new Date(b.end_time) > s)
  }

  function onTrackDown(e, ri) {
    if (!canDrag || e.button > 0 || e.target.closest('[data-bk]')) return
    const row = rowList[ri]
    if (isLocked?.(row.key)) { onLockedRow?.(row.key); return }
    const t = timeAt(e.clientX, trackRefs.current[ri])
    const d = { r0: ri, r1: ri, t0: t, t1: t }
    dragRef.current = d
    setDrag(d)
    clearHover()
    e.preventDefault()
  }
  useEffect(() => {
    if (!drag) return
    function move(e) {
      const d = dragRef.current
      if (!d) return
      const n = { ...d, r1: rowAt(e.clientY), t1: timeAt(e.clientX, trackRefs.current[d.r0]) }
      dragRef.current = n
      setDrag(n)
    }
    function up() {
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (d) finish(d)
    }
    function cancel() { dragRef.current = null; setDrag(null) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [!!drag])

  function finish(d) {
    let s = Math.min(d.t0, d.t1), e = Math.max(d.t0, d.t1)
    if (e - s < SNAP) e = s + 2 * SNAP          // a click books an hour
    const lo = Math.min(d.r0, d.r1), hi = Math.max(d.r0, d.r1)
    const picked = rowsRef.current.slice(lo, hi + 1)
    const ids = [], skipped = []
    picked.forEach(row => {
      if (isLocked?.(row.key)) return
      if (busyIn(row, s, e)) skipped.push(eqName(row.eq))
      else ids.push(row.key)
    })
    onRangeBook({ ids, start: new Date(s), end: new Date(e), skipped })
  }

  const ghost = drag && (() => {
    const s = Math.min(drag.t0, drag.t1), e0 = Math.max(drag.t0, drag.t1)
    const e = e0 - s < SNAP ? s + 2 * SNAP : e0
    return { s, e, lo: Math.min(drag.r0, drag.r1), hi: Math.max(drag.r0, drag.r1) }
  })()

  const label = row => group === 'eq' ? (
    <div className="bkl-rlab">
      <div className="bkl-rlab-t">
        <div className="bkl-rlab-n" title={eqName(row.eq)}>{eqName(row.eq)}</div>
        <div className="bkl-rlab-s">
          {isLocked?.(row.key) ? 'Locked for you' : [eqNick(row.eq), row.items.length ? `${row.items.length} booking${row.items.length === 1 ? '' : 's'}` : (isDay ? 'free all day' : 'free all week')].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  ) : (
    <div className="bkl-rlab">
      <Avatar b={row.sample} size={28} />
      <div className="bkl-rlab-t">
        <div className="bkl-rlab-n">{row.name}</div>
        <div className="bkl-rlab-s">{row.items.length} booking{row.items.length === 1 ? '' : 's'}</div>
      </div>
    </div>
  )
  const mainText = b => group === 'eq' ? personName(b) : eqName(eqById[b.equipment_id])

  return (
    <div className="bkl">
      <div className="bkl-bar">
        <span className="bkl-bar-label">Rows</span>
        <div className="bkl-seg small">
          <button type="button" className={group === 'eq' ? 'on' : ''} onClick={() => pickGroup('eq')}>Equipment</button>
          <button type="button" className={group === 'people' ? 'on' : ''} onClick={() => pickGroup('people')}>People</button>
        </div>
        <span className="bkl-bar-tip">
          {isDay
            ? (group === 'eq'
              ? (canBook ? 'Drag along a row to book that instrument. Drag down across rows to book several at the same time.' : 'Select equipment on the left to book.')
              : 'Switch Rows to Equipment to book by dragging.')
            : 'Point at a booking for its details. To book, open a day: click + Book in a day, or choose Day above.'}
        </span>
      </div>

      {rowList.length === 0 ? (
        <div className="bkl-empty">
          {rows.length === 0 && group === 'eq'
            ? 'Select equipment on the left to see who has booked it.'
            : `No bookings ${isDay ? 'on this day' : 'this week'}.`}
        </div>
      ) : (
        <>
        {/* Column headings stay pinned under the page toolbar. They sit outside
            the sideways-scrolling box — a sticky element cannot stick past a
            scrolling ancestor — and follow its sideways scroll (syncHead). */}
        <div className="bkl-stick" ref={headRef}>
          {!isDay ? (
            <div className="bkl-week">
              <div className="bkl-week-row bkl-week-head">
                <div>{group === 'eq' ? 'Equipment' : 'Person'}</div>
                {Array.from({ length: 7 }, (_, d) => {
                  const day = addDays(from, d)
                  return <div key={d} className={sameDay(day, new Date()) ? 'today' : ''}>{fmtDay(day)}{sameDay(day, new Date()) ? ' · today' : ''}</div>
                })}
              </div>
            </div>
          ) : (
            <div className="bkl-day">
              <div className="bkl-day-row bkl-day-head">
                <div>{group === 'eq' ? 'Equipment' : 'Person'}</div>
                <div className="bkl-axis">
                  {Array.from({ length: h1 - h0 }, (_, i) => (
                    <div key={i} className="bkl-tick" style={{ left: `${pct(r0 + i * HOUR)}%` }}>{hourLabel(h0 + i)}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="bkl-scroll" onScroll={syncHead}>
          {!isDay ? (
            <div className="bkl-week">
              {rowList.map((row, ri) => {
                const locked = group === 'eq' && isLocked?.(row.key)
                const multi = row.items.filter(isMulti).map(b => ({
                  b,
                  sd: Math.max(0, Math.floor((midnight(b.start_time) - from) / DAY)),
                  ed: Math.min(6, Math.floor((midnight(new Date(new Date(b.end_time) - 1)) - from) / DAY)),
                })).sort((a, b) => a.sd - b.sd)
                const lanes = multi.length ? laneUp(multi, m => m.sd, m => m.ed + 1) : 0
                return (
                  <div key={row.key} ref={row.key === flashId ? flashRef : null}
                    className={`bkl-week-row ${ri % 2 ? 'odd' : ''} ${row.key === flashId ? 'bkl-flash' : ''}`}
                    style={{ gridTemplateRows: `${lanes ? `repeat(${lanes}, auto) ` : ''}auto` }}>
                    <div className="bkl-week-label" style={{ gridRow: '1 / -1' }}>{label(row)}</div>
                    {Array.from({ length: 7 }, (_, d) => {
                      const day = addDays(from, d)
                      return <div key={`bg${d}`} className={`bkl-week-bg ${d === 0 || d === 6 ? 'we' : ''} ${sameDay(day, new Date()) ? 'today' : ''}`} style={{ gridRow: '1 / -1', gridColumn: d + 2 }} />
                    })}
                    {locked && <div className="bkl-locked" style={{ gridRow: 1, gridColumn: '2 / -1' }}>Locked for you — training or approval needed first</div>}
                    {multi.map(m => (
                      <button key={m.b.id} type="button" data-bk className="bkl-span" style={{ ...shape(m.b), gridRow: m.lane + 1, gridColumn: `${m.sd + 2} / ${m.ed + 3}` }}
                        onClick={() => onBookingClick(m.b)} {...bind(m.b)}>
                        {group === 'eq' && <Avatar b={m.b} />}
                        <span className="bkl-ell"><b>{mainText(m.b)}</b> · {whenText(m.b)}{m.b.title ? ` · ${m.b.title}` : ''}</span>
                      </button>
                    ))}
                    {!locked && Array.from({ length: 7 }, (_, d) => {
                      const day = addDays(from, d)
                      const items = row.items.filter(b => !isMulti(b) && sameDay(b.start_time, day))
                        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
                      return (
                        <div key={`c${d}`} className="bkl-cell" style={{ gridRow: lanes + 1, gridColumn: d + 2 }}>
                          {items.map(b => (
                            <button key={b.id} type="button" data-bk className="bkl-card" style={shape(b)}
                              onClick={() => onBookingClick(b)} {...bind(b)}>
                              {group === 'eq' && <Avatar b={b} />}
                              <span className="bkl-card-t">
                                <span className="bkl-card-n">{mainText(b)}</span>
                                <small className="bkl-mono">{fmtT(b.start_time)} – {fmtT(b.end_time)}</small>
                                {b.title && <small className="bkl-ell">{b.title}</small>}
                              </span>
                            </button>
                          ))}
                          {group === 'eq' && canBook && (
                            <button type="button" className="bkl-add" onClick={() => onOpenDay(day, row.key)}>+ Book</button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bkl-day">
              {rowList.map((row, ri) => {
                const locked = group === 'eq' && isLocked?.(row.key)
                const items = row.items.map(b => ({ b, vs: Math.max(+new Date(b.start_time), r0), ve: Math.min(+new Date(b.end_time), r1) }))
                  .filter(it => it.ve > it.vs).sort((a, b) => a.vs - b.vs)
                const lanes = laneUp(items, it => it.vs, it => it.ve)
                const g = ghost && ri >= ghost.lo && ri <= ghost.hi ? ghost : null
                const gBusy = g && busyIn(row, g.s, g.e)
                const now = Date.now()
                return (
                  <div key={row.key} ref={row.key === flashId ? flashRef : null}
                    className={`bkl-day-row ${ri % 2 ? 'odd' : ''} ${row.key === flashId ? 'bkl-flash' : ''}`}>
                    <div className="bkl-week-label">{label(row)}</div>
                    <div ref={el => { trackRefs.current[ri] = el }}
                      className={`bkl-track ${canDrag && !locked ? 'can' : ''} ${locked ? 'locked' : ''}`}
                      style={{ height: lanes * 44 + 8 }} onPointerDown={e => onTrackDown(e, ri)}>
                      {Array.from({ length: h1 - h0 }, (_, i) => (
                        <div key={i} className="bkl-gl" style={{ left: `${pct(r0 + i * HOUR)}%` }} />
                      ))}
                      {now > r0 && now < r1 && <div className="bkl-now" style={{ left: `${pct(now)}%` }} />}
                      {items.map(it => (
                        <button key={it.b.id} type="button" data-bk className="bkl-bar-bk"
                          style={{ ...shape(it.b), left: `${pct(it.vs)}%`, width: `${pct(it.ve) - pct(it.vs)}%`, top: 4 + it.lane * 44 }}
                          onClick={() => onBookingClick(it.b)} {...bind(it.b)}>
                          {group === 'eq' && <Avatar b={it.b} />}
                          <span className="bkl-card-t">
                            <span className="bkl-card-n">{mainText(it.b)}</span>
                            <small className="bkl-ell">{fmtT(it.b.start_time)} – {fmtT(it.b.end_time)}{it.b.title ? ` · ${it.b.title}` : ''}</small>
                          </span>
                        </button>
                      ))}
                      {g && (
                        <div className={`bkl-ghost ${locked ? 'lock' : gBusy ? 'busy' : ''}`}
                          style={{ left: `${pct(g.s)}%`, width: `${pct(g.e) - pct(g.s)}%` }}>
                          {locked ? 'locked' : gBusy ? 'taken' : ri === g.lo ? `${fmtT(g.s)} – ${fmtT(g.e)}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        </>
      )}

      {group === 'eq' && idleCount > 0 && (
        <div className="bkl-foot">
          <span><b>{idleCount}</b> of the {rows.length} selected instruments have no bookings {isDay ? 'on this day' : 'this week'}, so they are folded away.</span>
          <button type="button" className="bkl-link" onClick={() => setShowIdle(true)}>Show them</button>
        </div>
      )}
      {group === 'eq' && showIdle && rows.length > 12 && (
        <div className="bkl-foot"><button type="button" className="bkl-link" onClick={() => setShowIdle(false)}>Hide instruments with no bookings</button></div>
      )}
      <HoverCard hover={hover} eqById={eqById} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// AGENDA — every booking of the week in time order, one line each
// ══════════════════════════════════════════════════════════════
export function AgendaView({ weekStart, bookings, eqById, onBookingClick, onBookDay, canBook }) {
  const [q, setQ] = useState('')
  const [onlyPending, setOnlyPending] = useState(false)
  const from = midnight(weekStart)
  const query = q.trim().toLowerCase()
  const match = b => (!onlyPending || b.status === 'pending') && (!query || [
    eqName(eqById[b.equipment_id]), eqById[b.equipment_id]?.nickname, personName(b), b.user_name, b.title, b.notes,
  ].filter(Boolean).join(' ').toLowerCase().includes(query))

  return (
    <div className="bkl">
      <div className="bkl-bar">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search person, instrument or purpose"
          aria-label="Search bookings" className="bkl-search" />
        <div className="bkl-seg small">
          <button type="button" className={!onlyPending ? 'on' : ''} onClick={() => setOnlyPending(false)}>All</button>
          <button type="button" className={onlyPending ? 'on' : ''} onClick={() => setOnlyPending(true)}>Pending only</button>
        </div>
      </div>
      {Array.from({ length: 7 }, (_, d) => {
        const day = addDays(from, d), next = addDays(day, 1)
        const starts = bookings.filter(b => sameDay(b.start_time, day) && match(b))
          .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
        const conts = bookings.filter(b => new Date(b.start_time) < day && new Date(b.end_time) > day && match(b))
        const today = sameDay(day, new Date())
        return (
          <div key={d}>
            <div className={`bkl-ag-day ${today ? 'today' : ''}`}>
              <span>{fmtDay(day)}{today ? ' · Today' : ''}
                <small>{starts.length} booking{starts.length === 1 ? '' : 's'}{conts.length ? ` · ${conts.length} continuing` : ''}</small>
              </span>
              {canBook && next > new Date() && <button type="button" className="bkl-link" onClick={() => onBookDay(day)}>+ Book this day</button>}
            </div>
            {!starts.length && !conts.length && <div className="bkl-ag-none">No bookings</div>}
            {[...conts.map(b => ({ b, cont: true })), ...starts.map(b => ({ b, cont: false }))].map(({ b, cont }, i) => {
              const e = eqById[b.equipment_id], s = statusOf(b)
              const end = new Date(b.end_time)
              return (
                <button key={`${b.id}-${cont}`} type="button" className={`bkl-ag-row ${i % 2 ? 'odd' : ''} ${cont ? 'cont' : ''}`} onClick={() => onBookingClick(b)}>
                  <span className="bkl-mono bkl-ag-time">
                    {cont ? `continues → ${end < next ? fmtT(end) : 'all day'}`
                      : `${fmtT(b.start_time)} – ${isMulti(b) ? `${fmtDay(end)} ${fmtT(end)}` : fmtT(end)}`}
                  </span>
                  <span className="bkl-ag-eq"><b>{eqName(e)}</b>{eqNick(e) && <small>{eqNick(e)}</small>}</span>
                  <span className="bkl-ag-who"><Avatar b={b} /><span className="bkl-ell">{personName(b)}{b.booked_on_behalf_of ? <small> · booked by {b.user_name}</small> : null}</span></span>
                  <span className="bkl-ell bkl-ag-purpose">{b.title || '—'}</span>
                  <span><span className="bkl-chip" style={{ background: s.bg, color: s.fg, borderColor: s.bd }}>{s.label}</span></span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// CALENDAR — the week grid, but readable: bookings that overlap become one
// block listing each person and instrument, and multi-day bookings sit in a
// band at the top instead of filling whole day columns. Drag in a day to book.
// ══════════════════════════════════════════════════════════════
const PX = 44   // pixels per hour

export function GroupedWeekView({ weekStart, bookings, eqById, canBook, onBookingClick, onSlot }) {
  const [hover, bind, clearHover] = useBookingHover()
  const [headRef, syncHead] = useHeadSync()
  const [open, setOpen] = useState(null)
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)
  const colRefs = useRef([])
  const from = midnight(weekStart)
  const days = Array.from({ length: 7 }, (_, d) => addDays(from, d))
  const single = bookings.filter(b => !isMulti(b))
  const multi = bookings.filter(isMulti)

  let H0 = 7, H1 = 19
  days.forEach(d => { const [a, b] = hourRange(single.filter(x => sameDay(x.start_time, d)), d); H0 = Math.min(H0, a); H1 = Math.max(H1, b) })
  const height = (H1 - H0) * PX

  const band = multi.map(b => ({ b, vs: Math.max(+new Date(b.start_time), +from), ve: Math.min(+new Date(b.end_time), +addDays(from, 7)) }))
    .filter(it => it.ve > it.vs).sort((a, b) => a.vs - b.vs)
  const bandLanes = band.length ? laneUp(band, it => it.vs, it => it.ve) : 0
  const wpct = t => ((t - from) / (7 * DAY)) * 100

  function clusters(list) {
    const out = []
    list.sort((a, b) => new Date(a.start_time) - new Date(b.start_time)).forEach(b => {
      const last = out[out.length - 1], s = +new Date(b.start_time), e = +new Date(b.end_time)
      if (last && s < last.e) { last.items.push(b); last.e = Math.max(last.e, e) }
      else out.push({ s, e, items: [b] })
    })
    return out
  }

  const slotAt = (y, di) => {
    const r = colRefs.current[di].getBoundingClientRect()
    return Math.max(0, Math.min((H1 - H0) * 2 - 1, Math.floor((y - r.top) / (PX / 2))))
  }
  function onColDown(e, di) {
    if (!canBook || e.button > 0 || e.target.closest('[data-bk]')) return
    const s = slotAt(e.clientY, di)
    const d = { di, a: s, b: s }
    dragRef.current = d; setDrag(d); clearHover()
    e.preventDefault()
  }
  useEffect(() => {
    if (!drag) return
    function move(e) {
      const d = dragRef.current
      if (!d) return
      const n = { ...d, b: slotAt(e.clientY, d.di) }
      dragRef.current = n; setDrag(n)
    }
    function up() {
      const d = dragRef.current
      dragRef.current = null; setDrag(null)
      if (!d) return
      const lo = Math.min(d.a, d.b), hi = Math.max(d.a, d.b)
      const start = new Date(+days[d.di] + H0 * HOUR + lo * SNAP)
      const end = new Date(+days[d.di] + H0 * HOUR + (hi + 1) * SNAP)
      onSlot({ start, end })
    }
    function cancel() { dragRef.current = null; setDrag(null) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [!!drag])

  return (
    <div className="bkl">
      <div className="bkl-bar">
        <span className="bkl-bar-tip">
          {canBook ? 'Drag down in a day to book. ' : 'Select equipment on the left to book. '}
          Bookings at the same time are grouped — click "+ more" to see everyone. Point at a name for its details.
        </span>
      </div>
      {/* Day headings pinned under the page toolbar (see TimelineView) */}
      <div className="bkl-stick" ref={headRef}>
        <div className="bkl-cal">
          <div className="bkl-cal-grid bkl-cal-head">
            <div />
            {days.map((d, i) => (
              <div key={i} className={sameDay(d, new Date()) ? 'today' : ''}>
                {d.toLocaleDateString('en-US', { weekday: 'short' })}<b>{d.getDate()}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="bkl-scroll" onScroll={syncHead}>
        <div className="bkl-cal">
          <div className="bkl-cal-grid bkl-cal-band">
            <div className="bkl-cal-band-l">Multi-day</div>
            <div className="bkl-cal-band-area" style={{ height: Math.max(1, bandLanes) * 32 + 4 }}>
              {band.map(it => (
                <button key={it.b.id} type="button" data-bk className="bkl-span abs"
                  style={{ ...shape(it.b), left: `${wpct(it.vs)}%`, width: `${wpct(it.ve) - wpct(it.vs)}%`, top: 4 + it.lane * 32 }}
                  onClick={() => onBookingClick(it.b)} {...bind(it.b)}>
                  <Avatar b={it.b} />
                  <span className="bkl-ell"><b>{personName(it.b)}</b> · {eqName(eqById[it.b.equipment_id])} · {whenText(it.b)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="bkl-cal-grid">
            <div className="bkl-cal-hours" style={{ height }}>
              {Array.from({ length: H1 - H0 - 1 }, (_, i) => (
                <div key={i} style={{ top: (i + 1) * PX }}>{hourLabel(H0 + i + 1)}</div>
              ))}
            </div>
            {days.map((day, di) => {
              const cl = clusters(single.filter(b => sameDay(b.start_time, day)))
              const g = drag && drag.di === di ? { lo: Math.min(drag.a, drag.b), hi: Math.max(drag.a, drag.b) } : null
              return (
                <div key={di} ref={el => { colRefs.current[di] = el }}
                  className={`bkl-cal-col ${sameDay(day, new Date()) ? 'today' : ''} ${canBook ? 'can' : ''}`}
                  style={{ height }} onPointerDown={e => onColDown(e, di)}>
                  {Array.from({ length: H1 - H0 - 1 }, (_, i) => <div key={i} className="bkl-cal-line" style={{ top: (i + 1) * PX }} />)}
                  {cl.map((c, ci) => {
                    const top = ((c.s - day) / HOUR - H0) * PX
                    const ht = Math.max(((c.e - c.s) / HOUR) * PX - 2, 44)
                    const key = `${di}-${ci}`, isOpen = open === key
                    if (c.items.length === 1) {
                      const b = c.items[0]
                      return (
                        <button key={key} type="button" data-bk className="bkl-cl" style={{ ...shape(b), top, height: ht }}
                          onClick={() => onBookingClick(b)} {...bind(b)}>
                          <span className="bkl-cl-ln"><Avatar b={b} size={18} /><b className="bkl-ell">{personName(b)}</b></span>
                          <span className="bkl-cl-ln bkl-ell">{eqName(eqById[b.equipment_id])}</span>
                          <span className="bkl-cl-ln bkl-mono">{fmtT(b.start_time)}–{fmtT(b.end_time)}</span>
                        </button>
                      )
                    }
                    const fit = Math.max(1, Math.floor((ht - 28) / 22))
                    const shown = isOpen ? c.items : c.items.slice(0, fit)
                    const rest = c.items.length - shown.length
                    return (
                      <div key={key} data-bk className={`bkl-cl group ${isOpen ? 'open' : ''}`} style={{ top, height: isOpen ? 'auto' : ht }}>
                        <div className="bkl-cl-hd"><span>{c.items.length} bookings</span><span className="bkl-mono">{fmtT(c.s)}</span></div>
                        {shown.map(b => (
                          <button key={b.id} type="button" className="bkl-cl-ln item" style={{ color: statusOf(b).fg }}
                            onClick={() => onBookingClick(b)} {...bind(b)}>
                            <Avatar b={b} size={18} />
                            <span className="bkl-ell"><b>{personName(b).split(' ')[0]}</b> · {eqById[b.equipment_id]?.nickname || eqName(eqById[b.equipment_id])}{isOpen ? ` · ${fmtT(b.start_time)}–${fmtT(b.end_time)}` : ''}</span>
                          </button>
                        ))}
                        {rest > 0 && <button type="button" className="bkl-more" onClick={() => setOpen(key)}>+{rest} more</button>}
                        {isOpen && <button type="button" className="bkl-more" onClick={() => setOpen(null)}>Show less</button>}
                      </div>
                    )
                  })}
                  {g && <div className="bkl-ghost col" style={{ top: g.lo * (PX / 2), height: (g.hi - g.lo + 1) * (PX / 2) }}>
                    {fmtT(new Date(+day + H0 * HOUR + g.lo * SNAP))} – {fmtT(new Date(+day + H0 * HOUR + (g.hi + 1) * SNAP))}
                  </div>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <HoverCard hover={hover} eqById={eqById} />
    </div>
  )
}
