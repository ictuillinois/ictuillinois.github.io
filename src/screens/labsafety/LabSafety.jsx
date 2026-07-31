import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'

// ── Step configuration ─────────────────────────────────────────────────────
// Update each step's title, description, and content when details are provided.
// type: 'placeholder' | 'video' | 'pdf' | 'download' | 'mixed'
const STEPS = [
  {
    number: 1,
    title: 'Step 1',
    icon: '📋',
    description: 'Safety orientation',
    type: 'placeholder',
    content: null,
  },
  {
    number: 2,
    title: 'Step 2',
    icon: '🎬',
    description: 'Required training video',
    type: 'placeholder',
    content: null,
  },
  {
    number: 3,
    title: 'Step 3',
    icon: '📝',
    description: 'Policy review and acknowledgment',
    type: 'placeholder',
    content: null,
  },
  {
    number: 4,
    title: 'Step 4',
    icon: '🎬',
    description: 'Watch the ICT Safety Training Video',
    type: 'ict_video',
    content: null,
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function UserAvatar({ user, size = 44 }) {
  const name = user.nick_name?.trim() || user.name || '?'
  const initial = name[0].toUpperCase()
  const colors = ['#534AB7', '#1D9E75', '#0369a1', '#92400e', '#c84b2f', '#065F46']
  const bg = colors[initial.charCodeAt(0) % colors.length]
  if (user.photo_url) {
    return <img src={user.photo_url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0 }}>
      {initial}
    </div>
  )
}

function StepDot({ number, completed }) {
  return (
    <div title={`Step ${number}: ${completed ? 'Approved' : 'Pending'}`} style={{
      width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: completed ? 13 : 11, fontWeight: 700,
      background: completed ? '#1D9E75' : 'var(--surface2)',
      color: completed ? '#fff' : '#9ca3af',
      border: `2px solid ${completed ? '#1D9E75' : 'var(--border)'}`,
      transition: 'all 0.2s',
    }}>
      {completed ? '✓' : number}
    </div>
  )
}

// ── User card (staff view) ─────────────────────────────────────────────────

function UserSafetyCard({ user, progress, selected, onClick }) {
  const userProg = progress[user.id] || {}
  const approvedCount = STEPS.filter(s => userProg[s.number]).length
  const fullName = [user.nick_name?.trim() || user.name, user.last_name].filter(Boolean).join(' ')
  const allDone = approvedCount === STEPS.length

  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? 'var(--accent-light)' : 'var(--surface)',
        border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 12, padding: '14px 12px', cursor: 'pointer', transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--accent)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <UserAvatar user={user} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName}</div>
          <div style={{ fontSize: 11, color: allDone ? '#1D9E75' : 'var(--text3)', fontWeight: allDone ? 600 : 400 }}>
            {allDone ? '✓ All steps approved' : `${approvedCount} / ${STEPS.length} approved`}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        {STEPS.map(s => <StepDot key={s.number} number={s.number} completed={!!userProg[s.number]} />)}
      </div>
    </div>
  )
}

// ── Step 4: ICT Safety Video ───────────────────────────────────────────────

function Step4VideoContent({ userId }) {
  const clickKey   = `ictlab_safety4_clicked_${userId}`
  const confirmKey = `ictlab_safety4_confirmed_${userId}`
  const [url, setUrl] = useState('')
  const [hasClicked, setHasClicked]   = useState(() => !!localStorage.getItem(clickKey))
  const [confirmed, setConfirmed]     = useState(() => !!localStorage.getItem(confirmKey))

  useEffect(() => {
    sb.from('settings').select('value').eq('key', 'labsafety_url').maybeSingle()
      .then(({ data }) => { if (data?.value) setUrl(data.value) })
  }, [])

  function handleWatch() {
    if (!url) return
    localStorage.setItem(clickKey, '1')
    setHasClicked(true)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function handleConfirm(e) {
    const checked = e.target.checked
    setConfirmed(checked)
    if (checked) localStorage.setItem(confirmKey, '1')
    else localStorage.removeItem(confirmKey)
  }

  return (
    <div>
      <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 20, marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 14 }}>
          Watch the required ICT Laboratory Safety Video. After watching, return here and check the confirmation box so your lab manager can approve this step.
        </div>
        <button onClick={handleWatch} disabled={!url}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: url ? 'pointer' : 'default', opacity: url ? 1 : 0.5 }}>
          Watch ICT Safety Video ↗
        </button>
      </div>
      {hasClicked ? (
        <div style={{ background: confirmed ? '#E1F5EE' : 'var(--surface2)', border: `1px solid ${confirmed ? '#9FE1CB' : 'var(--border)'}`, borderRadius: 8, padding: '12px 16px', transition: 'all 0.2s' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: confirmed ? '#085041' : 'var(--text)', fontWeight: confirmed ? 600 : 400 }}>
            <input type="checkbox" checked={confirmed} onChange={handleConfirm}
              style={{ width: 16, height: 16, accentColor: '#1D9E75', cursor: 'pointer' }} />
            I confirm I have watched the ICT safety video
          </label>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
          After clicking the link above, a confirmation checkbox will appear here.
        </div>
      )}
    </div>
  )
}

// ── Step content renderer ──────────────────────────────────────────────────

function StepContentArea({ step, targetUserId }) {
  if (step.type === 'ict_video') return <Step4VideoContent userId={targetUserId} />

  // ── PLACEHOLDER — replace with real content when step details are provided ──
  if (step.type === 'placeholder' || !step.content) {
    return (
      <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '36px 24px', textAlign: 'center', border: '2px dashed var(--border)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{step.icon}</div>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, color: 'var(--text)' }}>{step.title} content coming soon</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7, maxWidth: 380, margin: '0 auto' }}>
          This step will include materials such as files to download,
          PDFs to review and sign, or training videos to watch.
          Your lab manager will update this section shortly.
        </div>
      </div>
    )
  }

  // ── VIDEO step ──
  if (step.type === 'video') {
    return (
      <div>
        <div style={{ aspectRatio: '16/9', background: '#000', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
          <iframe src={step.content.url} style={{ width: '100%', height: '100%', border: 'none' }} allowFullScreen title={step.title} />
        </div>
        {step.content.description && (
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{step.content.description}</div>
        )}
      </div>
    )
  }

  // ── PDF / DOWNLOAD step ──
  if (step.type === 'pdf' || step.type === 'download') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {step.content.description && (
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{step.content.description}</div>
        )}
        {(step.content.files || []).map((f, i) => (
          <a key={i} href={f.url} target="_blank" rel="noreferrer" download={step.type === 'download'}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)', transition: 'border-color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <span style={{ fontSize: 24 }}>{step.type === 'pdf' ? '📄' : '⬇️'}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{f.label}</div>
              {f.size && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{f.size}</div>}
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
              {step.type === 'pdf' ? 'Open PDF ↗' : 'Download'}
            </span>
          </a>
        ))}
      </div>
    )
  }

  return null
}

// ── Step panel (tabs + content + actions) ─────────────────────────────────

function StepPanel({ user, progress, isStaff, onApprove, onRevoke, saving }) {
  const { setScreen } = useAppStore()
  const [activeStep, setActiveStep] = useState(1)
  const userProg = progress[user?.id] || {}
  const allApproved = STEPS.every(s => userProg[s.number])

  if (!user) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>

      {/* Tab bar */}
      <div style={{ display: 'flex', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        {STEPS.map(s => {
          const done = !!userProg[s.number]
          const active = activeStep === s.number
          return (
            <button key={s.number} onClick={() => setActiveStep(s.number)}
              style={{
                flex: 1, padding: '14px 6px', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)',
                fontSize: 12, fontWeight: 700, lineHeight: 1.3,
                background: active ? 'var(--surface)' : 'transparent',
                color: done ? '#085041' : active ? 'var(--accent)' : 'var(--text3)',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                background: done ? '#E1F5EE' : active ? '#E1F5EE' : 'var(--surface2)',
                border: `2px solid ${done ? '#1D9E75' : active ? 'var(--accent)' : 'var(--border)'}`,
                color: done ? '#1D9E75' : active ? 'var(--accent)' : 'var(--text3)',
                fontWeight: 700,
              }}>
                {done ? '✓' : s.number}
              </div>
              {s.title.toUpperCase()}
            </button>
          )
        })}
      </div>

      {/* Step content */}
      {STEPS.map(s => {
        if (s.number !== activeStep) return null
        const done = !!userProg[s.number]
        return (
          <div key={s.number} style={{ padding: 24 }}>
            {/* Step header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{s.icon} {s.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>{s.description}</div>
              </div>
              {done && (
                <span style={{ flexShrink: 0, background: '#E1F5EE', color: '#085041', fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 99, border: '1px solid #9FE1CB', whiteSpace: 'nowrap' }}>
                  ✓ Approved
                </span>
              )}
            </div>

            {/* Step content area */}
            <div style={{ marginBottom: 20 }}>
              <StepContentArea step={s} targetUserId={user?.id} />
            </div>

            {/* Lab manager: approve / revoke */}
            {isStaff && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                {done ? (
                  <button onClick={() => onRevoke(user.id, s.number)} disabled={saving}
                    style={{ padding: '8px 18px', background: 'none', color: '#c84b2f', border: '1px solid #c84b2f', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
                    Revoke approval
                  </button>
                ) : (
                  <button onClick={() => onApprove(user.id, s.number)} disabled={saving}
                    style={{ padding: '9px 22px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
                    {saving ? 'Saving…' : `✓ Approve Step ${s.number}`}
                  </button>
                )}
              </div>
            )}

            {/* Lab user: waiting for approval notice */}
            {!isStaff && !done && (
              <div style={{ background: '#FEF3C7', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#92400e', lineHeight: 1.6, fontWeight: 500 }}>
                ⏳ Complete this step, then ask your lab manager to approve it for you.
              </div>
            )}
          </div>
        )
      })}

      {/* All steps approved — proceed banner */}
      {allApproved && (
        <div style={{ borderTop: '1px solid #9FE1CB', padding: '16px 24px', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#085041' }}>🎉 All 4 steps approved!</div>
            <div style={{ fontSize: 12, color: '#085041', marginTop: 2 }}>
              {isStaff
                ? `${user.nick_name?.trim() || user.name} can now upload their safety certificates in Training Records.`
                : 'You can now upload your safety certificates in Training Records.'}
            </div>
          </div>
          {!isStaff && (
            <button onClick={() => setScreen('training')}
              style={{ padding: '10px 20px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Upload Certificates →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component (used standalone and as Training Records tab) ───────────

export default function SafetyTab({ asTab = false }) {
  const { session } = useAppStore()
  const isStaff = session?.role === 'admin' || session?.role === 'user'
  const isLabUser = session?.role === 'lab_user'

  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      if (isStaff) {
        const [usersRes, progRes] = await Promise.all([
          sb.from('users')
            .select('id, name, last_name, nick_name, photo_url, avatar, email')
            .eq('organization_id', session.organizationId)
            .eq('role', 'lab_user')
            .eq('is_active', true)
            .order('name'),
          sb.from('lab_safety_progress')
            .select('user_id, step_number, completed')
            .eq('organization_id', session.organizationId),
        ])
        const allUsers = usersRes.data || []
        setUsers(allUsers)

        const progMap = {}
        ;(progRes.data || []).forEach(r => {
          if (!progMap[r.user_id]) progMap[r.user_id] = {}
          progMap[r.user_id][r.step_number] = r.completed
        })
        setProgress(progMap)

        if (allUsers.length === 1) setSelectedUser(allUsers[0])

      } else {
        const { data: prog } = await sb.from('lab_safety_progress')
          .select('step_number, completed')
          .eq('user_id', session.userId)
        const progMap = {}
        ;(prog || []).forEach(r => { progMap[r.step_number] = r.completed })
        setProgress({ [session.userId]: progMap })
        setSelectedUser({ id: session.userId, name: session.username, nick_name: session.username })
      }
    } catch (e) {
      console.error('LabSafety load error:', e)
    }
    setLoading(false)
  }

  async function approveStep(userId, stepNumber) {
    setSaving(true)
    try {
      const { error } = await sb.from('lab_safety_progress').upsert({
        user_id: userId,
        organization_id: session.organizationId,
        step_number: stepNumber,
        completed: true,
        approved_by: session.userId,
        approved_at: new Date().toISOString(),
      }, { onConflict: 'user_id,step_number' })
      if (!error) {
        setProgress(prev => ({
          ...prev,
          [userId]: { ...(prev[userId] || {}), [stepNumber]: true },
        }))
      }
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  async function revokeStep(userId, stepNumber) {
    setSaving(true)
    try {
      const { error } = await sb.from('lab_safety_progress').upsert({
        user_id: userId,
        organization_id: session.organizationId,
        step_number: stepNumber,
        completed: false,
        approved_by: null,
        approved_at: null,
      }, { onConflict: 'user_id,step_number' })
      if (!error) {
        setProgress(prev => ({
          ...prev,
          [userId]: { ...(prev[userId] || {}), [stepNumber]: false },
        }))
      }
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const filteredUsers = search.trim()
    ? users.filter(u => {
        const full = [u.nick_name, u.name, u.last_name].filter(Boolean).join(' ').toLowerCase()
        return full.includes(search.toLowerCase())
      })
    : users

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div style={asTab ? {} : { maxWidth: 1000, margin: '0 auto' }}>
      {!asTab && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', marginBottom: 4 }}>🦺 Safety Training</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            {isStaff
              ? 'Review lab users\' safety training progress and approve each step.'
              : 'Complete all 4 steps — your lab manager will approve each one before you proceed.'}
          </div>
        </div>
      )}

      {/* ── Lab user view — step panel only ── */}
      {isLabUser && selectedUser && (
        <StepPanel
          user={selectedUser}
          progress={progress}
          isStaff={false}
          onApprove={approveStep}
          onRevoke={revokeStep}
          saving={saving}
        />
      )}

      {/* ── Lab manager / admin view ── */}
      {isStaff && (
        <>
          {/* Search */}
          {users.length > 6 && (
            <div style={{ marginBottom: 16 }}>
              <input
                type="search"
                placeholder="Search lab users…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', maxWidth: 300, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--sans)', color: 'var(--text)', background: 'var(--surface)' }}
              />
            </div>
          )}

          {/* User card grid */}
          {filteredUsers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text3)', fontSize: 14, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 20 }}>
              {users.length === 0 ? 'No lab users in this organization yet.' : 'No results for your search.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 20 }}>
              {filteredUsers.map(u => (
                <UserSafetyCard
                  key={u.id}
                  user={u}
                  progress={progress}
                  selected={selectedUser?.id === u.id}
                  onClick={() => setSelectedUser(prev => prev?.id === u.id ? null : u)}
                />
              ))}
            </div>
          )}

          {/* Selected user step panel */}
          {selectedUser && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', marginBottom: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Steps for {[selectedUser.nick_name?.trim() || selectedUser.name, selectedUser.last_name].filter(Boolean).join(' ')}
              </div>
              <StepPanel
                user={selectedUser}
                progress={progress}
                isStaff={true}
                onApprove={approveStep}
                onRevoke={revokeStep}
                saving={saving}
              />
            </div>
          )}

          {/* Hint when no user selected and multiple users */}
          {!selectedUser && filteredUsers.length > 1 && (
            <div style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--text3)', fontSize: 14, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
              Select a lab user above to review and approve their safety steps.
            </div>
          )}
        </>
      )}
    </div>
  )
}
