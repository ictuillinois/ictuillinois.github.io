import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import Modal from '../../components/Modal'
import { ALL_MODULES_META } from '../../components/DashboardIconPicker'
import { PasswordStrengthHint } from '../../components/PasswordStrengthHint'
import FloorPlanEditor from '../../components/FloorPlanEditor'
import { queueWelcomeEmail } from '../../lib/welcomeEmail'

async function createAuthUser(email, password) {
  const emailLC = email.trim().toLowerCase()
  const { data: { session: prev } } = await sb.auth.getSession()
  const { data, error } = await sb.auth.signUp({ email: emailLC, password })
  if (prev) await sb.auth.setSession({ access_token: prev.access_token, refresh_token: prev.refresh_token })
  if (error) {
    if (error.message?.toLowerCase().includes('already registered') || error.message?.toLowerCase().includes('already been registered')) {
      // Block reuse if an active DB row still exists
      const { data: activeUser } = await sb.from('users').select('id').ilike('email', emailLC).eq('is_active', true).maybeSingle()
      if (activeUser) throw new Error('This email is already in use by an active account.')
      // Orphaned auth user — delete it then retry signUp so the new password is correct
      const { data: orphanId } = await sb.rpc('get_auth_user_id_by_email', { p_email: emailLC })
      if (orphanId) try { await sb.rpc('delete_auth_user', { p_auth_id: orphanId }) } catch (_) {}
      const { data: retryData, error: retryError } = await sb.auth.signUp({ email: emailLC, password })
      if (prev) await sb.auth.setSession({ access_token: prev.access_token, refresh_token: prev.refresh_token })
      if (retryError) throw retryError
      await sb.rpc('confirm_auth_user_email', { p_email: emailLC })
      return retryData.user
    }
    throw error
  }
  await sb.rpc('confirm_auth_user_email', { p_email: emailLC })
  return data.user
}

function generateTempPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%'
  const all = upper + lower + digits + symbols
  const arr = [
    upper[Math.floor(Math.random() * upper.length)],
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
    ...Array.from({ length: 4 }, () => all[Math.floor(Math.random() * all.length)]),
  ]
  return arr.sort(() => Math.random() - 0.5).join('')
}

const MODULE_IMAGE_DEFS = [
  { key: 'supply',         label: 'Supply Inventory',    icon: '📦' },
  { key: 'projects',       label: 'Project Workspace',  icon: '🧪' },
  { key: 'training',       label: 'Training Records',    icon: '🎓' },
  { key: 'equipment',      label: 'Equipment List', icon: '🔧' },
  { key: 'equipmenthub',   label: 'Equipment',           icon: '📚' },
  { key: 'booking',        label: 'Reserve Equipment',   icon: '📅' },
  { key: 'remessages',     label: 'RE Messages',         icon: '💬' },
  { key: 'pm',             label: 'Task Board',  icon: '📋' },
  { key: 'mileage',        label: 'Mileage Form',        icon: '🚗' },
  { key: 'labsafety',      label: 'Lab Safety',          icon: '🦺' },
  { key: 'labmanagement',  label: 'Lab Management',      icon: '🏛️' },
]

// Images are stored per-org in organizations.module_images (JSONB)
function ModuleImagesPanel({ orgId }) {
  const { toast } = useAppStore()
  const [images, setImages] = useState({})
  const [uploading, setUploading] = useState(null)
  const fileRefs = useRef({})

  useEffect(() => { if (orgId) loadImages() }, [orgId])

  async function loadImages() {
    const { data } = await sb.from('organizations').select('module_images').eq('id', orgId).maybeSingle()
    setImages(data?.module_images || {})
  }

  async function handleUpload(def, file) {
    if (!file) return
    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
    if (!isSvg && !file.type.startsWith('image/')) { toast('Please select an image or SVG file.'); return }
    setUploading(def.key)
    try {
      const W = 800, H = 500
      const canvas = document.createElement('canvas')
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#111'
      ctx.fillRect(0, 0, W, H)
      await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('File read failed'))
        reader.onload = e => {
          const img = new Image()
          img.onerror = () => reject(new Error('Image render failed'))
          img.onload = () => {
            const iw = img.naturalWidth || W, ih = img.naturalHeight || H
            const scale = Math.max(W / iw, H / ih)
            const sw = iw * scale, sh = ih * scale
            ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh)
            resolve()
          }
          img.src = isSvg
            ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(e.target.result)
            : e.target.result
        }
        isSvg ? reader.readAsText(file) : reader.readAsDataURL(file)
      })
      const compressed = await new Promise((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas export failed')), 'image/jpeg', 0.85)
      )
      const path = `module-images/${orgId}/${def.key}-${Date.now()}.jpg`
      const { error: upErr } = await sb.storage.from('project-files').upload(path, compressed, { contentType: 'image/jpeg' })
      if (upErr) throw new Error('Storage: ' + upErr.message)
      const { data: urlData } = sb.storage.from('project-files').getPublicUrl(path)
      const url = urlData.publicUrl
      const { data: orgData } = await sb.from('organizations').select('module_images').eq('id', orgId).maybeSingle()
      const current = orgData?.module_images || {}
      const { data: updated, error: saveErr } = await sb.from('organizations').update({ module_images: { ...current, [def.key]: url } }).eq('id', orgId).select()
      if (saveErr) throw new Error('Save: ' + saveErr.message)
      if (!updated?.length) throw new Error('Save failed: org not found (orgId: ' + orgId + ')')
      setImages(prev => ({ ...prev, [def.key]: url }))
      toast(`${def.label} image saved ✓`)
    } catch (e) {
      toast('Upload failed: ' + (e?.message || String(e)))
    } finally {
      setUploading(null)
      if (fileRefs.current[def.key]) fileRefs.current[def.key].value = ''
    }
  }

  async function clearImage(def) {
    const { data: orgData } = await sb.from('organizations').select('module_images').eq('id', orgId).maybeSingle()
    const current = { ...(orgData?.module_images || {}) }
    delete current[def.key]
    await sb.from('organizations').update({ module_images: Object.keys(current).length ? current : null }).eq('id', orgId)
    setImages(prev => { const n = { ...prev }; delete n[def.key]; return n })
    toast(`${def.label} image removed.`)
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.6 }}>
        Upload background images for your organization's dashboard module cards. Best size: landscape, around 800×500 px.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
        {MODULE_IMAGE_DEFS.map(def => {
          const currentUrl = images[def.key]
          const isUploading = uploading === def.key
          return (
            <div key={def.key} style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--surface)' }}>
              <div style={{ height: 118, position: 'relative', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {currentUrl
                  ? <img src={currentUrl} alt={def.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.target.style.display = 'none' }} />
                  : <div style={{ fontSize: 34, opacity: 0.35 }}>{def.icon}</div>
                }
                {currentUrl && (
                  <button onClick={() => clearImage(def)}
                    style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', borderRadius: 6, fontSize: 11, padding: '4px 8px', cursor: 'pointer', fontWeight: 500 }}>
                    ✕ Remove
                  </button>
                )}
                {isUploading && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="spinner" />
                  </div>
                )}
              </div>
              <div style={{ padding: '10px 12px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.label}</div>
                  <button className="btn btn-sm btn-primary" disabled={isUploading} onClick={() => fileRefs.current[def.key]?.click()}>
                    {currentUrl ? 'Replace' : 'Upload'}
                  </button>
                  <input type="file" ref={el => fileRefs.current[def.key] = el} style={{ display: 'none' }}
                    onChange={e => { handleUpload(def, e.target.files[0]) }} />
                </div>
                {currentUrl && (
                  <a href={currentUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all', lineHeight: 1.4 }}>
                    Test image URL ↗
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Super admin: session.userId === null (logged in via /admin password)
// Org admin:   session.userId !== null && session.role === 'admin'

// ── Org Settings panel (org admin only) ──────────────────────
function OrgSettingsPanel({ session }) {
  const { toast } = useAppStore()
  const [form, setForm] = useState({ contact_name: '', contact_email: '' })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.organizationId) { setLoading(false); return }
    sb.from('organizations').select('contact_name, contact_email').eq('id', session.organizationId).maybeSingle()
      .then(({ data }) => {
        if (data) setForm({ contact_name: data.contact_name || '', contact_email: data.contact_email || '' })
        setLoading(false)
      })
  }, [session?.organizationId])

  async function save() {
    if (!session?.organizationId) return
    if (!form.contact_email.trim()) { toast('Contact email is required.'); return }
    setSaving(true)
    const { error } = await sb.from('organizations').update({
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim().toLowerCase(),
    }).eq('id', session.organizationId)
    if (error) { toast('Error saving: ' + error.message); setSaving(false); return }
    toast('Organization contact info saved ✓')
    setSaving(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🏢 Organization Contact Info</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 20 }}>
        This contact name and email appear on the login page when a lab member asks for help signing in.
      </div>
      <div className="field">
        <label>Contact person's name</label>
        <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="e.g. Dr. Smith" />
      </div>
      <div className="field">
        <label>Contact email address *</label>
        <input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="admin@yourlab.edu" />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Shown on the login page and used as the reply-to address in notification emails.</div>
      </div>
      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save contact info'}
      </button>
    </div>
  )
}

// ── Org-level student default icons (set by org admin, pre-loaded in UserModal) ──
function StudentDefaultIconsPanel({ orgId }) {
  const { toast } = useAppStore()
  const [selected, setSelected] = useState(null) // null = loading
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!orgId) return
    sb.from('organizations').select('student_default_modules').eq('id', orgId).maybeSingle()
      .then(({ data }) => {
        const mods = data?.student_default_modules?.length
          ? data.student_default_modules
          : ['projects', 'training', 'booking', 'equipmenthub', 'remessages']
        setSelected(new Set(mods))
      })
  }, [orgId])

  function toggle(key) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function save() {
    setSaving(true)
    const modules = STUDENT_ICON_OPTIONS.filter(m => selected.has(m.key)).map(m => m.key)
    const { error } = await sb.from('organizations').update({ student_default_modules: modules }).eq('id', orgId)
    if (error) toast('Save failed: ' + error.message)
    else toast('Default icons saved ✓ — new lab users will start with these icons.')
    setSaving(false)
  }

  if (!selected) return null

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>🎛 Default icons for new lab users</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
        These icons are pre-selected when a lab manager creates a new lab user. Profile is always included.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, border: '1.5px solid #1D9E75', background: '#E1F5EE', fontSize: 12, fontWeight: 500, color: '#0F6E56', cursor: 'default' }}>
          <span>👤</span><span>Profile</span><span style={{ fontSize: 10, opacity: 0.6 }}>🔒</span>
        </div>
        {STUDENT_ICON_OPTIONS.map(m => {
          const on = selected.has(m.key)
          return (
            <button key={m.key} type="button" onClick={() => toggle(m.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${on ? '#1D9E75' : 'var(--border)'}`, background: on ? '#E1F5EE' : 'var(--surface)', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: on ? '#0F6E56' : 'var(--text2)', transition: 'all 0.12s' }}>
              <span>{m.icon}</span><span>{m.label}</span>{on && <span style={{ fontSize: 10, fontWeight: 700 }}>✓</span>}
            </button>
          )
        })}
      </div>
      <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save defaults'}
      </button>
    </div>
  )
}

// ── Per-pool editor with drag-to-reorder (used by OrgIconPoolsPanel) ──
function OrgPoolEditor({ orgId, poolKey, label }) {
  const { toast } = useAppStore()
  const [poolModules, setPoolModules] = useState(null)
  const [selected, setSelected] = useState(null)
  const [order, setOrder] = useState(null)
  const [dragKey, setDragKey] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const dragRef = useRef(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [orgId, poolKey])

  async function load() {
    const [orgRes, appRes] = await Promise.all([
      sb.from('organizations').select(`allowed_modules, ${poolKey}`).eq('id', orgId).maybeSingle(),
      sb.from('settings').select('value').eq('key', 'app_allowed_modules').maybeSingle(),
    ])
    let appPool = null
    try { appPool = appRes?.data?.value ? JSON.parse(appRes.data.value) : null } catch {}
    const outerKeys = orgRes?.data?.allowed_modules ?? appPool
    const mods = outerKeys
      ? ALL_MODULES_META.filter(m => outerKeys.includes(m.key) && !m.staffOnly && !m.adminOnly && m.key !== 'profile')
      : ALL_MODULES_META.filter(m => !m.staffOnly && !m.adminOnly && !m.soloLocked && m.key !== 'profile')
    setPoolModules(mods)
    const allKeys = mods.map(m => m.key)
    const saved = orgRes?.data?.[poolKey]
    const selKeys = saved?.length ? saved.filter(k => allKeys.includes(k)) : allKeys
    setSelected(new Set(selKeys))
    const savedFiltered = saved?.filter(k => allKeys.includes(k))
    setOrder(savedFiltered?.length
      ? [...savedFiltered, ...allKeys.filter(k => !savedFiltered.includes(k))]
      : allKeys)
  }

  function toggle(key) {
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  async function save() {
    if (saving || !poolModules) return
    setSaving(true)
    const allKeys = poolModules.map(m => m.key)
    const toSave = (order || allKeys).filter(k => selected.has(k))
    const { error } = await sb.from('organizations').update({ [poolKey]: toSave }).eq('id', orgId)
    if (error) toast('Error saving: ' + error.message)
    else toast(`${label} icon pool saved ✓`)
    setSaving(false)
  }

  if (!poolModules || !selected || !order) return (
    <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  )

  const dispModules = order.map(k => poolModules.find(m => m.key === k)).filter(Boolean)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{selected.size}</span> of {poolModules.length} selected
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setSelected(new Set(poolModules.map(m => m.key)))} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600 }}>Select all</button>
          <span style={{ color: 'var(--border)' }}>·</span>
          <button onClick={() => setSelected(new Set())} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontWeight: 500 }}>Clear</button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>💡 Drag cards to set the default icon order for this group</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 10, marginBottom: 20 }}>
        {dispModules.map(m => {
          const sel = selected.has(m.key)
          const isDragging = dragKey === m.key
          const isOver = dragOver === m.key && dragKey !== m.key
          return (
            <div key={m.key}
              draggable
              onDragStart={e => { dragRef.current = m.key; e.dataTransfer.effectAllowed = 'move'; setDragKey(m.key) }}
              onDragOver={e => { e.preventDefault(); setDragOver(m.key) }}
              onDrop={e => {
                e.preventDefault()
                const src = dragRef.current
                if (!src || src === m.key) { setDragKey(null); setDragOver(null); return }
                setOrder(ord => {
                  const from = ord.indexOf(src); const to = ord.indexOf(m.key)
                  if (from === -1 || to === -1) return ord
                  const next = [...ord]; next.splice(from, 1); next.splice(to, 0, src); return next
                })
                dragRef.current = null; setDragKey(null); setDragOver(null)
              }}
              onDragEnd={() => { dragRef.current = null; setDragKey(null); setDragOver(null) }}
              onClick={() => toggle(m.key)}
              style={{ borderRadius: 12, border: sel ? `2px solid ${m.color}` : `2px solid ${isOver ? 'var(--accent)' : 'var(--border)'}`, background: sel ? `${m.color}12` : isOver ? '#E1F5EE' : 'var(--surface)', padding: '12px 12px 10px', cursor: 'grab', position: 'relative', transition: 'all 0.15s', opacity: isDragging ? 0.35 : 1, userSelect: 'none' }}>
              <div style={{ position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: '50%', background: sel ? m.color : 'var(--surface2)', border: `2px solid ${sel ? m.color : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                {sel && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
              <div style={{ fontSize: 24, marginBottom: 6, pointerEvents: 'none' }}>{m.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: sel ? m.color : 'var(--text)', marginBottom: 2, paddingRight: 20, pointerEvents: 'none' }}>{m.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.4, pointerEvents: 'none' }}>{m.sub}</div>
            </div>
          )
        })}
      </div>
      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : `Save ${label.toLowerCase()} icon pool`}
      </button>
    </div>
  )
}

function OrgIconPoolsPanel({ orgId }) {
  const [subTab, setSubTab] = useState('labusers')
  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🎛️ Organization Icon Pools</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          Define which icons are available to lab users and lab managers in your organization. Available icons are within those granted by the system administrator. Drag cards to set the default display order.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button onClick={() => setSubTab('labusers')} style={{ padding: '6px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: subTab === 'labusers' ? 'var(--accent)' : 'var(--surface2)', color: subTab === 'labusers' ? '#fff' : 'var(--text2)' }}>👥 Lab User Icons</button>
        <button onClick={() => setSubTab('labmanagers')} style={{ padding: '6px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: subTab === 'labmanagers' ? 'var(--accent)' : 'var(--surface2)', color: subTab === 'labmanagers' ? '#fff' : 'var(--text2)' }}>👨‍💼 Lab Manager Icons</button>
      </div>
      {subTab === 'labusers' && <OrgPoolEditor key="labusers" orgId={orgId} poolKey="allowed_modules_labusers" label="Lab user" />}
      {subTab === 'labmanagers' && <OrgPoolEditor key="labmanagers" orgId={orgId} poolKey="allowed_modules_labmanagers" label="Lab manager" />}
    </div>
  )
}

const STUDENT_ICON_OPTIONS = [
  { key: 'projects',     label: 'Project Workspace',   icon: '🧪' },
  { key: 'training',     label: 'Training Records',      icon: '🎓' },
  { key: 'equipmenthub', label: 'Equipment',             icon: '📚' },
  { key: 'booking',      label: 'Reserve Equipment',     icon: '📅' },
  { key: 'barcode',      label: 'QR Scan',               icon: '📷' },
  { key: 'remessages',   label: 'Lab Messages',   icon: '💬' },
  { key: 'mileage',      label: 'Mileage Form',          icon: '🚗' },
  { key: 'labsafety',    label: 'Lab Safety',            icon: '🦺' },
]

// ── User modal ────────────────────────────────────────────────
function UserModal({ user, orgs, defaultOrgId, isSuperAdmin, defaultRole, onClose, onSaved }) {
  const { toast } = useAppStore()
  const [name, setName]         = useState(user?.name || '')
  const [email, setEmail]       = useState(user?.email || '')
  const [password, setPassword] = useState('')
  const [role, setRole]         = useState(user?.role || defaultRole || 'user')
  const [orgId, setOrgId]       = useState(user?.organization_id || defaultOrgId || '')
  const [copied, setCopied]     = useState(false)
  const [savedCreds, setSavedCreds] = useState(null)
  // profile is always locked on; start empty otherwise (loaded from org defaults or existing prefs)
  const [selectedIcons, setSelectedIcons] = useState(new Set(['profile']))

  const effectiveOrgId = orgId || defaultOrgId

  // Load icons: org defaults for new student, existing prefs for edit
  useEffect(() => {
    if (user?.id && user?.role === 'lab_user') {
      sb.from('user_dashboard_prefs').select('active_modules').eq('user_id', user.id).maybeSingle()
        .then(({ data }) => {
          const mods = data?.active_modules?.length ? data.active_modules : []
          setSelectedIcons(new Set([...mods, 'profile']))
        })
    } else if (!user && role === 'lab_user' && effectiveOrgId) {
      sb.from('organizations').select('student_default_modules').eq('id', effectiveOrgId).maybeSingle()
        .then(({ data }) => {
          const defaults = data?.student_default_modules?.length
            ? data.student_default_modules
            : ['projects', 'training', 'booking', 'equipmenthub', 'remessages']
          setSelectedIcons(new Set([...defaults, 'profile']))
        })
    } else if (!user && role === 'lab_user') {
      setSelectedIcons(new Set(['projects', 'training', 'booking', 'equipmenthub', 'remessages', 'profile']))
    }
  }, [user?.id, user?.role, role, effectiveOrgId])

  function toggleIcon(key) {
    if (key === 'profile') return // always locked
    setSelectedIcons(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      next.add('profile')
      return next
    })
  }

  async function saveIconPrefs(userId) {
    const modules = ['profile', ...STUDENT_ICON_OPTIONS.filter(m => selectedIcons.has(m.key)).map(m => m.key)]
    const { data: existing } = await sb.from('user_dashboard_prefs').select('id').eq('user_id', userId).maybeSingle()
    if (existing) {
      await sb.from('user_dashboard_prefs').update({ active_modules: modules, has_set_dashboard: true }).eq('user_id', userId)
    } else {
      await sb.from('user_dashboard_prefs').insert({ user_id: userId, active_modules: modules, has_set_dashboard: true })
    }
  }

  async function save() {
    if (!name.trim())    { toast('Please enter a name.'); return }
    if (!orgId)          { toast('Please select an organization.'); return }
    if (!user && !email.trim()) { toast('Please enter an email address.'); return }
    if (password) {
      if (password.length < 8)        { toast('Password must be at least 8 characters.'); return }
      if (!/[A-Z]/.test(password))    { toast('Password must contain an uppercase letter.'); return }
      if (!/[a-z]/.test(password))    { toast('Password must contain a lowercase letter.'); return }
      if (!/[^A-Za-z0-9]/.test(password)) { toast('Password must contain a symbol (e.g. !@#$%).'); return }
    }

    if (user) {
      const upd = { name: name.trim(), email: email.trim().toLowerCase() || null, role, organization_id: orgId, is_active: true }
      if (password) upd.must_change_password = true
      const { error } = await sb.from('users').update(upd).eq('id', user.id)
      if (error) { toast('Error updating user: ' + error.message); return }
      if (role === 'lab_user') await saveIconPrefs(user.id)
      if (password) toast('User updated. Password will be required to change on next login.')
      else toast('User updated.')
      onSaved(); onClose()
    } else {
      const emailLC = email.trim().toLowerCase()
      const tempPassword = generateTempPassword()
      let auth_id = null
      try {
        const authUser = await createAuthUser(emailLC, tempPassword)
        if (authUser) auth_id = authUser.id
      } catch (err) { toast('Error creating login account: ' + (err.message || 'Try again.')); return }

      // Plain insert — don't use .single() which fails under RLS
      const { error } = await sb.from('users').insert({
        name: name.trim(), email: emailLC, auth_id, role,
        organization_id: orgId, is_active: true, must_change_password: true, terms_accepted_version: null,
      })
      if (error) { toast('Error creating user: ' + error.message); return }

      // Fetch the new user's ID to save icon prefs and queue welcome email
      const { data: newUser } = await sb.from('users').select('id').ilike('email', emailLC).maybeSingle()
      if (role === 'lab_user' && newUser?.id) await saveIconPrefs(newUser.id)
      queueWelcomeEmail(sb, { name: name.trim(), toEmail: emailLC, orgId, userId: newUser?.id ?? null, password: tempPassword })
      setSavedCreds({ name: name.trim(), email: emailLC, password: tempPassword })
      onSaved()
    }
  }

  function copyCredentials() {
    const orgName = orgs.find(o => o.id === orgId)?.name || ''
    const text = `ICT-Lab Login Credentials\nOrganization: ${orgName}\nEmail: ${savedCreds.email}\nPassword: ${savedCreds.password}\n\nPlease log in and change your password on first sign-in.`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (savedCreds) return (
    <Modal onClose={onClose}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>User created</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>Copy these credentials and send to the user</div>
      </div>
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, fontFamily: 'var(--mono)', fontSize: 13 }}>
        <div><strong>Email:</strong> {savedCreds.email}</div>
        <div style={{ marginTop: 6 }}><strong>Password:</strong> {savedCreds.password}</div>
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>User will be forced to change password on first login.</div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={copyCredentials}>
          {copied ? '✓ Copied!' : '📋 Copy credentials'}
        </button>
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </Modal>
  )

  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>{user ? 'Edit user' : 'Add new user'}</div>

      <div className="field"><label>Full name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dr. Smith" autoFocus />
      </div>
      <div className="field"><label>Email * (used to sign in)</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" />
      </div>
      {user && (
        <div className="field">
          <label>Reset password (leave blank to keep current)</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          <PasswordStrengthHint password={password} />
        </div>
      )}
      {!user && (
        <div style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          🔑 A secure temporary password will be auto-generated. The user must change it on first login.
        </div>
      )}

      <div className="grid-2">
        <div className="field"><label>Role</label>
          <select value={role} onChange={e => setRole(e.target.value)}>
            <option value="user">Lab Manager</option>
            <option value="admin">Org Admin</option>
            <option value="student">Lab User</option>
          </select>
        </div>
        {isSuperAdmin && (
          <div className="field"><label>Organization *</label>
            <select value={orgId} onChange={e => setOrgId(e.target.value)}>
              <option value="">— Select org —</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {role === 'lab_user' && (
        <div style={{ marginTop: 4, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Dashboard icons for this lab user
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {/* Profile — always locked on */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, border: '1.5px solid #1D9E75', background: '#E1F5EE', fontSize: 12, fontWeight: 500, color: '#0F6E56', cursor: 'default' }}>
              <span>👤</span><span>Profile</span><span style={{ fontSize: 10, opacity: 0.6 }}>🔒</span>
            </div>
            {STUDENT_ICON_OPTIONS.map(m => {
              const on = selectedIcons.has(m.key)
              return (
                <button key={m.key} type="button" onClick={() => toggleIcon(m.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${on ? '#1D9E75' : 'var(--border)'}`,
                    background: on ? '#E1F5EE' : 'var(--surface)', cursor: 'pointer',
                    fontSize: 12, fontWeight: 500, color: on ? '#0F6E56' : 'var(--text2)',
                    transition: 'all 0.12s',
                  }}>
                  <span>{m.icon}</span><span>{m.label}</span>
                  {on && <span style={{ fontSize: 10, fontWeight: 700 }}>✓</span>}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
            Profile is always included. Defaults are set by your org admin in the Lab Users tab.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn btn-primary" onClick={save}>
          {user ? 'Save changes' : 'Create user'}
        </button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

// ── Module lists ──────────────────────────────────────────────
// Org-level pool (org admins): all modules except profile (always pinned)
const ORG_CONFIGURABLE_MODULES = ALL_MODULES_META.filter(m => m.key !== 'profile')

// Super admin global team pool: also exclude mileage & labsafety (ICT-org-specific external links)
const APP_GLOBAL_MODULES = ALL_MODULES_META.filter(m => m.key !== 'profile' && m.key !== 'mileage' && m.key !== 'labsafety')

// Super admin global solo pool: same exclusions + soloLocked
const SOLO_GLOBAL_MODULES = ALL_MODULES_META.filter(m => !m.soloLocked && m.key !== 'profile' && m.key !== 'mileage' && m.key !== 'labsafety')

// Profile is always-on so excluded from access-control, but included here for image upload
const ORG_IMAGE_MODULES = ALL_MODULES_META

// ── Shared image grid for global icon images ──────────────────
function GlobalImageGrid({ modules, imagePrefix, alsoPrefix }) {
  const { toast } = useAppStore()
  const [images, setImages] = useState(null)
  const [uploading, setUploading] = useState(null)
  const fileRefs = useRef({})

  useEffect(() => {
    const keys = modules.map(m => `${imagePrefix}${m.key}`)
    sb.from('settings').select('key, value').in('key', keys)
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(r => { map[r.key.replace(imagePrefix, '')] = r.value })
        setImages(map)
      })
  }, [])

  async function handleUpload(m, file) {
    if (!file) return
    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
    if (!isSvg && !file.type.startsWith('image/')) { toast('Please select an image or SVG file.'); return }
    setUploading(m.key)
    try {
      const W = 800, H = 500
      const canvas = document.createElement('canvas')
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#111'
      ctx.fillRect(0, 0, W, H)
      await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('File read failed'))
        reader.onload = e => {
          const img = new Image()
          img.onerror = () => reject(new Error('Image render failed'))
          img.onload = () => {
            const iw = img.naturalWidth || W, ih = img.naturalHeight || H
            const scale = Math.max(W / iw, H / ih)
            const sw = iw * scale, sh = ih * scale
            ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh)
            resolve()
          }
          img.src = isSvg
            ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(e.target.result)
            : e.target.result
        }
        isSvg ? reader.readAsText(file) : reader.readAsDataURL(file)
      })
      const compressed = await new Promise((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas export failed')), 'image/jpeg', 0.85)
      )
      const path = `module-images/global/${imagePrefix}${m.key}-${Date.now()}.jpg`
      const { error: upErr } = await sb.storage.from('project-files').upload(path, compressed, { contentType: 'image/jpeg' })
      if (upErr) throw new Error('Storage: ' + upErr.message)
      const { data: urlData } = sb.storage.from('project-files').getPublicUrl(path)
      const url = urlData.publicUrl
      const { error } = await sb.from('settings').upsert({ key: `${imagePrefix}${m.key}`, value: url }, { onConflict: 'key' })
      if (error) throw new Error('Save: ' + error.message)
      if (alsoPrefix) {
        await sb.from('settings').upsert({ key: `${alsoPrefix}${m.key}`, value: url }, { onConflict: 'key' })
      }
      setImages(prev => ({ ...prev, [m.key]: url }))
      toast(`${m.label} image saved ✓`)
    } catch (e) {
      toast('Upload failed: ' + (e?.message || String(e)))
    } finally {
      setUploading(null)
      if (fileRefs.current[m.key]) fileRefs.current[m.key].value = ''
    }
  }

  async function clearImage(m) {
    await sb.from('settings').delete().eq('key', `${imagePrefix}${m.key}`)
    if (alsoPrefix) await sb.from('settings').delete().eq('key', `${alsoPrefix}${m.key}`)
    setImages(prev => { const n = { ...prev }; delete n[m.key]; return n })
    toast(`${m.label} image removed.`)
  }

  if (images === null) return <div className="spinner" style={{ margin: '20px auto' }} />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
      {modules.map(m => {
        const currentUrl = images[m.key]
        const isUploading = uploading === m.key
        return (
          <div key={m.key} style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--surface)' }}>
            <div style={{ height: 80, position: 'relative', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {currentUrl
                ? <img src={currentUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                : <div style={{ fontSize: 26, opacity: 0.35 }}>{m.icon}</div>
              }
              {currentUrl && (
                <button onClick={() => clearImage(m)} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', borderRadius: 4, fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>✕</button>
              )}
              {isUploading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner" />
                </div>
              )}
            </div>
            <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</div>
              <button className="btn btn-sm btn-primary" disabled={isUploading} onClick={() => fileRefs.current[m.key]?.click()} style={{ fontSize: 10, padding: '4px 8px', flexShrink: 0 }}>
                {currentUrl ? '↑' : '+'}
              </button>
              <input type="file" ref={el => fileRefs.current[m.key] = el} style={{ display: 'none' }} onChange={e => handleUpload(m, e.target.files[0])} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── App-level modules modal (super admin only) ────────────────
function AppModulesModal({ onClose }) {
  const { toast } = useAppStore()
  // Configurable keys (no profile, no mileage, no labsafety)
  const configKeys = APP_GLOBAL_MODULES.map(m => m.key)
  // Full display keys: configurable + profile always at end by default
  const defaultOrder = [...configKeys, 'profile']
  const [selected, setSelected] = useState(null)
  const [order, setOrder] = useState(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('icons')
  const [dragKey, setDragKey] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const dragRef = useRef(null)

  useEffect(() => {
    sb.from('settings').select('value').eq('key', 'app_allowed_modules').maybeSingle()
      .then(({ data }) => {
        try {
          const parsed = data?.value ? JSON.parse(data.value) : null
          const selKeys = parsed ? parsed.filter(k => configKeys.includes(k)) : configKeys
          // Always include profile in selected (always visible)
          setSelected(new Set([...selKeys, 'profile']))
          // Restore saved order; append any missing keys; profile defaults last
          if (parsed?.length) {
            const savedValid = parsed.filter(k => defaultOrder.includes(k))
            const missing = defaultOrder.filter(k => !savedValid.includes(k))
            setOrder([...savedValid, ...missing])
          } else {
            setOrder([...defaultOrder])
          }
        } catch {
          setSelected(new Set([...configKeys, 'profile']))
          setOrder([...defaultOrder])
        }
      })
  }, [])

  // Profile is always visible — never toggle it
  function toggle(key) {
    if (key === 'profile') return
    setSelected(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  async function save() {
    setSaving(true)
    const ordered = (order || defaultOrder).filter(k => selected.has(k))
    const isDefault = ordered.length === defaultOrder.length && ordered.every((k, i) => k === defaultOrder[i])
    const value = isDefault ? null : JSON.stringify(ordered)
    if (value === null) {
      await sb.from('settings').delete().eq('key', 'app_allowed_modules')
    } else {
      const { error } = await sb.from('settings').upsert({ key: 'app_allowed_modules', value }, { onConflict: 'key' })
      if (error) { toast('Error saving: ' + error.message); setSaving(false); return }
    }
    toast('Global app icon access saved.')
    onClose()
  }

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} style={{ padding: '6px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: tab === key ? 'var(--accent)' : 'var(--surface2)', color: tab === key ? '#fff' : 'var(--text2)' }}>{label}</button>
  )

  // Resolve full module meta for display (includes profile from ALL_MODULES_META)
  const dispModules = order ? order.map(k => ALL_MODULES_META.find(m => m.key === k)).filter(Boolean) : []

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>Dashboard Icons — Main App (Global)</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, lineHeight: 1.5 }}>
                Control which icons are available across the entire app, and optionally upload background images for each icon card.
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, padding: '0 0 0 12px', flexShrink: 0 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 6, margin: '14px 0 0' }}>{tabBtn('icons', 'Icon Access')}{tabBtn('images', 'Icon Images')}</div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px' }}>
          {tab === 'icons' && (
            !selected ? <div className="spinner" style={{ margin: '40px auto' }} /> : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                    {/* Don't count profile in the "X enabled" figure — it's always on */}
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{[...selected].filter(k => k !== 'profile').length}</span> of {configKeys.length} enabled
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setSelected(new Set([...configKeys, 'profile']))} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600 }}>Select all</button>
                    <span style={{ color: 'var(--border)' }}>·</span>
                    <button onClick={() => setSelected(new Set(['profile']))} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontWeight: 500 }}>Clear</button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14 }}>
                  💡 This is how the dashboard looks to team users. Drag cards to reorder. Click to enable/disable. Profile is always visible.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 10, paddingBottom: 8 }}>
                  {dispModules.map(m => {
                    const pinned = m.key === 'profile'
                    const sel = pinned || selected.has(m.key)
                    const isDragging = dragKey === m.key
                    const isOver = dragOver === m.key && dragKey !== m.key
                    return (
                      <div key={m.key}
                        draggable
                        onDragStart={e => { dragRef.current = m.key; e.dataTransfer.effectAllowed = 'move'; setDragKey(m.key) }}
                        onDragOver={e => { e.preventDefault(); setDragOver(m.key) }}
                        onDrop={e => {
                          e.preventDefault()
                          const src = dragRef.current
                          if (!src || src === m.key) { setDragKey(null); setDragOver(null); return }
                          setOrder(ord => {
                            const from = ord.indexOf(src), to = ord.indexOf(m.key)
                            if (from === -1 || to === -1) return ord
                            const next = [...ord]; next.splice(from, 1); next.splice(to, 0, src); return next
                          })
                          dragRef.current = null; setDragKey(null); setDragOver(null)
                        }}
                        onDragEnd={() => { dragRef.current = null; setDragKey(null); setDragOver(null) }}
                        onClick={() => toggle(m.key)}
                        style={{ opacity: isDragging ? 0.35 : (pinned ? 0.8 : 1), outline: isOver ? `2px dashed var(--accent)` : 'none', borderRadius: 12, transition: 'opacity 0.15s', cursor: 'grab' }}>
                        <div style={{ borderRadius: 12, border: sel ? `2px solid ${m.color}` : '2px solid var(--border)', background: sel ? `${m.color}12` : 'var(--surface)', padding: '14px 14px 12px', position: 'relative', transition: 'all 0.15s', userSelect: 'none' }}>
                          <div style={{ position: 'absolute', top: 9, right: 9, width: 20, height: 20, borderRadius: '50%', background: sel ? m.color : 'var(--surface2)', border: `2px solid ${sel ? m.color : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', pointerEvents: 'none' }}>
                            {sel && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </div>
                          <div style={{ fontSize: 26, marginBottom: 8, pointerEvents: 'none' }}>{m.icon}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: sel ? m.color : 'var(--text)', marginBottom: 2, paddingRight: 20, pointerEvents: 'none' }}>{m.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4, pointerEvents: 'none' }}>{m.sub}</div>
                          {pinned && <div style={{ marginTop: 6, fontSize: 10, color: m.color, fontWeight: 600, pointerEvents: 'none' }}>Always visible</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )
          )}

          {tab === 'images' && (
            <>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
                These images appear as backgrounds on dashboard icon cards for all team users. Best size: landscape ~800×500 px. Org admins can override images for their own organization.
              </div>
              <GlobalImageGrid modules={ORG_IMAGE_MODULES} imagePrefix="img_" alsoPrefix="solo_img_" />
            </>
          )}
        </div>

        {/* Footer */}
        {tab === 'icons' && selected && (
          <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, background: 'var(--surface)' }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save & apply →'}</button>
            <button className="btn" onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Solo users global modules modal (super admin only) ────────
const SOLO_IMAGE_MODULES = ALL_MODULES_META.filter(m => !m.soloLocked)

function SoloModulesModal({ onClose }) {
  const { toast } = useAppStore()
  const configKeys = SOLO_GLOBAL_MODULES.map(m => m.key)
  const defaultOrder = [...configKeys, 'profile']
  const [selected, setSelected] = useState(null)
  const [order, setOrder] = useState(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('icons')
  const [dragKey, setDragKey] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const dragRef = useRef(null)

  useEffect(() => {
    sb.from('settings').select('value').eq('key', 'solo_allowed_modules').maybeSingle()
      .then(({ data }) => {
        try {
          const parsed = data?.value ? JSON.parse(data.value) : null
          const selKeys = parsed ? parsed.filter(k => configKeys.includes(k)) : configKeys
          setSelected(new Set([...selKeys, 'profile']))
          if (parsed?.length) {
            const savedValid = parsed.filter(k => defaultOrder.includes(k))
            const missing = defaultOrder.filter(k => !savedValid.includes(k))
            setOrder([...savedValid, ...missing])
          } else {
            setOrder([...defaultOrder])
          }
        } catch {
          setSelected(new Set([...configKeys, 'profile']))
          setOrder([...defaultOrder])
        }
      })
  }, [])

  function toggle(key) {
    if (key === 'profile') return
    setSelected(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  async function save() {
    setSaving(true)
    const ordered = (order || defaultOrder).filter(k => selected.has(k))
    const isDefault = ordered.length === defaultOrder.length && ordered.every((k, i) => k === defaultOrder[i])
    const value = isDefault ? null : JSON.stringify(ordered)
    if (value === null) {
      await sb.from('settings').delete().eq('key', 'solo_allowed_modules')
    } else {
      const { error } = await sb.from('settings').upsert({ key: 'solo_allowed_modules', value }, { onConflict: 'key' })
      if (error) { toast('Error saving: ' + error.message); setSaving(false); return }
    }
    toast('Solo user icon access saved.')
    onClose()
  }

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} style={{ padding: '6px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: tab === key ? '#534AB7' : 'var(--surface2)', color: tab === key ? '#fff' : 'var(--text2)' }}>{label}</button>
  )

  const dispModules = order ? order.map(k => ALL_MODULES_META.find(m => m.key === k)).filter(Boolean) : []

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>Dashboard Icons — Solo Users (Global)</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, lineHeight: 1.5 }}>
                Control which icons solo users can see, and optionally upload background images for each icon card.
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, padding: '0 0 0 12px', flexShrink: 0 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 6, margin: '14px 0 0' }}>{tabBtn('icons', 'Icon Access')}{tabBtn('images', 'Icon Images')}</div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px' }}>
          {tab === 'icons' && (
            !selected ? <div className="spinner" style={{ margin: '40px auto' }} /> : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{[...selected].filter(k => k !== 'profile').length}</span> of {configKeys.length} enabled
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setSelected(new Set([...configKeys, 'profile']))} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: '#534AB7', fontWeight: 600 }}>Select all</button>
                    <span style={{ color: 'var(--border)' }}>·</span>
                    <button onClick={() => setSelected(new Set(['profile']))} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontWeight: 500 }}>Clear</button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14 }}>
                  💡 This is how the dashboard looks to solo users. Drag cards to reorder. Click to enable/disable. Profile is always visible.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 10, paddingBottom: 8 }}>
                  {dispModules.map(m => {
                    const pinned = m.key === 'profile'
                    const sel = pinned || selected.has(m.key)
                    const isDragging = dragKey === m.key
                    const isOver = dragOver === m.key && dragKey !== m.key
                    return (
                      <div key={m.key}
                        draggable
                        onDragStart={e => { dragRef.current = m.key; e.dataTransfer.effectAllowed = 'move'; setDragKey(m.key) }}
                        onDragOver={e => { e.preventDefault(); setDragOver(m.key) }}
                        onDrop={e => {
                          e.preventDefault()
                          const src = dragRef.current
                          if (!src || src === m.key) { setDragKey(null); setDragOver(null); return }
                          setOrder(ord => {
                            const from = ord.indexOf(src), to = ord.indexOf(m.key)
                            if (from === -1 || to === -1) return ord
                            const next = [...ord]; next.splice(from, 1); next.splice(to, 0, src); return next
                          })
                          dragRef.current = null; setDragKey(null); setDragOver(null)
                        }}
                        onDragEnd={() => { dragRef.current = null; setDragKey(null); setDragOver(null) }}
                        onClick={() => toggle(m.key)}
                        style={{ opacity: isDragging ? 0.35 : (pinned ? 0.8 : 1), outline: isOver ? '2px dashed #534AB7' : 'none', borderRadius: 12, transition: 'opacity 0.15s', cursor: 'grab' }}>
                        <div style={{ borderRadius: 12, border: sel ? `2px solid ${m.color}` : '2px solid var(--border)', background: sel ? `${m.color}12` : 'var(--surface)', padding: '14px 14px 12px', position: 'relative', transition: 'all 0.15s', userSelect: 'none' }}>
                          <div style={{ position: 'absolute', top: 9, right: 9, width: 20, height: 20, borderRadius: '50%', background: sel ? m.color : 'var(--surface2)', border: `2px solid ${sel ? m.color : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', pointerEvents: 'none' }}>
                            {sel && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </div>
                          <div style={{ fontSize: 26, marginBottom: 8, pointerEvents: 'none' }}>{m.icon}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: sel ? m.color : 'var(--text)', marginBottom: 2, paddingRight: 20, pointerEvents: 'none' }}>{m.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4, pointerEvents: 'none' }}>{m.sub}</div>
                          {pinned && <div style={{ marginTop: 6, fontSize: 10, color: m.color, fontWeight: 600, pointerEvents: 'none' }}>Always visible</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )
          )}

          {tab === 'images' && (
            <>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
                These images appear as backgrounds on dashboard icon cards for all solo users. Best size: landscape ~800×500 px.
              </div>
              <GlobalImageGrid modules={SOLO_IMAGE_MODULES} imagePrefix="solo_img_" />
            </>
          )}
        </div>

        {/* Footer */}
        {tab === 'icons' && selected && (
          <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, background: 'var(--surface)' }}>
            <button onClick={save} disabled={saving}
              style={{ padding: '10px 28px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save & apply →'}
            </button>
            <button className="btn" onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}

function OrgModulesModal({ org, onClose, onSaved }) {
  const { toast } = useAppStore()
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    sb.from('organizations').select('allowed_modules').eq('id', org.id).maybeSingle()
      .then(({ data }) => {
        if (data?.allowed_modules) {
          setSelected(new Set(data.allowed_modules))
        } else {
          setSelected(new Set(ORG_CONFIGURABLE_MODULES.map(m => m.key)))
        }
      })
  }, [org.id])

  function toggle(key) {
    setSelected(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  async function save() {
    setSaving(true)
    const allKeys = ORG_CONFIGURABLE_MODULES.map(m => m.key)
    const selectedKeys = allKeys.filter(k => selected.has(k))
    const toSave = selectedKeys.length === allKeys.length ? null : selectedKeys
    const { error } = await sb.from('organizations').update({ allowed_modules: toSave }).eq('id', org.id)
    if (error) { toast('Error saving: ' + error.message); setSaving(false); return }
    toast(`Icon access saved for ${org.name}`)
    onSaved(); onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Dashboard Icons — {org.name}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, padding: '0 0 0 8px' }}>×</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20, lineHeight: 1.6 }}>
        Select which icons the org admin of this organization can enable on their dashboard. Unchecked icons will be hidden for all users in this org.
      </div>
      {selected === null ? <div className="spinner" style={{ margin: '20px auto' }} /> : (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button className="btn btn-sm" onClick={() => setSelected(new Set(ORG_CONFIGURABLE_MODULES.map(m => m.key)))}>Select all</button>
            <button className="btn btn-sm" onClick={() => setSelected(new Set())}>Clear all</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, maxHeight: '55vh', overflowY: 'auto' }}>
            {ORG_CONFIGURABLE_MODULES.map(m => (
              <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${selected.has(m.key) ? 'var(--accent)' : 'var(--border)'}`, background: selected.has(m.key) ? 'var(--accent-light)' : 'var(--surface)' }}>
                <input type="checkbox" checked={selected.has(m.key)} onChange={() => toggle(m.key)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: 18, lineHeight: 1 }}>{m.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.sub}</div>
                </div>
              </label>
            ))}
          </div>
        </>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || selected === null}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

// ── Org modal (super admin only) ──────────────────────────────
const ORG_CATEGORIES = [
  'University / Academic',
  'Research Institute',
  'Medical / Clinical',
  'Industrial / Manufacturing',
  'Government / Defense',
  'Commercial / Private',
  'Teaching / Training',
  'Other',
]

function OrgModal({ org, onClose, onSaved }) {
  const { toast } = useAppStore()
  const [name, setName] = useState(org?.name || '')
  const [slug, setSlug] = useState(org?.slug || '')
  const [category, setCategory] = useState(org?.category || '')

  function autoSlug(n) { return n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') }

  async function save() {
    if (!name.trim()) { toast('Please enter an organization name.'); return }
    const s = slug.trim() || autoSlug(name)
    if (!s) { toast('Please enter a slug.'); return }
    const payload = { name: name.trim(), slug: s, category: category || null }
    if (org) {
      const { error } = await sb.from('organizations').update(payload).eq('id', org.id)
      if (error) { toast('Error: ' + error.message); return }
    } else {
      const { error } = await sb.from('organizations').insert(payload)
      if (error) { toast('Error: ' + error.message); return }
    }
    toast('Organization saved.')
    onSaved()
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>{org ? 'Edit organization' : 'New organization'}</div>
      <div className="field"><label>Organization name *</label>
        <input value={name} onChange={e => { setName(e.target.value); if (!org) setSlug(autoSlug(e.target.value)) }} placeholder="e.g. ICT Lab" autoFocus />
      </div>
      <div className="field"><label>Slug (URL-safe identifier)</label>
        <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="e.g. ict-lab" />
      </div>
      <div className="field"><label>Category</label>
        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">— Select category —</option>
          {ORG_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn btn-primary" onClick={save}>{org ? 'Save' : 'Create organization'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

// ── Screen access modal ───────────────────────────────────────
// Derived from dashboard module list — team only, no external links, no profile
const ALL_SCREENS = ALL_MODULES_META
  .filter(m => m.roles.includes('team') && m.screen && !m.external && m.key !== 'profile')
  .map(m => ({ key: m.screen, label: m.label, icon: m.icon }))

function AccessModal({ user, onClose, onSaved }) {
  const { toast } = useAppStore()
  const [granted, setGranted] = useState(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    sb.from('user_screen_access').select('screen_key').eq('user_id', user.id)
      .then(({ data }) => {
        setGranted(new Set((data || []).map(r => r.screen_key)))
        setLoading(false)
      })
  }, [user.id])

  function toggle(key) {
    setGranted(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function save() {
    await sb.from('user_screen_access').delete().eq('user_id', user.id)
    if (granted.size > 0) {
      const rows = [...granted].map(key => ({ user_id: user.id, screen_key: key, organization_id: user.organization_id || null }))
      await sb.from('user_screen_access').insert(rows)
    }
    toast('Access saved.')
    onSaved()
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Screen access — {user.name}</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>Dashboard, Profile, PM, and Barcode are always available.</div>
      {loading ? <div className="spinner" style={{ margin: '20px auto' }} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {ALL_SCREENS.map(s => (
            <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${granted.has(s.key) ? 'var(--accent)' : 'var(--border)'}`, background: granted.has(s.key) ? 'var(--accent-light)' : 'var(--surface)' }}>
              <input type="checkbox" checked={granted.has(s.key)} onChange={() => toggle(s.key)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
              <span style={{ fontSize: 18, lineHeight: 1 }}>{s.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{s.label}</span>
            </label>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={save}>Save access</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN ADMIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function Admin() {
  const { session, toast, pendingAdminTab, setPendingAdminTab } = useAppStore()
  const isSuperAdmin = !session?.userId   // logged in via /admin password
  const myOrgId = session?.organizationId || null

  const [tab, setTab] = useState(isSuperAdmin ? 'organizations' : 'users')

  useEffect(() => {
    if (pendingAdminTab) {
      setTab(pendingAdminTab)
      setPendingAdminTab(null)
    }
  }, [pendingAdminTab])
  const [users, setUsers]     = useState([])
  const [orgs, setOrgs]       = useState([])
  const [orgCounts, setOrgCounts] = useState({})
  const [orgAdmins, setOrgAdmins] = useState([])
  const [search, setSearch]   = useState('')
  const [orgFilter, setOrgFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const [userModal, setUserModal]               = useState(null)
  const [addAdminOrgId, setAddAdminOrgId]       = useState(null)
  const [orgModal, setOrgModal]                 = useState(null)
  const [accessModal, setAccessModal]           = useState(null)
  const [orgModulesModal, setOrgModulesModal]   = useState(null)
  const [appModulesOpen, setAppModulesOpen]     = useState(false)
  const [soloModulesOpen, setSoloModulesOpen]   = useState(false)
  const [soloUsers, setSoloUsers]               = useState([])
  const [soloSearch, setSoloSearch]             = useState('')
  const [soloLoading, setSoloLoading]           = useState(false)
  const [teamUsers, setTeamUsers]               = useState([])
  const [teamSearch, setTeamSearch]             = useState('')
  const [teamLoading, setTeamLoading]           = useState(false)
  const [userSubTab, setUserSubTab]             = useState('solo')
  const [maintenanceMode, setMaintenanceMode]   = useState(false)
  const [maintBusy, setMaintBusy]               = useState(false)
  const [feedbackModal, setFeedbackModal]       = useState(null) // org object

  const tabs = isSuperAdmin
    ? [{ key: 'organizations', label: '🏢 Organizations' }, { key: 'useraccounts', label: '👥 User Accounts' }]
    : [{ key: 'users', label: 'Lab Managers' }, { key: 'students', label: 'Lab Users' }, { key: 'iconpools', label: '🎛️ Icon Pools' }, { key: 'images', label: 'Module Images' }, { key: 'floorplan', label: '🗺️ Floor Plan' }, { key: 'orgsettings', label: 'Org Settings' }]

  useEffect(() => {
    loadOrgs()
    if (isSuperAdmin) {
      loadSoloUsers()
      sb.from('settings').select('value').eq('key', 'maintenance_mode').maybeSingle()
        .then(({ data }) => setMaintenanceMode(data?.value === 'true'))
    }
  }, [])

  async function toggleMaintenance() {
    setMaintBusy(true)
    const next = !maintenanceMode
    await sb.from('settings').upsert({ key: 'maintenance_mode', value: next ? 'true' : 'false' }, { onConflict: 'key' })
    setMaintenanceMode(next)
    setMaintBusy(false)
    toast(next ? '⚠️ Maintenance mode ON — users see Coming Soon.' : '✓ Maintenance mode OFF — site is live.')
  }

  async function loadSoloUsers() {
    setSoloLoading(true)
    const { data } = await sb.from('solo_users').select('id, name, email, created_at, active_modules, is_paid').order('created_at', { ascending: false })
    setSoloUsers(data || [])
    setSoloLoading(false)
  }

  async function toggleSoloPaid(u) {
    const next = !u.is_paid
    await sb.from('solo_users').update({ is_paid: next }).eq('id', u.id)
    setSoloUsers(prev => prev.map(s => s.id === u.id ? { ...s, is_paid: next } : s))
    toast(`${u.name} marked as ${next ? 'paid ✓' : 'free'}`)
  }

  async function deleteSoloUser(u) {
    if (!confirm(`Delete solo account "${u.name}" (${u.email}) permanently?`)) return
    const { error } = await sb.from('solo_users').delete().eq('id', u.id)
    if (error) { toast('Delete failed: ' + error.message); return }
    setSoloUsers(prev => prev.filter(s => s.id !== u.id))
    toast('Solo account deleted.')
  }

  async function loadTeamUsers() {
    setTeamLoading(true)
    const { data } = await sb.from('users').select('id, name, email, role, is_active, organization_id, created_at').order('organization_id').order('name')
    setTeamUsers(data || [])
    setTeamLoading(false)
  }
  useEffect(() => {
    if (tab === 'users' || tab === 'students') loadUsers()
    setSelectedIds(new Set())
  }, [tab, orgFilter])

  useEffect(() => {
    if (isSuperAdmin && tab === 'useraccounts' && userSubTab === 'team') loadTeamUsers()
  }, [tab, userSubTab])

  async function loadOrgs() {
    const [{ data: orgData }, { data: countData }, { data: adminData }] = await Promise.all([
      sb.from('organizations').select('*').order('name'),
      sb.from('users').select('organization_id').not('organization_id', 'is', null),
      sb.from('users').select('id, name, email, organization_id, is_active').eq('role', 'admin').not('organization_id', 'is', null),
    ])
    setOrgs(orgData || [])
    const counts = {}
    ;(countData || []).forEach(u => { counts[u.organization_id] = (counts[u.organization_id] || 0) + 1 })
    setOrgCounts(counts)
    setOrgAdmins(adminData || [])
  }

  async function loadUsers() {
    setLoading(true)
    let q = sb.from('users').select('*').order('name')
    if (isSuperAdmin) {
      // Super admin only sees org admins across all orgs
      q = q.eq('role', 'admin')
      if (orgFilter) q = q.eq('organization_id', orgFilter)
    } else {
      // Org admin sees their own org's users
      if (tab === 'students') q = q.eq('role', 'lab_user')
      else q = q.in('role', ['user', 'admin'])
      q = q.eq('organization_id', myOrgId)
    }
    const { data } = await q
    setUsers(data || [])
    setLoading(false)
  }

  async function deactivateUser(u) {
    await sb.from('users').update({ is_active: !u.is_active }).eq('id', u.id)
    loadUsers()
    toast(u.is_active ? 'User deactivated.' : 'User activated.')
  }

  async function deleteUser(user) {
    if (!confirm('Delete this user permanently? All their records (training, bookings, tasks) will also be removed.')) return
    const uid = user.id
    // Pre-delete all user-owned data — use allSettled so a missing table never aborts the rest
    await Promise.allSettled([
      sb.from('user_screen_access').delete().eq('user_id', uid),
      sb.from('user_dashboard_prefs').delete().eq('user_id', uid),
      sb.from('user_out_of_lab').delete().eq('user_id', uid),
      sb.from('notification_prefs').delete().eq('user_id', uid),
      sb.from('notifications').delete().eq('user_id', uid),
      sb.from('booking_notifications').delete().eq('user_id', uid),
      sb.from('reminders').delete().eq('user_id', uid),
      sb.from('task_comments').delete().eq('user_id', uid),
      sb.from('team_task_group_members').delete().eq('user_id', uid),
      sb.from('account_deletion_requests').delete().eq('user_id', uid),
      sb.from('equipment_exam_results').delete().eq('user_id', uid),
      sb.from('equipment_material_progress').delete().eq('user_id', uid),
      sb.from('equipment_sop_notes').delete().eq('user_id', uid),
      sb.from('equipment_temp_access').delete().eq('user_id', uid),
      sb.from('equipment_bookings').delete().eq('user_id', uid),
      sb.from('training_fresh').delete().eq('user_id', uid),
      sb.from('training_golf_car').delete().eq('user_id', uid),
      sb.from('training_building_alarm').delete().eq('user_id', uid),
      sb.from('training_equipment').delete().eq('user_id', uid),
      sb.from('training_schedule').delete().eq('user_id', uid),
      sb.from('email_notifications_queue').delete().eq('user_id', uid),
    ])
    // Unassign tasks rather than delete them
    await sb.from('tasks').update({ assigned_to: null }).eq('assigned_to', uid)
    // Try to remove Supabase auth account so the email can be reused (non-critical)
    if (user.auth_id) {
      try { await sb.rpc('delete_auth_user', { p_auth_id: user.auth_id }) } catch (_) {}
    }
    const { error } = await sb.from('users').delete().eq('id', uid)
    if (error) { toast('Delete failed: ' + error.message); return }
    loadUsers()
    toast('User deleted.')
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredUsers.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredUsers.map(u => u.id)))
    }
  }

  async function deleteSelected() {
    if (!selectedIds.size) return
    if (!confirm(`Delete ${selectedIds.size} lab user(s) permanently? This cannot be undone.`)) return
    const ids = Array.from(selectedIds)
    const { error } = await sb.from('users').delete().in('id', ids)
    if (error) { toast('Delete failed: ' + error.message); return }
    setSelectedIds(new Set())
    loadUsers()
    toast(`${ids.length} user(s) deleted.`)
  }

  async function deleteOrg(id) {
    if (!confirm('Delete this organization and ALL its data? This cannot be undone.')) return

    // Clean up user-linked tables before users are removed by cascade
    const { data: orgUsers } = await sb.from('users').select('id').eq('organization_id', id)
    const userIds = (orgUsers || []).map(u => u.id)
    if (userIds.length) {
      await sb.from('user_screen_access').delete().in('user_id', userIds)
      await sb.from('user_dashboard_prefs').delete().in('user_id', userIds)
    }

    // DB CASCADE handles all organization_id-linked tables automatically
    const { error } = await sb.from('organizations').delete().eq('id', id)
    if (error) { toast('Delete failed: ' + error.message); return }
    loadOrgs(); loadUsers()
    toast('Organization deleted.')
  }

  async function removeAdmin(admin) {
    if (!confirm(`Remove ${admin.name} as admin? This will delete their account.`)) return
    const { error } = await sb.from('users').delete().eq('id', admin.id)
    if (error) { toast('Remove failed: ' + error.message); return }
    toast(`${admin.name} removed.`)
    loadOrgs()
  }

  async function uploadOrgLogo(org, file) {
    if (!file) return
    if (!file.type.includes('svg') && !file.type.startsWith('image/')) { toast('Please upload an SVG or image file.'); return }
    const ext  = file.name.split('.').pop()
    const path = `org-logos/${org.id}.${ext}`
    const { error: upErr } = await sb.storage.from('project-files').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { toast('Upload failed: ' + upErr.message); return }
    const { data: { publicUrl } } = sb.storage.from('project-files').getPublicUrl(path)
    const { error: dbErr } = await sb.from('organizations').update({ logo_url: publicUrl }).eq('id', org.id)
    if (dbErr) { toast('Save failed: ' + dbErr.message); return }
    toast(`Logo saved for ${org.name}`)
    loadOrgs()
  }

  async function removeOrgLogo(org) {
    await sb.from('organizations').update({ logo_url: null }).eq('id', org.id)
    toast('Logo removed.')
    loadOrgs()
  }

  async function togglePhotoRequired(org) {
    const newVal = !org.require_equipment_photos
    const { error } = await sb.from('organizations').update({ require_equipment_photos: newVal }).eq('id', org.id)
    if (error) { toast('Update failed: ' + error.message); return }
    toast(newVal ? '📸 Before/after photos enabled for this org.' : 'Photos disabled for this org.')
    loadOrgs()
  }

  async function toggleFeedbackOrg(org) {
    const newVal = !org.is_feedback_org
    const { error } = await sb.from('organizations').update({ is_feedback_org: newVal }).eq('id', org.id)
    if (error) { toast('Update failed: ' + error.message); return }
    toast(newVal ? '🎯 Feedback mode enabled for this org.' : '🎯 Feedback mode disabled.')
    loadOrgs()
  }

  const orgName = (id) => orgs.find(o => o.id === id)?.name || '—'

  const filteredUsers = users.filter(u =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>
            {isSuperAdmin ? 'Super Admin Panel' : 'Organization Admin Panel'}
          </div>
          {!isSuperAdmin && myOrgId && (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Managing: {orgName(myOrgId)}</div>
          )}
        </div>
        {isSuperAdmin && (
          <a href="https://analytics.google.com/analytics/web/" target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, background: '#f97316', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
            📊 View Analytics
          </a>
        )}
      </div>

      {/* Maintenance mode toggle — super admin only */}
      {isSuperAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 16px', borderRadius: 'var(--radius)', marginBottom: 16, border: `2px solid ${maintenanceMode ? '#ef4444' : 'var(--border)'}`, background: maintenanceMode ? '#FEF2F2' : 'var(--surface2)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{maintenanceMode ? '🔴' : '🟢'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: maintenanceMode ? '#ef4444' : 'var(--text)' }}>
                {maintenanceMode ? 'Site is under maintenance — users see "Coming Soon"' : 'Site is live'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
                Toggle to put the website in maintenance mode. Super admin is always exempt.
              </div>
            </div>
          </div>
          <button
            onClick={toggleMaintenance}
            disabled={maintBusy}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: maintBusy ? 'default' : 'pointer', fontWeight: 700, fontSize: 13, background: maintenanceMode ? '#ef4444' : 'var(--accent)', color: '#fff', opacity: maintBusy ? 0.6 : 1, transition: 'all 0.15s', flexShrink: 0 }}>
            {maintBusy ? 'Saving…' : maintenanceMode ? 'Turn Off' : 'Enable Maintenance'}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '8px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: tab === t.key ? 'var(--accent)' : 'var(--surface2)', color: tab === t.key ? '#fff' : 'var(--text2)' }}>
            {t.label}
          </button>
        ))}
      </div>



      {/* ── USERS / STUDENTS (org admin only) ── */}
      {!isSuperAdmin && (tab === 'users' || tab === 'students') && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" style={{ flex: 1, minWidth: 180 }} />
            <button className="btn btn-primary btn-sm" onClick={() => setUserModal('add')}>
              + Add {tab === 'students' ? 'lab user' : 'lab manager'}
            </button>
          </div>
          {tab === 'students' && filteredUsers.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredUsers.length && filteredUsers.length > 0}
                  onChange={toggleSelectAll}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                {selectedIds.size === filteredUsers.length ? 'Deselect all' : 'Select all'} ({filteredUsers.length})
              </label>
              {selectedIds.size > 0 && (
                <button className="btn btn-sm btn-danger" onClick={deleteSelected} style={{ marginLeft: 'auto' }}>
                  Delete selected ({selectedIds.size})
                </button>
              )}
            </div>
          )}
          {loading ? (
            <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : filteredUsers.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">👤</div>No users found.</div>
          ) : (
            filteredUsers.map(u => (
              <div key={u.id} className="card" style={{ padding: '12px 16px', marginBottom: 10, opacity: u.is_active ? 1 : 0.55, outline: tab === 'students' && selectedIds.has(u.id) ? '2px solid var(--accent)' : 'none', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {tab === 'students' && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(u.id)}
                      onChange={() => toggleSelect(u.id)}
                      style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                    />
                  )}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{u.name}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: u.role === 'admin' ? '#FEF3C7' : u.role === 'lab_user' ? '#EDE9FE' : '#E1F5EE', color: u.role === 'admin' ? '#92400E' : u.role === 'lab_user' ? '#5B21B6' : '#065F46', fontWeight: 600 }}>
                        {u.role === 'admin' ? 'Org Admin' : u.role === 'lab_user' ? 'Lab User' : 'Lab Manager'}
                      </span>
                      {!u.is_active && <span style={{ fontSize: 11, color: 'var(--accent2)', fontWeight: 500 }}>Inactive</span>}
                      {u.must_change_password && <span style={{ fontSize: 11, color: '#D97706', fontWeight: 500 }}>⚠ Temp password</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                      {u.email && <span>{u.email}</span>}
                    </div>
                  </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {u.role !== 'admin' && tab === 'users' && <button className="btn btn-sm" onClick={() => setAccessModal(u)}>Access</button>}
                    {u.role !== 'admin' && <button className="btn btn-sm" onClick={() => setUserModal(u)}>Edit</button>}
                    {u.role !== 'admin' && <button className="btn btn-sm" onClick={() => deactivateUser(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</button>}
                    {u.role !== 'admin' && <button className="btn btn-sm btn-danger" onClick={() => deleteUser(u)}>Delete</button>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── ICON POOLS (org admin only) ── */}
      {!isSuperAdmin && tab === 'iconpools' && <OrgIconPoolsPanel orgId={myOrgId} />}

      {/* ── MODULE IMAGES ── */}
      {tab === 'images' && <ModuleImagesPanel orgId={myOrgId} />}

      {/* ── FLOOR PLAN (org admin only) ── */}
      {!isSuperAdmin && tab === 'floorplan' && <FloorPlanEditor />}

      {/* ── ORG SETTINGS (org admin only) ── */}
      {!isSuperAdmin && tab === 'orgsettings' && <OrgSettingsPanel session={session} />}

      {/* ── ORGANIZATIONS TAB (super admin) ── */}
      {isSuperAdmin && tab === 'organizations' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setOrgModal('add')}>+ New organization</button>
          </div>

          {/* Global app-level icon restriction */}
          <div className="card" style={{ padding: '14px 16px', marginBottom: 10, border: '1.5px solid var(--accent)', background: 'var(--accent-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <button onClick={() => setAppModulesOpen(true)} style={{ fontWeight: 700, fontSize: 15, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, textAlign: 'left', textDecoration: 'underline dotted' }}>
                  🌐 Main App (Global)
                </button>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  Global icon pool — applies to all organizations as the outermost boundary
                </div>
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => setAppModulesOpen(true)}>Icons</button>
            </div>
          </div>

          {/* Global solo users icon restriction */}
          <div className="card" style={{ padding: '14px 16px', marginBottom: 20, border: '1.5px solid #534AB7', background: '#EEEDFE' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <button onClick={() => setSoloModulesOpen(true)} style={{ fontWeight: 700, fontSize: 15, background: 'none', border: 'none', cursor: 'pointer', color: '#534AB7', padding: 0, textAlign: 'left', textDecoration: 'underline dotted' }}>
                  👤 Solo Users (Global)
                </button>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  Icons available to all solo user accounts across the app
                </div>
              </div>
              <button onClick={() => setSoloModulesOpen(true)} style={{ padding: '4px 14px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Icons</button>
            </div>
          </div>

          {orgs.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">🏢</div>No organizations yet.</div>
          ) : orgs.map(o => {
            const count = orgCounts[o.id] || 0
            const admins = orgAdmins.filter(a => a.organization_id === o.id)
            return (
              <div key={o.id} className="card" style={{ padding: '14px 16px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => setOrgModulesModal(o)} style={{ fontWeight: 600, fontSize: 15, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, textAlign: 'left', textDecoration: 'underline dotted' }}>
                        {o.name}
                      </button>
                      {o.category && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600, border: '1px solid var(--accent)', whiteSpace: 'nowrap' }}>
                          {o.category}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                      {o.slug} · {count} user{count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {admins.map(a => (
                        <div key={a.id} style={{ position: 'relative' }}>
                          <button onClick={() => setUserModal(a)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', textAlign: 'left' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 99, background: '#FEF3C7', color: '#92400E', fontWeight: 600 }}>👤 Admin</span>
                              {a.name}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{a.email}</span>
                          </button>
                          <button onClick={() => removeAdmin(a)}
                            style={{ position: 'absolute', top: -7, right: -7, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', border: '2px solid var(--bg)', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}>
                            ×
                          </button>
                        </div>
                      ))}
                      <button onClick={() => { setAddAdminOrgId(o.id); setUserModal('add') }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface2)', border: '1.5px dashed var(--border)', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 600, minHeight: 42 }}>
                        <span style={{ fontSize: 15 }}>👤</span> + Add Admin
                      </button>
                    </div>
                    <button
                      className="btn btn-sm"
                      onClick={() => togglePhotoRequired(o)}
                      title={o.require_equipment_photos ? 'Before/after photos ON — click to disable' : 'Before/after photos OFF — click to enable'}
                      style={{ background: o.require_equipment_photos ? '#fef3c7' : undefined, color: o.require_equipment_photos ? '#92400e' : undefined, borderColor: o.require_equipment_photos ? '#f0d070' : undefined }}
                    >
                      📸 {o.require_equipment_photos ? 'Photos On' : 'Photos Off'}
                    </button>
                    {/* Org logo upload */}
                    <label title="Upload SVG/image logo shown in the header for this org's users" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: o.logo_url ? '1.5px solid #1D9E75' : '1px solid var(--border)', background: o.logo_url ? '#e6f7f2' : 'var(--surface)', color: o.logo_url ? '#1D9E75' : 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input type="file" accept=".svg,image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadOrgLogo(o, f); e.target.value = '' }} />
                      🏷 {o.logo_url ? 'Logo ✓' : 'Logo'}
                    </label>
                    {o.logo_url && (
                      <button className="btn btn-sm" title="Remove org logo" onClick={() => removeOrgLogo(o)} style={{ padding: '4px 8px', color: '#ef4444', borderColor: '#fca5a5' }}>✕ Logo</button>
                    )}
                    <button className="btn btn-sm" onClick={() => setOrgModulesModal(o)}>Icons</button>
                    <button
                      className="btn btn-sm"
                      onClick={() => toggleFeedbackOrg(o)}
                      title={o.is_feedback_org ? 'Disable feedback mode for this org' : 'Enable feedback mode — users see a feedback widget on each module page'}
                      style={o.is_feedback_org ? { background: '#fef3c7', color: '#d97706', borderColor: '#fcd34d', fontWeight: 700 } : {}}
                    >
                      🎯 {o.is_feedback_org ? 'Feedback On' : 'Feedback'}
                    </button>
                    {o.is_feedback_org && (
                      <button className="btn btn-sm" onClick={() => setFeedbackModal(o)} style={{ background: '#f0fdf4', color: '#16a34a', borderColor: '#86efac' }}>
                        📋 Responses
                      </button>
                    )}
                    <button className="btn btn-sm" onClick={() => setOrgModal(o)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteOrg(o.id)}>Delete</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── USER ACCOUNTS TAB (super admin) ── */}
      {isSuperAdmin && tab === 'useraccounts' && (
        <div>
          {/* Sub-tab bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[{ key: 'solo', label: '👤 Solo Users' }, { key: 'team', label: '🏢 Team Users' }].map(st => (
              <button key={st.key} onClick={() => setUserSubTab(st.key)}
                style={{ padding: '6px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600, border: `2px solid ${userSubTab === st.key ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', background: userSubTab === st.key ? 'var(--accent-light)' : 'var(--surface)', color: userSubTab === st.key ? 'var(--accent)' : 'var(--text2)' }}>
                {st.label}
              </button>
            ))}
          </div>

          {/* Solo Users sub-tab */}
          {userSubTab === 'solo' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text2)' }}>All solo accounts</div>
                <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 99, background: '#EEEDFE', color: '#534AB7' }}>{soloUsers.length}</span>
              </div>
              <input
                value={soloSearch} onChange={e => setSoloSearch(e.target.value)}
                placeholder="Search by name or email…"
                style={{ width: '100%', marginBottom: 12, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
              />
              {soloLoading ? (
                <div style={{ textAlign: 'center', padding: 20 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
              ) : (() => {
                const filtered = soloUsers.filter(u =>
                  !soloSearch || u.name?.toLowerCase().includes(soloSearch.toLowerCase()) || u.email?.toLowerCase().includes(soloSearch.toLowerCase())
                )
                if (filtered.length === 0) return <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '24px 0', fontSize: 13 }}>No solo accounts found.</div>
                return filtered.map(u => (
                  <div key={u.id} className="card" style={{ padding: '10px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#EEEDFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>👤</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {u.name}
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: u.is_paid ? '#eafaf1' : '#f0f0f0', color: u.is_paid ? '#27ae60' : '#888' }}>
                          {u.is_paid ? 'PAID' : 'FREE'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>{u.email}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', flexShrink: 0, textAlign: 'right' }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </div>
                    <button className="btn btn-sm" onClick={() => toggleSoloPaid(u)}>{u.is_paid ? 'Revoke Paid' : 'Mark Paid'}</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteSoloUser(u)}>Delete</button>
                  </div>
                ))
              })()}
            </div>
          )}

          {/* Team Users sub-tab */}
          {userSubTab === 'team' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text2)' }}>All team accounts</div>
                <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 99, background: 'var(--accent-light)', color: 'var(--accent)' }}>{teamUsers.length}</span>
              </div>
              {/* Per-org count summary */}
              {orgs.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {orgs.map(o => {
                    const cnt = teamUsers.filter(u => u.organization_id === o.id).length
                    if (!cnt) return null
                    return (
                      <span key={o.id} style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 99, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
                        {o.name} · {cnt}
                      </span>
                    )
                  })}
                </div>
              )}
              <input
                value={teamSearch} onChange={e => setTeamSearch(e.target.value)}
                placeholder="Search by name, email or organisation…"
                style={{ width: '100%', marginBottom: 12, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
              />
              {teamLoading ? (
                <div style={{ textAlign: 'center', padding: 20 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
              ) : (() => {
                const q = teamSearch.toLowerCase()
                const filtered = teamUsers.filter(u => {
                  if (!q) return true
                  const orgN = orgs.find(o => o.id === u.organization_id)?.name || ''
                  return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || orgN.toLowerCase().includes(q)
                })
                if (filtered.length === 0) return <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '24px 0', fontSize: 13 }}>No team users found.</div>
                return filtered.map(u => {
                  const orgN = orgs.find(o => o.id === u.organization_id)?.name || '—'
                  const roleLabel = u.role === 'admin' ? 'Org Admin' : u.role === 'lab_user' ? 'Lab User' : 'Lab Manager'
                  const roleBg = u.role === 'admin' ? '#FEF3C7' : u.role === 'lab_user' ? '#EDE9FE' : '#E1F5EE'
                  const roleColor = u.role === 'admin' ? '#92400E' : u.role === 'lab_user' ? '#5B21B6' : '#065F46'
                  return (
                    <div key={u.id} className="card" style={{ padding: '10px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, opacity: u.is_active ? 1 : 0.55 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{u.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: roleBg, color: roleColor }}>{roleLabel}</span>
                          {!u.is_active && <span style={{ fontSize: 11, color: 'var(--accent2)', fontWeight: 500 }}>Inactive</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{u.email}</div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', flexShrink: 0, textAlign: 'right' }}>{orgN}</div>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── MODALS ── */}
      {userModal && (
        <UserModal
          user={userModal === 'add' ? null : userModal}
          orgs={orgs}
          defaultOrgId={addAdminOrgId || (isSuperAdmin ? orgFilter : myOrgId)}
          isSuperAdmin={isSuperAdmin}
          defaultRole={isSuperAdmin ? 'admin' : 'user'}
          onClose={() => { setUserModal(null); setAddAdminOrgId(null) }}
          onSaved={() => { loadUsers(); loadOrgs() }}
        />
      )}
      {orgModal && (
        <OrgModal
          org={orgModal === 'add' ? null : orgModal}
          onClose={() => setOrgModal(null)}
          onSaved={loadOrgs}
        />
      )}
      {accessModal && (
        <AccessModal
          user={accessModal}
          onClose={() => setAccessModal(null)}
          onSaved={loadUsers}
        />
      )}
      {orgModulesModal && (
        <OrgModulesModal
          org={orgModulesModal}
          onClose={() => setOrgModulesModal(null)}
          onSaved={loadOrgs}
        />
      )}
      {appModulesOpen && (
        <AppModulesModal onClose={() => setAppModulesOpen(false)} />
      )}
      {soloModulesOpen && (
        <SoloModulesModal onClose={() => setSoloModulesOpen(false)} />
      )}
      {feedbackModal && (
        <FeedbackResponsesModal org={feedbackModal} onClose={() => setFeedbackModal(null)} />
      )}
    </div>
  )
}

// ── Feedback Responses Modal ────────────────────────────────────────────────
const FEEDBACK_SCREEN_NAMES = {
  dashboard:     'Home Page',
  equipment:     'Equipment Inventory',
  equipmenthub:  'Equipment Hub',
  booking:       'Equipment Booking',
  training:      'Training Records',
  pm:            'Task Board',
  barcode:       'Material Scanner',
  barcodeqr:     'QR Labels',
  remessages:    'Messages',
  home:          'Inspection',
  history:       'Inspection History',
  projects:      'Projects',
  labmanagement: 'Lab Management',
}

function FeedbackResponsesModal({ org, onClose }) {
  const [responses, setResponses] = useState([])
  const [users, setUsers]         = useState({})
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('all')

  useEffect(() => { load() }, [org.id])

  async function load() {
    setLoading(true)
    const [{ data: resps }, { data: orgUsers }] = await Promise.all([
      sb.from('feedback_responses').select('*').eq('organization_id', org.id).order('created_at', { ascending: false }),
      sb.from('users').select('id, name, last_name, nick_name').eq('organization_id', org.id),
    ])
    const userMap = {}
    ;(orgUsers || []).forEach(u => { userMap[u.id] = u.nick_name?.trim() || [u.name, u.last_name].filter(Boolean).join(' ') || u.name })
    setUsers(userMap)
    setResponses(resps || [])
    setLoading(false)
  }

  async function exportCSV() {
    const rows = [['Module', 'User', 'Feedback', 'Date']]
    responses.forEach(r => {
      rows.push([
        FEEDBACK_SCREEN_NAMES[r.module_key] || r.module_key,
        users[r.user_id] || r.user_id,
        `"${(r.comment || '').replace(/"/g, '""')}"`,
        new Date(r.created_at).toLocaleDateString(),
      ])
    })
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `feedback-${org.name}-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const moduleKeys = Object.keys(FEEDBACK_SCREEN_NAMES)
  const filtered = filter === 'all' ? responses : responses.filter(r => r.module_key === filter)
  const countByModule = {}
  moduleKeys.forEach(k => { countByModule[k] = responses.filter(r => r.module_key === k).length })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 48px rgba(0,0,0,0.2)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>📋 Feedback Responses</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{org.name} · {responses.length} total response{responses.length !== 1 ? 's' : ''}</div>
          </div>
          <button onClick={exportCSV} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #d1fae5', background: '#f0fdf4', color: '#16a34a', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>⬇ CSV</button>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'var(--surface2)', cursor: 'pointer', fontSize: 18, color: 'var(--text2)' }}>×</button>
        </div>

        {/* Module filter pills */}
        <div style={{ padding: '12px 20px 8px', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {[{ key: 'all', label: `All (${responses.length})` }, ...moduleKeys.map(k => ({ key: k, label: `${FEEDBACK_SCREEN_NAMES[k]} (${countByModule[k]})` }))].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, border: `1.5px solid ${filter === f.key ? '#f59e0b' : 'var(--border)'}`, background: filter === f.key ? '#fef3c7' : 'var(--surface)', color: filter === f.key ? '#d97706' : 'var(--text2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Response list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 14 }}>No feedback yet for this module.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((r, i) => (
                <div key={r.id} style={{ background: i % 2 === 0 ? '#fafaf9' : '#fff', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#d97706', background: '#fef3c7', borderRadius: 99, padding: '2px 10px' }}>
                        {FEEDBACK_SCREEN_NAMES[r.module_key] || r.module_key}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>
                        {users[r.user_id] || 'Unknown user'}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{r.comment || <em style={{ color: 'var(--text3)' }}>No comment</em>}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
