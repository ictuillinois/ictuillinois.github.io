import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'

export default function FloorPlanEditor() {
  const { session, toast } = useAppStore()
  const orgId = session?.organizationId

  const [plans, setPlans]             = useState([])
  const [activePlanId, setActivePlanId] = useState(null)
  const [planName, setPlanName]       = useState('')
  const [imageUrl, setImageUrl]       = useState('')
  const [zones, setZones]             = useState([])
  const [saving, setSaving]           = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [analyzing, setAnalyzing]     = useState(false)

  // Drawing state
  const [drawStart, setDrawStart]     = useState(null)
  const [draft, setDraft]             = useState(null)
  const [pendingZone, setPendingZone] = useState(null)
  const [pendingLabel, setPendingLabel] = useState('')

  const containerRef = useRef()

  useEffect(() => { loadPlans() }, [])

  async function loadPlans() {
    const { data } = await sb.from('floor_plans').select('*').eq('organization_id', orgId).order('created_at')
    setPlans(data || [])
    if (data?.length > 0 && !activePlanId) openPlan(data[0])
  }

  function openPlan(plan) {
    setActivePlanId(plan.id)
    setPlanName(plan.name || '')
    setImageUrl(plan.image_url || '')
    setZones(plan.zones || [])
    setDraft(null)
    setPendingZone(null)
    setPendingLabel('')
  }

  function newPlan() {
    setActivePlanId(null)
    setPlanName('')
    setImageUrl('')
    setZones([])
    setDraft(null)
    setPendingZone(null)
    setPendingLabel('')
  }

  const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
  const MAX_FLOOR_PLAN_SIZE = 10 * 1024 * 1024

  async function uploadImage(file) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      toast('Only PNG, JPEG, and WebP images are allowed.')
      return
    }
    if (file.size > MAX_FLOOR_PLAN_SIZE) {
      toast('Image must be under 10 MB.')
      return
    }
    setUploading(true)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
          const MAX_DIM = 2400
          const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(img.width * scale)
          canvas.height = Math.round(img.height * scale)
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
          URL.revokeObjectURL(url)
          resolve(canvas.toDataURL('image/jpeg', 0.82))
        }
        img.onerror = reject
        img.src = url
      })
      setImageUrl(dataUrl)
    } catch (e) {
      toast('Upload failed: ' + (e.message || 'Could not read image'))
    }
    setUploading(false)
  }

  async function autoDetectZones() {
    setAnalyzing(true)
    try {
      const { data: setting } = await sb.from('settings').select('value').eq('key', 'anthropic_api_key').maybeSingle()
      if (!setting?.value) { toast('AI key not configured in settings.'); setAnalyzing(false); return }

      const base64 = imageUrl.replace(/^data:image\/[a-z+]+;base64,/, '')

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': setting.value,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
              { type: 'text', text: `Analyze this floor plan image. Identify every distinct room, corridor, lab area, storage area, office, bathroom, and zone visible.

For each zone return a bounding box as percentage of the full image where (0,0) is the top-left and (100,100) is the bottom-right.

Respond ONLY with a valid JSON array, no markdown, no explanation:
[{"label":"Room Name","x":10,"y":20,"w":30,"h":25},...]

Rules:
- Keep labels short (1-4 words)
- Cover the entire floor plan — do not skip any area
- Boxes should be tight around each room, not overlapping` },
            ],
          }],
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message || `API error ${res.status}`)
      }

      const result = await res.json()
      const text = result.content?.[0]?.text || ''
      const match = text.match(/\[[\s\S]*\]/)
      if (!match) throw new Error('Could not parse AI response')

      const detected = JSON.parse(match[0])
      const newZones = detected.map(z => ({
        id: `zone_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        label: String(z.label || 'Zone'),
        x: Math.max(0, Math.min(95, Number(z.x) || 0)),
        y: Math.max(0, Math.min(95, Number(z.y) || 0)),
        w: Math.max(3, Math.min(100, Number(z.w) || 10)),
        h: Math.max(3, Math.min(100, Number(z.h) || 10)),
      }))

      setZones(newZones)
      toast(`✨ ${newZones.length} zones detected — review and adjust labels as needed.`)
    } catch (e) {
      toast('AI analysis failed: ' + (e.message || 'Unknown error'))
    }
    setAnalyzing(false)
  }

  // ── Drag / resize refs ────────────────────────────────────────
  const dragRef = useRef(null)
  const [editingZoneId, setEditingZoneId] = useState(null)
  const [editingLabel, setEditingLabel]   = useState('')

  function getRel(clientX, clientY) {
    const rect = containerRef.current.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    }
  }

  // global mousemove / mouseup to handle dragging outside the canvas
  useEffect(() => {
    function move(e) {
      const d = dragRef.current
      if (!d || !containerRef.current) return
      const { x: cx, y: cy } = getRel(e.clientX, e.clientY)
      const dx = cx - d.startX, dy = cy - d.startY
      setZones(prev => prev.map(z => {
        if (z.id !== d.zoneId) return z
        if (d.type === 'move') {
          return { ...z, x: Math.max(0, Math.min(100 - z.w, d.origX + dx)), y: Math.max(0, Math.min(100 - z.h, d.origY + dy)) }
        }
        // resize
        const o = d.orig
        let { x, y, w, h } = o
        if (d.handle === 'se') { w = Math.max(3, o.w + dx); h = Math.max(3, o.h + dy) }
        else if (d.handle === 'sw') { x = Math.min(o.x + o.w - 3, o.x + dx); w = Math.max(3, o.w - dx); h = Math.max(3, o.h + dy) }
        else if (d.handle === 'ne') { y = Math.min(o.y + o.h - 3, o.y + dy); w = Math.max(3, o.w + dx); h = Math.max(3, o.h - dy) }
        else if (d.handle === 'nw') { x = Math.min(o.x + o.w - 3, o.x + dx); y = Math.min(o.y + o.h - 3, o.y + dy); w = Math.max(3, o.w - dx); h = Math.max(3, o.h - dy) }
        return { ...z, x: Math.max(0, x), y: Math.max(0, y), w: Math.min(100 - Math.max(0, x), w), h: Math.min(100 - Math.max(0, y), h) }
      }))
    }
    function up() { dragRef.current = null }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [])

  // ── Zone drawing (on empty canvas) ───────────────────────────
  function onMouseDown(e) {
    if (pendingZone) return
    e.preventDefault()
    const pos = getRel(e.clientX, e.clientY)
    setDrawStart(pos)
    setDraft({ x: pos.x, y: pos.y, w: 0, h: 0 })
  }

  function onMouseMove(e) {
    if (!drawStart) return
    const pos = getRel(e.clientX, e.clientY)
    setDraft({ x: Math.min(drawStart.x, pos.x), y: Math.min(drawStart.y, pos.y), w: Math.abs(pos.x - drawStart.x), h: Math.abs(pos.y - drawStart.y) })
  }

  function onMouseUp(e) {
    if (!drawStart) return
    const pos = getRel(e.clientX, e.clientY)
    const rect = { x: Math.min(drawStart.x, pos.x), y: Math.min(drawStart.y, pos.y), w: Math.abs(pos.x - drawStart.x), h: Math.abs(pos.y - drawStart.y) }
    setDrawStart(null); setDraft(null)
    if (rect.w < 2 || rect.h < 2) return
    setPendingZone(rect); setPendingLabel('')
  }

  function confirmZone() {
    if (!pendingLabel.trim()) return
    setZones(z => [...z, { id: `zone_${Date.now()}`, label: pendingLabel.trim(), ...pendingZone }])
    setPendingZone(null); setPendingLabel('')
  }

  function cancelPending() { setPendingZone(null); setPendingLabel('') }
  function deleteZone(id) { setZones(z => z.filter(z2 => z2.id !== id)) }

  function startMove(e, zone) {
    e.stopPropagation(); e.preventDefault()
    if (pendingZone) return
    const { x: sx, y: sy } = getRel(e.clientX, e.clientY)
    dragRef.current = { type: 'move', zoneId: zone.id, startX: sx, startY: sy, origX: zone.x, origY: zone.y }
  }

  function startResize(e, zone, handle) {
    e.stopPropagation(); e.preventDefault()
    const { x: sx, y: sy } = getRel(e.clientX, e.clientY)
    dragRef.current = { type: 'resize', zoneId: zone.id, handle, startX: sx, startY: sy, orig: { ...zone } }
  }

  function startEditLabel(e, zone) {
    e.stopPropagation()
    setEditingZoneId(zone.id); setEditingLabel(zone.label)
  }

  function commitLabel(id) {
    if (editingLabel.trim()) setZones(z => z.map(z2 => z2.id === id ? { ...z2, label: editingLabel.trim() } : z2))
    setEditingZoneId(null)
  }

  // ── Save ──────────────────────────────────────────────────────
  async function save() {
    if (!planName.trim()) { toast('Enter a name for this floor plan.'); return }
    if (!imageUrl) { toast('Upload a floor plan image first.'); return }
    setSaving(true)
    try {
      const payload = {
        organization_id: orgId,
        name: planName.trim(),
        image_url: imageUrl,
        zones,
        updated_at: new Date().toISOString(),
      }
      if (activePlanId) {
        await sb.from('floor_plans').update(payload).eq('id', activePlanId)
      } else {
        const { data, error } = await sb.from('floor_plans').insert(payload).select().single()
        if (error) throw new Error(error.message)
        setActivePlanId(data.id)
      }
      toast('Floor plan saved.')
      loadPlans()
    } catch (e) {
      toast('Save failed: ' + e.message)
    }
    setSaving(false)
  }

  async function deletePlan() {
    if (!activePlanId) return
    if (!window.confirm('Delete this floor plan? This cannot be undone.')) return
    await sb.from('floor_plans').delete().eq('id', activePlanId)
    newPlan()
    loadPlans()
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Floor Plans</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 20 }}>
        Upload your building floor plan image, then <strong>click and drag</strong> to draw named zones. Users will tap a zone to assign their material storage location.
      </div>

      {/* Plan selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {plans.map(p => (
          <button key={p.id} onClick={() => openPlan(p)}
            style={{ padding: '6px 16px', borderRadius: 99, border: `1.5px solid ${activePlanId === p.id ? 'var(--accent)' : 'var(--border)'}`, background: activePlanId === p.id ? 'var(--accent-light)' : 'var(--surface)', color: activePlanId === p.id ? 'var(--accent)' : 'var(--text2)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            {p.name}
          </button>
        ))}
        <button onClick={newPlan}
          style={{ padding: '6px 16px', borderRadius: 99, border: '1.5px dashed var(--border)', background: 'var(--surface)', color: 'var(--text3)', fontSize: 13, cursor: 'pointer' }}>
          + New floor
        </button>
      </div>

      {/* Plan name */}
      <div className="field" style={{ maxWidth: 340 }}>
        <label>Floor plan name *</label>
        <input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="e.g. Building A · Floor 1" />
      </div>

      {/* Image upload */}
      <div className="field">
        <label>Floor plan image (PNG or JPG) *</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 13, background: 'var(--surface2)', fontWeight: 500 }}>
            {uploading ? '⏳ Processing…' : imageUrl ? '🔄 Replace image' : '📤 Upload image'}
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
              onChange={e => e.target.files[0] && uploadImage(e.target.files[0])} disabled={uploading} />
          </label>
          {imageUrl && (
            <button onClick={autoDetectZones} disabled={analyzing}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: analyzing ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #534AB7, #534AB7)', color: '#fff', opacity: analyzing ? 0.7 : 1 }}>
              {analyzing ? '🔍 Analyzing…' : '✨ Auto-detect zones'}
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
          Upload your floor plan then click <strong>✨ Auto-detect zones</strong> — AI will identify rooms automatically. You can adjust, rename, or add zones manually after.
        </div>
      </div>

      {/* Editor canvas */}
      {imageUrl ? (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
            🖱️ <strong>Drag</strong> a zone to move it · <strong>Corner handles</strong> to resize · <strong>Double-click</strong> label to rename · Drag on empty area to draw new zone
            {pendingZone && <span style={{ color: 'var(--accent)', fontWeight: 500, marginLeft: 8 }}>Name the zone below and click Add</span>}
          </div>

          <div
            ref={containerRef}
            style={{
              position: 'relative', display: 'block',
              userSelect: 'none',
              cursor: pendingZone ? 'default' : 'crosshair',
              border: '2px solid var(--border)', borderRadius: 10,
              overflow: 'hidden', background: '#000',
              maxWidth: '100%',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
          >
            <img src={imageUrl} alt="Floor plan" draggable={false}
              style={{ display: 'block', width: '100%', pointerEvents: 'none' }} />

            {/* Existing zones — drag to move, corner handles to resize, double-click to rename */}
            {zones.map(zone => (
              <div key={zone.id}
                onMouseDown={e => startMove(e, zone)}
                onDoubleClick={e => startEditLabel(e, zone)}
                style={{
                  position: 'absolute',
                  left: `${zone.x}%`, top: `${zone.y}%`,
                  width: `${zone.w}%`, height: `${zone.h}%`,
                  border: '2px solid var(--accent)',
                  background: 'rgba(83,74,183,0.18)',
                  borderRadius: 4, boxSizing: 'border-box',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'move', minWidth: 40, minHeight: 24,
                }}>
                {/* Label / inline edit */}
                {editingZoneId === zone.id ? (
                  <input autoFocus value={editingLabel}
                    onChange={e => setEditingLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitLabel(zone.id) }}
                    onBlur={() => commitLabel(zone.id)}
                    onClick={e => e.stopPropagation()}
                    onMouseDown={e => e.stopPropagation()}
                    style={{ width: '80%', padding: '2px 6px', fontSize: 11, fontWeight: 700, border: '1.5px solid var(--accent)', borderRadius: 4, textAlign: 'center', background: '#fff' }}
                  />
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'rgba(255,255,255,0.9)', padding: '1px 6px', borderRadius: 4, maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                    {zone.label}
                  </span>
                )}
                {/* Delete */}
                <button onClick={e => { e.stopPropagation(); deleteZone(zone.id) }} onMouseDown={e => e.stopPropagation()}
                  style={{ position: 'absolute', top: -9, right: -9, width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#e24b4a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
                  ×
                </button>
                {/* Resize handles — 4 corners */}
                {[['nw','top-left','nw-resize'],['ne','top-right','ne-resize'],['sw','bottom-left','sw-resize'],['se','bottom-right','se-resize']].map(([handle, corner, cur]) => {
                  const [v, h] = corner.split('-')
                  return (
                    <div key={handle} onMouseDown={e => startResize(e, zone, handle)}
                      style={{ position: 'absolute', [v]: -5, [h]: -5, width: 10, height: 10, background: '#fff', border: '2px solid var(--accent)', borderRadius: 2, cursor: cur, zIndex: 2 }} />
                  )
                })}
              </div>
            ))}

            {/* Live drawing preview */}
            {draft && draft.w > 1 && draft.h > 1 && (
              <div style={{
                position: 'absolute',
                left: `${draft.x}%`, top: `${draft.y}%`,
                width: `${draft.w}%`, height: `${draft.h}%`,
                border: '2px dashed var(--accent)',
                background: 'rgba(83,74,183,0.08)',
                pointerEvents: 'none', boxSizing: 'border-box',
              }} />
            )}

            {/* Pending zone: name input overlay */}
            {pendingZone && (
              <div style={{
                position: 'absolute',
                left: `${pendingZone.x}%`, top: `${pendingZone.y}%`,
                width: `${pendingZone.w}%`, height: `${pendingZone.h}%`,
                border: '2px solid var(--accent2)',
                background: 'rgba(83,74,183,0.12)',
                borderRadius: 4, boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 6,
                minWidth: 120, minHeight: 60,
              }}>
                <input
                  autoFocus
                  value={pendingLabel}
                  onChange={e => setPendingLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmZone(); if (e.key === 'Escape') cancelPending() }}
                  placeholder="Zone name…"
                  onClick={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                  style={{ width: '80%', maxWidth: 160, padding: '4px 8px', border: '1.5px solid var(--accent)', borderRadius: 6, fontSize: 12, textAlign: 'center', background: '#fff' }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); confirmZone() }}
                    style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    Add
                  </button>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); cancelPending() }}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', fontSize: 11, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13, background: 'var(--surface2)', borderRadius: 10, marginBottom: 20, border: '2px dashed var(--border)' }}>
          Upload a floor plan image above to start drawing zones
        </div>
      )}

      {/* Zone chips summary */}
      {zones.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            {zones.length} zone{zones.length !== 1 ? 's' : ''} defined
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {zones.map(zone => (
              <span key={zone.id} style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 99, padding: '4px 12px 4px 14px', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                📍 {zone.label}
                <button onClick={() => deleteZone(zone.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || uploading}>
          {saving ? 'Saving…' : activePlanId ? 'Save changes' : 'Create floor plan'}
        </button>
        {activePlanId && (
          <button className="btn" onClick={deletePlan} style={{ color: '#e24b4a', borderColor: '#e24b4a' }}>
            Delete floor plan
          </button>
        )}
        {zones.length === 0 && imageUrl && (
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Draw at least one zone before saving</span>
        )}
      </div>
    </div>
  )
}
