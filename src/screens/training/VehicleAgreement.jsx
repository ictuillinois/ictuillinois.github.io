import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import StorageService, { useStorageUrl } from '../../lib/storage/StorageService'
// Lazy: pdf.js is large, and only a lab user reading the manual needs it
const PdfSteps = lazy(() => import('../../components/PdfSteps'))

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
    note: 'University of Illinois form · download, sign, upload the signed copy · your lab manager approves it',
  },
  {
    key: 'operators-brief',
    kind: 'sign',
    name: "Campus Unlicensed Motorized Vehicle Operator's Brief",
    file: 'campus-unlicensed-motorized-vehicle-operators-brief.pdf',
    note: 'Download, sign, upload the signed copy · your lab manager approves it',
  },
  {
    key: 'golf-cart-manual',
    kind: 'read',
    name: 'Golf Cart Manual',
    file: 'golf-cart-manual.pdf',
    note: 'Read it step by step, then confirm you understood it — nothing to upload',
    // One title per page of the PDF, shown above that page in the step view
    steps: ['Requirements, scope of use and rules', 'Before you drive', 'Driving', 'Stopping and parking', 'Switching off, returning and charging'],
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
//       'requests'  — vehicle requests to confirm (shown on Training records);
//       'forms'     — the three university documents (and, for a lab user,
//                     where they upload or confirm each one).
export default function VehicleAgreement({ labUsers = [], session, isManager, onChanged, view = 'agreement' }) {
  const { toast } = useAppStore()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // lab user signing form
  // ICT vehicle list (Training Records → ICT vehicle list) and who asked for
  // which. A lab user ticks the vehicles they need; a lab manager confirms
  // each one once that person's forms are approved.
  const [vehicles, setVehicles] = useState([])
  const [access, setAccess] = useState([])
  const [vehiclesReady, setVehiclesReady] = useState(true)
  const [vehBusy, setVehBusy] = useState(null)
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
    loadVehicles()
  }

  async function loadVehicles() {
    if (!orgId) return
    const [v, a] = await Promise.all([
      sb.from('org_vehicles').select('*').eq('organization_id', orgId).order('name'),
      isManager
        ? sb.from('vehicle_access').select('*').eq('organization_id', orgId).order('requested_at', { ascending: false })
        : sb.from('vehicle_access').select('*').eq('user_id', myId),
    ])
    // Not set up yet (vehicle_list_setup.sql not run): hide the feature, never break the tab
    if (v.error || a.error) { setVehiclesReady(false); return }
    setVehiclesReady(true)
    setVehicles(v.data || [])
    setAccess(a.data || [])
  }

  // A lab user's request: tick to ask, untick to withdraw. A confirmed vehicle
  // stays; a declined one can be asked for again.
  async function toggleVehicle(v, on) {
    const mine = access.find(a => a.vehicle_id === v.id && String(a.user_id) === String(myId))
    if (mine?.status === 'confirmed') return
    setVehBusy(v.id)
    let error
    if (mine) ({ error } = await sb.from('vehicle_access').delete().eq('id', mine.id))
    if (!error && on) ({ error } = await sb.from('vehicle_access').insert({ user_id: myId, vehicle_id: v.id, organization_id: orgId }))
    setVehBusy(null)
    if (error) { toast('Could not save your choice: ' + error.message); return }
    loadVehicles()
  }

  async function decideVehicle(a, status) {
    setVehBusy(a.id)
    const { data, error } = await sb.from('vehicle_access').update({
      status,
      confirmed_by: status === 'requested' ? null : String(myId || ''),
      confirmed_by_name: status === 'requested' ? null : (session?.username || null),
      confirmed_at: status === 'requested' ? null : new Date().toISOString(),
    }).eq('id', a.id).select('id')
    setVehBusy(null)
    if (error || !data?.length) { toast('Could not save: ' + (error?.message || 'not allowed')); return }
    toast(status === 'confirmed' ? 'Vehicle confirmed.' : status === 'declined' ? 'Request declined.' : 'Reopened.')
    loadVehicles(); onChanged?.()
  }

  const vehicleName = id => vehicles.find(v => v.id === id)?.name || 'Removed vehicle'
  // What this person asked for, written on each form they submit so the
  // archive shows which vehicles the signature was for.
  const requestedNames = () => access.filter(a => String(a.user_id) === String(myId) && a.status !== 'declined')
    .map(a => vehicleName(a.vehicle_id)).join(', ') || null

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
      vehicle_name: requestedNames(),
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
      vehicle_name: requestedNames(),
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

  // The archive shows the people this panel is FOR — one lab user when opened
  // from their card, every lab user in "All users". It used to show every
  // agreement in the organization whoever was selected, so Gaurav's signed
  // forms appeared under Akash. A person's other accounts (same email) count
  // as theirs: a form uploaded from either is still their form.
  const shownRows = useMemo(() => {
    if (!isManager || !labUsers.length) return rows
    const emails = new Set(labUsers.map(u => (u.email || '').trim().toLowerCase()).filter(Boolean))
    const own = new Set(labUsers.map(u => String(u.id)))
    orgPeople.forEach(u => { if (emails.has((u.email || '').trim().toLowerCase())) own.add(String(u.id)) })
    return rows.filter(r => own.has(String(r.user_id)))
  }, [rows, labUsers, orgPeople, isManager])

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
      {/* ── which vehicles (lab user) ─────────────────────────────────── */}
      {view === 'forms' && !isManager && vehiclesReady && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 12, display: 'grid', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Which vehicles do you need?</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Tick one or more. Your lab manager confirms each one after approving your forms below.</div>
          </div>
          {(() => {
            const mineOf = id => access.find(a => a.vehicle_id === id && String(a.user_id) === String(myId))
            const list = vehicles.filter(v => v.is_active || mineOf(v.id))
            if (!list.length) return <div style={{ fontSize: 13, color: 'var(--text3)' }}>No vehicles have been listed yet. Ask your lab manager.</div>
            return list.map(v => {
              const a = mineOf(v.id)
              const label = { requested: 'waiting for your lab manager', confirmed: 'confirmed', declined: 'declined — tick to ask again' }[a?.status]
              const style = a?.status === 'confirmed' ? APPROVED_STYLE : a?.status === 'declined' ? DENIED_STYLE : PENDING_STYLE
              return (
                <label key={v.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 0, cursor: a?.status === 'confirmed' ? 'default' : 'pointer', fontSize: 14 }}>
                  <input type="checkbox" style={{ width: 'auto' }}
                    checked={!!a && a.status !== 'declined'} disabled={a?.status === 'confirmed' || vehBusy === v.id}
                    onChange={e => toggleVehicle(v, e.target.checked)} />
                  <span style={{ fontWeight: 500 }}>{v.name}</span>
                  {v.description && <span style={{ fontSize: 12, color: 'var(--text3)' }}>{v.description}</span>}
                  {a && <span style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.fg, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{label}</span>}
                </label>
              )
            })
          })()}
        </div>
      )}

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

            {!isManager && (() => {
              const redoing = !!redo[doc.key]
              const open = !latest || redoing || latest.status === 'denied'
              const status = latest && (
                <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.fg,
                                 borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{latest.status}</span>
                  <span style={{ color: 'var(--text3)' }}>
                    {doc.kind === 'read' ? 'Confirmed' : 'Submitted'} {fmt(latest.signed_at)}
                    {latest.status === 'approved' && ` · access from ${fmt(latest.approved_at)}`}
                    {latest.status === 'pending' && ' · waiting for your lab manager to review it'}
                    {latest.status === 'denied' && ' · not approved — please sign and upload it again'}
                  </span>
                  {/* Re-submitting is allowed: a form can be rejected, or a new
                      one needed next year. The old row stays. */}
                  {(latest.status === 'approved' || latest.status === 'acknowledged') && !redoing && (
                    <button className="btn btn-sm" onClick={() => setRedo(r => ({ ...r, [doc.key]: true }))}>
                      {doc.kind === 'read' ? 'Read it again' : 'Submit a new one'}
                    </button>
                  )}
                </div>
              )

              if (doc.kind === 'read') return (
                <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'grid', gap: 12 }}>
                  {status}
                  {open && (
                    // The manual, page by page from the published PDF, ending in
                    // the acknowledgement — reaching the end is the point.
                    <Suspense fallback={<div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}>
                      <PdfSteps url={docUrl(doc)} title={doc.name} steps={doc.steps}
                        confirmLabel="I have read and understood the ICT Golf Cart Standard Operating Procedure, and I will follow it."
                        busy={uploading === doc.key}
                        onConfirm={() => confirmRead(doc)} />
                    </Suspense>
                  )}
                </div>
              )

              // A form to sign: four plain steps, so it is clear the signed copy
              // is what counts and that a lab manager has to approve it.
              const stepStyle = () => ({ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10, alignItems: 'start' })
              const num = (n, done) => (
                <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700,
                  background: done ? 'var(--accent)' : 'var(--surface2)', color: done ? '#fff' : 'var(--text2)', border: done ? 'none' : '1px solid var(--border)' }}>
                  {done ? '✓' : n}
                </span>
              )
              const submitted = latest && !open
              return (
                <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'grid', gap: 12 }}>
                  {status}
                  {open && (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={stepStyle()}>{num(1)}<div style={{ fontSize: 13 }}>
                        <strong>Download the form.</strong>{' '}
                        <a href={docUrl(doc)} target="_blank" rel="noreferrer" download style={{ color: 'var(--accent)', fontWeight: 600 }}>Download {doc.file}</a>
                      </div></div>
                      <div style={stepStyle()}>{num(2)}<div style={{ fontSize: 13 }}>
                        <strong>Sign it.</strong> Print and sign it, or sign the PDF electronically. An unsigned form will not be approved.
                      </div></div>
                      <div style={stepStyle()}>{num(3)}<div style={{ fontSize: 13, display: 'grid', gap: 6 }}>
                        <strong>Upload the signed copy.</strong>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                          onChange={e => setFiles(f => ({ ...f, [doc.key]: e.target.files?.[0] || null }))}
                          style={{ width: 'auto' }} />
                        {files[doc.key] && (
                          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                            {files[doc.key].name} · {(files[doc.key].size / 1024).toFixed(0)} KB
                          </span>
                        )}
                        <div>
                          <button className="btn btn-sm btn-primary"
                            onClick={() => submitForm(doc)} disabled={uploading === doc.key || !files[doc.key]}>
                            {uploading === doc.key ? 'Uploading…' : 'Upload signed form'}
                          </button>
                        </div>
                      </div></div>
                      <div style={stepStyle()}>{num(4)}<div style={{ fontSize: 13, color: 'var(--text2)' }}>
                        <strong style={{ color: 'var(--text)' }}>Your lab manager reviews and approves it.</strong> Vehicle access starts on the day it is approved.
                      </div></div>
                    </div>
                  )}
                  {submitted && latest.status === 'pending' && (
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>Uploaded. Nothing more to do until your lab manager has reviewed it.</div>
                  )}
                </div>
              )
            })()}
          </div>
        )
      })}


      {/* ── requested vehicles (lab manager) ──────────────────────────── */}
      {view === 'requests' && isManager && vehiclesReady && (() => {
        const accountsOf = id => {
          const u = orgPeople.find(x => String(x.id) === String(id)) || labUsers.find(x => String(x.id) === String(id))
          const em = (u?.email || '').trim().toLowerCase()
          const ids = new Set([String(id)])
          if (em) orgPeople.forEach(x => { if ((x.email || '').trim().toLowerCase() === em) ids.add(String(x.id)) })
          return ids
        }
        const shown = new Set()
        labUsers.forEach(u => accountsOf(u.id).forEach(i => shown.add(i)))
        const list = access.filter(a => !labUsers.length || shown.has(String(a.user_id)))
        // Confirm only once the vehicle forms are done: both signed forms
        // approved and the manual acknowledged (newest submission of each).
        const missingFor = userId => {
          const ids = accountsOf(userId)
          const latest = k => rows.find(r => r.doc_key === k && ids.has(String(r.user_id)))
          const m = []
          if (latest('driver-approval')?.status !== 'approved') m.push('Driver Approval Form approved')
          if (latest('operators-brief')?.status !== 'approved') m.push("Operator's Brief approved")
          if (latest('golf-cart-manual')?.status !== 'acknowledged') m.push('Golf Cart Manual read')
          return m
        }
        return (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Requested vehicles</div>
            {list.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', padding: '4px 0 8px' }}>No vehicle requests.</div>
            ) : list.map(a => {
              const missing = a.status === 'requested' ? missingFor(a.user_id) : []
              const style = a.status === 'confirmed' ? APPROVED_STYLE : a.status === 'declined' ? DENIED_STYLE : PENDING_STYLE
              return (
                <div key={a.id} className="va-row" style={{ marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{vehicleName(a.vehicle_id)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, lineHeight: 1.6 }}>
                      {nameOf(a.user_id)} · requested {fmt(a.requested_at)}
                      {a.status !== 'requested' && a.confirmed_by_name && <> · {a.status} by {a.confirmed_by_name} {fmt(a.confirmed_at)}</>}
                      {missing.length > 0 && <> · <span style={{ color: '#92400e' }}>still needs: {missing.join(', ')}</span></>}
                    </div>
                  </div>
                  <span className="va-status" style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.fg, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {a.status}
                  </span>
                  <div className="va-actions">
                    {a.status === 'requested' ? (
                      <>
                        {/* Greyed out, not just disabled: the green primary style
                            made a locked Confirm look clickable. */}
                        <button className="btn btn-sm btn-primary" disabled={missing.length > 0 || vehBusy === a.id}
                          style={missing.length > 0 ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                          title={missing.length ? 'Approve the forms first' : 'Confirm this vehicle for them'}
                          onClick={() => decideVehicle(a, 'confirmed')}>Confirm</button>
                        <button className="btn btn-sm" style={{ color: '#c84b2f' }} disabled={vehBusy === a.id} onClick={() => decideVehicle(a, 'declined')}>Decline</button>
                      </>
                    ) : (
                      <button className="btn btn-sm" disabled={vehBusy === a.id} onClick={() => decideVehicle(a, 'requested')}>Reopen</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* ── the archive ───────────────────────────────────────────────── */}
      {view === 'agreement' && <>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        {isManager ? 'Signed agreements' : 'Your agreements'}
      </div>
      {shownRows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>Nothing signed yet.</div>
      ) : (
        // A list, not a table. Seven columns of mixed-width content forced the
        // document name to wrap over five lines and pushed the Approve buttons
        // past the right edge of the container, where a manager could not see
        // them without scrolling sideways. Rows cannot overflow.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shownRows.map(r => {
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
