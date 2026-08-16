import { useState, useRef, useEffect } from 'react'

// ── Tour card definitions ──────────────────────────────────────────────────

function getTourCards(session) {
  const name = session?.username || 'there'
  const isManager = session?.role === 'user' || session?.role === 'admin'
  const isSuperAdmin = session?.role === 'admin' && !session?.userId

  if (isSuperAdmin) return []

  const cards = [
    {
      emoji: '🎉',
      title: `Welcome, ${name}!`,
      body: "You're now part of ICT-Lab — the research lab management system for the Illinois Center for Transportation.\n\nLet's take a quick tour to help you get started.",
    },
    {
      emoji: '🗂️',
      title: 'Your Dashboard',
      body: 'These cards are your modules. Tap any card to open it.\n\nCustomize which modules appear here by going to Profile → Dashboard Icons.',
    },
    {
      emoji: '👤',
      title: 'Your Profile',
      body: 'Tap your profile icon (top-right corner) to:\n• Add or change your profile photo\n• Update your name and info\n• Change your password\n• Sign out',
    },
    {
      emoji: '🏢',
      title: 'Your Team Workspace',
      body: "You're working in a shared team space. Your projects, training records, and bookings are visible to your Research Engineers.\n\nEveryone works together toward the same research goals.",
    },
    {
      emoji: '💬',
      title: 'Get Help Anytime',
      body: 'Chat with Sara — the button at the bottom-right — for instant answers about ICT-Lab.\n\nTap the ? button in the header anytime to replay this tour.',
    },
  ]

  if (isManager) {
    cards.push({
      emoji: '⚙️',
      title: 'Managing Your Team',
      body: 'As a lab manager, you can:\n• Lab Management → add users & set their module access\n• Training Records → review and approve submissions\n• Reserve Equipment → approve booking requests\n• Admin Panel → customize org settings and icons',
    })
  }

  return cards
}

// ── Module tip content ─────────────────────────────────────────────────────

const SCREEN_TIPS = {
  booking: {
    title: 'Reserve Equipment',
    body: 'Pick equipment, choose a date and time, then submit. A Research Engineer approves the request — you get a notification when it\'s confirmed.\n\nTip: scan an equipment QR code to jump straight to booking.',
  },
  training: {
    title: 'Training Records',
    body: 'Upload your training certificates here — each one is reviewed and approved by a Research Engineer. Complete all required training before using lab equipment.\n\nCheck the Safety tab for required lab safety steps first.',
  },
  projects: {
    title: 'Project & Material',
    body: 'Create and manage your research projects here. Track material inventory with barcode scanning, record test results, and store project files and links.',
  },
  home: {
    title: 'Supply Inspection',
    body: 'Run room-by-room supply inspections. Count items, flag low stock, and add notes. Results are saved with timestamps and can be exported to Excel.',
  },
  equipmenthub: {
    title: 'Equipment SOP',
    body: 'Browse standard operating procedures, watch training videos, and take knowledge-check exams. Complete your training here before booking and using equipment for the first time.',
  },
  barcode: {
    title: 'QR Scanner',
    body: 'Scan any project material barcode to look up its details instantly. Use this to quickly identify materials in your research projects.',
  },
  barcodeqr: {
    title: 'QR Labels',
    body: 'Generate and print QR code labels for lab equipment. When someone scans a label it opens that equipment\'s SOP, booking calendar, and contact info.',
  },
  pm: {
    title: 'Preventive Maintenance',
    body: 'Track maintenance tasks for lab equipment. Set deadlines, assign responsibilities, and monitor completion to keep equipment running reliably.',
  },
  labmanagement: {
    title: 'Lab Management',
    body: 'Add and manage lab users here. Set which modules each person can access, activate or deactivate accounts, and view the whole team at a glance.',
  },
  equipmentscan: {
    title: 'Equipment QR Page',
    body: "You've arrived via a QR code scan. From here you can view the SOP, book the equipment, send a message to the lab, or check calibration records.",
  },
  history: {
    title: 'Inspection History',
    body: 'Browse all past supply inspection records here. Filter by room or date, view item-level results, and export reports to Excel.',
  },
}

// ── ModuleTip banner ───────────────────────────────────────────────────────

export function ModuleTip({ screen, userId }) {
  const tip = SCREEN_TIPS[screen]
  const key = `ictlab_tip_${userId}_${screen}`
  const [visible, setVisible] = useState(() => !!tip && localStorage.getItem(key) !== 'seen')

  if (!visible || !tip) return null

  function dismiss() {
    localStorage.setItem(key, 'seen')
    setVisible(false)
  }

  return (
    <div style={{
      marginBottom: 16,
      background: 'linear-gradient(135deg, #eaf7f2 0%, #f0fdf9 100%)',
      border: '1px solid #6ee7c3',
      borderLeft: '4px solid #1D9E75',
      borderRadius: 12,
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      animation: 'tip-in 0.35s cubic-bezier(0.34,1.2,0.64,1)',
    }}>
      <style>{`@keyframes tip-in { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }`}</style>
      <div style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>💡</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#064e35', marginBottom: 3 }}>{tip.title}</div>
        <div style={{ fontSize: 12.5, color: '#065f46', lineHeight: 1.65, whiteSpace: 'pre-line' }}>{tip.body}</div>
      </div>
      <button
        onClick={dismiss}
        style={{ flexShrink: 0, background: '#bbf7d0', border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: '#14532d', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', marginTop: 1 }}
      >Got it ✓</button>
    </div>
  )
}

// ── Help button with callout bubble ───────────────────────────────────────

export function HelpTourButton({ loginCount, onOpen, accentRgb = '29,198,130' }) {
  const showCallout = loginCount > 0 && loginCount <= 3
  const [calloutVisible, setCalloutVisible] = useState(false)

  useEffect(() => {
    if (!showCallout) return
    const show = setTimeout(() => setCalloutVisible(true), 1400)
    const hide = setTimeout(() => setCalloutVisible(false), 8000)
    return () => { clearTimeout(show); clearTimeout(hide) }
  }, [showCallout])

  function handleClick() {
    setCalloutVisible(false)
    onOpen()
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <style>{`
        @keyframes help-ring  { 0%{transform:scale(1);opacity:0.7} 70%{transform:scale(2.1);opacity:0} 100%{transform:scale(2.1);opacity:0} }
        @keyframes callout-in { from{opacity:0;transform:translateY(-6px) scale(0.92)} to{opacity:1;transform:translateY(0) scale(1)} }
      `}</style>

      <button
        onClick={handleClick}
        title="Show guided tour"
        style={{ position: 'relative', width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.18s ease', fontWeight: 800, fontSize: 15, fontFamily: 'inherit' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.transform = 'translateY(-1px) scale(1.06)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.25)'; e.currentTarget.style.color = '#fff' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)' }}
      >
        {loginCount > 0 && loginCount <= 5 && (
          <>
            <span style={{ position: 'absolute', inset: -3, borderRadius: 13, border: `2px solid rgba(${accentRgb},0.75)`, animation: 'help-ring 2.2s ease-out infinite', pointerEvents: 'none' }} />
            <span style={{ position: 'absolute', inset: -3, borderRadius: 13, border: `2px solid rgba(${accentRgb},0.45)`, animation: 'help-ring 2.2s ease-out 0.9s infinite', pointerEvents: 'none' }} />
          </>
        )}
        ?
      </button>

      {/* Speech-bubble callout */}
      {calloutVisible && (
        <div
          onClick={handleClick}
          style={{
            position: 'absolute', top: 'calc(100% + 12px)', right: 0,
            background: '#fff', borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)',
            padding: '10px 14px', minWidth: 180, cursor: 'pointer', zIndex: 500,
            animation: 'callout-in 0.28s cubic-bezier(0.34,1.3,0.64,1)',
          }}
        >
          {/* Arrow pointing up */}
          <div style={{ position: 'absolute', top: -7, right: 12, width: 14, height: 14, background: '#fff', transform: 'rotate(45deg)', borderTop: '1px solid rgba(0,0,0,0.06)', borderLeft: '1px solid rgba(0,0,0,0.06)' }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0d1b35', marginBottom: 3 }}>👋 New here?</div>
          <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.5 }}>Click to start the guided tour and learn how to use ICT-Lab.</div>
          <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: `rgb(${accentRgb})` }}>Start tour →</div>
        </div>
      )}
    </div>
  )
}

// ── OnboardingTour modal ───────────────────────────────────────────────────

export default function OnboardingTour({ session, onDone }) {
  const [step, setStep] = useState(0)
  const prevStep = useRef(0)
  const cards = getTourCards(session)

  if (!cards.length) { onDone?.(); return null }

  const card = cards[step]
  const isLast = step === cards.length - 1

  function finish() {
    const uid = session?.userId || 'noid'
    localStorage.setItem(`ictlab_tour_done_${uid}`, 'true')
    onDone?.()
  }

  function goNext() { prevStep.current = step; setStep(s => s + 1) }
  function goBack() { prevStep.current = step; setStep(s => s - 1) }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(5,15,40,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) finish() }}
    >
      <style>{`
        @keyframes tour-pop { from { opacity:0; transform:scale(0.94) translateY(12px) } to { opacity:1; transform:scale(1) translateY(0) } }
        @keyframes tour-card { from { opacity:0; transform:translateX(20px) } to { opacity:1; transform:translateX(0) } }
      `}</style>

      <div style={{
        position: 'relative',
        background: '#fff',
        borderRadius: 24,
        width: '100%',
        maxWidth: 430,
        overflow: 'hidden',
        boxShadow: '0 40px 100px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)',
        animation: 'tour-pop 0.32s cubic-bezier(0.34,1.3,0.64,1)',
      }}>

        {/* Progress bar */}
        <div style={{ height: 3, background: '#f1f5f9' }}>
          <div style={{ height: '100%', background: '#1D9E75', width: `${((step + 1) / cards.length) * 100}%`, transition: 'width 0.35s ease', borderRadius: 2 }} />
        </div>

        {/* Step label + skip */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 0' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Step {step + 1} of {cards.length}
          </span>
          <button
            onClick={finish}
            style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0' }}
          >Skip tour</button>
        </div>

        {/* Card content */}
        <div key={step} style={{ padding: '20px 28px 24px', textAlign: 'center', animation: 'tour-card 0.22s ease' }}>
          <div style={{ fontSize: 60, lineHeight: 1, marginBottom: 16 }}>{card.emoji}</div>
          <div style={{ fontSize: 21, fontWeight: 800, color: '#0d1b35', marginBottom: 14, letterSpacing: '-0.4px', lineHeight: 1.2 }}>{card.title}</div>
          <div style={{
            fontSize: 14, color: '#374151', lineHeight: 1.75, whiteSpace: 'pre-line',
            textAlign: 'left', background: '#f8fafc', borderRadius: 12,
            padding: '14px 16px', border: '1px solid #f1f5f9',
          }}>{card.body}</div>
        </div>

        {/* Dot indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              style={{
                width: i === step ? 22 : 7,
                height: 7,
                borderRadius: 4,
                background: i === step ? '#1D9E75' : '#d1d5db',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'all 0.25s ease',
              }}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div style={{ padding: '0 24px 24px', display: 'flex', gap: 10 }}>
          {step > 0 && (
            <button
              onClick={goBack}
              style={{ flex: 1, padding: '12px 0', border: '1.5px solid #e5e7eb', borderRadius: 12, background: '#fff', color: '#4b5563', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.borderColor = '#d1d5db' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e5e7eb' }}
            >← Back</button>
          )}
          <button
            onClick={isLast ? finish : goNext}
            style={{ flex: 3, padding: '12px 0', border: 'none', borderRadius: 12, background: '#1D9E75', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', boxShadow: '0 4px 14px rgba(29,158,117,0.35)' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#178A66'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(29,158,117,0.45)' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1D9E75'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(29,158,117,0.35)' }}
          >{isLast ? "Get started! 🚀" : "Next →"}</button>
        </div>
      </div>
    </div>
  )
}
