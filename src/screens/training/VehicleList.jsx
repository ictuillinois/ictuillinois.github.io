import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'

// Training Records → ICT vehicle list. Lab managers and admins only (the
// sidebar entry is gated, and org_vehicles only lets them write).
//
// These are the vehicles a lab user can ask to drive on the Vehicle → Forms
// tab. "Remove" hides a vehicle from new requests rather than deleting it:
// people who already asked for it, or were confirmed on it, keep that record.
export default function VehicleList({ session }) {
  const { toast } = useAppStore()
  const orgId = session?.organizationId
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState({ name: '', description: '' })
  const [editing, setEditing] = useState(null)   // { id, name, description }
  const [busy, setBusy] = useState(false)
  const [counts, setCounts] = useState({})       // vehicle id → { requested, confirmed }

  useEffect(() => { load() }, [orgId])

  async function load() {
    const [{ data, error }, { data: access }] = await Promise.all([
      sb.from('org_vehicles').select('*').eq('organization_id', orgId).order('name'),
      sb.from('vehicle_access').select('vehicle_id, status').eq('organization_id', orgId),
    ])
    setLoading(false)
    if (error) {
      toast(/org_vehicles|schema cache|does not exist/i.test(error.message)
        ? 'The vehicle list is not set up yet — run vehicle_list_setup.sql in the SQL Editor.'
        : 'Could not load vehicles: ' + error.message)
      return
    }
    setRows(data || [])
    const c = {}
    ;(access || []).forEach(a => { c[a.vehicle_id] = c[a.vehicle_id] || { requested: 0, confirmed: 0 }; if (a.status !== 'declined') c[a.vehicle_id][a.status]++ })
    setCounts(c)
  }

  async function add() {
    const name = draft.name.trim()
    if (!name) { toast('Give the vehicle a name.'); return }
    if (rows.some(r => r.is_active && r.name.trim().toLowerCase() === name.toLowerCase())) { toast('That vehicle is already on the list.'); return }
    setBusy(true)
    const { error } = await sb.from('org_vehicles').insert({ organization_id: orgId, name, description: draft.description.trim() || null, created_by: session?.username || null })
    setBusy(false)
    if (error) { toast('Could not add: ' + error.message); return }
    setDraft({ name: '', description: '' })
    load()
  }

  async function save() {
    const name = editing.name.trim()
    if (!name) { toast('A vehicle needs a name.'); return }
    setBusy(true)
    const { data, error } = await sb.from('org_vehicles').update({ name, description: editing.description.trim() || null }).eq('id', editing.id).select('id')
    setBusy(false)
    if (error || !data?.length) { toast('Could not save: ' + (error?.message || 'not allowed')); return }
    setEditing(null)
    load()
  }

  async function setActive(r, on) {
    if (!on && !confirm(`Remove "${r.name}" from the list? Lab users will no longer be able to request it. Existing requests and confirmations are kept.`)) return
    const { data, error } = await sb.from('org_vehicles').update({ is_active: on }).eq('id', r.id).select('id')
    if (error || !data?.length) { toast('Could not update: ' + (error?.message || 'not allowed')); return }
    load()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  const active = rows.filter(r => r.is_active)
  const removed = rows.filter(r => !r.is_active)
  const row = (r, idx) => (
    <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 6,
      background: idx % 2 === 0 ? 'var(--row-a-strong)' : 'var(--row-b-strong)', opacity: r.is_active ? 1 : 0.6 }}>
      {editing?.id === r.id ? (
        <>
          <div style={{ display: 'grid', gap: 6 }}>
            <input value={editing.name} onChange={e => setEditing(x => ({ ...x, name: e.target.value }))} maxLength={60} placeholder="Vehicle name" />
            <input value={editing.description} onChange={e => setEditing(x => ({ ...x, description: e.target.value }))} maxLength={120} placeholder="Description (optional)" />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-primary" onClick={save} disabled={busy}>Save</button>
            <button className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {[r.description, counts[r.id] && `${counts[r.id].requested} waiting · ${counts[r.id].confirmed} confirmed`].filter(Boolean).join(' · ') || 'No requests yet'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {r.is_active ? (
              <>
                <button className="btn btn-sm" onClick={() => setEditing({ id: r.id, name: r.name, description: r.description || '' })}>Edit</button>
                <button className="btn btn-sm" style={{ color: '#c84b2f' }} onClick={() => setActive(r, false)}>Remove</button>
              </>
            ) : (
              <button className="btn btn-sm" onClick={() => setActive(r, true)}>Restore</button>
            )}
          </div>
        </>
      )}
    </div>
  )

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="section-header"><div className="section-title">ICT vehicle list</div></div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        The vehicles lab users can request on <strong>Vehicle → Forms</strong>. You confirm each request on <strong>Vehicle → Training records</strong>, once that person's forms are approved.
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 16, display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Add a vehicle</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
          <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} maxLength={60} placeholder="e.g. Golf Cart" onKeyDown={e => { if (e.key === 'Enter') add() }} />
          <input value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} maxLength={120} placeholder="Description (optional)" onKeyDown={e => { if (e.key === 'Enter') add() }} />
        </div>
        <div><button className="btn btn-sm btn-primary" onClick={add} disabled={busy}>Add vehicle</button></div>
      </div>

      {active.length === 0
        ? <div className="empty-state" style={{ padding: 24 }}>No vehicles yet. Add the first one above.</div>
        : active.map(row)}

      {removed.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}>Removed vehicles ({removed.length})</summary>
          <div style={{ marginTop: 8 }}>{removed.map(row)}</div>
        </details>
      )}
    </div>
  )
}
