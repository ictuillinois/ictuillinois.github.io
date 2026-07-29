import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'

// ICT-Lab modules
export const ALL_MODULES_META = [
  // ── Staff-only (admin / lab manager) ──────────────────────────────────
  { key: 'training',      screen: 'training',      label: 'Training Records',  sub: 'Certs, equipment & alarm training',  icon: '🎓', bg: '#e0f2fe', color: '#0369a1', roles: ['team'], staffOnly: true },
  { key: 'labmanagement', screen: 'labmanagement', label: 'Lab Management',    sub: 'Users & lab managers',               icon: '👥', bg: '#E1F5EE', color: '#1D9E75', roles: ['team'], staffOnly: true },
  { key: 'pm',            screen: 'pm',            label: 'Task Board',        sub: 'Tasks, meetings & deadlines',        icon: '📋', bg: '#fff3e0', color: '#ff6b00', roles: ['team'], staffOnly: true },
  { key: 'equipment',     screen: 'equipment',     label: 'Equipment List',    sub: 'Lab equipment inventory tracking',   icon: '🔧', bg: '#fef3c7', color: '#92400e', roles: ['team'], staffOnly: true },
  { key: 'equipmenthub',  screen: 'equipmenthub',  label: 'Equipment Hub',     sub: 'SOPs, videos & standards',           icon: '📚', bg: '#E1F5EE', color: '#085041', roles: ['team'], staffOnly: true },
  { key: 'supply',        screen: 'home',          label: 'Supply Inventory',  sub: 'Weekly inspection & export',         icon: '📦', bg: '#E1F5EE', color: '#1D9E75', roles: ['team'], staffOnly: true },
  // ── All users ──────────────────────────────────────────────────────────
  { key: 'projects',  screen: 'projects',  label: 'Project Workspace', sub: 'Material inventory & workspace',  icon: '🧪', bg: '#EEEDFE', color: '#534AB7', roles: ['team'] },
  { key: 'booking',   screen: 'booking',   label: 'Reserve Equipment', sub: 'Reserve lab equipment',           icon: '📅', bg: '#e0f2fe', color: '#0369a1', roles: ['team'] },
  { key: 'barcode',   screen: 'barcode',   label: 'QR Scan',           sub: 'Scan & look up lab materials',    icon: '📷', bg: '#e0f7fa', color: '#00796b', roles: ['team'] },
  { key: 'barcodeqr', screen: 'barcodeqr', label: 'QR Labels',         sub: 'Generate & print QR codes',       icon: '🔲', bg: '#f0f4ff', color: '#1a56db', roles: ['team'], studentLocked: true },
  { key: 'remessages', screen: 'remessages', label: 'Lab Messages',    sub: 'Internal chat between lab managers & admin', icon: '💬', bg: '#E1F5EE', color: '#1D9E75', roles: ['team'], staffOnly: true },
  { key: 'mileage',   screen: null,        label: 'Mileage Form',      sub: 'Submit mileage reimbursement',    icon: '🚗', bg: '#fdf0ed', color: '#c84b2f', roles: ['team'], external: true },
  { key: 'labsafety', screen: 'labsafety', label: 'Lab Safety',        sub: 'Safety steps & certification',    icon: '🦺', bg: '#fef3c7', color: '#92400e', roles: ['team'] },
  { key: 'profile',   screen: 'profile',   label: 'Profile',           sub: 'Your info & settings',            icon: '👤', bg: '#EEEDFE', color: '#534AB7', roles: ['team'] },
]

export const PINNED_MODULES = ['profile']
export const STAFF_PINNED_MODULES = []

function ModuleToggleCard({ module, selected, onToggle, pinned, alwaysOn, restricted, soloLocked }) {
  if (restricted) {
    return (
      <div
        style={{
          borderRadius: 12,
          border: '2px solid var(--border)',
          background: 'var(--surface2)',
          padding: '14px 14px 12px',
          cursor: 'default',
          position: 'relative',
          opacity: 0.55,
          userSelect: 'none',
          filter: 'grayscale(0.6)',
        }}
      >
        <div style={{ position: 'absolute', top: 9, right: 9, width: 20, height: 20, borderRadius: '50%', background: 'var(--surface2)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, pointerEvents: 'none' }}>
          🔒
        </div>
        <div style={{ fontSize: 26, marginBottom: 8, pointerEvents: 'none' }}>{module.icon}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2, paddingRight: 20, pointerEvents: 'none' }}>{module.label}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4, pointerEvents: 'none' }}>{module.sub}</div>
        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text3)', fontWeight: 600, pointerEvents: 'none' }}>{soloLocked ? 'Team accounts only' : 'For lab managers only'}</div>
      </div>
    )
  }
  return (
    <div
      onClick={() => !pinned && onToggle(module.key)}
      style={{
        borderRadius: 12,
        border: selected ? `2px solid ${module.color}` : '2px solid var(--border)',
        background: selected ? `${module.color}12` : 'var(--surface)',
        padding: '14px 14px 12px',
        cursor: pinned ? 'default' : 'pointer',
        position: 'relative',
        transition: 'all 0.15s',
        opacity: pinned ? 0.7 : 1,
        userSelect: 'none',
      }}
    >
      <div style={{ position: 'absolute', top: 9, right: 9, width: 20, height: 20, borderRadius: '50%', background: selected ? module.color : 'var(--surface2)', border: `2px solid ${selected ? module.color : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', pointerEvents: 'none' }}>
        {selected && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div style={{ fontSize: 26, marginBottom: 8, pointerEvents: 'none' }}>{module.icon}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: selected ? module.color : 'var(--text)', marginBottom: 2, paddingRight: 20, pointerEvents: 'none' }}>{module.label}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4, pointerEvents: 'none' }}>{module.sub}</div>
      {(pinned || alwaysOn) && <div style={{ marginTop: 6, fontSize: 10, color: module.color, fontWeight: 600, pointerEvents: 'none' }}>Always visible</div>}
    </div>
  )
}

export default function DashboardIconPicker({ session, loginMode, onDone }) {
  const { setActiveModules } = useAppStore()
  const isStaff = session?.role === 'admin' || session?.role === 'user'
  // uiPinnedKeys: grayed out AND non-draggable (profile only)
  const uiPinnedKeys = PINNED_MODULES
  // alwaysOnKeys: cannot be toggled off, but ARE draggable (labmanagement for staff)
  const alwaysOnKeys = isStaff ? [...PINNED_MODULES, ...STAFF_PINNED_MODULES] : PINNED_MODULES
  const pinnedKeys = alwaysOnKeys // keep for backward compat with selectNone/toggle gate
  const baseAvailable = ALL_MODULES_META.filter(m => (!m.hideForStaff || !isStaff) && (!m.staffOnly || isStaff))
  const [available, setAvailable] = useState(baseAvailable)
  const [selected, setSelected] = useState(null)
  const [displayOrder, setDisplayOrder] = useState(null)
  const [dragKey, setDragKey] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)
  const dragKeyRef = useRef(null)
  const [allowedPool, setAllowedPool] = useState(null)
  const [restrictedKeys, setRestrictedKeys] = useState(() => {
    if (isStaff) return new Set()
    const locked = ALL_MODULES_META.filter(m => m.adminOnly || m.studentLocked).map(m => m.key)
    return new Set(locked)
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadSaved() }, [])

  async function loadSaved() {
    try {
      let savedModules = null
      let pool = null
      // All users see all non-hideForStaff modules; adminOnly ones are locked for non-admins
      let localAvailable = ALL_MODULES_META.filter(m => (!m.hideForStaff || !isStaff) && (!m.staffOnly || isStaff))
      let localRestricted = new Set(isStaff ? [] : ALL_MODULES_META.filter(m => m.adminOnly || m.studentLocked).map(m => m.key))
      if (loginMode === 'solo') {
        ALL_MODULES_META.filter(m => m.soloLocked).forEach(m => localRestricted.add(m.key))
      }

      if (loginMode === 'solo' && session?.userId) {
        const [soloRes, soloSettingsRes] = await Promise.all([
          sb.from('solo_users').select('active_modules').eq('id', session.userId).maybeSingle(),
          sb.from('settings').select('value').eq('key', 'solo_allowed_modules').maybeSingle(),
        ])
        savedModules = soloRes.data?.active_modules
        let soloPool = null
        try { soloPool = soloSettingsRes?.data?.value ? JSON.parse(soloSettingsRes.data.value) : null } catch { soloPool = null }
        if (soloPool !== null) {
          localAvailable = localAvailable.filter(m => soloPool.includes(m.key) || m.key === 'profile' || m.soloLocked)
        }
        // Always ensure soloLocked modules appear in the picker so solo users can see
        // that these features exist (shown grayed with "Team accounts only" label).
        ALL_MODULES_META.filter(m => m.soloLocked).forEach(m => {
          if (!localAvailable.find(a => a.key === m.key)) localAvailable = [...localAvailable, m]
        })
      } else if (session?.userId) {
        const queries = [
          sb.from('user_dashboard_prefs').select('active_modules, allowed_modules').eq('user_id', session.userId).order('created_at', { ascending: false }).limit(1),
        ]
        // For staff and students: also load which screens admin has granted them
        if (session?.role === 'user' || session?.role === 'lab_user') {
          queries.push(sb.from('user_screen_access').select('screen_key').eq('user_id', session.userId))
        }
        // Always fetch org-level allowed modules and global app pool in parallel
        queries.push(
          session?.organizationId
            ? sb.from('organizations').select('allowed_modules').eq('id', session.organizationId).maybeSingle()
            : Promise.resolve(null)
        )
        queries.push(
          sb.from('settings').select('value').eq('key', 'app_allowed_modules').maybeSingle()
        )
        const results = await Promise.all(queries)
        const prefsRes = results[0]
        const accessRes = (session?.role === 'user' || session?.role === 'lab_user') ? results[1] : null
        const orgRes = results[results.length - 2]
        const appRes = results[results.length - 1]

        savedModules = prefsRes.data?.[0]?.active_modules

        // Global app pool (super admin master list)
        let appPool = null
        try { appPool = appRes?.data?.value ? JSON.parse(appRes.data.value) : null } catch { appPool = null }

        // Org-level pool (super admin per-org setting)
        const orgPool = orgRes?.data?.allowed_modules || null

        // Combine: global pool first, then org pool further restricts
        // Org pool overrides global pool; global is the default when no org pool is set
        const effectivePool = orgPool ?? appPool

        if (effectivePool !== null) {
          localAvailable = localAvailable.filter(m => effectivePool.includes(m.key) || m.key === 'profile' || (isStaff && m.staffOnly))
        }

        if (session?.role === 'lab_user') {
          pool = prefsRes.data?.[0]?.allowed_modules || []
          setAllowedPool(pool)
          // Unlock studentLocked modules explicitly granted by admin via screen access
          if (accessRes?.data?.length) {
            const grantedScreens = new Set(accessRes.data.map(r => r.screen_key))
            ALL_MODULES_META.filter(m => m.studentLocked && m.screen && grantedScreens.has(m.screen))
              .forEach(m => localRestricted.delete(m.key))
          }
          // Also unlock studentLocked modules included in the admin-assigned allowed pool
          ALL_MODULES_META.filter(m => m.studentLocked && pool.includes(m.key))
            .forEach(m => localRestricted.delete(m.key))
        } else if (session?.role === 'user') {
          // Lab managers: adminOnly modules restricted unless explicitly granted; studentLocked modules are free
          const accessKeys = new Set((accessRes?.data || []).map(r => r.screen_key))
          localRestricted = new Set(ALL_MODULES_META.filter(m => m.adminOnly && !m.studentLocked && !accessKeys.has(m.screen)).map(m => m.key))
        }
        // admin (role === 'admin'): localRestricted stays empty
      } else {
        // admin (no userId)
        const saved = localStorage.getItem('ictlab_admin_modules')
        savedModules = saved ? JSON.parse(saved) : null
      }

      setAvailable(localAvailable)
      setRestrictedKeys(localRestricted)

      const displayable = pool !== null
        ? localAvailable.filter(m => pool.includes(m.key))
        : localAvailable
      const selectable = displayable.filter(m => !localRestricted.has(m.key))
      const allDisplayKeys = displayable.map(m => m.key)

      let newSelected
      if (savedModules?.length) {
        newSelected = new Set(savedModules.filter(k => selectable.some(m => m.key === k)))
        // Order: saved keys first (in their saved order), then any new display keys appended
        const ordered = [
          ...savedModules.filter(k => allDisplayKeys.includes(k)),
          ...allDisplayKeys.filter(k => !savedModules.includes(k)),
        ]
        setDisplayOrder(ordered)
      } else {
        newSelected = new Set(selectable.map(m => m.key))
        setDisplayOrder(allDisplayKeys)
      }
      setSelected(newSelected)
    } catch (e) {
      setSelected(new Set(baseAvailable.filter(m => !restrictedKeys.has(m.key)).map(m => m.key)))
      setDisplayOrder(baseAvailable.map(m => m.key))
    }
  }

  function toggle(key) {
    if (pinnedKeys.includes(key) || restrictedKeys.has(key)) return
    setSelected(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  function selectAll() { setSelected(new Set(displayModules.filter(m => !restrictedKeys.has(m.key)).map(m => m.key))) }
  function selectNone() { setSelected(new Set(pinnedKeys)) }

  async function save() {
    if (!selected) return
    setSaving(true)
    const order = displayOrder || Array.from(selected)
    const modules = order.filter(k => selected.has(k) && !restrictedKeys.has(k))
    try {
      if (loginMode === 'solo' && session?.userId) {
        await sb.from('solo_users').update({ active_modules: modules, has_set_dashboard: true }).eq('id', session.userId)
      } else if (session?.userId) {
        const { data: updated } = await sb.from('user_dashboard_prefs')
          .update({ active_modules: modules, has_set_dashboard: true })
          .eq('user_id', session.userId)
          .select('id')
        if (!updated?.length) {
          await sb.from('user_dashboard_prefs')
            .insert({ user_id: session.userId, active_modules: modules, has_set_dashboard: true })
        }
      } else {
        localStorage.setItem('ictlab_admin_modules', JSON.stringify(modules))
        localStorage.setItem('ictlab_admin_dashboard_set', 'true')
      }
    } catch (e) { console.error('Failed to save dashboard prefs:', e) }
    setActiveModules(modules)
    setSaving(false)
    onDone(modules)
  }

  if (selected === null) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )

  // Student with no pool set yet
  if (session?.role === 'lab_user' && allowedPool !== null && allowedPool.length === 0) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '40px 32px', maxWidth: 400, textAlign: 'center', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>No icons assigned yet</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 20 }}>Your lab manager hasn't assigned any dashboard icons for you yet. Contact them to get access.</div>
        <button className="btn" onClick={() => onDone([])}>Close</button>
      </div>
    </div>
  )

  const baseDisplay = allowedPool !== null
    ? available.filter(m => allowedPool.includes(m.key))
    : available

  // Apply drag order if set, otherwise fall back to default
  const displayModules = displayOrder !== null
    ? displayOrder.map(k => baseDisplay.find(m => m.key === k)).filter(Boolean)
    : baseDisplay

  const selectableModules = displayModules.filter(m => !restrictedKeys.has(m.key))
  const selectedCount = selected.size

  function handleDragStart(e, key) {
    dragKeyRef.current = key
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', key)
    setDragKey(key)
  }
  function handleDragOver(e, key) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverKey(key) }
  function handleDrop(e, targetKey) {
    e.preventDefault()
    const sourceKey = dragKeyRef.current
    if (!sourceKey || sourceKey === targetKey) { setDragKey(null); setDragOverKey(null); return }
    setDisplayOrder(order => {
      const from = order.indexOf(sourceKey)
      const to = order.indexOf(targetKey)
      if (from === -1 || to === -1) return order
      const next = [...order]
      next.splice(from, 1)
      next.splice(to, 0, sourceKey)
      return next
    })
    dragKeyRef.current = null
    setDragKey(null)
    setDragOverKey(null)
  }
  function handleDragEnd() { dragKeyRef.current = null; setDragKey(null); setDragOverKey(null) }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onDone(null) }}
    >
      <div style={{ background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: loginMode === 'solo' ? '#EEEDFE' : '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>⊞</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 19, color: 'var(--text)' }}>Customize your dashboard</div>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>
                {session?.role === 'lab_user'
                  ? 'Pick from the icons your lab manager has made available for you'
                  : 'Pick the shortcuts you want on your home screen'}
              </div>
            </div>
            <button onClick={() => onDone(null)} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)', padding: '4px 8px', borderRadius: 8, lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 99, margin: '16px 0 0', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, selectableModules.length ? (selectedCount / selectableModules.length) * 100 : 0)}%`, background: loginMode === 'solo' ? '#534AB7' : '#1D9E75', borderRadius: 99, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{selectedCount}</span> of {selectableModules.length} selected
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={selectAll} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, padding: '2px 0' }}>Select all</button>
              <span style={{ color: 'var(--border)' }}>·</span>
              <button onClick={selectNone} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontWeight: 500, padding: '2px 0' }}>Clear</button>
            </div>
          </div>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 28px', flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            💡 Drag cards to reorder icons on your home screen
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 10, paddingBottom: 20 }}>
            {displayModules.filter(m => !(loginMode === 'solo' && m.soloLocked)).map(m => {
              const isDragging = dragKey === m.key
              const isOver = dragOverKey === m.key && dragKey !== m.key
              const canDrag = !restrictedKeys.has(m.key) && !uiPinnedKeys.includes(m.key)
              return (
                <div
                  key={m.key}
                  draggable={canDrag}
                  onDragStart={e => canDrag && handleDragStart(e, m.key)}
                  onDragOver={e => handleDragOver(e, m.key)}
                  onDrop={e => handleDrop(e, m.key)}
                  onDragEnd={handleDragEnd}
                  style={{ opacity: isDragging ? 0.35 : 1, outline: isOver ? `2px dashed ${loginMode === 'solo' ? '#534AB7' : '#1D9E75'}` : 'none', borderRadius: 12, transition: 'opacity 0.15s' }}
                >
                  <ModuleToggleCard module={m} selected={selected.has(m.key)} onToggle={toggle} pinned={uiPinnedKeys.includes(m.key)} alwaysOn={!uiPinnedKeys.includes(m.key) && alwaysOnKeys.includes(m.key)} restricted={restrictedKeys.has(m.key)} soloLocked={false} />
                </div>
              )
            })}
            {loginMode === 'solo' && ALL_MODULES_META.filter(m => m.soloLocked).map(m => (
              <div key={m.key}>
                <ModuleToggleCard module={m} selected={false} onToggle={() => {}} pinned={false} alwaysOn={false} restricted={true} soloLocked={true} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '16px 28px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--surface)' }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
            You can change this anytime from <strong>Profile → Dashboard Icons</strong>.
          </div>
          <button onClick={save} disabled={saving || selectedCount === 0}
            style={{ padding: '10px 28px', background: loginMode === 'solo' ? '#534AB7' : '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: (saving || selectedCount === 0) ? 'not-allowed' : 'pointer', opacity: (saving || selectedCount === 0) ? 0.6 : 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {saving ? 'Saving…' : 'Save & apply →'}
          </button>
        </div>
      </div>
    </div>
  )
}
