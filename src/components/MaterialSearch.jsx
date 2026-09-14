import { useState, useEffect, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'
import { exportAllProjectsXlsx } from '../lib/exportMaterials'

// Advanced search across every question the Material tab asks, so "do we have
// CM16 from Quarry X, and how much is left?" is answerable without opening
// projects one at a time.
//
// Filters are declared in FILTER_DEFS rather than written out as individual
// state + JSX, so adding a question to the Material form means adding one line
// here. Dropdown options are derived from the data itself, so a filter can
// never offer a value that matches nothing.
//
// Loads its own rows: the screen's allMaterials query selects display columns
// only and has no source, quantity or type-specific fields to search on.
// Filtering is client-side — these tables are tens to low hundreds of rows per
// org and it keeps typing instant; past a few thousand this should move to a
// server-side query.

const TYPE_LABEL = {
  aggregate: 'Aggregate', asphalt_binder: 'Asphalt Binder',
  plant_mix: 'Plant Mix', cores: 'Cores', other: 'Other',
}

// kind:
//   select    exact match on a column, options harvested from the data
//   text      case-insensitive "contains"
//   bool      Yes / No against a real boolean column
//   array     value present in an array column (e.g. one sieve size)
//   project   project_id, plus a "standalone" option
//   location  matches a label or id inside the locations array
//   date      from/to range over a date column
// group: only shown when that material type is selected (or none is)
const FILTER_DEFS = [
  { key: 'material_type',         label: 'Material type',      kind: 'select', fmt: v => TYPE_LABEL[v] || v },
  { key: '__project',             label: 'Project',            kind: 'project' },
  { key: 'pi_name',               label: 'PI / Owner',         kind: 'select' },

  { key: 'source_name',           label: 'Source / supplier',  kind: 'select' },
  { key: 'source_type',           label: 'Source type',        kind: 'select' },
  { key: 'source_location',       label: 'Source location',    kind: 'select' },

  { key: 'container_type',        label: 'Container',          kind: 'select' },
  { key: 'container_other',       label: 'Container (other)',  kind: 'text' },
  { key: 'container_color',       label: 'Container colour',   kind: 'select' },
  { key: 'qty_total',             label: 'Quantity contains',  kind: 'text' },

  { key: 'agg_raw_or_rap',        label: 'Condition (Raw/RAP)', kind: 'select', group: 'aggregate' },
  { key: 'idot_gradation_cat',    label: 'IDOT gradation',     kind: 'select', group: 'aggregate' },
  { key: 'idot_gradation_grade',  label: 'IDOT grade',         kind: 'select', group: 'aggregate' },
  { key: 'agg_sieve_sizes',       label: 'Sieve size',         kind: 'array',  group: 'aggregate' },

  { key: 'ab_binder_pg',          label: 'Binder PG grade',    kind: 'select', group: 'asphalt_binder' },
  { key: 'ab_has_polymer',        label: 'Has polymer',        kind: 'bool',   group: 'asphalt_binder' },
  { key: 'ab_polymer_info',       label: 'Polymer info',       kind: 'text',   group: 'asphalt_binder' },
  { key: 'ab_mix_design',         label: 'Binder mix design',  kind: 'select', group: 'asphalt_binder' },
  { key: 'ab_other_additives',    label: 'Other additives',    kind: 'text',   group: 'asphalt_binder' },

  { key: 'pm_binder_pg',          label: 'Plant mix PG grade', kind: 'select', group: 'plant_mix' },
  { key: 'pm_mix_design',         label: 'Plant mix design',   kind: 'select', group: 'plant_mix' },
  { key: 'pm_nmas',               label: 'NMAS',               kind: 'select', group: 'plant_mix' },

  { key: '__location',            label: 'Storage location',   kind: 'location' },
  { key: 'barcode_id',            label: 'Barcode contains',   kind: 'text' },
  { key: 'other_info',            label: 'Other info',         kind: 'text' },
  { key: 'sampling_date',         label: 'Sampling date',      kind: 'date' },
  { key: 'storage_date',          label: 'Storage date',       kind: 'date' },
]

const GROUP_LABEL = { aggregate: 'Aggregate', asphalt_binder: 'Asphalt Binder', plant_mix: 'Plant Mix' }

const locList = m =>
  Array.isArray(m.locations) ? m.locations.map(l => l?.location_label || l?.location_id || '').filter(Boolean) : []

function haystack(m) {
  return [
    m.name, m.barcode_id, m.pi_name, TYPE_LABEL[m.material_type] || m.material_type,
    m.source_name, m.source_type, m.source_location,
    m.container_type, m.container_other, m.container_color, m.qty_total, m.other_info,
    m.agg_raw_or_rap, m.idot_gradation_cat, m.idot_gradation_grade,
    Array.isArray(m.agg_sieve_sizes) ? m.agg_sieve_sizes.join(' ') : '',
    m.ab_binder_pg, m.ab_polymer_info, m.ab_mix_design, m.ab_other_additives,
    m.pm_binder_pg, m.pm_mix_design, m.pm_nmas,
    locList(m).join(' '), m.projects?.name, m.projects?.project_id,
  ].filter(Boolean).join(' ').toLowerCase()
}

/** Does one material satisfy one active filter? */
function passes(m, def, value) {
  if (value === '' || value === undefined || value === null) return true
  switch (def.kind) {
    case 'project':
      return value === '__none__' ? !m.project_id : m.project_id === value
    case 'location':
      return locList(m).some(l => l.toLowerCase().includes(String(value).toLowerCase()))
    case 'text':
      return String(m[def.key] ?? '').toLowerCase().includes(String(value).toLowerCase())
    case 'bool':
      return m[def.key] === (value === 'yes')
    case 'array':
      return Array.isArray(m[def.key]) && m[def.key].map(String).includes(String(value))
    case 'date': {
      const v = m[def.key]
      if (!v) return false
      if (value.from && v < value.from) return false
      if (value.to && v > value.to) return false
      return true
    }
    default:
      return String(m[def.key] ?? '') === String(value)
  }
}

const isSet = v => v !== '' && v !== undefined && v !== null && !(typeof v === 'object' && !v.from && !v.to)

export default function MaterialSearch({ session, isSolo, viewingWorkspaceOwnerId }) {
  const { toast } = useAppStore()
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState({})
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

  const projects = useMemo(() => {
    const seen = new Map()
    materials.forEach(m => { if (m.projects?.id) seen.set(m.projects.id, m.projects) })
    return [...seen.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [materials])

  // Options per select/array filter, harvested from the loaded rows.
  const options = useMemo(() => {
    const out = {}
    for (const def of FILTER_DEFS) {
      if (def.kind === 'select') {
        out[def.key] = [...new Set(materials.map(m => m[def.key]).filter(v => v !== null && v !== undefined && v !== ''))]
          .map(String).sort()
      } else if (def.kind === 'array') {
        out[def.key] = [...new Set(materials.flatMap(m => Array.isArray(m[def.key]) ? m[def.key] : []).filter(Boolean))]
          .map(String).sort()
      }
    }
    return out
  }, [materials])

  const results = useMemo(() => {
    const needles = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return materials.filter(m => {
      for (const def of FILTER_DEFS) {
        if (!passes(m, def, filters[def.key])) return false
      }
      if (!needles.length) return true
      const hay = haystack(m)
      return needles.every(n => hay.includes(n))   // every term must match — narrows, not widens
    })
  }, [materials, q, filters])

  const activeCount = FILTER_DEFS.filter(d => isSet(filters[d.key])).length
  const selectedType = filters.material_type || ''
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  function clearAll() { setQ(''); setFilters({}) }

  async function exportResults() {
    if (!results.length) return
    setExporting(true)
    try {
      await exportAllProjectsXlsx(results, 'material_search_results.xlsx')
      toast(`Exported ${results.length} material${results.length !== 1 ? 's' : ''} ✓`)
    } catch (e) { toast('Export failed: ' + (e?.message || e), true) }
    setExporting(false)
  }

  // A type-specific filter is hidden once a DIFFERENT type is selected — no
  // point offering "NMAS" while filtering to Aggregate.
  const visible = FILTER_DEFS.filter(d => !d.group || !selectedType || d.group === selectedType)
  const common = visible.filter(d => !d.group)
  const groups = [...new Set(visible.filter(d => d.group).map(d => d.group))]

  function Field({ def }) {
    const v = filters[def.key] ?? (def.kind === 'date' ? {} : '')
    const lbl = <label>{def.label}</label>
    if (def.kind === 'date') return (
      <div className="field" style={{ marginBottom: 0 }}>
        {lbl}
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="date" value={v.from || ''} onChange={e => set(def.key, { ...v, from: e.target.value })} />
          <input type="date" value={v.to || ''} onChange={e => set(def.key, { ...v, to: e.target.value })} />
        </div>
      </div>
    )
    if (def.kind === 'text' || def.kind === 'location') return (
      <div className="field" style={{ marginBottom: 0 }}>
        {lbl}<input value={v} onChange={e => set(def.key, e.target.value)} placeholder="contains…" />
      </div>
    )
    if (def.kind === 'bool') return (
      <div className="field" style={{ marginBottom: 0 }}>
        {lbl}
        <select value={v} onChange={e => set(def.key, e.target.value)}>
          <option value="">Any</option><option value="yes">Yes</option><option value="no">No</option>
        </select>
      </div>
    )
    if (def.kind === 'project') return (
      <div className="field" style={{ marginBottom: 0 }}>
        {lbl}
        <select value={v} onChange={e => set(def.key, e.target.value)}>
          <option value="">All projects</option>
          <option value="__none__">No project (standalone)</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
    )
    const opts = options[def.key] || []
    return (
      <div className="field" style={{ marginBottom: 0 }}>
        {lbl}
        <select value={v} onChange={e => set(def.key, e.target.value)} disabled={!opts.length}>
          <option value="">{opts.length ? 'Any' : 'None recorded'}</option>
          {opts.map(o => <option key={o} value={o}>{def.fmt ? def.fmt(o) : o}</option>)}
        </select>
      </div>
    )
  }

  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input value={q} onChange={e => setQ(e.target.value)} autoFocus style={{ flex: 1, minWidth: 260 }}
          placeholder="Search any material field — name, source, quarry, PG grade, sieve, barcode, location…" />
        <button className="btn btn-sm" onClick={() => setShowAdvanced(v => !v)}>
          {showAdvanced ? '▴ Filters' : '▾ Filters'}{activeCount ? ` (${activeCount})` : ''}
        </button>
        <button className="btn btn-sm" onClick={exportResults} disabled={!results.length || exporting}
          title="Export these results to Excel">
          {exporting ? 'Exporting…' : '⬇️ Export results'}
        </button>
      </div>

      {showAdvanced && (
        <div style={{ marginBottom: 12, padding: '14px 16px', background: 'var(--surface2)', borderRadius: 'var(--radius-lg)' }}>
          <div style={gridStyle}>
            {common.map(def => <Field key={def.key} def={def} />)}
          </div>
          {groups.map(g => (
            <div key={g} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                {GROUP_LABEL[g] || g}
              </div>
              <div style={gridStyle}>
                {visible.filter(d => d.group === g).map(def => <Field key={def.key} def={def} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 13, color: 'var(--text2)' }}>
        <span><strong style={{ color: 'var(--text)' }}>{results.length}</strong> of {materials.length} materials</span>
        {(q || activeCount > 0) && (
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
                  <td style={{ fontSize: 12 }}>{locList(m).join(' | ') || '—'}</td>
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
