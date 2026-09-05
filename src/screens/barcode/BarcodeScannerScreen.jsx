import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import jsQR from 'jsqr'
import ScrollTabs from '../../components/ScrollTabs'

export const DEFAULT_TYPES = [
  { key: 'aggregate',      label: 'Aggregate' },
  { key: 'asphalt_binder', label: 'Asphalt Binder' },
  { key: 'plant_mix',      label: 'Plant Mix' },
  { key: 'cores',          label: 'Cores' },
  { key: 'other',          label: 'Other' },
]

// Category-appropriate defaults — used when org has no custom material_types saved
export const CATEGORY_DEFAULT_TYPES = {
  'Medical / Clinical': [
    { key: 'tissue_sample', label: 'Tissue Sample' },
    { key: 'blood_serum',   label: 'Blood / Serum' },
    { key: 'reagent',       label: 'Reagent / Chemical' },
    { key: 'cell_culture',  label: 'Cell Culture' },
    { key: 'device',        label: 'Medical Device' },
    { key: 'other',         label: 'Other' },
  ],
  'Research Institute': [
    { key: 'chemical',    label: 'Chemical / Reagent' },
    { key: 'biological',  label: 'Biological Sample' },
    { key: 'polymer',     label: 'Polymer / Plastic' },
    { key: 'metal',       label: 'Metal / Alloy' },
    { key: 'composite',   label: 'Composite' },
    { key: 'other',       label: 'Other' },
  ],
  'University / Academic': [
    { key: 'chemical',    label: 'Chemical / Reagent' },
    { key: 'biological',  label: 'Biological Sample' },
    { key: 'aggregate',   label: 'Aggregate' },
    { key: 'polymer',     label: 'Polymer / Plastic' },
    { key: 'metal',       label: 'Metal / Alloy' },
    { key: 'other',       label: 'Other' },
  ],
  'Industrial / Manufacturing': [
    { key: 'raw_material', label: 'Raw Material' },
    { key: 'metal',        label: 'Metal / Alloy' },
    { key: 'polymer',      label: 'Polymer / Plastic' },
    { key: 'composite',    label: 'Composite' },
    { key: 'liquid',       label: 'Liquid / Solvent' },
    { key: 'other',        label: 'Other' },
  ],
  'Government / Defense': [
    { key: 'metal',      label: 'Metal / Alloy' },
    { key: 'composite',  label: 'Composite' },
    { key: 'chemical',   label: 'Chemical' },
    { key: 'aggregate',  label: 'Aggregate' },
    { key: 'other',      label: 'Other' },
  ],
  'Teaching / Training': [
    { key: 'chemical',   label: 'Chemical / Reagent' },
    { key: 'aggregate',  label: 'Aggregate' },
    { key: 'metal',      label: 'Metal / Alloy' },
    { key: 'polymer',    label: 'Polymer / Plastic' },
    { key: 'other',      label: 'Other' },
  ],
}

const COLOR_PALETTE = [
  { bg: '#fef3c7', color: '#92400e' },
  { bg: '#e0f2fe', color: '#0369a1' },
  { bg: '#E1F5EE', color: '#085041' },
  { bg: '#EEEDFE', color: '#534AB7' },
  { bg: '#f0efe9', color: '#6b6860' },
  { bg: '#fce7f3', color: '#9d174d' },
  { bg: '#ecfdf5', color: '#065f46' },
  { bg: '#fff7ed', color: '#9a3412' },
]

export function buildTypeMap(types) {
  const labels = {}; const colors = {}
  ;(types || DEFAULT_TYPES).forEach((t, i) => {
    labels[t.key] = t.label
    colors[t.key] = COLOR_PALETTE[i % COLOR_PALETTE.length]
  })
  return { labels, colors }
}

const tLabel = (k, labelsMap) => labelsMap?.[k] || k || '—'

// ── Material detail card (shared between Scan + List tabs) ──────
function MaterialCard({ material, scannedValue, onClose, typeLabels }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 26 }}>✅</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Material found</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
              {scannedValue || material.barcode_id}
            </div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', padding: 4 }}>✕</button>
        )}
      </div>

      <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          {[
            ['Material', material.name || tLabel(material.material_type, typeLabels)],
            ['Type',     tLabel(material.material_type, typeLabels)],
            ['Project',  material.projects?.name || '—'],
            ['Project ID', material.projects?.project_id || '—'],
            ['Storage',  material.storage_confirmed ? '✅ Confirmed' : '⏳ Pending'],
            ['Sampled',  material.sampling_date || '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>

        {material.storage_notes && (
          <div style={{ padding: '10px 12px', background: 'var(--surface)', borderRadius: 'var(--radius)', borderLeft: '3px solid var(--accent)', marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Storage notes</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{material.storage_notes}</div>
          </div>
        )}

        {(material.locations || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {material.locations.map((loc, i) => (
              <span key={i} style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 99, padding: '4px 12px', fontSize: 12, fontWeight: 500 }}>
                📍 {loc.detail || loc.location_id || loc.location}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Scan Tab ────────────────────────────────────────────────────
function ScanTab({ typeLabels }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const detectorRef = useRef(null)
  const streamRef = useRef(null)

  const [cameraError, setCameraError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [result, setResult] = useState(null)
  const [looking, setLooking] = useState(false)

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [])

  async function startCamera() {
    setCameraError('')
    try {
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true })
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          initDetector()
        }
      }
    } catch {
      setCameraError('Camera not available on this device. Use the manual entry below.')
    }
  }

  function stopCamera() {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
  }

  function initDetector() {
    if ('BarcodeDetector' in window) {
      try {
        detectorRef.current = new window.BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix'],
        })
      } catch { /* fall through to jsQR */ }
    }
    setScanning(true)
    detectLoop()
  }

  function detectLoop() {
    const video = videoRef.current
    if (!video || video.readyState < 2) { animRef.current = requestAnimationFrame(detectLoop); return }

    if (detectorRef.current) {
      detectorRef.current.detect(video).then(codes => {
        if (codes.length > 0 && codes[0].rawValue) {
          setScanning(false)
          if (animRef.current) cancelAnimationFrame(animRef.current)
          lookupBarcode(codes[0].rawValue)
          return
        }
        animRef.current = requestAnimationFrame(detectLoop)
      }).catch(() => { animRef.current = requestAnimationFrame(detectLoop) })
    } else {
      const canvas = canvasRef.current
      if (!canvas || !video.videoWidth) { animRef.current = requestAnimationFrame(detectLoop); return }
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)
      if (code?.data) {
        setScanning(false)
        lookupBarcode(code.data)
        return
      }
      animRef.current = requestAnimationFrame(detectLoop)
    }
  }

  async function lookupBarcode(value) {
    setLooking(true); setResult(null)
    try {
      const { data } = await sb.from('project_materials')
        .select('*, projects(name, project_id)')
        .eq('barcode_id', value.trim().toUpperCase())
        .maybeSingle()
      setResult(data ? { found: true, material: data, scannedValue: value } : { found: false, scannedValue: value })
    } catch { setResult({ found: false, scannedValue: value, error: true }) }
    setLooking(false)
  }

  function reset() {
    setResult(null); setManualInput(''); setScanning(true); detectLoop()
  }

  return (
    <div>
      {!result && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
          {cameraError ? (
            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📷</div>
              <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>{cameraError}</div>
            </div>
          ) : (
            <div style={{ position: 'relative', background: '#000', minHeight: 240 }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'cover' }} />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: 200, height: 200, position: 'relative' }}>
                  {[['top:0,left:0'],['top:0,right:0'],['bottom:0,left:0'],['bottom:0,right:0']].map(([pos], i) => {
                    const p = Object.fromEntries(pos.split(',').map(s => s.split(':')))
                    return <div key={i} style={{ position: 'absolute', width: 28, height: 28, borderColor: '#00e5b0', borderStyle: 'solid', borderWidth: 0, ...p,
                      ...(pos.includes('top:0') ? { borderTopWidth: 3 } : { borderBottomWidth: 3 }),
                      ...(pos.includes('left:0') ? { borderLeftWidth: 3 } : { borderRightWidth: 3 }),
                      borderRadius: pos.includes('top:0,left:0') ? '6px 0 0 0' : pos.includes('top:0,right:0') ? '0 6px 0 0' : pos.includes('bottom:0,left:0') ? '0 0 0 6px' : '0 0 6px 0'
                    }} />
                  })}
                  {scanning && <div style={{ position: 'absolute', left: 4, right: 4, height: 2, background: 'rgba(0,229,176,0.8)', borderRadius: 1, animation: 'scanline 1.8s ease-in-out infinite' }} />}
                </div>
              </div>
              <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center' }}>
                {scanning && <span style={{ background: 'rgba(0,0,0,0.55)', color: '#00e5b0', fontSize: 12, padding: '4px 14px', borderRadius: 99, fontWeight: 500 }}>Scanning…</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {looking && (
        <div className="card" style={{ textAlign: 'center', padding: '24px', marginBottom: 16 }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, color: 'var(--text2)' }}>Looking up barcode…</div>
        </div>
      )}

      {result && !looking && (
        result.found
          ? <MaterialCard material={result.material} scannedValue={result.scannedValue} onClose={reset} typeLabels={typeLabels} />
          : (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 26 }}>❌</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Not found</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{result.scannedValue}</div>
                </div>
              </div>
              <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 14 }}>
                No material with barcode <strong>{result.scannedValue}</strong> was found.
              </div>
              <button className="btn btn-primary" onClick={reset}>📷 Scan another</button>
            </div>
          )
      )}

      {!result && (
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Manual entry</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>
            {cameraError ? 'Enter the barcode ID printed on the label:' : 'Or type a barcode ID directly:'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={manualInput}
              onChange={e => setManualInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && manualInput.trim() && lookupBarcode(manualInput)}
              placeholder="e.g. 2026-001-AGG-01"
              style={{ flex: 1, fontFamily: 'var(--mono)', fontWeight: 600, letterSpacing: '0.04em' }}
              autoFocus={!!cameraError}
            />
            <button className="btn btn-primary" onClick={() => manualInput.trim() && lookupBarcode(manualInput)} disabled={!manualInput.trim()}>
              Look up
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── All Materials Tab ───────────────────────────────────────────
function MaterialsTab({ typeLabels, typeColors }) {
  const { session } = useAppStore()
  const [materials, setMaterials] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const isSolo = session?.loginMode === 'solo'
    const isSuperAdmin = !session?.userId
    let projQ = sb.from('projects').select('id, name, project_id').order('name')
    if (isSolo && session?.userId) {
      projQ = projQ.eq('solo_owner_id', session.userId)
    } else if (!isSolo && !isSuperAdmin && session?.organizationId) {
      projQ = projQ.eq('organization_id', session.organizationId)
    }
    const { data: projs } = await projQ
    const isScoped = isSolo || (!isSuperAdmin && session?.organizationId)
    if (isScoped && (!projs || projs.length === 0)) {
      setMaterials([]); setProjects([]); setLoading(false); return
    }
    let matsQ = sb.from('project_materials').select('*, projects(id, name, project_id)').order('created_at', { ascending: false })
    if (isScoped && projs?.length) matsQ = matsQ.in('project_id', projs.map(p => p.id))
    const { data: mats } = await matsQ
    setMaterials(mats || [])
    setProjects(projs || [])
    setLoading(false)
  }

  const filtered = materials.filter(m => {
    if (typeFilter && m.material_type !== typeFilter) return false
    if (projectFilter && m.project_id !== projectFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const barcodeMatch = (m.barcode_id || '').toLowerCase().includes(q)
      const nameMatch    = (m.name || '').toLowerCase().includes(q)
      const projMatch    = (m.projects?.name || '').toLowerCase().includes(q)
      if (!barcodeMatch && !nameMatch && !projMatch) return false
    }
    return true
  })

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      {selected && (
        <MaterialCard material={selected} onClose={() => setSelected(null)} typeLabels={typeLabels} />
      )}

      {!selected && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ position: 'relative', flex: '1 1 180px' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text3)', pointerEvents: 'none' }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search barcode, name, project…" style={{ paddingLeft: 28, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ flex: '0 1 160px' }}>
              <option value="">All types</option>
              {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} style={{ flex: '0 1 180px' }}>
              <option value="">All projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name || p.project_id}</option>)}
            </select>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, fontFamily: 'var(--mono)' }}>
            {filtered.length} material{filtered.length !== 1 ? 's' : ''}
            {(search || typeFilter || projectFilter) ? ' (filtered)' : ''}
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>
              <div className="empty-icon">📦</div>
              {search || typeFilter || projectFilter ? 'No materials match your filters.' : 'No materials found.'}
            </div>
          ) : (
            filtered.map(m => {
              const tc = typeColors[m.material_type] || COLOR_PALETTE[COLOR_PALETTE.length - 1]
              return (
                <div key={m.id} className="card" style={{ padding: '12px 16px', marginBottom: 10, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                  onClick={() => setSelected(m)}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                          {m.barcode_id || <span style={{ color: 'var(--text3)', fontWeight: 400 }}>No barcode</span>}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 99, padding: '2px 8px', background: tc.bg, color: tc.color }}>
                          {tLabel(m.material_type, typeLabels)}
                        </span>
                        {m.storage_confirmed && <span style={{ fontSize: 11, color: '#085041', background: '#E1F5EE', borderRadius: 99, padding: '2px 8px' }}>✅ Stored</span>}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {m.name && <span style={{ fontWeight: 500 }}>{m.name}</span>}
                        {m.projects?.name && <span style={{ color: 'var(--text3)' }}>📁 {m.projects.name}</span>}
                        {m.sampling_date && <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>📅 {m.sampling_date}</span>}
                      </div>
                    </div>
                    <div style={{ color: 'var(--text3)', fontSize: 18, flexShrink: 0 }}>›</div>
                  </div>
                </div>
              )
            })
          )}
        </>
      )}
    </div>
  )
}

// ── Summary Tab ─────────────────────────────────────────────────
export function SummaryTab({ typeLabels, typeColors }) {
  const { session } = useAppStore()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const isSolo = session?.loginMode === 'solo'
    const isSuperAdmin = !session?.userId
    let scopedProjectIds = null
    if (isSolo && session?.userId) {
      const { data: projs } = await sb.from('projects').select('id').eq('solo_owner_id', session.userId)
      scopedProjectIds = (projs || []).map(p => p.id)
    } else if (!isSolo && !isSuperAdmin && session?.organizationId) {
      const { data: projs } = await sb.from('projects').select('id').eq('organization_id', session.organizationId)
      scopedProjectIds = (projs || []).map(p => p.id)
    }
    if (scopedProjectIds !== null && scopedProjectIds.length === 0) {
      setStats({ total: 0, withBarcode: 0, stored: 0, byType: {}, byProject: {} }); setLoading(false); return
    }
    let q = sb.from('project_materials').select('material_type, storage_confirmed, barcode_id, projects(name, project_id)')
    if (scopedProjectIds !== null) q = q.in('project_id', scopedProjectIds)
    const { data } = await q
    if (!data) { setLoading(false); return }

    const byType = {}
    const byProject = {}
    let withBarcode = 0, stored = 0

    data.forEach(m => {
      const t = m.material_type || 'other'
      byType[t] = (byType[t] || 0) + 1
      const pname = m.projects?.name || 'Unassigned'
      byProject[pname] = (byProject[pname] || 0) + 1
      if (m.barcode_id) withBarcode++
      if (m.storage_confirmed) stored++
    })

    setStats({ total: data.length, withBarcode, stored, byType, byProject })
    setLoading(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (!stats || stats.total === 0) return <div className="empty-state" style={{ padding: 32 }}><div className="empty-icon">📊</div>No materials yet.</div>

  return (
    <div>
      {/* Overview cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Materials', value: stats.total, color: 'var(--text)' },
          { label: 'With Barcode', value: stats.withBarcode, color: 'var(--accent)' },
          { label: 'Storage Confirmed', value: stats.stored, color: '#1D9E75' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ textAlign: 'center', padding: '16px 10px' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, lineHeight: 1.3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* By type */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>By Material Type</div>
        {Object.entries(typeLabels).map(([key, label]) => {
          const count = stats.byType[key] || 0
          if (!count) return null
          const tc = typeColors[key] || COLOR_PALETTE[COLOR_PALETTE.length - 1]
          const pct = Math.round(count / stats.total * 100)
          return (
            <div key={key} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 99, padding: '2px 8px', background: tc.bg, color: tc.color }}>{label}</span>
                </div>
                <span style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{count} ({pct}%)</span>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: tc.color, borderRadius: 99, width: `${pct}%`, transition: 'width 0.4s ease', opacity: 0.75 }} />
              </div>
            </div>
          )
        })}
        {/* Show any types in data that aren't in typeLabels (leftover from old config) */}
        {Object.entries(stats.byType).filter(([k]) => !typeLabels[k]).map(([key, count]) => {
          const pct = Math.round(count / stats.total * 100)
          return (
            <div key={key} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 99, padding: '2px 8px', background: '#f0f0f0', color: '#666' }}>{key}</span>
                <span style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{count} ({pct}%)</span>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#999', borderRadius: 99, width: `${pct}%`, transition: 'width 0.4s ease', opacity: 0.75 }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* By project */}
      <div className="card">
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>By Project</div>
        {Object.entries(stats.byProject)
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{name}</div>
              <div style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{count} material{count !== 1 ? 's' : ''}</div>
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ── Material Types Manager ────────────────────────────────────────────────────
export function MaterialTypesManager({ session }) {
  const [types, setTypes] = useState(null)
  const [orgCategory, setOrgCategory] = useState(null)
  const [newLabel, setNewLabel] = useState('')
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useAppStore()

  useEffect(() => { load() }, [])

  async function load() {
    if (!session?.organizationId) return
    const { data } = await sb.from('organizations').select('material_types, category').eq('id', session.organizationId).single()
    const cat = data?.category || null
    setOrgCategory(cat)
    const catDefaults = CATEGORY_DEFAULT_TYPES[cat] || DEFAULT_TYPES
    setTypes(data?.material_types?.length ? data.material_types : catDefaults)
  }

  function categoryDefaults() {
    return CATEGORY_DEFAULT_TYPES[orgCategory] || DEFAULT_TYPES
  }

  async function save(newTypes) {
    setSaving(true)
    const { error } = await sb.from('organizations').update({ material_types: newTypes }).eq('id', session.organizationId)
    if (error) { toast('Could not save: ' + error.message); setSaving(false); return }
    setTypes(newTypes)
    setSaving(false)
    toast('Material types saved.')
  }

  function generateKey(label) {
    return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  }

  function addType() {
    const label = newLabel.trim()
    if (!label) return
    const key = generateKey(label)
    if ((types || []).some(t => t.key === key)) { toast('A type with this name already exists.'); return }
    save([...(types || []), { key, label }])
    setNewLabel('')
  }

  function deleteType(key) {
    if (!confirm('Delete this type? Existing materials with this type will still show the key name.')) return
    save((types || []).filter(t => t.key !== key))
  }

  function move(i, dir) {
    const next = [...(types || [])]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    save(next)
  }

  function saveLabel(key) {
    if (!editing?.label?.trim()) { setEditing(null); return }
    save((types || []).map(t => t.key === key ? { ...t, label: editing.label.trim() } : t))
    setEditing(null)
  }

  function resetToDefaults() {
    const label = orgCategory ? `category defaults for "${orgCategory}"` : 'default types'
    if (!confirm(`Reset to ${label}? All custom types will be removed.`)) return
    save(categoryDefaults())
  }

  const { colors: typeColors } = buildTypeMap(types || DEFAULT_TYPES)

  if (!types) return <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Material Types</div>
          {orgCategory && <span style={{ fontSize: 11, background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 99, padding: '2px 10px', fontWeight: 600 }}>{orgCategory}</span>}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.5 }}>
          Customize the material type list for your organization. The defaults are based on your org's category. Changes apply immediately to all users.
        </div>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        {types.length === 0 && (
          <div style={{ padding: '16px', fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>No types defined. Add one below.</div>
        )}
        {types.map((type, i) => {
          const tc = typeColors[type.key] || { bg: '#f0f0f0', color: '#555' }
          return (
            <div key={type.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < types.length - 1 ? '1px solid var(--surface2)' : 'none' }}>
              <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 99, padding: '2px 10px', background: tc.bg, color: tc.color, flexShrink: 0 }}>{type.label}</span>
              {editing?.key === type.key ? (
                <>
                  <input autoFocus value={editing.label}
                    onChange={e => setEditing({ ...editing, label: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') saveLabel(type.key); if (e.key === 'Escape') setEditing(null) }}
                    style={{ flex: 1, fontSize: 13 }} />
                  <button className="btn btn-sm btn-primary" onClick={() => saveLabel(type.key)} disabled={saving}>Save</button>
                  <button className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{type.key}</div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="btn btn-sm" onClick={() => move(i, -1)} disabled={i === 0 || saving} title="Move up" style={{ padding: '4px 8px' }}>↑</button>
                    <button className="btn btn-sm" onClick={() => move(i, 1)} disabled={i === types.length - 1 || saving} title="Move down" style={{ padding: '4px 8px' }}>↓</button>
                    <button className="btn btn-sm" onClick={() => setEditing({ key: type.key, label: type.label })} title="Rename" style={{ padding: '4px 8px' }}>✏️</button>
                    <button className="btn btn-sm" onClick={() => deleteType(type.key)} title="Delete" disabled={saving} style={{ padding: '4px 8px', color: '#c84b2f' }}>🗑</button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Add new type</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addType()}
            placeholder="e.g. Bitumen Emulsion" style={{ flex: 1, fontSize: 13 }} />
          <button className="btn btn-primary" onClick={addType} disabled={!newLabel.trim() || saving}>Add</button>
        </div>
        {newLabel.trim() && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
            Key: <code style={{ background: 'var(--surface2)', padding: '1px 4px', borderRadius: 4 }}>{generateKey(newLabel)}</code>
          </div>
        )}
      </div>
      <button className="btn btn-sm" onClick={resetToDefaults} disabled={saving} style={{ fontSize: 12, color: 'var(--text3)' }}>
        Reset to defaults
      </button>
    </div>
  )
}

// ── Shared scanner content (used by both the standalone screen and BarcodeManager tab) ──
export function ScannerContent() {
  const { session } = useAppStore()
  const [tab, setTab] = useState('scan')
  const [orgTypes, setOrgTypes] = useState(DEFAULT_TYPES)

  useEffect(() => {
    if (session?.loginMode !== 'solo' && session?.organizationId) {
      sb.from('organizations').select('material_types').eq('id', session.organizationId).single()
        .then(({ data }) => { if (data?.material_types?.length) setOrgTypes(data.material_types) })
    }
  }, [session?.organizationId])

  const { labels: typeLabels, colors: typeColors } = buildTypeMap(orgTypes)

  const tabs = [
    { key: 'scan',      label: '📷 Scan' },
    { key: 'materials', label: '📦 All Materials' },
  ]
  return (
    <div>
      <ScrollTabs style={{ borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '10px 20px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: tab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `3px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`, marginBottom: -2, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </ScrollTabs>
      {tab === 'scan'      && <ScanTab typeLabels={typeLabels} />}
      {tab === 'materials' && <MaterialsTab typeLabels={typeLabels} typeColors={typeColors} />}
      <style>{`
        @keyframes scanline {
          0%   { top: 8px; opacity: 1; }
          50%  { top: calc(100% - 8px); opacity: 1; }
          100% { top: 8px; opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── Main Screen (standalone — for solo users / students) ─────────
export default function BarcodeScannerScreen() {
  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div className="section-title">QR Scan</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>Scan or browse project materials</div>
      </div>
      <ScannerContent />
    </div>
  )
}
