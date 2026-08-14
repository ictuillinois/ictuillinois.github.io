import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import { buildEmailHtml } from '../../lib/emailTemplate'

async function sendTrainingEmail(userId, prefKey, subject, title, body) {
  if (!userId) return
  const { data: prefs } = await sb.from('notification_prefs').select('*').eq('user_id', userId).maybeSingle()
  if (!prefs || prefs[`email_${prefKey}`] !== true) return
  const { data: user } = await sb.from('users').select('phone, email, organization_id').eq('id', userId).maybeSingle()
  const toEmail = user?.phone || user?.email
  if (!toEmail) return
  let orgContact = null
  if (user?.organization_id) {
    const { data: org } = await sb.from('organizations').select('contact_name, contact_email').eq('id', user.organization_id).maybeSingle()
    orgContact = org
  }
  const htmlBody = buildEmailHtml({ title, body, ctaLabel: 'View Training in ICT-Lab →', ctaUrl: 'https://ictlab.app/?screen=training', prefsUrl: 'https://ictlab.app/?screen=profile', orgContact })
  const { error } = await sb.from('email_notifications_queue').insert({ to_email: toEmail, subject, body, html_body: htmlBody, user_id: userId, type: prefKey })
  if (error) console.warn('Training email queue failed:', error.message)
}

function canEdit(s) { return s?.role === 'admin' || s?.role === 'user' }

function fmtDT(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ══════════════════════════════════════════════════════════════
// TRAINING REQUESTS PANEL (admin/staff view in Training Records)
// forUserId: only show requests from that user (hub Equipment tab,
// "This user" mode). compact: small empty state instead of the big one.
// ══════════════════════════════════════════════════════════════
export function TrainingRequestsPanel({ session, forUserId = null, compact = false }) {
  const { toast } = useAppStore()
  const [requests, setRequests] = useState([])
  const [schedules, setSchedules] = useState([])
  const [equipment, setEquipment] = useState([])
  const [examEqIds, setExamEqIds] = useState(new Set()) // equipment_ids that have exam questions
  const [loading, setLoading] = useState(true)
  const [proposing, setProposing] = useState(null) // request being scheduled
  const [proposeDate, setProposeDate] = useState('')
  const [proposeNotes, setProposeNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const orgId = session?.organizationId
    let retQ = sb.from('retraining_requests').select('*').order('id', { ascending: false })
    let schedQ = sb.from('training_schedule').select('*').order('created_at', { ascending: false })
    let eqQ = sb.from('equipment_inventory').select('id, equipment_name, nickname, requires_exam').eq('is_active', true)
    if (orgId) { retQ = retQ.eq('organization_id', orgId); schedQ = schedQ.eq('organization_id', orgId); eqQ = eqQ.eq('organization_id', orgId) }
    const [{ data: reqs }, { data: sched }, { data: eq }, { data: examRows }] = await Promise.all([
      retQ, schedQ, eqQ,
      sb.from('equipment_exam_questions').select('equipment_id'),
    ])
    setRequests(reqs || [])
    setSchedules(sched || [])
    setEquipment(eq || [])
    setExamEqIds(new Set((examRows || []).map(r => r.equipment_id)))
    setLoading(false)
  }

  async function approveDirectly(req) {
    setSaving(true)
    const eqName = req.equipment_name || equipment.find(e => e.id === req.equipment_id)?.nickname || 'equipment'
    const { error } = await sb.from('training_equipment').insert({
      user_id: req.user_id, equipment_id: req.equipment_id,
      trained_date: new Date().toISOString().split('T')[0],
      trained_by: session.username, passed_exam: true,
    })
    if (error) { toast('Error: ' + error.message); setSaving(false); return }
    await sb.from('retraining_requests').delete().eq('id', req.id)
    await sb.from('notifications').insert({
      user_id: req.user_id, type: 'training_approved',
      title: `Training approved: ${eqName}`,
      body: `${session.username} approved your training. You can now book this equipment.`,
      read: false,
    }).catch(() => {})
    toast('Training approved ✓')
    setSaving(false); load()
  }

  function getSchedule(requestId) {
    return schedules.find(s => s.request_id === requestId)
  }

  async function proposeTrainingDate(req) {
    if (!proposeDate) { toast('Select a date and time.'); return }
    setSaving(true)
    const sched = getSchedule(req.id)
    const payload = {
      request_id: req.id, user_id: req.user_id,
      equipment_id: req.equipment_id,
      proposed_by: session.username,
      proposed_date: new Date(proposeDate).toISOString(),
      status: 'proposed', notes: proposeNotes || null,
      updated_at: new Date().toISOString(),
      organization_id: session?.organizationId || null,
    }
    let schedErr
    if (sched) {
      const { error } = await sb.from('training_schedule').update(payload).eq('id', sched.id)
      schedErr = error
    } else {
      const { error } = await sb.from('training_schedule').insert(payload)
      schedErr = error
    }
    if (schedErr) { toast('Error saving schedule: ' + schedErr.message); setSaving(false); return }

    // Remove the request once a date is scheduled
    await sb.from('retraining_requests').delete().eq('id', req.id)

    // Notify user — in-app + email
    const notifMsg = `Training scheduled for ${req.equipment_name} on ${fmtDT(proposeDate)} by ${session.username}. Please review the SOP and training videos before your session.`
    const { error: notifErr } = await sb.from('booking_notifications').insert({
      booking_id: null, user_id: req.user_id, type: 'training_scheduled',
      message: notifMsg, read: false,
    })
    if (notifErr) console.warn('Notification insert failed:', notifErr.message)
    await sendTrainingEmail(req.user_id, 'training_approved', `Training scheduled — ${req.equipment_name}`, 'Your training has been scheduled', notifMsg)
    toast('Training date scheduled ✓')
    setProposing(null); setProposeDate(''); setProposeNotes('')
    setSaving(false); load()
  }

  async function confirmSchedule(sched) {
    await sb.from('training_schedule').update({ status: 'confirmed', confirmed_date: sched.counter_date || sched.proposed_date, updated_at: new Date().toISOString() }).eq('id', sched.id)
    const eq = equipment.find(e => e.id === sched.equipment_id)
    const eqName = eq?.nickname || eq?.equipment_name || 'equipment'
    const when = fmtDT(sched.counter_date || sched.proposed_date)
    const msg = `Training confirmed for ${eqName} on ${when}. Please review the SOP and training videos before your session.`
    await sb.from('booking_notifications').insert({ booking_id: null, user_id: sched.user_id, type: 'training_confirmed', message: msg, read: false })
    await sendTrainingEmail(sched.user_id, 'training_approved', `Training confirmed — ${eqName}`, 'Your training has been confirmed', msg)
    toast('Training confirmed ✓'); load()
  }

  // Filter at render time so switching the selected user doesn't refetch
  const visible = forUserId ? requests.filter(r => String(r.user_id) === String(forUserId)) : requests
  const pending = visible.filter(r => r.status === 'pending')
  const others = visible.filter(r => r.status !== 'pending')

  if (loading) return <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      {/* Pending requests */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: '#92400e' }}>
            ⏳ Pending training requests ({pending.length})
          </div>
          {pending.map(req => {
            const sched = getSchedule(req.id)
            const eq = equipment.find(e => e.id === req.equipment_id)
            return (
              <div key={req.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{req.user_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                      {eq?.nickname || req.equipment_name}{req.requested_at ? ` · Requested ${new Date(req.requested_at).toLocaleDateString()}` : ''}
                      {req.notes && <span> · "{req.notes}"</span>}
                    </div>
                  </div>
                  <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>Pending</span>
                </div>

                {/* Schedule status */}
                {sched && (
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 13 }}>
                    {sched.status === 'proposed' && <div style={{ color: '#0369a1' }}>📅 Proposed: <strong>{fmtDT(sched.proposed_date)}</strong> — awaiting user response</div>}
                    {sched.status === 'countered' && (
                      <div>
                        <div style={{ color: '#92400e' }}>🔄 User proposed: <strong>{fmtDT(sched.counter_date)}</strong></div>
                        <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>Original: {fmtDT(sched.proposed_date)}</div>
                        <button className="btn btn-sm btn-primary" style={{ marginTop: 8 }} onClick={() => confirmSchedule(sched)}>✓ Accept user's time</button>
                      </div>
                    )}
                    {sched.status === 'confirmed' && <div style={{ color: '#085041' }}>✓ Confirmed: <strong>{fmtDT(sched.confirmed_date)}</strong></div>}
                  </div>
                )}

                {/* Propose date form */}
                {proposing?.id === req.id ? (
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12 }}>
                    <div className="field" style={{ marginBottom: 8 }}>
                      <label>Proposed training date & time</label>
                      <input type="datetime-local" value={proposeDate} onChange={e => setProposeDate(e.target.value)} />
                    </div>
                    <div className="field" style={{ marginBottom: 8 }}>
                      <label>Notes (optional)</label>
                      <input value={proposeNotes} onChange={e => setProposeNotes(e.target.value)} placeholder="e.g. Meet at Binder Lab" />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => proposeTrainingDate(req)} disabled={saving}>{saving ? 'Saving…' : 'Propose date'}</button>
                      <button className="btn btn-sm" onClick={() => setProposing(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-primary" onClick={() => { setProposing(req); setProposeDate(''); setProposeNotes('') }}>
                      📅 {sched ? 'Change date' : 'Propose training date'}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={async () => {
                      await sb.from('retraining_requests').update({ status: 'denied', reviewed_by: session.username, reviewed_at: new Date().toISOString() }).eq('id', req.id)
                      toast('Request denied.'); load()
                    }}>✕ Deny</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* History */}
      {others.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: 'var(--text2)' }}>History</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: 13 }}>
              <thead><tr><th>User</th><th>Equipment</th><th>Requested</th><th>Status</th><th>Training Date</th><th>Reviewed By</th></tr></thead>
              <tbody>
                {others.map(req => {
                  const sched = getSchedule(req.id)
                  const eq = equipment.find(e => e.id === req.equipment_id)
                  return (
                    <tr key={req.id}>
                      <td style={{ fontWeight: 500 }}>{req.user_name}</td>
                      <td>{eq?.nickname || req.equipment_name}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{new Date(req.requested_at).toLocaleDateString()}</td>
                      <td><span style={{ background: req.status === 'approved' ? '#E1F5EE' : '#fcebeb', color: req.status === 'approved' ? '#085041' : '#a32d2d', borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>{req.status}</span></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{sched ? fmtDT(sched.confirmed_date || sched.proposed_date) : '—'}</td>
                      <td style={{ color: 'var(--text3)' }}>{req.reviewed_by || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pending.length === 0 && others.length === 0 && (
        compact
          ? <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>No training requests{forUserId ? ' from this user' : ''} yet.</div>
          : <div className="empty-state"><div className="empty-icon">📋</div>No training requests yet.</div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// USER SCHEDULE RESPONSE (student view)
// ══════════════════════════════════════════════════════════════
export function UserTrainingSchedule({ session }) {
  const { toast } = useAppStore()
  const [schedules, setSchedules] = useState([])
  const [requests, setRequests] = useState([])
  const [equipment, setEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [counterDate, setCounterDate] = useState({})
  const [dismissed, setDismissed] = useState(() => new Set(JSON.parse(localStorage.getItem(`ilab_dismissed_sched_${session?.userId}`) || '[]')))

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: sched }, { data: reqs }, { data: eq }] = await Promise.all([
      sb.from('training_schedule').select('*').eq('user_id', session.userId).order('created_at', { ascending: false }),
      sb.from('retraining_requests').select('*').eq('user_id', session.userId).eq('status', 'pending').order('requested_at', { ascending: false }),
      sb.from('equipment_inventory').select('id, equipment_name, nickname').eq('is_active', true),
    ])
    setSchedules(sched || [])
    setRequests(reqs || [])
    setEquipment(eq || [])
    setLoading(false)
  }

  function dismissConfirmed(id) {
    const next = new Set([...dismissed, id])
    setDismissed(next)
    localStorage.setItem(`ilab_dismissed_sched_${session?.userId}`, JSON.stringify([...next]))
  }

  async function acceptDate(sched) {
    const { error: updateErr } = await sb.from('training_schedule')
      .update({ status: 'confirmed', confirmed_date: sched.proposed_date, updated_at: new Date().toISOString() })
      .eq('id', sched.id)
    if (updateErr) { toast('Could not accept: ' + updateErr.message); return }
    const eq = equipment.find(e => e.id === sched.equipment_id)
    const eqName = eq?.nickname || eq?.equipment_name || 'equipment'
    const orgId = session?.organizationId
    // Notify managers
    if (orgId) {
      sb.from('users').select('id')
        .eq('organization_id', orgId).in('role', ['user', 'admin']).eq('is_active', true)
        .then(({ data: managers }) => {
          if (managers?.length) {
            sb.from('notifications').insert(managers.map(m => ({
              user_id: m.id, type: 'training_request',
              title: `${session.username} accepted training time`,
              body: `${eqName} training on ${fmtDT(sched.proposed_date)} confirmed.`,
              read: false,
            }))).catch(() => {})
          }
        })
    }
    // Notify the lab user themselves
    sb.from('notifications').insert({
      user_id: session.userId, type: 'training_confirmed',
      title: `Training confirmed: ${eqName}`,
      body: `Your training for ${eqName} on ${fmtDT(sched.proposed_date)} is confirmed.`,
      read: false,
    }).catch(() => {})
    toast('Training date accepted ✓'); load()
  }

  async function proposeCounter(sched) {
    const date = counterDate[sched.id]
    if (!date) { toast('Select a date.'); return }
    await sb.from('training_schedule').update({ status: 'countered', counter_date: new Date(date).toISOString(), updated_at: new Date().toISOString() }).eq('id', sched.id)
    // Notify managers of the counter-proposal
    const eq = equipment.find(e => e.id === sched.equipment_id)
    const eqName = eq?.nickname || eq?.equipment_name || 'equipment'
    const orgId = session?.organizationId
    if (orgId) {
      sb.from('users').select('id').eq('organization_id', orgId).in('role', ['user', 'admin']).eq('is_active', true)
        .then(({ data: managers }) => {
          if (managers?.length) {
            sb.from('notifications').insert(managers.map(m => ({
              user_id: m.id, type: 'training_request',
              title: `${session.username} proposed a new training time`,
              body: `New time proposed for ${eqName}: ${fmtDT(new Date(date))}.`,
              read: false,
            }))).catch(() => {})
          }
        })
    }
    toast('Counter-proposal sent ✓')
    setCounterDate(d => ({ ...d, [sched.id]: '' })); load()
  }

  const pending = schedules.filter(s => s.status === 'proposed' || s.status === 'countered')
  const confirmed = schedules.filter(s => s.status === 'confirmed')

  if (loading) return <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (schedules.length === 0 && requests.length === 0) return null

  return (
    <div style={{ marginBottom: 20 }}>
      {requests.map(req => {
        const eq = equipment.find(e => e.id === req.equipment_id)
        return (
          <div key={req.id} style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#92400e', marginBottom: 4 }}>
              ⏳ Training requested: {eq?.nickname || req.equipment_name}
            </div>
            <div style={{ fontSize: 13, color: '#92400e' }}>
              {req.requested_at ? `Submitted ${new Date(req.requested_at).toLocaleDateString()} — ` : ''}awaiting a training date from your lab manager.
            </div>
          </div>
        )
      })}
      {pending.map(sched => {
        const eq = equipment.find(e => e.id === sched.equipment_id)
        return (
          <div key={sched.id} style={{ background: '#e0f2fe', border: '1px solid #7dd3fc', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#0369a1', marginBottom: 8 }}>
              📅 Training scheduled: {eq?.nickname || eq?.equipment_name}
            </div>
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              <strong>{sched.proposed_by}</strong> proposed: <strong>{fmtDT(sched.proposed_date)}</strong>
              {sched.notes && <div style={{ color: 'var(--text3)', marginTop: 4 }}>Note: {sched.notes}</div>}
              {sched.status === 'countered' && <div style={{ color: '#92400e', marginTop: 4, fontStyle: 'italic' }}>Your counter-proposal is awaiting confirmation from the lab manager.</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {sched.status !== 'countered' && (
                <button className="btn btn-sm btn-primary" onClick={() => acceptDate(sched)}>✓ Accept the time</button>
              )}
              {counterDate[sched.id] !== undefined ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                  <input type="datetime-local" value={counterDate[sched.id]} onChange={e => setCounterDate(d => ({ ...d, [sched.id]: e.target.value }))} style={{ fontSize: 13 }} />
                  <button className="btn btn-sm btn-primary" onClick={() => proposeCounter(sched)}>Send</button>
                  <button className="btn btn-sm" onClick={() => setCounterDate(d => { const n = { ...d }; delete n[sched.id]; return n })}>Cancel</button>
                </div>
              ) : (
                <button className="btn btn-sm" onClick={() => setCounterDate(d => ({ ...d, [sched.id]: '' }))}>
                  ✗ Deny & propose another time
                </button>
              )}
            </div>
          </div>
        )
      })}
      {confirmed.filter(s => !dismissed.has(s.id)).map(sched => {
        const eq = equipment.find(e => e.id === sched.equipment_id)
        return (
          <div key={sched.id} style={{ background: '#E1F5EE', border: '1px solid #9FE1CB', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 12, position: 'relative' }}>
            <button onClick={() => dismissConfirmed(sched.id)} style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#085041', opacity: 0.5, lineHeight: 1, padding: 4 }} title="Dismiss">✕</button>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#085041', marginBottom: 4, paddingRight: 24 }}>
              ✓ Training confirmed: {eq?.nickname || eq?.equipment_name}
            </div>
            <div style={{ fontSize: 13, color: '#085041' }}>
              {fmtDT(sched.confirmed_date)} — Please review the SOP and training videos before your session.
            </div>
            <a href="#" onClick={e => {
                e.preventDefault()
                localStorage.setItem('selectEquipment', sched.equipment_id)
                useAppStore.getState().setScreen('equipmenthub')
              }}
              style={{ fontSize: 13, color: 'var(--accent)', display: 'block', marginTop: 8, textDecoration: 'none', fontWeight: 500 }}>
              → Go to Equipment page to review materials
            </a>
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// EXAM SYSTEM
// ══════════════════════════════════════════════════════════════
// ── PDF/Word Question Uploader (AI-powered) ──────────────────
function PdfQuestionUploader({ equipmentId, onImported }) {
  const { toast } = useAppStore()
  const [file, setFile] = useState(null)
  const [extracting, setExtracting] = useState(false)
  const [preview, setPreview] = useState(null)
  const fileRef = useRef(null)

  async function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target.result)
      reader.onerror = reject
      if (file.name.endsWith('.pdf')) {
        // Read as base64 for PDF
        reader.readAsDataURL(file)
      } else {
        reader.readAsText(file)
      }
    })
  }

  async function extractQuestions() {
    if (!file) return
    setExtracting(true)
    try {
      const fileContent = await readFileText(file)
      const isBase64 = fileContent.startsWith('data:')

      const messages = isBase64
        ? [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileContent.split(',')[1] } },
            { type: 'text', text: 'Extract all exam questions from this document. Return ONLY a JSON array with no markdown. Each object must have: question (string), option_a, option_b, option_c, option_d (strings), correct_answer ("a","b","c", or "d"). If the correct answer is marked/highlighted, use it. If not, make your best guess based on context.' }
          ]}]
        : [{ role: 'user', content: `Extract all exam questions from this text. Return ONLY a JSON array with no markdown. Each object: { question, option_a, option_b, option_c, option_d, correct_answer }. Correct answer must be "a","b","c", or "d".

Text:
${fileContent.slice(0, 8000)}` }]

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, messages })
      })
      const data = await response.json()
      const text = data.content?.map(c => c.text || '').join('') || ''
      const clean = text.replace(/```json|```/g, '').trim()
      const questions = JSON.parse(clean)
      if (!Array.isArray(questions) || questions.length === 0) throw new Error('No questions found')
      setPreview(questions)
      toast(`Found ${questions.length} questions — review and import.`)
    } catch (e) {
      console.error(e)
      toast('Could not extract questions. Make sure the file has numbered questions with A/B/C/D options.')
    }
    setExtracting(false)
  }

  async function importQuestions() {
    if (!preview?.length) return
    let count = 0
    for (let i = 0; i < preview.length; i++) {
      const q = preview[i]
      if (!q.question) continue
      await sb.from('equipment_exam_questions').insert({
        equipment_id: equipmentId,
        question: q.question, option_a: q.option_a||'', option_b: q.option_b||'',
        option_c: q.option_c||'', option_d: q.option_d||'',
        correct_answer: (q.correct_answer||'a').toLowerCase().charAt(0),
        order_num: i,
      })
      count++
    }
    toast(`${count} questions imported ✓`)
    setPreview(null); setFile(null)
    onImported()
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }}
        onChange={e => { setFile(e.target.files[0]); setPreview(null) }} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: preview ? 16 : 0 }}>
        <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
          📁 {file ? file.name : 'Choose file'}
        </button>
        {file && (
          <button className="btn btn-sm btn-primary" onClick={extractQuestions} disabled={extracting}>
            {extracting ? '⏳ Extracting questions…' : '✨ Extract questions with AI'}
          </button>
        )}
        {file && <button className="btn btn-sm" onClick={() => { setFile(null); setPreview(null) }}>✕</button>}
      </div>

      {preview && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--accent)' }}>
            Preview — {preview.length} questions found
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            {preview.map((q, i) => (
              <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < preview.length-1 ? '1px solid var(--surface2)' : 'none' }}>
                <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>Q{i+1}: {q.question}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  {['a','b','c','d'].map(opt => q[`option_${opt}`] && (
                    <div key={opt} style={{ color: q.correct_answer?.toLowerCase() === opt ? '#085041' : 'inherit', fontWeight: q.correct_answer?.toLowerCase() === opt ? 600 : 400 }}>
                      {opt.toUpperCase()}. {q[`option_${opt}`]} {q.correct_answer?.toLowerCase() === opt && '✓'}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={importQuestions}>Import all {preview.length} questions</button>
            <button className="btn btn-sm" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ExamTab({ session }) {
  const { toast } = useAppStore()
  const [equipment, setEquipment] = useState([])
  const [selectedEq, setSelectedEq] = useState(null)
  const [questions, setQuestions] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [examMode, setExamMode] = useState(false)
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(null)
  const [editQuestion, setEditQuestion] = useState(null)
  const [newQ, setNewQ] = useState({ question: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'a' })
  const [progress, setProgress] = useState(null)
  const [requiresExam, setRequiresExam] = useState(null)

  const isAdminStaff = canEdit(session)

  useEffect(() => { loadEquipment() }, [])
  useEffect(() => { if (selectedEq) loadEquipmentData() }, [selectedEq])

  async function loadEquipment() {
    setLoading(true)
    let eqQ = sb.from('equipment_inventory').select('id, equipment_name, nickname').eq('is_active', true).order('nickname')
    if (session?.organizationId) eqQ = eqQ.eq('organization_id', session.organizationId)
    const { data: eq } = await eqQ
    setEquipment(eq || [])

    // Auto-select from localStorage (coming from Equipment page CTA)
    const autoEq = localStorage.getItem('examEquipment')
    if (autoEq) {
      localStorage.removeItem('examEquipment')
      setSelectedEq(autoEq)
      setLoading(false)
      return
    }
    // For students, show equipment they're scheduled to train on
    if (!isAdminStaff && session.userId) {
      const { data: sched } = await sb.from('training_schedule')
        .select('equipment_id').eq('user_id', session.userId).eq('status', 'confirmed')
      if (sched?.length) setSelectedEq(sched[0].equipment_id)
    }
    setLoading(false)
  }

  async function loadEquipmentData() {
    const [{ data: q }, { data: r }, { data: p }, { data: eqInfo }] = await Promise.all([
      sb.from('equipment_exam_questions').select('*').eq('equipment_id', selectedEq).order('order_num'),
      sb.from('equipment_exam_results').select('*, users(name)').eq('equipment_id', selectedEq).order('taken_at', { ascending: false }),
      session.userId ? sb.from('equipment_material_progress').select('*').eq('user_id', session.userId).eq('equipment_id', selectedEq).maybeSingle() : { data: null },
      sb.from('equipment_inventory').select('requires_exam').eq('id', selectedEq).maybeSingle(),
    ])
    setQuestions(q || [])
    setResults(r || [])
    setProgress(p || null)
    setRequiresExam(eqInfo?.requires_exam ?? null)
  }

  async function saveRequiresExam(val) {
    await sb.from('equipment_inventory').update({ requires_exam: val }).eq('id', selectedEq)
    setRequiresExam(val)
    toast(val === false ? 'Exam not required — training requests will be auto-approved.' : 'Exam required saved.')
  }

  async function saveQuestion() {
    if (!newQ.question.trim()) { toast('Question required.'); return }
    if (editQuestion) {
      await sb.from('equipment_exam_questions').update({ ...newQ, order_num: editQuestion.order_num }).eq('id', editQuestion.id)
    } else {
      await sb.from('equipment_exam_questions').insert({ ...newQ, equipment_id: selectedEq, order_num: questions.length })
    }
    setNewQ({ question: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'a' })
    setEditQuestion(null); loadEquipmentData(); toast('Question saved.')
  }

  async function deleteQuestion(id) {
    if (!confirm('Delete this question?')) return
    await sb.from('equipment_exam_questions').delete().eq('id', id)
    loadEquipmentData(); toast('Question deleted.')
  }

  async function markProgress(field) {
    const payload = { user_id: session.userId, equipment_id: selectedEq, [field]: true, updated_at: new Date().toISOString() }
    await sb.from('equipment_material_progress').upsert(payload, { onConflict: 'user_id,equipment_id' })
    loadEquipmentData()
  }

  async function submitExam() {
    let score = 0
    questions.forEach(q => { if (answers[q.id] === q.correct_answer) score++ })
    const passed = score >= Math.ceil(questions.length * 0.7) // 70% to pass
    await sb.from('equipment_exam_results').insert({
      user_id: session.userId, equipment_id: selectedEq,
      score, total: questions.length, passed, answers,
      organization_id: session?.organizationId || null,
    })
    // Mark progress
    await sb.from('equipment_material_progress').upsert({
      user_id: session.userId, equipment_id: selectedEq,
      confirmed_ready: true, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,equipment_id' })
    setSubmitted({ score, total: questions.length, passed })
    setExamMode(false); loadEquipmentData()
    toast(passed ? '✓ Exam passed!' : 'Exam not passed. You can retake it.')
    // Notify managers when exam is passed
    if (passed) {
      const orgId = session?.organizationId
      const eq = equipment.find(e => e.id === selectedEq)
      const eqName = eq?.nickname || eq?.equipment_name || 'equipment'
      if (orgId) {
        sb.from('users').select('id').eq('organization_id', orgId).in('role', ['user', 'admin']).eq('is_active', true)
          .then(({ data: managers }) => {
            if (managers?.length) {
              sb.from('notifications').insert(managers.map(m => ({
                user_id: m.id, type: 'training_request',
                title: `${session.username} passed the exam for ${eqName}`,
                body: 'Review and approve their training in Training Records → Equipment tab.',
                read: false,
              }))).catch(() => {})
            }
          })
      }
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  const myResults = isAdminStaff ? results : results.filter(r => r.user_id === session.userId)
  const latestResult = myResults[0]

  return (
    <div>
      {/* Equipment selector */}
      <div className="field" style={{ maxWidth: 400, marginBottom: 20 }}>
        <label>Select Equipment</label>
        <select value={selectedEq || ''} onChange={e => { setSelectedEq(e.target.value); setExamMode(false); setSubmitted(null); setAnswers({}) }}>
          <option value="">— Select —</option>
          {equipment.map(e => <option key={e.id} value={e.id}>{e.nickname || e.equipment_name}</option>)}
        </select>
      </div>

      {selectedEq && (
        <div>
          {/* Admin: manage questions + see all results */}
          {isAdminStaff && (
            <div>
              {/* Exam requirement toggle */}
              <div className="card" style={{ marginBottom: 16, background: requiresExam === false ? '#fefce8' : 'var(--surface)', borderColor: requiresExam === false ? '#fcd34d' : 'var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={requiresExam !== false}
                    onChange={e => saveRequiresExam(e.target.checked ? null : false)}
                    style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>This equipment requires an exam before training</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                      {requiresExam === false
                        ? 'Exam not required — training requests will be approved directly without scheduling an exam.'
                        : 'Students must pass an exam before their training can be approved.'}
                    </div>
                  </div>
                </label>
              </div>

              {requiresExam !== false && (
              <div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>📝 Exam Questions</div>

                  {/* PDF Upload to extract questions */}
              <div className="card" style={{ marginBottom: 16, borderColor: 'var(--accent)' }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>📄 Upload exam file (PDF or Word)</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
                  Upload a PDF or Word document with exam questions. The AI will extract and format them automatically.
                  Format: numbered questions with A/B/C/D options and mark the correct answer.
                </div>
                <PdfQuestionUploader equipmentId={selectedEq} onImported={loadEquipmentData} />
              </div>

              {/* Add/Edit question manually */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 10 }}>{editQuestion ? '✏️ Edit question' : '+ Add question manually'}</div>
                <div className="field"><label>Question *</label><textarea rows={2} value={newQ.question} onChange={e => setNewQ(f => ({ ...f, question: e.target.value }))} style={{ resize: 'vertical' }} /></div>
                <div className="grid-2">
                  <div className="field"><label>Option A</label><input value={newQ.option_a} onChange={e => setNewQ(f => ({ ...f, option_a: e.target.value }))} /></div>
                  <div className="field"><label>Option B</label><input value={newQ.option_b} onChange={e => setNewQ(f => ({ ...f, option_b: e.target.value }))} /></div>
                  <div className="field"><label>Option C</label><input value={newQ.option_c} onChange={e => setNewQ(f => ({ ...f, option_c: e.target.value }))} /></div>
                  <div className="field"><label>Option D</label><input value={newQ.option_d} onChange={e => setNewQ(f => ({ ...f, option_d: e.target.value }))} /></div>
                </div>
                <div className="field">
                  <label>Correct Answer</label>
                  <select value={newQ.correct_answer} onChange={e => setNewQ(f => ({ ...f, correct_answer: e.target.value }))} style={{ width: 'auto' }}>
                    <option value="a">A</option><option value="b">B</option><option value="c">C</option><option value="d">D</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveQuestion}>Save question</button>
                  {editQuestion && <button className="btn btn-sm" onClick={() => { setEditQuestion(null); setNewQ({ question: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'a' }) }}>Cancel</button>}
                </div>
              </div>

              {/* Questions list */}
              {questions.map((q, i) => (
                <div key={q.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>Q{i+1}: {q.question}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => { setEditQuestion(q); setNewQ({ question: q.question, option_a: q.option_a||'', option_b: q.option_b||'', option_c: q.option_c||'', option_d: q.option_d||'', correct_answer: q.correct_answer||'a' }) }}>Edit</button>
                      <button className="btn btn-sm btn-danger" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => deleteQuestion(q.id)}>✕</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {['a','b','c','d'].map(opt => q[`option_${opt}`] && (
                      <div key={opt} style={{ color: q.correct_answer === opt ? '#085041' : 'var(--text2)', fontWeight: q.correct_answer === opt ? 600 : 400 }}>
                        {opt.toUpperCase()}. {q[`option_${opt}`]} {q.correct_answer === opt && '✓'}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Exam results from all users */}
              {results.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>📊 Exam Results</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ fontSize: 13 }}>
                      <thead><tr><th>User</th><th>Score</th><th>Result</th><th>Date</th></tr></thead>
                      <tbody>
                        {results.map(r => (
                          <tr key={r.id}>
                            <td style={{ fontWeight: 500 }}>{r.users?.name || (r.user_id === session.userId ? session.username : '—')}</td>
                            <td style={{ fontFamily: 'var(--mono)' }}>{r.score}/{r.total} ({Math.round(r.score/r.total*100)}%)</td>
                            <td><span style={{ background: r.passed ? '#E1F5EE' : '#fcebeb', color: r.passed ? '#085041' : '#a32d2d', borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>{r.passed ? 'Passed' : 'Failed'}</span></td>
                            <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{new Date(r.taken_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            )}
            </div>
          )}

          {/* Student: material checklist + exam */}
          {!isAdminStaff && (
            <div>
              {/* Material progress checklist */}
              {!examMode && !submitted && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>📚 Before you start the exam</div>
                  {requiresExam === false ? (
                    <div style={{ fontSize: 13, color: '#085041', marginTop: 8, padding: '8px 0' }}>
                      Your lab manager will review your training request and approve your training directly. No exam is required for this equipment — you will be notified once your training is approved.
                    </div>
                  ) : (
                  <>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
                    Confirm you have reviewed all training materials for <strong>{equipment.find(e => e.id === selectedEq)?.nickname || equipment.find(e => e.id === selectedEq)?.equipment_name}</strong>.
                  </div>

                  {/* Checklist items */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                    {[
                      { key: 'watched_video', icon: '🎬', label: 'I have watched the training videos', sub: 'Available in the Equipment page under Training Videos' },
                      { key: 'downloaded_sop', icon: '📄', label: 'I have read the SOP document', sub: 'Available in the Equipment page under Standard Operating Procedure' },
                    ].map(item => (
                      <label key={item.key} onClick={() => !progress?.[item.key] && markProgress(item.key)}
                        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 10, border: `2px solid ${progress?.[item.key] ? 'var(--accent)' : 'var(--border)'}`, background: progress?.[item.key] ? 'var(--accent-light)' : 'var(--surface2)', cursor: progress?.[item.key] ? 'default' : 'pointer', transition: 'all 0.2s', marginBottom: 0 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: progress?.[item.key] ? 'var(--accent)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>
                          {progress?.[item.key] ? '✓' : item.icon}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: progress?.[item.key] ? 'var(--accent)' : 'var(--text)' }}>{item.label}</div>
                          {!progress?.[item.key] && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{item.sub}</div>}
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Start exam button */}
                  {progress?.watched_video && progress?.downloaded_sop ? (
                    questions.length > 0 ? (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 13, color: '#085041', marginBottom: 12 }}>✓ All materials reviewed — you are ready!</div>
                        <button className="btn btn-primary" style={{ fontSize: 15, padding: '10px 32px' }} onClick={() => setExamMode(true)}>
                          📝 Start Exam ({questions.length} questions)
                        </button>
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>Passing score: 70%</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: '#085041', fontStyle: 'italic', textAlign: 'center' }}>A lab manager will review and approve your training.</div>
                    )
                  ) : (
                    <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
                      Please confirm both items above to unlock the exam.
                    </div>
                  )}
                  </>
                  )}
                </div>
              )}

              {/* Latest result */}
              {latestResult && !examMode && !submitted && (
                <div style={{ background: latestResult.passed ? '#E1F5EE' : '#fcebeb', border: `1px solid ${latestResult.passed ? '#9FE1CB' : '#f09595'}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, color: latestResult.passed ? '#085041' : '#a32d2d' }}>
                    {latestResult.passed ? '✓ Exam passed' : '✕ Exam not passed'} — {latestResult.score}/{latestResult.total} ({Math.round(latestResult.score/latestResult.total*100)}%)
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Taken {new Date(latestResult.taken_at).toLocaleDateString()}</div>
                  {!latestResult.passed && questions.length > 0 && <button className="btn btn-sm btn-primary" style={{ marginTop: 8 }} onClick={() => { setExamMode(true); setAnswers({}) }}>Retake exam</button>}
                </div>
              )}

              {/* Exam questions */}
              {examMode && !submitted && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>📝 Exam — {equipment.find(e => e.id === selectedEq)?.nickname}</div>
                  {questions.map((q, i) => (
                    <div key={q.id} className="card" style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 12 }}>Q{i+1}: {q.question}</div>
                      {['a','b','c','d'].map(opt => q[`option_${opt}`] && (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 6, background: answers[q.id] === opt ? 'var(--accent-light)' : 'var(--surface2)', border: `1px solid ${answers[q.id] === opt ? 'var(--accent)' : 'var(--border)'}` }}>
                          <input type="radio" name={q.id} value={opt} checked={answers[q.id] === opt} onChange={() => setAnswers(a => ({ ...a, [q.id]: opt }))} style={{ width: 'auto' }} />
                          <span style={{ fontSize: 13 }}><strong>{opt.toUpperCase()}.</strong> {q[`option_${opt}`]}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-primary" onClick={submitExam} disabled={Object.keys(answers).length < questions.length}>
                      Submit exam ({Object.keys(answers).length}/{questions.length} answered)
                    </button>
                    <button className="btn" onClick={() => setExamMode(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Result after submit */}
              {submitted && (
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <div style={{ fontSize: 56, marginBottom: 12 }}>{submitted.passed ? '🎉' : '📚'}</div>
                  <div style={{ fontWeight: 700, fontSize: 24, color: submitted.passed ? '#085041' : '#a32d2d', marginBottom: 12 }}>
                    {submitted.passed ? 'Exam Passed!' : 'Not Passed'}
                  </div>
                  {/* Grade circle */}
                  <div style={{ width: 100, height: 100, borderRadius: '50%', background: submitted.passed ? '#E1F5EE' : '#fcebeb', border: `4px solid ${submitted.passed ? '#085041' : '#a32d2d'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <div style={{ fontWeight: 700, fontSize: 24, color: submitted.passed ? '#085041' : '#a32d2d' }}>{Math.round(submitted.score/submitted.total*100)}%</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{submitted.score}/{submitted.total}</div>
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 6 }}>
                    Pass mark: 70% · Your score: {Math.round(submitted.score/submitted.total*100)}%
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>
                    {submitted.passed ? 'A lab manager will review and approve your training.' : 'Review the SOP and training materials, then try again.'}
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button className="btn btn-primary" onClick={() => setSubmitted(null)}>Done</button>
                    {!submitted.passed && <button className="btn" onClick={() => { setSubmitted(null); setExamMode(true); setAnswers({}) }}>Retake exam</button>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
