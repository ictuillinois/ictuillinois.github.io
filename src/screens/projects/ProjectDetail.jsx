import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import Modal from '../../components/Modal'

export default function ProjectDetail() {
  const { currentProjectId, setScreen, toast } = useAppStore()
  const [project, setProject] = useState(null)
  const [supplies, setSupplies] = useState([])
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAddSupply, setShowAddSupply] = useState(false)
  const [form, setForm] = useState({})
  const [supplyForm, setSupplyForm] = useState({ name:'', quantity:1, unit:'pcs', notes:'' })

  useEffect(() => { if (currentProjectId) load() }, [currentProjectId])

  async function load() {
    const [{ data: p }, { data: s }] = await Promise.all([
      sb.from('projects').select('*').eq('id', currentProjectId).single(),
      sb.from('project_supplies').select('*').eq('project_id', currentProjectId).order('created_at'),
    ])
    setProject(p); setSupplies(s || [])
    if (p) setForm({ name: p.name, assigned_to: p.assigned_to||'', status: p.status, sampling_date: p.sampling_date||'', storage_date: p.storage_date||'', notes: p.notes||'' })
  }

  async function saveEdit() {
    const payload = { ...form, assigned_to: form.assigned_to||null, sampling_date: form.sampling_date||null, storage_date: form.storage_date||null, notes: form.notes||null }
    await sb.from('projects').update(payload).eq('id', currentProjectId)
    setShowEditModal(false); load(); toast('Project updated.')
  }

  async function deleteProject() {
    if (!confirm('Delete this project and all its materials?')) return
    await sb.from('projects').delete().eq('id', currentProjectId)
    setScreen('projects'); toast('Project deleted.')
  }

  async function cycleStatus() {
    const order = ['active','on hold','completed']
    const next = order[(order.indexOf(project.status) + 1) % 3]
    await sb.from('projects').update({ status: next }).eq('id', currentProjectId)
    load(); toast(`Status → ${next}`)
  }

  async function addSupply() {
    if (!supplyForm.name) { toast('Please enter an item name.'); return }
    await sb.from('project_supplies').insert({ project_id: currentProjectId, ...supplyForm, notes: supplyForm.notes||null })
    setShowAddSupply(false); setSupplyForm({ name:'', quantity:1, unit:'pcs', notes:'' }); load(); toast('Item added.')
  }

  async function deleteSupply(id) {
    if (!confirm('Remove this item?')) return
    await sb.from('project_supplies').delete().eq('id', id); load(); toast('Item removed.')
  }

  if (!project) return <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
  const statusBadge = project.status === 'active' ? 'badge-active' : project.status === 'completed' ? 'badge-completed' : 'badge-hold'

  return (
    <div>
      <div className="section-header">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 2 }}>Project</div>
          <div className="section-title">{project.name}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setScreen('projects')}>← Back</button>
          <button className="btn btn-sm" onClick={() => setShowEditModal(true)}>Edit</button>
          <button className="btn btn-sm btn-danger" onClick={deleteProject}>Delete</button>
        </div>
      </div>
      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <span className={`badge ${statusBadge}`} style={{ fontSize: 12, padding: '4px 12px' }}>{project.status}</span>
          <button className="btn btn-sm" onClick={cycleStatus}>Change status</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: project.notes ? 16 : 0 }}>
          {[['ASSIGNED TO',project.assigned_to||'—'],['SAMPLING DATE',project.sampling_date||'—'],['STORAGE DATE',project.storage_date||'—'],['CREATED',new Date(project.created_at).toLocaleDateString()]].map(([label,val])=>(
            <div key={label}><div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 4 }}>{label}</div><div style={{ fontWeight: 500 }}>{val}</div></div>
          ))}
        </div>
        {project.notes && <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: 12, fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>{project.notes}</div>}
      </div>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Materials & Supplies</div>
          <button className="btn btn-sm btn-purple" onClick={() => setShowAddSupply(true)}>+ Add item</button>
        </div>
        {supplies.length === 0
          ? <div style={{ textAlign: 'center', padding: 24, color: 'var(--text3)', fontSize: 14 }}>No materials added yet.</div>
          : supplies.map(s => (
            <div key={s.id} className="supply-row">
              <div><div style={{ fontWeight: 500, fontSize: 14 }}>{s.name}</div>{s.notes && <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{s.notes}</div>}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text2)' }}>{s.quantity} {s.unit}</span>
                <button className="btn btn-sm btn-danger" style={{ padding: '4px 10px' }} onClick={() => deleteSupply(s.id)}>✕</button>
              </div>
            </div>
          ))
        }
      </div>
      {showEditModal && (
        <Modal onClose={() => setShowEditModal(false)}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>Edit project</div>
          <div className="field"><label>Project name *</label><input value={form.name} onChange={e => setForm({...form,name:e.target.value})} /></div>
          <div className="field"><label>Assigned to</label><input value={form.assigned_to} onChange={e => setForm({...form,assigned_to:e.target.value})} /></div>
          <div className="field"><label>Status</label><select value={form.status} onChange={e => setForm({...form,status:e.target.value})}><option value="active">Active</option><option value="on hold">On Hold</option><option value="completed">Completed</option></select></div>
          <div className="grid-2">
            <div className="field"><label>Sampling date</label><input type="date" value={form.sampling_date} onChange={e => setForm({...form,sampling_date:e.target.value})} /></div>
            <div className="field"><label>Storage date</label><input type="date" value={form.storage_date} onChange={e => setForm({...form,storage_date:e.target.value})} /></div>
          </div>
          <div className="field"><label>Notes</label><textarea rows={3} value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} style={{ resize:'vertical' }} /></div>
          <div style={{ display:'flex',gap:10 }}><button className="btn btn-purple" onClick={saveEdit}>Save</button><button className="btn" onClick={() => setShowEditModal(false)}>Cancel</button></div>
        </Modal>
      )}
      {showAddSupply && (
        <Modal onClose={() => setShowAddSupply(false)}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>Add material / supply</div>
          <div className="field"><label>Item name *</label><input value={supplyForm.name} onChange={e => setSupplyForm({...supplyForm,name:e.target.value})} placeholder="e.g. Nitrile gloves (M)" /></div>
          <div className="grid-2">
            <div className="field"><label>Quantity</label><input type="number" value={supplyForm.quantity} onChange={e => setSupplyForm({...supplyForm,quantity:parseFloat(e.target.value)||0})} min="0" /></div>
            <div className="field"><label>Unit</label><input value={supplyForm.unit} onChange={e => setSupplyForm({...supplyForm,unit:e.target.value})} placeholder="pcs / boxes / mL…" /></div>
          </div>
          <div className="field"><label>Notes (optional)</label><input value={supplyForm.notes} onChange={e => setSupplyForm({...supplyForm,notes:e.target.value})} placeholder="e.g. size M, sterile" /></div>
          <div style={{ display:'flex',gap:10 }}><button className="btn btn-purple" onClick={addSupply}>Add item</button><button className="btn" onClick={() => setShowAddSupply(false)}>Cancel</button></div>
        </Modal>
      )}
    </div>
  )
}
