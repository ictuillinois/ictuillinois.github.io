import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'

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
const STATUS_STYLE   = { pending: PENDING_STYLE, approved: APPROVED_STYLE, denied: DENIED_STYLE }

function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
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
  const [signature, setSignature] = useState('')
  const [readToEnd, setReadToEnd] = useState(false)

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

  async function submitSignature() {
    if (!vehicle.trim())   { toast('Which vehicle is this for?'); return }
    if (!signature.trim()) { toast('Type your full name to sign.'); return }
    if (!readToEnd)        { toast('Please confirm you have read the agreement.'); return }
    setSaving(true)
    const { error } = await sb.from('vehicle_agreements').insert({
      user_id: myId,
      organization_id: orgId,
      vehicle_name: vehicle.trim(),
      agreement_text: text,          // what THEY agreed to, frozen on the row
      agreement_version: version,
      signature_name: signature.trim(),
      status: 'pending',
    })
    setSaving(false)
    if (error) { toast('Could not submit: ' + error.message); return }
    setVehicle(''); setSignature(''); setReadToEnd(false)
    toast('Submitted — your lab manager will review it.')
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

      {/* ── lab user: sign it ─────────────────────────────────────────── */}
      {!isManager && text && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Sign the agreement</div>
          <div className="field">
            <label>Vehicle <span style={{ color: '#c84b2f' }}>*</span></label>
            <input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="e.g. ICT golf cart" />
          </div>
          <div className="field">
            <label>Type your full name to sign <span style={{ color: '#c84b2f' }}>*</span></label>
            <input value={signature} onChange={e => setSignature(e.target.value)} placeholder="Your full name" />
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, lineHeight: 1.5, cursor: 'pointer', margin: '6px 0 12px' }}>
            <input type="checkbox" checked={readToEnd} onChange={e => setReadToEnd(e.target.checked)}
              style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2, accentColor: '#1D9E75' }} />
            <span>I have read the Vehicle Use Agreement above and agree to it.</span>
          </label>
          <button className="btn btn-primary" onClick={submitSignature} disabled={saving}>
            {saving ? 'Submitting…' : 'Sign & submit for approval'}
          </button>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
            Signing is a request. Access starts when a lab manager approves it.
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
                    <td style={{ padding: '10px 12px' }}>{r.vehicle_name}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      {fmt(r.signed_at)}
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        signed “{r.signature_name}”{r.agreement_version !== version ? ` · v${r.agreement_version}` : ''}
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
                        {r.status === 'pending' ? (
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
