import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { sb } from '../lib/supabase'

const FEEDBACK_SCREENS = {
  dashboard:     'Home Page',
  equipment:     'Equipment Inventory',
  equipmenthub:  'Equipment Hub',
  booking:       'Equipment Booking',
  training:      'Training Records',
  pm:            'Task Board',
  barcode:       'Material Scanner',
  barcodeqr:     'QR Labels',
  remessages:    'Messages',
  home:          'Inspection',
  history:       'Inspection History',
  projects:      'Projects',
  labmanagement: 'Lab Management',
}

const ACCENT = '#f59e0b'
const ACCENT_DARK = '#d97706'

export default function FeedbackWidget({ bottomOffset = 24 }) {
  const { session, screen, activeModules } = useAppStore()

  // Only ask about modules the user actually has access to.
  // dashboard is always included (everyone has the home page).
  // activeModules null = all modules visible.
  const userModuleKeys = Object.keys(FEEDBACK_SCREENS).filter(k =>
    k === 'dashboard' || activeModules === null || activeModules.includes(k)
  )
  const [active, setActive] = useState(false)
  const [responses, setResponses] = useState({})
  const [comment, setComment] = useState('')
  const [minimized, setMinimized] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // guard: user typed on prev screen but navigated away before submitting
  const [pendingFrom, setPendingFrom] = useState(null)
  const prevScreenRef = useRef(null)
  const autoTimer = useRef(null)
  const textareaRef = useRef(null)

  const isEligible = session?.loginMode === 'team' && !!session?.organizationId && !!session?.userId

  useEffect(() => {
    if (!isEligible) return
    loadAll()
  }, [isEligible])

  async function loadAll() {
    const [{ data: org }, { data: resps }] = await Promise.all([
      sb.from('organizations').select('is_feedback_org').eq('id', session.organizationId).maybeSingle(),
      sb.from('feedback_responses')
        .select('module_key, comment')
        .eq('organization_id', session.organizationId)
        .eq('user_id', session.userId),
    ])
    if (!org?.is_feedback_org) return
    setActive(true)
    const map = {}
    ;(resps || []).forEach(r => { map[r.module_key] = r.comment || '' })
    setResponses(map)
  }

  // Screen-change logic
  useEffect(() => {
    if (!active) return
    const prev = prevScreenRef.current
    if (prev === screen) return

    if (autoTimer.current) clearTimeout(autoTimer.current)

    // If user had typed but didn't submit on the previous screen, save it as pending
    if (prev && userModuleKeys.includes(prev) && comment.trim() && !(prev in responses)) {
      setPendingFrom({ key: prev, name: FEEDBACK_SCREENS[prev], text: comment.trim() })
    }

    setComment('')
    setSaved(false)
    setMinimized(true)
    prevScreenRef.current = screen

    // Auto-expand after 25s on unreviewed module screens
    if (userModuleKeys.includes(screen) && !(screen in responses)) {
      autoTimer.current = setTimeout(() => setMinimized(false), 25000)
    }

    return () => { if (autoTimer.current) clearTimeout(autoTimer.current) }
  }, [screen, active])

  async function submit(key, text) {
    if (!text.trim()) return
    const isNew = !(key in responses)
    setSaving(true)
    const { error } = await sb.from('feedback_responses').upsert({
      organization_id: session.organizationId,
      user_id: session.userId,
      module_key: key,
      comment: text.trim(),
    }, { onConflict: 'organization_id,user_id,module_key' })
    setSaving(false)
    if (error) return
    if (isNew) {
      sb.from('admin_notifications').insert({
        type: 'feedback_response',
        title: `Feedback: ${FEEDBACK_SCREENS[key]}`,
        body: `${session.username}: ${text.trim()}`,
        read: false,
      })
    }
    setResponses(r => ({ ...r, [key]: text.trim() }))
    if (key === screen) { setComment(''); setSaved(true); setTimeout(() => { setSaved(false); setMinimized(true) }, 1800) }
    if (pendingFrom?.key === key) setPendingFrom(null)
  }

  function skip() { setComment(''); setMinimized(true); setPendingFrom(null); setSaved(false) }

  if (!active) return null

  const reviewed   = userModuleKeys.filter(k => k in responses).length
  const total      = userModuleKeys.length
  const onModule   = userModuleKeys.includes(screen)
  const alreadyDone = responses.hasOwnProperty(screen)
  const widgetBottom = bottomOffset + 64 + 10

  // Decide widget state
  const hasPending  = !!pendingFrom
  const showCurrent = onModule && !hasPending
  const moduleName  = FEEDBACK_SCREENS[screen] || ''

  // ── Minimized pill ──────────────────────────────────────────
  if (minimized) {
    const hasNew = onModule && !alreadyDone
    return (
      <div
        onClick={() => setMinimized(false)}
        title={hasPending ? `Submit feedback for ${pendingFrom.name}` : hasNew ? `Give feedback on ${moduleName}` : `Feedback — ${reviewed}/${total} done`}
        style={{
          position: 'fixed', bottom: widgetBottom, right: 20, zIndex: 9990,
          display: 'flex', alignItems: 'center', gap: 6,
          background: hasPending ? '#ef4444' : ACCENT,
          color: '#fff', borderRadius: 99, padding: '8px 12px 8px 10px',
          fontSize: 12, fontWeight: 700, fontFamily: 'var(--sans)',
          cursor: 'pointer', boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
          transition: 'transform 0.12s, box-shadow 0.12s',
          userSelect: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 4px 18px rgba(0,0,0,0.22)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.18)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        {hasPending ? `! ${pendingFrom.name}` : `${reviewed}/${total} reviewed`}
      </div>
    )
  }

  // ── Progress bar helper ──────────────────────────────────────
  const pct = Math.round((reviewed / total) * 100)

  // ── Expanded widget ──────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes fw-slide-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{
        position: 'fixed', bottom: widgetBottom, right: 20, zIndex: 9990,
        width: 'min(320px, calc(100vw - 32px))',
        background: '#fff', borderRadius: 16,
        boxShadow: '0 8px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)',
        border: '1px solid #f3f4f6',
        overflow: 'hidden',
        animation: 'fw-slide-up 0.22s cubic-bezier(0.4,0,0.2,1)',
        fontFamily: 'var(--sans)',
      }}>

        {/* ── Header ── */}
        <div style={{ background: hasPending ? '#ef4444' : ACCENT, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#fff' }}>
            {hasPending ? `Unsent: ${pendingFrom.name}` : onModule ? moduleName : 'Feedback'}
          </span>
          <button onClick={() => setMinimized(true)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>−</button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '14px 14px 12px' }}>

          {/* Guard: unsent feedback from previous screen */}
          {hasPending && (
            <>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, lineHeight: 1.5 }}>
                You navigated away before submitting your note for <strong>{pendingFrom.name}</strong>.
              </div>
              <div style={{ background: '#fef3c7', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: '#92400e', marginBottom: 10, lineHeight: 1.5, wordBreak: 'break-word' }}>
                "{pendingFrom.text}"
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => submit(pendingFrom.key, pendingFrom.text)}
                  disabled={saving}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  {saving ? 'Saving…' : 'Submit anyway'}
                </button>
                <button
                  onClick={() => setPendingFrom(null)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: 13, cursor: 'pointer' }}
                >
                  Discard
                </button>
              </div>
              {onModule && <div style={{ borderTop: '1px solid #f3f4f6', margin: '12px 0 0' }} />}
            </>
          )}

          {/* Current screen feedback */}
          {showCurrent && (
            <>
              {saved ? (
                <div style={{ textAlign: 'center', padding: '8px 0', color: '#16a34a', fontWeight: 600, fontSize: 14 }}>
                  ✓ Feedback submitted!
                </div>
              ) : alreadyDone ? (
                <>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Your note for this module:</div>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: '#166534', marginBottom: 10, lineHeight: 1.5 }}>
                    ✓ {responses[screen]}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>Want to update it?</div>
                  <textarea
                    ref={textareaRef}
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Updated note…"
                    rows={2}
                    style={{ width: '100%', borderRadius: 8, border: '1.5px solid #e5e7eb', padding: '8px 10px', fontSize: 13, fontFamily: 'var(--sans)', resize: 'vertical', outline: 'none', boxSizing: 'border-box', minHeight: 52 }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => submit(screen, comment)} disabled={saving || !comment.trim()} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: comment.trim() ? ACCENT : '#e5e7eb', color: comment.trim() ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: 700, cursor: comment.trim() ? 'pointer' : 'default', transition: 'background 0.15s' }}>{saving ? 'Saving…' : 'Update'}</button>
                    <button onClick={skip} style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>Close</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, lineHeight: 1.5 }}>
                    What do you think about <strong>{moduleName}</strong>? Any thoughts, issues, or suggestions?
                  </div>
                  <textarea
                    ref={textareaRef}
                    autoFocus
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Type your feedback here…"
                    rows={3}
                    style={{ width: '100%', borderRadius: 8, border: `1.5px solid ${comment.trim() ? ACCENT : '#e5e7eb'}`, padding: '8px 10px', fontSize: 13, fontFamily: 'var(--sans)', resize: 'vertical', outline: 'none', boxSizing: 'border-box', minHeight: 72, transition: 'border-color 0.15s' }}
                    onFocus={e => { e.target.style.borderColor = ACCENT }}
                    onBlur={e => { if (!comment.trim()) e.target.style.borderColor = '#e5e7eb' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => submit(screen, comment)}
                      disabled={saving || !comment.trim()}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: comment.trim() ? ACCENT : '#e5e7eb', color: comment.trim() ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: 700, cursor: comment.trim() ? 'pointer' : 'default', transition: 'background 0.15s' }}
                    >
                      {saving ? 'Saving…' : 'Submit feedback'}
                    </button>
                    <button onClick={skip} style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>Skip</button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Not on a module screen and no pending */}
          {!showCurrent && !hasPending && (
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '4px 0' }}>
              Navigate to a module to give feedback.
            </div>
          )}
        </div>

        {/* ── Progress footer ── */}
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Progress</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT_DARK }}>{reviewed}/{total} modules</span>
          </div>
          <div style={{ height: 5, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_DARK})`, borderRadius: 99, transition: 'width 0.4s ease' }} />
          </div>
          {pct === 100 && (
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>🎉 All modules reviewed — thank you!</div>
          )}
        </div>
      </div>
    </>
  )
}
