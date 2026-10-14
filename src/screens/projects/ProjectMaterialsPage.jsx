import { useState, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { sb } from '../../lib/supabase'
import { MaterialDetail, MaterialModal } from './ProjectMaterials'
import MaterialIcon from '../../components/MaterialIcon'
import { IconSieve, IconPlus, IconArrowUp } from '../../components/Icons'
import { backToProjects } from '../../lib/projectMaterialsTab'
import { loadSubprojects, linkMap, sharedColours } from '../../lib/subprojects'

// One project's materials on their own page (screen 'projectmaterials'),
// opened in the same tab from the sign beside "2 · Project Materials";
// "All projects" returns to the workspace with this project reopened.
//
// Materials are folders; each reduction branches off the folder it came from
// (project_materials.parent_material_id), as deep as the reductions go. Only
// the picked material's branches open — the other materials stay listed but
// folded, so the page shows one material at a time without hiding the rest.
//
// Picking any folder shows its details below, using the SAME components as
// the project's material list (MaterialDetail → MaterialCard / ReductionRow).
// Each pick is a browser-history step (?material=), so Back walks back
// through what was opened, and past the first pick, back to the workspace.
//
// Sub projects (Oct 2026): when the project has any, the tree starts at the
// project, then its sub projects, then each one's folders; folders on the
// main project hang straight off the project. A folder in several sub
// projects appears under each, in its own colour, with its reductions.

const smooth = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

function readParams() {
  const q = new URLSearchParams(window.location.search)
  return { projectId: q.get('project'), materialId: q.get('material') }
}

const TYPE_LABELS = { aggregate: 'Aggregate', asphalt_binder: 'Asphalt Binder', plant_mix: 'Plant Mix', cores: 'Cores', other: 'Other' }
const typeLabel = t => TYPE_LABELS[t] || (t ? t.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : 'Material')

function reductionCaption(x) {
  return (x.reduction_method === 'fractionation' ? 'Fractionation' : x.reduction_method || 'Reduction')
    + (x.reduction_value ? ` · ${x.reduction_value}` : '')
}

export default function ProjectMaterialsPage() {
  const { session, setScreen, toast } = useAppStore()
  const [projectId] = useState(() => readParams().projectId)
  const [project, setProject] = useState(null)
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(() => readParams().materialId)
  const [showAdd, setShowAdd] = useState(false)
  const [subs, setSubs] = useState([])
  const [links, setLinks] = useState([])
  const [folded, setFolded] = useState(() => new Set())   // project / sub project nodes closed by a click
  const topRef = useRef(null)
  const detailRef = useRef(null)
  // Set by a click on a folder; the effect below then scrolls to its
  // details, which sit below every folder and are easy to miss on a long list.
  const scrollToDetail = useRef(false)

  useEffect(() => { load() }, [projectId])

  useEffect(() => {
    if (!scrollToDetail.current || !selected) return
    scrollToDetail.current = false
    // After paint, so the newly picked card is laid out before measuring
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: smooth(), block: 'start' }))
  }, [selected])

  // Back / Forward step through the folders picked on this page
  useEffect(() => {
    const onPop = () => {
      // Back past this page's first entry lands on the workspace URL
      if (new URLSearchParams(window.location.search).get('screen') !== 'projectmaterials') { setScreen('projects'); return }
      setSelected(readParams().materialId)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  async function load() {
    if (!projectId) { setError('This link does not name a project.'); setLoading(false); return }
    const [{ data: p, error: pErr }, { data: mats, error: mErr }] = await Promise.all([
      sb.from('projects').select('*').eq('id', projectId).maybeSingle(),
      sb.from('project_materials').select('*').eq('project_id', projectId).order('created_at'),
    ])
    if (pErr || mErr) setError('Could not load this project: ' + (pErr || mErr).message)
    else if (!p) setError("This project doesn't exist, or you don't have access to it.")
    setProject(p || null)
    setMaterials(mats || [])
    await reloadSubs()
    setLoading(false)
  }

  async function reloadSubs() {
    const r = await loadSubprojects(projectId)
    setSubs(r.subs); setLinks(r.links)
  }

  async function reloadMaterials() {
    const { data, error: err } = await sb.from('project_materials').select('*').eq('project_id', projectId).order('created_at')
    if (err) { toast('Could not reload materials: ' + err.message, true); return }
    setMaterials(data || [])
    reloadSubs()   // a folder added from this page may have been filed under a sub project
    // A deleted folder cannot stay picked
    if (selected && !(data || []).some(m => m.id === selected)) pick(null, true)
  }

  function pick(id, replace = false) {
    setSelected(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('material', id); else url.searchParams.delete('material')
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url)
  }

  const byId = useMemo(() => Object.fromEntries(materials.map(m => [m.id, m])), [materials])
  const kidsOf = useMemo(() => {
    const map = {}
    materials.forEach(m => { if (m.parent_material_id) (map[m.parent_material_id] ||= []).push(m) })
    return map
  }, [materials])
  // A material whose parent is not in this project (moved, or its parent was
  // deleted — the FK is ON DELETE SET NULL) is shown as a top-level folder
  // rather than dropped.
  const roots = materials.filter(m => !m.parent_material_id || !byId[m.parent_material_id])
  const countAll = id => (kidsOf[id] || []).reduce((s, k) => s + 1 + countAll(k.id), 0)

  // The picked folder and every folder above it: those are the ones whose
  // branches are open.
  const onPath = useMemo(() => {
    const ids = new Set()
    let n = selected ? byId[selected] : null
    while (n && !ids.has(n.id)) { ids.add(n.id); n = n.parent_material_id ? byId[n.parent_material_id] : null }
    return ids
  }, [selected, byId])

  const map = useMemo(() => linkMap(links), [links])
  const colours = useMemo(() => sharedColours(roots.map(m => m.id), map), [roots, map])
  const subName = id => subs.find(s => s.id === id)?.name
  const toggleNode = id => setFolded(f => { const n = new Set(f); n.has(id) ? n.delete(id) : n.add(id); return n })

  const isLabUser = session?.loginMode !== 'solo' && session?.dbRole === 'lab_user'
  const readOnly = isLabUser && !(project?.lab_user_ids || []).includes(session?.userId)

  async function deleteTopLevel(m) {
    if (!confirm(`Delete "${m.name || 'this material'}"?`)) return
    const { error: err } = await sb.from('project_materials').delete().eq('id', m.id)
    if (err) { toast('Could not delete: ' + err.message, true); return }
    toast('Material deleted.')
    pick(null, true)
    reloadMaterials()
  }

  // A render function, not a component: declared inside this one it would be
  // a new component type every render, remounting each folder and dropping
  // keyboard focus from the button just clicked.
  // underSub: the sub project this copy is drawn under (a shared folder is
  // drawn once per sub project), so keys stay unique and the note names the
  // OTHER sub projects. colour: a shared folder's, passed to its reductions.
  function folder(m, depth, underSub = null, colour = null) {
    const kids = kidsOf[m.id] || []
    const isSel = m.id === selected
    const open = kids.length > 0 && onPath.has(m.id)
    const total = countAll(m.id)
    const c = depth === 0 ? colours[m.id] || null : colour
    const others = depth === 0 && c ? (map[m.id] || []).filter(id => id !== underSub).map(subName).filter(Boolean) : []
    return (
      <div className="pmt-branch" key={(underSub || 'main') + ':' + m.id}>
        <button type="button" className={'pmt-folder' + (isSel ? ' sel' : onPath.has(m.id) ? ' onpath' : '')}
          style={c ? { borderColor: c.bd, background: c.bg, borderWidth: 2 } : undefined}
          aria-pressed={isSel} aria-expanded={kids.length ? open : undefined}
          // Clicking the open material again folds it; a reduction stays picked
          onClick={() => { scrollToDetail.current = true; pick(isSel && depth === 0 ? null : m.id) }}>
          <span className={'pmt-fi lvl' + Math.min(depth, 2)}>
            {depth === 0 ? <MaterialIcon type={m.material_type} size={22} /> : <IconSieve size={18} />}
          </span>
          <b title={m.name || ''}>{m.name || typeLabel(m.material_type)}</b>
          <small>{depth === 0 ? [typeLabel(m.material_type), m.container_type].filter(Boolean).join(' · ') : reductionCaption(m)}</small>
          {others.length > 0 && <span className="pmt-also" style={{ color: c.ink }}>Also in {others.join(', ')}</span>}
          {total > 0 && <span className="pmt-cnt">{total} reduction{total !== 1 ? 's' : ''}</span>}
        </button>
        {open && (
          <div className="pmt-kids">
            {kids.map(k => folder(k, depth + 1, underSub, c))}
          </div>
        )}
      </div>
    )
  }

  // A project or sub project node: clicking it folds or unfolds what is under it.
  function node(id, cls, title, caption, children) {
    const open = children.length > 0 && !folded.has(id)
    return (
      <div className="pmt-branch" key={id}>
        <button type="button" className={'pmt-folder ' + cls} aria-expanded={children.length ? open : undefined}
          onClick={() => children.length && toggleNode(id)}>
          <span className={'pmt-fi ' + cls}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              {cls === 'sp' && <path d="M8 13h8M12 9v8" />}
            </svg>
          </span>
          <b title={title}>{title}</b>
          <small>{caption}</small>
          {children.length > 0 && <span className="pmt-tog">{open ? '▾ Fold' : '▸ Open'}</span>}
        </button>
        {open && <div className="pmt-kids">{children}</div>}
      </div>
    )
  }

  function tree() {
    if (!subs.length) return <div className="pmt-roots">{roots.map(m => folder(m, 0))}</div>
    const subNodes = subs.map(sp => {
      const fs = roots.filter(m => (map[m.id] || []).includes(sp.id))
      return node('sp:' + sp.id, 'sp', sp.name, `Sub project · ${fs.length} folder${fs.length !== 1 ? 's' : ''}`, fs.map(m => folder(m, 0, sp.id)))
    })
    const onMain = roots.filter(m => !(map[m.id] || []).length).map(m => folder(m, 0, null))
    return <div className="pmt-roots">{node('project', 'proj', project.name, ['Main project', project.project_id].filter(Boolean).join(' · '), [...subNodes, ...onMain])}</div>
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>

  if (error || !project) return (
    <div className="empty-state" style={{ padding: 40 }}>
      <div>{error || 'Project not found.'}</div>
      <button className="btn btn-sm" style={{ marginTop: 16 }} onClick={() => backToProjects(null, setScreen)}>Go to projects</button>
    </div>
  )

  const picked = selected ? byId[selected] : null
  const reductionTotal = materials.length - roots.length

  return (
    <div ref={topRef}>
      <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="section-title">{project.name} — Materials</div>
        <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => backToProjects(project.id, setScreen)}>All projects</button>
      </div>

      <div className="pmt-page">
        <aside className="pmt-info" aria-label="Project info">
          {project.project_id && <div className="pmt-pid">{project.project_id}</div>}
          <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.3 }}>{project.name}</div>
          {project.status && (
            <span className={'badge ' + (project.status === 'active' ? 'badge-active' : project.status === 'completed' ? 'badge-completed' : 'badge-hold')} style={{ justifySelf: 'start' }}>
              {project.status}
            </span>
          )}
          <dl className="pmt-dl">
            {project.pi_name && <><dt>PI</dt><dd>{project.pi_name}</dd></>}
            {project.project_group && <><dt>Group</dt><dd>{project.project_group}</dd></>}
            {!!project.lab_user_ids?.length && <><dt>Lab users</dt><dd>{project.lab_user_ids.length} assigned</dd></>}
            {project.sampling_date && <><dt>Sampled</dt><dd>{project.sampling_date}</dd></>}
            {project.storage_date && <><dt>Stored</dt><dd>{project.storage_date}</dd></>}
          </dl>
          <div className="pmt-totals">
            <div><b>{roots.length}</b><span>material{roots.length !== 1 ? 's' : ''}</span></div>
            <div><b>{reductionTotal}</b><span>reduction{reductionTotal !== 1 ? 's' : ''}</span></div>
            {subs.length > 0 && <div><b>{subs.length}</b><span>sub project{subs.length !== 1 ? 's' : ''}</span></div>}
          </div>
          {!readOnly && (
            <button className="filter-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifySelf: 'start' }} onClick={() => setShowAdd(true)}>
              <IconPlus size={15} />Add material to this project
            </button>
          )}
          {readOnly && <div style={{ fontSize: 12, color: 'var(--text3)' }}>View only — you are not assigned to this project.</div>}
        </aside>

        <div style={{ minWidth: 0, display: 'grid', gap: 16 }}>
          <div className="pmt-tree">
            {roots.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--text3)', padding: 8 }}>No materials in this project yet.</div>
              : tree()}
          </div>

          {picked ? (
            <div ref={detailRef} style={{ display: 'grid', gap: 8, scrollMarginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text3)' }}>Details</span>
                <button className="filter-btn" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => topRef.current?.scrollIntoView({ behavior: smooth(), block: 'start' })}>
                  <IconArrowUp size={15} />Top
                </button>
              </div>
            <MaterialDetail material={picked} materials={materials} project={project} readOnly={readOnly}
              onChanged={reloadMaterials} onDelete={() => deleteTopLevel(picked)} onOpenMaterial={id => { scrollToDetail.current = true; pick(id) }} />
            </div>
          ) : roots.length > 0 && (
            <div style={{ border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
              Pick a folder to see its details here.
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <MaterialModal
          projectId={project.id}
          projectName={project.name}
          material={null}
          onClose={() => setShowAdd(false)}
          onSaved={reloadMaterials}
        />
      )}
    </div>
  )
}
