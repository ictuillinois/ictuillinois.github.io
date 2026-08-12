import { useState, useRef, useEffect } from 'react'

const FAQ = [
  {
    id: 'what',
    q: 'What is ICT-Lab?',
    a: 'ICT-Lab is the research lab management system for the Illinois Center for Transportation (ICT) at the University of Illinois. It helps lab team members manage equipment, training compliance, research projects, bookings, and lab communications — all in one place.',
    keywords: ['what is', 'what are', 'ictlab', 'ict', 'about', 'overview', 'explain', 'tell me', 'describe', 'illinois', 'transportation'],
    followups: ['features', 'roles', 'access'],
  },
  {
    id: 'features',
    q: 'What modules are available?',
    a: 'ICT-Lab includes:\n• Project Workspace — research projects, materials & test results\n• Reserve Equipment — booking calendar with admin approval\n• Training Records — certs, vehicle log, alarm & equipment training\n• QR Scan — scan lab materials & equipment\n• QR Labels — generate & print equipment QR codes (staff)\n• Mileage Form — submit mileage reimbursement\n• Lab Safety — safety training & certification portal\n• Supply Inventory — room-by-room supply tracking (staff)',
    keywords: ['features', 'modules', 'capabilities', 'what can', 'what does', 'includes', 'functions', 'available'],
    followups: ['booking', 'training', 'projects'],
  },
  {
    id: 'access',
    q: 'How do I get access to ICT-Lab?',
    a: 'Your account is created by the Research Engineers. You will receive your login credentials by email. On your first login you will be prompted to set a new password. If you need access or have login issues, email ResearchengineersICT@illinois.edu.',
    keywords: ['access', 'get started', 'login', 'log in', 'sign in', 'new user', 'how to use', 'start', 'begin', 'account', 'credentials', 'invitation'],
    followups: ['password', 'roles', 'contact'],
  },
  {
    id: 'roles',
    q: 'What user roles are there?',
    a: 'ICT-Lab has three roles:\n• Org Admin — full control, manages all users and settings\n• Lab Manager (Research Engineer) — manages day-to-day lab operations and approvals\n• Lab User — researcher or student with access to assigned modules',
    keywords: ['role', 'permission', 'admin', 'manager', 'lab user', 'research engineer', 're', 'access level', 'types of user', 'student', 'researcher'],
    followups: ['features', 'access', 'booking'],
  },
  {
    id: 'booking',
    q: 'How does equipment booking work?',
    a: 'Open the Reserve Equipment module, select a piece of equipment, then pick a date and time on the shared calendar. Your request is sent to a Research Engineer for approval. You\'ll be notified when it\'s confirmed or denied. You can also scan an equipment\'s QR code to go straight to its booking page.',
    keywords: ['book', 'booking', 'reserve', 'calendar', 'schedule', 'reservation', 'equipment booking', 'request', 'approve'],
    followups: ['qr', 'training', 'contact'],
  },
  {
    id: 'training',
    q: 'How does training tracking work?',
    a: 'The Training Records module lets you upload certificates and log completions for:\n• Lab orientation / fresh training\n• Golf cart / vehicle log\n• Building alarm training\n• Equipment-specific training\n• Locker assignment\nResearch Engineers review and approve your submissions.',
    keywords: ['training', 'certificate', 'compliance', 'certification', 'records', 'exam', 'log', 'upload', 'orientation', 'golf cart', 'vehicle', 'alarm'],
    followups: ['features', 'contact', 'access'],
  },
  {
    id: 'projects',
    q: 'What is the Project Workspace?',
    a: 'The Project Workspace lets you create and manage research projects. You can track material inventory with barcode scanning, record test results, and store project files and links. Research Engineers can also assign you to projects.',
    keywords: ['project', 'research', 'material', 'test result', 'workspace', 'sample', 'inventory', 'project workspace', 'barcode'],
    followups: ['qr', 'features', 'contact'],
  },
  {
    id: 'qr',
    q: 'How do QR codes work?',
    a: 'Use QR Scan to scan any lab material barcode and look up its details instantly. Staff can use QR Labels to generate and print QR code stickers for equipment. Scanning an equipment QR code opens its SOP, booking calendar, and contact info directly.',
    keywords: ['qr', 'qr code', 'barcode', 'scan', 'label', 'generate', 'print', 'sticker'],
    followups: ['booking', 'projects', 'features'],
  },
  {
    id: 'mileage',
    q: 'How do I submit a mileage reimbursement?',
    a: 'Click the Mileage Form card on your dashboard. It will open the ICT mileage reimbursement portal in a new tab. Fill in your trip details and submit. For questions about reimbursement policy, contact ResearchengineersICT@illinois.edu.',
    keywords: ['mileage', 'reimbursement', 'travel', 'miles', 'driving', 'trip', 'mileage form'],
    followups: ['contact', 'labsafety', 'features'],
  },
  {
    id: 'labsafety',
    q: 'What is the Lab Safety module?',
    a: 'The Lab Safety card links to the ICT/UIUC safety training and certification portal. All lab users are required to complete the necessary safety training before working in the lab or using equipment. Check with your Research Engineer for which trainings apply to you.',
    keywords: ['lab safety', 'safety', 'training portal', 'certification', 'uiuc', 'required', 'ict policy'],
    followups: ['training', 'contact', 'access'],
  },
  {
    id: 'password',
    q: 'How do I change my password?',
    a: 'On your first login you will be prompted to set a new password automatically. To change it later, go to Profile → Security. If you are locked out or forgot your password, contact ResearchengineersICT@illinois.edu and a Research Engineer will reset it for you.',
    keywords: ['password', 'forgot', 'reset', 'change password', 'locked out', 'login problem', 'can\'t log in', 'credentials'],
    followups: ['access', 'contact', 'roles'],
  },
  {
    id: 'policy',
    q: 'What are the usage policies?',
    a: 'All ICT-Lab users must:\n• Keep login credentials private — never share your account\n• Use ICT-Lab only for authorized research activities\n• Record data accurately — falsification is strictly prohibited\n• Complete required safety and equipment training before lab use\n• Follow all ICT policies\n\nFor the full policy document, see the Terms of Service link on the login page.',
    keywords: ['policy', 'rules', 'guidelines', 'terms', 'allowed', 'prohibited', 'authorized', 'credentials', 'share account', 'data', 'falsification'],
    followups: ['labsafety', 'training', 'contact'],
  },
  {
    id: 'contact',
    q: 'How do I contact the Research Engineers?',
    a: 'You can reach the ICT Research Engineers by:\n• Email: ResearchengineersICT@illinois.edu\n• The "Contact Us" button on this page\n\nFor urgent lab issues, contact the lab directly.',
    keywords: ['contact', 'support', 'help', 'question', 'reach', 'email', 'talk', 'issue', 'problem', 'research engineer', 'illinois', 'uiuc'],
    followups: ['password', 'access', 'features'],
  },
]

const STARTERS = ['what', 'access', 'booking', 'training', 'mileage', 'labsafety', 'contact']

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
