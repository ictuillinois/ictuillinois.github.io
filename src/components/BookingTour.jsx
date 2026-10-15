import { useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'

// First-visit tour of Booking Equipment (Oct 2026).
//
// Seven steps, each pointing at the real part of the screen through a
// [data-tour="…"] attribute. A step whose part is not on screen right now
// (no untrained equipment, say) points at its fallback, and failing that the
// card sits in the middle — the text still makes sense without the arrow.
//
// When it shows (BookingEquipment decides): a lab user's first visits, until
// they skip it, finish it, or have a booking that is already in the past.
// The "?" help panel on the page replays it for anyone.

export function bookingTourSteps(supportName) {
  return [
    { target: 'untrained', fallback: 'eqlist', kicker: 'Step 1 · Training', title: 'No training, no booking',
      body: 'Equipment marked TRAINING REQUIRED is greyed out: you cannot select or book it until your training for it is approved. Request training from Training Records → Equipment.' },
    { target: 'retrain', fallback: 'eqlist', kicker: 'Step 2 · Retraining', title: 'Unused for 3 months? Retrain first',
      body: 'If you have not used an instrument for 3 months, it is greyed out again with a RETRAIN mark. Pass the retraining (Training Records → Equipment) and it becomes available.' },
    { target: 'eqlist', kicker: 'Step 3 · Several instruments', title: 'Need more than one at a time?',
      body: 'Tick each instrument here. Then choose "Same time for all" to book them together with one drag on the calendar, or "One by one" to give each its own time.' },
    { target: 'calendar', kicker: 'Step 4 · Purpose', title: 'Say what the booking is for',
      body: 'Drag on the calendar to pick the day and time. You are then asked for the purpose: Project, Thesis or Other. You are responsible for the booking and for the purpose you select.' },
    { target: 'calendar', kicker: 'Step 5 · Your calendar', title: 'Add it to your calendar',
      body: 'Once booked, add it to Google Calendar or Outlook, or download an .ics file, so you get your own reminder.' },
    { target: 'book', fallback: 'calendar', kicker: 'Step 6 · Only for you', title: 'Book only for yourself',
      body: `Bookings are in your name. Booking equipment for someone else is not allowed — each person books for themselves. Ask ${supportName} if you need help.` },
    { target: 'calendar', kicker: 'Step 7 · Plans change', title: 'Cancel what you will not use',
      body: 'If your plan changes, open your booking and cancel it before it starts, so someone else can use the equipment. A finished booking cannot be changed.' },
  ]
}

function findTarget(step) {
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
    if (top + 230 > window.innerHeight - 12) top = Math.max(12, box.top - 230 - 12)
    cardStyle = { left, top }
  } else {
    cardStyle = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Booking Equipment tour" style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
      {box
        ? <div aria-hidden="true" style={{ position: 'fixed', ...box, borderRadius: 10, boxShadow: '0 0 0 9999px rgba(5,15,40,0.55)', outline: '2px solid #fff', pointerEvents: 'none', transition: 'all .25s ease' }} />
        : <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(5,15,40,0.55)' }} />}
      <div style={{ position: 'fixed', ...cardStyle, width: W, background: '#fff', color: '#1a1916', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,.25)', padding: 16, display: 'grid', gap: 10, fontFamily: 'var(--sans)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: '.06em', textTransform: 'uppercase' }}>{step.kicker}</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{step.title}</div>
        <div style={{ fontSize: 13.5, color: '#66645e', lineHeight: 1.6 }}>{step.body}</div>
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
