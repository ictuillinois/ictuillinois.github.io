import FloorPlanPicker from '../../components/FloorPlanPicker'
import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import Modal from '../../components/Modal'
import { DEFAULT_TYPES, CATEGORY_DEFAULT_TYPES } from '../../lib/materialTypes'

// ── Constants ─────────────────────────────────────────────────
const SIEVE_SIZES  = ['2"','1.5"','1"','3/4"','1/2"','3/8"','#4','#8','#16','#30','#50','#100','#200']
const PG_GRADES    = ['PG 52-28','PG 58-22','PG 58-28','PG 64-22','PG 64-28','PG 70-22','PG 70-28','PG 76-22','PG 76-28','PG 82-22','Other']
const LOCATIONS    = ['ICT-High Bay A','ICT-High Bay C','Shed','MFF - Soil Hall','MFF - Aggregate Hall','MFF - Saw Room','Other']
const CONTAINER_TYPES = ['Pallet','Metal Bucket','Plastic Bucket','Other']

// ── Solo material types & sub-fields ──────────────────────────
const SOLO_MATERIAL_TYPES = [
  'Chemical / Reagent', 'Biological Sample', 'Aggregate', 'Soil / Rock',
  'Metal', 'Polymer / Plastic', 'Ceramic / Composite', 'Liquid',
  'Powder', 'Fiber / Textile', 'Electronic Component', 'Other',
]
const SOLO_SUBFIELDS = {
  'Chemical / Reagent': [
    { key: 'grade',  label: 'Grade / Purity',  placeholder: 'e.g. ACS grade, 99.9%' },
    { key: 'cas',    label: 'CAS Number',       placeholder: 'e.g. 7732-18-5' },
    { key: 'hazard', label: 'Hazard Class',     placeholder: 'e.g. Flammable, Corrosive' },
  ],
  'Biological Sample': [
    { key: 'organism',     label: 'Organism / Species',    placeholder: 'e.g. E. coli K-12' },
    { key: 'bsl',          label: 'Biosafety Level',       placeholder: 'BSL-1, BSL-2…' },
    { key: 'preservation', label: 'Preservation Method',   placeholder: 'e.g. −80 °C frozen, formalin fixed' },
  ],
  'Aggregate': [
    { key: 'sieve', label: 'Sieve Sizes', placeholder: '' },
    { key: 'condition', label: 'Condition', placeholder: 'e.g. Raw, RAP, Crushed' },
  ],
  'Soil / Rock': [
    { key: 'formation', label: 'Formation / Origin', placeholder: 'e.g. Loess, Champaign Co.' },
    { key: 'depth',     label: 'Sample Depth',        placeholder: 'e.g. 0.5–1.0 m' },
  ],
  'Metal': [
    { key: 'alloy',    label: 'Alloy / Grade', placeholder: 'e.g. AISI 1018, 6061-T6' },
    { key: 'standard', label: 'Standard',      placeholder: 'e.g. ASTM A36' },
  ],
  'Polymer / Plastic': [
    { key: 'polymer_type', label: 'Polymer Type', placeholder: 'e.g. HDPE, Nylon 6/6, PET' },
    { key: 'grade',        label: 'Grade',        placeholder: 'e.g. Injection molding grade' },
  ],
  'Ceramic / Composite': [
    { key: 'composition', label: 'Composition',     placeholder: 'e.g. Al₂O₃, Carbon fiber/epoxy' },
    { key: 'standard',    label: 'Standard / Spec', placeholder: 'e.g. ASTM C773' },
  ],
  'Liquid': [
    { key: 'concentration', label: 'Concentration', placeholder: 'e.g. 1 M, 5% v/v' },
    { key: 'solvent',       label: 'Solvent / Base', placeholder: 'e.g. DI water, ethanol' },
  ],
  'Powder': [
    { key: 'particle_size', label: 'Particle Size', placeholder: 'e.g. <100 µm, D50 = 50 µm' },
    { key: 'purity',        label: 'Purity',        placeholder: 'e.g. 99.5%' },
  ],
  'Fiber / Textile': [
    { key: 'fiber_type', label: 'Fiber Type',    placeholder: 'e.g. Carbon, Glass, Kevlar' },
    { key: 'spec',       label: 'Specification', placeholder: 'e.g. 3K, 300 g/m²' },
  ],
  'Electronic Component': [
    { key: 'part_number', label: 'Part Number',   placeholder: 'e.g. STM32F407VGT6' },
    { key: 'spec',        label: 'Specification', placeholder: 'e.g. 32-bit MCU, 168 MHz' },
  ],
}
const SOLO_UNITS = ['g','kg','mg','µg','mL','L','µL','m³','cm³','items','pieces','m','cm','sheets','rolls','vials','other']
const SOLO_CONTAINERS = ['Vial','Bottle','Bag','Box','Jar','Drum','Cylinder','Envelope','Tray','Other']

// parse solo sub-fields stored as JSON in other_info
function parseSoloSubfields(other_info) {
  if (!other_info) return {}
  try { const p = JSON.parse(other_info); return p._solo || {} } catch { return {} }
}
function serializeSoloSubfields(subfields, notes) {
  const obj = { _solo: subfields }
  if (notes) obj.notes = notes
  return JSON.stringify(obj)
}

// ── Helpers ───────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>{title}</div>
      {children}
    </div>
  )
}

function CheckList({ options, selected, onChange, required }) {
  function toggle(opt) {
    onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt])
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(opt => {
        const on = selected.includes(opt)
        return (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            style={{ padding: '4px 12px', borderRadius: 99, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-light)' : 'var(--surface)', color: on ? 'var(--accent)' : 'var(--text2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s' }}>
            {opt}
          </button>
        )
      })}
    </div>
  )
}

// ── Material type form (conditional fields) ───────────────────
// orgTypes: array of {key, label} loaded from org's material_types (or category defaults)
function MaterialTypeForm({ form, setForm, orgTypes }) {
  const types = orgTypes?.length ? orgTypes : [
    { key: 'aggregate',      label: 'Aggregate' },
    { key: 'asphalt_binder', label: 'Asphalt Binder' },
    { key: 'plant_mix',      label: 'Plant Mix' },
    { key: 'cores',          label: 'Cores' },
    { key: 'other',          label: 'Other' },
  ]
  const [pgCustom, setPgCustom] = useState('')

  function setPG(val) {
    if (val === 'Other') {
      setForm(f => ({ ...f, ab_binder_pg: '' }))
    } else {
      setForm(f => ({ ...f, ab_binder_pg: val }))
    }
  }

  const isCustomPG = !PG_GRADES.slice(0,-1).includes(form.ab_binder_pg) && form.material_type === 'asphalt_binder'

  return (
    <Section title="1 · Material Type">
      {/* Type selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {types.map(t => {
          const on = form.material_type === t.key
          return (
            <button key={t.key} type="button" onClick={() => setForm(f => ({ ...f, material_type: t.key }))}
              style={{ padding: '8px 16px', borderRadius: 99, border: `2px solid ${on ? 'var(--accent3)' : 'var(--border)'}`, background: on ? 'var(--accent3-light)' : 'var(--surface)', color: on ? 'var(--accent3)' : 'var(--text2)', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── AGGREGATE ── */}
      {form.material_type === 'aggregate' && (
        <div>
          <div className="field">
            <label>Sieve Sizes <span style={{ color: 'var(--accent2)' }}>*</span></label>
            <CheckList options={SIEVE_SIZES} selected={form.agg_sieve_sizes || []} onChange={v => setForm(f => ({ ...f, agg_sieve_sizes: v }))} required />
            {(!form.agg_sieve_sizes || form.agg_sieve_sizes.length === 0) && (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Select at least one sieve size</div>
            )}
          </div>
          <div className="field">
            <label>Material Condition</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {['Raw','RAP'].map(opt => (
                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, marginBottom: 0 }}>
                  <input type="radio" name="agg_raw_rap" checked={form.agg_raw_or_rap === opt} onChange={() => setForm(f => ({ ...f, agg_raw_or_rap: opt }))} style={{ width: 'auto' }} />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ASPHALT BINDER ── */}
      {form.material_type === 'asphalt_binder' && (
        <div>
          <div className="field">
            <label>Binder PG Grade <span style={{ color: 'var(--accent2)' }}>*</span></label>
            <select value={isCustomPG ? 'Other' : form.ab_binder_pg} onChange={e => setPG(e.target.value)}>
              <option value="">— Select PG Grade —</option>
              {PG_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            {isCustomPG && (
              <input style={{ marginTop: 8 }} value={form.ab_binder_pg} onChange={e => setForm(f => ({ ...f, ab_binder_pg: e.target.value }))} placeholder="Enter custom PG grade…" />
            )}
          </div>
          <div className="field">
            <label>Mix Design Info</label>
            <input value={form.ab_mix_design || ''} onChange={e => setForm(f => ({ ...f, ab_mix_design: e.target.value }))} placeholder="e.g. Mix design #2024-07" />
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 0 }}>
              <input type="checkbox" checked={form.ab_has_polymer || false} onChange={e => setForm(f => ({ ...f, ab_has_polymer: e.target.checked, ab_polymer_info: e.target.checked ? f.ab_polymer_info : '' }))} style={{ width: 'auto' }} />
              <span>Contains Polymer?</span>
            </label>
          </div>
          {form.ab_has_polymer && (
            <div className="field">
              <label>Polymer Info</label>
              <input value={form.ab_polymer_info || ''} onChange={e => setForm(f => ({ ...f, ab_polymer_info: e.target.value }))} placeholder="Type, percentage, supplier…" />
            </div>
          )}
          <div className="field">
            <label>Other Additives</label>
            <input value={form.ab_other_additives || ''} onChange={e => setForm(f => ({ ...f, ab_other_additives: e.target.value }))} placeholder="e.g. Warm-mix additive, anti-strip…" />
          </div>
        </div>
      )}

      {/* ── PLANT MIX ── */}
      {form.material_type === 'plant_mix' && (
        <div>
          <div className="field">
            <label>Mix Design</label>
            <input value={form.pm_mix_design || ''} onChange={e => setForm(f => ({ ...f, pm_mix_design: e.target.value }))} placeholder="e.g. Mix design #2024-07" />
          </div>
          <div className="field">
            <label>Binder PG Grade <span style={{ color: 'var(--accent2)' }}>*</span></label>
            <select value={PG_GRADES.slice(0,-1).includes(form.pm_binder_pg) ? form.pm_binder_pg : (form.pm_binder_pg ? 'Other' : '')}
              onChange={e => setForm(f => ({ ...f, pm_binder_pg: e.target.value === 'Other' ? '' : e.target.value }))}>
              <option value="">— Select PG Grade —</option>
              {PG_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            {form.pm_binder_pg !== undefined && !PG_GRADES.slice(0,-1).includes(form.pm_binder_pg) && form.pm_binder_pg !== '' && (
              <input style={{ marginTop: 8 }} value={form.pm_binder_pg || ''} onChange={e => setForm(f => ({ ...f, pm_binder_pg: e.target.value }))} placeholder="Enter custom PG grade…" />
            )}
          </div>
        </div>
      )}

      {/* ── CORES ── */}
      {form.material_type === 'cores' && (
        <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderRadius: 'var(--radius)', fontSize: 14, color: 'var(--text2)' }}>
          Core samples — fill in source, quantity, location and photo tabs below.
        </div>
      )}

      {/* ── OTHER ── */}
      {form.material_type === 'other' && (
        <div className="field">
          <label>Additional Info <span style={{ color: 'var(--accent2)' }}>*</span></label>
          <textarea rows={3} value={form.other_info || ''} onChange={e => setForm(f => ({ ...f, other_info: e.target.value }))} placeholder="Describe the material type and any relevant details…" style={{ resize: 'vertical' }} />
        </div>
      )}

      {/* ── GENERIC fallback for custom/non-civil-eng types ── */}
      {form.material_type && !['aggregate','asphalt_binder','plant_mix','cores','other'].includes(form.material_type) && (
        <div className="field">
          <label>Additional Details (optional)</label>
          <textarea rows={3} value={form.other_info || ''} onChange={e => setForm(f => ({ ...f, other_info: e.target.value }))} placeholder="Grade, specification, lot number, or any relevant details…" style={{ resize: 'vertical' }} />
        </div>
      )}
    </Section>
  )
}

// ── Source form ───────────────────────────────────────────────
function SourceForm({ form, setForm }) {
  return (
    <Section title="2 · Material Source">
      <div className="field">
        <label>Source Type</label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {['Quarry','State','Company'].map(opt => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, marginBottom: 0 }}>
              <input type="radio" name="source_type" checked={form.source_type === opt} onChange={() => setForm(f => ({ ...f, source_type: opt }))} style={{ width: 'auto' }} />
              {opt}
            </label>
          ))}
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Name</label>
          <input value={form.source_name || ''} onChange={e => setForm(f => ({ ...f, source_name: e.target.value }))} placeholder="e.g. Vulcan Materials" />
        </div>
        <div className="field">
          <label>Location / Address</label>
          <input value={form.source_location || ''} onChange={e => setForm(f => ({ ...f, source_location: e.target.value }))} placeholder="e.g. 123 Quarry Rd, Champaign IL" />
        </div>
      </div>
    </Section>
  )
}

// ── QTY form ──────────────────────────────────────────────────
function QtyForm({ form, setForm }) {
  return (
    <Section title="3 · Material Quantity">
      <div className="grid-2">
        <div className="field">
          <label>Total Quantity</label>
          <input type="number" value={form.qty_total || ''} onChange={e => setForm(f => ({ ...f, qty_total: e.target.value }))} placeholder="e.g. 500" min="0" />
        </div>
        <div className="field">
          <label>Unit</label>
          <select value={form.qty_unit || ''} onChange={e => setForm(f => ({ ...f, qty_unit: e.target.value }))}>
            <option value="">— Select unit —</option>
            <option value="kg">kg</option>
            <option value="lbs">lbs</option>
            <option value="tons">tons</option>
            <option value="liters">liters</option>
            <option value="gallons">gallons</option>
            <option value="m³">m³</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Container Type</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CONTAINER_TYPES.map(opt => {
            const on = form.container_type === opt
            return (
              <button key={opt} type="button" onClick={() => setForm(f => ({ ...f, container_type: opt }))}
                style={{ padding: '4px 14px', borderRadius: 99, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-light)' : 'var(--surface)', color: on ? 'var(--accent)' : 'var(--text2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s' }}>
                {opt}
              </button>
            )
          })}
        </div>
      </div>
      {form.container_type === 'Other' && (
        <div className="field">
          <label>Container description</label>
          <input value={form.container_other || ''} onChange={e => setForm(f => ({ ...f, container_other: e.target.value }))} placeholder="Describe the container…" />
        </div>
      )}
      <div className="grid-2">
        <div className="field">
          <label>Container Color</label>
          <input value={form.container_color || ''} onChange={e => setForm(f => ({ ...f, container_color: e.target.value }))} placeholder="e.g. Red, Blue, Yellow" />
        </div>
        <div className="field">
          <label>Number of Containers</label>
          <input type="number" value={form.container_count || ''} onChange={e => setForm(f => ({ ...f, container_count: e.target.value }))} placeholder="e.g. 3" min="1" />
        </div>
      </div>
    </Section>
  )
}

// ── Location form ─────────────────────────────────────────────
function LocationForm({ form, setForm, projectId, projectName, materialId, materialType, isSolo }) {
  const [showPicker, setShowPicker] = useState(false)
  const locations = form.locations || []

  function handleConfirm(locs) {
    setForm(f => ({ ...f, locations: locs }))
  }

  function removeLocation(id) {
    setForm(f => ({ ...f, locations: f.locations.filter(l => l.location_id !== id) }))
  }

  // Solo users: plain text box
  if (isSolo) {
    return (
      <Section title="4 · Material Location">
        <div className="field">
          <label>Location</label>
          <input
            value={form.source_location || ''}
            onChange={e => setForm(f => ({ ...f, source_location: e.target.value }))}
            placeholder="e.g. Lab shelf B3, Room 204, Site A…"
          />
        </div>
      </Section>
    )
  }

  return (
    <Section title="4 · Material Location">
      {/* Selected locations chips */}
      {locations.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {locations.map((loc, i) => (
            <span key={i} style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 99, padding: '4px 12px', fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              📍 {loc.detail || loc.location_id || loc.location}
              <button onClick={() => removeLocation(loc.location_id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Open floor plan button */}
      <button className="btn btn-sm btn-primary" type="button" onClick={() => setShowPicker(true)}>
        🗺️ {locations.length > 0 ? 'Update on floor plan' : 'Select on floor plan'}
      </button>

      {/* Floor plan picker popup */}
      {showPicker && (
        <FloorPlanPicker
          projectId={projectId}
          projectName={projectName}
          materialId={materialId}
          materialType={materialType}
          currentLocations={locations}
          onConfirm={handleConfirm}
          onClose={() => setShowPicker(false)}
        />
      )}
    </Section>
  )
}

// ── Sampling date form ────────────────────────────────────────
function SamplingDateForm({ form, setForm }) {
  return (
    <Section title="5 · Date of Sampling">
      <div className="field" style={{ maxWidth: 240 }}>
        <label>Sampling Date</label>
        <input type="date" value={form.sampling_date || ''} onChange={e => setForm(f => ({ ...f, sampling_date: e.target.value }))} />
      </div>
    </Section>
  )
}

// ── Photo upload form ─────────────────────────────────────────
function PhotosForm({ form, setForm, materialId }) {
  const { toast } = useAppStore()
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef()

  async function compress(file) {
    return new Promise(resolve => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        const maxPx = 1200
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        canvas.toBlob(resolve, 'image/jpeg', 0.82)
      }
      img.src = url
    })
  }

  async function handleFiles(files) {
    if (!files.length) return
    setUploading(true)
    const urls = [...(form.photos || [])]
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      try {
        const blob = await compress(file)
        const filename = `materials/${materialId || 'new'}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
        const { error } = await sb.storage.from('item-photos').upload(filename, blob, { contentType: 'image/jpeg', upsert: true })
        if (error) throw error
        const { data } = sb.storage.from('item-photos').getPublicUrl(filename)
        urls.push(data.publicUrl)
      } catch (e) {
        toast('Upload failed for one file.')
      }
    }
    setForm(f => ({ ...f, photos: urls }))
    setUploading(false)
    toast(`${urls.length - (form.photos || []).length} photo(s) uploaded.`)
  }

  function removePhoto(url) {
    setForm(f => ({ ...f, photos: f.photos.filter(p => p !== url) }))
  }

  const hasPhotos = (form.photos || []).length > 0

  return (
    <Section title="6 · Material Photos">
      <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />

      {/* Photo grid */}
      {hasPhotos && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginBottom: 10 }}>
          {form.photos.map((url, i) => (
            <div key={i} style={{ position: 'relative', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '1' }}>
              <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button onClick={() => removePhoto(url)}
                style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Full drop zone when no photos yet; compact button when photos exist */}
      {!hasPhotos ? (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
          onClick={() => inputRef.current?.click()}
          style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius)', padding: 28, textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent3)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text2)', marginBottom: 4 }}>
            {uploading ? 'Uploading…' : 'Drag & drop photos here, or click to browse'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Multiple photos supported · JPG, PNG</div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1.5px dashed var(--border)', background: 'var(--surface2)', fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}
        >
          📷 {uploading ? 'Uploading…' : 'Add more photos'}
        </button>
      )}
    </Section>
  )
}

// ── Solo material forms ────────────────────────────────────────
function SoloMaterialTypeForm({ form, setForm }) {
  const isCustom = form.material_type && !SOLO_MATERIAL_TYPES.includes(form.material_type)

  function handleTypeSelect(val) {
    if (val === '__custom__') {
      setForm(f => ({ ...f, material_type: '', soloSubfields: {} }))
    } else {
      setForm(f => ({ ...f, material_type: val, soloSubfields: {} }))
    }
  }

  const subfields = SOLO_SUBFIELDS[form.material_type] || []

  return (
    <Section title="1 · Material Type">
      <div className="field">
        <label>Type <span style={{ color: 'var(--accent2)' }}>*</span></label>
        <select value={isCustom ? '__custom__' : (form.material_type || '')} onChange={e => handleTypeSelect(e.target.value)}>
          <option value="">— Select material type —</option>
          {SOLO_MATERIAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          <option value="__custom__">Other (custom)…</option>
        </select>
        {isCustom && (
          <input style={{ marginTop: 8 }} value={form.material_type} onChange={e => setForm(f => ({ ...f, material_type: e.target.value }))} placeholder="Describe material type…" />
        )}
      </div>

      {subfields.length > 0 && subfields.map(sf => {
        if (sf.key === 'sieve') {
          const selected = (form.soloSubfields?.sieve || '').split(',').filter(Boolean)
          return (
            <div key={sf.key} className="field">
              <label>{sf.label}</label>
              <CheckList options={SIEVE_SIZES} selected={selected} onChange={v => setForm(f => ({ ...f, soloSubfields: { ...f.soloSubfields, sieve: v.join(',') } }))} />
            </div>
          )
        }
        return (
          <div key={sf.key} className="field">
            <label>{sf.label}</label>
            <input value={form.soloSubfields?.[sf.key] || ''} onChange={e => setForm(f => ({ ...f, soloSubfields: { ...f.soloSubfields, [sf.key]: e.target.value } }))} placeholder={sf.placeholder} />
          </div>
        )
      })}
    </Section>
  )
}

function SoloSourceForm({ form, setForm }) {
  return (
    <Section title="2 · Material Source">
      <div className="grid-2">
        <div className="field">
          <label>Supplier / Provider</label>
          <input value={form.source_name || ''} onChange={e => setForm(f => ({ ...f, source_name: e.target.value }))} placeholder="e.g. Sigma-Aldrich, Fisher Scientific" />
        </div>
        <div className="field">
          <label>Catalog / Ref. Number</label>
          <input value={form.source_type || ''} onChange={e => setForm(f => ({ ...f, source_type: e.target.value }))} placeholder="e.g. S7653, Lot #2024-07" />
        </div>
      </div>
    </Section>
  )
}

function SoloQtyForm({ form, setForm }) {
  return (
    <Section title="3 · Material Quantity">
      <div className="grid-2">
        <div className="field">
          <label>Amount</label>
          <input type="number" value={form.qty_total || ''} onChange={e => setForm(f => ({ ...f, qty_total: e.target.value }))} placeholder="e.g. 250" min="0" />
        </div>
        <div className="field">
          <label>Unit</label>
          <select value={form.qty_unit || ''} onChange={e => setForm(f => ({ ...f, qty_unit: e.target.value }))}>
            <option value="">— Select unit —</option>
            {SOLO_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Container</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SOLO_CONTAINERS.map(opt => {
            const on = form.container_type === opt
            return (
              <button key={opt} type="button" onClick={() => setForm(f => ({ ...f, container_type: opt, container_other: '' }))}
                style={{ padding: '4px 14px', borderRadius: 99, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-light)' : 'var(--surface)', color: on ? 'var(--accent)' : 'var(--text2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s' }}>
                {opt}
              </button>
            )
          })}
        </div>
        {form.container_type === 'Other' && (
          <input style={{ marginTop: 8 }} value={form.container_other || ''} onChange={e => setForm(f => ({ ...f, container_other: e.target.value }))} placeholder="Describe container…" />
        )}
      </div>
      <div className="field" style={{ maxWidth: 160 }}>
        <label>Number of Containers</label>
        <input type="number" value={form.container_count || ''} onChange={e => setForm(f => ({ ...f, container_count: e.target.value }))} placeholder="e.g. 3" min="1" />
      </div>
    </Section>
  )
}

// ── Material type label helper ────────────────────────────────
function typeLabel(type) {
  return { aggregate: 'Aggregate', asphalt_binder: 'Asphalt Binder', plant_mix: 'Plant Mix', cores: 'Cores', other: 'Other' }[type] || type
}

function typeColor(type) {
  return { aggregate: '#92400e', asphalt_binder: '#085041', plant_mix: '#0369a1', cores: '#534AB7', other: '#6b6860' }[type] || '#6b6860'
}

function typeBg(type) {
  return { aggregate: '#fef3c7', asphalt_binder: '#E1F5EE', plant_mix: '#e0f2fe', cores: '#EEEDFE', other: '#f0efe9' }[type] || '#f0efe9'
}

// ── Blank form factory ────────────────────────────────────────
function blankForm() {
  return {
    name: '', material_type: '',
    agg_sieve_sizes: [], agg_raw_or_rap: '',
    ab_binder_pg: '', ab_mix_design: '', ab_has_polymer: false, ab_polymer_info: '', ab_other_additives: '',
    pm_mix_design: '', pm_binder_pg: '',
    other_info: '',
    soloSubfields: {},
    source_type: '', source_name: '', source_location: '',
    qty_total: '', qty_unit: '', container_type: '', container_color: '', container_count: '', container_other: '',
    locations: [],
    sampling_date: '',
    photos: [],
  }
}

// ── Validate form ─────────────────────────────────────────────
function validate(form, toast, isSolo) {
  if (!form.material_type?.trim()) { toast('Please select a material type.'); return false }
  if (isSolo) return true
  if (form.material_type === 'aggregate') {
    if (!form.agg_sieve_sizes || form.agg_sieve_sizes.length === 0) { toast('At least one sieve size is required for aggregate.'); return false }
  }
  if (form.material_type === 'asphalt_binder' && !form.ab_binder_pg) { toast('Binder PG grade is required.'); return false }
  if (form.material_type === 'plant_mix') {
    if (!form.pm_binder_pg) { toast('Binder PG grade is required for plant mix.'); return false }
  }
  if (form.material_type === 'other' && !form.other_info?.trim()) { toast('Please describe the material type.'); return false }
  return true
}

// ── Material form modal ───────────────────────────────────────
function MaterialModal({ projectId, projectName, material, onClose, onSaved }) {
  const { toast, session } = useAppStore()
  const isSolo = session?.loginMode === 'solo'
  const [orgTypes, setOrgTypes] = useState(null)

  useEffect(() => {
    if (isSolo || !session?.organizationId) return
    sb.from('organizations').select('material_types, category').eq('id', session.organizationId).single()
      .then(({ data }) => {
        const catDefaults = CATEGORY_DEFAULT_TYPES[data?.category] || DEFAULT_TYPES
        setOrgTypes(data?.material_types?.length ? data.material_types : catDefaults)
      })
  }, [session?.organizationId])

  const [form, setForm] = useState(material ? {
    name: material.name || '',
    material_type: material.material_type || '',
    agg_sieve_sizes: material.agg_sieve_sizes || [],
    agg_raw_or_rap: material.agg_raw_or_rap || '',
    ab_binder_pg: material.ab_binder_pg || '',
    ab_mix_design: material.ab_mix_design || '',
    ab_has_polymer: material.ab_has_polymer || false,
    ab_polymer_info: material.ab_polymer_info || '',
    ab_other_additives: material.ab_other_additives || '',
    pm_mix_design: material.pm_mix_design || '',
    pm_binder_pg: material.pm_binder_pg || '',
    other_info: material.other_info || '',
    soloSubfields: parseSoloSubfields(material.other_info),
    source_type: material.source_type || '',
    source_name: material.source_name || '',
    source_location: material.source_location || '',
    qty_total: material.qty_total || '',
    qty_unit: material.qty_unit || '',
    container_type: material.container_type || '',
    container_color: material.container_color || '',
    container_count: material.container_count || '',
    container_other: material.container_other || '',
    locations: material.locations || [],
    sampling_date: material.sampling_date || '',
    photos: material.photos || [],
  } : blankForm())
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!validate(form, toast, isSolo)) return
    setSaving(true)
    const payload = {
      project_id: projectId,
      name: form.name.trim() || null,
      material_type: form.material_type,
      agg_sieve_sizes: isSolo ? [] : form.agg_sieve_sizes,
      agg_raw_or_rap: isSolo ? null : (form.agg_raw_or_rap || null),
      ab_binder_pg: isSolo ? null : (form.ab_binder_pg || null),
      ab_mix_design: isSolo ? null : (form.ab_mix_design || null),
      ab_has_polymer: isSolo ? false : form.ab_has_polymer,
      ab_polymer_info: isSolo ? null : (form.ab_polymer_info || null),
      ab_other_additives: isSolo ? null : (form.ab_other_additives || null),
      pm_mix_design: isSolo ? null : (form.pm_mix_design || null),
      pm_binder_pg: isSolo ? null : (form.pm_binder_pg || null),
      other_info: isSolo ? serializeSoloSubfields(form.soloSubfields) : (form.other_info || null),
      source_type: form.source_type || null,
      source_name: form.source_name || null,
      source_location: form.source_location || null,
      qty_total: form.qty_total ? parseFloat(form.qty_total) : null,
      qty_unit: form.qty_unit || null,
      container_type: form.container_type || null,
      container_color: form.container_color || null,
      container_count: form.container_count ? parseInt(form.container_count) : null,
      container_other: form.container_other || null,
      locations: isSolo ? [] : form.locations,
      sampling_date: form.sampling_date || null,
      photos: form.photos,
    }
    let error
    if (material) {
      ({ error } = await sb.from('project_materials').update(payload).eq('id', material.id))
    } else {
      ({ error } = await sb.from('project_materials').insert(payload))
    }
    setSaving(false)
    if (error) { toast('Error: ' + (error.message || error.code || JSON.stringify(error))); return }
    toast(material ? 'Material updated.' : 'Material added.')
    onSaved()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 600, width: '100%', border: '1px solid var(--border)', margin: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{material ? 'Edit material' : 'Add material'}</div>
          <button className="btn btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        <div className="field">
          <label>Material Name / Label (optional)</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={isSolo ? 'e.g. Sodium chloride, Steel sample A…' : 'e.g. Base course aggregate, Surface binder…'} />
        </div>

        {isSolo ? (
          <>
            <SoloMaterialTypeForm form={form} setForm={setForm} />
            <SoloSourceForm form={form} setForm={setForm} />
            <SoloQtyForm form={form} setForm={setForm} />
            <LocationForm form={form} setForm={setForm} projectId={projectId} projectName={projectName} materialId={material?.id} materialType={form.material_type} isSolo={isSolo} />
            <SamplingDateForm form={form} setForm={setForm} />
          </>
        ) : (
          <>
            <MaterialTypeForm form={form} setForm={setForm} orgTypes={orgTypes} />
            <SourceForm form={form} setForm={setForm} />
            <QtyForm form={form} setForm={setForm} />
            <LocationForm form={form} setForm={setForm} projectId={projectId} projectName={projectName} materialId={material?.id} materialType={form.material_type} isSolo={isSolo} />
            <SamplingDateForm form={form} setForm={setForm} />
          </>
        )}
        <PhotosForm form={form} setForm={setForm} materialId={material?.id} />

        <div style={{ display: 'flex', gap: 10, marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-purple" onClick={save} disabled={saving}>{saving ? 'Saving…' : (material ? 'Update material' : 'Add material')}</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════
const TEAM_TYPES = ['aggregate', 'asphalt_binder', 'plant_mix', 'cores', 'other']

export default function ProjectMaterials({ project }) {
  const { toast, session } = useAppStore()
  const isSoloUser = session?.loginMode === 'solo'
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editMaterial, setEditMaterial] = useState(null)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { load() }, [project.id])

  async function load() {
    setLoading(true)
    const { data } = await sb.from('project_materials').select('*').eq('project_id', project.id).order('created_at')
    setMaterials(data || [])
    setLoading(false)
  }

  async function deleteMaterial(id) {
    if (!confirm('Delete this material?')) return
    await sb.from('project_materials').delete().eq('id', id)
    load()
    toast('Material deleted.')
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>{materials.length} material{materials.length !== 1 ? 's' : ''} in this project</div>
        <button className="btn btn-sm btn-purple" onClick={() => { setEditMaterial(null); setShowModal(true) }}>+ Add material</button>
      </div>

      {materials.length === 0 ? (
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="empty-icon">🧪</div>
          <div>No materials yet. Add your first material.</div>
        </div>
      ) : (
        materials.map(m => {
          const isOpen = expanded === m.id
          const firstPhoto = m.photos?.[0]
          return (
            <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: 12, overflow: 'hidden' }}>
              {/* Material card header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer', background: 'var(--surface)' }}
                onClick={() => setExpanded(isOpen ? null : m.id)}>
                {/* Thumbnail */}
                <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {firstPhoto
                    ? <img src={firstPhoto} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 22 }}>🧪</span>
                  }
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{m.name || typeLabel(m.material_type)}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 99, background: typeBg(m.material_type), color: typeColor(m.material_type) }}>
                      {typeLabel(m.material_type)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {m.material_type === 'asphalt_binder' && m.ab_binder_pg && <span>PG: {m.ab_binder_pg}</span>}
                    {m.material_type === 'plant_mix' && m.pm_binder_pg && <span>PG: {m.pm_binder_pg}</span>}
                    {m.source_name && <span>📍 {m.source_name}</span>}
                    {m.qty_total && <span>⚖️ {m.qty_total} {m.qty_unit}</span>}
                    {m.sampling_date && <span>📅 {m.sampling_date}</span>}
                    {m.photos?.length > 0 && <span>📷 {m.photos.length} photo{m.photos.length > 1 ? 's' : ''}</span>}
                  </div>
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button className="btn btn-sm" onClick={e => { e.stopPropagation(); setEditMaterial(m); setShowModal(true) }}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={e => { e.stopPropagation(); deleteMaterial(m.id) }}>Delete</button>
                  <span style={{ fontSize: 13, color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (() => {
                const isSoloMat = !TEAM_TYPES.includes(m.material_type)
                const soloSub = parseSoloSubfields(m.other_info)
                const soloSubEntries = Object.entries(soloSub).filter(([, v]) => v)
                const subDefs = SOLO_SUBFIELDS[m.material_type] || []
                return (
                <div style={{ borderTop: '1px solid var(--border)', padding: '16px 16px', background: 'var(--surface2)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: m.photos?.length ? 16 : 0 }}>
                    {isSoloMat ? <>
                      {/* Solo sub-fields */}
                      {soloSubEntries.length > 0 && soloSubEntries.map(([key, val]) => {
                        const def = subDefs.find(s => s.key === key)
                        const label = def?.label || key
                        if (key === 'sieve') {
                          const sieves = val.split(',').filter(Boolean)
                          return (
                            <div key={key} style={{ gridColumn: '1/-1' }}>
                              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{sieves.map(s => <span key={s} style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 99, padding: '2px 10px', fontSize: 12, fontWeight: 500 }}>{s}</span>)}</div>
                            </div>
                          )
                        }
                        return <div key={key}><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div><div style={{ fontWeight: 500 }}>{val}</div></div>
                      })}
                      {/* Source */}
                      {(m.source_name || m.source_type) && <div><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Supplier</div><div style={{ fontWeight: 500 }}>{m.source_name || '—'}</div>{m.source_type && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Ref: {m.source_type}</div>}</div>}
                      {/* Location */}
                      {m.source_location && <div><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Location</div><div style={{ fontWeight: 500 }}>{m.source_location}</div></div>}
                      {/* QTY */}
                      {m.qty_total && <div><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Quantity</div><div style={{ fontWeight: 500 }}>{m.qty_total} {m.qty_unit}{m.container_type ? ` · ${m.container_count || ''} ${m.container_type}` : ''}</div></div>}
                    </> : <>
                      {/* Team-specific details */}
                      {m.material_type === 'aggregate' && <>
                        <div><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Condition</div><div style={{ fontWeight: 500 }}>{m.agg_raw_or_rap || '—'}</div></div>
                        <div style={{ gridColumn: '1/-1' }}><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Sieve Sizes</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{(m.agg_sieve_sizes || []).map(s => <span key={s} style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 99, padding: '2px 10px', fontSize: 12, fontWeight: 500 }}>{s}</span>)}</div></div>
                      </>}
                      {m.material_type === 'asphalt_binder' && <>
                        <div><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>PG Grade</div><div style={{ fontWeight: 500 }}>{m.ab_binder_pg || '—'}</div></div>
                        <div><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Polymer</div><div style={{ fontWeight: 500 }}>{m.ab_has_polymer ? `Yes — ${m.ab_polymer_info || 'see details'}` : 'No'}</div></div>
                        {m.ab_mix_design && <div><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Mix Design</div><div style={{ fontWeight: 500 }}>{m.ab_mix_design}</div></div>}
                        {m.ab_other_additives && <div><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Other Additives</div><div style={{ fontWeight: 500 }}>{m.ab_other_additives}</div></div>}
                      </>}
                      {m.material_type === 'plant_mix' && <>
                        <div><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>PG Grade</div><div style={{ fontWeight: 500 }}>{m.pm_binder_pg || '—'}</div></div>
                        {m.pm_mix_design && <div><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Mix Design</div><div style={{ fontWeight: 500 }}>{m.pm_mix_design}</div></div>}
                      </>}
                      {/* Source */}
                      {m.source_name && <div><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Source</div><div style={{ fontWeight: 500 }}>{m.source_type && `${m.source_type} · `}{m.source_name}</div>{m.source_location && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{m.source_location}</div>}</div>}
                      {/* QTY */}
                      {m.qty_total && <div><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Quantity</div><div style={{ fontWeight: 500 }}>{m.qty_total} {m.qty_unit} · {m.container_count} {m.container_type}{m.container_color ? ` (${m.container_color})` : ''}</div></div>}
                      {/* Locations */}
                      {m.locations?.length > 0 && <div style={{ gridColumn: '1/-1' }}><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Locations</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{m.locations.map((l, i) => <span key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 99, padding: '4px 12px', fontSize: 12 }}>{l.location}{l.detail ? ` · ${l.detail}` : ''}</span>)}</div></div>}
                    </>}
                  </div>

                  {/* Photo strip */}
                  {m.photos?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Photos ({m.photos.length})</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {m.photos.map((url, i) => (
                          <img key={i} src={url} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => window.open(url, '_blank')} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
              })()}
            </div>
          )
        })
      )}

      {/* Modal */}
      {showModal && (
        <MaterialModal
          projectId={project.id}
          projectName={project.name}
          material={editMaterial}
          onClose={() => { setShowModal(false); setEditMaterial(null) }}
          onSaved={load}
        />
      )}
    </div>
  )
}
