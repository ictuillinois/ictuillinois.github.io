import { IconEye, IconEyeOff } from '../../components/Icons'
import HelpPanel from '../../components/HelpPanel'
import ScrollTabs from '../../components/ScrollTabs'
import React from 'react'
import { TrainingRequestsPanel, UserTrainingSchedule, ExamTab } from './TrainingSchedule'
import SafetyTab from '../labsafety/LabSafety'
import { useState, useEffect, useRef, useMemo } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import StorageService from '../../lib/storage/StorageService'

const PROJECT_GROUPS = ['Material', 'Sustainability', 'GPR', 'Mechanic', 'Other']

// ── Helpers ───────────────────────────────────────────────────
function canEdit(session) {
  return session?.role === 'admin' || session?.role === 'user'
}

function fullName(u) {
  return u?.nick_name?.trim() || [u?.name, u?.last_name].filter(Boolean).join(' ') || '—'
}
function firstName(u) { return fullName(u) }

function StatusBadge({ done }) {
  return (
    <span className={`badge ${done ? 'badge-ok' : 'badge-low'}`}>
      {done ? '✓ Complete' : '✗ Pending'}
    </span>
  )
}

// Round user avatar: profile photo when set, otherwise a scientist emoji
// based on the gender the user selected in Profile → My Info (neutral default)
function UserAvatar({ user, size = 44 }) {
  if (user?.photo_url) {
    return <img src={user.photo_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }} />
  }
  const g = (user?.gender || '').toLowerCase()
  const emoji = g === 'male' ? '👨‍🔬' : g === 'female' ? '👩‍🔬' : '🧑‍🔬'
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--accent-light)', border: '2px solid #9FE1CB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.5), flexShrink: 0, lineHeight: 1 }}>
      {emoji}
    </div>
  )
}

function ApprovalChip({ approved, approvedBy, onClick, editable }) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, cursor: editable ? 'pointer' : 'default', userSelect: 'none', transition: 'opacity 0.15s' }
  if (approved) return (
    <span style={{ ...base, background: '#dcfce7', color: '#16a34a' }} onClick={onClick} title={approvedBy ? `Approved by ${approvedBy}` : 'Approved'}>
      ✓ Approved{approvedBy ? ` · ${approvedBy}` : ''}
    </span>
  )
  return (
    <span style={{ ...base, background: '#fef3c7', color: '#d97706' }} onClick={onClick} title={editable ? 'Click to approve' : 'Pending admin approval'}>
      ⏳ Pending
    </span>
  )
}

function CompletionBadge({ approved, total }) {
  if (total === 0) return <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>No certs</span>
  const all = approved === total
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: all ? '#dcfce7' : '#fef3c7', color: all ? '#16a34a' : '#d97706' }}>
      {approved}/{total} approved
    </span>
  )
}

function SectionHeader({ title, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
      {count !== undefined && <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{count} lab users</span>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// TAB 1 — FRESH STUDENT TRAINING
// ══════════════════════════════════════════════════════════════
function FreshTraining({ students, session, hideChrome = false, onChanged }) {
  const isSolo = session?.loginMode === 'solo'
  const { toast } = useAppStore()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(null)
  // solo add form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCertLabel, setNewCertLabel] = useState('')
  const newFileRef = useRef(null)
  // team add modal
  const [addingFor, setAddingFor] = useState(null)
  const [addingLabel, setAddingLabel] = useState('')
  const addFileRef = useRef(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedUserId, setSelectedUserId] = useState(null)   // card grid → detail panel

  useEffect(() => { if (students.length > 0) load() }, [students])

  async function load() {
    setLoading(true)
    const ids = students.map(s => s.id)
    let q = sb.from('training_fresh').select('*')
    if (ids.length) q = q.in('user_id', ids)
    const { data } = await q
    setRecords(data || [])
    setLoading(false)
  }

  function getRecord(userId) {
    return records.find(r => r.user_id === userId) || null
  }

  async function toggleApprove(rec) {
    await sb.from('training_fresh').update({ admin_approved: !rec.admin_approved, admin_approved_by: session.username, admin_approved_at: new Date().toISOString() }).eq('id', rec.id)
    toast(rec.admin_approved ? 'Approval removed.' : 'Certificate approved ✓')
    load(); onChanged?.()
  }

  async function toggleInstructions(user) {
    const rec = getRecord(user.id)
    if (rec) {
      await sb.from('training_fresh').update({ instructions_read: !rec.instructions_read }).eq('id', rec.id)
    } else {
      await sb.from('training_fresh').insert({ user_id: user.id, instructions_read: true, organization_id: session?.organizationId || null })
    }
    load(); onChanged?.()
  }

  async function addCertForUser(userId, file, label) {
    if (!file) return
    setUploading(userId)
    try {
      const certLabel = (label || '').trim() || file.name
      const path = `fresh/${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { url } = await StorageService.upload('project-files', path, file, { personal: true })
      await sb.from('training_fresh').insert({
        user_id: userId,
        certificate_url: url,
        certificate_name: certLabel,
        certificate_uploaded_at: new Date().toISOString(),
        organization_id: session?.organizationId || null
      })
      toast('Certification added.')
      setShowAddForm(false); setNewCertLabel('')
      setAddingFor(null); setAddingLabel('')
      load(); onChanged?.()
    } catch (e) { toast('Upload failed.') }
    setUploading(null)
  }

  async function deleteCert(recId) {
    if (!confirm('Remove this certification?')) return
    await sb.from('training_fresh').delete().eq('id', recId)
    toast('Certification removed.')
    load(); onChanged?.()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  // ── SOLO layout: flat table with multi-cert rows ──────────────
  if (isSolo) {
    return (
      <div>
        <SectionHeader title="Lab User Documents" />
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Certification</th>
                <th>File</th>
                <th>Uploaded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {students.map(u => {
                const soloRecs = records.filter(r => r.user_id === u.id)
                return (
                  <React.Fragment key={u.id}>
                    {soloRecs.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ color: 'var(--text3)', fontSize: 13, fontStyle: 'italic' }}>No certifications yet. Click "+ Add certification" below to upload one.</td>
                      </tr>
                    ) : soloRecs.map(certRec => (
                      <tr key={certRec.id}>
                        <td style={{ fontWeight: 500, fontSize: 13 }}>{certRec.certificate_name || 'Certificate'}</td>
                        <td><a href={certRec.certificate_url} target="_blank" rel="noopener" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>📕 View</a></td>
                        <td style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{certRec.certificate_uploaded_at ? new Date(certRec.certificate_uploaded_at).toLocaleDateString() : '—'}</td>
                        <td><button className="btn btn-sm btn-danger" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => deleteCert(certRec.id)}>✕</button></td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 14 }}>
          {showAddForm ? (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Add certification</div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Name (optional)</label>
                <input value={newCertLabel} onChange={e => setNewCertLabel(e.target.value)} placeholder="e.g. Lab Safety Certificate" autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-sm btn-primary" onClick={() => newFileRef.current?.click()} disabled={!!uploading}>
                  {uploading === session.userId ? '⏳ Uploading…' : '⬆️ Upload file'}
                </button>
                <button className="btn btn-sm" onClick={() => { setShowAddForm(false); setNewCertLabel('') }}>Cancel</button>
              </div>
              <input type="file" accept=".pdf,image/*" ref={newFileRef} style={{ display: 'none' }}
                onChange={e => { if (e.target.files[0]) addCertForUser(session.userId, e.target.files[0], newCertLabel); e.target.value = '' }} />
            </div>
          ) : (
            <button className="btn btn-sm" onClick={() => setShowAddForm(true)}>+ Add certification</button>
          )}
        </div>
      </div>
    )
  }

  // ── TEAM layout: per-user cards with cert list ────────────────
  const editable = canEdit(session)

  const allFiltered = search.trim()
    ? students.filter(u => fullName(u).toLowerCase().includes(search.toLowerCase()))
    : students

  const filteredStudents = allFiltered.filter(u => {
    const userRecs = records.filter(r => r.user_id === u.id)
    if (statusFilter === 'none')     return userRecs.length === 0
    if (statusFilter === 'pending')  return userRecs.some(r => !r.admin_approved)
    if (statusFilter === 'approved') return userRecs.length > 0 && userRecs.every(r => r.admin_approved)
    return true
  })

  const filterCounts = {
    all:      allFiltered.length,
    pending:  allFiltered.filter(u => records.filter(r => r.user_id === u.id).some(r => !r.admin_approved)).length,
    none:     allFiltered.filter(u => records.filter(r => r.user_id === u.id).length === 0).length,
    approved: allFiltered.filter(u => { const r = records.filter(x => x.user_id === u.id); return r.length > 0 && r.every(x => x.admin_approved) }).length,
  }

  const filterPills = [
    { key: 'all',      label: 'All',          color: 'var(--text2)' },
    { key: 'pending',  label: '⏳ Pending',    color: '#d97706' },
    { key: 'none',     label: '📭 No uploads', color: 'var(--text3)' },
    { key: 'approved', label: '✓ All approved',color: '#16a34a' },
  ]

  // Card-grid selection: lab users land on their own panel; managers pick a card.
  // hideChrome (hub panel mode): single student passed in — always selected.
  const ownUser = filteredStudents.find(u => session.userId === u.id || session.username === u.name)
  const effSelectedId = hideChrome ? students[0]?.id : (selectedUserId ?? (ownUser && !editable ? ownUser.id : null))

  return (
    <div>
      {!hideChrome && <SectionHeader title="Lab User Documents" count={students.length} />}
      {!hideChrome && editable && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name…"
            style={{ maxWidth: 240, fontSize: 13, padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: '100%' }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {filterPills.map(p => (
              <button key={p.key} onClick={() => setStatusFilter(p.key)}
                style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, border: `1px solid ${statusFilter === p.key ? p.color : 'var(--border)'}`, background: statusFilter === p.key ? (p.key === 'pending' ? '#fef3c7' : p.key === 'approved' ? '#dcfce7' : 'var(--surface2)') : 'var(--surface)', color: statusFilter === p.key ? p.color : 'var(--text2)', fontWeight: statusFilter === p.key ? 600 : 400, cursor: 'pointer', transition: 'all 0.15s' }}>
                {p.label} <span style={{ opacity: 0.6 }}>({filterCounts[p.key]})</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!hideChrome && filteredStudents.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12, padding: '24px 0', textAlign: 'center' }}>
          {search.trim() ? `No users match "${search}".` : 'No users in this category.'}
        </div>
      )}
      {/* ── User card grid (Supply-tab style) — click a card for details ── */}
      {!hideChrome && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 20 }}>
        {filteredStudents.map(u => {
          const userRecs = records.filter(r => r.user_id === u.id)
          const approvedCount = userRecs.filter(r => r.admin_approved).length
          const pct = userRecs.length ? Math.round((approvedCount / userRecs.length) * 100) : 0
          const selected = u.id === effSelectedId
          return (
            <div key={u.id} className="manage-card" onClick={() => setSelectedUserId(selected ? null : u.id)}
              style={{ width: 176, flexShrink: 0, padding: '16px 12px 14px', cursor: 'pointer', ...(selected ? { borderColor: 'var(--accent)', background: 'var(--accent-light)', boxShadow: '0 6px 18px rgba(29,158,117,0.18)' } : {}) }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><UserAvatar user={u} size={56} /></div>
              <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName(u)}</div>
              {u.degree && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.degree}</div>}
              <div style={{ marginTop: 8 }}><CompletionBadge approved={approvedCount} total={userRecs.length} /></div>
              {userRecs.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#16a34a' : '#d97706', borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{pct}%</span>
                </div>
              )}
            </div>
          )
        })}
      </div>}

      {/* ── Detail panel: certs for the selected user ── */}
      {!hideChrome && effSelectedId == null && filteredStudents.length > 0 && (
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)', padding: '8px 0 16px' }}>
          Select a lab user above to view their certifications.
        </div>
      )}
      {(hideChrome ? students : filteredStudents).filter(u => u.id === effSelectedId).map(u => {
        const isOwn = session.userId === u.id || session.username === u.name
        const canAdd = editable || isOwn
        const userRecs = records.filter(r => r.user_id === u.id)
        const masterRec = getRecord(u.id)
        const approvedCount = userRecs.filter(r => r.admin_approved).length
        const pct = userRecs.length ? Math.round((approvedCount / userRecs.length) * 100) : 0
        const rowBg = 'var(--row-a)'
        return (
          <div key={u.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: 12, overflow: 'hidden', background: rowBg }}>
            {/* Card header */}
            <div style={{ padding: '12px 16px', background: 'var(--row-a-strong)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <UserAvatar user={u} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{fullName(u)}</div>
                    <CompletionBadge approved={approvedCount} total={userRecs.length} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    {u.degree ? `Supervisor: ${u.degree}` : ''}{u.year_semester ? ` · ${u.year_semester}` : ''}
                  </div>
                  {userRecs.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', maxWidth: 120 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#16a34a' : '#d97706', borderRadius: 99, transition: 'width 0.4s' }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{pct}%</span>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {editable ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 0, fontSize: 13 }}
                    title="Lab user has read all provided lab documents and files (beyond uploaded certificates)">
                    <input type="checkbox" checked={masterRec?.instructions_read || false} onChange={() => toggleInstructions(u)} style={{ width: 'auto' }} />
                    <span style={{ color: masterRec?.instructions_read ? '#16a34a' : 'var(--text2)', fontWeight: masterRec?.instructions_read ? 600 : 400 }}>
                      {masterRec?.instructions_read ? '✓ File review confirmed' : 'Confirm file review'}
                    </span>
                  </label>
                ) : isOwn && (
                  <span style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    File review: <StatusBadge done={masterRec?.instructions_read} />
                  </span>
                )}
                {canAdd && (
                  <button className="btn btn-sm btn-primary" onClick={() => { setAddingFor(u.id); setAddingLabel('') }}>+ Add cert</button>
                )}
              </div>
            </div>
            {/* Cert rows */}
            {userRecs.length === 0 ? (
              <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>No certifications uploaded yet.</div>
            ) : (
              <table style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Certification</th>
                    <th>File</th>
                    <th>Uploaded</th>
                    <th>Status</th>
                    {editable && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {userRecs.map(certRec => (
                    <tr key={certRec.id}>
                      <td style={{ fontWeight: 500 }}>{certRec.certificate_name || 'Certificate'}</td>
                      <td>
                        {certRec.certificate_url
                          ? <a href={certRec.certificate_url} target="_blank" rel="noopener" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>📄 View</a>
                          : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 12 }}>
                        {certRec.certificate_uploaded_at ? new Date(certRec.certificate_uploaded_at).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <ApprovalChip
                          approved={certRec.admin_approved}
                          approvedBy={certRec.admin_approved_by}
                          editable={editable && !!certRec.certificate_url}
                          onClick={editable && certRec.certificate_url ? () => toggleApprove(certRec) : undefined}
                        />
                      </td>
                      {editable && (
                        <td><button className="btn btn-sm btn-danger" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => deleteCert(certRec.id)}>✕</button></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}

      {addingFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 400, width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Add certification</div>
            <div className="field">
              <label>Name (optional)</label>
              <input value={addingLabel} onChange={e => setAddingLabel(e.target.value)} placeholder="e.g. Lab Safety Certificate" autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={() => addFileRef.current?.click()} disabled={!!uploading}>
                {uploading === addingFor ? '⏳ Uploading…' : '⬆️ Upload file'}
              </button>
              <button className="btn" onClick={() => setAddingFor(null)}>Cancel</button>
            </div>
            <input type="file" accept=".pdf,image/*" ref={addFileRef} style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) addCertForUser(addingFor, e.target.files[0], addingLabel); e.target.value = '' }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// TAB 2 — VEHICLE TRAINING
// ══════════════════════════════════════════════════════════════
function GolfCarTraining({ students, session, hideChrome = false, onChanged }) {
  const { toast } = useAppStore()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [addingFor, setAddingFor] = useState(null)
  const [form, setForm] = useState({ vehicleName: '', date: new Date().toISOString().split('T')[0], trainedBy: session?.username || '', trained: false })
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { if (students.length > 0) load() }, [students])

  async function load() {
    setLoading(true)
    const ids = students.map(s => s.id)
    let q = sb.from('training_golf_car').select('*')
    if (ids.length) q = q.in('user_id', ids)
    const { data } = await q
    setRecords(data || [])
    setLoading(false)
  }

  function getRecordsForUser(userId) { return records.filter(r => r.user_id === userId) }

  async function addVehicleRecord() {
    if (!form.vehicleName.trim()) { toast('Vehicle name required.'); return }
    await sb.from('training_golf_car').insert({
      user_id: addingFor,
      vehicle_name: form.vehicleName.trim(),
      trained: form.trained,
      trained_date: form.trained ? (form.date || null) : null,
      trained_by: form.trained ? (form.trainedBy || session.username) : null,
    })
    toast('Vehicle training record added.')
    setAddingFor(null)
    setForm({ vehicleName: '', date: new Date().toISOString().split('T')[0], trainedBy: session?.username || '', trained: false })
    load(); onChanged?.()
  }

  async function toggleTrained(rec) {
    if (!canEdit(session)) return
    const now = new Date().toISOString().split('T')[0]
    await sb.from('training_golf_car').update({
      trained: !rec.trained,
      trained_date: !rec.trained ? now : null,
      trained_by: !rec.trained ? session.username : null,
    }).eq('id', rec.id)
    load(); onChanged?.()
  }

  async function updateDate(rec, date) {
    await sb.from('training_golf_car').update({ trained_date: date }).eq('id', rec.id)
    load()
  }

  async function deleteRecord(id) {
    if (!confirm('Remove this vehicle training record?')) return
    await sb.from('training_golf_car').delete().eq('id', id)
    toast('Record removed.')
    load(); onChanged?.()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  const searchFiltered = search.trim()
    ? students.filter(u => fullName(u).toLowerCase().includes(search.toLowerCase()))
    : students
  const trainedCountMap = students.reduce((acc, u) => { acc[u.id] = getRecordsForUser(u.id).filter(r => r.trained).length; return acc }, {})
  const totalTrained = students.filter(u => trainedCountMap[u.id] > 0).length
  const filteredStudents = statusFilter === 'all' ? searchFiltered
    : statusFilter === 'trained' ? searchFiltered.filter(u => trainedCountMap[u.id] > 0)
    : searchFiltered.filter(u => trainedCountMap[u.id] === 0)

  return (
    <div>
      {!hideChrome && <SectionHeader title="Training Records" count={students.length} />}
      {!hideChrome && canEdit(session) && (
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name…"
          style={{ marginBottom: 12, maxWidth: 280, fontSize: 13, padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: '100%' }} />
      )}
      {!hideChrome && <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: `All (${students.length})` },
          { key: 'trained', label: `✓ Trained (${totalTrained})` },
          { key: 'none', label: `⚠ No training (${students.length - totalTrained})` },
        ].map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid', fontSize: 12, cursor: 'pointer', fontWeight: statusFilter === f.key ? 700 : 400, background: statusFilter === f.key ? 'var(--accent)' : 'transparent', color: statusFilter === f.key ? '#fff' : 'var(--text2)', borderColor: statusFilter === f.key ? 'var(--accent)' : 'var(--border)' }}
          >{f.label}</button>
        ))}
      </div>}
      {!hideChrome && filteredStudents.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>No lab users match.</div>
      )}
      {(hideChrome ? students : filteredStudents).map((u, idx) => {
        const userRecs = getRecordsForUser(u.id)
        const trainedCount = userRecs.filter(r => r.trained).length
        const headerBg = idx % 2 === 0 ? 'var(--row-a-strong)' : 'var(--row-b-strong)'
        return (
          <div key={u.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: headerBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{fullName(u)}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>{u.project_group || ''}{u.supervisor ? ` · ${u.supervisor}` : ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {userRecs.length > 0 && (
                  <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, fontWeight: 600, background: trainedCount === userRecs.length ? '#d1fae5' : '#fef3c7', color: trainedCount === userRecs.length ? '#065f46' : '#92400e' }}>
                    {trainedCount}/{userRecs.length} trained
                  </span>
                )}
                {canEdit(session) && (
                  <button className="btn btn-sm" onClick={() => {
                    setAddingFor(u.id)
                    setForm({ vehicleName: '', date: new Date().toISOString().split('T')[0], trainedBy: session?.username || '', trained: false })
                  }}>+ Add vehicle</button>
                )}
              </div>
            </div>
            {userRecs.length === 0 ? (
              <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text3)' }}>No vehicle training records yet.</div>
            ) : (
              <table style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Group</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Trained By</th>
                    {canEdit(session) && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {userRecs.map(rec => (
                    <tr key={rec.id}>
                      <td style={{ fontWeight: 500 }}>{rec.vehicle_name || '—'}</td>
                      <td><span style={{ fontSize: 12, color: 'var(--text2)' }}>{u.project_group || '—'}</span></td>
                      <td>
                        {canEdit(session) ? (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 0 }}>
                            <input type="checkbox" checked={rec.trained || false} onChange={() => toggleTrained(rec)} style={{ width: 'auto' }} />
                            <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: rec.trained ? '#d1fae5' : '#fef3c7', color: rec.trained ? '#065f46' : '#92400e' }}>{rec.trained ? 'Trained' : 'Pending'}</span>
                          </label>
                        ) : (
                          <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: rec.trained ? '#d1fae5' : '#fef3c7', color: rec.trained ? '#065f46' : '#92400e' }}>{rec.trained ? 'Trained' : 'Pending'}</span>
                        )}
                      </td>
                      <td>
                        {canEdit(session) && rec.trained ? (
                          <input type="date" value={rec.trained_date || ''} onChange={e => updateDate(rec, e.target.value)} style={{ width: 140, fontSize: 13, padding: '4px 8px' }} />
                        ) : <span style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{rec.trained_date || '—'}</span>}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text2)' }}>{rec.trained_by || '—'}</td>
                      {canEdit(session) && <td><button className="btn btn-sm btn-danger" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => deleteRecord(rec.id)}>✕</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}

      {addingFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 420, width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Add vehicle training</div>
            <div className="field">
              <label>Vehicle name *</label>
              <input value={form.vehicleName} onChange={e => setForm(f => ({ ...f, vehicleName: e.target.value }))} placeholder="e.g. Golf Cart #1, Forklift" autoFocus />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Training Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="field">
                <label>Trained By</label>
                <input value={form.trainedBy} onChange={e => setForm(f => ({ ...f, trainedBy: e.target.value }))} />
              </div>
            </div>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 0 }}>
                <input type="checkbox" checked={form.trained} onChange={e => setForm(f => ({ ...f, trained: e.target.checked }))} style={{ width: 'auto' }} />
                Trained
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={addVehicleRecord}>Save</button>
              <button className="btn" onClick={() => setAddingFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// TAB 3 — EQUIPMENT TRAINING
// ══════════════════════════════════════════════════════════════
function EquipmentTraining({ students, session, hideChrome = false, onChanged }) {
  const isSolo = session?.loginMode === 'solo'
  const canManage = canEdit(session) || isSolo
  const { toast } = useAppStore()
  const [equipment, setEquipment] = useState([])
  const [records, setRecords] = useState([])
  const [pendingRetraining, setPendingRetraining] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddEquip, setShowAddEquip] = useState(false)
  const [newEquip, setNewEquip] = useState({ name: '', description: '' })
  const [addingRecord, setAddingRecord] = useState(null)
  const [importing, setImporting] = useState(false)
  const equipImportRef = useRef(null)
  const [equipSubTab, setEquipSubTab] = useState('training')
  const [search, setSearch] = useState('')
  const [searchHistory, setSearchHistory] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { if (students.length > 0) load() }, [students])

  async function load() {
    setLoading(true)
    let equipQuery = sb.from('equipment_inventory').select('id, equipment_name, nickname, category, location').eq('is_active', true).order('nickname')
    if (session?.loginMode === 'solo') equipQuery = equipQuery.eq('created_by', session.userId)
    else if (session?.organizationId) equipQuery = equipQuery.eq('organization_id', session.organizationId)
    const ids = students.map(s => s.id)
    let recQuery = sb.from('training_equipment').select('*')
    if (ids.length) recQuery = recQuery.in('user_id', ids)
    const [{ data: eq }, { data: rec }, { data: retrainReqs }] = await Promise.all([
      equipQuery,
      recQuery,
      sb.from('retraining_requests').select('*').eq('status', 'pending'),
    ])
    setEquipment(eq || [])
    setRecords(rec || [])
    setPendingRetraining(retrainReqs || [])
    setLoading(false)
  }

  function getRecords(userId) { return records.filter(r => r.user_id === userId) }
  function isExpiringSoon(rec) {
    if (!rec.expires_at) return false
    const days = (new Date(rec.expires_at) - new Date()) / (1000 * 60 * 60 * 24)
    return days <= 30 && days > 0
  }
  function isExpired(rec) {
    if (!rec.expires_at) return false
    return new Date(rec.expires_at) < new Date()
  }

  async function addEquipment() {
    if (!newEquip.name.trim()) { toast('Equipment name required.'); return }
    await sb.from('equipment_inventory').insert({ equipment_name: newEquip.name.trim(), nickname: newEquip.description.trim() || newEquip.name.trim(), is_active: true, organization_id: session?.organizationId || null, login_mode: 'team' })
    setNewEquip({ name: '', description: '' })
    setShowAddEquip(false)
    load(); toast('Equipment added.')
  }

  async function deleteEquipment(id) {
    if (!confirm('Remove this equipment from training list?')) return
    await sb.from('equipment_inventory').update({ is_active: false }).eq('id', id)
    load(); toast('Equipment removed.')
  }

  async function importEquipmentFromExcel(file) {
    if (!file) return
    setImporting(true)
    try {
      const XLSX = await import('xlsx')
      const reader = new FileReader()
      reader.onload = async e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'binary' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
          const items = []
          for (let i = 1; i < rows.length; i++) {
            const name = String(rows[i][0] || '').trim()
            const description = String(rows[i][1] || '').trim() || null
            if (name) items.push({ name, description })
          }
          if (!items.length) { toast('No equipment found in file.'); setImporting(false); return }
          const existing = equipment.map(e => e.name.toLowerCase())
          const newItems = items.filter(item => !existing.includes(item.name.toLowerCase()))
          if (newItems.length === 0) { toast('All equipment already exists.'); setImporting(false); return }
          for (const item of newItems) {
            await sb.from('equipment_list').insert(item)
          }
          load()
          toast(`${newItems.length} equipment item${newItems.length !== 1 ? 's' : ''} imported.`)
        } catch (err) { toast('Error reading file.') }
        setImporting(false)
      }
      reader.onerror = () => { toast('Error reading file.'); setImporting(false) }
      reader.readAsBinaryString(file)
    } catch (e) { toast('Import failed.'); setImporting(false) }
  }

  function getRetrainingInfo(userId, equipmentId) {
    return pendingRetraining.find(r => r.user_id === userId && r.equipment_id === equipmentId) || null
  }

  async function submitRetrainingRequest(userId, userName, equipmentId) {
    const eq = equipment.find(e => e.id === equipmentId)
    const { data: existing } = await sb.from('retraining_requests')
      .select('id').eq('user_id', userId).eq('equipment_id', equipmentId).eq('status', 'pending').maybeSingle()
    if (existing) { toast('Training request already submitted for this equipment.'); return }
    const { error } = await sb.from('retraining_requests').insert({
      user_id: userId, user_name: userName,
      equipment_id: equipmentId,
      equipment_name: eq?.nickname || eq?.equipment_name,
      status: 'pending',
      requested_at: new Date().toISOString(),
      organization_id: session?.organizationId || null,
    })
    if (error) { toast('Error: ' + error.message); return }
    toast('Training request submitted ✓')
    load()
  }

  async function addTrainingRecord(userId, equipmentId, date, trainedBy, passed, isRetraining) {
    if (!isRetraining) {
      const { data: existing } = await sb.from('training_equipment')
        .select('id').eq('user_id', userId).eq('equipment_id', equipmentId)
      if (existing && existing.length > 0) {
        toast('This equipment is already in the training list for this lab user.')
        return
      }
    }
    const expires = date ? new Date(new Date(date).getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null
    await sb.from('training_equipment').insert({ user_id: userId, equipment_id: equipmentId, trained_date: date, trained_by: trainedBy, passed_exam: passed, expires_at: expires })
    setAddingRecord(null)
    load(); onChanged?.(); toast('Training record added.')
  }

  async function togglePassed(rec) {
    if (!canManage) return
    await sb.from('training_equipment').update({ passed_exam: !rec.passed_exam }).eq('id', rec.id)
    load(); onChanged?.()
  }

  async function deleteRecord(id) {
    await sb.from('training_equipment').delete().eq('id', id)
    load(); onChanged?.(); toast('Record removed.')
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      {!hideChrome && <SectionHeader title="Equipment Training" count={isSolo ? undefined : students.length} />}
      {!hideChrome && <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {[{ key: 'training', label: 'Training Records' }, { key: 'history', label: 'Equipment History' }].map(t => (
          <button key={t.key} onClick={() => setEquipSubTab(t.key)}
            style={{ padding: '8px 16px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: equipSubTab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${equipSubTab === t.key ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>}

      {!hideChrome && equipSubTab === 'history' && (
        <div>
          <input
            value={searchHistory}
            onChange={e => setSearchHistory(e.target.value)}
            placeholder="Search equipment…"
            style={{ marginBottom: 16, maxWidth: 280, fontSize: 13, padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: '100%' }}
          />
          {canEdit(session) && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={() => equipImportRef.current?.click()} disabled={importing}>
                {importing ? '⏳ Importing…' : '⬇️ Import Excel'}
              </button>
              <input ref={equipImportRef} type="file" accept=".xlsx" style={{ display: 'none' }}
                onChange={e => { importEquipmentFromExcel(e.target.files[0]); e.target.value = '' }} />
              <button className="btn btn-sm btn-primary" onClick={() => setShowAddEquip(true)}>+ Add equipment</button>
              <button className="btn btn-sm" onClick={() => {
                import('xlsx').then(XLSX => {
                  const data = [['Equipment Name', 'Description (optional)'], ['Example: Gyratory Compactor', 'Asphalt compaction equipment']]
                  const ws = XLSX.utils.aoa_to_sheet(data); ws['!cols'] = [{ wch: 40 }, { wch: 40 }]
                  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Equipment')
                  XLSX.writeFile(wb, 'equipment_template.xlsx')
                })
              }}>⬇️ Template</button>
            </div>
          )}
          {showAddEquip && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>New equipment</div>
              <div className="grid-2">
                <div className="field" style={{ marginBottom: 0 }}><label>Name *</label><input value={newEquip.name} onChange={e => setNewEquip(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Gyratory Compactor" autoFocus /></div>
                <div className="field" style={{ marginBottom: 0 }}><label>Nickname</label><input value={newEquip.description} onChange={e => setNewEquip(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Servopac" /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-sm btn-primary" onClick={addEquipment}>Add</button>
                <button className="btn btn-sm" onClick={() => setShowAddEquip(false)}>Cancel</button>
              </div>
            </div>
          )}
          {(() => {
            const filtered = searchHistory.trim()
              ? equipment.filter(e => (e.nickname || e.equipment_name || '').toLowerCase().includes(searchHistory.toLowerCase()) || (e.equipment_name || '').toLowerCase().includes(searchHistory.toLowerCase()))
              : equipment
            return filtered.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}><div className="empty-icon">🔧</div>{searchHistory.trim() ? `No equipment matches "${searchHistory}".` : 'No equipment yet.'}</div>
            ) : (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <table>
                  <thead><tr><th style={{ width: 40 }}>#</th><th>Equipment Name</th><th>Description</th><th>Date Added</th>{canEdit(session) && <th style={{ width: 90 }}></th>}</tr></thead>
                  <tbody>
                    {filtered.map((e, i) => (
                      <tr key={e.id}>
                        <td style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{i + 1}</td>
                        <td style={{ fontWeight: 500 }}>{e.nickname || e.equipment_name}<br/><span style={{fontSize:11,color:'var(--text3)'}}>{e.nickname ? e.equipment_name : ''}</span></td>
                        <td style={{ fontSize: 13, color: 'var(--text2)' }}>{e.category || e.location || '—'}</td>
                        <td style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{new Date(e.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                        {canEdit(session) && <td><button className="btn btn-sm btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => deleteEquipment(e.id)}>Remove</button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>{filtered.length} of {equipment.length} equipment item{equipment.length !== 1 ? 's' : ''}</div>
              </div>
            )
          })()}
        </div>
      )}

      {(hideChrome || equipSubTab === 'training') && (
        <div>
          {!canEdit(session) && (
            <RetrainingRequestPanel session={session} equipment={equipment} pendingRetraining={pendingRetraining} onSubmit={submitRetrainingRequest} />
          )}
          {/* Managers: request queue lives here now (sidebar Requests tab removed) —
              per-user in the hub panel, full org queue in All-users audit mode */}
          {canEdit(session) && !isSolo && (
            <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>📋 Training Requests</div>
              <TrainingRequestsPanel session={session} forUserId={hideChrome ? students[0]?.id : null} compact />
            </div>
          )}
          {!hideChrome && canEdit(session) && (
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name…"
              style={{ marginBottom: 12, maxWidth: 280, fontSize: 13, padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: '100%' }}
            />
          )}
          {(() => {
            const searchBase = search.trim() ? students.filter(u => fullName(u).toLowerCase().includes(search.toLowerCase())) : students
            const passedMap = students.reduce((acc, u) => { acc[u.id] = getRecords(u.id).filter(r => r.passed_exam).length; return acc }, {})
            const totalMap = students.reduce((acc, u) => { acc[u.id] = getRecords(u.id).length; return acc }, {})
            const withRecords = students.filter(u => totalMap[u.id] > 0).length
            const allPassed = students.filter(u => totalMap[u.id] > 0 && passedMap[u.id] === totalMap[u.id]).length
            const pending = students.filter(u => totalMap[u.id] > 0 && passedMap[u.id] < totalMap[u.id]).length
            const noRecs = students.filter(u => totalMap[u.id] === 0).length
            const displayStudents = statusFilter === 'all' ? searchBase
              : statusFilter === 'approved' ? searchBase.filter(u => totalMap[u.id] > 0 && passedMap[u.id] === totalMap[u.id])
              : statusFilter === 'pending' ? searchBase.filter(u => totalMap[u.id] > 0 && passedMap[u.id] < totalMap[u.id])
              : searchBase.filter(u => totalMap[u.id] === 0)
            return (
              <>
                {!hideChrome && <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  {[
                    { key: 'all', label: `All (${students.length})` },
                    { key: 'approved', label: `✓ All passed (${allPassed})` },
                    { key: 'pending', label: `⏳ Pending (${pending})` },
                    { key: 'none', label: `📭 No records (${noRecs})` },
                  ].map(f => (
                    <button key={f.key} onClick={() => setStatusFilter(f.key)}
                      style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid', fontSize: 12, cursor: 'pointer', fontWeight: statusFilter === f.key ? 700 : 400, background: statusFilter === f.key ? 'var(--accent)' : 'transparent', color: statusFilter === f.key ? '#fff' : 'var(--text2)', borderColor: statusFilter === f.key ? 'var(--accent)' : 'var(--border)' }}
                    >{f.label}</button>
                  ))}
                </div>}
                {!hideChrome && displayStudents.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>No lab users match.</div>
                )}
                {(hideChrome ? students : displayStudents).map((u, idx) => {
            const recs = getRecords(u.id)
            const passedCount = recs.filter(r => r.passed_exam).length
            const headerBg = idx % 2 === 0 ? 'var(--row-a-strong)' : 'var(--row-b-strong)'
            return (
              <div key={u.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: headerBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{fullName(u)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>{u.project_group || ''}{u.supervisor ? ` · ${u.supervisor}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {recs.length > 0 && (
                      <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, fontWeight: 600, background: passedCount === recs.length ? '#d1fae5' : '#fef3c7', color: passedCount === recs.length ? '#065f46' : '#92400e' }}>
                        {passedCount}/{recs.length} passed
                      </span>
                    )}
                    {canManage && <button className="btn btn-sm" onClick={() => setAddingRecord({ userId: u.id })}>+ Add training</button>}
                  </div>
                </div>
                {recs.length === 0 ? (
                  <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text3)' }}>No equipment training records yet.</div>
                ) : (
                  <table style={{ fontSize: 13 }}>
                    <thead><tr><th>Equipment</th><th>Date</th><th>Trained By</th><th>Passed Exam</th><th>Expires</th>{canManage && <th></th>}</tr></thead>
                    <tbody>
                      {recs.map(rec => {
                        const retrainReq = getRetrainingInfo(u.id, rec.equipment_id)
                        const eq = equipment.find(e => e.id === rec.equipment_id)
                        const expired = isExpired(rec)
                        const soon = isExpiringSoon(rec)
                        return (
                          <React.Fragment key={rec.id}>
                            <tr style={{ background: rec.is_retraining ? '#e0f2fe' : expired ? 'var(--accent2-light)' : soon ? 'var(--warn-light)' : 'transparent' }}>
                              <td style={{ fontWeight: 500 }}>
                                {eq ? (eq.nickname || eq.equipment_name) : 'Unknown'}
                                {rec.is_retraining && <span style={{ marginLeft: 6, fontSize: 10, background: '#0369a1', color: '#fff', borderRadius: 3, padding: '1px 6px', fontWeight: 600 }}>Retraining</span>}
                              </td>
                              <td style={{ fontFamily: 'var(--mono)' }}>{rec.trained_date || '—'}</td>
                              <td>{rec.trained_by || '—'}</td>
                              <td>
                                {canManage ? (
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 0 }}>
                                    <input type="checkbox" checked={rec.passed_exam || false} onChange={() => togglePassed(rec)} style={{ width: 'auto' }} />
                                    <span style={{ color: rec.passed_exam ? 'var(--accent)' : 'var(--text3)' }}>{rec.passed_exam ? 'Yes' : 'No'}</span>
                                  </label>
                                ) : <StatusBadge done={rec.passed_exam} />}
                              </td>
                              <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: expired ? 'var(--accent2)' : soon ? '#92400e' : 'var(--text2)' }}>
                                {rec.expires_at || '—'}{expired && ' ⚠️ EXPIRED'}{soon && ' ⏰ Soon'}
                              </td>
                              {canManage && <td><button className="btn btn-sm btn-danger" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => deleteRecord(rec.id)}>✕</button></td>}
                            </tr>
                            {retrainReq && (
                              <tr>
                                <td colSpan={canEdit(session) ? 6 : 5} style={{ padding: 0, border: 'none' }}>
                                  <div style={{ background: '#fef3c7', borderTop: '1px solid #f0d070', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                    <div style={{ fontSize: 12, color: '#92400e' }}>⚠️ <strong>Retraining required</strong> — not used in 3+ months.</div>
                                    {canEdit(session) && (
                                      <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }} onClick={() => setAddingRecord({ userId: u.id, equipmentId: rec.equipment_id, isRetraining: true })}>🔄 Log retraining</button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
              </>
            )
          })()}
          {addingRecord && (
            <AddTrainingRecord userId={addingRecord.userId} equipment={equipment} existingRecords={getRecords(addingRecord.userId)} session={session} onSave={addTrainingRecord} onClose={() => setAddingRecord(null)} defaultEquipmentId={addingRecord.equipmentId} defaultIsRetraining={addingRecord.isRetraining} />
          )}
        </div>
      )}
    </div>
  )
}

function RetrainingRequestPanel({ session, equipment, pendingRetraining, onSubmit }) {
  const [selectedEq, setSelectedEq] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useAppStore()

  async function submit() {
    if (!selectedEq) { toast('Select equipment.'); return }
    setSubmitting(true)
    await onSubmit(session.userId, session.username, selectedEq)
    setSelectedEq('')
    setSubmitting(false)
  }

  const pendingIds = new Set(pendingRetraining.map(r => r.equipment_id))
  return (
    <div className="card" style={{ marginBottom: 16, borderColor: '#0369a1' }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: '#0369a1' }}>📋 Request Training</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>Select the equipment you need training on. Your request will be sent to the lab manager.</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={selectedEq} onChange={e => setSelectedEq(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
          <option value="">— Select equipment —</option>
          {equipment.map(e => (
            <option key={e.id} value={e.id} disabled={pendingIds.has(e.id)}>{e.nickname || e.equipment_name}{pendingIds.has(e.id) ? ' (pending)' : ''}</option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={submitting || !selectedEq}>{submitting ? 'Submitting…' : 'Submit request'}</button>
      </div>
    </div>
  )
}

function AddTrainingRecord({ userId, equipment, existingRecords, session, onSave, onClose, defaultEquipmentId, defaultIsRetraining }) {
  const [form, setForm] = useState({ equipmentId: defaultEquipmentId || '', date: new Date().toISOString().split('T')[0], trainedBy: session.username, passed: false, isRetraining: defaultIsRetraining || false })
  const trainedEquipmentIds = new Set((existingRecords || []).filter(r => !r.is_retraining).map(r => r.equipment_id))
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 400, width: '100%', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{form.isRetraining ? '🔄 Add retraining record' : 'Add equipment training'}</div>
        {form.isRetraining && <div style={{ fontSize: 12, color: '#0369a1', background: '#e0f2fe', borderRadius: 6, padding: '6px 10px', marginBottom: 12 }}>This will be recorded as retraining.</div>}
        <div className="field"><label>Equipment *</label>
          <select value={form.equipmentId} onChange={e => setForm(f => ({ ...f, equipmentId: e.target.value }))}>
            <option value="">— Select equipment —</option>
            {equipment.map(e => {
              const alreadyTrained = !form.isRetraining && trainedEquipmentIds.has(e.id)
              return <option key={e.id} value={e.id} disabled={alreadyTrained}>{e.nickname || e.equipment_name}{alreadyTrained ? ' (already added)' : ''}</option>
            })}
          </select>
        </div>
        <div className="grid-2">
          <div className="field"><label>Training Date</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
          <div className="field"><label>Trained By</label><input value={form.trainedBy} onChange={e => setForm(f => ({ ...f, trainedBy: e.target.value }))} /></div>
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 8 }}>
            <input type="checkbox" checked={form.passed} onChange={e => setForm(f => ({ ...f, passed: e.target.checked }))} style={{ width: 'auto' }} />Passed exam
          </label>
          {canEdit(session) && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 0 }}>
              <input type="checkbox" checked={form.isRetraining} onChange={e => setForm(f => ({ ...f, isRetraining: e.target.checked }))} style={{ width: 'auto' }} />
              <span style={{ color: '#0369a1', fontWeight: 500 }}>🔄 Mark as retraining</span>
            </label>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn btn-primary" onClick={() => form.equipmentId && onSave(userId, form.equipmentId, form.date, form.trainedBy, form.passed, form.isRetraining)}>Save</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// TAB 4 — BUILDING ALARM
// ══════════════════════════════════════════════════════════════
function BuildingAlarm({ students, session, hideChrome = false, onChanged }) {
  const { toast } = useAppStore()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [localPins, setLocalPins] = useState({})
  const [showPins, setShowPins] = useState({})

  useEffect(() => { if (students.length > 0) load() }, [students])

  async function load() {
    setLoading(true)
    const ids = students.map(s => s.id)
    let q = sb.from('training_building_alarm').select('*')
    if (ids.length) q = q.in('user_id', ids)
    const { data } = await q
    setRecords(data || [])
    setLoading(false)
  }

  function getRecord(userId) { return records.find(r => r.user_id === userId) || null }

  async function updateRecord(user, field, value) {
    if (!canEdit(session)) return
    const rec = getRecord(user.id)
    if (rec) {
      await sb.from('training_building_alarm').update({ [field]: value }).eq('id', rec.id)
    } else {
      await sb.from('training_building_alarm').insert({ user_id: user.id, [field]: value })
    }
    load(); onChanged?.()
  }

  async function toggleTrained(user) {
    if (!canEdit(session)) return
    const rec = getRecord(user.id)
    const now = new Date().toISOString().split('T')[0]
    if (rec) {
      await sb.from('training_building_alarm').update({ trained: !rec.trained, trained_date: !rec.trained ? now : null, trained_by: !rec.trained ? session.username : null }).eq('id', rec.id)
    } else {
      await sb.from('training_building_alarm').insert({ user_id: user.id, trained: true, trained_date: now, trained_by: session.username })
    }
    toast('Record updated.')
    load(); onChanged?.()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  const searchFiltered = search.trim()
    ? students.filter(u => fullName(u).toLowerCase().includes(search.toLowerCase()))
    : students
  const totalTrained = students.filter(u => getRecord(u.id)?.trained).length
  const filteredStudents = statusFilter === 'all' ? searchFiltered
    : statusFilter === 'trained' ? searchFiltered.filter(u => getRecord(u.id)?.trained)
    : searchFiltered.filter(u => !getRecord(u.id)?.trained)

  return (
    <div>
      {!hideChrome && <SectionHeader title="Building Alarm Training" count={students.length} />}
      {!hideChrome && <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>Admin/RE enters the lab user's 4-digit alarm PIN and confirms training completion.</p>}
      {!hideChrome && canEdit(session) && (
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          style={{ marginBottom: 12, maxWidth: 280, fontSize: 13, padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: '100%' }}
        />
      )}
      {!hideChrome && <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: `All (${students.length})` },
          { key: 'trained', label: `✓ Trained (${totalTrained})` },
          { key: 'none', label: `⚠ Not trained (${students.length - totalTrained})` },
        ].map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid', fontSize: 12, cursor: 'pointer', fontWeight: statusFilter === f.key ? 700 : 400, background: statusFilter === f.key ? 'var(--accent)' : 'transparent', color: statusFilter === f.key ? '#fff' : 'var(--text2)', borderColor: statusFilter === f.key ? 'var(--accent)' : 'var(--border)' }}
          >{f.label}</button>
        ))}
      </div>}
      {!hideChrome && filteredStudents.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>No lab users match.</div>
      )}
      {(hideChrome ? students : filteredStudents).map((u, idx) => {
        const rec = getRecord(u.id)
        const headerBg = idx % 2 === 0 ? 'var(--row-a-strong)' : 'var(--row-b-strong)'
        return (
          <div key={u.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: headerBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{fullName(u)}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>{u.project_group || ''}{u.supervisor ? ` · ${u.supervisor}` : ''}</div>
              </div>
              <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, fontWeight: 600, background: rec?.trained ? '#d1fae5' : '#fef3c7', color: rec?.trained ? '#065f46' : '#92400e' }}>
                {rec?.trained ? 'Trained' : 'Not trained'}
              </span>
            </div>
            <div style={{ padding: '10px 16px', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>Alarm PIN:</span>
                {canEdit(session) ? (
                  <input
                    type={showPins[u.id] ? 'text' : 'password'}
                    maxLength={4}
                    value={localPins[u.id] ?? rec?.alarm_pin ?? ''}
                    onChange={e => setLocalPins(p => ({ ...p, [u.id]: e.target.value }))}
                    onBlur={e => { if (e.target.value !== (rec?.alarm_pin ?? '')) updateRecord(u, 'alarm_pin', e.target.value) }}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                    placeholder="····"
                    style={{ width: 70, fontFamily: 'var(--mono)', fontSize: 15, padding: '4px 8px', textAlign: 'center', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
                  />
                ) : (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
                    {rec?.alarm_pin ? (showPins[u.id] ? rec.alarm_pin : '••••') : '—'}
                  </span>
                )}
                {rec?.alarm_pin && (
                  <button
                    onClick={() => setShowPins(p => ({ ...p, [u.id]: !p[u.id] }))}
                    title={showPins[u.id] ? 'Hide PIN' : 'Show PIN'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2, display: 'flex', alignItems: 'center' }}
                  >
                    {showPins[u.id] ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>Training:</span>
                {canEdit(session) ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 0 }}>
                    <input type="checkbox" checked={rec?.trained || false} onChange={() => toggleTrained(u)} style={{ width: 'auto' }} />
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: rec?.trained ? '#d1fae5' : '#fef3c7', color: rec?.trained ? '#065f46' : '#92400e' }}>{rec?.trained ? 'Complete' : 'Pending'}</span>
                  </label>
                ) : (
                  <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: rec?.trained ? '#d1fae5' : '#fef3c7', color: rec?.trained ? '#065f46' : '#92400e' }}>{rec?.trained ? 'Complete' : 'Pending'}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>Date:</span>
                {canEdit(session) && rec?.trained ? (
                  <input type="date" value={rec.trained_date || ''} onChange={e => updateRecord(u, 'trained_date', e.target.value)} style={{ fontSize: 13, padding: '4px 8px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
                ) : <span style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{rec?.trained_date || '—'}</span>}
              </div>
              {rec?.trained_by && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--text3)', fontSize: 12 }}>Confirmed by:</span>
                  <span style={{ color: 'var(--text2)' }}>{rec.trained_by}</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// TAB 5 — LAB USER LOCKER
// ══════════════════════════════════════════════════════════════
const TOTAL_LOCKERS = 15

function StudentLocker({ session, panelUser = null, onChanged }) {
  const { toast } = useAppStore()
  const [lockers, setLockers] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(null)
  const [selectedStudent, setSelectedStudent] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const orgId = session?.organizationId
    let stQ = sb.from('users').select('id, name, last_name, nick_name, project_group').eq('role', 'lab_user').eq('is_active', true).order('name')
    if (orgId) stQ = stQ.eq('organization_id', orgId)
    let lkQ = sb.from('student_lockers').select('*').order('locker_number')
    if (orgId) lkQ = lkQ.eq('organization_id', orgId)
    const [{ data: lk }, { data: st }] = await Promise.all([lkQ, stQ])
    if (!lk || lk.length === 0) {
      setLockers(Array.from({ length: TOTAL_LOCKERS }, (_, i) => ({ locker_number: i + 1, user_id: null, user_name: null })))
    } else {
      setLockers(lk)
    }
    setStudents(st || [])
    setLoading(false)
  }

  async function assignLocker(lockerNumber) {
    const targetId = panelUser?.id || selectedStudent
    if (!targetId) { toast('Select a lab user.'); return }
    const student = students.find(s => s.id === targetId) || panelUser
    if (!student) return
    const orgId = session?.organizationId
    const displayName = firstName(student)
    const { error } = await sb.from('student_lockers').upsert({
      locker_number: lockerNumber,
      organization_id: orgId || null,
      user_id: student.id,
      user_name: displayName,
      assigned_by: session.username,
      assigned_at: new Date().toISOString(),
      notes: notes || null,
      is_unavailable: false,
    }, { onConflict: 'organization_id,locker_number' })
    if (error) { toast('Error: ' + error.message); return }
    toast(`Locker ${lockerNumber} assigned to ${displayName} ✓`)
    setAssigning(null); setSelectedStudent(''); setNotes('')
    load(); onChanged?.()
  }

  async function unassignLocker(locker) {
    if (!confirm(`Remove ${locker.user_name} from locker ${locker.locker_number}?`)) return
    const orgId = session?.organizationId
    let q = sb.from('student_lockers').update({
      user_id: null, user_name: null, assigned_by: null, assigned_at: null, notes: null
    }).eq('locker_number', locker.locker_number)
    if (orgId) q = q.eq('organization_id', orgId)
    const { error } = await q
    if (error) { toast('Error: ' + error.message); return }
    toast(`Locker ${locker.locker_number} cleared.`)
    load(); onChanged?.()
  }

  async function toggleUnavailable(lockerNumber) {
    const locker = lockers.find(l => Number(l.locker_number) === lockerNumber)
    const nowUnavailable = !locker?.is_unavailable
    const orgId = session?.organizationId
    setLockers(prev => {
      const exists = prev.find(l => Number(l.locker_number) === lockerNumber)
      if (exists) return prev.map(l => Number(l.locker_number) === lockerNumber ? { ...l, is_unavailable: nowUnavailable } : l)
      return [...prev, { locker_number: lockerNumber, is_unavailable: nowUnavailable, user_id: null, user_name: null }]
    })
    let q = sb.from('student_lockers').update({ is_unavailable: nowUnavailable }).eq('locker_number', lockerNumber)
    if (orgId) q = q.eq('organization_id', orgId)
    const { error } = await q
    if (error) { toast('Error: ' + error.message); load() }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  const myLocker = session?.role === 'lab_user'
    ? lockers.find(l => l.user_id === session.userId)
    : null

  // Build a map keyed by number to avoid string vs number type mismatch from DB
  const lockerMap = {}
  lockers.forEach(l => { lockerMap[Number(l.locker_number)] = l })

  const assigned = lockers.filter(l => l.user_name).length
  const unavailableCount = lockers.filter(l => l.is_unavailable && !l.user_name).length
  const available = TOTAL_LOCKERS - assigned - unavailableCount

  // ── Panel mode: compact single-user locker view ──
  if (panelUser) {
    const mine = lockers.find(l => l.user_id === panelUser.id)
    const availableLockers = Array.from({ length: TOTAL_LOCKERS }, (_, i) => i + 1)
      .filter(n => { const l = lockerMap[n]; return !l || (!l.user_name && !l.is_unavailable) })
    return (
      <div>
        {mine ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: 'var(--accent-light)', border: '1px solid #9FE1CB', borderRadius: 12, padding: '12px 16px' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>🗄️ Locker #{mine.locker_number}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                Assigned {mine.assigned_at ? new Date(mine.assigned_at).toLocaleDateString() : '—'}{mine.assigned_by ? ` by ${mine.assigned_by}` : ''}
              </div>
              {mine.notes && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Note: {mine.notes}</div>}
            </div>
            {canEdit(session) && <button className="btn btn-sm btn-danger" onClick={() => unassignLocker(mine)}>Unassign</button>}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            No locker assigned{canEdit(session) ? ':' : '.'}
            {canEdit(session) && availableLockers.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={assigning || ''} onChange={e => setAssigning(e.target.value)} style={{ maxWidth: 180 }}>
                  <option value="">— Select locker —</option>
                  {availableLockers.map(n => <option key={n} value={n}>Locker #{n}</option>)}
                </select>
                <button className="btn btn-sm btn-primary" disabled={!assigning} onClick={() => assignLocker(Number(assigning))}>Assign</button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>🗄️ Lab User Lockers</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>{available} available</span>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{assigned} assigned</span>
          {unavailableCount > 0 && <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>{unavailableCount} unavailable</span>}
        </div>
      </div>

      {session?.role === 'lab_user' && (
        <div>
          {myLocker ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px' }}>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Your assigned locker</div>
              <div style={{ width: 140, height: 140, borderRadius: 16, background: 'var(--accent)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
                <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1 }}>{myLocker.locker_number}</div>
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>Your Locker</div>
              </div>
              {myLocker.notes && (
                <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text2)', background: 'var(--surface2)', borderRadius: 8, padding: '8px 16px', maxWidth: 300, textAlign: 'center' }}>📝 {myLocker.notes}</div>
              )}
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)' }}>
                Assigned {myLocker.assigned_at ? new Date(myLocker.assigned_at).toLocaleDateString() : ''}
                {myLocker.assigned_by ? ` by ${myLocker.assigned_by}` : ''}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">🗄️</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No locker assigned yet</div>
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>Contact your lab manager to get a locker assigned.</div>
            </div>
          )}
        </div>
      )}

      {canEdit(session) && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 500, margin: '0 auto 28px' }}>
            {Array.from({ length: TOTAL_LOCKERS }, (_, i) => {
              const num = i + 1
              const locker = lockerMap[num] || { locker_number: num, user_name: null }
              const occupied = !!locker.user_name
              const unavailable = !!locker.is_unavailable && !occupied
              const isAssigning = assigning === num
              const borderColor = isAssigning ? 'var(--accent)' : occupied ? '#0369a1' : unavailable ? '#9ca3af' : 'var(--border)'
              const bgColor = isAssigning ? 'var(--accent-light)' : occupied ? '#e0f2fe' : unavailable ? '#f3f4f6' : 'var(--surface)'
              return (
                <div key={num}
                  style={{ borderRadius: 10, border: `2px solid ${borderColor}`, background: bgColor, padding: '12px 8px', textAlign: 'center', cursor: occupied || unavailable ? 'default' : 'pointer', transition: 'all 0.15s' }}
                  onClick={() => { if (!occupied && !unavailable && !isAssigning) { setAssigning(num); setSelectedStudent(''); setNotes('') } }}
                  onMouseEnter={e => { if (!occupied && !unavailable && !isAssigning) e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onMouseLeave={e => { if (!occupied && !unavailable && !isAssigning) e.currentTarget.style.borderColor = 'var(--border)' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%', background: occupied ? '#0369a1' : unavailable ? '#9ca3af' : 'var(--surface2)', color: occupied || unavailable ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
                    {num}
                  </div>
                  {occupied ? (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#0369a1', lineHeight: 1.3, wordBreak: 'break-word' }}>{locker.user_name}</div>
                      <button className="btn btn-sm btn-danger" style={{ marginTop: 6, fontSize: 10, padding: '2px 8px' }} onClick={e => { e.stopPropagation(); unassignLocker(locker) }}>Remove</button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, color: unavailable ? '#6b7280' : 'var(--text3)', fontWeight: unavailable ? 600 : 400 }}>{unavailable ? 'Unavailable' : 'Available'}</div>
                      <label onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6, cursor: 'pointer', marginBottom: 0 }}>
                        <input type="checkbox" checked={unavailable} onChange={() => toggleUnavailable(num)} style={{ width: 'auto' }} />
                        <span style={{ fontSize: 10, color: 'var(--text3)' }}>Unavailable</span>
                      </label>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {assigning !== null && (
            <div style={{ background: 'var(--surface)', border: '2px solid var(--accent)', borderRadius: 'var(--radius-lg)', padding: 20, maxWidth: 400, margin: '0 auto 20px' }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
                Assign Locker #{assigning}
                <button onClick={() => setAssigning(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)' }}>×</button>
              </div>
              <div className="field">
                <label>Assign to lab user *</label>
                <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)} autoFocus>
                  <option value="">— Select lab user —</option>
                  {students.map(s => {
                    const hasLocker = lockers.find(l => l.user_id === s.id)
                    return (
                      <option key={s.id} value={s.id} disabled={!!hasLocker}>
                        {firstName(s)}{s.project_group ? ` (${s.project_group})` : ''}{hasLocker ? ` — Locker ${hasLocker.locker_number}` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="field">
                <label>Notes (optional)</label>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. key given, combination shared…" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => assignLocker(assigning)} disabled={!selectedStudent}>Assign locker</button>
                <button className="btn" onClick={() => setAssigning(null)}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 500, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>All Lockers</div>
            <table>
              <thead>
                <tr><th style={{ width: 80 }}>Locker #</th><th>Assigned To</th><th>Group</th><th>Assigned Date</th><th>Notes</th><th style={{ width: 100 }}></th></tr>
              </thead>
              <tbody>
                {Array.from({ length: TOTAL_LOCKERS }, (_, i) => {
                  const num = i + 1
                  const locker = lockerMap[num] || { locker_number: num, user_name: null }
                  const student = locker.user_id ? students.find(s => s.id === locker.user_id) : null
                  const isUnavailable = !!locker.is_unavailable && !locker.user_name
                  return (
                    <tr key={num} style={{ background: locker.user_name ? 'transparent' : isUnavailable ? '#f3f4f6' : 'var(--surface2)' }}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', background: locker.user_name ? '#0369a1' : isUnavailable ? '#9ca3af' : 'var(--border)', color: locker.user_name || isUnavailable ? '#fff' : 'var(--text3)', fontWeight: 700, fontSize: 13 }}>{num}</span>
                      </td>
                      <td>
                        {locker.user_name
                          ? <span style={{ fontWeight: 600, color: '#0369a1' }}>{locker.user_name}</span>
                          : isUnavailable
                            ? <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Unavailable</span>
                            : <span style={{ fontSize: 12, color: 'var(--text3)' }}>Available</span>
                        }
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text2)' }}>{student?.project_group || '—'}</td>
                      <td style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{locker.assigned_at ? new Date(locker.assigned_at).toLocaleDateString() : '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{locker.notes || '—'}</td>
                      <td>
                        {locker.user_name ? (
                          <button className="btn btn-sm btn-danger" style={{ fontSize: 11 }} onClick={() => unassignLocker(locker)}>Remove</button>
                        ) : isUnavailable ? (
                          <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => toggleUnavailable(num)}>Mark available</button>
                        ) : (
                          <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => { setAssigning(num); setSelectedStudent(''); setNotes('') }}>Assign</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN TRAINING RECORDS COMPONENT
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// USER TRAINING HUB — avatar card grid; clicking a user opens a
// panel with inner tabs (Documents/Vehicle/Equipment/Alarm/Exam/
// Locker) showing that user's records. Tabs carry status dots.
// "All users" toggle renders the classic full-list audit view.
// ══════════════════════════════════════════════════════════════
const HUB_TABS = [
  { key: 'safety',    label: 'Safety' },
  { key: 'fresh',     label: 'Documents' },
  { key: 'golf',      label: 'Vehicle' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'alarm',     label: 'Alarm' },
  { key: 'locker',    label: 'Locker' },
]

function UserTrainingHub({ students, session, subTab, setSubTab }) {
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [viewMode, setViewMode] = useState('user')     // 'user' | 'all' (audit)
  const [statuses, setStatuses] = useState(null)       // userId -> { fresh|golf|equipment|alarm|locker|safety: ok|pend|none }
  const [freshCounts, setFreshCounts] = useState({})   // userId -> { approved, total } for card badges
  const [search, setSearch] = useState('')

  const editable = canEdit(session)
  const ownUser = students.find(u => session.userId === u.id || session.username === u.name)
  const effSelectedId = selectedUserId ?? (ownUser && !editable ? ownUser.id : null)
  const selectedUser = students.find(u => u.id === effSelectedId) || null
  // stable single-element array so child useEffect([students]) doesn't loop
  const selectedArr = useMemo(() => selectedUser ? [selectedUser] : [], [selectedUser?.id])

  useEffect(() => { loadStatuses() }, [students])

  async function loadStatuses() {
    const ids = students.map(s => s.id)
    if (!ids.length) { setStatuses({}); return }
    const [fresh, golf, equip, alarm, lockers, safety] = await Promise.all([
      sb.from('training_fresh').select('user_id, admin_approved, certificate_url').in('user_id', ids),
      sb.from('training_golf_car').select('user_id, trained').in('user_id', ids),
      sb.from('training_equipment').select('user_id, passed_exam').in('user_id', ids),
      sb.from('training_building_alarm').select('user_id, trained').in('user_id', ids),
      sb.from('student_lockers').select('user_id').in('user_id', ids),
      sb.from('lab_safety_progress').select('user_id, step_number, completed').in('user_id', ids),
    ])
    const map = {}
    const get = uid => map[uid] || (map[uid] = {})
    const agg = (rows, key, okFn) => {
      const by = {}
      ;(rows.data || []).forEach(r => { (by[r.user_id] = by[r.user_id] || []).push(r) })
      ids.forEach(uid => {
        const rs = by[uid] || []
        get(uid)[key] = rs.length === 0 ? 'none' : rs.every(okFn) ? 'ok' : 'pend'
      })
    }
    agg(fresh, 'fresh', r => r.admin_approved)
    agg(golf, 'golf', r => r.trained)
    agg(equip, 'equipment', r => r.passed_exam)
    agg(alarm, 'alarm', r => r.trained)
    ids.forEach(uid => { get(uid).locker = (lockers.data || []).some(r => r.user_id === uid) ? 'ok' : 'none' })
    const safetyCount = {}
    ;(safety.data || []).forEach(r => { if (r.completed) safetyCount[r.user_id] = (safetyCount[r.user_id] || 0) + 1 })
    ids.forEach(uid => { const n = safetyCount[uid] || 0; get(uid).safety = n === 0 ? 'none' : n >= 4 ? 'ok' : 'pend' })
    setStatuses(map)
    const fc = {}
    ids.forEach(uid => {
      const rs = (fresh.data || []).filter(r => r.user_id === uid && r.certificate_url)
      fc[uid] = { approved: rs.filter(r => r.admin_approved).length, total: rs.length }
    })
    setFreshCounts(fc)
  }

  const DOT = {
    ok:   <span style={{ color: '#16a34a' }}>✓</span>,
    pend: <span style={{ color: '#d97706' }}>⏳</span>,
    none: <span style={{ color: 'var(--text3)' }}>—</span>,
  }

  const searchFiltered = search.trim()
    ? students.filter(u => fullName(u).toLowerCase().includes(search.toLowerCase()))
    : students

  function renderTabContent(mode) {
    const su = mode === 'user'
    // onChanged: children call this after any add/approve/delete so the
    // card badges, progress bars and tab status dots update without a reload
    const props = su
      ? { students: selectedArr, session, hideChrome: true, onChanged: loadStatuses }
      : { students, session, onChanged: loadStatuses }
    switch (subTab) {
      case 'golf':      return <GolfCarTraining {...props} />
      case 'equipment': return <EquipmentTraining {...props} />
      case 'alarm':     return <BuildingAlarm {...props} />
      case 'locker':
        return su && selectedUser
          ? <StudentLocker session={session} panelUser={selectedUser} onChanged={loadStatuses} />
          : <StudentLocker session={session} onChanged={loadStatuses} />
      case 'safety':
        return mode === 'all'
          ? <SafetyTab asTab />
          : <SafetyTab asTab targetUser={selectedUser} />
      default:          return <FreshTraining {...props} />
    }
  }

  return (
    <div>
      {editable && (
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name…"
          style={{ marginBottom: 14, maxWidth: 240, fontSize: 13, padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: '100%' }} />
      )}

      {/* ── Avatar card grid ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 20 }}>
        {searchFiltered.map(u => {
          const fc = freshCounts[u.id] || { approved: 0, total: 0 }
          const pct = fc.total ? Math.round(fc.approved / fc.total * 100) : 0
          const selected = u.id === effSelectedId
          return (
            <div key={u.id} className="manage-card" onClick={() => setSelectedUserId(selected ? null : u.id)}
              style={{ width: 176, flexShrink: 0, padding: '16px 12px 14px', cursor: 'pointer', ...(selected ? { borderColor: 'var(--accent)', background: 'var(--accent-light)', boxShadow: '0 6px 18px rgba(29,158,117,0.18)' } : {}) }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><UserAvatar user={u} size={56} /></div>
              <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName(u)}</div>
              {u.degree && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.degree}</div>}
              <div style={{ marginTop: 8 }}><CompletionBadge approved={fc.approved} total={fc.total} /></div>
              {fc.total > 0 && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#16a34a' : '#d97706', borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{pct}%</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Detail panel ── */}
      {!selectedUser ? (
        students.length > 0 && (
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)', padding: '8px 0 16px' }}>
            Select a lab user above to view their training profile.
          </div>
        )
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface)', maxWidth: 900, margin: '0 auto' }}>
          {/* Header: identity + view toggle */}
          <div style={{ padding: '12px 16px', background: 'var(--row-a-strong)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <UserAvatar user={selectedUser} size={40} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{fullName(selectedUser)}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Training profile{selectedUser.degree ? ` · Supervisor: ${selectedUser.degree}` : ''}</div>
              </div>
            </div>
            {editable && (
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                {[['user', 'This user'], ['all', 'All users']].map(([m, label]) => (
                  <button key={m} onClick={() => setViewMode(m)}
                    style={{ border: 'none', padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--sans)', background: viewMode === m ? 'var(--accent)' : 'var(--surface)', color: viewMode === m ? '#fff' : 'var(--text2)' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Inner tab bar with status dots */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface)', overflowX: 'auto' }}>
            {HUB_TABS.map(t => (
              <button key={t.key} onClick={() => setSubTab(t.key)}
                style={{ padding: '10px 14px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: subTab === t.key ? 600 : 500, cursor: 'pointer', color: subTab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${subTab === t.key ? 'var(--accent)' : 'transparent'}`, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {DOT[statuses?.[selectedUser.id]?.[t.key] || 'none']} {t.label}
              </button>
            ))}
          </div>
          {/* Content */}
          <div style={{ padding: 16 }}>
            {renderTabContent(viewMode === 'all' && editable ? 'all' : 'user')}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TrainingRecords() {
  const { session, toast, sidebarSubTab, setSidebarSubTab } = useAppStore()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [expiryAlerts, setExpiryAlerts] = useState([])

  // Deep-link from exam notification — jump to exam tab via sidebar
  useEffect(() => {
    if (localStorage.getItem('examEquipment') && !sidebarSubTab) setSidebarSubTab('exam')
  }, [])

  const subTab = sidebarSubTab || 'safety'

  useEffect(() => { loadStudents() }, [])

  async function loadStudents() {
    setLoading(true)
    let data
    if (session?.loginMode === 'solo') {
      data = [{ id: session.userId, name: session.username, email: session.username }]
    } else if (session?.role === 'lab_user') {
      const { data: d } = await sb.from('users').select('*').eq('id', session.userId).single()
      data = d ? [d] : []
    } else {
      let q = sb.from('users').select('*').eq('role', 'lab_user').eq('is_active', true).order('name')
      if (session?.organizationId) q = q.eq('organization_id', session.organizationId)
      const { data: d } = await q
      data = d || []
    }
    setStudents(data)
    setLoading(false)
    checkExpiry(data.map(u => u.id))
  }

  async function checkExpiry(orgUserIds) {
    if (!session?.userId) return
    let q = sb.from('training_equipment')
      .select('*, equipment_inventory(equipment_name, nickname), users(name, last_name)')
      .lt('expires_at', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    if (orgUserIds?.length) q = q.in('user_id', orgUserIds)
    const { data } = await q
    if (data?.length) setExpiryAlerts(data)
  }

  const isSolo = session?.loginMode === 'solo'

  return (
    <div>
      {session?.role === 'lab_user' && <UserTrainingSchedule session={session} />}
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="section-title">Training Records</div>
          <HelpPanel screen="training" />
        </div>
        {!isSolo && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{students.length} active lab user{students.length !== 1 ? 's' : ''}</div>}
      </div>

      {expiryAlerts.length > 0 && (
        <div style={{ background: 'var(--warn-light)', border: '1px solid #fcd34d', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#92400e' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>⏰ Retraining Reminders</div>
          {expiryAlerts.map((a, i) => (
            <div key={i} style={{ fontSize: 13 }}>
              • <strong>{a.users?.last_name || a.users?.name}</strong> — {a.equipment_inventory?.nickname || a.equipment_inventory?.equipment_name} expires {a.expires_at}
              {new Date(a.expires_at) < new Date() ? ' (EXPIRED)' : ''}
            </div>
          ))}
        </div>
      )}

      {subTab === 'exam' && <ExamTab session={session} />}

      {subTab !== 'exam' && (
        loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : students.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <div>No lab users yet. Add students in Admin → Students.</div>
          </div>
        ) : (
          <UserTrainingHub
            students={students}
            session={session}
            subTab={HUB_TABS.some(t => t.key === subTab) ? subTab : 'fresh'}
            setSubTab={setSidebarSubTab}
          />
        )
      )}
    </div>
  )
}
