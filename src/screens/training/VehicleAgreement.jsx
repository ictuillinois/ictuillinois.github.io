import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import StorageService, { useStorageUrl } from '../../lib/storage/StorageService'

// The three vehicle documents, served from public/. They are university
// documents and are offered exactly as published — re-creating them as web
// fields would produce something that is no longer the university's form.
//
// `kind` is the whole difference in how each is handled:
//   'sign' — download, sign on paper, upload the signed copy, manager approves
//   'read' — read it and confirm; there is nothing for a manager to approve
//            because nothing was submitted.
const VEHICLE_DOCS = [
  {
    key: 'driver-approval',
    kind: 'sign',
    name: 'Departmental Driver Approval Form',
    file: 'Departmental-Driver-Approval-Form.pdf',
    note: 'University of Illinois form · download, sign, then upload the signed copy',
  },
  {
    key: 'operators-brief',
    kind: 'sign',
    name: "Campus Unlicensed Motorized Vehicle Operator's Brief",
    file: 'campus-unlicensed-motorized-vehicle-operators-brief.pdf',
    note: 'Download, sign, then upload the signed copy',
  },
  {
    key: 'golf-cart-manual',
    kind: 'read',
    name: 'Golf Cart Manual',
    file: 'golf-cart-manual.pdf',
    note: 'Read it, then confirm below — nothing to upload',
  },
]

const docUrl = d => `${import.meta.env.BASE_URL}${d.file}`
const docByKey = k => VEHICLE_DOCS.find(d => d.key === k)

// Vehicle use agreement.
//
// The agreement IS the three university documents: a lab user signs and
// uploads the two forms and confirms the manual; a lab manager approves or
// denies; every submission stays as the archive. Access is dated from the
// APPROVAL, not the signature — signing is a request, approving is the grant.
//
// There used to be an editable agreement text with a version number on top
// of the forms. It was removed (Oct 2026): the forms already are the terms,
// and a second, optional text beside them only raised the question of which
// one counted. Rows signed back then keep their agreement_text/version.

const PENDING_STYLE  = { bg: '#fff8f0', border: '#f59e0b', fg: '#92400e' }
const APPROVED_STYLE = { bg: '#E1F5EE', border: '#9FE1CB', fg: '#085041' }
const DENIED_STYLE   = { bg: '#fdf0ed', border: '#f0c9bd', fg: '#c84b2f' }
const STATUS_STYLE   = { pending: PENDING_STYLE, approved: APPROVED_STYLE, denied: DENIED_STYLE, acknowledged: APPROVED_STYLE }

function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// The stored reference may be an `ext:provider:id` string rather than a URL —
// personal uploads follow the user's storage provider — so it is resolved
// rather than dropped into an href.
function FileLink({ url, name }) {
  const resolved = useStorageUrl(url)
  if (!resolved) return <span>{name || 'signed form'}</span>
  return (
    <a href={resolved} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>
      📎 {name || 'signed form'}
    </a>
  )
}

// view: 'agreement' — the signed archive;
//       'forms'     — the three university documents (and, for a lab user,
//                     where they upload or confirm each one).
export default function VehicleAgreement({ labUsers = [], session, isManager, onChanged, view = 'agreement' }) {
  const { toast } = useAppStore()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // lab user signing form
  const [vehicle, setVehicle] = useState('')
  const [files, setFiles] = useState({})
  const [uploading, setUploading] = useState(null)   // doc key being uploaded
  const [redo, setRedo] = useState({})

  const orgId = session?.organizationId || null
  const myId = session?.userId
  // Every account in the org, for naming who submitted. labUsers only holds
  // active lab users, so a form uploaded from someone's other account (one
  // person can have a lab-user and a lab-manager row) or by a deactivated
  // user showed as just "Lab user".
  const [orgPeople, setOrgPeople] = useState([])
  useEffect(() => {
    if (!isManager || !orgId) return
    sb.from('users').select('id, name, last_name, nick_name, email, role, is_active').eq('organization_id', orgId)
      .then(({ data }) => setOrgPeople(data || []))
  }, [isManager, orgId])

  useEffect(() => { load() }, [session?.userId, labUsers.length])

  async function load() {
    setLoading(true)
    const agr = isManager
      ? await sb.from('vehicle_agreements').select('*').eq('organization_id', orgId).order('signed_at', { ascending: false })
      : await sb.from('vehicle_agreements').select('*').eq('user_id', myId).order('signed_at', { ascending: false })
    if (agr.error) console.warn('[vehicle agreement] load failed:', agr.error.message)
    setRows(agr.data || [])
    setLoading(false)
    if (isManager && agr.data?.length) fileMissingCopies(agr.data)
  }

  // Every signed form also belongs in the Documents tab. Forms submitted
  // before that copy existed (Sept 24 2026), or whose copy failed, are filed
  // here — once, for the newest form per person and document.
  async function fileMissingCopies(all) {
    const latest = new Map()
    all.forEach(r => { if (r.file_url && !latest.has(r.user_id + '|' + r.doc_key)) latest.set(r.user_id + '|' + r.doc_key, r) })
    if (!latest.size) return
    const userIds = [...new Set([...latest.values()].map(r => r.user_id))]
    const { data: have, error } = await sb.from('training_fresh').select('user_id, certificate_name').in('user_id', userIds)
    if (error) { console.warn('[vehicle agreement] Documents check failed:', error.message); return }
    const filed = new Set((have || []).map(h => String(h.user_id) + '|' + h.certificate_name))
    for (const r of latest.values()) {
      const name = docByKey(r.doc_key)?.name
      if (name && !filed.has(String(r.user_id) + '|' + name)) await archiveToDocuments(r.user_id, r.file_url, r.status === 'approved', name)
    }
  }

  async function submitForm(doc) {
    const file = files[doc.key]
    if (!file) { toast('Attach your signed form.'); return }
    setUploading(doc.key)
    let url = null
    try {
      // personal: true — a signed form belongs to the person, so it follows
      // their chosen storage provider like any other personal document.
      const path = `vehicle-agreements/${myId}/${doc.key}-${Date.now()}-${file.name}`
      const res = await StorageService.upload('project-files', path, file, { personal: true })
      url = res?.url || res?.ref || null
    } catch (e) {
      setUploading(null)
      toast('Upload failed: ' + (e.message || 'Check storage settings.'))
      return
    }
    if (!url) { setUploading(null); toast('Upload produced no file reference.'); return }

    const { error } = await sb.from('vehicle_agreements').insert({
      user_id: myId,
      organization_id: orgId,
      doc_key: doc.key,
      vehicle_name: vehicle.trim() || null,
      file_url: url,
      file_name: file.name,
      status: 'pending',
    })
    if (error) { setUploading(null); toast('Could not submit: ' + error.message); return }

    // Mirror into the Documents tab. Same shape the safety steps use, so the
    // signed form sits with every other certificate rather than only inside
    // this tab. Not approved yet — the manager's decision sets that.
    const filed = await archiveToDocuments(myId, url, false, doc.name)

    setUploading(null)
    setFiles(f => ({ ...f, [doc.key]: null }))
    toast(filed ? 'Submitted — your lab manager will review it. A copy is in your Documents tab.'
                : 'Submitted — your lab manager will review it. The copy for your Documents tab could not be saved; your lab manager\'s view will file it.')
    load(); onChanged?.()
  }

  // Mirrors the signed form into training_fresh, which is what the Documents
  // tab lists. Best effort: failing to file a copy must not lose the
  // submission that already saved.
  async function archiveToDocuments(userId, url, approved, certName) {
    // Supabase reports failure in `error`, it does not throw — the old
    // try/catch alone let a failed copy pass as filed.
    try {
      const { data: rows, error: findErr } = await sb.from('training_fresh').select('id')
        .eq('user_id', userId).eq('certificate_name', certName).limit(1)
      if (findErr) throw findErr
      const payload = {
        certificate_url: url,
        certificate_uploaded_at: new Date().toISOString(),
        admin_approved: approved,
      }
      const { error } = rows?.[0]
        ? await sb.from('training_fresh').update(payload).eq('id', rows[0].id)
        : await sb.from('training_fresh').insert({ user_id: userId, certificate_name: certName, organization_id: orgId, ...payload })
      if (error) throw error
      return true
    } catch (e) {
      console.warn('[vehicle agreement] Documents copy failed:', e.message)
      return false
    }
  }

  // A manual that was read produces an acknowledgement, not a submission:
  // there is no artefact for a manager to check, so it is recorded as
  // 'acknowledged' rather than sitting in an approval queue forever.
  async function confirmRead(doc) {
    setUploading(doc.key)
    const { error } = await sb.from('vehicle_agreements').insert({
      user_id: myId,
      organization_id: orgId,
      doc_key: doc.key,
      vehicle_name: vehicle.trim() || null,
      status: 'acknowledged',
    })
    setUploading(null)
    if (error) { toast('Could not record that: ' + error.message); return }
    setRedo(r => ({ ...r, [doc.key]: false }))
    toast('Recorded — thank you.')
    load(); onChanged?.()
  }

  async function decide(row, status) {
    setSaving(true)
    const { error } = await sb.from('vehicle_agreements').update({
      status,
      approved_by: myId,
      approved_by_name: session?.username || null,
      approved_at: new Date().toISOString(),
    }).eq('id', row.id)
    setSaving(false)
    if (error) { toast('Could not save the decision: ' + error.message); return }
    // Keep the Documents copy in step, or a manager approving here would still
    // see the same form sitting unapproved under Documents.
    if (row.file_url) await archiveToDocuments(row.user_id, row.file_url, status === 'approved', docByKey(row.doc_key)?.name || row.doc_key)
    toast(status === 'approved' ? 'Access approved.' : 'Request denied.')
    load(); onChanged?.()
  }

  const nameOf = id => {
    const u = labUsers.find(x => x.id === id) || orgPeople.find(x => x.id === id)
    if (!u) return 'Unknown account'
    const n = u.nick_name?.trim() || [u.name, u.last_name].filter(Boolean).join(' ') || u.email
    const tag = u.role === 'user' ? ' (lab manager account)' : u.role === 'admin' ? ' (admin account)' : !u.is_active && u.is_active !== undefined ? ' (deactivated)' : ''
    return n + tag
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 30 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      {/* ── the three documents ───────────────────────────────────────── */}
      {view === 'forms' && VEHICLE_DOCS.map(doc => {
        const mine = rows.filter(r => r.doc_key === doc.key && (isManager ? false : r.user_id === myId))
        const latest = mine[0]                     // rows come back newest first
        const st = latest ? (STATUS_STYLE[latest.status] || PENDING_STYLE) : null
        return (
          <div key={doc.key} style={{ border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
            <a href={docUrl(doc)} target="_blank" rel="noreferrer" download
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                       background: 'var(--surface2)', textDecoration: 'none', color: 'var(--text)' }}>
              <span style={{ fontSize: 24 }}>{doc.kind === 'read' ? '📖' : '📄'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{doc.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>{doc.note}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Open ⬇</span>
            </a>

            {!isManager && (
              <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
                {latest ? (
                  <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.fg,
                                   borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
                      {latest.status}
                    </span>
                    <span style={{ color: 'var(--text3)' }}>
                      {doc.kind === 'read' ? 'Confirmed' : 'Submitted'} {fmt(latest.signed_at)}
                      {latest.status === 'approved' && ` · access from ${fmt(latest.approved_at)}`}
                    </span>
                    {/* Re-submitting is allowed: a form can be rejected, or a
                        new one needed next year. The old row stays. */}
                    {latest.status !== 'pending' && (
                      <button className="btn btn-sm" onClick={() => setRedo(r => ({ ...r, [doc.key]: true }))}>
                        {doc.kind === 'read' ? 'Confirm again' : 'Submit a new one'}
                      </button>
                    )}
                  </div>
                ) : null}

                {(!latest || redo[doc.key]) && (doc.kind === 'sign' ? (
                  <div style={{ marginTop: latest ? 12 : 0 }}>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                      onChange={e => setFiles(f => ({ ...f, [doc.key]: e.target.files?.[0] || null }))}
                      style={{ width: 'auto' }} />
                    {files[doc.key] && (
                      <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 8px' }}>
                        {files[doc.key].name} · {(files[doc.key].size / 1024).toFixed(0)} KB
                      </div>
                    )}
                    <div>
                      <button className="btn btn-sm btn-primary" style={{ marginTop: 8 }}
                        onClick={() => submitForm(doc)} disabled={uploading === doc.key}>
                        {uploading === doc.key ? 'Uploading…' : 'Upload signed form'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: latest ? 12 : 0 }}>
                    <button className="btn btn-sm btn-primary"
                      onClick={() => confirmRead(doc)} disabled={uploading === doc.key}>
                      {uploading === doc.key ? 'Saving…' : 'I have read this manual'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {view === 'forms' && !isManager && (
        <div className="field" style={{ marginBottom: 16 }}>
          <label>Vehicle</label>
          <input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="e.g. ICT golf cart" />
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
            Recorded with anything you submit above. Access starts when a lab manager approves.
          </div>
        </div>
      )}

      {/* ── the archive ───────────────────────────────────────────────── */}
      {view === 'agreement' && <>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        {isManager ? 'Signed agreements' : 'Your agreements'}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>Nothing signed yet.</div>
      ) : (
        // A list, not a table. Seven columns of mixed-width content forced the
        // document name to wrap over five lines and pushed the Approve buttons
        // past the right edge of the container, where a manager could not see
        // them without scrolling sideways. Rows cannot overflow.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(r => {
            const st = STATUS_STYLE[r.status] || PENDING_STYLE
            const doc = docByKey(r.doc_key)
            return (
              // Fixed columns (.va-row in index.css): with flex-wrap the badge
              // and buttons landed wherever each row's text ended.
              <div key={r.id} className={'va-row' + (isManager ? '' : ' no-actions')}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.4 }}>
                    {doc?.name || r.doc_key}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, lineHeight: 1.6 }}>
                    {isManager && <>{nameOf(r.user_id)} · </>}
                    {doc?.kind === 'read' ? 'Read & confirmed' : 'Submitted'} {fmt(r.signed_at)}
                    {r.vehicle_name && <> · {r.vehicle_name}</>}
                    {r.status === 'approved' && <> · access from <strong>{fmt(r.approved_at)}</strong></>}
                    {r.approved_by_name && <> · by {r.approved_by_name}</>}
                  </div>
                  {r.file_url && (
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      <FileLink url={r.file_url} name={r.file_name} />
                    </div>
                  )}
                </div>

                <span className="va-status" style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.fg,
                               borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {r.status}
                </span>

                {isManager && (
                  <div className="va-actions">
                    {r.status === 'acknowledged' ? (
                      // Nothing to approve on a manual someone read — no
                      // artefact exists to check.
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>no approval needed</span>
                    ) : r.status === 'pending' ? (
                      <>
                        <button className="btn btn-sm btn-primary" disabled={saving} onClick={() => decide(r, 'approved')}>Approve</button>
                        <button className="btn btn-sm" disabled={saving} style={{ color: '#c84b2f' }} onClick={() => decide(r, 'denied')}>Deny</button>
                      </>
                    ) : (
                      <button className="btn btn-sm" disabled={saving} onClick={() => decide(r, 'pending')}>Reopen</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      </>}
    </div>
  )
}
