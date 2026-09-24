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
// A lab user reads the agreement, types their name and submits; a lab manager
// approves or denies; every submission stays as the archive. Access is dated
// from the APPROVAL, not the signature — signing is a request, approving is
// the grant.
//
// The agreement text is stored on each signed row, not looked up when the
// archive is displayed. The wording is editable, and an archive that shows
// today's text beside a signature from last year is not a record of anything.

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

export default function VehicleAgreement({ labUsers = [], session, isManager, onChanged }) {
  const { toast } = useAppStore()
  const [text, setText] = useState('')
  const [version, setVersion] = useState(1)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingText, setEditingText] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  // lab user signing form
  const [vehicle, setVehicle] = useState('')
  const [files, setFiles] = useState({})
  const [uploading, setUploading] = useState(null)   // doc key being uploaded
  const [redo, setRedo] = useState({})

  const orgId = session?.organizationId || null
  const myId = session?.userId

  useEffect(() => { load() }, [session?.userId, labUsers.length])

  async function load() {
    setLoading(true)
    const [{ data: cfg }, agr] = await Promise.all([
      sb.from('settings').select('key, value').in('key', ['vehicle_agreement_text', 'vehicle_agreement_version']),
      isManager
        ? sb.from('vehicle_agreements').select('*').eq('organization_id', orgId).order('signed_at', { ascending: false })
        : sb.from('vehicle_agreements').select('*').eq('user_id', myId).order('signed_at', { ascending: false }),
    ])
    const map = Object.fromEntries((cfg || []).map(r => [r.key, r.value]))
    setText(map.vehicle_agreement_text || '')
    setVersion(Number(map.vehicle_agreement_version) || 1)
    if (agr.error) console.warn('[vehicle agreement] load failed:', agr.error.message)
    setRows(agr.data || [])
    setLoading(false)
  }

  async function saveText() {
    setSaving(true)
    const { error } = await sb.from('settings').upsert({ key: 'vehicle_agreement_text', value: draft }, { onConflict: 'key' })
    setSaving(false)
    if (error) { toast('Could not save the agreement: ' + error.message); return }
    setText(draft); setEditingText(false)
    toast('Agreement saved. New signatures will use this wording.')
  }

  // Bumping the version does not invalidate anything on its own — it marks
  // which wording each signature was made against, so the archive can show
  // "signed against an older version" rather than quietly implying otherwise.
  async function bumpVersion() {
    const next = version + 1
    const { error } = await sb.from('settings').upsert({ key: 'vehicle_agreement_version', value: String(next) }, { onConflict: 'key' })
    if (error) { toast('Could not update the version: ' + error.message); return }
    setVersion(next)
    toast(`Agreement is now version ${next}. Existing signatures stay on their own version.`)
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
      agreement_text: text || null,     // the manager's instructions, as shown
      agreement_version: version,
      file_url: url,
      file_name: file.name,
      status: 'pending',
    })
    if (error) { setUploading(null); toast('Could not submit: ' + error.message); return }

    // Mirror into the Documents tab. Same shape the safety steps use, so the
    // signed form sits with every other certificate rather than only inside
    // this tab. Not approved yet — the manager's decision sets that.
    await archiveToDocuments(myId, url, false, doc.name)

    setUploading(null)
    setFiles(f => ({ ...f, [doc.key]: null }))
    toast('Submitted — your lab manager will review it.')
    load(); onChanged?.()
  }

  // Mirrors the signed form into training_fresh, which is what the Documents
  // tab lists. Best effort: failing to file a copy must not lose the
  // submission that already saved.
  async function archiveToDocuments(userId, url, approved, certName) {
    try {
      const { data: rows } = await sb.from('training_fresh').select('id')
        .eq('user_id', userId).eq('certificate_name', certName).limit(1)
      const payload = {
        certificate_url: url,
        certificate_uploaded_at: new Date().toISOString(),
        admin_approved: approved,
      }
      if (rows?.[0]) await sb.from('training_fresh').update(payload).eq('id', rows[0].id)
      else await sb.from('training_fresh').insert({
        user_id: userId, certificate_name: certName,
        organization_id: orgId, ...payload,
      })
    } catch (e) {
      console.warn('[vehicle agreement] Documents copy failed:', e.message)
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
      agreement_version: version,
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
    const u = labUsers.find(x => x.id === id)
    return u ? (u.nick_name?.trim() || [u.name, u.last_name].filter(Boolean).join(' ')) : 'Lab user'
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 30 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      {/* ── the agreement ─────────────────────────────────────────────── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Vehicle Use Agreement</div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>v{version}</span>
          {isManager && !editingText && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={() => { setDraft(text); setEditingText(true) }}>Edit text</button>
              <button className="btn btn-sm" onClick={bumpVersion} title="Marks new signatures as a new version">New version</button>
            </div>
          )}
        </div>
        <div style={{ padding: 16 }}>
          {editingText ? (
            <>
              <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={14}
                placeholder="Paste the vehicle use agreement here. Lab users read this before signing."
                style={{ width: '100%', fontSize: 13, lineHeight: 1.65, fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-sm btn-primary" onClick={saveText} disabled={saving}>Save agreement</button>
                <button className="btn btn-sm" onClick={() => setEditingText(false)}>Cancel</button>
              </div>
            </>
          ) : text ? (
            <div style={{ fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap', maxHeight: 340, overflowY: 'auto',
                          padding: '4px 2px', color: 'var(--text2)' }}>
              {text}
            </div>
          ) : (
            // Say who can fix it. A lab user seeing "no agreement" with no
            // explanation assumes the page is broken.
            <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>
              {isManager
                ? 'No agreement text yet — choose “Edit text” and paste it in. Lab users cannot sign until it exists.'
                : 'The agreement has not been published yet. Your lab manager will add it.'}
            </div>
          )}
        </div>
      </div>

      {/* ── the three documents ───────────────────────────────────────── */}
      {VEHICLE_DOCS.map(doc => {
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

      {!isManager && (
        <div className="field" style={{ marginBottom: 16 }}>
          <label>Vehicle</label>
          <input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="e.g. ICT golf cart" />
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
            Recorded with anything you submit above. Access starts when a lab manager approves.
          </div>
        </div>
      )}

      {/* ── the archive ───────────────────────────────────────────────── */}
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        {isManager ? 'Signed agreements' : 'Your agreements'}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>Nothing signed yet.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {(isManager ? ['Lab user', 'Vehicle', 'Signed', 'Status', 'Decided by', 'Access from', ''] 
                            : ['Vehicle', 'Signed', 'Status', 'Decided by', 'Access from'])
                  .map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase',
                                         letterSpacing: '0.06em', color: 'var(--text3)', fontFamily: 'var(--mono)',
                                         borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const st = STATUS_STYLE[r.status] || PENDING_STYLE
                return (
                  <tr key={r.id}>
                    {isManager && <td style={{ padding: '10px 12px' }}>{nameOf(r.user_id)}</td>}
                    <td style={{ padding: '10px 12px' }}>{docByKey(r.doc_key)?.name || r.doc_key}</td>
                    <td style={{ padding: '10px 12px' }}>{r.vehicle_name || '—'}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      {fmt(r.signed_at)}
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {r.file_url
                          ? <FileLink url={r.file_url} name={r.file_name} />
                          : (r.signature_name ? `signed “${r.signature_name}”` : '—')}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.fg,
                                     borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{r.approved_by_name || '—'}</td>
                    {/* Access is dated from the approval, not the signature. */}
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      {r.status === 'approved' ? fmt(r.approved_at) : '—'}
                    </td>
                    {isManager && (
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {/* Nothing to approve on a manual someone read —
                            there is no artefact to check. */}
                        {r.status === 'acknowledged' ? (
                          <span style={{ fontSize: 12, color: 'var(--text3)' }}>read &amp; confirmed</span>
                        ) : r.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-sm btn-primary" disabled={saving} onClick={() => decide(r, 'approved')}>Approve</button>
                            <button className="btn btn-sm" disabled={saving} style={{ color: '#c84b2f' }} onClick={() => decide(r, 'denied')}>Deny</button>
                          </div>
                        ) : (
                          <button className="btn btn-sm" disabled={saving} onClick={() => decide(r, 'pending')}>Reopen</button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
