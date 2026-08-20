import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'

function IctLabLogo({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <polygon points="256,10 460,128 460,372 256,490 52,372 52,128" fill="#0C1140" stroke="#FF6B1A" strokeWidth="28" strokeLinejoin="round"/>
      <text x="256" y="290" textAnchor="middle" dominantBaseline="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="96" fontWeight="700" fill="#F5F0DC">ICT-Lab</text>
    </svg>
  )
}

function QRCode({ value, size = 180 }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size * 2}x${size * 2}&data=${encodeURIComponent(value)}&margin=4&color=000000&bgcolor=ffffff&ecc=H`
  const logoSize = Math.round(size * 0.32)
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <img src={url} width={size} height={size} style={{ display: 'block', imageRendering: 'pixelated' }} alt="QR Code" />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ background: '#fff', borderRadius: 4, padding: 4, lineHeight: 0 }}>
          <IctLabLogo size={logoSize} />
        </div>
      </div>
    </div>
  )
}

function typeLabel(type) {
  return { aggregate: 'Aggregate', asphalt_binder: 'Asphalt Binder', plant_mix: 'Plant Mix', cores: 'Cores', other: 'Other' }[type] || type
}

function typeAbbr(type) {
  return { aggregate: 'AGG', asphalt_binder: 'AB', plant_mix: 'PM', cores: 'CORE', other: 'OTH' }[type] || 'MAT'
}

function generateBarcodeId(project, material, allMaterials) {
  const projectId = (project.project_id || project.id.slice(0, 8)).toUpperCase().replace(/\s/g, '-')
  const abbr = typeAbbr(material.material_type)
  const sameType = allMaterials.filter(m => m.material_type === material.material_type)
  const seq = String(sameType.findIndex(m => m.id === material.id) + 1).padStart(2, '0')
  return `${projectId}-${abbr}-${seq}`
}

function buildScanUrl(material, project, allMaterials) {
  const name = material.name || typeLabel(material.material_type)
  const barcodeId = material.barcode_id || generateBarcodeId(project, material, allMaterials)
  const params = new URLSearchParams({
    item: name,
    type: 'material',
    project: project.name || '',
    pid: project.project_id || '',
    mtype: material.material_type || '',
    barcode: barcodeId,
  })
  if (material.sampling_date) params.set('sampled', material.sampling_date)
  const base = window.location.hostname === 'localhost' ? 'https://ictlab.labhive.app/' : window.location.origin + '/'
  return `${base}?${params.toString()}`
}

function PrintLabel({ material, project, allMaterials }) {
  const barcodeId = material.barcode_id || generateBarcodeId(project, material, allMaterials)
  const scanUrl   = buildScanUrl(material, project, allMaterials)
  const name      = material.name || typeLabel(material.material_type)
  return (
    <div id="print-label" style={{ width: '4in', height: '4in', background: '#fff', border: '1px solid #000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: 'Arial, sans-serif', gap: 10, boxSizing: 'border-box' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>ICT-Lab — Material Storage</div>
      <QRCode value={scanUrl} size={160} />
      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.05em', color: '#000' }}>{barcodeId}</div>
      <div style={{ width: '100%', borderTop: '1px solid #ddd', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#000', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
        <div style={{ fontSize: 12, color: '#333', textAlign: 'center' }}>{name} · {typeLabel(material.material_type)}</div>
        {material.sampling_date && <div style={{ fontSize: 11, color: '#666', textAlign: 'center' }}>Sampled: {material.sampling_date}</div>}
      </div>
    </div>
  )
}

function BarcodeScanner({ onScanned, onClose }) {
  const videoRef = useRef()
  const [error, setError] = useState('')
  const [manualInput, setManualInput] = useState('')

  useEffect(() => {
    let stream
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (e) { setError('Camera not available. Use manual entry below.') }
    }
    startCamera()
    return () => { if (stream) stream.getTracks().forEach(t => t.stop()) }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 400, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Scan Barcode</div>
          <button className="btn btn-sm" onClick={onClose}>✕ Close</button>
        </div>
        {error
          ? <div style={{ background: 'var(--accent2-light)', color: 'var(--accent2)', borderRadius: 'var(--radius)', padding: 12, fontSize: 14, marginBottom: 16 }}>{error}</div>
          : <div style={{ position: 'relative', marginBottom: 16, borderRadius: 'var(--radius)', overflow: 'hidden', background: '#000' }}>
              <video ref={videoRef} autoPlay playsInline style={{ width: '100%', display: 'block', maxHeight: 240, objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: 180, height: 180, border: '2px solid var(--accent)', borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)' }} />
              </div>
            </div>
        }
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12, textAlign: 'center' }}>— or enter manually —</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={manualInput} onChange={e => setManualInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && manualInput.trim() && onScanned(manualInput.trim())}
            placeholder="Type barcode ID…" autoFocus={!!error} style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={() => manualInput.trim() && onScanned(manualInput.trim())}>Use</button>
        </div>
      </div>
    </div>
  )
}

function BarcodeEditForm({ material, onSave, onCancel, saving }) {
  const [value, setValue] = useState(material.barcode_id || '')
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>Edit barcode ID:</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={value} onChange={e => setValue(e.target.value.toUpperCase())}
          style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 15, letterSpacing: '0.05em', flex: 1 }}
          placeholder="e.g. 2026-001-AGG-01"
          onKeyDown={e => e.key === 'Enter' && onSave(value)} autoFocus />
        <button className="btn btn-primary btn-sm" onClick={() => onSave(value)} disabled={saving}>{saving ? '…' : 'Save'}</button>
        <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function StorageNotesForm({ material, onSave }) {
  const [notes, setNotes] = useState(material.storage_notes || '')
  const [dirty, setDirty] = useState(false)
  return (
    <div>
      <textarea rows={3} value={notes} onChange={e => { setNotes(e.target.value); setDirty(true) }}
        placeholder="Any special storage instructions, access notes, hazards…" style={{ resize: 'vertical', marginBottom: 10 }} />
      {dirty && <button className="btn btn-sm btn-primary" onClick={() => { onSave(notes); setDirty(false) }}>Save notes</button>}
    </div>
  )
}

export default function MaterialStorage({ project }) {
  const { toast } = useAppStore()
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [showScanner, setShowScanner] = useState(false)
  const [showPrint, setShowPrint] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingBarcode, setEditingBarcode] = useState(null)

  useEffect(() => { load() }, [project.id])

  async function load() {
    setLoading(true)
    const { data } = await sb.from('project_materials').select('*').eq('project_id', project.id).order('created_at')
    setMaterials(data || [])
    if (data && data.length > 0 && !selectedId) setSelectedId(data[0].id)
    setLoading(false)
  }

  const selected = materials.find(m => m.id === selectedId)

  async function assignBarcode(material) {
    const generated = generateBarcodeId(project, material, materials)
    const { error } = await sb.from('project_materials').update({ barcode_id: generated, barcode_scanned_at: new Date().toISOString() }).eq('id', material.id)
    if (error) { toast('Error assigning barcode.'); return }
    toast(`Barcode assigned: ${generated}`); load()
  }

  async function saveBarcode(material, value) {
    if (!value.trim()) { toast('Barcode cannot be empty.'); return }
    setSaving(true)
    const { error } = await sb.from('project_materials').update({ barcode_id: value.trim(), barcode_scanned_at: new Date().toISOString() }).eq('id', material.id)
    setSaving(false)
    if (error?.code === '23505') { toast('This barcode ID already exists.'); return }
    if (error) { toast('Error saving barcode.'); return }
    setEditingBarcode(null); toast('Barcode saved.'); load()
  }

  async function confirmStorage(material) {
    if (!material.barcode_id) { toast('Please assign a barcode first.'); return }
    const { error } = await sb.from('project_materials').update({ storage_confirmed: true }).eq('id', material.id)
    if (error) { toast('Error confirming storage.'); return }
    toast('Storage confirmed ✓'); load()
  }

  async function saveNotes(material, notes) {
    await sb.from('project_materials').update({ storage_notes: notes }).eq('id', material.id)
    toast('Notes saved.'); load()
  }

  function printLabel() {
    const printContents = document.getElementById('print-label')?.outerHTML
    if (!printContents) return
    const css = '@page{size:4in 4in;margin:0}body{margin:0;padding:0;display:flex;align-items:center;justify-content:center;width:4in;height:4in}*{box-sizing:border-box}'
    const html = `<!DOCTYPE html><html><head><title>LabStock Label</title><style>${css}</style></head><body>${printContents}</body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (!win) return
    win.addEventListener('load', () => {
      win.focus()
      win.print()
      win.addEventListener('afterprint', () => { win.close(); URL.revokeObjectURL(url) })
    })
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (materials.length === 0) return <div className="empty-state" style={{ padding: 40 }}><div className="empty-icon">📦</div><div>No materials yet. Add materials in the Project Materials tab first.</div></div>

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Select material</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {materials.map(m => (
            <button key={m.id} onClick={() => setSelectedId(m.id)}
              style={{ padding: '8px 14px', borderRadius: 99, border: `2px solid ${selectedId === m.id ? 'var(--accent3)' : 'var(--border)'}`, background: selectedId === m.id ? 'var(--accent3-light)' : 'var(--surface)', color: selectedId === m.id ? 'var(--accent3)' : 'var(--text2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s', display: 'flex', alignItems: 'center', gap: 6 }}>
              {m.storage_confirmed && <span style={{ color: 'var(--accent)', fontSize: 12 }}>✓</span>}
              {m.name || typeLabel(m.material_type)}
              {m.barcode_id && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>· {m.barcode_id}</span>}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Barcode / ID</div>
            {selected.barcode_id && editingBarcode !== selected.id ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: 12 }}>
                    <QRCode value={buildScanUrl(selected, project, materials)} size={100} />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 6 }}>{selected.barcode_id}</div>
                    {selected.barcode_scanned_at && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Assigned {new Date(selected.barcode_scanned_at).toLocaleDateString()}</div>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm" onClick={() => setEditingBarcode(selected.id)}>✏️ Edit</button>
                      <button className="btn btn-sm" onClick={() => setShowScanner(true)}>📷 Scan new</button>
                      <button className="btn btn-sm btn-primary" onClick={() => setShowPrint(true)}>🖨️ Print QR label</button>
                    </div>
                  </div>
                </div>
                {selected.storage_confirmed && (
                  <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--accent-light)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                    <span style={{ fontSize: 16 }}>✅</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent)' }}>Storage confirmed</span>
                  </div>
                )}
              </div>
            ) : editingBarcode === selected.id ? (
              <BarcodeEditForm material={selected} onSave={(val) => saveBarcode(selected, val)} onCancel={() => setEditingBarcode(null)} saving={saving} />
            ) : (
              <div>
                <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 14 }}>No barcode ID assigned yet. Auto-generate one or scan/enter manually.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => assignBarcode(selected)}>⚡ Auto-generate</button>
                  <button className="btn btn-sm" onClick={() => setShowScanner(true)}>📷 Scan barcode</button>
                  <button className="btn btn-sm" onClick={() => setEditingBarcode(selected.id)}>⌨️ Enter manually</button>
                  <button className="btn btn-sm" onClick={() => setShowPrint(true)}>🖨️ Print QR label</button>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Auto-generated ID: {generateBarcodeId(project, selected, materials)}</div>
              </div>
            )}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Storage Location</div>
            {(selected.locations || []).length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(selected.locations || []).map((loc, i) => (
                  <span key={i} style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 99, padding: '4px 14px', fontSize: 13, fontWeight: 500 }}>📍 {loc.detail || loc.location_id || loc.location}</span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>No location assigned. Use the floor plan in the Project Materials tab to set one.</div>
            )}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Storage Notes</div>
            <StorageNotesForm material={selected} onSave={(notes) => saveNotes(selected, notes)} />
          </div>

          {!selected.storage_confirmed && (
            <button className="btn btn-primary" onClick={() => confirmStorage(selected)} style={{ width: '100%', padding: 14, fontSize: 15 }}>✅ Confirm Storage Complete</button>
          )}
        </div>
      )}

      {showScanner && <BarcodeScanner onScanned={(val) => { setShowScanner(false); saveBarcode(selected, val) }} onClose={() => setShowScanner(false)} />}

      {showPrint && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 480, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Label Preview (4" × 4")</div>
              <button className="btn btn-sm" onClick={() => setShowPrint(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20, background: 'var(--surface2)', padding: 20, borderRadius: 'var(--radius)' }}>
              <PrintLabel material={selected} project={project} allMaterials={materials} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, textAlign: 'center' }}>Make sure your Brother QL-1110NWB is connected and set to 4" tape.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={printLabel}>🖨️ Print now</button>
              <button className="btn" onClick={() => setShowPrint(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Single-material storage tab — same UI as MaterialStorage but for one material ──
export function SingleMaterialStorageTab({ material, onRefresh }) {
  const { toast } = useAppStore()
  const [saving, setSaving] = useState(false)
  const [editingBarcode, setEditingBarcode] = useState(false)
  const [showPrint, setShowPrint] = useState(false)

  const matName = material.name || typeLabel(material.material_type) || 'Material'
  const params = new URLSearchParams({ item: matName, type: 'material', mtype: material.material_type || '', barcode: material.barcode_id || matName })
  if (material.sampling_date) params.set('sampled', material.sampling_date)
  if (material.projects?.name) params.set('project', material.projects.name)
  const qrScanUrl = `https://labhive.app/?${params.toString()}`

  async function autoGenBarcode() {
    const abbr = typeAbbr(material.material_type)
    const generated = `${abbr}-${material.id.slice(0, 6).toUpperCase()}`
    const { error } = await sb.from('project_materials').update({ barcode_id: generated, barcode_scanned_at: new Date().toISOString() }).eq('id', material.id)
    if (error) { toast('Error assigning barcode.'); return }
    toast(`Barcode assigned: ${generated}`); onRefresh()
  }

  async function saveBarcode(value) {
    if (!value.trim()) { toast('Barcode cannot be empty.'); return }
    setSaving(true)
    const { error } = await sb.from('project_materials').update({ barcode_id: value.trim(), barcode_scanned_at: new Date().toISOString() }).eq('id', material.id)
    setSaving(false)
    if (error?.code === '23505') { toast('This barcode ID already exists.'); return }
    if (error) { toast('Error saving barcode.'); return }
    setEditingBarcode(false); toast('Barcode saved.'); onRefresh()
  }

  async function saveNotes(notes) {
    await sb.from('project_materials').update({ storage_notes: notes }).eq('id', material.id)
    toast('Notes saved.'); onRefresh()
  }

  async function confirmStorage() {
    if (!material.barcode_id) { toast('Please assign a barcode first.'); return }
    const { error } = await sb.from('project_materials').update({ storage_confirmed: true }).eq('id', material.id)
    if (error) { toast('Error confirming storage.'); return }
    toast('Storage confirmed ✓'); onRefresh()
  }

  function printLabel() {
    const el = document.getElementById('print-label-single')?.outerHTML
    if (!el) return
    const css = '@page{size:4in 4in;margin:0}body{margin:0;padding:0;display:flex;align-items:center;justify-content:center;width:4in;height:4in}*{box-sizing:border-box}'
    const win = window.open(URL.createObjectURL(new Blob([`<!DOCTYPE html><html><head><style>${css}</style></head><body>${el}</body></html>`], { type: 'text/html' })), '_blank')
    if (!win) return
    win.addEventListener('load', () => { win.focus(); win.print(); win.addEventListener('afterprint', () => win.close()) })
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Barcode / ID</div>
        {material.barcode_id && !editingBarcode ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: 12 }}>
                <QRCode value={qrScanUrl} size={100} />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 6 }}>{material.barcode_id}</div>
                {material.barcode_scanned_at && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Assigned {new Date(material.barcode_scanned_at).toLocaleDateString()}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm" onClick={() => setEditingBarcode(true)}>✏️ Edit</button>
                  <button className="btn btn-sm btn-primary" onClick={() => setShowPrint(true)}>🖨️ Print QR label</button>
                </div>
              </div>
            </div>
            {material.storage_confirmed && (
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--accent-light)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent)' }}>Storage confirmed</span>
              </div>
            )}
          </div>
        ) : editingBarcode ? (
          <BarcodeEditForm material={material} onSave={saveBarcode} onCancel={() => setEditingBarcode(false)} saving={saving} />
        ) : (
          <div>
            <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 14 }}>No barcode ID assigned yet. Auto-generate one or enter manually.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={autoGenBarcode}>⚡ Auto-generate</button>
              <button className="btn btn-sm" onClick={() => setEditingBarcode(true)}>⌨️ Enter manually</button>
              <button className="btn btn-sm" onClick={() => setShowPrint(true)}>🖨️ Print QR label</button>
            </div>
          </div>
        )}
      </div>

      {(material.locations || []).length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Storage Location</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(material.locations || []).map((loc, i) => (
              <span key={i} style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 99, padding: '4px 14px', fontSize: 13, fontWeight: 500 }}>📍 {loc.detail || loc.location_id || loc.location}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Storage Notes</div>
        <StorageNotesForm material={material} onSave={saveNotes} />
      </div>

      {!material.storage_confirmed && (
        <button className="btn btn-primary" onClick={confirmStorage} style={{ width: '100%', padding: 14, fontSize: 15 }}>✅ Confirm Storage Complete</button>
      )}

      {showPrint && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 480, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Label Preview (4" × 4")</div>
              <button className="btn btn-sm" onClick={() => setShowPrint(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20, background: 'var(--surface2)', padding: 20, borderRadius: 'var(--radius)' }}>
              <div id="print-label-single" style={{ width: '4in', height: '4in', background: '#fff', border: '1px solid #000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: 'Arial, sans-serif', gap: 10, boxSizing: 'border-box' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>ICT-Lab — Material Storage</div>
                <QRCode value={qrScanUrl} size={160} />
                {material.barcode_id && <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.05em', color: '#000' }}>{material.barcode_id}</div>}
                <div style={{ width: '100%', borderTop: '1px solid #ddd', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#000', textAlign: 'center' }}>{matName}</div>
                  {material.material_type && <div style={{ fontSize: 12, color: '#333', textAlign: 'center' }}>{typeLabel(material.material_type)}</div>}
                  {material.sampling_date && <div style={{ fontSize: 11, color: '#666', textAlign: 'center' }}>Sampled: {material.sampling_date}</div>}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, textAlign: 'center' }}>Make sure your Brother QL-1110NWB is connected and set to 4" tape.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={printLabel}>🖨️ Print now</button>
              <button className="btn" onClick={() => setShowPrint(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
