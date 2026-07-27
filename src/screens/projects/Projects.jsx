import HelpPanel from '../../components/HelpPanel'
import ScrollTabs from '../../components/ScrollTabs'
import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import Modal from '../../components/Modal'
import ProjectMaterials from './ProjectMaterials'
import MaterialStorage from '../storage/MaterialStorage'
import ProjectDatabase from './ProjectDatabase'

// ── Result input that adapts to result type ──────────────────
function ResultInput({ type, value, onChange }) {
  if (type === 'pass_fail') {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        {['Pass', 'Fail'].map(opt => (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            style={{ padding: '4px 16px', border: `1px solid ${value === opt ? (opt === 'Pass' ? '#1D9E75' : '#c84b2f') : 'var(--border)'}`, borderRadius: 6, background: value === opt ? (opt === 'Pass' ? '#E1F5EE' : '#fdf0ed') : 'var(--surface)', color: value === opt ? (opt === 'Pass' ? '#1D9E75' : '#c84b2f') : 'var(--text2)', cursor: 'pointer', fontWeight: value === opt ? 700 : 400, fontSize: 13 }}>
            {opt}
          </button>
        ))}
      </div>
    )
  }
  if (type === 'percentage') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="number" min="0" max="100" step="0.01" value={value} onChange={e => onChange(e.target.value)} style={{ width: 90 }} placeholder="0" />
        <span style={{ fontSize: 14, color: 'var(--text2)', fontWeight: 600 }}>%</span>
      </div>
    )
  }
  if (type === 'number') {
    return <input type="number" step="any" value={value} onChange={e => onChange(e.target.value)} placeholder="Enter number…" />
  }
  return <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="Enter value…" />
}

function formatResult(type, value) {
  if (!value) return '—'
  if (type === 'percentage') return `${value}%`
  return value
}

// ── Equipment test results list + table ───────────────────────
function EquipmentTestResults() {
  const { session, toast } = useAppStore()
  const [equipment, setEquipment]           = useState([])
  const [search, setSearch]                 = useState('')
  const [selected, setSelected]             = useState(null)
  const [results, setResults]               = useState([])
  const [loadingEquip, setLoadingEquip]     = useState(true)
  const [loadingResults, setLoadingResults] = useState(false)
  const [showAddRow, setShowAddRow]         = useState(false)
  const [saving, setSaving]                 = useState(false)
  const emptyRow = { date: '', sample_name: '', result_type: 'text', result_value: '', explanation: '' }
  const [newRow, setNewRow] = useState(emptyRow)

  useEffect(() => { loadEquipment() }, [])
  useEffect(() => { if (selected) loadResults(selected.id) }, [selected])

  async function loadEquipment() {
    setLoadingEquip(true)
    const { data, error } = await sb.from('equipment_inventory').select('id, equipment_name, category').eq('is_active', true).order('category').order('equipment_name')
    if (error) console.error('equipment_inventory load error:', error)
    setEquipment(data || [])
    setLoadingEquip(false)
  }

  async function loadResults(equipmentId) {
    setLoadingResults(true)
    const { data } = await sb.from('test_result_entries').select('*').eq('equipment_id', equipmentId).order('date', { ascending: false })
    setResults(data || [])
    setLoadingResults(false)
  }

  async function addRow() {
    if (!newRow.date || !newRow.sample_name.trim() || newRow.result_value === '') {
      toast('Date, sample name and result are required.'); return
    }
    setSaving(true)
    const { data, error } = await sb.from('test_result_entries').insert({
      equipment_id: selected.id,
      date: newRow.date,
      sample_name: newRow.sample_name.trim(),
      result_type: newRow.result_type,
      result_value: String(newRow.result_value),
      explanation: newRow.explanation.trim() || null,
      created_by: session?.username || null,
    }).select().single()
    if (error) { console.error('test_result_entries insert:', error); toast('Save failed: ' + (error.message || error.code)); setSaving(false); return }
    setResults(prev => [data, ...prev])
    setNewRow(emptyRow); setShowAddRow(false)
    setSaving(false); toast('Result added ✓')
  }

  async function deleteRow(id) {
    await sb.from('test_result_entries').delete().eq('id', id)
    setResults(prev => prev.filter(r => r.id !== id))
    toast('Result deleted.')
  }

  const RESULT_TYPES = [
    { value: 'text',       label: 'Text' },
    { value: 'number',     label: 'Number' },
    { value: 'pass_fail',  label: 'Pass / Fail' },
    { value: 'percentage', label: 'Percentage' },
  ]

  const filtered = equipment.filter(e =>
    !search.trim() || e.equipment_name?.toLowerCase().includes(search.toLowerCase()) || e.category?.toLowerCase().includes(search.toLowerCase())
  )

  const categories = [...new Set(equipment.map(e => e.category).filter(Boolean))]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, alignItems: 'start' }}>

      {/* Left: equipment list from equipment_inventory */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search equipment…" style={{ width: '100%', fontSize: 13 }} />
        </div>

        {loadingEquip
          ? <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          : filtered.length === 0
            ? <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: 24 }}>No equipment found.</div>
            : categories.map(cat => {
                const items = filtered.filter(e => e.category === cat)
                if (!items.length) return null
                return (
                  <div key={cat}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 12px 4px', background: 'var(--surface2)' }}>{cat}</div>
                    {items.map(e => {
                      const isActive = selected?.id === e.id
                      return (
                        <div key={e.id} onClick={() => setSelected(e)}
                          style={{ padding: '8px 12px', cursor: 'pointer', background: isActive ? 'var(--accent3-light)' : 'transparent', borderLeft: `3px solid ${isActive ? 'var(--accent3)' : 'transparent'}`, transition: 'all 0.15s' }}>
                          <div style={{ fontWeight: isActive ? 600 : 400, fontSize: 13, color: isActive ? 'var(--accent3)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.equipment_name}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })
        }
      </div>

      {/* Right: results table */}
      <div>
        {!selected ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 48, textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>👈</div>
            <div>Select equipment to view its test results</div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.equipment_name}</div>
              <button className="btn btn-sm btn-purple" onClick={() => { setShowAddRow(v => !v); setNewRow(emptyRow) }}>+ Add result</button>
            </div>

            {/* Add row form */}
            {showAddRow && (
              <div className="card" style={{ marginBottom: 16, padding: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>New test result</div>
                <div className="grid-2" style={{ gap: 10, marginBottom: 10 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Date *</label>
                    <input type="date" value={newRow.date} onChange={e => setNewRow(r => ({ ...r, date: e.target.value }))} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Sample Name *</label>
                    <input value={newRow.sample_name} onChange={e => setNewRow(r => ({ ...r, sample_name: e.target.value }))} placeholder="e.g. Sample A-1" />
                  </div>
                </div>
                <div className="grid-2" style={{ gap: 10, marginBottom: 10 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Result Type</label>
                    <select value={newRow.result_type} onChange={e => setNewRow(r => ({ ...r, result_type: e.target.value, result_value: '' }))}>
                      {RESULT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Result *</label>
                    <ResultInput type={newRow.result_type} value={newRow.result_value} onChange={v => setNewRow(r => ({ ...r, result_value: v }))} />
                  </div>
                </div>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>Explanation</label>
                  <input value={newRow.explanation} onChange={e => setNewRow(r => ({ ...r, explanation: e.target.value }))} placeholder="Optional notes or explanation…" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={addRow} disabled={saving}>{saving ? 'Saving…' : 'Save result'}</button>
                  <button className="btn btn-sm" onClick={() => { setShowAddRow(false); setNewRow(emptyRow) }}>Cancel</button>
                </div>
              </div>
            )}

            {/* Results table */}
            {loadingResults
              ? <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
              : results.length === 0
                ? (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 48, textAlign: 'center', color: 'var(--text3)' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                    <div>No results yet. Click "+ Add result" to get started.</div>
                  </div>
                ) : (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
                          {['Date', 'Sample Name', 'Result', 'Explanation', ''].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r, i) => (
                          <tr key={r.id} style={{ borderBottom: i < results.length - 1 ? '1px solid var(--surface2)' : 'none' }}>
                            <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{r.date}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 500 }}>{r.sample_name}</td>
                            <td style={{ padding: '10px 14px' }}>
                              {r.result_type === 'pass_fail'
                                ? <span style={{ fontWeight: 700, color: r.result_value === 'Pass' ? '#1D9E75' : '#c84b2f', background: r.result_value === 'Pass' ? '#E1F5EE' : '#fdf0ed', padding: '2px 12px', borderRadius: 99, fontSize: 12 }}>{r.result_value}</span>
                                : <span style={{ fontFamily: r.result_type !== 'text' ? 'var(--mono)' : 'inherit', fontWeight: 600 }}>{formatResult(r.result_type, r.result_value)}</span>
                              }
                            </td>
                            <td style={{ padding: '10px 14px', color: 'var(--text2)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.explanation || '—'}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              <button onClick={() => deleteRow(r.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 13, padding: '0 4px' }}>🗑</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
            }
          </div>
        )}
      </div>
    </div>
  )
}

function InfoCell({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 500 }}>{value || '—'}</div>
    </div>
  )
}

// ── Advanced Search Panel ─────────────────────────────────────
function AdvancedSearch({ projects, users, onResults, onClear }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState({ keyword: '', status: '', pi: '', student: '', cfop: '', yearStart: '', yearEnd: '' })

  function search() {
    let results = [...projects]
    if (q.keyword) {
      const kw = q.keyword.toLowerCase()
      results = results.filter(p =>
        p.name?.toLowerCase().includes(kw) ||
        p.project_id?.toLowerCase().includes(kw) ||
        p.cfop?.toLowerCase().includes(kw) ||
        p.notes?.toLowerCase().includes(kw)
      )
    }
    if (q.status) results = results.filter(p => p.status === q.status)
    if (q.pi) results = results.filter(p => p.pi_user_id === q.pi)
    if (q.student) results = results.filter(p => (p.student_ids || []).includes(q.student))
    if (q.cfop) results = results.filter(p => p.cfop?.toLowerCase().includes(q.cfop.toLowerCase()))
    if (q.yearStart) results = results.filter(p => p.sampling_date >= q.yearStart + '-01-01')
    if (q.yearEnd) results = results.filter(p => !p.sampling_date || p.sampling_date <= q.yearEnd + '-12-31')
    onResults(results)
  }

  function clear() {
    setQ({ keyword: '', status: '', pi: '', student: '', cfop: '', yearStart: '', yearEnd: '' })
    onClear()
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button className="btn btn-sm" onClick={() => setOpen(o => !o)} style={{ marginBottom: open ? 12 : 0 }}>
        🔍 {open ? 'Hide' : 'Advanced Search'}
      </button>
      {open && (
        <div className="card" style={{ padding: 16 }}>
          <div className="grid-2" style={{ gap: 10, marginBottom: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Keyword (name, ID, notes…)</label>
              <input value={q.keyword} onChange={e => setQ(f => ({ ...f, keyword: e.target.value }))} placeholder="Search any field…" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>CFOP / Funding Code</label>
              <input value={q.cfop} onChange={e => setQ(f => ({ ...f, cfop: e.target.value }))} placeholder="e.g. 1-23456" />
            </div>
          </div>
          <div className="grid-2" style={{ gap: 10, marginBottom: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Status</label>
              <select value={q.status} onChange={e => setQ(f => ({ ...f, status: e.target.value }))}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="on hold">On Hold</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Principal Investigator</label>
              <select value={q.pi} onChange={e => setQ(f => ({ ...f, pi: e.target.value }))}>
                <option value="">All PIs</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid-2" style={{ gap: 10, marginBottom: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Student in team</label>
              <select value={q.student} onChange={e => setQ(f => ({ ...f, student: e.target.value }))}>
                <option value="">Any lab user</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Sampling year range</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={q.yearStart} onChange={e => setQ(f => ({ ...f, yearStart: e.target.value }))} placeholder="From (YYYY)" style={{ flex: 1 }} />
                <input value={q.yearEnd} onChange={e => setQ(f => ({ ...f, yearEnd: e.target.value }))} placeholder="To (YYYY)" style={{ flex: 1 }} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-primary btn-sm" onClick={search}>Search</button>
            <button className="btn btn-sm" onClick={clear}>Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectInfo({ project, users, onSaved }) {
  const { toast } = useAppStore()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: project.name || '', project_id: project.project_id || '',
    cfop: project.cfop || '', status: project.status || 'active',
    pi_user_id: project.pi_user_id || '', student_ids: project.student_ids || [],
    sampling_date: project.sampling_date || '', storage_date: project.storage_date || '',
    notes: project.notes || '',
  })

  useEffect(() => {
    setForm({ name: project.name || '', project_id: project.project_id || '', cfop: project.cfop || '', status: project.status || 'active', pi_user_id: project.pi_user_id || '', student_ids: project.student_ids || [], sampling_date: project.sampling_date || '', storage_date: project.storage_date || '', notes: project.notes || '' })
    setEditing(false)
  }, [project.id])

  function toggleStudent(id) {
    setForm(f => ({ ...f, student_ids: f.student_ids.includes(id) ? f.student_ids.filter(s => s !== id) : [...f.student_ids, id] }))
  }

  async function save() {
    if (!form.name.trim()) { toast('Project name is required.'); return }
    if (!form.project_id.trim()) { toast('Project title is required.'); return }
    const payload = { name: form.name.trim(), project_id: form.project_id.trim(), cfop: form.cfop.trim() || null, status: form.status, pi_user_id: form.pi_user_id || null, student_ids: form.student_ids, sampling_date: form.sampling_date || null, storage_date: form.storage_date || null, notes: form.notes.trim() || null }
    const { error } = await sb.from('projects').update(payload).eq('id', project.id)
    if (error) { toast('Error saving project.'); return }
    toast('Project info saved.'); setEditing(false); onSaved()
  }

  const piUser = users.find(u => u.id === project.pi_user_id)
  const studentUsers = users.filter(u => (project.student_ids || []).includes(u.id))
  const statusBadge = project.status === 'active' ? 'badge-active' : project.status === 'completed' ? 'badge-completed' : 'badge-hold'

  if (editing) return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>Edit project info</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-primary" onClick={save}>Save</button>
          <button className="btn btn-sm" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
      <div className="grid-2">
        <div className="field"><label>Project Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Soil Analysis Q2" /></div>
        <div className="field"><label>Project Title *</label><input value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} placeholder="e.g. Pavement Analysis 2026" /></div>
      </div>
      <div className="grid-2">
        <div className="field"><label>CFOP (Budget/Funding Code)</label><input value={form.cfop} onChange={e => setForm(f => ({ ...f, cfop: e.target.value }))} placeholder="e.g. 1-23456-789" /></div>
        <div className="field"><label>Status</label>
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="active">Active</option><option value="on hold">On Hold</option><option value="completed">Completed</option>
          </select>
        </div>
      </div>
      <div className="field"><label>Principal Investigator (PI)</label>
        <select value={form.pi_user_id} onChange={e => setForm(f => ({ ...f, pi_user_id: e.target.value }))}>
          <option value="">— Select PI —</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div className="field"><label>Lab Users</label>
        <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          {users.length === 0
            ? <div style={{ fontSize: 13, color: 'var(--text3)', gridColumn: '1/-1' }}>No users found.</div>
            : users.map((u, i) => (
                <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginBottom: 0, background: 'var(--surface)', borderRadius: 6, padding: '6px 10px', border: form.student_ids.includes(u.id) ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
                  <input type="checkbox" checked={form.student_ids.includes(u.id)} onChange={() => toggleStudent(u.id)} style={{ width: 'auto', cursor: 'pointer' }} />
                  <span style={{ color: form.student_ids.includes(u.id) ? 'var(--accent)' : 'var(--text)', fontWeight: form.student_ids.includes(u.id) ? 600 : 400 }}>{u.name}</span>
                </label>
              ))
          }
        </div>
      </div>
      <div className="grid-2">
        <div className="field"><label>Sampling Date</label><input type="date" value={form.sampling_date} onChange={e => setForm(f => ({ ...f, sampling_date: e.target.value }))} /></div>
        <div className="field"><label>Storage Date</label><input type="date" value={form.storage_date} onChange={e => setForm(f => ({ ...f, storage_date: e.target.value }))} /></div>
      </div>
      <div className="field"><label>Notes</label><textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes…" style={{ resize: 'vertical' }} /></div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-sm" onClick={() => setEditing(true)}>✏️ Edit info</button>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <span className={`badge ${statusBadge}`} style={{ fontSize: 12, padding: '4px 12px' }}>{project.status}</span>
        {project.project_id && <span style={{ fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--surface2)', padding: '4px 12px', borderRadius: 99, color: 'var(--text2)' }}>Title: {project.project_id}</span>}
        {project.cfop && <span style={{ fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--accent-light)', padding: '4px 12px', borderRadius: 99, color: 'var(--accent)' }}>CFOP: {project.cfop}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <InfoCell label="Principal Investigator" value={piUser?.name} />
        <InfoCell label="Created" value={new Date(project.created_at).toLocaleDateString()} />
        <InfoCell label="Sampling Date" value={project.sampling_date} />
        <InfoCell label="Storage Date" value={project.storage_date} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Lab Users</div>
        {studentUsers.length === 0
          ? <div style={{ color: 'var(--text3)', fontSize: 14 }}>No lab users assigned</div>
          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {studentUsers.map(u => <span key={u.id} style={{ background: 'var(--accent3-light)', color: 'var(--accent3)', borderRadius: 99, padding: '4px 14px', fontSize: 13, fontWeight: 500 }}>👤 {u.name}</span>)}
            </div>
        }
      </div>
      {project.notes && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Notes</div>
          <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: 14, fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>{project.notes}</div>
        </div>
      )}
    </div>
  )
}

function NewProjectModal({ users, onClose, onCreated, soloOwnerId }) {
  const { session, toast } = useAppStore()
  const [form, setForm] = useState({ name: '', project_id: '', cfop: '', status: 'active', pi_user_id: '', student_ids: [], sampling_date: '', storage_date: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  function toggleStudent(id) {
    setForm(f => ({ ...f, student_ids: f.student_ids.includes(id) ? f.student_ids.filter(s => s !== id) : [...f.student_ids, id] }))
  }

  async function create() {
    setErrMsg('')
    if (!form.name.trim()) { setErrMsg('Project name is required.'); return }
    if (!form.project_id.trim()) { setErrMsg('Project title is required.'); return }
    setSaving(true)
    const isSolo = session?.loginMode === 'solo'
    const payload = {
      name: form.name.trim(),
      project_id: form.project_id.trim(),
      cfop: form.cfop.trim() || null,
      status: form.status,
      pi_user_id: form.pi_user_id || null,
      student_ids: form.student_ids,
      sampling_date: form.sampling_date || null,
      storage_date: form.storage_date || null,
      notes: form.notes.trim() || null,
      solo_owner_id: soloOwnerId || null,
      organization_id: isSolo ? null : (session?.organizationId || null),
    }
    const { data, error } = await sb.from('projects').insert(payload).select().single()
    setSaving(false)
    if (error) {
      console.error('Project insert error:', error)
      setErrMsg(error.message)
      return
    }
    toast('Project created!'); onCreated(data.id); onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>New project</div>
      <div className="grid-2">
        <div className="field"><label>Project Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Soil Analysis Q2" autoFocus /></div>
        <div className="field"><label>Project Title *</label><input value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} placeholder="e.g. Pavement Analysis 2026" /></div>
      </div>
      <div className="grid-2">
        <div className="field"><label>CFOP (Budget/Funding Code)</label><input value={form.cfop} onChange={e => setForm(f => ({ ...f, cfop: e.target.value }))} placeholder="e.g. 1-23456-789" /></div>
        <div className="field"><label>Status</label>
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="active">Active</option><option value="on hold">On Hold</option><option value="completed">Completed</option>
          </select>
        </div>
      </div>
      <div className="field"><label>Principal Investigator (PI)</label>
        <select value={form.pi_user_id} onChange={e => setForm(f => ({ ...f, pi_user_id: e.target.value }))}>
          <option value="">— Select PI —</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div className="field"><label>Lab Users</label>
        <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
          {users.length === 0
            ? <div style={{ fontSize: 13, color: 'var(--text3)', gridColumn: '1/-1' }}>No users found.</div>
            : users.map(u => (
                <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginBottom: 0, background: 'var(--surface)', borderRadius: 6, padding: '6px 10px', border: form.student_ids.includes(u.id) ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
                  <input type="checkbox" checked={form.student_ids.includes(u.id)} onChange={() => toggleStudent(u.id)} style={{ width: 'auto', cursor: 'pointer' }} />
                  <span style={{ color: form.student_ids.includes(u.id) ? 'var(--accent)' : 'var(--text)', fontWeight: form.student_ids.includes(u.id) ? 600 : 400 }}>{u.name}</span>
                </label>
              ))
          }
        </div>
      </div>
      <div className="grid-2">
        <div className="field"><label>Sampling Date</label><input type="date" value={form.sampling_date} onChange={e => setForm(f => ({ ...f, sampling_date: e.target.value }))} /></div>
        <div className="field"><label>Storage Date</label><input type="date" value={form.storage_date} onChange={e => setForm(f => ({ ...f, storage_date: e.target.value }))} /></div>
      </div>
      <div className="field"><label>Notes</label><textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes…" style={{ resize: 'vertical' }} /></div>
      {errMsg && (
        <div style={{ background: '#fdf0ed', border: '1px solid #e24b4a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#c0392b', lineHeight: 1.5 }}>
          ⚠️ {errMsg}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-purple" onClick={create} disabled={saving}>
          {saving ? 'Creating…' : 'Create project'}
        </button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

// ── Data Analysis ─────────────────────────────────────────────
function DataAnalysis() {
  const { session, toast } = useAppStore()
  const [equipment, setEquipment]   = useState([])
  const [selected, setSelected]     = useState(null)
  const [search, setSearch]         = useState('')
  const [results, setResults]       = useState([])
  const [comments, setComments]     = useState([])
  const [newComment, setNewComment] = useState('')
  const [loadingEq, setLoadingEq]   = useState(true)
  const [loadingRes, setLoadingRes] = useState(false)
  const [postingCmt, setPostingCmt] = useState(false)
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')

  useEffect(() => {
    const isSolo = session?.loginMode === 'solo'
    let eqQ = sb.from('equipment_inventory').select('id, equipment_name, category').eq('is_active', true).order('category').order('equipment_name')
    if (!isSolo) eqQ = eqQ.eq('organization_id', session?.organizationId || '00000000-0000-0000-0000-000000000000')
    eqQ.then(({ data }) => { setEquipment(data || []); setLoadingEq(false) })
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoadingRes(true)
    Promise.all([
      sb.from('test_result_entries').select('*').eq('equipment_id', selected.id).order('date', { ascending: true }),
      sb.from('analysis_comments').select('*').eq('equipment_id', selected.id).order('created_at', { ascending: true }),
    ]).then(([r, c]) => {
      setResults(r.data || [])
      setComments(c.data || [])
      setLoadingRes(false)
    })
  }, [selected])

  async function postComment() {
    if (!newComment.trim()) return
    setPostingCmt(true)
    const { data, error } = await sb.from('analysis_comments').insert({
      equipment_id: selected.id,
      author: session?.username || session?.email || 'Anonymous',
      body: newComment.trim(),
    }).select().single()
    if (!error) { setComments(prev => [...prev, data]); setNewComment('') }
    else toast('Failed to post comment.')
    setPostingCmt(false)
  }

  async function deleteComment(id) {
    await sb.from('analysis_comments').delete().eq('id', id)
    setComments(prev => prev.filter(c => c.id !== id))
  }

  const categories = [...new Set(equipment.map(e => e.category).filter(Boolean))]
  const filteredEq = equipment.filter(e =>
    !search.trim() || e.equipment_name?.toLowerCase().includes(search.toLowerCase()) || e.category?.toLowerCase().includes(search.toLowerCase())
  )

  const filteredResults = results.filter(r => {
    if (dateFrom && r.date < dateFrom) return false
    if (dateTo   && r.date > dateTo)   return false
    return true
  })

  // Statistics
  const numericResults = filteredResults.filter(r => r.result_type === 'number' || r.result_type === 'percentage').map(r => parseFloat(r.result_value)).filter(v => !isNaN(v))
  const passFailResults = filteredResults.filter(r => r.result_type === 'pass_fail')
  const passCount = passFailResults.filter(r => r.result_value === 'Pass').length

  let stats = null
  if (numericResults.length > 1) {
    const avg = numericResults.reduce((a, b) => a + b, 0) / numericResults.length
    const min = Math.min(...numericResults)
    const max = Math.max(...numericResults)
    const std = Math.sqrt(numericResults.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / numericResults.length)
    stats = { avg, min, max, std, count: numericResults.length }
  }
  const passRate = passFailResults.length > 0 ? Math.round((passCount / passFailResults.length) * 100) : null

  const isOutlier = (v) => stats && (Math.abs(parseFloat(v) - stats.avg) > 2 * stats.std)

  const chartMax = numericResults.length ? Math.max(...numericResults) : 1

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>

      {/* Left: equipment list */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search…" style={{ width: '100%', fontSize: 13 }} />
        </div>
        {loadingEq
          ? <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          : categories.map(cat => {
              const items = filteredEq.filter(e => e.category === cat)
              if (!items.length) return null
              return (
                <div key={cat}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 12px 4px', background: 'var(--surface2)' }}>{cat}</div>
                  {items.map(e => {
                    const active = selected?.id === e.id
                    return (
                      <div key={e.id} onClick={() => { setSelected(e); setDateFrom(''); setDateTo('') }}
                        style={{ padding: '8px 12px', cursor: 'pointer', background: active ? 'var(--accent3-light)' : 'transparent', borderLeft: `3px solid ${active ? 'var(--accent3)' : 'transparent'}` }}>
                        <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? 'var(--accent3)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.equipment_name}</div>
                      </div>
                    )
                  })}
                </div>
              )
            })
        }
      </div>

      {/* Right: analysis panel */}
      {!selected ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 48, textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>Select equipment to analyse</div>
          <div style={{ fontSize: 13 }}>Compare results, view statistics, and discuss findings with your team.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Header + date filter */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.equipment_name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--text3)' }}>From</span>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 12, padding: '4px 8px' }} />
                <span style={{ color: 'var(--text3)' }}>To</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 12, padding: '4px 8px' }} />
                {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo('') }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 12 }}>✕ Clear</button>}
              </div>
            </div>
          </div>

          {loadingRes ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : filteredResults.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              No results yet for this equipment{(dateFrom || dateTo) ? ' in this date range' : ''}.
            </div>
          ) : (
            <>
              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent3)' }}>{filteredResults.length}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Total Results</div>
                </div>
                {stats && <>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#0369a1' }}>{stats.avg.toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Average</div>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#1D9E75' }}>{stats.min.toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Min</div>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#c84b2f' }}>{stats.max.toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Max</div>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#534AB7' }}>{stats.std.toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Std Dev</div>
                  </div>
                </>}
                {passRate !== null && (
                  <div style={{ background: passRate >= 80 ? '#E1F5EE' : '#fdf0ed', border: `1px solid ${passRate >= 80 ? '#1D9E75' : '#c84b2f'}`, borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: passRate >= 80 ? '#1D9E75' : '#c84b2f' }}>{passRate}%</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Pass Rate</div>
                  </div>
                )}
              </div>

              {/* Trend chart */}
              {numericResults.length > 1 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--text)' }}>Result Trend</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
                    {filteredResults.filter(r => r.result_type === 'number' || r.result_type === 'percentage').map((r, i) => {
                      const val = parseFloat(r.result_value)
                      const h = Math.max(4, Math.round((val / chartMax) * 72))
                      const outlier = isOutlier(r.result_value)
                      return (
                        <div key={r.id} title={`${r.date} — ${r.sample_name}: ${r.result_value}`}
                          style={{ flex: 1, maxWidth: 40, height: h, borderRadius: '4px 4px 0 0', background: outlier ? '#c84b2f' : 'var(--accent3)', opacity: 0.85, cursor: 'default', transition: 'opacity 0.15s' }}
                          onMouseEnter={e => e.target.style.opacity = 1} onMouseLeave={e => e.target.style.opacity = 0.85}
                        />
                      )
                    })}
                  </div>
                  {stats && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Red bars = outliers (&gt;2× std dev from avg)</div>}
                </div>
              )}

              {/* Results table */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>All Results</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface2)' }}>
                        {['Date', 'Sample', 'Type', 'Result', 'By', 'Notes'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((r, i) => {
                        const outlier = (r.result_type === 'number' || r.result_type === 'percentage') && isOutlier(r.result_value)
                        return (
                          <tr key={r.id} style={{ borderTop: '1px solid var(--border)', background: outlier ? '#fff5f5' : i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{r.date}</td>
                            <td style={{ padding: '8px 12px' }}>{r.sample_name}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text3)', fontSize: 11, textTransform: 'capitalize' }}>{r.result_type?.replace('_', '/')}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: outlier ? '#c84b2f' : r.result_value === 'Pass' ? '#1D9E75' : r.result_value === 'Fail' ? '#c84b2f' : 'var(--text)' }}>
                              {formatResult(r.result_type, r.result_value)}{outlier ? ' ⚠️' : ''}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--text3)' }}>{r.created_by || '—'}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.explanation || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Discussion thread */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>💬 Team Discussion</div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
              {comments.length === 0
                ? <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '16px 0' }}>No comments yet. Start the analysis discussion below.</div>
                : comments.map(c => (
                    <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent3-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--accent3)', flexShrink: 0 }}>
                        {c.author?.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{c.author}</span>
                          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(c.created_at).toLocaleDateString()}</span>
                          {(session?.username === c.author || session?.email === c.author || session?.role === 'admin') && (
                            <button onClick={() => deleteComment(c.id)} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text3)' }}>✕</button>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px' }}>{c.body}</div>
                      </div>
                    </div>
                  ))
              }
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && postComment()}
                placeholder="Add analysis note or comment…" style={{ flex: 1, fontSize: 13 }} />
              <button onClick={postComment} disabled={postingCmt || !newComment.trim()} className="btn btn-primary btn-sm">
                {postingCmt ? '…' : 'Post'}
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

export default function Projects() {
  const { session, toast, viewingWorkspaceOwnerId } = useAppStore()
  const isSolo = session?.loginMode === 'solo'
  const [mainTab, setMainTab] = useState('inventory')
  const [allProjects, setAllProjects] = useState([])
  const [projects, setProjects] = useState([])
  const [users, setUsers] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [activeProject, setActiveProject] = useState(null)
  const [subTab, setSubTab] = useState('info')

  useEffect(() => { loadProjects() }, [filter, viewingWorkspaceOwnerId])
  useEffect(() => { loadUsers() }, [])
  useEffect(() => { if (activeProjectId) loadActiveProject() }, [activeProjectId])

  async function loadProjects() {
    setLoading(true)

    const baseSelect = 'id, name, project_id, status, cfop, pi_user_id, student_ids, sampling_date, notes'

    let q = sb.from('projects').select(baseSelect).order('created_at', { ascending: false })

    if (isSolo && session?.userId) {
      if (viewingWorkspaceOwnerId) {
        q = q.eq('solo_owner_id', viewingWorkspaceOwnerId)
      } else {
        q = q.or(`solo_owner_id.eq.${session.userId},solo_owner_id.is.null`)
      }
    }

    if (filter !== 'all') q = q.eq('status', filter)
    let { data, error } = await q

    // solo_owner_id column doesn't exist yet (SQL migration not run) — fall back to all projects
    if (error && isSolo) {
      let fallback = sb.from('projects').select(baseSelect).order('created_at', { ascending: false })
      if (filter !== 'all') fallback = fallback.eq('status', filter)
      const { data: fd } = await fallback
      data = fd
    }

    setAllProjects(data || [])
    setProjects(data || [])
    setLoading(false)
  }

  async function loadUsers() {
    const isSolo = session?.loginMode === 'solo'
    let q = sb.from('users').select('id, name').order('name')
    if (!isSolo) q = q.eq('organization_id', session?.organizationId || '00000000-0000-0000-0000-000000000000')
    const { data } = await q
    setUsers(data || [])
  }

  async function loadActiveProject() {
    const { data } = await sb.from('projects').select('*').eq('id', activeProjectId).single()
    setActiveProject(data || null)
  }

  async function deleteProject(id) {
    if (!confirm('Delete this project and all its data?')) return
    await sb.from('projects').delete().eq('id', id)
    setActiveProjectId(null); setActiveProject(null); loadProjects(); toast('Project deleted.')
  }

  const statusBadge = (s) => s === 'active' ? 'badge-active' : s === 'completed' ? 'badge-completed' : 'badge-hold'

  const subTabs = [
    { key: 'info', label: '1 · Project Info' },
    { key: 'materials', label: '2 · Project Materials' },
    { key: 'storage', label: '3 · Material Storage' },
    { key: 'database', label: '4 · Database' },
  ]

  const [resultsTab, setResultsTab] = useState('equipment')
  const [workspaceTab, setWorkspaceTab] = useState('members')

  const mainTabs = [
    { key: 'inventory', label: '📦 Material Inventory' },
    { key: 'results',   label: '🧪 Project Test Results' },
    { key: 'workspace', label: '💼 Workspace' },
  ]

  return (
    <div>
      <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="section-title">Project Workspace</div>
        <HelpPanel screen="projects" />
      </div>

      {/* Main tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {mainTabs.map(t => (
          <button key={t.key} onClick={() => setMainTab(t.key)}
            style={{ padding: '10px 20px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: mainTab === t.key ? 'var(--accent3)' : 'var(--text2)', borderBottom: `2px solid ${mainTab === t.key ? 'var(--accent3)' : 'transparent'}`, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: Material Inventory ── */}
      {mainTab === 'inventory' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button className="btn btn-sm btn-purple" onClick={() => setShowNewModal(true)}>+ Add new</button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {['all','active','on hold','completed'].map(f => (
              <button key={f} className={'filter-btn' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <AdvancedSearch projects={allProjects} users={users} onResults={setProjects} onClear={() => setProjects(allProjects)} />

          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, alignItems: 'start' }}>
            <div style={{ position: 'sticky', top: 72 }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
              ) : projects.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}><div className="empty-icon">🧪</div><div>No projects found.</div></div>
              ) : projects.map((p, idx) => {
                const isActive = activeProjectId === p.id
                return (
                  <div key={p.id} onClick={() => { setActiveProjectId(p.id); setSubTab('info') }}
                    style={{ background: isActive ? 'var(--accent3-light)' : 'var(--surface)', border: `1px solid ${isActive ? 'var(--accent3)' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', padding: '10px 14px', marginBottom: 8, cursor: 'pointer', transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 1 }}>#{idx + 1}</div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: isActive ? 'var(--accent3)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        {p.project_id && <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.project_id}</div>}
                      </div>
                      <span className={`badge ${statusBadge(p.status)}`} style={{ fontSize: 10, flexShrink: 0, padding: '2px 8px' }}>{p.status}</span>
                    </div>
                    {viewingShared && (
                      <div style={{ marginTop: 4, display: 'inline-block', fontSize: 11, fontWeight: 600, background: '#EEEDFE', color: '#534AB7', borderRadius: 99, padding: '2px 8px' }}>
                        {viewingOwnerName}'s workspace
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div>
              {!activeProject ? (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 48, textAlign: 'center', color: 'var(--text3)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>👈</div>
                  <div>Select a project from the list</div>
                </div>
              ) : (
                <div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 17 }}>{activeProject.name}</div>
                        <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>
                          {[activeProject.project_id && `Title: ${activeProject.project_id}`, activeProject.cfop && `CFOP: ${activeProject.cfop}`].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteProject(activeProject.id)}>Delete</button>
                    </div>
                  </div>
                  <ScrollTabs style={{ borderBottom: '1px solid var(--border)' }} bg='var(--surface)'>
                    {subTabs.map(t => (
                      <button key={t.key} onClick={() => setSubTab(t.key)}
                        style={{ padding: '12px 16px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: subTab === t.key ? 'var(--accent3)' : 'var(--text2)', borderBottom: `2px solid ${subTab === t.key ? 'var(--accent3)' : 'transparent'}`, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                        {t.label}
                      </button>
                    ))}
                  </ScrollTabs>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', padding: 24 }}>
                    {subTab === 'info'      && <ProjectInfo project={activeProject} users={users} onSaved={loadActiveProject} />}
                    {subTab === 'materials' && <ProjectMaterials project={activeProject} />}
                    {subTab === 'storage'   && <MaterialStorage project={activeProject} />}
                    {subTab === 'database'  && <ProjectDatabase project={activeProject} />}
                  </div>
                </div>
              )}
            </div>
          </div>

          {showNewModal && <NewProjectModal users={users} onClose={() => setShowNewModal(false)} onCreated={(id) => { setActiveProjectId(id); loadProjects() }} />}
        </>
      )}

      {/* ── Tab 2: Project Test Results ── */}
      {mainTab === 'results' && (
        <div>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
            {[
              { key: 'equipment', label: '🔧 Equipment' },
              { key: 'database',  label: '🗄️ Database' },
            ].map(t => (
              <button key={t.key} onClick={() => setResultsTab(t.key)}
                style={{ padding: '10px 20px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: resultsTab === t.key ? 'var(--accent3)' : 'var(--text2)', borderBottom: `2px solid ${resultsTab === t.key ? 'var(--accent3)' : 'transparent'}`, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                {t.label}
              </button>
            ))}
          </div>
          {resultsTab === 'equipment' && <EquipmentTestResults />}
          {resultsTab === 'database' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text3)', textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>🗄️</div>
              <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)', marginBottom: 8 }}>Database</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 340, lineHeight: 1.6 }}>Test result database records will appear here.</div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 3: Workspace ── */}
      {mainTab === 'workspace' && (
        <div>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
            {[
              { key: 'members',  label: '👥 Project Members' },
              { key: 'analysis', label: '📊 Data Analysis' },
              { key: 'links',    label: '🔗 Links' },
            ].map(t => (
              <button key={t.key} onClick={() => setWorkspaceTab(t.key)}
                style={{ padding: '10px 20px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: workspaceTab === t.key ? 'var(--accent3)' : 'var(--text2)', borderBottom: `2px solid ${workspaceTab === t.key ? 'var(--accent3)' : 'transparent'}`, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                {t.label}
              </button>
            ))}
          </div>
          {workspaceTab === 'members' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text3)', textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>👥</div>
              <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)', marginBottom: 8 }}>Project Members</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 340, lineHeight: 1.6 }}>Project member assignments will appear here.</div>
            </div>
          )}
          {workspaceTab === 'analysis' && <DataAnalysis />}
          {workspaceTab === 'links' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text3)', textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>🔗</div>
              <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)', marginBottom: 8 }}>Links</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 340, lineHeight: 1.6 }}>Useful project links and references will appear here.</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
