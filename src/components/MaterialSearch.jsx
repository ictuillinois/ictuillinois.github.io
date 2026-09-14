import { useState, useEffect, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'
import { exportAllProjectsXlsx } from '../lib/exportMaterials'

// Advanced search across every material field — the questions the Material tab
// asks — so a question like "do we have CM16 from Quarry X, and how much is
// left?" is answerable without opening projects one by one.
//
// Loads its own rows rather than reusing the screen's `allMaterials`: that
// query selects only display columns (name, type, dates, photos) and has no
// source, quantity or type-specific fields to search on.
//
// Filtering is client-side. These tables are small (tens to low hundreds of
// rows per org) and it keeps the UI instant while typing; if an org ever grows
// past a few thousand materials this should move to a server-side query.

const TYPE_LABEL = {
  aggregate: 'Aggregate', asphalt_binder: 'Asphalt Binder',
  plant_mix: 'Plant Mix', cores: 'Cores', other: 'Other',
}

// Every field worth matching free text against, flattened to one string.
function haystack(m) {
  return [
    m.name, m.barcode_id, m.pi_name,
    TYPE_LABEL[m.material_type] || m.material_type,
    m.source_name, m.source_type, m.source_location,
    m.container_type, m.container_other, m.container_color,
    m.qty_total, m.other_info,
    m.agg_raw_or_rap, m.idot_gradation_cat, m.idot_gradation_grade,
    Array.isArray(m.agg_sieve_sizes) ? m.agg_sieve_sizes.join(' ') : '',
    m.ab_binder_pg, m.ab_polymer_info, m.ab_mix_design, m.ab_other_additives,
    m.pm_binder_pg, m.pm_mix_design, m.pm_nmas,
    Array.isArray(m.locations) ? m.locations.map(l => l?.location_label || l?.location_id).join(' ') : '',
    m.projects?.name, m.projects?.project_id,
  ].filter(Boolean).join(' ').toLowerCase()
}

const locText = locs =>
  Array.isArray(locs) ? locs.map(l => l?.location_label || l?.location_id || '').filter(Boolean).join(' | ') : ''

export default function MaterialSearch({ session, isSolo, viewingWorkspaceOwnerId }) {
  const { toast } = useAppStore()
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [projectId, setProjectId] = useState('')
  const [source, setSource] = useState('')
  const [container, setContainer] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let query = sb.from('project_materials')
      .select('*, projects(id, name, project_id)')
      .order('created_at', { ascending: false })
    if (isSolo) query = query.eq('solo_owner_id', viewingWorkspaceOwnerId || session?.userId || '00000000-0000-0000-0000-000000000000')
    else if (session?.organizationId) query = query.eq('organization_id', session.organizationId)
    const { data, error } = await query
    setLoading(false)
    if (error) { toast('Search failed to load: ' + error.message, true); return }
    setMaterials(data || [])
  }

  // Dropdown options come from the data itself, so they can never offer a
  // value that matches nothing.
  const types = useMemo(() => [...new Set(materials.map(m => m.material_type).filter(Boolean))].sort(), [materials])
  const projects = useMemo(() => {
    const seen = new Map()
    materials.forEach(m => { if (m.projects?.id) seen.set(m.projects.id, m.projects) })
    return [...seen.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [materials])
  const sources = useMemo(() => [...new Set(materials.map(m => m.source_name).filter(Boolean))].sort(), [materials])
  const containers = useMemo(() => [...new Set(materials.map(m => m.container_type).filter(Boolean))].sort(), [materials])

  const results = useMemo(() => {
    const needles = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return materials.filter(m => {
      if (type && m.material_type !== type) return false
      if (projectId === '__none__' ? m.project_id : projectId && m.project_id !== projectId) return false
      if (source && m.source_name !== source) return false
      if (container && m.container_type !== container) return false
      if (!needles.length) return true
      // Every term must appear somewhere — "cm16 quarry" narrows, not widens.
      const hay = haystack(m)
      return needles.every(n => hay.includes(n))
    })
  }, [materials, q, type, projectId, source, container])

  const activeFilters = [type, projectId, source, container].filter(Boolean).length
  function clearAll() { setQ(''); setType(''); setProjectId(''); setSource(''); setContainer('') }

  async function exportResults() {
    if (!results.length) return
    setExporting(true)
    try {
      await exportAllProjectsXlsx(results, 'material_search_results.xlsx')
      toast(`Exported ${results.length} material${results.length !== 1 ? 's' : ''} ✓`)
    } catch (e) { toast('Export failed: ' + (e?.message || e), true) }
    setExporting(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search any material field — name, source, quarry, PG grade, sieve, barcode, location…"
          style={{ flex: 1, minWidth: 260 }}
          autoFocus
        />
        <button className="btn btn-sm" onClick={() => setShowAdvanced(v => !v)}>
          {showAdvanced ? '▴ Filters' : '▾ Filters'}{activeFilters ? ` (${activeFilters})` : ''}
        </button>
        <button className="btn btn-sm" onClick={exportResults} disabled={!results.length || exporting}
          title="Export these results to Excel">
          {exporting ? 'Exporting…' : '⬇️ Export results'}
        </button>
      </div>

      {showAdvanced && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12, padding: '14px 16px', background: 'var(--surface2)', borderRadius: 'var(--radius-lg)' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Material type</label>
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="">All types</option>
              {types.map(t => <option key={t} value={t}>{TYPE_LABEL[t] || t}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Project</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">All projects</option>
              <option value="__none__">No project (standalone)</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Source / supplier</label>
            <select value={source} onChange={e => setSource(e.target.value)}>
              <option value="">Any source</option>
              {sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Container</label>
            <select value={container} onChange={e => setContainer(e.target.value)}>
              <option value="">Any container</option>
              {containers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 13, color: 'var(--text2)' }}>
        <span><strong style={{ color: 'var(--text)' }}>{results.length}</strong> of {materials.length} materials</span>
        {(q || activeFilters > 0) && (
          <button onClick={clearAll} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 12 }}>Clear</button>
        )}
      </div>

      {results.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">🔍</div>No materials match.</div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Material</th><th>Type</th><th>Project</th><th>Source</th>
                <th>Quantity</th><th>Container</th><th>Storage location</th><th>Barcode</th>
              </tr>
            </thead>
            <tbody>
              {results.map(m => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.name || '—'}</td>
                  <td>{TYPE_LABEL[m.material_type] || m.material_type || '—'}</td>
                  <td>{m.projects?.name || <span style={{ color: 'var(--text3)' }}>No project</span>}</td>
                  <td>{m.source_name || '—'}{m.source_location ? <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.source_location}</div> : null}</td>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{m.qty_total || '—'}</td>
                  <td>{m.container_type || '—'}{m.container_count ? ` · ${m.container_count}` : ''}</td>
                  <td style={{ fontSize: 12 }}>{locText(m.locations) || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{m.barcode_id || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
