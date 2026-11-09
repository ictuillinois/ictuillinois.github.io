import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { forLabUsers } from '../../lib/equipmentAccess'
import { useAppStore } from '../../store/useAppStore'
import { buildEmailHtml } from '../../lib/emailTemplate'
import { readExamFile } from '../../lib/examParser'
import TestPills from '../../components/TestPills'
import { GENERAL, groupKey, loadTests, loadExamGroups, testEntries, entryKey, testLabel, examStatus, passedKeys, namesOf } from '../../lib/equipmentTests'

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
  const htmlBody = buildEmailHtml({ title, body, ctaLabel: 'View Training in ICT-Lab →', ctaUrl: 'https://ictlab.labhive.app/?screen=training', prefsUrl: 'https://ictlab.labhive.app/?screen=profile', orgContact })
  const { error } = await sb.from('email_notifications_queue').insert({ to_email: toEmail, subject, body, html_body: htmlBody, user_id: userId, type: prefKey })
  if (error) console.warn('Training email queue failed:', error.message)
}

function canEdit(s) { return s?.role === 'admin' || s?.role === 'user' }

function fmtDT(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ══════════════════════════════════════════════════════════════
// TRAINING REQUESTS PANEL (admin/labManagers view in Training Records)
// forUserId: only show requests from that user (hub Equipment tab,
// "This user" mode). compact: small empty state instead of the big one.
// ══════════════════════════════════════════════════════════════
export function TrainingRequestsPanel({ session, forUserId = null, compact = false, refreshKey = 0, onChanged }) {
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
  // "Trained before — give access" (Nov 2026): the request whose box is open,
  // and its training date / trainer. trainedPairs = user|equipment pairs that
  // already have a record: a request on one of those is a RETRAINING, and
  // retraining always needs the exam, so the pass is not offered.
  const [granting, setGranting] = useState(null)
  const [grantDate, setGrantDate] = useState('')
  const [grantBy, setGrantBy] = useState('')
  const [trainedPairs, setTrainedPairs] = useState(new Set())
  const [tests, setTests] = useState([])

  useEffect(() => { load() }, [refreshKey])

  // After a change here, reload and tell the records table below (onChanged).
  function changed() { load(); onChanged?.() }

  async function load() {
    setLoading(true)
    const orgId = session?.organizationId
    let retQ = sb.from('retraining_requests').select('*').order('id', { ascending: false })
    let schedQ = sb.from('training_schedule').select('*').order('created_at', { ascending: false })
    let eqQ = sb.from('equipment_inventory').select('id, equipment_name, nickname, requires_exam').eq('is_active', true)
    if (orgId) { retQ = retQ.eq('organization_id', orgId); schedQ = schedQ.eq('organization_id', orgId); eqQ = eqQ.eq('organization_id', orgId) }
    const [{ data: reqs }, { data: sched }, { data: eq }, { data: examRows }, t] = await Promise.all([
      retQ, schedQ, eqQ,
      sb.from('equipment_exam_questions').select('equipment_id'),
      loadTests(),
    ])
    setTests(t)
    const uids = [...new Set((reqs || []).filter(r => r.status === 'pending').map(r => r.user_id))]
    const { data: te } = uids.length
      ? await sb.from('training_equipment').select('user_id, equipment_id').in('user_id', uids)
      : { data: [] }
    setTrainedPairs(new Set((te || []).map(t => `${t.user_id}|${t.equipment_id}`)))
    setRequests(reqs || [])
    setSchedules(sched || [])
    setEquipment(eq || [])
    setExamEqIds(new Set((examRows || []).map(r => r.equipment_id)))
    setLoading(false)
  }

  // The lab user was trained outside the app and it was never recorded: give
  // booking access now, with no training session and no exam, ONCE. Same
  // record as Add equipment training's "Trained before" box (exam_waived).
  // Not for retraining — see trainedPairs. The request is deleted, not marked
  // approved: Booking treats an approved request as lifting the 3-month
  // retraining block for good, and the next retraining must need the exam.
  async function giveAccessTrainedBefore(req) {
    setSaving(true)
    const eqName = req.equipment_name || equipment.find(e => e.id === req.equipment_id)?.equipment_name || 'equipment'
    const date = grantDate || new Date().toISOString().split('T')[0]
    const expires = new Date(new Date(date).getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const { error } = await sb.from('training_equipment').insert({
      user_id: req.user_id, equipment_id: req.equipment_id,
      trained_date: date, trained_by: grantBy.trim() || session.username,
      passed_exam: true, expires_at: expires, is_retraining: false,
      exam_waived: true, exam_waived_by: session.username || 'Lab Manager', exam_waived_at: new Date().toISOString(),
    })
    if (error) {
      toast(/exam_waived|schema cache/i.test(error.message)
        ? 'Giving access without the exam needs training_exam_waiver.sql to be run in Supabase first.'
        : 'Could not give access: ' + error.message)
      setSaving(false); return
    }
    await sb.from('retraining_requests').delete().eq('id', req.id)
    const msg = `${session.username} gave you access to ${eqName} — your earlier training counts, so no training session or exam is needed this time. When retraining is due, the exam is required.`
    await sb.from('notifications').insert({
      user_id: req.user_id, type: 'training_approved',
      title: `Access given: ${eqName}`, body: msg, read: false,
    }).then(null, e => console.warn('[notify] insert failed:', e?.message || e))
    await sendTrainingEmail(req.user_id, 'training_approved', `Access given — ${eqName}`, 'You can book this equipment', msg)
    toast('Access given ✓')
    setGranting(null); setGrantDate(''); setGrantBy('')
    setSaving(false); changed()
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
      // The request is deleted below; the tests it asked for live on here.
      ...(req.test_ids?.length ? { test_ids: req.test_ids } : {}),
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
    setSaving(false); changed()
  }

  async function confirmSchedule(sched) {
    await sb.from('training_schedule').update({ status: 'confirmed', confirmed_date: sched.counter_date || sched.proposed_date, updated_at: new Date().toISOString() }).eq('id', sched.id)
    const eq = equipment.find(e => e.id === sched.equipment_id)
    const eqName = eq?.equipment_name || eq?.nickname || 'equipment'
    const when = fmtDT(sched.counter_date || sched.proposed_date)
    const msg = `Training confirmed for ${eqName} on ${when}. Please review the SOP and training videos before your session.`
    await sb.from('booking_notifications').insert({ booking_id: null, user_id: sched.user_id, type: 'training_confirmed', message: msg, read: false })
    await sendTrainingEmail(sched.user_id, 'training_approved', `Training confirmed — ${eqName}`, 'Your training has been confirmed', msg)
    toast('Training confirmed ✓'); changed()
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
                      {eq?.equipment_name || req.equipment_name}{req.requested_at ? ` · Requested ${new Date(req.requested_at).toLocaleDateString()}` : ''}
                      {req.notes && <span> · "{req.notes}"</span>}
                    </div>
                    {req.test_ids?.length > 0 && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Tests: <b>{namesOf(req.test_ids, tests)}</b></div>}
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
                    <button className="btn btn-sm btn-primary" onClick={() => { setGranting(null); setProposing(req); setProposeDate(''); setProposeNotes('') }}>
                      📅 {sched ? 'Change date' : 'Propose training date'}
                    </button>
                    {trainedPairs.has(`${req.user_id}|${req.equipment_id}`) ? (
                      <button className="btn btn-sm" disabled title="This is a retraining: the exam is required." style={{ opacity: 0.55 }}>
                        Trained before — give access · not for retraining
                      </button>
                    ) : (
                      <button className="btn btn-sm" style={{ border: '1.5px solid #7dd3fc', background: '#e0f2fe', color: '#0369a1' }}
                        onClick={() => { setProposing(null); setGranting(req); setGrantDate(''); setGrantBy('') }}>
                        ✓ Trained before — give access
                      </button>
                    )}
                    <button className="btn btn-sm btn-danger" onClick={async () => {
                      await sb.from('retraining_requests').update({ status: 'denied', reviewed_by: session.username, reviewed_at: new Date().toISOString() }).eq('id', req.id)
                      toast('Request denied.'); changed()
                    }}>✕ Deny</button>
                  </div>
                )}
                {granting?.id === req.id && (
                  <div style={{ marginTop: 10, background: '#e0f2fe', border: '1px solid #7dd3fc', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#0369a1', marginBottom: 4 }}>
                      Give {req.user_name} access to {eq?.equipment_name || req.equipment_name} without training or exam?
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
                      For training that really happened but was never recorded in the app. This time only: when retraining is due, the exam is required as usual.
                    </div>
                    <div className="grid-2">
                      <div className="field" style={{ marginBottom: 8 }}>
                        <label>When were they trained? <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span></label>
                        <input type="date" value={grantDate} onChange={e => setGrantDate(e.target.value)} />
                      </div>
                      <div className="field" style={{ marginBottom: 8 }}>
                        <label>Trained by <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span></label>
                        <input value={grantBy} onChange={e => setGrantBy(e.target.value)} placeholder={session.username} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm btn-primary" disabled={saving} onClick={() => giveAccessTrainedBefore(req)}>{saving ? 'Saving…' : 'Give access'}</button>
                      <button className="btn btn-sm" onClick={() => setGranting(null)}>Cancel</button>
                    </div>
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
                      <td>{eq?.equipment_name || req.equipment_name}</td>
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
// USER SCHEDULE RESPONSE (labUser view)
// ══════════════════════════════════════════════════════════════
export function UserTrainingSchedule({ session }) {
  const { toast } = useAppStore()
  const [schedules, setSchedules] = useState([])
  const [requests, setRequests] = useState([])
  const [equipment, setEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [counterDate, setCounterDate] = useState({})
  // For the confirmed-session banner: which exams this lab user has passed and
  // which instruments have an exam at all (requires_exam + questions).
  const [passedRows, setPassedRows] = useState([])
  const [groupsByEq, setGroupsByEq] = useState(new Map())
  const [tests, setTests] = useState([])
  const [dismissed, setDismissed] = useState(() => new Set(JSON.parse(localStorage.getItem(`ilab_dismissed_sched_${session?.userId}`) || '[]')))

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: sched }, { data: reqs }, { data: eq }, { data: passed }, groups, t] = await Promise.all([
      sb.from('training_schedule').select('*').eq('user_id', session.userId).order('created_at', { ascending: false }),
      sb.from('retraining_requests').select('*').eq('user_id', session.userId).eq('status', 'pending').order('requested_at', { ascending: false }),
      sb.from('equipment_inventory').select('id, equipment_name, nickname, requires_exam').eq('is_active', true),
      sb.from('equipment_exam_results').select('*').eq('user_id', session.userId).eq('passed', true),
      loadExamGroups(),
      loadTests(),
    ])
    setPassedRows(passed || [])
    setGroupsByEq(groups)
    setTests(t)
    setSchedules(sched || [])
    setRequests(reqs || [])
    setEquipment(eq || [])
    setLoading(false)
  }

  // A requested-training banner is news: the lab user has already submitted and
  // can do nothing until a manager responds, so it should be dismissible. The
  // request itself stays active — this hides a notice, it does not withdraw
  // anything, which is why it is localStorage and not a column.
  const visibleRequests = requests.filter(r => !dismissed.has(r.id))
  function dismiss(id) { dismissConfirmed(id) }

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
    const eqName = eq?.equipment_name || eq?.nickname || 'equipment'
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
            }))).then(null, e => console.warn('[notify] insert failed:', e?.message || e))
          }
        })
    }
    // Notify the lab user themselves
    sb.from('notifications').insert({
      user_id: session.userId, type: 'training_confirmed',
      title: `Training confirmed: ${eqName}`,
      body: `Your training for ${eqName} on ${fmtDT(sched.proposed_date)} is confirmed.`,
      read: false,
    }).then(null, e => console.warn('[notify] insert failed:', e?.message || e))
    toast('Training date accepted ✓'); load()
  }

  async function proposeCounter(sched) {
    const date = counterDate[sched.id]
    if (!date) { toast('Select a date.'); return }
    await sb.from('training_schedule').update({ status: 'countered', counter_date: new Date(date).toISOString(), updated_at: new Date().toISOString() }).eq('id', sched.id)
    // Notify managers of the counter-proposal
    const eq = equipment.find(e => e.id === sched.equipment_id)
    const eqName = eq?.equipment_name || eq?.nickname || 'equipment'
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
            }))).then(null, e => console.warn('[notify] insert failed:', e?.message || e))
          }
        })
    }
    toast('Counter-proposal sent ✓')
    setCounterDate(d => ({ ...d, [sched.id]: '' })); load()
  }

  const pending = schedules.filter(s => s.status === 'proposed' || s.status === 'countered')
  const confirmed = schedules.filter(s => s.status === 'confirmed')

  if (loading) return <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (schedules.length === 0 && visibleRequests.length === 0) return null

  return (
    <div style={{ marginBottom: 20 }}>
      {visibleRequests.map(req => {
        const eq = equipment.find(e => e.id === req.equipment_id)
        return (
          <div key={req.id} style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 'var(--radius-lg)', padding: '12px 16px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#92400e', marginBottom: 4 }}>
                ⏳ Training requested: {eq?.equipment_name || req.equipment_name}
              </div>
              <div style={{ fontSize: 13, color: '#92400e' }}>
                {req.requested_at ? `Submitted ${new Date(req.requested_at).toLocaleDateString()} — ` : ''}awaiting a training date from your lab manager.
              </div>
            </div>
            <button
              onClick={() => dismiss(req.id)}
              title="Dismiss this notice — your request stays active"
              aria-label="Dismiss"
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#92400e',
                       fontSize: 20, lineHeight: 1, padding: '0 2px', flexShrink: 0, opacity: 0.6 }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1}
              onMouseLeave={e => e.currentTarget.style.opacity = 0.6}
            >×</button>
          </div>
        )
      })}
      {pending.map(sched => {
        const eq = equipment.find(e => e.id === sched.equipment_id)
        return (
          <div key={sched.id} style={{ background: '#e0f2fe', border: '1px solid #7dd3fc', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#0369a1', marginBottom: 8 }}>
              📅 Training scheduled: {eq?.equipment_name || eq?.nickname}
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
        // Nov 2026: this banner is where a lab user learns what to do before
        // the session — it used to say only "review the SOP" with a plain link,
        // and never mentioned the exam they must pass.
        const eq = equipment.find(e => e.id === sched.equipment_id)
        const eqName = eq?.equipment_name || eq?.nickname || 'this equipment'
        const st = examStatus({ groups: eq?.requires_exam === false ? null : groupsByEq.get(sched.equipment_id), testIds: sched.test_ids, passed: passedKeys(passedRows, session.userId, sched.equipment_id) })
        const examState = st.state === 'none' ? 'none' : st.state === 'passed' ? 'passed' : sched.exam_skipped ? 'skipped' : 'todo'
        const owedNames = sched.test_ids?.length ? namesOf(st.owed, tests) : ''
        const openMaterials = () => { localStorage.setItem('selectEquipment', sched.equipment_id); useAppStore.getState().setScreen('equipmenthub') }
        const openExam = () => {
          localStorage.setItem('examEquipment', sched.equipment_id)
          if (st.owed[0]) localStorage.setItem('examTest', st.owed[0])
          const app = useAppStore.getState(); app.setScreen('training'); app.setSidebarSubTab('exam')
        }
        const step = (n, done, text, note) => (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
              background: done ? '#085041' : '#fff', color: done ? '#fff' : '#085041', border: '1.5px solid #085041' }}>{done ? '✓' : n}</span>
            <span style={{ fontSize: 13, color: 'var(--text)', paddingTop: 2 }}>{text}{note && <span style={{ display: 'block', fontSize: 12, color: 'var(--text3)' }}>{note}</span>}</span>
          </div>
        )
        return (
          <div key={sched.id} style={{ background: '#E1F5EE', border: '1px solid #9FE1CB', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 12, position: 'relative', display: 'grid', gap: 10 }}>
            <button onClick={() => dismissConfirmed(sched.id)} style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#085041', opacity: 0.5, lineHeight: 1, padding: 4 }} title="Dismiss">✕</button>
            <div style={{ paddingRight: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#085041' }}>✓ Training session confirmed: {eqName}</div>
              <div style={{ fontSize: 13, color: '#085041', marginTop: 2 }}>
                📅 {fmtDT(sched.confirmed_date)}{sched.proposed_by ? ` · with ${sched.proposed_by}` : ''}{sched.notes ? ` · ${sched.notes}` : ''}
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #9FE1CB', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: '#085041' }}>Before your session</div>
              {step(1, false, 'Watch the training video and read the SOP')}
              {examState !== 'none' && step(2, examState !== 'todo',
                examState === 'passed' ? 'Exam passed' : examState === 'skipped' ? 'Exam not needed this time — your lab manager skipped it' : `Take the ${owedNames ? `${owedNames} ` : ''}exam and pass it`,
                examState === 'todo' ? 'You need 70% to pass and can retake it. Without it the training cannot be confirmed.' : null)}
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>After the session, your lab manager confirms the training and you can start booking.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" style={{ fontWeight: 700 }} onClick={openMaterials}>
                Review the SOP & video →
              </button>
              {examState === 'todo' && (
                <button className="btn btn-primary" style={{ fontWeight: 700 }} onClick={openExam}>Take the exam →</button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// EXAM SYSTEM
// ══════════════════════════════════════════════════════════════
// ── PDF/Word Question Uploader — read in the browser, no AI (lib/examParser) ──
function PdfQuestionUploader({ equipmentId, testId = null, onImported }) {
  const { toast } = useAppStore()
  const [file, setFile] = useState(null)
  const [extracting, setExtracting] = useState(false)
  const [preview, setPreview] = useState(null)
  const [warnings, setWarnings] = useState([])
  const fileRef = useRef(null)

  async function extractQuestions() {
    if (!file) return
    setExtracting(true)
    try {
      const { questions, warnings } = await readExamFile(file)
      if (!questions.length) throw new Error('No questions found. Number each question (1. 2. 3.) and letter its options (A. B. C. D.).')
      setPreview(questions); setWarnings(warnings)
      toast(`Found ${questions.length} question${questions.length !== 1 ? 's' : ''} — check them, then import.`)
    } catch (e) {
      console.error(e)
      toast(e.message || 'Could not read the file.')
    }
    setExtracting(false)
  }

  const setAnswer = (i, letter) => setPreview(p => p.map((q, j) => j === i ? { ...q, correct_answer: letter } : q))
  const missing = (preview || []).filter(q => !q.correct_answer).length

  async function importQuestions() {
    if (!preview?.length) return
    if (missing) { toast(`Pick the correct answer for ${missing} question${missing !== 1 ? 's' : ''} first.`); return }
    let count = 0
    for (let i = 0; i < preview.length; i++) {
      const q = preview[i]
      if (!q.question) continue
      const { error } = await sb.from('equipment_exam_questions').insert({
        equipment_id: equipmentId,
        question: q.question, option_a: q.option_a||'', option_b: q.option_b||'',
        option_c: q.option_c||'', option_d: q.option_d||'',
        correct_answer: (q.correct_answer||'a').toLowerCase().charAt(0),
        order_num: i,
        ...(testId ? { test_id: testId } : {}),
        ...(q.explanation ? { explanation: q.explanation } : {}),
      })
      if (error) { toast(`Stopped after ${count} of ${preview.length} questions: ${error.message}`); onImported(); return }
      count++
    }
    toast(`${count} questions imported ✓`)
    setPreview(null); setFile(null)
    onImported()
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" style={{ display: 'none' }}
        onChange={e => { setFile(e.target.files[0]); setPreview(null); setWarnings([]) }} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: preview ? 16 : 0 }}>
        <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
          📁 {file ? file.name : 'Choose file'}
        </button>
        {file && (
          <button className="btn btn-sm btn-primary" onClick={extractQuestions} disabled={extracting}>
            {extracting ? 'Reading the file…' : 'Read questions from file'}
          </button>
        )}
        {file && <button className="btn btn-sm" onClick={() => { setFile(null); setPreview(null); setWarnings([]) }}>✕</button>}
      </div>

      {preview && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--accent)' }}>
            Preview — {preview.length} questions found
          </div>
          {warnings.length > 0 && (
            <div style={{ fontSize: 12, background: '#fef3c7', color: '#92400e', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
              {warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}
          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            {preview.map((q, i) => (
              <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < preview.length-1 ? '1px solid var(--surface2)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontWeight: 500, fontSize: 12 }}>Q{i+1}: {q.question}</div>
                  {/* The file's answer can be checked and changed before import */}
                  <select value={q.correct_answer || ''} onChange={e => setAnswer(i, e.target.value)}
                    style={{ width: 'auto', fontSize: 11, padding: '2px 6px', flexShrink: 0, borderColor: q.correct_answer ? 'var(--border)' : '#f59e0b', background: q.correct_answer ? undefined : '#fef3c7' }}>
                    <option value="" disabled>Answer?</option>
                    {['a','b','c','d'].filter(o => q[`option_${o}`]).map(o => <option key={o} value={o}>Answer: {o.toUpperCase()}{q[`option_${o}`] === 'True' || q[`option_${o}`] === 'False' ? ` (${q[`option_${o}`]})` : ''}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  {['a','b','c','d'].map(opt => q[`option_${opt}`] && (
                    <div key={opt} style={{ color: q.correct_answer?.toLowerCase() === opt ? '#085041' : 'inherit', fontWeight: q.correct_answer?.toLowerCase() === opt ? 600 : 400 }}>
                      {opt.toUpperCase()}. {q[`option_${opt}`]} {q.correct_answer?.toLowerCase() === opt && '✓'}
                    </div>
                  ))}
                </div>
                {q.explanation && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Explanation: {q.explanation}</div>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={importQuestions} disabled={missing > 0} title={missing ? 'Pick the missing answers first' : ''}>Import all {preview.length} questions</button>
            <button className="btn btn-sm" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// "Wednesday, November 5, 2026 at 10:00 AM with Greg Renshaw"
function sessionDate(s) { return s?.confirmed_date || s?.counter_date || s?.proposed_date }
function sessionLine(s) {
  const d = sessionDate(s)
  if (!d) return null
  const t = new Date(d)
  return `${t.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}${s.proposed_by ? ` with ${s.proposed_by}` : ''}`
}

// After passing: when and with whom the training session is, and what happens
// next. Without a session yet, says a date will be proposed.
function SessionBox({ s, eqName, compact = false }) {
  const d = sessionDate(s)
  const t = d ? new Date(d) : null
  const trainer = s?.proposed_by || 'your lab manager'
  const row = (k, v) => v ? <><dt style={{ color: 'var(--text3)', fontSize: 11, letterSpacing: '.4px', textTransform: 'uppercase', paddingTop: 2 }}>{k}</dt><dd style={{ margin: 0, fontWeight: 600 }}>{v}</dd></> : null
  return (
    <div style={{ textAlign: 'left', maxWidth: 520, margin: compact ? 0 : '0 auto 20px', background: '#E1F5EE', border: '1px solid #9FE1CB', borderRadius: 12, padding: '14px 16px', display: 'grid', gap: 8, fontSize: 14, color: 'var(--text)' }}>
      {!compact && <div style={{ fontWeight: 600, color: '#085041' }}>You passed the {eqName} exam.</div>}
      <div style={{ fontWeight: 700, color: '#085041', fontSize: 13 }}>
        {t ? (s.status === 'confirmed' ? 'Your training session' : 'Your training session (time still being agreed)') : 'Your training session'}
      </div>
      {t ? (
        <dl style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '4px 10px', margin: 0 }}>
          {row('Day', t.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}
          {row('Time', t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}
          {row('With', s.proposed_by)}
          {row('Where', s.notes)}
        </dl>
      ) : <div style={{ fontSize: 13, color: 'var(--text2)' }}>Your lab manager will propose a training date. You will be notified.</div>}
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text2)' }}>
        {t && <li>Be there on time for your training session.</li>}
        <li>After the training, {trainer} confirms it.</li>
        <li>You can then start booking the {eqName}.</li>
      </ol>
    </div>
  )
}

const EMPTY_Q = { question: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'a', explanation: '' }

export function ExamTab({ session }) {
  const { toast } = useAppStore()
  const [equipment, setEquipment] = useState([])
  const [selectedEq, setSelectedEq] = useState(null)
  // Everything on the instrument; questions / results below are the selected
  // test's. One exam per test (lib/equipmentTests.js).
  const [allQuestions, setAllQuestions] = useState([])
  const [allResults, setAllResults] = useState([])
  const [tests, setTests] = useState([])
  const [testSel, setTestSel] = useState(GENERAL)
  const [askedIds, setAskedIds] = useState([])   // tests this lab user asked for
  const [qIdx, setQIdx] = useState(0)            // the question on screen
  const [finishing, setFinishing] = useState(false)
  const openFresh = useRef(true)                 // an instrument was just opened
  const [loading, setLoading] = useState(true)
  const [examMode, setExamMode] = useState(false)
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(null)
  // The lab user's training session for this instrument (proposed / being
  // agreed / confirmed), shown with the congratulations after passing.
  const [mySession, setMySession] = useState(null)
  const [editQuestion, setEditQuestion] = useState(null)
  const [newQ, setNewQ] = useState(EMPTY_Q)
  const [progress, setProgress] = useState(null)
  const [requiresExam, setRequiresExam] = useState(null)

  const isAdminLabManager = canEdit(session)
  const inGroup = x => groupKey(x.test_id) === testSel
  const questions = allQuestions.filter(inGroup)
  const results = allResults.filter(inGroup)
  const selTest = tests.find(t => t.id === testSel) || null
  const entries = testEntries(tests, allQuestions.some(q => !q.test_id))
  const groups = new Set(allQuestions.map(q => groupKey(q.test_id)))
  const myPassed = new Set(allResults.filter(r => r.passed && r.user_id === session.userId).map(r => groupKey(r.test_id)))
  // After passing one test: the other tests they asked for that are still owed
  const stillOwed = askedIds.length ? examStatus({ groups, testIds: askedIds, passed: myPassed }).owed.filter(k => k !== testSel) : []

  function pickTest(k) {
    setTestSel(k); setExamMode(false); setSubmitted(null); setAnswers({}); setQIdx(0)
    setEditQuestion(null); setNewQ(EMPTY_Q)
  }
  function startExam() { setAnswers({}); setQIdx(0); setSubmitted(null); setExamMode(true) }

  useEffect(() => { loadEquipment() }, [])
  useEffect(() => { if (selectedEq) loadEquipmentData() }, [selectedEq])
  useEffect(() => { if (selectedEq) loadMySession() }, [selectedEq])

  async function loadMySession() {
    setMySession(null)
    if (!session?.userId || canEdit(session)) return
    const { data } = await sb.from('training_schedule').select('*')
      .eq('user_id', session.userId).eq('equipment_id', selectedEq)
      .in('status', ['proposed', 'confirmed', 'countered'])
      .order('created_at', { ascending: false }).limit(1)
    setMySession(data?.[0] || null)
    return data?.[0] || null
  }

  async function loadEquipment() {
    setLoading(true)
    let eqQ = sb.from('equipment_inventory').select('id, equipment_name, nickname').eq('is_active', true).order('equipment_name')
    if (session?.organizationId) eqQ = eqQ.eq('organization_id', session.organizationId)
    eqQ = forLabUsers(eqQ, session, 'exam')
    const { data: eq } = await eqQ
    setEquipment(eq || [])

    // Auto-select from localStorage (coming from Equipment page CTA)
    const autoEq = localStorage.getItem('examEquipment')
    if (autoEq) {
      localStorage.removeItem('examEquipment')
      setSelectedEq(autoEq)
    }
    setLoading(false)
  }

  async function loadEquipmentData() {
    const mine = !isAdminLabManager && session?.userId
    const [{ data: q }, { data: r }, { data: p }, { data: eqInfo }, t, { data: sch }, { data: req }] = await Promise.all([
      sb.from('equipment_exam_questions').select('*').eq('equipment_id', selectedEq).order('order_num'),
      sb.from('equipment_exam_results').select('*, users(name)').eq('equipment_id', selectedEq).order('created_at', { ascending: false }),
      session.userId ? sb.from('equipment_material_progress').select('*').eq('user_id', session.userId).eq('equipment_id', selectedEq).maybeSingle() : { data: null },
      sb.from('equipment_inventory').select('requires_exam').eq('id', selectedEq).maybeSingle(),
      loadTests(selectedEq),
      mine ? sb.from('training_schedule').select('*').eq('user_id', session.userId).eq('equipment_id', selectedEq).in('status', ['proposed', 'confirmed', 'countered']).order('created_at', { ascending: false }).limit(1) : { data: [] },
      mine ? sb.from('retraining_requests').select('*').eq('user_id', session.userId).eq('equipment_id', selectedEq).eq('status', 'pending').limit(1) : { data: [] },
    ])
    setAllQuestions(q || [])
    setAllResults(r || [])
    setTests(t)
    setProgress(p || null)
    setRequiresExam(eqInfo?.requires_exam ?? null)
    const asked = sch?.[0]?.test_ids || req?.[0]?.test_ids || []
    setAskedIds(asked)
    // Open on: the test the SOP page sent them to, else the first one they
    // asked for and have not passed, else the first with questions.
    const keys = testEntries(t, (q || []).some(x => !x.test_id)).map(entryKey)
    const wanted = localStorage.getItem('examTest')
    localStorage.removeItem('examTest')
    const passed = new Set((r || []).filter(x => x.passed && x.user_id === session.userId).map(x => groupKey(x.test_id)))
    const hasQs = k => (q || []).some(x => groupKey(x.test_id) === k)
    const first = asked.find(k => keys.includes(k) && !passed.has(k)) || keys.find(hasQs) || keys[0]
    const fresh = openFresh.current
    openFresh.current = false
    setTestSel(k => wanted && keys.includes(wanted) ? wanted : !fresh && keys.includes(k) ? k : first)
  }

  async function saveRequiresExam(val) {
    await sb.from('equipment_inventory').update({ requires_exam: val }).eq('id', selectedEq)
    setRequiresExam(val)
    toast(val === false ? 'Exam not required — training requests will be auto-approved.' : 'Exam required saved.')
  }

  async function saveQuestion() {
    if (!newQ.question.trim()) { toast('Question required.'); return }
    const row = { ...newQ, explanation: newQ.explanation.trim() || null }
    const { error } = editQuestion
      ? await sb.from('equipment_exam_questions').update({ ...row, order_num: editQuestion.order_num }).eq('id', editQuestion.id)
      : await sb.from('equipment_exam_questions').insert({ ...row, equipment_id: selectedEq, order_num: questions.length, ...(selTest ? { test_id: selTest.id } : {}) })
    if (error) { toast('Could not save the question: ' + error.message); return }
    setNewQ(EMPTY_Q)
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
    const { error: examErr } = await sb.from('equipment_exam_results').insert({
      user_id: session.userId, equipment_id: selectedEq,
      score, total: questions.length, passed, answers,
      organization_id: session?.organizationId || null,
      ...(selTest ? { test_id: selTest.id } : {}),
    })
    if (examErr) { toast('Error saving exam result: ' + examErr.message); return }
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
      const eqName = (eq?.equipment_name || eq?.nickname || 'equipment') + (selTest ? ` (${testLabel(selTest)})` : '')
      // The session (day, time, trainer) goes into both messages. The grade
      // does not go to managers: the lab user is told it stays private.
      const sess = await loadMySession()
      const when = sess ? sessionLine(sess) : null
      const userBody = when
        ? `Be at your training session on ${when}. After the training, ${sess.proposed_by || 'your lab manager'} confirms it and you can start booking.`
        : 'Your lab manager will propose a training date. After the training you can start booking.'
      sb.from('notifications').insert({ user_id: session.userId, type: 'exam_passed', title: `You passed the ${eqName} exam`, body: userBody, read: false })
        .then(null, e => console.warn('[notify] insert failed:', e?.message || e))
      sendTrainingEmail(session.userId, 'training_approved', `You passed the ${eqName} exam`, 'Congratulations — exam passed', userBody)
      if (orgId) {
        sb.from('users').select('id').eq('organization_id', orgId).in('role', ['user', 'admin']).eq('is_active', true)
          .then(({ data: managers }) => {
            if (managers?.length) {
              sb.from('notifications').insert(managers.map(m => ({
                user_id: m.id, type: 'training_request',
                title: `${session.username} passed the exam for ${eqName}`,
                body: when
                  ? `Training session ${when}. After the session, confirm the training in Training Records → Equipment.`
                  : 'No training date yet — propose one in Training Records → Equipment, then confirm the training after the session.',
                read: false,
              }))).then(null, e => console.warn('[notify] insert failed:', e?.message || e))
            }
          })
      }
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  const myResults = isAdminLabManager ? results : results.filter(r => r.user_id === session.userId)
  const latestResult = myResults[0]

  return (
    <div>
      {/* Equipment selector */}
      <div className="field" style={{ maxWidth: 400, marginBottom: 20 }}>
        <label>Select Equipment</label>
        <select value={selectedEq || ''} onChange={e => { openFresh.current = true; setSelectedEq(e.target.value); pickTest(GENERAL) }}>
          <option value="">— Select —</option>
          {equipment.map(e => <option key={e.id} value={e.id}>{e.equipment_name || e.nickname}{e.nickname && e.nickname !== e.equipment_name ? ` (${e.nickname})` : ''}</option>)}
        </select>
      </div>

      {selectedEq && (
        <div>
          <TestPills equipmentId={selectedEq} entries={entries} selected={testSel} onSelect={pickTest}
            canManage={isAdminLabManager} onChanged={id => { if (id) pickTest(id); loadEquipmentData() }} label="Test"
            badge={k => {
              const n = allQuestions.filter(q => groupKey(q.test_id) === k).length
              if (isAdminLabManager) return { text: `${n} question${n !== 1 ? 's' : ''}`, bg: 'var(--surface2)', fg: 'var(--text3)' }
              if (myPassed.has(k)) return { text: '✓ passed', bg: '#E1F5EE', fg: '#085041' }
              return askedIds.includes(k) && n ? { text: 'exam to do', bg: '#fef3c7', fg: '#92400e' } : null
            }} />
          {/* Admin: manage questions + see all results */}
          {isAdminLabManager && (
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
                        : 'Lab users must pass an exam before their training can be approved.'}
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
                  Upload a Word (.docx), PDF or text file. It is read here in your browser — no AI, nothing is sent anywhere.
                  Number each question (1. 2. 3.) and letter its options (A. B. C. D.); True / False questions work too.
                  Give the answer as "Answer: B" under the question, in an Answer Key at the end, or in bold; an "Explanation:" line is kept and shown after the lab user answers. You can check and change every answer before importing.
                  {selTest && <> These questions go on <b>{testLabel(selTest)}</b>.</>}
                </div>
                <PdfQuestionUploader equipmentId={selectedEq} testId={selTest?.id || null} onImported={loadEquipmentData} />
              </div>

              {/* Add/Edit question manually */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 10 }}>{editQuestion ? '✏️ Edit question' : '+ Add question manually'}</div>
                <div className="field"><label>Question <span style={{ color: '#c84b2f' }}>*</span></label><textarea rows={2} value={newQ.question} onChange={e => setNewQ(f => ({ ...f, question: e.target.value }))} style={{ resize: 'vertical' }} /></div>
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
                <div className="field"><label>Explanation <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(shown to the lab user after they answer)</span></label><textarea rows={2} value={newQ.explanation} onChange={e => setNewQ(f => ({ ...f, explanation: e.target.value }))} style={{ resize: 'vertical' }} /></div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveQuestion}>Save question</button>
                  {editQuestion && <button className="btn btn-sm" onClick={() => { setEditQuestion(null); setNewQ(EMPTY_Q) }}>Cancel</button>}
                </div>
              </div>

              {/* Questions list */}
              {questions.map((q, i) => (
                <div key={q.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>Q{i+1}: {q.question}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => { setEditQuestion(q); setNewQ({ question: q.question, option_a: q.option_a||'', option_b: q.option_b||'', option_c: q.option_c||'', option_d: q.option_d||'', correct_answer: q.correct_answer||'a', explanation: q.explanation||'' }) }}>Edit</button>
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
                  {q.explanation && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>Explanation: {q.explanation}</div>}
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
                            <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</td>
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

          {/* LabUser: material checklist + exam */}
          {!isAdminLabManager && (
            <div>
              {/* Material progress checklist — hidden once exam is passed */}
              {!examMode && !submitted && !latestResult?.passed && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>📚 Before you start the exam</div>
                  {requiresExam === false ? (
                    <div style={{ fontSize: 13, color: '#085041', marginTop: 8, padding: '8px 0' }}>
                      Your lab manager will review your training request and approve your training directly. No exam is required for this equipment — you will be notified once your training is approved.
                    </div>
                  ) : (
                  <>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
                    Watch the training videos and read the SOP for <strong>{equipment.find(e => e.id === selectedEq)?.equipment_name || equipment.find(e => e.id === selectedEq)?.nickname}</strong>, tick both below, then take the exam — <b>before your training session</b>.
                  </div>
                  <div style={{ marginTop: -8, marginBottom: 16 }}>
                    <button className="btn btn-primary btn-sm" style={{ fontWeight: 700 }}
                      onClick={() => { localStorage.setItem('selectEquipment', selectedEq); useAppStore.getState().setScreen('equipmenthub') }}>
                      🎦 Open the videos & SOP →
                    </button>
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
                        <button className="btn btn-primary" style={{ fontSize: 15, padding: '10px 32px' }} onClick={startExam}>
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
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Taken {new Date(latestResult.created_at).toLocaleDateString()}</div>
                  {latestResult.passed && !isAdminLabManager && mySession && (
                    <div style={{ marginTop: 10 }}><SessionBox s={mySession} eqName={equipment.find(e => e.id === selectedEq)?.equipment_name || 'this equipment'} compact /></div>
                  )}
                  {latestResult.passed && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8, fontStyle: 'italic' }}>
                      Your exam grade is for your information only and is not visible to your lab manager.
                    </div>
                  )}
                  {!latestResult.passed && questions.length > 0 && <button className="btn btn-sm btn-primary" style={{ marginTop: 8 }} onClick={startExam}>Retake exam</button>}
                  {latestResult.passed && stillOwed.length > 0 && <div style={{ fontSize: 13, color: '#92400e', marginTop: 8, fontWeight: 600 }}>Still to pass for your training: {namesOf(stillOwed, tests)}</div>}
                </div>
              )}

              {/* One question at a time: picking an option locks it, then the
                  right answer and the explanation show, whether right or wrong. */}
              {examMode && !submitted && questions[qIdx] && (() => {
                const q = questions[qIdx]
                const picked = answers[q.id]
                const done = picked !== undefined
                const right = picked === q.correct_answer
                const last = qIdx === questions.length - 1
                const correctText = q[`option_${q.correct_answer}`]
                const finish = async () => { setFinishing(true); await submitExam(); setFinishing(false) }
                return (
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>📝 Exam — {equipment.find(e => e.id === selectedEq)?.equipment_name}{selTest ? ` · ${testLabel(selTest)}` : ''}</div>
                    <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>Question {qIdx + 1} of {questions.length}</div>
                    <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 99, overflow: 'hidden', marginBottom: 16 }}>
                      <div style={{ height: '100%', background: 'var(--accent)', width: `${((qIdx + (done ? 1 : 0)) / questions.length) * 100}%`, transition: 'width 0.3s' }} />
                    </div>
                    <div className="card" style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 12 }}>{q.question}</div>
                      {['a','b','c','d'].map(opt => {
                        if (!q[`option_${opt}`]) return null
                        const isRight = done && opt === q.correct_answer
                        const isWrong = done && opt === picked && !right
                        return (
                          <button key={opt} type="button" disabled={done} onClick={() => setAnswers(a => ({ ...a, [q.id]: opt }))}
                            style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 10, padding: '10px 12px', borderRadius: 6, cursor: done ? 'default' : 'pointer', marginBottom: 6, fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text)',
                              background: isRight ? 'var(--accent-light)' : isWrong ? '#fcebeb' : 'var(--surface2)', border: `1px solid ${isRight ? 'var(--accent)' : isWrong ? '#f09595' : 'var(--border)'}` }}>
                            <strong>{opt.toUpperCase()}.</strong> <span>{q[`option_${opt}`]}</span>
                          </button>
                        )
                      })}
                      {done && (
                        <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 8, fontSize: 14, lineHeight: 1.55, background: right ? '#E1F5EE' : '#fcebeb', border: `1px solid ${right ? '#9FE1CB' : '#f09595'}` }}>
                          <div style={{ fontWeight: 700, color: right ? '#085041' : '#a32d2d', marginBottom: q.explanation ? 4 : 0 }}>
                            {right ? '✓ Correct' : `✕ Not quite — the answer is ${q.correct_answer.toUpperCase()}. ${correctText}`}
                          </div>
                          {q.explanation}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                      <button className="btn" onClick={() => setExamMode(false)}>Cancel</button>
                      {last
                        ? <button className="btn btn-primary" onClick={finish} disabled={!done || finishing}>{finishing ? 'Saving…' : 'See result →'}</button>
                        : <button className="btn btn-primary" onClick={() => setQIdx(i => i + 1)} disabled={!done}>Next →</button>}
                    </div>
                  </div>
                )
              })()}

              {/* Result after submit */}
              {submitted && (
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <div style={{ fontSize: 56, marginBottom: 12 }}>{submitted.passed ? '🎉' : '📚'}</div>
                  <div style={{ fontWeight: 700, fontSize: 24, color: submitted.passed ? '#085041' : '#a32d2d', marginBottom: 12 }}>
                    {submitted.passed ? `Congratulations, ${(session.username || '').split(' ')[0]}!` : 'Not Passed'}
                  </div>
                  {/* Grade circle */}
                  <div style={{ width: 100, height: 100, borderRadius: '50%', background: submitted.passed ? '#E1F5EE' : '#fcebeb', border: `4px solid ${submitted.passed ? '#085041' : '#a32d2d'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <div style={{ fontWeight: 700, fontSize: 24, color: submitted.passed ? '#085041' : '#a32d2d' }}>{Math.round(submitted.score/submitted.total*100)}%</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{submitted.score}/{submitted.total}</div>
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 6 }}>
                    Pass mark: 70% · Your score: {Math.round(submitted.score/submitted.total*100)}%
                  </div>
                  {submitted.passed
                    ? <SessionBox s={mySession} eqName={equipment.find(e => e.id === selectedEq)?.equipment_name || 'this equipment'} />
                    : <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>Review the SOP and training materials, then try again.</div>}
                  {submitted.passed && stillOwed.length > 0 && <div style={{ fontSize: 14, color: '#92400e', fontWeight: 600, marginBottom: 12 }}>Still to pass for your training: {namesOf(stillOwed, tests)}</div>}
                  {submitted.passed && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', marginBottom: 24 }}>
                      Your grade is for your information only and will not be shown to your lab manager.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button className="btn btn-primary" onClick={() => setSubmitted(null)}>Done</button>
                    {!submitted.passed && <button className="btn" onClick={startExam}>Retake exam</button>}
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
