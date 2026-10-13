import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { reportIssue } from '../lib/reportIssue'

// Sara's answers. Keep them in step with the app — these were last checked
// against every module in Oct 2026. When a tab, button or rule changes, the
// answer that mentions it changes too.
const FAQ = [
  {
    id: 'what',
    q: 'What is ICT-Lab?',
    a: 'ICT-Lab is the research lab management system for the Illinois Center for Transportation (ICT) at the University of Illinois. It brings equipment, bookings, training and safety, projects and materials, tasks and lab communication into one place.',
    keywords: ['what is', 'what are', 'ictlab', 'ict', 'about', 'overview', 'explain', 'tell me', 'describe', 'illinois', 'transportation'],
    followups: ['features', 'roles', 'access'],
  },
  {
    id: 'features',
    q: 'What modules are available?',
    a: 'ICT-Lab includes:\n• Project & Material — projects, materials, labels, reductions and tested samples\n• Booking Equipment — shared booking calendar with approval\n• Training Records — safety, documents, vehicle forms, equipment, alarm, locker, exam and SDS\n• Equipment SOP — SOPs, videos, standards and exams per instrument\n• Equipment & Maintenance — the equipment list and its records\n• Task Board — tasks, meetings, timeline and reminders\n• Lab Messages — messages between lab managers and admins\n• QR Labels & QR Scan — print and scan labels\n• Supply Inventory — room-by-room supply counts\n• Mileage Form — mileage reimbursement\nYou see the modules your lab manager has given you.',
    keywords: ['features', 'modules', 'capabilities', 'what can', 'what does', 'includes', 'functions', 'available'],
    followups: ['booking', 'training', 'projects'],
  },
  {
    id: 'access',
    q: 'How do I get access to ICT-Lab?',
    a: 'Your account is created by the Research Engineers, and you receive your sign-in details by email. At your first sign-in you set a new password. If you need access or cannot sign in, email ResearchengineersICT@illinois.edu.',
    keywords: ['access', 'get started', 'login', 'log in', 'sign in', 'new user', 'how to use', 'start', 'begin', 'account', 'credentials', 'invitation'],
    followups: ['password', 'safety', 'contact'],
  },
  {
    id: 'roles',
    q: 'What user roles are there?',
    a: 'ICT-Lab has three roles:\n• Org Admin — manages the organization, its users and settings\n• Lab Manager (Research Engineer) — runs the lab day to day and approves requests\n• Lab User — a researcher or student using the modules they are given',
    keywords: ['role', 'permission', 'admin', 'manager', 'lab user', 'research engineer', 'access level', 'types of user', 'researcher', 'student'],
    followups: ['features', 'access', 'booking'],
  },
  {
    id: 'safety',
    q: 'How do I complete lab safety training?',
    a: 'Open Training Records → Safety. The steps are:\n1. Watch the ICT safety training video\n2. Read the Laboratory Safety Guide and complete the DRS online training\n3. Watch both safety videos and pass the acknowledgement test\nA Research Engineer approves each step. Some modules stay locked until your safety training is approved.',
    keywords: ['safety', 'lab safety', 'drs', 'safety video', 'safety training', 'acknowledgement', 'step 1', 'step 2', 'step 3', 'locked'],
    followups: ['training', 'access', 'contact'],
  },
  {
    id: 'booking',
    q: 'How does equipment booking work?',
    a: 'Open Booking Equipment, select the instrument on the left, and drag on the calendar to pick your time. Give a purpose (project, thesis or other) and send it — a Research Engineer approves it and you are notified. You can then add it to Google Calendar or Outlook.\n\nYou can cancel a booking until it starts and edit it until it ends; once it is over it is locked. Equipment that needs training, or retraining after 3 months unused, asks for it first. Scanning an equipment QR code takes you straight to its booking.',
    keywords: ['book', 'booking', 'reserve', 'calendar', 'schedule', 'reservation', 'equipment booking', 'request', 'approve', 'cancel', 'reschedule', 'edit booking'],
    followups: ['qr', 'training', 'contact'],
  },
  {
    id: 'training',
    q: 'How does training tracking work?',
    a: 'Training Records holds everything you complete and keep current:\n• Safety — the three safety steps\n• Lab User Documents — upload certificates\n• Vehicle — vehicle forms and training\n• Equipment — training per instrument\n• Building Alarm\n• Lab User Locker — request a locker\n• Exam and SDS\nA Research Engineer approves your submissions. Your records are private: only you and the lab managers see them.',
    keywords: ['training', 'certificate', 'compliance', 'certification', 'records', 'exam', 'upload', 'orientation', 'alarm', 'documents', 'sds'],
    followups: ['safety', 'vehicle', 'locker'],
  },
  {
    id: 'vehicle',
    q: 'How do I get approved to drive a lab vehicle?',
    a: 'Open Training Records → Vehicle → Forms:\n1. Tick the vehicles you need\n2. Read the Golf Cart Manual page by page and confirm at the end\n3. Download the two forms, sign them, and upload the signed copies\nA Research Engineer approves the forms and then confirms your vehicles.',
    keywords: ['vehicle', 'golf cart', 'golf car', 'drive', 'driving', 'car', 'cart', 'vehicle form', 'use agreement', 'manual'],
    followups: ['training', 'mileage', 'contact'],
  },
  {
    id: 'locker',
    q: 'How do I get a locker?',
    a: 'Open Training Records → Lab User Locker and press "Request a locker" (you can add a note). A Research Engineer assigns you a free locker and you get a notification. Until then the tab shows your request, and you can cancel it.',
    keywords: ['locker', 'lockers', 'storage space', 'cabinet', 'my locker', 'request locker'],
    followups: ['training', 'contact'],
  },
  {
    id: 'projects',
    q: 'What is the Project & Material?',
    a: 'Project & Material holds your projects and the materials stored for them. Every material has its own 4×6 label with a barcode and QR code, and a storage location. You can split a material into new ones with Material Reduction (for example fractions by sieve size), and print a separate label for each tested sample. Research Engineers assign you to projects.',
    keywords: ['project', 'research', 'material', 'workspace', 'sample', 'inventory', 'project & material', 'barcode', 'reduction', 'fraction', 'sieve', 'tested', 'label'],
    followups: ['qr', 'features', 'contact'],
  },
  {
    id: 'tasks',
    q: 'How does the Task Board work?',
    a: 'The Task Board keeps your tasks, meetings and deadlines. Add a task with a deadline, priority and project; click its status circle to move it along. Calendar shows deadlines by month, Timeline shows tasks as bars per project, and "Remind me daily" sends you a reminder each morning at 7am until the task is done.',
    keywords: ['task', 'tasks', 'task board', 'deadline', 'meeting', 'reminder', 'timeline', 'todo', 'to do', 'out of lab'],
    followups: ['notifications', 'features'],
  },
  {
    id: 'qr',
    q: 'How do QR codes work?',
    a: 'Use QR Scan to scan a label. A material label opens that material\'s record; an equipment label opens its SOP, booking, contact and calibration options after you sign in. Research Engineers print equipment labels in QR Labels.',
    keywords: ['qr', 'qr code', 'barcode', 'scan', 'generate', 'print', 'sticker'],
    followups: ['booking', 'projects', 'features'],
  },
  {
    id: 'notifications',
    q: 'How do notifications work?',
    a: 'The bell at the top right shows your notifications; click one to go straight to it. In Profile → Notifications you choose what you are told about in the app, and what is also sent by email.',
    keywords: ['notification', 'notifications', 'bell', 'email', 'alert', 'notify', 'emails'],
    followups: ['tasks', 'booking'],
  },
  {
    id: 'mileage',
    q: 'How do I submit a mileage reimbursement?',
    a: 'Click the Mileage Form card on your dashboard. It opens the ICT mileage reimbursement form; fill in your trip details and submit. For questions about the reimbursement policy, contact ResearchengineersICT@illinois.edu.',
    keywords: ['mileage', 'reimbursement', 'travel', 'miles', 'trip', 'mileage form'],
    followups: ['vehicle', 'contact'],
  },
  {
    id: 'password',
    q: 'How do I change my password?',
    a: 'At your first sign-in you are asked to set a new password. To change it later, go to Profile → Password. If you are locked out or forgot your password, contact ResearchengineersICT@illinois.edu and a Research Engineer will reset it.',
    keywords: ['password', 'forgot', 'reset', 'change password', 'locked out', 'login problem', 'can\'t log in', 'cannot log in'],
    followups: ['access', 'contact'],
  },
  {
    id: 'policy',
    q: 'What are the usage policies?',
    a: 'All ICT-Lab users must:\n• Keep their sign-in details private — never share an account\n• Use ICT-Lab only for authorized research\n• Record data accurately — falsification is strictly prohibited\n• Complete the required safety and equipment training before using the lab\n• Follow all ICT policies\n\nThe full policy is in the Terms of Service, linked on the sign-in page.',
    keywords: ['policy', 'rules', 'guidelines', 'terms', 'allowed', 'prohibited', 'authorized', 'share account', 'falsification'],
    followups: ['safety', 'training', 'contact'],
  },
  {
    id: 'contact',
    q: 'How do I contact the Research Engineers?',
    a: 'You can reach the ICT Research Engineers by:\n• Email: ResearchengineersICT@illinois.edu\n• "Report a problem" below, which sends them your message and a screenshot\n• Contact Us on the sign-in page\n\nFor urgent lab issues, contact the lab directly.',
    keywords: ['contact', 'support', 'help', 'question', 'reach', 'talk', 'issue', 'problem', 'research engineer', 'report', 'bug'],
    followups: ['password', 'access', 'features'],
  },
]

const STARTERS = ['what', 'safety', 'booking', 'training', 'locker', 'vehicle', 'contact']

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
  const { session } = useAppStore()
  // Reporting a problem is a different shape from asking a question: it takes
  // a description and optionally a screenshot, and it ends in something being
  // sent rather than answered. Its own mode inside the panel, not a chat turn.
  const [reporting, setReporting]   = useState(false)
  const [reportText, setReportText] = useState('')
  const [reportFile, setReportFile] = useState(null)
  const [sending, setSending]       = useState(false)
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

  async function submitReport() {
    if (!reportText.trim() && !reportFile) return
    setSending(true)
    const res = await reportIssue({
      session,
      message: reportText.trim() || '(screenshot only — no description given)',
      file: reportFile,
      screen: useAppStore.getState?.().screen || null,
    })
    setSending(false)
    setReporting(false); setReportText(''); setReportFile(null)

    if (!res.ok) {
      setMessages(prev => [...prev, { from: 'sara',
        text: `I couldn't send that — ${res.error}.\nPlease try again, or use Contact support below.` }])
      return
    }
    // Say plainly if part of it failed. "Sent!" when the screenshot silently
    // did not upload leaves them believing we can see something we cannot.
    const caveat = res.problems?.length
      ? `\n\nOne thing to note: ${res.problems.join(', ')}. Your report itself was saved.`
      : ''
    setMessages(prev => [...prev, { from: 'sara',
      text: `Thanks — your report has been sent to the lab administrators ✅${caveat}`
          + `\n\nThey have been notified by email and in the app, so someone should pick it up shortly. `
          + `You can carry on working and check back later — there is nothing else you need to do.`,
      followups: STARTERS.slice(0, 3) }])
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

          {reporting ? (
            <div style={{ padding: 12, borderTop: '1px solid #f3f4f6', flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Report a problem</div>
              <textarea value={reportText} onChange={e => setReportText(e.target.value)} rows={3}
                placeholder="What went wrong? What were you trying to do?"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 10px',
                         fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
              <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                <label style={{ cursor: 'pointer', color: ACCENT, fontWeight: 600 }}>
                  📎 Attach a screenshot
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => setReportFile(e.target.files?.[0] || null)} />
                </label>
                {reportFile && <span style={{ marginLeft: 8 }}>{reportFile.name}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={submitReport} disabled={sending || (!reportText.trim() && !reportFile)}
                  style={{ flex: 1, border: 'none', borderRadius: 20, padding: '8px 14px', fontSize: 13, fontWeight: 700,
                           color: '#fff', cursor: sending ? 'default' : 'pointer',
                           background: (reportText.trim() || reportFile) && !sending ? ACCENT : '#e5e7eb' }}>
                  {sending ? 'Sending…' : 'Send report'}
                </button>
                <button onClick={() => { setReporting(false); setReportText(''); setReportFile(null) }}
                  style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 20,
                           padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : (<>
          <div style={{ padding: '8px 12px 0', flexShrink: 0 }}>
            <button onClick={() => setReporting(true)}
              style={{ border: `1px solid ${ACCENT}`, background: '#fff', color: ACCENT, borderRadius: 20,
                       padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              ⚠ Report a problem
            </button>
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
          </>)}

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
