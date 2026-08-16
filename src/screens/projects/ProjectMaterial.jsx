import HelpPanel from '../../components/HelpPanel'
import ScrollTabs from '../../components/ScrollTabs'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import StorageService, { useStorageUrl } from '../../lib/storage/StorageService'
import Modal from '../../components/Modal'
import ProjectMaterials from './ProjectMaterials'
import MaterialStorage from '../storage/MaterialStorage'

// ── Helpers ────────────────────────────────────────────────────
function InfoCell({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 500 }}>{value || '—'}</div>
    </div>
  )
}

// ── Project Info (view/edit a project's metadata) ──────────────
function ProjectInfo({ project, users, onSaved, isSolo, readOnly }) {
  const { toast } = useAppStore()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: project.name || '', project_id: project.project_id || '',
    cfop: project.cfop || '', status: project.status || 'active',
    project_group: project.project_group || '',
    pi_user_id: project.pi_user_id || '', student_ids: project.student_ids || [],
    sampling_date: project.sampling_date || '', storage_date: project.storage_date || '',
    notes: project.notes || '',
  })

  useEffect(() => {
    setForm({ name: project.name || '', project_id: project.project_id || '', cfop: project.cfop || '', status: project.status || 'active', project_group: project.project_group || '', pi_user_id: project.pi_user_id || '', student_ids: project.student_ids || [], sampling_date: project.sampling_date || '', storage_date: project.storage_date || '', notes: project.notes || '' })
    setEditing(false)
  }, [project.id])

  function toggleStudent(id) {
    setForm(f => ({ ...f, student_ids: f.student_ids.includes(id) ? f.student_ids.filter(s => s !== id) : [...f.student_ids, id] }))
  }

  async function save() {
    if (!form.name.trim()) { toast('Project name is required.'); return }
    if (!form.project_id.trim()) { toast('Project title is required.'); return }
    const payload = { name: form.name.trim(), project_id: form.project_id.trim(), cfop: form.cfop.trim() || null, status: form.status, project_group: form.project_group || null, pi_user_id: form.pi_user_id || null, student_ids: form.student_ids, sampling_date: form.sampling_date || null, storage_date: form.storage_date || null, notes: form.notes.trim() || null }
    const { error } = await sb.from('projects').update(payload).eq('id', project.id)
    if (error) { toast('Error saving project.'); return }
    toast('Project info saved.'); setEditing(false); onSaved()
  }

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
        <div className="field"><label>Project Name <span style={{ color: '#c84b2f' }}>*</span></label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
        <div className="field"><label>Project Title <span style={{ color: '#c84b2f' }}>*</span></label><input value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} /></div>
      </div>
      <div className="grid-2">
        <div className="field"><label>CFOP (Funding Code)</label><input value={form.cfop} onChange={e => setForm(f => ({ ...f, cfop: e.target.value }))} /></div>
        <div className="field"><label>Status</label>
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="active">Active</option><option value="on hold">On Hold</option><option value="completed">Completed</option>
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="field"><label>Sampling Date</label><input type="date" value={form.sampling_date} onChange={e => setForm(f => ({ ...f, sampling_date: e.target.value }))} /></div>
        <div className="field"><label>Storage Date</label><input type="date" value={form.storage_date} onChange={e => setForm(f => ({ ...f, storage_date: e.target.value }))} /></div>
      </div>
      <div className="field"><label>Notes</label><textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} /></div>
    </div>
  )

  return (
    <div>
      {!readOnly && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn btn-sm" onClick={() => setEditing(true)}>✏️ Edit info</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <span className={`badge ${statusBadge}`} style={{ fontSize: 12, padding: '4px 12px' }}>{project.status}</span>
        {project.project_id && <span style={{ fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--surface2)', padding: '4px 12px', borderRadius: 99, color: 'var(--text2)' }}>Title: {project.project_id}</span>}
        {project.cfop && <span style={{ fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--accent-light)', padding: '4px 12px', borderRadius: 99, color: 'var(--accent)' }}>CFOP: {project.cfop}</span>}
        {!isSolo && project.project_group && <span style={{ fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--surface2)', padding: '4px 12px', borderRadius: 99, color: 'var(--text2)' }}>Group: {project.project_group}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <InfoCell label="Created" value={new Date(project.created_at).toLocaleDateString()} />
        <InfoCell label="Sampling Date" value={project.sampling_date} />
        <InfoCell label="Storage Date" value={project.storage_date} />
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

// ── New Project Modal ──────────────────────────────────────────
function NewProjectModal({ users, isSolo, soloOwnerId, onClose, onCreated }) {
  const { session, toast } = useAppStore()
  const [form, setForm] = useState({ name: '', project_id: '', cfop: '', status: 'active', project_group: '', pi_user_id: '', student_ids: [], sampling_date: '', storage_date: '', notes: '' })
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
    const payload = {
      name: form.name.trim(),
      project_id: form.project_id.trim(),
      cfop: form.cfop.trim() || null,
      status: form.status,
      project_group: form.project_group || null,
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
    if (error) { setErrMsg(error.message); return }
    toast('Project created!'); onCreated(data.id); onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>New project</div>
      <div className="grid-2">
        <div className="field"><label>Project Name <span style={{ color: '#c84b2f' }}>*</span></label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
        <div className="field"><label>Project Title <span style={{ color: '#c84b2f' }}>*</span></label><input value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} /></div>
      </div>
      <div className="grid-2">
        <div className="field"><label>CFOP (Funding Code)</label><input value={form.cfop} onChange={e => setForm(f => ({ ...f, cfop: e.target.value }))} /></div>
        <div className="field"><label>Status</label>
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="active">Active</option><option value="on hold">On Hold</option><option value="completed">Completed</option>
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="field"><label>Sampling Date</label><input type="date" value={form.sampling_date} onChange={e => setForm(f => ({ ...f, sampling_date: e.target.value }))} /></div>
        <div className="field"><label>Storage Date</label><input type="date" value={form.storage_date} onChange={e => setForm(f => ({ ...f, storage_date: e.target.value }))} /></div>
      </div>
      <div className="field"><label>Notes</label><textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} /></div>
      {errMsg && (
        <div style={{ background: '#fdf0ed', border: '1px solid #e24b4a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#c0392b' }}>
          ⚠️ {errMsg}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className={`btn ${isSolo ? 'btn-purple' : 'btn-primary'}`} onClick={create} disabled={saving}>
          {saving ? 'Creating…' : 'Create project'}
        </button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
      <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.5 }}>
        ℹ️ Additional details (members, dates, notes) can be filled in after the project is created.
      </div>
    </Modal>
  )
}

// ── New Material Modal ──────────────────────────────────────────
function NewMaterialModal({ onClose, onCreated }) {
  const { session, toast } = useAppStore()
  const [form, setForm] = useState({ name: '', sampling_date: '', storage_date: '', storage_location: '', project_id: '' })
  const [projects, setProjects] = useState([])
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    async function loadProjects() {
      let q = sb.from('projects').select('id, name, project_id').eq('status', 'active').order('name')
      if (session?.organizationId) q = q.eq('organization_id', session.organizationId)
      const { data } = await q
      setProjects(data || [])
    }
    loadProjects()
  }, [])

  async function create() {
    setErrMsg('')
    if (!form.name.trim()) { setErrMsg('Material name is required.'); return }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      sampling_date: form.sampling_date || null,
      storage_date: form.storage_date || null,
      storage_location: form.storage_location.trim() || null,
      project_id: form.project_id || null,
      organization_id: session?.organizationId || null,
    }
    const { data, error } = await sb.from('project_materials').insert(payload).select().single()
    setSaving(false)
    if (error) { setErrMsg(error.message); return }
    toast('Material added!'); if (onCreated) onCreated(data); onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>Add material</div>
      <div className="field"><label>Material Name <span style={{ color: '#c84b2f' }}>*</span></label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
      <div className="grid-2">
        <div className="field"><label>Sampling Date</label><input type="date" value={form.sampling_date} onChange={e => setForm(f => ({ ...f, sampling_date: e.target.value }))} /></div>
        <div className="field"><label>Storage Date</label><input type="date" value={form.storage_date} onChange={e => setForm(f => ({ ...f, storage_date: e.target.value }))} /></div>
      </div>
      <div className="field"><label>Storage Location</label><input value={form.storage_location} onChange={e => setForm(f => ({ ...f, storage_location: e.target.value }))} placeholder="e.g. Freezer B, Shelf 3" /></div>
      <div className="field">
        <label>Project related to this material</label>
        <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
          <option value="">— None / standalone —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.project_id ? ` · ${p.project_id}` : ''}</option>)}
        </select>
      </div>
      {errMsg && (
        <div style={{ background: '#fdf0ed', border: '1px solid #e24b4a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#c0392b' }}>
          ⚠️ {errMsg}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={create} disabled={saving}>
          {saving ? 'Adding…' : 'Add material'}
        </button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
      <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.5 }}>
        ℹ️ Additional details (material type, source, quantities, photos) can be filled in after saving.
      </div>
    </Modal>
  )
}

// ── FileLink — resolves Supabase or external (ext:...) file refs ──
function FileLink({ file }) {
  const url = useStorageUrl(file.file_url)
  const icon = (() => {
    const t = file.file_type || ''
    if (t.includes('pdf')) return '📑'
    if (t.includes('image')) return '🖼️'
    if (t.includes('csv') || t.includes('spreadsheet') || t.includes('excel')) return '📊'
    if (t.includes('word') || t.includes('document')) return '📃'
    if (t.includes('text')) return '📝'
    if (t.includes('zip')) return '🗜️'
    return '📄'
  })()
  if (!url) return <span style={{ fontSize: 12, color: 'var(--text3)' }}>{icon} {file.file_name}</span>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
      {icon} {file.file_name}
    </a>
  )
}

// ── Submit Result Panel ────────────────────────────────────────
function SubmitResultPanel({ projects, session }) {
  const { toast } = useAppStore()
  const [form, setForm] = useState({ project_id: '', result_type: '', description: '', result_date: '' })
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!form.project_id) { toast('Select a project.'); return }
    if (!form.description.trim()) { toast('Description is required.'); return }
    setSaving(true)
    const { error } = await sb.from('project_results').insert({
      project_id: form.project_id,
      submitted_by: session?.name || session?.email || 'Unknown',
      result_type: form.result_type || null,
      description: form.description.trim(),
      result_date: form.result_date || null,
    })
    if (error) {
      toast('Could not save. Run the SQL migration in Supabase first.')
    } else {
      toast('Result submitted!')
      setForm({ project_id: '', result_type: '', description: '', result_date: '' })
    }
    setSaving(false)
  }

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Submit Test Result</div>
      <div className="card">
        <div className="grid-2">
          <div className="field">
            <label>Project <span style={{ color: '#c84b2f' }}>*</span></label>
            <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
              <option value="">— Select project —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Result Type</label>
            <input value={form.result_type} onChange={e => setForm(f => ({ ...f, result_type: e.target.value }))} placeholder="e.g. Marshall Test, Density…" />
          </div>
        </div>
        <div className="field">
          <label>Description / Values <span style={{ color: '#c84b2f' }}>*</span></label>
          <textarea rows={4} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Test details, values, observations…" style={{ resize: 'vertical' }} />
        </div>
        <div className="field">
          <label>Result Date</label>
          <input type="date" value={form.result_date} onChange={e => setForm(f => ({ ...f, result_date: e.target.value }))} />
        </div>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Submitting…' : 'Submit Result'}</button>
      </div>
    </div>
  )
}

// ── Adaptive result input ──────────────────────────────────────
function ResultValueInput({ type, value, onChange }) {
  if (type === 'pass_fail') return (
    <div style={{ display: 'flex', gap: 8 }}>
      {['Pass', 'Fail'].map(opt => (
        <button key={opt} type="button" onClick={() => onChange(opt)}
          style={{ padding: '8px 20px', border: `1.5px solid ${value === opt ? (opt === 'Pass' ? '#1D9E75' : '#c84b2f') : 'var(--border)'}`, borderRadius: 8, background: value === opt ? (opt === 'Pass' ? '#E1F5EE' : '#fdf0ed') : 'var(--surface)', color: value === opt ? (opt === 'Pass' ? '#1D9E75' : '#c84b2f') : 'var(--text2)', cursor: 'pointer', fontWeight: value === opt ? 700 : 400, fontSize: 13 }}>
          {opt}
        </button>
      ))}
    </div>
  )
  if (type === 'percentage') return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="number" min="0" max="100" step="0.01" value={value} onChange={e => onChange(e.target.value)} placeholder="0" style={{ width: 100 }} />
      <span style={{ fontWeight: 600, color: 'var(--text2)' }}>%</span>
    </div>
  )
  if (type === 'temperature') return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="number" step="0.1" value={value} onChange={e => onChange(e.target.value)} placeholder="0" style={{ width: 100 }} />
      <span style={{ fontWeight: 600, color: 'var(--text2)' }}>°C</span>
    </div>
  )
  if (type === 'number' || type === 'ratio') return (
    <input type="number" step="any" value={value} onChange={e => onChange(e.target.value)} placeholder="Enter value…" />
  )
  return <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="Enter value…" />
}

const RESULT_TYPES = [
  { value: 'number',      label: 'Number',       hint: 'Plain numeric value' },
  { value: 'percentage',  label: 'Percentage %',  hint: '0 – 100%' },
  { value: 'pass_fail',   label: 'Pass / Fail',   hint: 'Pass or Fail toggle' },
  { value: 'text',        label: 'Text',          hint: 'Free-form text' },
  { value: 'temperature', label: 'Temperature °C',hint: 'Numeric in °C' },
  { value: 'ratio',       label: 'Ratio',         hint: 'Decimal ratio e.g. 0.75' },
]

function formatResultValue(type, value) {
  if (!value && value !== 0) return '—'
  if (type === 'percentage')  return value + '%'
  if (type === 'temperature') return value + '°C'
  return value
}

// ── Project Test Results Tab ───────────────────────────────────
function ResultsTab({ projects, session, allowedNames }) {
  const { toast } = useAppStore()
  const isSolo = session?.loginMode === 'solo'
  const [results,   setResults]   = useState([])
  const [equipment, setEquipment] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving,    setSaving]    = useState(false)

  const emptyForm = { test_name: '', specimen_name: '', project_id: '', equipment_id: '', result_type: 'number', result_value: '', description: '', result_date: new Date().toISOString().split('T')[0] }
  const [form, setForm]           = useState(emptyForm)
  const [equipSearch, setEquipSearch] = useState('')
  const [selectedEquip, setSelectedEquip] = useState(null)
  const [showEquipPicker, setShowEquipPicker] = useState(false)
  const [drillProject, setDrillProject] = useState(null) // project id
  const [drillEquip,   setDrillEquip]   = useState(null) // equipment id
  const [uploadFile,   setUploadFile]   = useState(null)
  const [fileMap,      setFileMap]      = useState({}) // test_result_id → file row
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (isSolo) return  // Solo users don't use lab equipment
    let q = sb.from('equipment_inventory').select('id, equipment_name, category').eq('is_active', true).order('category').order('equipment_name')
    q = q.eq('organization_id', session?.organizationId || '00000000-0000-0000-0000-000000000000')
    q.then(({ data }) => setEquipment(data || []))
  }, [])

  useEffect(() => { if (allowedNames !== undefined) loadResults() }, [projects.length, allowedNames])

  async function loadResults() {
    setLoading(true)
    const ids = projects.map(p => p.id)
    if (!ids.length) { setResults([]); setFileMap({}); setLoading(false); return }
    const [{ data }, { data: files }] = await Promise.all([
      sb.from('test_result_entries').select('*').in('project_id', ids).order('created_at', { ascending: false }),
      sb.from('project_record_files').select('*').in('project_id', ids),
    ])
    const all = data || []
    const visible = allowedNames !== null
      ? all.filter(r => r.created_by && allowedNames.has(r.created_by))
      : all
    setResults(visible)
    const fm = {}
    ;(files || []).forEach(f => { if (f.test_result_id) fm[f.test_result_id] = f })
    setFileMap(fm)
    setLoading(false)
  }

  function openAdd() {
    setForm(emptyForm); setSelectedEquip(null); setEditingId(null); setEquipSearch(''); setShowForm(true)
  }

  function openEdit(r) {
    setForm({
      test_name: r.test_name || '', specimen_name: r.specimen_name || '',
      project_id: r.project_id || '',
      equipment_id: r.equipment_id || '', result_type: r.result_type || 'number',
      result_value: r.result_value || '', description: r.explanation || '',
      result_date: r.date || '',
    })
    setSelectedEquip(equipment.find(e => e.id === r.equipment_id) || null)
    setEditingId(r.id); setShowForm(true)
  }

  function cancelForm() { setShowForm(false); setEditingId(null); setForm(emptyForm); setSelectedEquip(null); setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }

  async function save() {
    if (!form.test_name.trim()) { toast('Test name is required.'); return }
    if (!form.project_id)       { toast('Select a project.'); return }
    if (!form.equipment_id && !isSolo) { toast('Select equipment.'); return }
    setSaving(true)
    const payload = {
      test_name: form.test_name.trim(),
      sample_name: form.test_name.trim(),
      specimen_name: form.specimen_name.trim() || null,
      project_id: form.project_id,
      equipment_id: form.equipment_id,
      result_type: form.result_type || null,
      result_value: form.result_value !== '' ? String(form.result_value) : null,
      explanation: form.description.trim() || null,
      date: form.result_date || null,
      created_by: session?.username || session?.name || session?.email || null,
    }
    let savedId = editingId
    if (editingId) {
      const { error } = await sb.from('test_result_entries').update(payload).eq('id', editingId)
      if (error) { toast('Save failed: ' + error.message); setSaving(false); return }
    } else {
      const { data, error } = await sb.from('test_result_entries').insert(payload).select('id').single()
      if (error) { toast('Save failed: ' + error.message); setSaving(false); return }
      savedId = data.id
    }
    if (uploadFile && savedId) {
      const path = `${form.project_id}/${form.equipment_id}/${Date.now()}-${uploadFile.name}`
      let fileUrl = null
      try {
        const { url } = await StorageService.upload('project-records', path, uploadFile, { personal: true })
        fileUrl = url
      } catch (upErr) {
        toast('File upload failed: ' + (upErr?.message || 'Check storage settings.'))
      }
      if (fileUrl) {
        const { error: dbErr } = await sb.from('project_record_files').insert({
          project_id: form.project_id,
          equipment_id: form.equipment_id || null,
          test_result_id: savedId,
          file_name: uploadFile.name,
          file_path: path,
          file_url: fileUrl,
          file_size: uploadFile.size,
          file_type: uploadFile.type,
          created_by: session?.username || session?.email || null,
        })
        if (dbErr) toast('File uploaded but record save failed: ' + (dbErr.message || 'Run the project_record_files SQL migration.'))
      }
    }
    toast(editingId ? 'Result updated ✓' : 'Result saved ✓')
    setSaving(false); cancelForm(); loadResults()
  }

  async function deleteResult(id) {
    if (!confirm('Delete this result?')) return
    await sb.from('test_result_entries').delete().eq('id', id)
    setResults(prev => prev.filter(r => r.id !== id))
    toast('Deleted.')
  }

  const projectMap  = Object.fromEntries(projects.map(p => [p.id, p.name || p.project_name]))
  const equipMap    = Object.fromEntries(equipment.map(e => [e.id, e.equipment_name]))
  const filteredEq  = equipment.filter(e => !equipSearch.trim() || e.equipment_name?.toLowerCase().includes(equipSearch.toLowerCase()) || e.category?.toLowerCase().includes(equipSearch.toLowerCase()))
  const eqCategories = [...new Set(filteredEq.map(e => e.category).filter(Boolean))]

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>Project Test Results</div>
        {!showForm && <button className="btn btn-sm btn-primary" onClick={openAdd}>+ Add Result</button>}
      </div>

      {/* Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 20, border: '1.5px solid var(--accent)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: 'var(--accent)' }}>
            {editingId ? '✏️ Edit Result' : '+ New Test Result'}
          </div>

          {/* Row 1: Test Name + Specimen Name */}
          <div className="grid-2">
            <div className="field">
              <label>Test Name <span style={{ color: '#c84b2f' }}>*</span></label>
              <input value={form.test_name} onChange={e => setForm(f => ({ ...f, test_name: e.target.value }))}
                placeholder="e.g. Marshall Stability, Density Test…" autoFocus />
            </div>
            <div className="field">
              <label>Specimen Name</label>
              <input value={form.specimen_name} onChange={e => setForm(f => ({ ...f, specimen_name: e.target.value }))}
                placeholder="e.g. S1, Core-3, Mix-A…" />
            </div>
          </div>

          {/* Row 2: Project + Date */}
          <div className="grid-2">
            <div className="field">
              <label>Project <span style={{ color: '#c84b2f' }}>*</span></label>
              <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                <option value="">— Select project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name || p.project_name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Result Date</label>
              <input type="date" value={form.result_date} onChange={e => setForm(f => ({ ...f, result_date: e.target.value }))} />
            </div>
          </div>

          {/* Row 3: Equipment picker (team only) */}
          {!isSolo && <div className="field">
            <label>Equipment <span style={{ color: '#c84b2f' }}>*</span></label>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                <input value={equipSearch} onChange={e => setEquipSearch(e.target.value)}
                  placeholder="🔍 Search equipment…" style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13, outline: 'none' }} />
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {eqCategories.length === 0
                  ? <div style={{ padding: 12, fontSize: 13, color: 'var(--text3)' }}>No equipment found.</div>
                  : eqCategories.map(cat => (
                      <div key={cat}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', padding: '4px 12px 2px', background: 'var(--surface2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cat}</div>
                        {filteredEq.filter(e => e.category === cat).map(e => {
                          const active = form.equipment_id === e.id
                          return (
                            <div key={e.id} onClick={() => { setForm(f => ({ ...f, equipment_id: e.id })); setSelectedEquip(e) }}
                              style={{ padding: '8px 12px', cursor: 'pointer', background: active ? 'var(--accent-light, #e8f4ff)' : 'transparent', borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}`, fontSize: 13, color: active ? 'var(--accent)' : 'var(--text)', fontWeight: active ? 600 : 400 }}>
                              {e.equipment_name}
                              {active && <span style={{ marginLeft: 6, fontSize: 11 }}>✓</span>}
                            </div>
                          )
                        })}
                      </div>
                    ))
                }
              </div>
              {selectedEquip && (
                <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--accent)', background: 'var(--accent-light, #e8f4ff)', fontWeight: 600 }}>
                  Selected: {selectedEquip.equipment_name}
                </div>
              )}
            </div>
          </div>}

          {/* Row 4: Result Type + Value */}
          <div className="grid-2">
            <div className="field">
              <label>Result Type</label>
              <select value={form.result_type} onChange={e => setForm(f => ({ ...f, result_type: e.target.value, result_value: '' }))}>
                {RESULT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{RESULT_TYPES.find(t => t.value === form.result_type)?.hint}</div>
            </div>
            <div className="field">
              <label>Result Value</label>
              <ResultValueInput type={form.result_type} value={form.result_value} onChange={v => setForm(f => ({ ...f, result_value: v }))} />
            </div>
          </div>

          {/* Row 5: Notes */}
          <div className="field">
            <label>Notes / Description</label>
            <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Observations, conditions, sample details…" style={{ resize: 'vertical' }} />
          </div>

          {/* Row 6: File upload */}
          <div className="field">
            <label>Upload File <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional — PDF, CSV, image, etc.)</span></label>
            <div style={{ border: '1.5px dashed var(--border)', borderRadius: 8, padding: '14px 16px', background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <input ref={fileInputRef} type="file"
                accept=".pdf,.csv,.txt,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.webp,.svg,.doc,.docx,.ppt,.pptx,.zip"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                style={{ flex: 1, fontSize: 13, minWidth: 0 }} />
              {uploadFile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{uploadFile.name}</span>
                  <button type="button" onClick={() => { setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, lineHeight: 1, padding: 0 }}>✕</button>
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>File will appear in Workspace → Records, organized by project and equipment.</div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : editingId ? 'Update Result' : 'Save Result'}</button>
            <button className="btn btn-sm" onClick={cancelForm}>Cancel</button>
          </div>
        </div>
      )}

      {/* Drill-down results browser */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : results.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">🧪</div><div>No results yet. Click "+ Add Result" to get started.</div></div>
      ) : (() => {
        // build nested map
        const byProject = {}
        results.forEach(r => {
          const pid = r.project_id || '__none__'
          const eid = r.equipment_id || '__none__'
          if (!byProject[pid]) byProject[pid] = {}
          if (!byProject[pid][eid]) byProject[pid][eid] = []
          byProject[pid][eid].push(r)
        })

        // ── Level 3: test list for a specific project + equipment ──
        if (drillProject && drillEquip) {
          const rows = isSolo
            ? Object.values(byProject[drillProject] || {}).flat().slice().sort((a, b) => (a.date || '') < (b.date || '') ? 1 : -1)
            : (byProject[drillProject]?.[drillEquip] || []).slice().sort((a, b) => (a.date || '') < (b.date || '') ? 1 : -1)
          const nums = rows.map(r => parseFloat(r.result_value)).filter(v => !isNaN(v))
          const pfRows = rows.filter(r => r.result_type === 'pass_fail')
          const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
          const std = nums.length > 1 ? Math.sqrt(nums.reduce((s, v) => s + (v - avg) ** 2, 0) / nums.length) : null
          const passRate = pfRows.length ? Math.round(pfRows.filter(r => r.result_value === 'Pass').length / pfRows.length * 100) : null
          return (
            <div>
              {/* Breadcrumb */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 16, flexWrap: 'wrap' }}>
                <button onClick={() => { setDrillProject(null); setDrillEquip(null) }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, padding: 0, fontSize: 13 }}>All Projects</button>
                <span style={{ color: 'var(--text3)' }}>›</span>
                {isSolo ? (
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>{projectMap[drillProject] || 'Project'}</span>
                ) : (
                  <>
                    <button onClick={() => setDrillEquip(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, padding: 0, fontSize: 13 }}>{projectMap[drillProject] || 'Project'}</button>
                    <span style={{ color: 'var(--text3)' }}>›</span>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{equipMap[drillEquip] || 'Equipment'}</span>
                  </>
                )}
              </div>
              {/* Summary stats */}
              {(avg !== null || passRate !== null) && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                  {[
                    { label: 'Tests', value: rows.length, color: 'var(--accent)' },
                    avg !== null && { label: 'Average', value: avg.toFixed(2), color: '#0369a1' },
                    std !== null && { label: 'Std Dev', value: std.toFixed(2), color: '#534AB7' },
                    passRate !== null && { label: 'Pass Rate', value: passRate + '%', color: passRate >= 80 ? '#1D9E75' : '#c84b2f' },
                  ].filter(Boolean).map(s => (
                    <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', textAlign: 'center', minWidth: 90 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}
              {/* Result cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rows.map(r => (
                  <div key={r.id} className="card" style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{r.test_name || 'Untitled Test'}</div>
                        {r.specimen_name && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>Specimen: <strong>{r.specimen_name}</strong></div>}
                        <span style={{ fontSize: 11, background: 'var(--surface2)', color: 'var(--text2)', borderRadius: 99, padding: '2px 8px' }}>
                          {RESULT_TYPES.find(t => t.value === r.result_type)?.label || r.result_type}
                        </span>
                        <div style={{ fontSize: 20, fontWeight: 700, color: r.result_value === 'Pass' ? '#1D9E75' : r.result_value === 'Fail' ? '#c84b2f' : 'var(--accent)', margin: '6px 0 2px' }}>
                          {formatResultValue(r.result_type, r.result_value)}
                        </div>
                        {r.explanation && <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, marginTop: 4 }}>{r.explanation}</div>}
                        {r.created_by && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>by {r.created_by}</div>}
                        {fileMap[r.id] && <FileLink file={fileMap[r.id]} />}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'right' }}>
                          {r.date && <div style={{ fontWeight: 600 }}>{r.date}</div>}
                          <div>{new Date(r.created_at).toLocaleDateString()}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openEdit(r)} className="btn btn-sm" style={{ fontSize: 12, padding: '4px 10px' }}>✏️ Edit</button>
                          <button onClick={() => deleteResult(r.id)} className="btn btn-sm" style={{ fontSize: 12, padding: '4px 10px', color: '#c84b2f' }}>🗑</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        }

        // ── Level 2: equipment icons for a project ──
        if (drillProject) {
          const equipIds = Object.keys(byProject[drillProject] || {}).sort((a, b) => (equipMap[a] || 'zzz').localeCompare(equipMap[b] || 'zzz'))
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 16 }}>
                <button onClick={() => setDrillProject(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, padding: 0, fontSize: 13 }}>All Projects</button>
                <span style={{ color: 'var(--text3)' }}>›</span>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{projectMap[drillProject] || 'Project'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                {equipIds.map(eid => {
                  const rows   = byProject[drillProject][eid]
                  const nums   = rows.map(r => parseFloat(r.result_value)).filter(v => !isNaN(v))
                  const pf     = rows.filter(r => r.result_type === 'pass_fail')
                  const avg    = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
                  const pr     = pf.length ? Math.round(pf.filter(r => r.result_value === 'Pass').length / pf.length * 100) : null
                  return (
                    <div key={eid} onClick={() => setDrillEquip(eid)}
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 16px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🔧</div>
                      <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, marginBottom: 8 }}>{equipMap[eid] || 'Unknown Equipment'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>{rows.length} test{rows.length !== 1 ? 's' : ''}</div>
                      {avg !== null && <div style={{ fontSize: 12, fontWeight: 600, color: '#0369a1' }}>avg {avg.toFixed(2)}</div>}
                      {pr !== null && <div style={{ fontSize: 12, fontWeight: 600, color: pr >= 80 ? '#1D9E75' : '#c84b2f' }}>{pr}% pass</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        }

        // ── Level 1: project icons ──
        const projectIds = Object.keys(byProject).sort((a, b) => (projectMap[a] || 'zzz').localeCompare(projectMap[b] || 'zzz'))
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14 }}>
            {projectIds.map(pid => {
              const allRows  = Object.values(byProject[pid]).flat()
              const equipCnt = Object.keys(byProject[pid]).length
              const nums     = allRows.map(r => parseFloat(r.result_value)).filter(v => !isNaN(v))
              const pf       = allRows.filter(r => r.result_type === 'pass_fail')
              const pr       = pf.length ? Math.round(pf.filter(r => r.result_value === 'Pass').length / pf.length * 100) : null
              const latest   = allRows.map(r => r.date).filter(Boolean).sort().reverse()[0]
              return (
                <div key={pid} onClick={() => { setDrillProject(pid); if (isSolo) setDrillEquip('__none__') }}
                  style={{ background: 'var(--surface)', border: '2px solid var(--border)', borderRadius: 16, padding: '20px 16px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#1a56db'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(26,86,219,0.12)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}>
                  <div style={{ fontSize: 38, marginBottom: 10 }}>📁</div>
                  <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3, marginBottom: 10, color: 'var(--text)' }}>{projectMap[pid] || 'No Project'}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>{isSolo ? `${allRows.length} test${allRows.length !== 1 ? 's' : ''}` : `${equipCnt} equipment · ${allRows.length} tests`}</div>
                    {pr !== null && <div style={{ fontSize: 12, fontWeight: 600, color: pr >= 80 ? '#1D9E75' : '#c84b2f' }}>{pr}% pass rate</div>}
                    {latest && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Latest: {latest}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}

// ── Point Chart ───────────────────────────────────────────────
const PALETTE = ['#0d47a1','#c84b2f','#1D9E75','#534AB7','#b45309','#0369a1','#be185d','#065f46']
// Rasterize the chart SVG to PNG. CSS variables don't resolve inside a
// serialized SVG, so concrete colors are substituted from the live stylesheet.
async function chartSvgToPng(svgEl, w, h) {
  const clone = svgEl.cloneNode(true)
  const cs = getComputedStyle(document.documentElement)
  const resolveVars = s => s.replace(/var\((--[^),]+)[^)]*\)/g, (_, v) => cs.getPropertyValue(v).trim() || '#333')
  clone.querySelectorAll('*').forEach(el => {
    ;['stroke', 'fill'].forEach(a => {
      const val = el.getAttribute(a)
      if (val && val.includes('var(')) el.setAttribute(a, resolveVars(val))
    })
  })
  clone.setAttribute('width', w)
  clone.setAttribute('height', h)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.removeAttribute('style')
  const xml = new XMLSerializer().serializeToString(clone)
  const img = new Image()
  await new Promise((res, rej) => {
    img.onload = res
    img.onerror = rej
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
  })
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/png')
}

const NUM_TYPES = ['number', 'percentage', 'temperature', 'ratio']

const ChartNote = ({ children }) => (
  <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '24px 0' }}>{children}</div>
)

const CHART_SVG_STYLE = { width: '100%', maxWidth: 960, height: 'auto', overflow: 'visible', display: 'block', margin: '0 auto' }

function PointChart({ results, isOutlier, svgRef }) {
  if (!results.length) return null

  const W = 560, H = 220
  const pad = { t: 28, r: 20, b: 52, l: 50 }
  const cW = W - pad.l - pad.r
  const cH = H - pad.t - pad.b

  const getSpecimen = r => r.specimen_name || r.sample_name || 'Unknown'
  const specimens   = [...new Set(results.map(getSpecimen))]
  const xOf = sp => pad.l + (specimens.length <= 1 ? cW / 2 : (specimens.indexOf(sp) / (specimens.length - 1)) * cW)

  const NUMERIC_TYPES = ['number','percentage','temperature','ratio']
  const numericVals = results.filter(r => NUMERIC_TYPES.includes(r.result_type)).map(r => parseFloat(r.result_value)).filter(v => !isNaN(v))

  // per-specimen stats: mean, std, min, max
  const specimenStats = {}
  specimens.forEach(sp => {
    const spVals = results
      .filter(r => getSpecimen(r) === sp && NUMERIC_TYPES.includes(r.result_type))
      .map(r => parseFloat(r.result_value)).filter(v => !isNaN(v))
    if (spVals.length >= 1) {
      const mean = spVals.reduce((a, b) => a + b, 0) / spVals.length
      const std  = spVals.length >= 2 ? Math.sqrt(spVals.reduce((s, v) => s + (v - mean) ** 2, 0) / spVals.length) : 0
      specimenStats[sp] = { mean, std, min: Math.min(...spVals), max: Math.max(...spVals), count: spVals.length }
    }
  })

  // Y range — extend to fit error bars and min/max
  const allY = [
    ...numericVals,
    ...Object.values(specimenStats).flatMap(s => [s.mean + s.std, s.mean - s.std, s.min, s.max]),
  ]
  const rawMin = allY.length ? Math.min(...allY) : 0
  const rawMax = allY.length ? Math.max(...allY) : 1
  const padY   = (rawMax - rawMin) * 0.15 || 0.5
  const yMin   = rawMin - padY
  const yMax   = rawMax + padY
  const toY = v => pad.t + ((yMax - v) / (yMax - yMin)) * cH

  const ticks = 4
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => yMin + (i / ticks) * (yMax - yMin))

  const testNames = [...new Set(results.map(r => r.test_name || r.sample_name || 'Result'))]
  const colorOf   = n => PALETTE[testNames.indexOf(n) % PALETTE.length]

  // Linear regression trend line + R²
  const trendData = results
    .filter(r => NUMERIC_TYPES.includes(r.result_type))
    .map(r => { const xi = specimens.indexOf(getSpecimen(r)); const yi = parseFloat(r.result_value); return (!isNaN(yi) && xi >= 0) ? { xi, yi } : null })
    .filter(Boolean)

  let trendLine = null, r2 = null
  if (trendData.length >= 2 && specimens.length >= 2) {
    const n = trendData.length
    const sumX  = trendData.reduce((a, p) => a + p.xi, 0)
    const sumY  = trendData.reduce((a, p) => a + p.yi, 0)
    const sumXY = trendData.reduce((a, p) => a + p.xi * p.yi, 0)
    const sumX2 = trendData.reduce((a, p) => a + p.xi * p.xi, 0)
    const denom = n * sumX2 - sumX * sumX
    if (Math.abs(denom) > 1e-10) {
      const m    = (n * sumXY - sumX * sumY) / denom
      const b    = (sumY - m * sumX) / n
      const yBar = sumY / n
      const ssTot = trendData.reduce((a, p) => a + (p.yi - yBar) ** 2, 0)
      const ssRes = trendData.reduce((a, p) => a + (p.yi - (m * p.xi + b)) ** 2, 0)
      r2 = ssTot > 1e-10 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 1
      trendLine = {
        x1: xOf(specimens[0]), y1: toY(m * 0 + b),
        x2: xOf(specimens[specimens.length - 1]), y2: toY(m * (specimens.length - 1) + b),
      }
    }
  }

  const hasStdDev   = Object.values(specimenStats).some(s => s.std > 0)
  const hasMinMax   = Object.values(specimenStats).some(s => s.max > s.min)
  const hasPassFail = results.some(r => r.result_type === 'pass_fail')

  return (
    <div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={CHART_SVG_STYLE}>
        {/* Gridlines + Y-axis ticks */}
        {tickVals.map((v, i) => (
          <g key={i}>
            <line x1={pad.l} y1={toY(v)} x2={W - pad.r} y2={toY(v)} stroke="var(--border)" strokeWidth={0.8} strokeDasharray="3 3" />
            <text x={pad.l - 5} y={toY(v)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="var(--text3)">
              {Math.abs(v) < 100 ? (v % 1 === 0 ? v : v.toFixed(1)) : Math.round(v)}
            </text>
          </g>
        ))}
        {/* Axes */}
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="var(--text3)" strokeWidth={1} />
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="var(--text3)" strokeWidth={1} />

        {/* Trend line */}
        {trendLine && (
          <line x1={trendLine.x1} y1={trendLine.y1} x2={trendLine.x2} y2={trendLine.y2}
            stroke="#b45309" strokeWidth={1.8} strokeDasharray="6 3" strokeOpacity={0.85}>
            <title>Trend line (linear regression)</title>
          </line>
        )}

        {/* R² label inside chart — top right */}
        {r2 !== null && (
          <text x={W - pad.r - 2} y={pad.t - 6} textAnchor="end" fontSize={10} fill="#b45309" fontWeight="600">
            R² = {r2.toFixed(3)}
          </text>
        )}

        {/* Per-specimen: min/max range + std-dev bars + mean tick */}
        {Object.entries(specimenStats).map(([sp, s]) => {
          const x     = xOf(sp)
          const yMean = toY(s.mean)
          const yHi   = toY(s.mean + s.std)
          const yLo   = toY(s.mean - s.std)
          const yMax  = toY(s.max)
          const yMin_ = toY(s.min)
          return (
            <g key={sp}>
              {/* Min/Max outer range (thin dashed) */}
              {s.max > s.min && (
                <>
                  <line x1={x} y1={yMax} x2={x} y2={yMin_} stroke="#0d47a1" strokeWidth={1} strokeOpacity={0.18} strokeDasharray="2 2" />
                  <line x1={x - 9} y1={yMax} x2={x + 9} y2={yMax} stroke="#0d47a1" strokeWidth={1.5} strokeOpacity={0.45} />
                  <line x1={x - 9} y1={yMin_} x2={x + 9} y2={yMin_} stroke="#0d47a1" strokeWidth={1.5} strokeOpacity={0.45} />
                </>
              )}
              {/* Std-dev bar */}
              {s.std > 0 && (
                <>
                  <line x1={x} y1={yHi} x2={x} y2={yLo} stroke="#0d47a1" strokeWidth={2.5} strokeOpacity={0.38} />
                  <line x1={x - 6} y1={yHi} x2={x + 6} y2={yHi} stroke="#0d47a1" strokeWidth={1.5} strokeOpacity={0.6} />
                  <line x1={x - 6} y1={yLo} x2={x + 6} y2={yLo} stroke="#0d47a1" strokeWidth={1.5} strokeOpacity={0.6} />
                </>
              )}
              {/* Mean tick */}
              <line x1={x - 8} y1={yMean} x2={x + 8} y2={yMean} stroke="#0d47a1" strokeWidth={2.5} strokeOpacity={0.8}>
                <title>{sp}: mean={s.mean.toFixed(3)}, σ={s.std.toFixed(3)}, min={s.min.toFixed(3)}, max={s.max.toFixed(3)}</title>
              </line>
            </g>
          )
        })}

        {/* Data points */}
        {results.map((r, i) => {
          const sp    = getSpecimen(r)
          const x     = xOf(sp)
          const tname = r.test_name || r.sample_name || 'Result'
          const color = colorOf(tname)

          if (r.result_type === 'pass_fail') {
            const y = r.result_value === 'Pass' ? pad.t + cH * 0.12 : pad.t + cH * 0.88
            return (
              <polygon key={i} points={`${x},${y-5} ${x+5},${y} ${x},${y+5} ${x-5},${y}`}
                fill={r.result_value === 'Pass' ? '#1D9E75' : '#c84b2f'} stroke="white" strokeWidth={1.2}>
                <title>{sp}: {r.result_value} ({r.date})</title>
              </polygon>
            )
          }
          const v = parseFloat(r.result_value)
          if (isNaN(v)) return null
          const y       = toY(v)
          const outlier = isOutlier(r.result_value)
          return (
            <circle key={i} cx={x} cy={y} r={outlier ? 5.5 : 4.5}
              fill={outlier ? '#c84b2f' : color} stroke="white" strokeWidth={1.5}>
              <title>{sp}: {r.result_value}{r.result_type === 'percentage' ? '%' : ''} ({r.date}){outlier ? ' ⚠️ outlier' : ''}</title>
            </circle>
          )
        })}

        {/* X-axis specimen labels */}
        {specimens.map((sp, i) => (
          <text key={i} x={xOf(sp)} y={H - pad.b + 13} textAnchor="middle" fontSize={9} fill="var(--text2)"
            transform={specimens.length > 5 ? `rotate(-32,${xOf(sp)},${H - pad.b + 13})` : ''}>
            {sp.length > 12 ? sp.slice(0, 11) + '…' : sp}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 16px', marginTop: 8 }}>
        {testNames.map(n => (
          <span key={n} style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: colorOf(n), display: 'inline-block' }} />{n}
          </span>
        ))}
        {hasPassFail && <>
          <span style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 9, height: 9, background: '#1D9E75', display: 'inline-block', clipPath: 'polygon(50% 0%,100% 50%,50% 100%,0% 50%)' }} />Pass
          </span>
          <span style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 9, height: 9, background: '#c84b2f', display: 'inline-block', clipPath: 'polygon(50% 0%,100% 50%,50% 100%,0% 50%)' }} />Fail
          </span>
        </>}
        {hasStdDev && (
          <span style={{ fontSize: 11, color: '#0d47a1', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width={14} height={14} style={{ flexShrink: 0 }}>
              <line x1={7} y1={2} x2={7} y2={12} stroke="#0d47a1" strokeWidth={2} strokeOpacity={0.45} />
              <line x1={3} y1={2} x2={11} y2={2} stroke="#0d47a1" strokeWidth={1.5} strokeOpacity={0.6} />
              <line x1={3} y1={12} x2={11} y2={12} stroke="#0d47a1" strokeWidth={1.5} strokeOpacity={0.6} />
              <line x1={2} y1={7} x2={12} y2={7} stroke="#0d47a1" strokeWidth={2.5} strokeOpacity={0.8} />
            </svg>
            Std dev · mean
          </span>
        )}
        {hasMinMax && (
          <span style={{ fontSize: 11, color: '#0d47a1', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width={14} height={14} style={{ flexShrink: 0 }}>
              <line x1={7} y1={1} x2={7} y2={13} stroke="#0d47a1" strokeWidth={1} strokeOpacity={0.3} strokeDasharray="2 2" />
              <line x1={2} y1={1} x2={12} y2={1} stroke="#0d47a1" strokeWidth={1.5} strokeOpacity={0.5} />
              <line x1={2} y1={13} x2={12} y2={13} stroke="#0d47a1" strokeWidth={1.5} strokeOpacity={0.5} />
            </svg>
            Min / Max
          </span>
        )}
        {trendLine && (
          <span style={{ fontSize: 11, color: '#b45309', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width={20} height={14} style={{ flexShrink: 0 }}>
              <line x1={1} y1={12} x2={19} y2={2} stroke="#b45309" strokeWidth={1.8} strokeDasharray="5 3" strokeOpacity={0.85} />
            </svg>
            Trend line{r2 !== null ? ` (R²=${r2.toFixed(3)})` : ''}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>● Numeric · ◆ Pass/Fail · Red = outlier (&gt;2σ) · Hover points for details</div>
    </div>
  )
}

// ── Box plot: per-specimen median/quartiles/whiskers/outliers ──
function BoxPlotChart({ results, svgRef }) {
  const W = 560, H = 220
  const pad = { t: 20, r: 20, b: 52, l: 50 }
  const cW = W - pad.l - pad.r
  const cH = H - pad.t - pad.b

  const getSpecimen = r => r.specimen_name || r.sample_name || 'Unknown'
  const bySpec = {}
  results.filter(r => NUM_TYPES.includes(r.result_type)).forEach(r => {
    const v = parseFloat(r.result_value)
    if (!isNaN(v)) (bySpec[getSpecimen(r)] = bySpec[getSpecimen(r)] || []).push(v)
  })
  const specimens = Object.keys(bySpec)
  if (!specimens.length) return <ChartNote>No numeric results to plot.</ChartNote>

  const quant = (sorted, p) => {
    const i = (sorted.length - 1) * p
    const lo = Math.floor(i), hi = Math.ceil(i)
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
  }
  const stats = specimens.map(sp => {
    const vals = [...bySpec[sp]].sort((a, b) => a - b)
    const q1 = quant(vals, 0.25), med = quant(vals, 0.5), q3 = quant(vals, 0.75)
    const iqr = q3 - q1
    const loF = q1 - 1.5 * iqr, hiF = q3 + 1.5 * iqr
    const inliers = vals.filter(v => v >= loF && v <= hiF)
    return { sp, vals, q1, med, q3, wLo: Math.min(...inliers), wHi: Math.max(...inliers), outliers: vals.filter(v => v < loF || v > hiF) }
  })

  const allY = stats.flatMap(s => s.vals)
  const rawMin = Math.min(...allY), rawMax = Math.max(...allY)
  const padY = (rawMax - rawMin) * 0.15 || 0.5
  const yMin = rawMin - padY, yMax = rawMax + padY
  const toY = v => pad.t + ((yMax - v) / (yMax - yMin)) * cH
  const xOf = i => pad.l + (specimens.length <= 1 ? cW / 2 : (i / (specimens.length - 1)) * cW * 0.9 + cW * 0.05)
  const boxW = Math.max(14, Math.min(34, (cW / specimens.length) * 0.5))
  const ticks = 4
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => yMin + (i / ticks) * (yMax - yMin))
  const anyBox = stats.some(s => s.vals.length >= 3)

  return (
    <div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={CHART_SVG_STYLE}>
        {tickVals.map((v, i) => (
          <g key={i}>
            <line x1={pad.l} y1={toY(v)} x2={W - pad.r} y2={toY(v)} stroke="var(--border)" strokeWidth={0.8} strokeDasharray="3 3" />
            <text x={pad.l - 5} y={toY(v)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="var(--text3)">
              {Math.abs(v) < 100 ? (v % 1 === 0 ? v : v.toFixed(1)) : Math.round(v)}
            </text>
          </g>
        ))}
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="var(--text3)" strokeWidth={1} />
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="var(--text3)" strokeWidth={1} />

        {stats.map((s, i) => {
          const x = xOf(i)
          if (s.vals.length < 3) {
            return (
              <g key={s.sp}>
                {s.vals.map((v, j) => (
                  <circle key={j} cx={x} cy={toY(v)} r={4} fill="#0d47a1" stroke="white" strokeWidth={1.2}>
                    <title>{s.sp}: {v} (n&lt;3 — box needs 3+ results)</title>
                  </circle>
                ))}
              </g>
            )
          }
          return (
            <g key={s.sp}>
              <line x1={x} y1={toY(s.wLo)} x2={x} y2={toY(s.q1)} stroke="#0d47a1" strokeWidth={1.2} strokeOpacity={0.6} />
              <line x1={x} y1={toY(s.q3)} x2={x} y2={toY(s.wHi)} stroke="#0d47a1" strokeWidth={1.2} strokeOpacity={0.6} />
              <line x1={x - boxW / 3} y1={toY(s.wLo)} x2={x + boxW / 3} y2={toY(s.wLo)} stroke="#0d47a1" strokeWidth={1.5} strokeOpacity={0.7} />
              <line x1={x - boxW / 3} y1={toY(s.wHi)} x2={x + boxW / 3} y2={toY(s.wHi)} stroke="#0d47a1" strokeWidth={1.5} strokeOpacity={0.7} />
              <rect x={x - boxW / 2} y={toY(s.q3)} width={boxW} height={Math.max(1, toY(s.q1) - toY(s.q3))}
                fill="rgba(29,158,117,0.18)" stroke="#1D9E75" strokeWidth={1.5} rx={2}>
                <title>{s.sp}: median={s.med.toFixed(3)}, Q1={s.q1.toFixed(3)}, Q3={s.q3.toFixed(3)}, n={s.vals.length}</title>
              </rect>
              <line x1={x - boxW / 2} y1={toY(s.med)} x2={x + boxW / 2} y2={toY(s.med)} stroke="#085041" strokeWidth={2.5} />
              {s.outliers.map((v, j) => (
                <circle key={j} cx={x} cy={toY(v)} r={4.5} fill="#c84b2f" stroke="white" strokeWidth={1.2}>
                  <title>{s.sp}: {v} ⚠️ outlier (outside 1.5×IQR)</title>
                </circle>
              ))}
            </g>
          )
        })}

        {specimens.map((sp, i) => (
          <text key={i} x={xOf(i)} y={H - pad.b + 13} textAnchor="middle" fontSize={9} fill="var(--text2)"
            transform={specimens.length > 5 ? `rotate(-32,${xOf(i)},${H - pad.b + 13})` : ''}>
            {sp.length > 12 ? sp.slice(0, 11) + '…' : sp}
          </text>
        ))}
      </svg>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
        Box = Q1–Q3 (IQR) · Dark line = median · Whiskers = range within 1.5×IQR · Red = outlier
        {!anyBox && ' · Boxes appear once a specimen has 3+ results'}
      </div>
    </div>
  )
}

// ── Control chart: results over time vs mean ±2σ/±3σ limits ──
function ControlChart({ results, svgRef }) {
  const W = 560, H = 220
  const pad = { t: 20, r: 34, b: 52, l: 50 }
  const cW = W - pad.l - pad.r
  const cH = H - pad.t - pad.b

  const pts = results.filter(r => NUM_TYPES.includes(r.result_type))
    .map(r => ({ v: parseFloat(r.result_value), date: r.date || '', sp: r.specimen_name || r.sample_name || '' }))
    .filter(p => !isNaN(p.v))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  if (pts.length < 2) return <ChartNote>Need at least 2 numeric results for a control chart.</ChartNote>

  const mean = pts.reduce((a, p) => a + p.v, 0) / pts.length
  const sd = Math.sqrt(pts.reduce((s, p) => s + (p.v - mean) ** 2, 0) / pts.length)
  const allY = [...pts.map(p => p.v), mean + 3 * sd, mean - 3 * sd]
  const rawMin = Math.min(...allY), rawMax = Math.max(...allY)
  const padY = (rawMax - rawMin) * 0.1 || 0.5
  const yMin = rawMin - padY, yMax = rawMax + padY
  const toY = v => pad.t + ((yMax - v) / (yMax - yMin)) * cH
  const xOf = i => pad.l + (i / (pts.length - 1)) * cW

  const fmtD = d => {
    if (!d) return ''
    const dt = new Date(d)
    return isNaN(dt) ? d : `${dt.getMonth() + 1}/${dt.getDate()}`
  }
  const labelEvery = Math.max(1, Math.ceil(pts.length / 6))
  const limits = [
    { v: mean, color: '#1D9E75', dash: '', label: 'x̄' },
    { v: mean + 2 * sd, color: '#d97706', dash: '5 3', label: '+2σ' },
    { v: mean - 2 * sd, color: '#d97706', dash: '5 3', label: '-2σ' },
    { v: mean + 3 * sd, color: '#c84b2f', dash: '3 3', label: '+3σ' },
    { v: mean - 3 * sd, color: '#c84b2f', dash: '3 3', label: '-3σ' },
  ]
  const zoneColor = v => Math.abs(v - mean) > 3 * sd ? '#c84b2f' : Math.abs(v - mean) > 2 * sd ? '#d97706' : '#0d47a1'

  return (
    <div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={CHART_SVG_STYLE}>
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="var(--text3)" strokeWidth={1} />
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="var(--text3)" strokeWidth={1} />

        {limits.map((l, i) => (
          <g key={i}>
            <line x1={pad.l} y1={toY(l.v)} x2={W - pad.r} y2={toY(l.v)} stroke={l.color} strokeWidth={l.label === 'x̄' ? 1.5 : 1.2} strokeDasharray={l.dash} strokeOpacity={0.75} />
            <text x={W - pad.r + 3} y={toY(l.v)} dominantBaseline="middle" fontSize={8} fill={l.color} fontWeight="600">{l.label}</text>
          </g>
        ))}

        <polyline points={pts.map((p, i) => `${xOf(i)},${toY(p.v)}`).join(' ')}
          fill="none" stroke="#0d47a1" strokeWidth={1.2} strokeOpacity={0.45} />

        {pts.map((p, i) => (
          <circle key={i} cx={xOf(i)} cy={toY(p.v)} r={4} fill={zoneColor(p.v)} stroke="white" strokeWidth={1.2}>
            <title>{p.sp ? `${p.sp}: ` : ''}{p.v} ({p.date || `#${i + 1}`}){Math.abs(p.v - mean) > 3 * sd ? ' ⚠️ beyond 3σ' : Math.abs(p.v - mean) > 2 * sd ? ' ⚠ beyond 2σ' : ''}</title>
          </circle>
        ))}

        {pts.map((p, i) => i % labelEvery === 0 ? (
          <text key={i} x={xOf(i)} y={H - pad.b + 13} textAnchor="middle" fontSize={8} fill="var(--text2)"
            transform={`rotate(-32,${xOf(i)},${H - pad.b + 13})`}>
            {fmtD(p.date) || `#${i + 1}`}
          </text>
        ) : null)}

        {[yMin, (yMin + yMax) / 2, yMax].map((v, i) => (
          <text key={i} x={pad.l - 5} y={toY(v)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="var(--text3)">
            {Math.abs(v) < 100 ? v.toFixed(1) : Math.round(v)}
          </text>
        ))}
      </svg>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
        Results in date order · Green = mean · Amber = ±2σ warning · Red = ±3σ control limit · Point color shows zone
      </div>
    </div>
  )
}

// ── Histogram: value distribution + fitted normal curve ──
function HistogramChart({ results, svgRef }) {
  const W = 560, H = 220
  const pad = { t: 20, r: 20, b: 40, l: 50 }
  const cW = W - pad.l - pad.r
  const cH = H - pad.t - pad.b

  const vals = results.filter(r => NUM_TYPES.includes(r.result_type))
    .map(r => parseFloat(r.result_value)).filter(v => !isNaN(v))
  if (vals.length < 5) return <ChartNote>Need at least 5 numeric results for a histogram.</ChartNote>

  const n = vals.length
  let lo = Math.min(...vals), hi = Math.max(...vals)
  if (hi === lo) { lo -= 0.5; hi += 0.5 }
  const bins = Math.max(5, Math.min(12, Math.ceil(Math.sqrt(n))))
  const bw = (hi - lo) / bins
  const counts = Array(bins).fill(0)
  vals.forEach(v => { counts[Math.min(bins - 1, Math.floor((v - lo) / bw))]++ })

  const mean = vals.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
  const curve = sd > 0 ? Array.from({ length: 61 }, (_, i) => {
    const x = lo + (i / 60) * (hi - lo)
    return { x, y: n * bw * (1 / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-((x - mean) ** 2) / (2 * sd * sd)) }
  }) : null
  const yTop = Math.max(...counts, ...(curve ? curve.map(c => c.y) : [0])) * 1.15
  const toY = c => pad.t + ((yTop - c) / yTop) * cH
  const toX = x => pad.l + ((x - lo) / (hi - lo)) * cW

  const yTicks = Array.from({ length: 4 }, (_, i) => Math.round((yTop / 3) * i)).filter((v, i, a) => a.indexOf(v) === i)

  return (
    <div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={CHART_SVG_STYLE}>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={pad.l} y1={toY(v)} x2={W - pad.r} y2={toY(v)} stroke="var(--border)" strokeWidth={0.8} strokeDasharray="3 3" />
            <text x={pad.l - 5} y={toY(v)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="var(--text3)">{v}</text>
          </g>
        ))}
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="var(--text3)" strokeWidth={1} />
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="var(--text3)" strokeWidth={1} />

        {counts.map((c, i) => {
          const x0 = toX(lo + i * bw)
          const barW = cW / bins - 2
          return (
            <rect key={i} x={x0 + 1} y={toY(c)} width={barW} height={Math.max(0, toY(0) - toY(c))}
              fill="rgba(29,158,117,0.35)" stroke="#1D9E75" strokeWidth={1} rx={1.5}>
              <title>{(lo + i * bw).toFixed(2)} – {(lo + (i + 1) * bw).toFixed(2)}: {c} result{c !== 1 ? 's' : ''}</title>
            </rect>
          )
        })}

        {curve && (
          <polyline points={curve.map(c => `${toX(c.x)},${toY(c.y)}`).join(' ')}
            fill="none" stroke="#b45309" strokeWidth={1.8} strokeOpacity={0.85} />
        )}

        {Array.from({ length: 6 }, (_, i) => lo + (i / 5) * (hi - lo)).map((v, i) => (
          <text key={i} x={toX(v)} y={H - pad.b + 13} textAnchor="middle" fontSize={9} fill="var(--text2)">
            {Math.abs(v) < 100 ? v.toFixed(1) : Math.round(v)}
          </text>
        ))}
      </svg>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
        Bars = result frequency ({bins} bins, n={n}){sd > 0 ? ` · Curve = normal fit (μ=${mean.toFixed(2)}, σ=${sd.toFixed(2)})` : ''} · Two peaks usually mean two operators, batches or methods
      </div>
    </div>
  )
}

const CHART_TYPES = [
  { key: 'points',  label: 'Points',    title: 'Results by Specimen' },
  { key: 'box',     label: 'Box plot',  title: 'Box Plot by Specimen' },
  { key: 'control', label: 'Control',   title: 'Control Chart' },
  { key: 'hist',    label: 'Histogram', title: 'Distribution Histogram' },
]

// ── Data Analysis ─────────────────────────────────────────────
function DataAnalysis({ allowedNames, userProjectGroup, userAssignedProjectIds }) {
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
  const [filterDate, setFilterDate] = useState('')
  const [filterProject, setFilterProject] = useState('')  // '' = all projects
  const [selectedRow, setSelectedRow] = useState(null)
  const [mobile, setMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)

  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // ── Inline add-result form ──
  const [showAddForm, setShowAddForm] = useState(false)
  const [addSaving, setAddSaving]     = useState(false)
  const [uploadFile, setUploadFile]   = useState(null)
  const [allProjects, setAllProjects] = useState([])
  const fileInputRef = useRef(null)
  const emptyAddForm = { test_name: '', specimen_name: '', project_id: '', result_type: 'number', result_value: '', description: '', result_date: new Date().toISOString().split('T')[0] }
  const [addForm, setAddForm] = useState(emptyAddForm)
  const chartSvgRef = useRef(null)
  const [chartType, setChartType] = useState('points')

  useEffect(() => {
    const isSolo = session?.loginMode === 'solo'
    if (isSolo) {
      sb.from('equipment_inventory').select('id, equipment_name, category').eq('is_active', true).eq('login_mode', 'solo').eq('solo_owner_id', session?.userId || '00000000-0000-0000-0000-000000000000').order('category').order('equipment_name')
        .then(({ data }) => { setEquipment(data || []); setLoadingEq(false) })
      if (session?.userId) {
        sb.from('projects').select('id, name, project_id').eq('solo_owner_id', session.userId).order('name')
          .then(({ data }) => setAllProjects(data || []))
      }
      return
    }
    let eqQ = sb.from('equipment_inventory').select('id, equipment_name, category').eq('is_active', true).order('category').order('equipment_name')
    eqQ = eqQ.eq('organization_id', session?.organizationId || '00000000-0000-0000-0000-000000000000')
    eqQ.then(({ data }) => { setEquipment(data || []); setLoadingEq(false) })
    if (session?.organizationId) {
      // all statuses — needed to resolve project names on old results;
      // the Add Result dropdown filters to active below
      sb.from('projects').select('id, name, project_id, status, pi_user_id, student_ids, project_group').eq('organization_id', session.organizationId).order('project_id')
        .then(({ data }) => setAllProjects(data || []))
    }
  }, [])

  useEffect(() => {
    if (!selected || allowedNames === undefined) return
    setLoadingRes(true)
    Promise.all([
      sb.from('test_result_entries').select('*').eq('equipment_id', selected.id).order('date', { ascending: true }),
      sb.from('analysis_comments').select('*').eq('equipment_id', selected.id).order('created_at', { ascending: true }),
    ]).then(([r, c]) => {
      const all = r.data || []
      const visible = allowedNames !== null
        ? all.filter(row => row.created_by && allowedNames.has(row.created_by))
        : all
      setResults(visible)
      setComments(c.data || [])
      setLoadingRes(false)
    })
  }, [selected, allowedNames])

  async function saveResult() {
    if (!addForm.test_name.trim()) { toast('Test name is required.'); return }
    if (!addForm.project_id)       { toast('Select a project.'); return }
    if (!addForm.result_value && addForm.result_value !== 0) { toast('Enter a result value.'); return }
    setAddSaving(true)
    const payload = {
      test_name: addForm.test_name.trim(),
      sample_name: addForm.test_name.trim(),
      specimen_name: addForm.specimen_name.trim() || null,
      project_id: addForm.project_id,
      equipment_id: selected.id,
      result_type: addForm.result_type || null,
      result_value: addForm.result_value !== '' ? String(addForm.result_value) : null,
      explanation: addForm.description.trim() || null,
      date: addForm.result_date || null,
      created_by: session?.username || session?.email || null,
    }
    const { data: saved, error } = await sb.from('test_result_entries').insert(payload).select('id').single()
    if (error) { toast('Save failed: ' + error.message); setAddSaving(false); return }

    if (uploadFile && saved?.id) {
      const path = `${addForm.project_id}/${selected.id}/${Date.now()}-${uploadFile.name}`
      try {
        const { url: fileUrl, ref: fileRef } = await StorageService.upload('project-records', path, uploadFile, { personal: true })
        await sb.from('project_record_files').insert({
          project_id: addForm.project_id,
          equipment_id: selected.id,
          test_result_id: saved.id,
          file_name: uploadFile.name,
          file_path: fileRef,
          file_url: fileUrl,
          file_size: uploadFile.size,
          file_type: uploadFile.type,
          created_by: session?.username || session?.email || null,
        })
      } catch (upErr) {
        toast('Result saved but file upload failed: ' + (upErr.message || ''))
      }
    }

    toast('Result saved ✓')
    setAddSaving(false)
    setShowAddForm(false)
    setAddForm(emptyAddForm)
    setUploadFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    // Reload results (apply same privacy filter)
    const { data: fresh } = await sb.from('test_result_entries').select('*').eq('equipment_id', selected.id).order('date', { ascending: true })
    const all = fresh || []
    const visible = allowedNames !== null
      ? all.filter(row => row.created_by && allowedNames.has(row.created_by))
      : all
    setResults(visible)
  }

  async function downloadPdf() {
    try {
      const { default: jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
      const pageW = doc.internal.pageSize.getWidth()

      doc.setFontSize(16)
      doc.setFont(undefined, 'bold')
      doc.text(`${selected.equipment_name} — ${CHART_TYPES.find(t => t.key === chartType)?.title || 'Test Results'}`, 40, 48)
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      doc.setTextColor(120)
      doc.text(`Generated ${new Date().toLocaleDateString()}${filterProject ? ` · project: ${projName(filterProject)}` : ''}${filterDate ? ` · filtered to ${filterDate}` : ''} · ${filteredResults.length} result${filteredResults.length !== 1 ? 's' : ''}`, 40, 64)

      let y = 84
      if (chartSvgRef.current) {
        const png = await chartSvgToPng(chartSvgRef.current, 1120, 440)
        const imgW = pageW - 80
        const imgH = imgW * (440 / 1120)
        doc.addImage(png, 'PNG', 40, y, imgW, imgH)
        y += imgH + 18
      }
      if (stats) {
        doc.setTextColor(60)
        doc.setFontSize(10)
        doc.text(`Mean: ${stats.avg.toFixed(3)}    Std dev: ${stats.std.toFixed(3)}    Min: ${stats.min}    Max: ${stats.max}    n = ${stats.count}`, 40, y)
        y += 20
      }
      autoTable(doc, {
        startY: y,
        head: [['Specimen', 'Test', 'Project', 'Value', 'Type', 'Date', 'By']],
        body: filteredResults.map(r => [
          r.specimen_name || r.sample_name || '—',
          r.test_name || '—',
          projName(r.project_id),
          `${r.result_value ?? '—'}${r.result_type === 'percentage' ? '%' : ''}`,
          r.result_type || '—',
          r.date || '—',
          r.created_by || '—',
        ]),
        styles: { fontSize: 9, halign: 'center', valign: 'middle' },
        columnStyles: { 0: { halign: 'left' }, 1: { halign: 'left' } },
        headStyles: { fillColor: [29, 158, 117] },
        margin: { left: 40, right: 40 },
      })
      doc.save(`${(selected.equipment_name || 'results').replace(/[^a-z0-9]+/gi, '_')}_results.pdf`)
    } catch (e) {
      toast('PDF export failed: ' + (e.message || ''))
    }
  }

  async function postComment() {
    if (!newComment.trim()) return
    setPostingCmt(true)
    const { data, error } = await sb.from('analysis_comments').insert({
      equipment_id: selected.id,
      author: session?.username || session?.name || session?.email || 'Anonymous',
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
  // Results can span multiple projects on the same equipment — keep them
  // separable: project filter + per-project labels so data never mixes silently
  const projName = id => {
    const p = allProjects.find(x => x.id === id)
    if (!p) return 'Deleted project'
    return (p.project_id || p.name) + (p.status && p.status !== 'active' ? ` (${p.status})` : '')
  }
  // New results can only go to active projects (names of inactive ones still resolve above)
  const activeProjects = allProjects.filter(p => !p.status || p.status === 'active')
  const resultProjects = [...new Set(results.map(r => r.project_id).filter(Boolean))]
  const filteredResults = results.filter(r =>
    (!filterDate || r.date === filterDate) && (!filterProject || r.project_id === filterProject)
  )

  const numericVals = filteredResults.filter(r => r.result_type === 'number' || r.result_type === 'percentage').map(r => parseFloat(r.result_value)).filter(v => !isNaN(v))
  const pfResults   = filteredResults.filter(r => r.result_type === 'pass_fail')
  const passRate    = pfResults.length ? Math.round((pfResults.filter(r => r.result_value === 'Pass').length / pfResults.length) * 100) : null

  let stats = null
  if (numericVals.length > 1) {
    const avg = numericVals.reduce((a, b) => a + b, 0) / numericVals.length
    const std = Math.sqrt(numericVals.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / numericVals.length)
    stats = { avg, min: Math.min(...numericVals), max: Math.max(...numericVals), std, count: numericVals.length }
  }
  const isOutlier = v => stats && Math.abs(parseFloat(v) - stats.avg) > 2 * stats.std
  const chartMax  = numericVals.length ? Math.max(...numericVals) : 1

  const sidebarSlot = !mobile && document.getElementById('sidebar-portal-slot')

  const equipPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search equipment…" style={{ width: '100%', fontSize: 13 }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loadingEq
          ? <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          : !categories.length && session?.loginMode === 'solo'
            ? <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.5 }}>No equipment yet.<br />Add equipment under the Equipment icon.</div>
            : categories.map(cat => {
              const items = filteredEq.filter(e => e.category === cat)
              if (!items.length) return null
              return (
                <div key={cat}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 12px 4px', background: 'var(--surface2)' }}>{cat}</div>
                  {items.map(e => {
                    const active = selected?.id === e.id
                    return (
                      <div key={e.id} onClick={() => { setSelected(e); setFilterDate(''); setFilterProject('') }}
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
    </div>
  )

  return (
    <div>
      {sidebarSlot && createPortal(equipPanel, sidebarSlot)}
      {mobile && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 16 }}>
          {equipPanel}
        </div>
      )}

      {/* Analysis panel */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                {resultProjects.length > 1 && (
                  <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
                    style={{ fontSize: 12, padding: '4px 8px', maxWidth: 200, border: filterProject ? '1.5px solid var(--accent3)' : undefined }}>
                    <option value="">All projects ({resultProjects.length})</option>
                    {resultProjects.map(pid => <option key={pid} value={pid}>{projName(pid)}</option>)}
                  </select>
                )}
                <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ fontSize: 12, padding: '4px 8px' }} />
                {(filterDate || filterProject) && <button onClick={() => { setFilterDate(''); setFilterProject('') }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 12 }}>✕ Clear</button>}
                <button className="btn btn-sm btn-primary" onClick={() => { setShowAddForm(f => !f); setAddForm(emptyAddForm); setUploadFile(null) }}>
                  {showAddForm ? '✕ Cancel' : '+ Add Result'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Inline Add Result Form ── */}
          {showAddForm && (
            <div className="card" style={{ border: '1.5px solid var(--accent)' }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: 'var(--accent)' }}>+ New Test Result</div>
              <div className="grid-2">
                <div className="field">
                  <label>Test Name <span style={{ color: '#c84b2f' }}>*</span></label>
                  <input value={addForm.test_name} onChange={e => setAddForm(f => ({ ...f, test_name: e.target.value }))} placeholder="e.g. Marshall Stability, Density Test…" autoFocus />
                </div>
                <div className="field">
                  <label>Specimen Name</label>
                  <input value={addForm.specimen_name} onChange={e => setAddForm(f => ({ ...f, specimen_name: e.target.value }))} placeholder="e.g. S1, Core-3, Mix-A…" />
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>Project <span style={{ color: '#c84b2f' }}>*</span></label>
                  <select value={addForm.project_id} onChange={e => setAddForm(f => ({ ...f, project_id: e.target.value }))}>
                    <option value="">— Select project —</option>
                    {(session?.userId === null || session?.dbRole === 'user' || session?.dbRole === 'admin'
                      ? activeProjects
                      : userAssignedProjectIds
                        ? activeProjects.filter(p => userAssignedProjectIds.includes(p.id))
                        : userProjectGroup
                          ? activeProjects.filter(p => !p.project_group || p.project_group === userProjectGroup)
                          : activeProjects
                    ).map(p => <option key={p.id} value={p.id}>{p.project_id ? `${p.project_id} – ${p.name}` : p.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Result Date</label>
                  <input type="date" value={addForm.result_date} onChange={e => setAddForm(f => ({ ...f, result_date: e.target.value }))} />
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>Result Type</label>
                  <select value={addForm.result_type} onChange={e => setAddForm(f => ({ ...f, result_type: e.target.value, result_value: '' }))}>
                    {RESULT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{RESULT_TYPES.find(t => t.value === addForm.result_type)?.hint}</div>
                </div>
                <div className="field">
                  <label>Result Value</label>
                  <ResultValueInput type={addForm.result_type} value={addForm.result_value} onChange={v => setAddForm(f => ({ ...f, result_value: v }))} />
                </div>
              </div>
              <div className="field">
                <label>Notes / Description</label>
                <textarea rows={3} value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} placeholder="Observations, conditions, sample details…" style={{ resize: 'vertical' }} />
              </div>
              <div className="field">
                <label>Upload File <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional — PDF, CSV, image, Excel, Word…)</span></label>
                <div style={{ border: '1.5px dashed var(--border)', borderRadius: 8, padding: '12px 16px', background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <input ref={fileInputRef} type="file"
                    accept=".pdf,.csv,.txt,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.ppt,.pptx,.zip"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    style={{ flex: 1, fontSize: 13, minWidth: 0 }} />
                  {uploadFile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{uploadFile.name}</span>
                      <button type="button" onClick={() => { setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, lineHeight: 1, padding: 0 }}>✕</button>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>File will appear in Workspace → Records, organised by project and equipment.</div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={saveResult} disabled={addSaving}>{addSaving ? 'Saving…' : 'Save Result'}</button>
                <button className="btn btn-sm" onClick={() => { setShowAddForm(false); setAddForm(emptyAddForm); setUploadFile(null) }}>Cancel</button>
              </div>
            </div>
          )}

          {loadingRes ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : filteredResults.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              No results yet for this equipment{filterDate ? ` on ${filterDate}` : ''}.
            </div>
          ) : (
            <>
              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                {[
                  { label: 'Total Results', value: filteredResults.length, color: 'var(--accent3)' },
                  ...(stats ? [
                    { label: 'Average', value: stats.avg.toFixed(2), color: '#0369a1' },
                    { label: 'Min',     value: stats.min.toFixed(2), color: '#1D9E75' },
                    { label: 'Max',     value: stats.max.toFixed(2), color: '#c84b2f' },
                    { label: 'Std Dev', value: stats.std.toFixed(2), color: '#534AB7' },
                  ] : []),
                  ...(passRate !== null ? [{ label: 'Pass Rate', value: passRate + '%', color: passRate >= 80 ? '#1D9E75' : '#c84b2f' }] : []),
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Chart card: type toggle + active chart */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', maxWidth: 1000, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  {/* Chart named after the equipment — every result here is the same test */}
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{selected.equipment_name}{filterProject ? ` · ${projName(filterProject)}` : ''} — {CHART_TYPES.find(t => t.key === chartType)?.title}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {CHART_TYPES.map(t => (
                      <button key={t.key} onClick={() => setChartType(t.key)}
                        style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${chartType === t.key ? 'var(--accent)' : 'var(--border)'}`, background: chartType === t.key ? 'var(--accent)' : 'var(--surface)', color: chartType === t.key ? '#fff' : 'var(--text2)', transition: 'all 0.15s' }}>
                        {t.label}
                      </button>
                    ))}
                    <button className="btn btn-sm" style={{ fontSize: 12 }} onClick={downloadPdf} title="Download chart + results as PDF">⬇ PDF</button>
                  </div>
                </div>
                {resultProjects.length > 1 && !filterProject && (
                  <div style={{ fontSize: 12, background: 'var(--warn-light)', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '6px 12px', marginBottom: 10 }}>
                    ⚠ Results from {resultProjects.length} projects are mixed in this chart — pick a project above to analyse one at a time.
                  </div>
                )}
                {chartType === 'points'  && <PointChart results={filteredResults} isOutlier={isOutlier} svgRef={chartSvgRef} />}
                {chartType === 'box'     && <BoxPlotChart results={filteredResults} svgRef={chartSvgRef} />}
                {chartType === 'control' && <ControlChart results={filteredResults} svgRef={chartSvgRef} />}
                {chartType === 'hist'    && <HistogramChart results={filteredResults} svgRef={chartSvgRef} />}
              </div>

              {/* Results table + sample info panel */}
              <div style={{ display: 'grid', gridTemplateColumns: selectedRow ? '1fr 280px' : '1fr', gap: 12, alignItems: 'start', maxWidth: 1000, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>All Results <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>— click a row for details</span></div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: 'var(--surface2)' }}>
                              {['Date', 'Sample', 'Project', 'Type', 'Result', 'Notes', 'By'].map(h => (
                                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredResults.map((r, i) => {
                              const outlier = (r.result_type === 'number' || r.result_type === 'percentage') && isOutlier(r.result_value)
                              const isActive = selectedRow?.id === r.id
                              return (
                                <tr key={r.id} onClick={() => setSelectedRow(isActive ? null : r)}
                                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: isActive ? 'var(--accent3-light)' : outlier ? '#fff5f5' : i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{r.date}</td>
                                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{r.test_name || r.sample_name}</td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--accent3-light)', color: 'var(--accent3)', borderRadius: 99, padding: '2px 8px', whiteSpace: 'nowrap' }}>{projName(r.project_id)}</span>
                                  </td>
                                  <td style={{ padding: '8px 12px', color: 'var(--text3)', fontSize: 11, textTransform: 'capitalize' }}>{r.result_type?.replace('_', '/')}</td>
                                  <td style={{ padding: '8px 12px', fontWeight: 600, color: outlier ? '#c84b2f' : r.result_value === 'Pass' ? '#1D9E75' : r.result_value === 'Fail' ? '#c84b2f' : 'var(--text)' }}>
                                    {r.result_type === 'percentage' ? r.result_value + '%' : r.result_value}{outlier ? ' ⚠️' : ''}
                                  </td>
                                  <td style={{ padding: '8px 12px', color: 'var(--text2)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.explanation || '—'}</td>
                                  <td style={{ padding: '8px 12px', color: 'var(--text3)' }}>{r.created_by || '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Sample test info panel */}
                    {selectedRow && (
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--accent3)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', position: 'sticky', top: 8 }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>🔬 Sample Test Info</span>
                          <button onClick={() => setSelectedRow(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text3)' }}>✕</button>
                        </div>
                        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {[
                            { label: 'Test Name',    value: selectedRow.test_name || selectedRow.sample_name },
                            { label: 'Date',         value: selectedRow.date },
                            { label: 'Result Type',  value: selectedRow.result_type?.replace('_', ' / ') },
                            { label: 'Result',       value: selectedRow.result_type === 'percentage' ? selectedRow.result_value + '%' : selectedRow.result_value, bold: true,
                              color: selectedRow.result_value === 'Pass' ? '#1D9E75' : selectedRow.result_value === 'Fail' ? '#c84b2f' : 'var(--text)' },
                            { label: 'Equipment',    value: selected?.equipment_name },
                            { label: 'Submitted By', value: selectedRow.created_by },
                            { label: 'Notes',        value: selectedRow.explanation, multiline: true },
                          ].map(f => f.value ? (
                            <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</div>
                              <div style={{ fontSize: 13, fontWeight: f.bold ? 700 : 400, color: f.color || 'var(--text)', lineHeight: f.multiline ? 1.5 : 1.3, background: 'var(--surface2)', borderRadius: 6, padding: '6px 10px' }}>
                                {f.value}
                              </div>
                            </div>
                          ) : null)}
                        </div>
                      </div>
                    )}
              </div>
            </>
          )}

          {/* Discussion */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', maxWidth: 1000, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>💬 Team Discussion</div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
              {comments.length === 0
                ? <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '16px 0' }}>No comments yet. Start the discussion below.</div>
                : comments.map(c => (
                    <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent3-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--accent3)', flexShrink: 0 }}>
                        {c.author?.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{c.author}</span>
                          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(c.created_at).toLocaleDateString()}</span>
                          {(session?.username === c.author || session?.name === c.author || session?.email === c.author || session?.role === 'admin') && (
                            <button onClick={() => deleteComment(c.id)} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text3)' }}>✕</button>
                          )}
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.5, background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px' }}>{c.body}</div>
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

// ── Records Panel ───────────────────────────────────────────────
function RecordsPanel({ projects, allowedNames, session }) {
  const [entries, setEntries] = useState([])
  const [fileMap, setFileMap] = useState({})   // test_result_id → file row
  const [loading, setLoading] = useState(true)
  const [drillProject, setDrillProject] = useState(null)
  const [drillEquip, setDrillEquip] = useState(null)
  const [equipment, setEquipment] = useState([])

  useEffect(() => {
    const isSolo = session?.loginMode === 'solo'
    if (isSolo) {
      sb.from('equipment_inventory').select('id, equipment_name').eq('is_active', true).eq('login_mode', 'solo').eq('solo_owner_id', session?.userId || '00000000-0000-0000-0000-000000000000')
        .then(({ data }) => setEquipment(data || []))
      return
    }
    let eqQ = sb.from('equipment_inventory').select('id, equipment_name')
    eqQ = eqQ.eq('organization_id', session?.organizationId || '00000000-0000-0000-0000-000000000000')
    eqQ.then(({ data }) => setEquipment(data || []))
  }, [])

  useEffect(() => { if (allowedNames !== undefined) loadData() }, [projects.length, allowedNames])

  async function loadData() {
    setLoading(true)
    const ids = projects.map(p => p.id)
    if (!ids.length) { setEntries([]); setFileMap({}); setLoading(false); return }
    const [{ data: rows }, { data: files }] = await Promise.all([
      sb.from('test_result_entries').select('*').in('project_id', ids).order('date', { ascending: false }),
      sb.from('project_record_files').select('*').in('project_id', ids),
    ])
    const all = rows || []
    const visible = allowedNames !== null
      ? all.filter(r => r.created_by && allowedNames.has(r.created_by))
      : all
    setEntries(visible)
    const fm = {}
    ;(files || []).forEach(f => { if (f.test_result_id) fm[f.test_result_id] = f })
    setFileMap(fm)
    setLoading(false)
  }

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name || p.project_name]))
  const equipMap = Object.fromEntries(equipment.map(e => [e.id, e.equipment_name]))

  const byProject = {}
  entries.forEach(r => {
    const pid = r.project_id || '__none__'
    const eid = r.equipment_id || '__none__'
    if (!byProject[pid]) byProject[pid] = {}
    if (!byProject[pid][eid]) byProject[pid][eid] = []
    byProject[pid][eid].push(r)
  })

  const fileIcon = t => {
    if (!t) return '📄'
    if (t.includes('pdf')) return '📑'
    if (t.includes('image')) return '🖼️'
    if (t.includes('csv') || t.includes('spreadsheet') || t.includes('excel')) return '📊'
    if (t.includes('text') || t.includes('plain')) return '📝'
    if (t.includes('zip') || t.includes('compressed')) return '🗜️'
    if (t.includes('word') || t.includes('document')) return '📃'
    return '📄'
  }

  const fmtSize = b => {
    if (!b) return ''
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / 1024 / 1024).toFixed(1)} MB`
  }

  const resultColor = r => r.result_value === 'Pass' ? '#1D9E75' : r.result_value === 'Fail' ? '#c84b2f' : 'var(--text)'

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (entries.length === 0) return <div className="empty-state"><div className="empty-icon">📂</div><div>No test results yet. Add results in Data Analysis.</div></div>

  // Level 3: results list for project + equipment
  if (drillProject && drillEquip) {
    const rows = byProject[drillProject]?.[drillEquip] || []
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => { setDrillProject(null); setDrillEquip(null) }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, padding: 0, fontSize: 13 }}>All Projects</button>
          <span style={{ color: 'var(--text3)' }}>›</span>
          <button onClick={() => setDrillEquip(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, padding: 0, fontSize: 13 }}>{projectMap[drillProject] || 'Project'}</button>
          <span style={{ color: 'var(--text3)' }}>›</span>
          <span style={{ fontWeight: 600 }}>{drillEquip === '__none__' ? 'No Equipment' : (equipMap[drillEquip] || 'Equipment')}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['Date', 'Test Name', 'Specimen', 'Type', 'Result', 'Notes', 'By', 'File'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const file = fileMap[r.id]
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text2)' }}>{r.date || '—'}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{r.test_name || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{r.specimen_name || r.sample_name || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text3)', fontSize: 11, textTransform: 'capitalize' }}>{r.result_type?.replace('_', '/') || '—'}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: resultColor(r) }}>
                      {r.result_type === 'percentage' ? (r.result_value + '%') : r.result_value || '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.explanation || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text3)' }}>{r.created_by || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {file ? <FileLink file={file} /> : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Level 2: equipment list for a project
  if (drillProject) {
    const equips = byProject[drillProject] || {}
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 16 }}>
          <button onClick={() => setDrillProject(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, padding: 0, fontSize: 13 }}>All Projects</button>
          <span style={{ color: 'var(--text3)' }}>›</span>
          <span style={{ fontWeight: 600 }}>{projectMap[drillProject] || 'Project'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
          {Object.entries(equips).map(([eid, rows]) => (
            <div key={eid} onClick={() => setDrillEquip(eid)}
              style={{ padding: 16, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light, #e8f4ff)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>🔧</div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{eid === '__none__' ? 'No Equipment' : (equipMap[eid] || 'Equipment')}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{rows.length} result{rows.length !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Level 1: project list
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
      {Object.entries(byProject).map(([pid, equips]) => {
        const total = Object.values(equips).reduce((s, arr) => s + arr.length, 0)
        return (
          <div key={pid} onClick={() => setDrillProject(pid)}
            style={{ padding: 16, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light, #e8f4ff)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>📁</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{projectMap[pid] || 'Unknown Project'}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{total} result{total !== 1 ? 's' : ''} · {Object.keys(equips).length} equipment</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Workspace Tab (members / data analysis / links) ────────────
// Workspace = Data Analysis directly. Records merged into Project Test
// Results; Links removed; Project Members promoted to its own sidebar tab.
function WorkspaceTab({ session, isSolo, allowedNames, userProjectGroup, userAssignedProjectIds }) {
  const isLabUser = !isSolo && session?.dbRole === 'lab_user'
  const hasProjectAccess = !isLabUser || !!userAssignedProjectIds

  if (!hasProjectAccess) return (
    <div className="empty-state" style={{ padding: 32 }}>
      <div className="empty-icon">📊</div>
      <div>No assigned projects yet — ask your lab manager to assign you to a project to see its data analysis.</div>
    </div>
  )

  return <DataAnalysis allowedNames={allowedNames} userProjectGroup={userProjectGroup} userAssignedProjectIds={userAssignedProjectIds} />
}

// ── Material Inventory Tab ─────────────────────────────────────
function MaterialInventoryTab({ session, isSolo, onProjectCreated }) {
  const { toast, sharedWorkspaces, viewingWorkspaceOwnerId, setViewingWorkspaceOwnerId } = useAppStore()
  const [allProjects, setAllProjects] = useState([])
  const [projects, setProjects] = useState([])
  const [users, setUsers] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [activeProject, setActiveProject] = useState(null)
  const [subTab, setSubTab] = useState('info')
  const [photoTarget, setPhotoTarget] = useState(null)
  const photoFileRef = useRef(null)

  // Project photo: managers/admins (team) or the workspace owner (solo)
  const canSetPhoto = !viewingWorkspaceOwnerId && (isSolo || session?.userId === null || session?.dbRole === 'admin' || session?.dbRole === 'user')

  async function uploadProjectPhoto(file) {
    if (!file || !photoTarget) return
    const ext = file.name.split('.').pop()
    const path = `project-photos/${photoTarget.id}_${Date.now()}.${ext}`
    const { error: upErr } = await sb.storage.from('project-files').upload(path, file)
    if (upErr) { toast('Upload failed: ' + upErr.message); return }
    const { data: url } = sb.storage.from('project-files').getPublicUrl(path)
    const { error } = await sb.from('projects').update({ photo_url: url.publicUrl }).eq('id', photoTarget.id)
    if (error) { toast('Could not save photo — the photo_url column is missing. Run the SQL migration.'); return }
    toast('Project photo updated ✓')
    setPhotoTarget(null)
    loadProjects()
  }

  useEffect(() => { loadProjects() }, [filter, viewingWorkspaceOwnerId])
  useEffect(() => { loadUsers() }, [])
  useEffect(() => { if (activeProjectId) loadActiveProject() }, [activeProjectId])

  async function loadProjects() {
    setLoading(true)
    const buildQuery = (select) => {
      let q = sb.from('projects').select(select).order('created_at', { ascending: false })
      if (isSolo && session?.userId) {
        q = q.eq('solo_owner_id', viewingWorkspaceOwnerId || session.userId)
      } else if (!isSolo) {
        q = q.is('solo_owner_id', null)
        if (session?.organizationId) q = q.eq('organization_id', session.organizationId)
      }
      if (filter !== 'all') q = q.eq('status', filter)
      return q
    }
    const baseSelect = 'id, name, project_id, status, cfop, pi_user_id, student_ids, sampling_date, notes, created_at'
    // photo_url needs the one-time SQL migration — fall back gracefully without it
    let { data, error } = await buildQuery(baseSelect + ', photo_url')
    if (error) ({ data } = await buildQuery(baseSelect))

    setAllProjects(data || [])
    setProjects(data || [])
    setLoading(false)
  }

  async function loadUsers() {
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
    { key: 'info',      label: '1 · Project Info' },
    { key: 'materials', label: '2 · Project Materials' },
    { key: 'storage',   label: '3 · Material Storage' },
  ]

  const viewingShared = isSolo && !!viewingWorkspaceOwnerId
  const viewingOwnerName = sharedWorkspaces.find(ws => ws.ownerId === viewingWorkspaceOwnerId)?.ownerName

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        {!viewingShared && (
          <>
            <button className={`btn btn-sm ${isSolo ? 'btn-purple' : 'btn-primary'}`} onClick={() => setShowNewModal(true)}>
              + Add project
            </button>
            <button className={`btn btn-sm ${isSolo ? 'btn-purple' : 'btn-primary'}`} onClick={() => setShowMaterialModal(true)}>
              + Add material
            </button>
          </>
        )}
      </div>

      {isSolo && sharedWorkspaces.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 14px', background: '#EEEDFE', borderRadius: 10, border: '1px solid #CECBF6', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#534AB7', marginRight: 4, flexShrink: 0 }}>Workspace:</span>
          <button
            onClick={() => { setViewingWorkspaceOwnerId(null); setActiveProjectId(null); setActiveProject(null) }}
            style={{ padding: '4px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: !viewingWorkspaceOwnerId ? '#534AB7' : 'rgba(83,74,183,0.12)', color: !viewingWorkspaceOwnerId ? '#fff' : '#534AB7', transition: 'all 0.15s' }}>
            My Workspace
          </button>
          {sharedWorkspaces.map(ws => (
            <button key={ws.ownerId}
              onClick={() => { setViewingWorkspaceOwnerId(ws.ownerId); setActiveProjectId(null); setActiveProject(null) }}
              style={{ padding: '4px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: viewingWorkspaceOwnerId === ws.ownerId ? '#534AB7' : 'rgba(83,74,183,0.12)', color: viewingWorkspaceOwnerId === ws.ownerId ? '#fff' : '#534AB7', transition: 'all 0.15s' }}>
              {ws.ownerName}'s Workspace
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {['all','active','on hold','completed'].map(f => (
          <button key={f} className={'filter-btn' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <input ref={photoFileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { uploadProjectPhoto(e.target.files?.[0]); e.target.value = '' }} />

      {/* ── Project card grid (Training-hub style) ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : projects.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}><div className="empty-icon">🧪</div><div>No projects found.</div></div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 20 }}>
          {projects.map(p => {
            const isActive = activeProjectId === p.id
            return (
              <div key={p.id} className="manage-card"
                onClick={() => { if (isActive) { setActiveProjectId(null); setActiveProject(null) } else { setActiveProjectId(p.id); setSubTab('info') } }}
                style={{ width: 176, flexShrink: 0, padding: p.photo_url ? '0 12px 14px' : '16px 12px 14px', cursor: 'pointer', overflow: 'hidden', ...(isActive ? { borderColor: 'var(--accent3)', background: 'var(--accent3-light)', boxShadow: '0 6px 18px rgba(83,74,183,0.18)' } : {}) }}>
                {p.photo_url
                  ? <img src={p.photo_url} alt="" style={{ width: 'calc(100% + 24px)', height: 90, objectFit: 'cover', borderRadius: '10px 10px 0 0', margin: '0 -12px 10px' }} />
                  : <div style={{ fontSize: 28, marginBottom: 8 }}>🧪</div>}
                <div style={{ fontWeight: 600, fontSize: 14, color: isActive ? 'var(--accent3)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                {p.project_id && <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.project_id}</div>}
                <div style={{ marginTop: 8, marginBottom: canSetPhoto ? 10 : 0 }}><span className={`badge ${statusBadge(p.status)}`} style={{ fontSize: 10, padding: '2px 8px' }}>{p.status}</span></div>
                {canSetPhoto && (
                  <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={e => { e.stopPropagation(); setPhotoTarget(p); photoFileRef.current?.click() }}>
                    {p.photo_url ? 'Change photo' : 'Photo'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Detail panel below the grid ── */}
      {!activeProject ? (
        !loading && projects.length > 0 && (
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)', padding: '8px 0 16px' }}>
            Select a project above to open it.
          </div>
        )
      ) : (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{activeProject.name}</div>
                <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>
                  {[activeProject.project_id && `Title: ${activeProject.project_id}`, activeProject.cfop && `CFOP: ${activeProject.cfop}`].filter(Boolean).join(' · ')}
                </div>
                {viewingShared && (
                  <div style={{ marginTop: 4, display: 'inline-block', fontSize: 11, fontWeight: 600, background: '#EEEDFE', color: '#534AB7', borderRadius: 99, padding: '2px 8px' }}>
                    {viewingOwnerName}'s workspace
                  </div>
                )}
              </div>
              {!viewingShared && (
                <button className="btn btn-sm btn-danger" onClick={() => deleteProject(activeProject.id)}>Delete</button>
              )}
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
            {subTab === 'info'      && <ProjectInfo project={activeProject} users={users} onSaved={loadActiveProject} isSolo={isSolo} readOnly={viewingShared} />}
            {subTab === 'materials' && <ProjectMaterials project={activeProject} />}
            {subTab === 'storage'   && <MaterialStorage project={activeProject} />}
          </div>
        </div>
      )}

      {showNewModal && (
        <NewProjectModal
          users={users}
          isSolo={isSolo}
          soloOwnerId={isSolo ? session?.userId : null}
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => { setActiveProjectId(id); loadProjects(); onProjectCreated?.() }}
        />
      )}

      {showMaterialModal && (
        <NewMaterialModal
          onClose={() => setShowMaterialModal(false)}
          onCreated={() => {}}
        />
      )}
    </div>
  )
}

// ── Main Screen ────────────────────────────────────────────────
export default function ProjectMaterial() {
  const { session } = useAppStore()
  const isSolo = session?.loginMode === 'solo'

  return (
    <div>
      <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="section-title">Project & Material</div>
        <HelpPanel screen="projects" />
      </div>
      <MaterialInventoryTab session={session} isSolo={isSolo} />
    </div>
  )
}
