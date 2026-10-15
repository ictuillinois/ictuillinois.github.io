import { useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'

// First-visit tour of Booking Equipment (Oct 2026).
//
// Seven steps, each pointing at the real part of the screen through a
// [data-tour="…"] attribute. A step whose part is not on screen right now
// (no untrained equipment, say) points at its fallback, and failing that the
// card sits in the middle — the text still makes sense without the arrow.
//
// A step can carry a `preview`: a small picture of the part it talks about,
// drawn inside the card when that part is not on screen (the "Same time for
// all" choice only exists once two instruments are ticked; the purpose and
// calendar buttons only inside a booking). Pointing at the same list or
// calendar for several steps taught nothing — the picture shows the thing.
// `point: false` keeps the card centred: nothing on screen is the subject.
//
// When it shows (BookingEquipment decides): a lab user's first visits, until
// they skip it, finish it, or have a booking that is already in the past.
// The "?" help panel on the page replays it for anyone.

export function bookingTourSteps(supportName) {
  return [
    { target: 'untrained', fallback: 'eqlist', preview: 'untrained', kicker: 'Step 1 · Training', title: 'No training, no booking',
      body: 'Equipment marked TRAINING REQUIRED is greyed out: you cannot select or book it until your training for it is approved. Request training from Training Records → Equipment.' },
    { target: 'retrain', fallback: 'eqlist', preview: 'retrain', kicker: 'Step 2 · Retraining', title: 'Unused for 3 months? Retrain first',
      body: 'If you have not used an instrument for 3 months, it is greyed out again with a RETRAIN mark. Pass the retraining (Training Records → Equipment) and it becomes available.' },
    { target: 'multi', fallback: 'eqlist', preview: 'multi', kicker: 'Step 3 · Several instruments', title: 'Need more than one at a time?',
      body: 'Tick each instrument here. Then choose "Same time for all" to book them together with one drag on the calendar, or "One by one" to give each its own time.' },
    { target: 'calendar', demo: 'drag', preview: 'purpose', previewAlways: true, kicker: 'Step 4 · Purpose', title: 'Say what the booking is for',
      body: 'Drag down on the calendar to pick the day and time — like this 2.5-hour booking, 9:00 to 11:30. You are then asked for the purpose: Project, Thesis or Other. You are responsible for the booking and for the purpose you select.' },
    { point: false, preview: 'addcal', previewAlways: true, kicker: 'Step 5 · Your calendar', title: 'Add it to your calendar',
      body: 'Once booked, add it to Google Calendar or Outlook, or download an .ics file, so you get your own reminder.' },
    { target: 'book', fallback: 'calendar', kicker: 'Step 6 · Only for you', title: 'Book only for yourself',
      body: `Bookings are in your name. Booking equipment for someone else is not allowed — each person books for themselves. Ask ${supportName} if you need help.` },
    { point: false, preview: 'cancel', previewAlways: true, kicker: 'Step 7 · Plans change', title: 'Cancel what you will not use',
      body: 'If your plan changes, open your booking and cancel it before it starts, so someone else can use the equipment. A finished booking cannot be changed.' },
  ]
}

// Small pictures of the parts a step talks about — drawn like the real
// controls, but inert.
const pv = {
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#efeee9', borderRadius: 8, fontSize: 12 },
  box: { width: 13, height: 13, borderRadius: 3, border: '2px solid #dcdad2', flexShrink: 0 },
  tag: { fontSize: 9, background: '#e8e7e3', color: '#6b7280', borderRadius: 3, padding: '1px 4px', fontWeight: 600 },
  pill: on => ({ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${on ? '#534AB7' : '#C5C2F5'}`, background: on ? '#fff' : 'transparent', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#534AB7' }),
  btn: { border: '1px solid #dcdad2', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#1a1916' },
}
function Preview({ kind }) {
  const wrap = { border: '1px dashed #dcdad2', borderRadius: 10, padding: 8, background: '#fafaf8', display: 'grid', gap: 6 }
  if (kind === 'untrained' || kind === 'retrain') return (
    <div style={wrap} aria-hidden="true">
      <div style={pv.row}><span style={pv.box} /><span style={{ color: '#9a978f' }}>DSR Rheometer</span><span style={pv.tag}>{kind === 'retrain' ? 'RETRAIN' : 'TRAINING REQUIRED'}</span></div>
    </div>
  )
  if (kind === 'multi') return (
    <div style={{ ...wrap, background: '#EEEDFE', borderColor: '#C5C2F5' }} aria-hidden="true">
      <div style={{ fontSize: 12, fontWeight: 700, color: '#534AB7' }}>📅 2 equipment selected — how do you want to book them?</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={pv.pill(true)}>◉ Same time for all</span>
        <span style={pv.pill(false)}>○ One by one, each its own time</span>
      </div>
    </div>
  )
  if (kind === 'purpose') return (
    <div style={wrap} aria-hidden="true">
      <div style={{ fontSize: 11, fontWeight: 600, color: '#66645e' }}>Purpose of use *</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {['🧪 Project', '📚 Thesis', '📝 Other'].map((l, k) => (
          <span key={l} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700, borderRadius: 8, padding: '6px 4px', border: k === 0 ? '2px solid var(--accent)' : '1.5px solid #dcdad2', background: k === 0 ? 'var(--accent-light)' : '#fff' }}>{l}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, fontSize: 11, color: '#66645e', lineHeight: 1.4 }}><span>☑</span><span>I am responsible for this booking and confirm it is for the purpose selected.</span></div>
    </div>
  )
  if (kind === 'addcal') return (
    <div style={wrap} aria-hidden="true">
      <div style={{ fontSize: 11, color: '#66645e' }}>Booked ✓ — add it to your calendar:</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span style={pv.btn}>Google Calendar</span><span style={pv.btn}>Outlook</span><span style={pv.btn}>Download .ics</span></div>
    </div>
  )
  if (kind === 'cancel') return (
    <div style={wrap} aria-hidden="true">
      <div style={{ fontSize: 12, fontWeight: 600 }}>My booking · Fri 10:00–12:00</div>
      <div style={{ display: 'flex', gap: 6 }}><span style={pv.btn}>✏️ Edit</span><span style={{ ...pv.btn, color: '#c84b2f' }}>🗑 Cancel booking</span></div>
    </div>
  )
  return null
}

function findTarget(step) {
  if (step.point === false) return null
  const q = name => name && document.querySelector(`[data-tour="${name}"]`)
  const el = q(step.target) || q(step.fallback)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width && r.height ? { el, r } : null
}

export default function BookingTour({ supportName = 'your lab manager', onClose, onShown }) {
  // Memoized: a new steps array on every render made `step` a new object,
  // so measure() and the layout effect re-ran on every render, and each run
  // set state — React's "Maximum update depth exceeded".
  const steps = useMemo(() => bookingTourSteps(supportName), [supportName])
  const [i, setI] = useState(0)
  const [box, setBox] = useState(null)        // spotlight rect in viewport px, or null (centred card)
  const [ghost, setGhost] = useState(null)    // step 4's demo drag, in viewport px
  const narrow = typeof window !== 'undefined' && window.innerWidth < 768
  const step = steps[i]

  const measure = useCallback(() => {
    if (narrow) { setBox(null); return }
    const t = findTarget(step)
    if (!t) { setBox(null); return }   // null → null does not re-render
    const pad = 6
    const next = { left: t.r.left - pad, top: t.r.top - pad, width: t.r.width + pad * 2, height: t.r.height + pad * 2 }
    // Only when it moved: setting an equal-but-new object still re-renders.
    setBox(prev => prev && ['left', 'top', 'width', 'height'].every(k => Math.abs(prev[k] - next[k]) < 0.5) ? prev : next)
  }, [step, narrow])

  // Bring the step's part into view, then measure where it landed.
  useLayoutEffect(() => {
    const t = !narrow && findTarget(step)
    if (t) {
      const r = t.r
      if (r.top < 60 || r.bottom > window.innerHeight - 20) t.el.scrollIntoView({ block: 'center', behavior: 'instant' })
    }
    measure()
  }, [i, measure, narrow])

  // Step 4: draw a booking being dragged out — 9:00 to 11:30 on the first day
  // still open — on the real calendar, scrolled so it is in view.
  useEffect(() => {
    if (step.demo !== 'drag' || narrow) { setGhost(null); return }
    const scroller = document.querySelector('.booking-week-scroll')
    const col = document.querySelector('[data-tour-day="open"]')
    if (!scroller || !col) { setGhost(null); return }
    const hour = Number(scroller.dataset.hourPx) || 48
    scroller.scrollTop = Math.max(0, 9 * hour - hour / 2)
    const place = () => {
      const r = col.getBoundingClientRect()
      setGhost(g => {
        const next = { left: r.left + 3, top: r.top + 9 * hour, width: r.width - 6, height: 2.5 * hour }
        return g && Math.abs(g.left - next.left) < 0.5 && Math.abs(g.top - next.top) < 0.5 && Math.abs(g.width - next.width) < 0.5 ? g : next
      })
    }
    const raf = requestAnimationFrame(place)
    scroller.addEventListener('scroll', place)
    window.addEventListener('resize', place)
    return () => { cancelAnimationFrame(raf); scroller.removeEventListener('scroll', place); window.removeEventListener('resize', place) }
  }, [i, narrow])

  // After the first successful draw (an effect does not run if rendering
  // threw), so "seen" is never recorded for a tour nobody saw.
  useEffect(() => { onShown?.() }, [])

  useEffect(() => {
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    const onKey = e => { if (e.key === 'Escape') onClose('skipped') }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); window.removeEventListener('keydown', onKey) }
  }, [measure, onClose])

  const last = i === steps.length - 1
  const W = Math.min(340, window.innerWidth - 24)
  let cardStyle
  if (box) {
    let left = box.left + box.width + 14
    let top = box.top
    if (left + W > window.innerWidth - 12) { left = Math.max(12, Math.min(box.left, window.innerWidth - W - 12)); top = box.top + box.height + 12 }
    const H = step.preview ? 330 : 230
    if (top + H > window.innerHeight - 12) top = Math.max(12, box.top - H - 12)
    cardStyle = { left, top }
  } else {
    cardStyle = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  }
  // Step 4: keep the card beside the demo drag, never on top of it.
  if (ghost) {
    let left = ghost.left + ghost.width + 16
    if (left + W > window.innerWidth - 12) left = ghost.left - W - 16
    if (left < 12) left = Math.max(12, window.innerWidth - W - 12)
    const top = Math.min(Math.max(12, ghost.top - 60), window.innerHeight - 420)
    cardStyle = { left, top: Math.max(12, top) }
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Booking Equipment tour" style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
      {box
        ? <div aria-hidden="true" style={{ position: 'fixed', ...box, borderRadius: 10, boxShadow: '0 0 0 9999px rgba(5,15,40,0.55)', outline: '2px solid #fff', pointerEvents: 'none', transition: 'all .25s ease' }} />
        : <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(5,15,40,0.55)' }} />}
      {ghost && (
        <div aria-hidden="true" style={{ position: 'fixed', left: ghost.left, top: ghost.top, width: ghost.width, height: ghost.height, pointerEvents: 'none' }}>
          <style>{`
            @keyframes tour-drag { 0% { height: 0 } 55%, 85% { height: 100% } 100% { height: 100% ; opacity: 0 } }
            @media (prefers-reduced-motion: reduce) { .tour-drag { animation: none !important; height: 100% !important } }
          `}</style>
          <div className="tour-drag" style={{ position: 'relative', height: '100%', overflow: 'visible', animation: 'tour-drag 2.6s ease-in-out infinite',
            background: 'repeating-linear-gradient(45deg, #EEEDFE 0 6px, #fff 6px 12px)', border: '1.5px dashed #534AB7', borderRadius: 6 }}>
            <div style={{ position: 'absolute', left: 6, top: 4, fontSize: 11, fontWeight: 700, color: '#534AB7', whiteSpace: 'nowrap' }}>9:00 – 11:30 · 2.5 h</div>
            <div style={{ position: 'absolute', left: '50%', bottom: -14, transform: 'translateX(-50%)', fontSize: 18, lineHeight: 1 }}>👆</div>
          </div>
        </div>
      )}
      <div style={{ position: 'fixed', ...cardStyle, width: W, background: '#fff', color: '#1a1916', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,.25)', padding: 16, display: 'grid', gap: 10, fontFamily: 'var(--sans)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: '.06em', textTransform: 'uppercase' }}>{step.kicker}</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{step.title}</div>
        <div style={{ fontSize: 13.5, color: '#66645e', lineHeight: 1.6 }}>{step.body}</div>
        {step.preview && (step.previewAlways || !document.querySelector(`[data-tour="${step.target}"]`)) && <Preview kind={step.preview} />}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, marginRight: 'auto' }} aria-hidden="true">
            {steps.map((_, k) => <span key={k} style={{ width: k === i ? 18 : 7, height: 7, borderRadius: 99, background: k === i ? 'var(--accent)' : '#dcdad2' }} />)}
          </div>
          <button type="button" onClick={() => onClose('skipped')} style={{ border: 0, background: 'none', color: '#9a978f', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Skip tour</button>
          <button type="button" className="btn btn-sm" onClick={() => setI(k => k - 1)} disabled={i === 0}>← Back</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => last ? onClose('finished') : setI(k => k + 1)} autoFocus>
            {last ? 'Got it ✓' : 'Next →'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
