import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import { SUBPROJECT_MAX, loadSubprojects, linkMap, sharedColours } from '../../lib/subprojects'

// A project's Sub projects tab: add, rename and remove sub projects, and tick
// which top-level material folders belong to each. A folder can be ticked
// under several; a folder ticked under none is on the main project.
// Reductions are not listed — they follow their folder.
export default function SubprojectsTab({ project, readOnly = false, onChanged }) {
  const { session, toast } = useAppStore()
  const [subs, setSubs] = useState([])
  const [links, setLinks] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState(null)   // { id, name }
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [project?.id])

  async function load() {
    const [r, { data: mats }] = await Promise.all([
      loadSubprojects(project.id),
      sb.from('project_materials').select('id, name, material_type, parent_material_id, created_at')
        .eq('project_id', project.id).is('parent_material_id', null).order('created_at'),
    ])
    setSubs(r.subs); setLinks(r.links); setMissing(r.missing)
    setFolders(mats || [])
    setLoading(false)
    onChanged?.(r.subs.length)
  }

  const map = linkMap(links)
  const colours = sharedColours(folders.map(f => f.id), map)
  const subName = id => subs.find(s => s.id === id)?.name

  async function add() {
    const n = name.trim()
    if (!n) return
    if (n.length > SUBPROJECT_MAX) { toast(`A sub project name can be at most ${SUBPROJECT_MAX} characters.`); return }
    if (subs.some(s => s.name.trim().toLowerCase() === n.toLowerCase())) { toast('This project already has a sub project with that name.'); return }
    setBusy(true)
    const { error } = await sb.from('project_subprojects').insert({
      project_id: project.id, name: n,
      organization_id: project.organization_id || null, solo_owner_id: project.solo_owner_id || null,
      created_by: session?.username || null,
    })
    setBusy(false)
    if (error) { toast(error.code === '23505' ? 'This project already has a sub project with that name.' : 'Could not add: ' + error.message); return }
    setName('')
    load()
  }

  async function rename() {
    const n = renaming.name.trim()
    if (!n || n.length > SUBPROJECT_MAX) { toast(`Give it a name of 1–${SUBPROJECT_MAX} characters.`); return }
    if (subs.some(s => s.id !== renaming.id && s.name.trim().toLowerCase() === n.toLowerCase())) { toast('This project already has a sub project with that name.'); return }
    const { data, error } = await sb.from('project_subprojects').update({ name: n }).eq('id', renaming.id).select('id')
    if (error || !data?.length) { toast('Could not rename: ' + (error?.message || 'not allowed')); return }
    setRenaming(null)
    load()
  }

  async function remove(s) {
    if (!confirm(`Remove the sub project "${s.name}"?`)) return
    const { data, error } = await sb.from('project_subprojects').delete().eq('id', s.id).select('id')
    if (error || !data?.length) {
      toast(error?.code === '23503' ? 'Disconnect its folders first.' : 'Could not remove: ' + (error?.message || 'not allowed'))
      return
    }
    load()
  }

  async function toggle(folderId, subId, on) {
    const { error } = on
      ? await sb.from('material_subprojects').insert({ material_id: folderId, subproject_id: subId, project_id: project.id })
      : await sb.from('material_subprojects').delete().eq('material_id', folderId).eq('subproject_id', subId)
    if (error && error.code !== '23505') toast('Could not save: ' + error.message)
    load()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (missing) return (
    <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--surface2)', borderRadius: 10, padding: '12px 16px' }}>
      Sub projects are not set up in this database yet. An admin needs to run <code>sub_projects_setup.sql</code>.
    </div>
  )

  const onMain = folders.filter(f => !(map[f.id] || []).length)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--text2)' }}>
        Split <b>{project.name}</b> into sub projects, such as lots or phases, and tick the material folders that belong to each.
        A folder can be in more than one; a shared folder gets its own colour everywhere it appears. Folders you do not tick stay on the main project.
      </div>

      {!readOnly && (
        <div style={{ display: 'grid', gap: 4, maxWidth: 460 }}>
          <label htmlFor="new-subproject" style={{ marginBottom: 0 }}>New sub project</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="new-subproject" value={name} maxLength={SUBPROJECT_MAX} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="e.g. Lot 3" />
            <button className="btn btn-purple" onClick={add} disabled={busy || !name.trim()}>Add</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)' }}>
            <span>Printed on the label, so it is short.</span>
            <span style={{ fontFamily: 'var(--mono)', color: name.length >= SUBPROJECT_MAX ? '#c84b2f' : 'var(--text3)' }}>{name.length} / {SUBPROJECT_MAX}</span>
          </div>
        </div>
      )}

      {subs.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>No sub projects yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {subs.map(s => {
            const used = folders.filter(f => (map[f.id] || []).includes(s.id)).length
            return (
              <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', background: 'var(--accent3-light)' }}>
                  {renaming?.id === s.id ? (
                    <>
                      <input value={renaming.name} maxLength={SUBPROJECT_MAX} onChange={e => setRenaming(x => ({ ...x, name: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') rename() }} style={{ maxWidth: 240 }} autoFocus aria-label="Sub project name" />
                      <button className="btn btn-sm btn-purple" onClick={rename}>Save</button>
                      <button className="btn btn-sm" onClick={() => setRenaming(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <b style={{ color: 'var(--accent3)', fontSize: 14, flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere' }}>{s.name}</b>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{used} folder{used !== 1 ? 's' : ''}</span>
                      {!readOnly && <button className="btn btn-sm" onClick={() => setRenaming({ id: s.id, name: s.name })}>Rename</button>}
                      {!readOnly && (
                        <button className="btn btn-sm" style={{ color: used ? 'var(--text3)' : '#c84b2f' }} disabled={!!used}
                          title={used ? 'Disconnect its folders first' : 'Remove this sub project'} onClick={() => remove(s)}>Remove</button>
                      )}
                    </>
                  )}
                </div>
                <div style={{ padding: '8px 12px 12px', display: 'grid', gap: 2 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>Material folders in this sub project</div>
                  {folders.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)' }}>This project has no material folders yet.</div>}
                  {folders.map(f => {
                    const mine = (map[f.id] || []).includes(s.id)
                    const others = (map[f.id] || []).filter(id => id !== s.id).map(subName).filter(Boolean)
                    const c = mine ? colours[f.id] : null
                    return (
                      <label key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, padding: '4px 0', marginBottom: 0, cursor: readOnly ? 'default' : 'pointer' }}>
                        <input type="checkbox" checked={mine} disabled={readOnly} onChange={e => toggle(f.id, s.id, e.target.checked)} style={{ width: 'auto', margin: 0 }} />
                        {c && <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: c.bd, flexShrink: 0 }} />}
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{f.name || 'Unnamed material'}</span>
                        {others.length > 0 && <span style={{ fontSize: 12, color: 'var(--text3)' }}>· also in {others.join(', ')}</span>}
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ border: '1px dashed #9FE1CB', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#085041', background: 'var(--accent-light)' }}>
        <b>Main project ({project.name}):</b>{' '}
        {onMain.length ? onMain.map(f => f.name || 'Unnamed material').join(', ') : 'no folders'}
        {subs.length > 0 && ' — folders not ticked under any sub project stay here.'}
      </div>
    </div>
  )
}
