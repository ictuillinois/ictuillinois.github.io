import { useState, useRef, useEffect } from 'react'

const FAQ = [
  {
    id: 'what',
    q: 'What is ICT-Lab?',
    a: 'ICT-Lab is an all-in-one research lab management platform. It helps lab teams manage equipment, track training & compliance, organize projects, handle bookings, and communicate — all from one place.',
    keywords: ['what is', 'what are', 'ictlab', 'about', 'overview', 'explain', 'tell me', 'describe'],
    followups: ['who-for', 'features', 'signup'],
  },
  {
    id: 'features',
    q: 'What features does ICT-Lab have?',
    a: 'ICT-Lab includes:\n• Supply Inventory & Inspections\n• Equipment List + Equipment Hub (SOPs, videos, exams)\n• Equipment Booking calendar\n• Training Records & compliance tracking\n• Project Workspace with test results\n• Task Board with meetings & deadlines\n• Lab Messages\n• QR code labels & barcode scanning',
    keywords: ['features', 'modules', 'capabilities', 'what can', 'what does', 'includes', 'functions'],
    followups: ['booking', 'training', 'projects'],
  },
  {
    id: 'who-for',
    q: 'Who is ICT-Lab for?',
    a: 'ICT-Lab is designed for university research labs, independent researchers, lab managers & admins, and multi-user lab teams. It works equally well for a solo researcher and a large team.',
    keywords: ['who', 'for whom', 'target', 'users', 'audience', 'suitable', 'designed for', 'universities'],
    followups: ['solo', 'team', 'signup'],
  },
  {
    id: 'signup',
    q: 'How do I get started?',
    a: 'You can sign up as a Solo user (personal workspace) directly on the login page — no invitation needed. For a Team account, your lab admin creates and invites you. To start a new organization, contact us and we\'ll set it up.',
    keywords: ['sign up', 'signup', 'register', 'get started', 'join', 'create account', 'start', 'begin', 'new user', 'how to use'],
    followups: ['solo', 'team', 'contact'],
  },
  {
    id: 'pricing',
    q: 'Is ICT-Lab free?',
    a: 'Please reach out to us for pricing — we offer plans for individual researchers and research teams.',
    keywords: ['price', 'pricing', 'cost', 'free', 'paid', 'plan', 'subscription', 'how much', 'payment'],
    followups: ['contact', 'signup'],
  },
  {
    id: 'mobile',
    q: 'Is there a mobile app?',
    a: 'Yes! ICT-Lab has native iOS and Android apps. The mobile app includes QR code scanning for equipment, all management features, and works seamlessly alongside the web version.',
    keywords: ['mobile', 'app', 'ios', 'android', 'phone', 'iphone', 'smartphone', 'download', 'apple', 'play store', 'app store'],
    followups: ['qr', 'booking', 'features'],
  },
  {
    id: 'solo',
    q: 'What is a Solo account?',
    a: 'A Solo account is a personal workspace for individual researchers. You get full access to all modules — projects, training records, equipment, task board — just for yourself. You can also invite collaborators to share your workspace.',
    keywords: ['solo', 'individual', 'personal', 'alone', 'single', 'myself', 'one person'],
    followups: ['team', 'signup', 'features'],
  },
  {
    id: 'team',
    q: 'How does a Team account work?',
    a: 'Team accounts are organization-based. An org admin creates the organization and manages users (lab managers and lab users). Each member has role-based access to modules, and data is shared across the team.',
    keywords: ['team', 'organization', 'org', 'group', 'multiple users', 'lab team', 'shared', 'collaborate'],
    followups: ['roles', 'solo', 'signup'],
  },
  {
    id: 'roles',
    q: 'What user roles are there?',
    a: 'ICT-Lab has 4 roles:\n• Org Admin — full control of the organization\n• Lab Manager — manages day-to-day operations\n• Lab User / Student — limited module access\n• Solo User — independent personal workspace',
    keywords: ['role', 'permission', 'admin', 'manager', 'lab_user', 'access level', 'types of user', 'lab user'],
    followups: ['team', 'features', 'signup'],
  },
  {
    id: 'booking',
    q: 'How does equipment booking work?',
    a: 'Lab members pick a date and time slot on the shared booking calendar, submit a request, and an admin approves or denies it. You can scan an equipment\'s QR code to jump straight to booking. Confirmed bookings can even be rescheduled by dragging them on the calendar.',
    keywords: ['book', 'booking', 'reserve', 'calendar', 'schedule', 'reservation', 'equipment booking'],
    followups: ['qr', 'equipment', 'mobile'],
  },
  {
    id: 'training',
    q: 'How does training tracking work?',
    a: 'The Training Records module lets lab users upload certificates and log completions for equipment training, vehicle logs, building alarm training, and more. Admins review and approve submissions. You can also run knowledge-check exams.',
    keywords: ['training', 'certificate', 'compliance', 'certification', 'records', 'exam', 'log', 'upload'],
    followups: ['features', 'roles'],
  },
  {
    id: 'projects',
    q: 'What is the Project Workspace?',
    a: 'The Project Workspace lets you create research projects, manage material inventory with barcode tracking, record test results, and store project links & files. Solo users can share their workspace with collaborators.',
    keywords: ['project', 'research', 'material', 'test result', 'workspace', 'sample', 'inventory', 'project workspace'],
    followups: ['solo', 'qr', 'features'],
  },
  {
    id: 'qr',
    q: 'How do QR codes work in ICT-Lab?',
    a: 'You can generate QR code labels for any piece of equipment. Scanning a code (via the mobile app or any camera) opens that equipment\'s page, showing its SOP, booking calendar, contact info, and calibration records — no login required.',
    keywords: ['qr', 'qr code', 'barcode', 'scan', 'label', 'generate'],
    followups: ['booking', 'mobile', 'equipment'],
  },
  {
    id: 'equipment',
    q: 'What is the Equipment Hub?',
    a: 'The Equipment Hub is a knowledge library per instrument. It stores SOPs (standard operating procedures), training videos, manufacturer standards, and knowledge-check exams — so lab users always have the right information before using equipment.',
    keywords: ['equipment hub', 'sop', 'standard operating', 'video', 'hub', 'knowledge', 'instruments', 'library'],
    followups: ['training', 'qr', 'booking'],
  },
  {
    id: 'inspection',
    q: 'What are Supply Inspections?',
    a: 'The Supply Inventory module lets you track all lab supplies per room and run weekly inspection checklists. Results are saved with timestamps and can be exported to Excel for reporting.',
    keywords: ['inspection', 'supply', 'supplies', 'room', 'checklist', 'inventory', 'stock', 'weekly'],
    followups: ['features', 'booking'],
  },
  {
    id: 'storage',
    q: 'Where are my files stored?',
    a: 'Personal files (training certificates, project records) are stored securely in the cloud by default. You can also connect Google Drive, OneDrive, or a WebDAV/NAS server as your personal storage provider — set it up in Profile → Storage.',
    keywords: ['storage', 'file', 'upload', 'google drive', 'onedrive', 'cloud', 'where stored', 'documents'],
    followups: ['features', 'contact'],
  },
  {
    id: 'contact',
    q: 'How do I contact support?',
    a: 'Tap the "Contact Us" button on this page or use the Customer Service option inside the app. We\'re happy to help with setup, questions, or feature requests.',
    keywords: ['contact', 'support', 'help', 'question', 'reach', 'email', 'talk', 'message', 'issue', 'problem', 'feedback'],
    followups: ['signup', 'pricing'],
  },
]

const STARTERS = ['what', 'features', 'signup', 'pricing', 'mobile', 'booking']

function findAnswer(input) {
  const q = input.toLowerCase()
  let best = null
  let bestScore = 0
  for (const item of FAQ) {
    let score = 0
    for (const kw of item.keywords) {
      if (q.includes(kw)) score += kw.length
    }
    if (score > bestScore) { bestScore = score; best = item }
  }
  return bestScore > 0 ? best : null
}

export default function SaraChat({ bottomOffset = 24, onContact, color = '#1D9E75' }) {
  const ACCENT = color
  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [typing, setTyping]     = useState(false)
  const scrollRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        from: 'sara',
        text: "Hi! I'm Sara, ICT-Lab's virtual assistant 👋\nAsk me anything about ICT-Lab, or pick a topic below.",
        followups: STARTERS,
      }])
    }
  }, [open])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, typing])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120)
  }, [open])

  function send(text) {
    const q = text.trim()
    if (!q) return
    setInput('')
    setMessages(prev => [...prev, { from: 'user', text: q }])
    setTyping(true)
    setTimeout(() => {
      const match = findAnswer(q)
      setTyping(false)
      if (match) {
        setMessages(prev => [...prev, { from: 'sara', text: match.a, followups: match.followups }])
      } else {
        setMessages(prev => [...prev, {
          from: 'sara',
          text: "I'm not sure about that one. Try rephrasing, or choose a topic below.",
          followups: STARTERS.slice(0, 4),
        }])
      }
    }, 650)
  }

  function handleChip(id) {
    const item = FAQ.find(f => f.id === id)
    if (item) send(item.q)
  }

  const panelBottom = bottomOffset + 68

  return (
    <>
      <style>{`
        @keyframes sara-slide-up {
          from { opacity:0; transform:translateY(14px) scale(0.96) }
          to   { opacity:1; transform:translateY(0)    scale(1)    }
        }
        @keyframes sara-dot {
          0%,60%,100% { opacity:0.25; transform:scale(0.75) }
          30%          { opacity:1;   transform:scale(1)    }
        }
        @keyframes sara-pulse {
          0%   { transform:scale(0.92); opacity:0.7 }
          100% { transform:scale(1.85); opacity:0   }
        }
      `}</style>

      {/* ── Chat panel ── */}
      {open && (
        <div style={{
          position: 'fixed', bottom: panelBottom, right: 20,
          width: 360, maxWidth: 'calc(100vw - 40px)', maxHeight: 520,
          background: '#fff', borderRadius: 18,
          boxShadow: '0 8px 48px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', zIndex: 9998,
          animation: 'sara-slide-up 0.22s ease',
        }}>
          {/* Header */}
          <div style={{ background: ACCENT, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', border: '2px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 17, fontWeight: 900, color: '#fff', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>S</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>Sara</div>
              <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11 }}>ICT-Lab Virtual Assistant</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.28)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            >×</button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.from === 'user' ? (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ background: ACCENT, color: '#fff', borderRadius: '14px 14px 3px 14px', padding: '8px 12px', fontSize: 13, maxWidth: '80%', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{msg.text}</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ background: '#f4f6f8', borderRadius: '3px 14px 14px 14px', padding: '8px 12px', fontSize: 13, maxWidth: '90%', lineHeight: 1.65, color: '#1f2937', whiteSpace: 'pre-line' }}>{msg.text}</div>
                    {msg.followups?.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {msg.followups.map(id => {
                          const item = FAQ.find(f => f.id === id)
                          if (!item) return null
                          return (
                            <button key={id} onClick={() => handleChip(id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, border: `1px solid ${ACCENT}`, background: '#e6f7f2', color: '#0d6b50', cursor: 'pointer', fontWeight: 600, lineHeight: 1.4, transition: 'background 0.12s' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#c8f0e4'}
                              onMouseLeave={e => e.currentTarget.style.background = '#e6f7f2'}>
                              {item.q}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {typing && (
              <div style={{ display: 'flex', gap: 4, padding: '4px 2px' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#9ca3af', animation: `sara-dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
            )}
          </div>

          {/* Input row */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
              placeholder="Ask Sara anything…"
              style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 20, padding: '8px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s' }}
              onFocus={e => e.target.style.borderColor = ACCENT}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim()}
              style={{ width: 36, height: 36, borderRadius: '50%', background: input.trim() ? ACCENT : '#e5e7eb', border: 'none', color: input.trim() ? '#fff' : '#9ca3af', cursor: input.trim() ? 'pointer' : 'default', fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}
            >↑</button>
          </div>

          {/* Contact footer */}
          {onContact && (
            <div style={{ padding: '4px 14px 12px', textAlign: 'center', flexShrink: 0 }}>
              <button onClick={() => { setOpen(false); onContact() }} style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Talk to a real person →</button>
            </div>
          )}
        </div>
      )}

      {/* ── Floating button ── */}
      <div style={{ position: 'fixed', bottom: bottomOffset, right: 20, zIndex: 9999 }}>
        {/* Double ripple pulse — only when closed */}
        {!open && <>
          <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', background: `${ACCENT}35`, animation: 'sara-pulse 2.4s ease-out infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', background: `${ACCENT}22`, animation: 'sara-pulse 2.4s ease-out 0.9s infinite', pointerEvents: 'none' }} />
        </>}
        <button
          onClick={() => setOpen(o => !o)}
          title={open ? 'Close Sara' : 'Chat with Sara'}
          style={{
            position: 'relative',
            width: 56, height: 56, borderRadius: '50%',
            background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT}bb 100%)`,
            border: 'none', color: '#fff', cursor: 'pointer',
            boxShadow: open
              ? `0 4px 16px ${ACCENT}55`
              : `0 6px 24px ${ACCENT}66, 0 2px 8px rgba(0,0,0,0.12)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.18s ease, box-shadow 0.18s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = `0 8px 28px ${ACCENT}88` }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)';   e.currentTarget.style.boxShadow = open ? `0 4px 16px ${ACCENT}55` : `0 6px 24px ${ACCENT}66, 0 2px 8px rgba(0,0,0,0.12)` }}
        >
          {open ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          ) : (
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          )}
        </button>
      </div>
    </>
  )
}
