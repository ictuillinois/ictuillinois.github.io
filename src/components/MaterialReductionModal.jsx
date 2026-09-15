import { useState, useEffect, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'
import { REDUCTION_METHODS, CONTAINER_TYPES } from '../lib/materialFields'

// Material reduction: derive new materials from an existing one.
//
// Today that means fractionation — splitting an aggregate across sieves. Each
// selected size becomes its OWN material, because that is what fractionation
// physically produces: a separate container per fraction, each needing its own
// barcode, quantity, storage location and QR label.
//
// Every question from the parent's Material tab is copied onto the child, since
// the parent's project, source, PI and container are known. The copy is a
// starting point — the child is an ordinary material and stays fully editable.
//
// Deliberately NOT copied (each is per-container, and copying would be wrong):
//   barcode_id / barcode_scanned_at  a unique index forbids duplicates, and a
//                                    fraction needs its own label
//   locations / storage_*            the fraction has not been stored yet
//   photos                           they show the parent's container
const NOT_COPIED = new Set([
  'id', 'created_at', 'updated_at',
  'barcode_id', 'barcode_scanned_at',
  'locations', 'storage_confirmed', 'storage_notes',
  'photos',
  'parent_material_id', 'reduction_method', 'reduction_value',
  'organization_id', 'solo_owner_id',
])

const TYPE_LABEL = {
  aggregate: 'Aggregate', asphalt_binder: 'Asphalt Binder',
  plant_mix: 'Plant Mix', cores: 'Cores', other: 'Other',
}

// `parentMaterial` opens this with the parent already chosen — the "+ Add
// Reduction" tab on a material. Same component rather than a second one: the
// create path carries the NOT_COPIED rules and the session scope-stamping, and
// a copy of that is a copy that drifts.
export default function MaterialReductionModal({ session, isSolo, viewingWorkspaceOwnerId, onClose, onCreated, inline = false, parentMaterial = null, parentProject = null }) {
  const { toast } = useAppStore()
  const fixed = !!parentMaterial
  const [projects, setProjects] = useState(parentProject ? [parentProject] : [])
  const [materials, setMaterials] = useState(parentMaterial ? [parentMaterial] : [])
  const [loading, setLoading] = useState(!fixed)
  const [matLoading, setMatLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [projectId, setProjectId] = useState(parentProject?.id || '')
  const [materialId, setMaterialId] = useState(parentMaterial?.id || '')
  const [type, setType] = useState(parentMaterial?.material_type || '')
  const [method, setMethod] = useState('')
  const [sizes, setSizes] = useState([])
  const [contType, setContType] = useState('')
  const [count, setCount] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { if (!fixed) loadProjects() }, [fixed])

  async function loadProjects() {
    // Scope the PROJECT list the same way the Projects screen does. Materials
    // are deliberately not scoped this way — see loadMaterials below.
    const q = isSolo
      ? sb.from('projects').select('id, name, project_id')
          .eq('solo_owner_id', viewingWorkspaceOwnerId || session?.userId || '00000000-0000-0000-0000-000000000000')
      : sb.from('projects').select('id, name, project_id')
          .eq('organization_id', session?.organizationId || '00000000-0000-0000-0000-000000000000')
    const { data, error } = await q.order('name')
    setLoading(false)
    if (error) { toast('Could not load projects: ' + error.message, true); return }
    setProjects(data || [])
  }

  // Materials are fetched by project_id only — the same access path the
  // Materials tab uses. Filtering them by organization_id here instead would
  // silently hide every row created before that column was added (it is NULL
  // on those), so a project full of materials would read as empty. RLS is
  // what actually scopes this.
  async function loadMaterials(pid) {
    setMaterials([])
    if (!pid) return
    setMatLoading(true)
    const { data, error } = await sb.from('project_materials').select('*')
      .eq('project_id', pid).order('created_at')
    setMatLoading(false)
    if (error) { toast('Could not load materials: ' + error.message, true); return }
    setMaterials(data || [])
  }

  const projectMaterials = materials

  const parent = useMemo(() => materials.find(m => m.id === materialId) || null, [materials, materialId])

  // Picking a material pre-selects its own type — the reduction is normally of
  // the material as it is — but it stays changeable.
  useEffect(() => {
    if (!parent) return
    setType(parent.material_type || '')
    setMethod('')
    setSizes([])
  }, [parent?.id])

  const methods = REDUCTION_METHODS[type] || []

  // Every type currently offers exactly one method, so making the user pick it
  // from a one-option dropdown is a step that teaches them nothing.
  useEffect(() => {
    const list = REDUCTION_METHODS[type] || []
    if (list.length === 1) setMethod(list[0].key)
  }, [type])

  const activeMethod = methods.find(x => x.key === method) || null

  function toggleSize(s) {
    setSizes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  const kind = activeMethod?.kind || null

  async function create() {
    setErr('')
    if (!parent) { setErr('Select a project and a material.'); return }
    if (!activeMethod) { setErr('Select a reduction method.'); return }
    if (kind === 'sizes'      && !sizes.length)         { setErr('Select at least one sieve size.'); return }
    if (kind === 'containers' && !contType)             { setErr('Select a container type.'); return }
    if (kind === 'containers' && !(parseInt(count) > 0)) { setErr('Enter how many containers.'); return }
    if (kind === 'samples'    && !(parseInt(count) > 0)) { setErr('Enter how many samples.'); return }
    setSaving(true)

    // Copy every parent field except the per-container ones above, then stamp
    // the reduction.
    const base = () => {
      const copy = {}
      for (const [k, v] of Object.entries(parent)) {
        if (NOT_COPIED.has(k) || k === 'projects') continue
        copy[k] = v
      }
      return {
        ...copy,
        // Stamped from the session, not inherited. A parent created before
        // project_materials gained these columns has them NULL, and the RLS
        // WITH CHECK rejects an insert that is scoped to nobody — the whole
        // batch would fail with a policy violation.
        organization_id: isSolo ? null : (session?.organizationId || null),
        solo_owner_id: isSolo ? (viewingWorkspaceOwnerId || session?.userId || null) : null,
        parent_material_id: parent.id,
        reduction_method: activeMethod.key,
      }
    }

    let rows
    if (kind === 'sizes') {
      // Ordered by the canonical list so the rows read coarse-to-fine rather
      // than in click order.
      rows = activeMethod.sizes.filter(x => sizes.includes(x)).map(size => ({
        ...base(),
        name: `${parent.name || 'Material'} — ${size}`,
        // The fraction IS this size, so its sieve list is just that size
        // rather than the parent's full set.
        agg_sieve_sizes: [size],
        reduction_value: size,
      }))
    } else if (kind === 'containers') {
      const n = parseInt(count)
      rows = [{
        ...base(),
        name: `${parent.name || 'Material'} — Split`,
        container_type: contType,
        container_count: n,
        reduction_value: `${n} × ${contType}`,
      }]
    } else if (kind === 'samples') {
      const n = parseInt(count)
      rows = [{
        ...base(),
        name: `${parent.name || 'Material'} — Split`,
        reduction_count: n,
        reduction_value: `${n} sample${n !== 1 ? 's' : ''}`,
      }]
    } else {
      rows = [{
        ...base(),
        name: `${parent.name || 'Material'} — Reduction`,
        other_info: note || null,
        reduction_value: null,
      }]
    }

    const { data, error } = await sb.from('project_materials').insert(rows).select('id')
    setSaving(false)
    if (error) { setErr(error.message); return }
    toast(`Created ${data.length} material${data.length !== 1 ? 's' : ''} from ${parent.name} ✓`)
    onCreated?.()
    onClose()
  }

  const box = { background: 'var(--surface2)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 14 }

  // A plain element, NOT a component defined in the body. `const Shell = ({children}) => …`
  // is a new component type on every render, so React would unmount and
  // remount everything inside it — the count and note inputs would lose focus
  // after each keystroke.
  const content = (
    <>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : (
          <>
            {!fixed && (
            <div style={box}>
              <div className="field">
                <label>Project <span style={{ color: '#c84b2f' }}>*</span></label>
                <select value={projectId} onChange={e => { setProjectId(e.target.value); setMaterialId(''); setType(''); setMethod(''); setSizes([]); loadMaterials(e.target.value) }}>
                  <option value="">— Select a project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.project_id ? ` · ${p.project_id}` : ''}</option>)}
                </select>
              </div>

              {projectId && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Material <span style={{ color: '#c84b2f' }}>*</span></label>
                  {matLoading ? (
                    <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading materials…</div>
                  ) : projectMaterials.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text3)' }}>This project has no materials yet.</div>
                  ) : (
                    <select value={materialId} onChange={e => setMaterialId(e.target.value)}>
                      <option value="">— Select a material —</option>
                      {projectMaterials.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name || 'Material'}{m.material_type ? ` · ${TYPE_LABEL[m.material_type] || m.material_type}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
            )}

            {parent && (
              <div style={box}>
                <div className="field">
                  <label>Material type</label>
                  <select value={type} onChange={e => { setType(e.target.value); setMethod(''); setSizes([]) }}>
                    {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Reduction method <span style={{ color: '#c84b2f' }}>*</span></label>
                  {methods.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                      No reduction methods available for {TYPE_LABEL[type] || 'this type'} yet.
                    </div>
                  ) : (
                    <select value={method} onChange={e => { setMethod(e.target.value); setSizes([]) }}>
                      <option value="">— Select a method —</option>
                      {methods.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </select>
                  )}
                </div>
              </div>
            )}

            {kind === 'sizes' && (
              <div style={box}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Sieve sizes — coarse to pan
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
                  One new material is created per size selected — a #8 fraction is not the same material as a 3/4" one.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {activeMethod.sizes.map(sz => {
                    const on = sizes.includes(sz)
                    return (
                      <button key={sz} type="button" onClick={() => toggleSize(sz)}
                        style={{ padding: '6px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                          background: on ? 'var(--accent)' : 'var(--surface)',
                          color: on ? '#fff' : 'var(--text2)' }}>
                        {sz}
                      </button>
                    )
                  })}
                </div>
                {sizes.length > 0 && (
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text2)' }}>
                    Will create <strong>{sizes.length}</strong> material{sizes.length !== 1 ? 's' : ''}:{' '}
                    {activeMethod.sizes.filter(x => sizes.includes(x)).map(x => `${parent.name} — ${x}`).join(', ')}
                  </div>
                )}
              </div>
            )}

            {kind === 'containers' && (
              <div style={box}>
                <div className="field">
                  <label>Splitting to? <span style={{ color: '#c84b2f' }}>*</span></label>
                  <select value={contType} onChange={e => setContType(e.target.value)}>
                    <option value="">— Select container type —</option>
                    {CONTAINER_TYPES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Number of containers <span style={{ color: '#c84b2f' }}>*</span></label>
                  <input type="number" min="1" style={{ maxWidth: 200 }} value={count}
                    onChange={e => setCount(e.target.value)} placeholder="e.g. 5" />
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
                  Creates <strong>one</strong> reduction material. Splitting a drum into several containers
                  does not change what the binder is — it is the same material, in more containers.
                </div>
              </div>
            )}

            {kind === 'samples' && (
              <div style={box}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Splitting to how many samples? <span style={{ color: '#c84b2f' }}>*</span></label>
                  <input type="number" min="1" style={{ maxWidth: 200 }} value={count}
                    onChange={e => setCount(e.target.value)} placeholder="e.g. 3" />
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
                  Creates <strong>one</strong> reduction material recording how many samples it was split into.
                </div>
              </div>
            )}

            {kind === 'note' && (
              <div style={box}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Reduction note</label>
                  <textarea rows={4} value={note} onChange={e => setNote(e.target.value)}
                    placeholder="Describe how this material was reduced…" />
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)' }}>
                  Creates <strong>one</strong> reduction material. You can fill in the rest on its Material tab.
                </div>
              </div>
            )}

            {err && (
              <div style={{ background: '#fdf0ed', border: '1px solid #e24b4a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#c0392b' }}>
                {err}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {!inline && <button className="btn" onClick={onClose}>Cancel</button>}
              <button className="btn btn-primary" onClick={create}
                disabled={saving || !kind || (kind === 'sizes' && !sizes.length)}>
                {saving ? 'Creating…'
                  : kind === 'sizes'
                    ? `Create ${sizes.length || ''} material${sizes.length === 1 ? '' : 's'}`
                    : 'Create reduction material'}
              </button>
            </div>
          </>
        )}
    </>
  )

  return inline ? (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
        Reduce <strong>{parentMaterial?.name || 'this material'}</strong>. The new material keeps this one's
        details — you can edit them on its own Material tab afterwards.
      </div>
      {content}
    </div>
  ) : (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflowY: 'auto' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 620, width: '100%', marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>⚗️ Material Reduction</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 18, lineHeight: 1.6 }}>
          Split an existing material into new ones. Each selected size becomes its own material in the same
          project, with the parent's details copied over — you can edit any of them afterwards.
        </div>
        {content}
      </div>
    </div>
  )
}
