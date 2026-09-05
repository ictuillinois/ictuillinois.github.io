import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { sb } from '../lib/supabase'
import NotificationBell from './NotificationBell'
import SuperAdminBell from './SuperAdminBell'
import { ALL_MODULES_META } from './DashboardIconPicker'
import AboutModal from './AboutModal'
import CustomerServiceModal from './CustomerServiceModal'
import SaraChat from './SaraChat'
import FeedbackWidget from './FeedbackWidget'
import OnboardingTour, { ModuleTip, HelpTourButton } from './OnboardingTour'

function ExternalLinkModal({ url, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '28px 28px 20px', maxWidth: 380, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, color: 'var(--text)' }}>Opening external link</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 16 }}>You are being redirected to an external website:<br /><span style={{ color: '#0369a1', wordBreak: 'break-all' }}>{url}</span></div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Open ↗</button>
        </div>
      </div>
    </div>
  )
}

export function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

// ── Mobile bottom nav tabs ──────────────────────────────────────
const NAV_TABS = [
  { id: 'home',     icon: '🏠', label: 'Home',     screens: ['dashboard'] },
  { id: 'supply',   icon: '📦', label: 'Supply',   screens: ['home', 'inspection', 'results', 'history'] },
  { id: 'projects', icon: '🧪', label: 'Projects', screens: ['projects', 'project-detail'] },
  { id: 'booking',  icon: '📅', label: 'Booking',  screens: ['booking'] },
  { id: 'profile',  icon: '👤', label: 'Profile',  screens: ['profile'] },
]

// ── Module icon/label lookup for sidebar ───────────────────────
const MODULE_META = {
  home:             { icon: '🔍', label: 'Inspections' },
  inspection:       { icon: '🔍', label: 'Inspections' },
  results:          { icon: '🔍', label: 'Inspections' },
  history:          { icon: '🔍', label: 'Inspections' },
  equipment:        { icon: '🔧', label: 'Equipment & Maintenance' },
  equipmenthub:     { icon: '📖', label: 'Equipment SOP' },
  equipmentscan:    { icon: '📷', label: 'Equipment Scan' },
  booking:          { icon: '📅', label: 'Booking' },
  training:         { icon: '📚', label: 'Training Records' },
  projects:         { icon: '🧪', label: 'Project & Material' },
  'project-detail': { icon: '🧪', label: 'Project & Material' },
  pm:               { icon: '📋', label: 'Task Board' },
  barcodeqr:        { icon: '🔲', label: 'QR Labels' },
  barcode:          { icon: '📷', label: 'Barcode Scanner' },
  labmanagement:    { icon: '⚙️', label: 'Lab Management' },
  orgadmin:         { icon: '🔑', label: 'Admin Panel' },
  profile:          { icon: '👤', label: 'Profile' },
}

// ── Sidebar sub-tab definitions per screen ─────────────────────
function getScreenTabs(screen, session) {
  const isSolo    = session?.loginMode === 'solo'
  const isAdmin   = session?.role === 'admin' || session?.userId === null
  const isStaff   = session?.role === 'user'

  if (screen === 'training') return [
    { key: 'safety',    icon: '🦺', label: 'Safety' },
    { key: 'fresh',     icon: '📄', label: 'Lab User Documents' },
    ...(!isSolo ? [{ key: 'golf',  icon: '🚗', label: 'Vehicle' }] : []),
    { key: 'equipment', icon: '🔧', label: 'Equipment' },
    ...(!isSolo ? [{ key: 'alarm', icon: '🔔', label: 'Building Alarm' }] : []),
    ...(!isSolo ? [{ key: 'locker', icon: '🗄️', label: 'Lab User Locker' }] : []),
    ...(!isSolo ? [{ key: 'exam',   icon: '📝', label: 'Exam' }] : []),
  ]

  if (screen === 'labmanagement') return [
    { key: 'students',  icon: '👥', label: 'Lab Users' },
    { key: 'staff',     icon: '👨‍💼', label: 'Lab Managers' },
    { key: 'approvals', icon: '📋', label: 'Approval Requests' },
    { key: 'guide',     icon: '📖', label: 'Lab Manager Guide' },
  ]

  if (screen === 'booking') return [
    { key: 'calendar', icon: '📅', label: 'Book Equipment' },
    { key: 'history',  icon: '📋', label: 'History & Usage' },
    ...((isAdmin || isStaff) ? [{ key: 'eq_notes', icon: '⚠️', label: 'Special Treatment' }] : []),
    ...(isAdmin ? [{ key: 'settings', icon: '⚙️', label: 'Settings' }] : []),
  ]

  if (screen === 'equipment') return [
    { key: 'list',        icon: '📋', label: 'List of Equipment' },
    ...((isAdmin || isStaff) ? [
      { key: 'records',     icon: '📊', label: 'Maintenance Records' },
    ] : []),
    { key: 'settings',    icon: '⚙️', label: 'Settings' },
  ]

  if (screen === 'projects') {
    return [
      { key: 'inventory', icon: '📦', label: 'Material Inventory' },
    ]
  }

  if (screen === 'pm') return [
    { key: 'overview',  icon: '📊', label: 'Overview' },
    { key: 'tasks',     icon: '✅', label: 'My Tasks' },
    ...(!isSolo ? [{ key: 'team', icon: '👥', label: 'Team' }] : []),
    { key: 'calendar',  icon: '📅', label: 'Calendar' },
    ...(!isSolo ? [{ key: 'meetings', icon: '🤝', label: 'Meetings' }] : []),
    { key: 'reminder',  icon: '⏰', label: 'Reminders' },
    ...(isAdmin ? [{ key: 'assign', icon: '📌', label: 'Assign Others' }] : []),
  ]

  if (screen === 'barcodeqr') return [
    { key: 'equipment', icon: '🔲', label: 'Equipment Barcode' },
    { key: 'records',   icon: '📋', label: 'Records' },
  ]

  if (screen === 'home') {
    const canManage = session?.role === 'admin' || session?.role === 'user' || session?.loginMode === 'solo'
    return [
      { key: 'inspect',  icon: '🔍', label: 'Inspection' },
      { key: 'export',   icon: '📊', label: 'Export Data' },
      ...(canManage ? [
        { key: 'rooms',    icon: '🏠', label: 'Rooms' },
        { key: 'supplies', icon: '📦', label: 'Supplies' },
        { key: 'import',   icon: '📥', label: 'Import' },
        { key: 'settings', icon: '⚙️', label: 'Settings' },
      ] : []),
    ]
  }

  if (screen === 'profile') {
    if (session?.userId === null) return [
      { key: 'admin',   icon: '🔑', label: 'Admin Settings' },
      { key: 'storage', icon: '🗄️', label: 'Storage' },
    ] // super admin
    if (session?.loginMode === 'solo') return [
      { key: 'info',          icon: '👤', label: 'My Info' },
      { key: 'teammates',     icon: '👥', label: 'Teammates' },
      { key: 'dashboard',     icon: '🎛️', label: 'Dashboard Icons' },
      { key: 'notifications', icon: '🔔', label: 'Notifications' },
      { key: 'password',      icon: '🔑', label: 'Password' },
      { key: 'danger',        icon: '⚠️', label: 'Delete Account' },
    ]
    if (session?.role === 'admin') return [
      { key: 'admin',     icon: '🔑', label: 'Admin Settings' },
      { key: 'icons',     icon: '🖼️', label: 'Icon Images' },
      { key: 'dashboard', icon: '🎛️', label: 'Dashboard Icons' },
      { key: 'notifs',    icon: '🔔', label: 'Notifications' },
      { key: 'org',       icon: '🏢', label: 'Organization' },
      { key: 'storage',   icon: '🗄️', label: 'Storage' },
    ]
    return [
      { key: 'info',      icon: '👤', label: 'My Info' },
      { key: 'password',  icon: '🔑', label: 'Password' },
      { key: 'dashboard', icon: '🎛️', label: 'Dashboard Icons' },
      { key: 'notifs',    icon: '🔔', label: 'Notifications' },
      { key: 'team',      icon: '🤝', label: 'Project Team' },
      { key: 'danger',    icon: '⚠️', label: 'Delete Account' },
    ]
  }

  return null
}

// ── Screens that use the full viewport (no sidebar layout wrapper needed) ──
const PROTO_SCREENS = new Set(['layout-proto', 'training-proto'])

function IctLabLogo({ height = 40 }) {
  return <img src={import.meta.env.BASE_URL + 'ict-logo.png'} style={{ display: 'block', height, width: 'auto', objectFit: 'contain' }} alt="ICT-Lab" />
}

// ── Sidebar ────────────────────────────────────────────────────
function Sidebar({ session, screen, activeModules, sidebarSubTab, setSidebarSubTab, setScreen, accentColor, accentLight, forceExpanded = false, safetyLocked = false }) {
  const isDash      = screen === 'dashboard'
  // Screens that portal a list (equipment, projects…) into the sidebar —
  // hide the Apps section there so the list gets full height; Home stays.
  const hasPortal   = ['projects', 'barcodeqr', 'equipment', 'equipmenthub', 'booking'].includes(screen)
  const tabs        = getScreenTabs(screen, session)
  const mod         = MODULE_META[screen]
  const activeTab   = sidebarSubTab || (tabs?.[0]?.key ?? null)
  const loginMode   = session?.loginMode || 'team'
  const roleKey     = loginMode === 'solo' ? 'solo' : 'team'
  const isStaff     = session?.role === 'admin' || session?.role === 'user'

  // External URL state for mileage / labsafety links
  const [extUrls, setExtUrls]       = useState({})
  const [extConfirm, setExtConfirm] = useState(null)
  const [soloPool, setSoloPool]     = useState(null)

  // Training sidebar badges — red dot when there are pending items
  const [trainingBadges, setTrainingBadges] = useState({})
  useEffect(() => {
    if (screen !== 'training' || !session?.userId) { setTrainingBadges({}); return }
    const isManager = session?.role === 'admin' || session?.role === 'user'
    const orgId = session?.organizationId
    if (isManager) {
      Promise.all([
        sb.from('retraining_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('organization_id', orgId),
        sb.from('training_fresh').select('id', { count: 'exact', head: true }).eq('admin_approved', false).not('certificate_url', 'is', null),
      ]).then(([{ count: eqCount }, { count: freshCount }]) => {
        setTrainingBadges({ equipment: eqCount || 0, fresh: freshCount || 0 })
      }).catch(() => {})
    } else {
      Promise.all([
        sb.from('retraining_requests').select('id', { count: 'exact', head: true }).eq('user_id', session.userId).eq('status', 'pending'),
        sb.from('training_schedule').select('id', { count: 'exact', head: true }).eq('user_id', session.userId).eq('status', 'proposed'),
        sb.from('training_fresh').select('id', { count: 'exact', head: true }).eq('user_id', session.userId).eq('admin_approved', false).not('certificate_url', 'is', null),
      ]).then(([{ count: reqCount }, { count: schedCount }, { count: freshCount }]) => {
        setTrainingBadges({ equipment: (reqCount || 0) + (schedCount || 0), fresh: freshCount || 0 })
      }).catch(() => {})
    }
  }, [screen, session?.userId, session?.role, session?.organizationId])

  useEffect(() => {
    const keys = ['mileage_url', 'labsafety_url']
    if (loginMode === 'solo') keys.push('solo_allowed_modules')
    sb.from('settings').select('key, value').in('key', keys)
      .then(({ data }) => {
        const map = {}
        data?.forEach(r => { map[r.key] = r.value })
        setExtUrls(map)
        if (loginMode === 'solo' && map.solo_allowed_modules) {
          try { setSoloPool(JSON.parse(map.solo_allowed_modules)) } catch {}
        }
      })
  }, [loginMode])

  // Navigable modules — same role-based filter as dashboard getModules,
  // but also includes external modules (mileage, labsafety) for the full icon count.
  const navigable = ALL_MODULES_META.filter(m => {
    if (!m.screen && !m.external) return false
    if (!m.roles || !m.roles.includes(roleKey)) return false
    if (m.soloLocked && loginMode === 'solo') return false
    if (m.staffOnly && !isStaff) return false
    if (loginMode === 'solo' && soloPool !== null && !m.external && !soloPool.includes(m.key) && m.key !== 'profile') return false
    return true
  })
  const visibleMeta = activeModules
    ? (() => {
        const inActive = activeModules.map(key => navigable.find(m => m.key === key)).filter(Boolean)
        if (!isStaff) return inActive
        const activeSet = new Set(activeModules)
        const extras = navigable.filter(m => m.staffOnly && !activeSet.has(m.key))
        return [...inActive, ...extras]
      })()
    : navigable

  const handleModuleClick = (m) => {
    if (m.external) {
      const url = m.key === 'mileage' ? extUrls.mileage_url : extUrls.labsafety_url
      if (url) setExtConfirm(url)
    } else {
      setScreen(m.screen)
    }
  }

  // Collapse state for the Modules section — persisted in localStorage
  const [modulesOpen, setModulesOpen] = useState(
    () => localStorage.getItem('ictlab_sidebar_modules_open') !== 'false'
  )
  const toggleModules = () => setModulesOpen(prev => {
    const next = !prev
    localStorage.setItem('ictlab_sidebar_modules_open', String(next))
    return next
  })

  // Icon-only collapsed sidebar — persisted in localStorage.
  // forceExpanded (mobile drawer) always shows the full sidebar and makes the
  // collapse toggle a no-op so it can't desync the desktop preference.
  const [sidebarIconOnly, setSidebarIconOnly] = useState(
    () => localStorage.getItem('ictlab_sidebar_icon_only') === 'true'
  )
  const iconOnly = forceExpanded ? false : sidebarIconOnly
  const toggleIconOnly = (val) => {
    if (forceExpanded) return
    setSidebarIconOnly(val)
    localStorage.setItem('ictlab_sidebar_icon_only', String(val))
  }

  const AppsBadge = () => (
    <button
      onClick={() => toggleIconOnly(true)}
      title="Collapse to icon view"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `linear-gradient(135deg, ${accentColor}, ${accentColor}bb)`, padding: '4px 8px 4px 8px', borderRadius: 7, boxShadow: `0 2px 10px ${accentColor}44`, border: 'none', cursor: 'pointer', transition: 'filter 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.12)'}
      onMouseLeave={e => e.currentTarget.style.filter = 'none'}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Apps</span>
    </button>
  )

  const AppsIconBtn = () => (
    <button
      onClick={() => toggleIconOnly(false)}
      title="Expand sidebar"
      style={{ width: 38, height: 38, borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${accentColor}, ${accentColor}bb)`, boxShadow: `0 2px 10px ${accentColor}44`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'filter 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'}
      onMouseLeave={e => e.currentTarget.style.filter = 'none'}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    </button>
  )

  const iconBtn = (onClick, title, content, isActive = false) => (
    <button
      title={title}
      onClick={onClick}
      style={{ width: 38, height: 38, borderRadius: 10, border: isActive ? `1.5px solid ${accentColor}` : '1.5px solid transparent', background: isActive ? accentLight : 'transparent', color: isActive ? accentColor : 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0, transition: 'background 0.13s' }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface2)' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
    >
      {content}
    </button>
  )

  return (
    <>
    <aside style={{
      width: iconOnly ? 56 : 220,
      flexShrink: 0, background: '#fff',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
    }}>

      {/* ── Icon-only rail (collapsed) ── */}
      {iconOnly ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 4px', flex: 1, overflowY: 'auto' }}>
            {AppsIconBtn()}
            <div style={{ width: 28, height: 1, background: 'var(--border)', margin: '4px 0', flexShrink: 0 }} />
            {/* Sub-tabs (module page only) */}
            {!isDash && tabs && tabs.map(t =>
              iconBtn(() => setSidebarSubTab(t.key), t.label, t.icon, activeTab === t.key)
            )}
            {!isDash && tabs && visibleMeta.length > 0 && (
              <div style={{ width: 28, height: 1, background: 'var(--border)', margin: '4px 0', flexShrink: 0 }} />
            )}
            {/* All app icons */}
            {visibleMeta.map(m => {
              const isCurrent = !isDash && !m.external && (m.screen === screen ||
                (m.key === 'supply'       && ['inspection', 'results', 'history'].includes(screen)) ||
                (m.key === 'projects'     && screen === 'project-detail') ||
                (m.key === 'equipmenthub' && screen === 'equipmentscan'))
              const locked = safetyLocked && m.key !== 'profile'
              if (locked) return (
                <button key={m.key} title={`${m.label} (locked)`}
                  style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid transparent', background: 'transparent', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0, opacity: 0.35, filter: 'grayscale(0.8)' }}>
                  {m.icon}
                </button>
              )
              return iconBtn(() => handleModuleClick(m), m.label, m.icon, isCurrent)
            })}
          </div>
          {/* Home icon pinned at bottom */}
          {!isDash && (
            <div style={{ padding: '8px 4px', borderTop: '1px solid #f3f4f6', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
              {iconBtn(() => setScreen('dashboard'), 'Home', '🏠', false)}
            </div>
          )}
        </>
      ) : isDash ? (
        /* ── Dashboard expanded: Apps header + module list ── */
        <>
          <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #f3f4f6' }}>
            {AppsBadge()}
          </div>
          {safetyLocked && (
            <div style={{ margin: '6px 8px 2px', padding: '8px 10px', background: '#fff8f0', border: '1px solid #fde68a', borderRadius: 8, fontSize: 11, color: '#92400e', lineHeight: 1.5 }}>
              🔒 Complete safety training to unlock all modules
            </div>
          )}
          <nav style={{ flex: 1, padding: '8px', overflowY: 'auto' }}>
            {visibleMeta.map(m => {
              const locked = safetyLocked && m.key !== 'profile'
              return (
                <button key={m.key} className="sidebar-item"
                  onClick={locked ? undefined : () => handleModuleClick(m)}
                  style={locked ? { opacity: 0.4, cursor: 'not-allowed', filter: 'grayscale(0.7)', pointerEvents: 'none' } : {}}>
                  <span style={{ fontSize: 16, width: 22, textAlign: 'center', flexShrink: 0 }}>{m.icon}</span>
                  <span style={{ flex: 1 }}>{m.label}</span>
                  {locked
                    ? <span style={{ fontSize: 11 }}>🔒</span>
                    : m.external
                      ? <span style={{ fontSize: 10, color: 'var(--text3)' }}>↗</span>
                      : <span style={{ fontSize: 12, color: 'var(--text3)' }}>›</span>}
                </button>
              )
            })}
          </nav>
          <div style={{ padding: '10px 12px', borderTop: '1px solid #f3f4f6', flexShrink: 0 }}>
            <button
              onClick={() => setScreen('dashboard')}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${accentColor}`, background: accentLight, color: accentColor, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background 0.13s, transform 0.1s, box-shadow 0.13s' }}
              onMouseEnter={e => { e.currentTarget.style.background = accentColor; e.currentTarget.style.color = '#fff'; e.currentTarget.style.boxShadow = `0 4px 12px ${accentColor}40` }}
              onMouseLeave={e => { e.currentTarget.style.background = accentLight; e.currentTarget.style.color = accentColor; e.currentTarget.style.boxShadow = 'none' }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}>
              🏠 <span>Home</span>
            </button>
          </div>
        </>
      ) : (
        /* ── Module page expanded: title + sub-tabs + portal + apps nav + home ── */
        <>
          {mod && (
            <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{mod.icon}</span>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.3 }}>{mod.label}</div>
              </div>
            </div>
          )}

          {tabs && (
            <nav style={{ padding: '8px', flexShrink: 0 }}>
              {tabs.map(t => {
                const active = activeTab === t.key
                return (
                  <button key={t.key}
                    className={`sidebar-item${active ? ' active' : ''}`}
                    onClick={() => setSidebarSubTab(t.key)}
                    style={active ? { background: accentLight, color: accentColor } : {}}>
                    <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{t.icon}</span>
                    <span style={{ lineHeight: 1.3, flex: 1 }}>{t.label}</span>
                    {screen === 'training' && trainingBadges[t.key] > 0
                      ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c84b2f', flexShrink: 0 }} />
                      : active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />}
                  </button>
                )
              })}
            </nav>
          )}

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <div id="sidebar-portal-slot" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }} />

            {!hasPortal && visibleMeta.length > 0 && (
              <div style={{ borderTop: '1px solid #f3f4f6', flexShrink: 0, maxHeight: modulesOpen ? 240 : 'none', overflowY: modulesOpen ? 'auto' : 'visible' }}>
                <div style={{ padding: '8px 14px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {AppsBadge()}
                  <button onClick={toggleModules} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--text3)', lineHeight: 1, padding: '0 2px' }} title={modulesOpen ? 'Collapse' : 'Expand'}>
                    {modulesOpen ? '−' : '+'}
                  </button>
                </div>
                {modulesOpen && <nav style={{ padding: '2px 8px 6px' }}>
                  {visibleMeta.map(m => {
                    const isCurrent = !m.external && (m.screen === screen ||
                      (m.key === 'supply'       && ['inspection', 'results', 'history'].includes(screen)) ||
                      (m.key === 'projects'     && screen === 'project-detail') ||
                      (m.key === 'equipmenthub' && screen === 'equipmentscan'))
                    const locked = safetyLocked && m.key !== 'profile'
                    return (
                      <button key={m.key}
                        className={`sidebar-item${isCurrent && !locked ? ' active' : ''}`}
                        onClick={locked ? undefined : () => handleModuleClick(m)}
                        style={locked
                          ? { opacity: 0.4, cursor: 'not-allowed', filter: 'grayscale(0.7)', pointerEvents: 'none' }
                          : isCurrent ? { background: accentLight, color: accentColor } : {}}>
                        <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{m.icon}</span>
                        <span style={{ lineHeight: 1.3, flex: 1, fontSize: 13 }}>{m.label}</span>
                        {locked
                          ? <span style={{ fontSize: 11 }}>🔒</span>
                          : isCurrent
                            ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
                            : m.external
                              ? <span style={{ fontSize: 10, color: 'var(--text3)' }}>↗</span>
                              : <span style={{ fontSize: 12, color: 'var(--text3)' }}>›</span>}
                      </button>
                    )
                  })}
                </nav>}
              </div>
            )}
          </div>

          <div style={{ padding: '10px 12px', borderTop: '1px solid #f3f4f6', flexShrink: 0 }}>
            <button
              onClick={() => setScreen('dashboard')}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${accentColor}`,
                background: accentLight, color: accentColor,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                transition: 'background 0.13s, transform 0.1s, box-shadow 0.13s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = accentColor; e.currentTarget.style.color = '#fff'; e.currentTarget.style.boxShadow = `0 4px 12px ${accentColor}40` }}
              onMouseLeave={e => { e.currentTarget.style.background = accentLight; e.currentTarget.style.color = accentColor; e.currentTarget.style.boxShadow = 'none' }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}>
              🏠 <span>Home</span>
            </button>
          </div>
        </>
      )}
    </aside>
    {extConfirm && (
      <ExternalLinkModal
        url={extConfirm}
        onConfirm={() => { window.open(extConfirm, '_blank'); setExtConfirm(null) }}
        onCancel={() => setExtConfirm(null)}
      />
    )}
    </>
  )
}

// ── Layout ─────────────────────────────────────────────────────
export default function Layout({ children }) {
  const { session, setScreen, screen, clearSession, activeModules, sidebarSubTab, setSidebarSubTab } = useAppStore()
  const isMobile = useIsMobile()
  const isProto  = PROTO_SCREENS.has(screen)

  const accentColor = session?.loginMode === 'solo' ? '#534AB7' : '#1D9E75'
  const accentLight = session?.loginMode === 'solo' ? '#f0effe' : '#e6f7f2'
  const displayName = session?.role === 'admin' && !session?.userId ? '' : session?.username

  const showSidebar = !isMobile && !isProto && !!session

  const [orgLogoUrl, setOrgLogoUrl] = useState(null)
  const [showAbout,   setShowAbout]   = useState(false)
  const [showContact, setShowContact] = useState(false)
  const [showTour,    setShowTour]    = useState(false)
  const [loginCount,  setLoginCount]  = useState(0)
  // Mobile: sidebar lives in a slide-in drawer opened by the header hamburger
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const tourTriggeredRef = useRef(false)
  useEffect(() => { setMobileDrawerOpen(false) }, [screen, sidebarSubTab])

  // Safety lock — lab users must complete all 4 safety steps before accessing modules
  const [safetyLocked, setSafetyLocked] = useState(false)
  useEffect(() => {
    if (session?.role !== 'lab_user' || !session?.userId) { setSafetyLocked(false); return }
    const uid = session.userId
    async function checkSafety() {
      try {
        const { data } = await sb.from('lab_safety_progress')
          .select('step_number').eq('user_id', uid).eq('completed', true)
        const done = new Set((data || []).map(r => r.step_number))
        setSafetyLocked(![1, 2, 3, 4].every(n => done.has(n)))
      } catch { setSafetyLocked(false) }
    }
    checkSafety()
    const sub = sb.channel(`safety_sidebar_${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lab_safety_progress', filter: `user_id=eq.${uid}` }, checkSafety)
      .subscribe()
    return () => { sb.removeChannel(sub) }
  }, [session?.userId, session?.role])

  useEffect(() => {
    const orgId = session?.organizationId
    if (!orgId || session?.loginMode !== 'team') { setOrgLogoUrl(null); return }
    sb.from('organizations').select('logo_url').eq('id', orgId).single()
      .then(({ data }) => setOrgLogoUrl(data?.logo_url || null))
  }, [session?.organizationId, session?.loginMode])

  // Track login count + auto-trigger tour for new users
  useEffect(() => {
    if (!session?.userId || session?.mustChangePassword || tourTriggeredRef.current) return
    tourTriggeredRef.current = true
    const uid = session.userId
    const countKey = `ictlab_login_count_${uid}`
    const doneKey  = `ictlab_tour_done_${uid}`
    const count = parseInt(localStorage.getItem(countKey) || '0', 10) + 1
    localStorage.setItem(countKey, String(count))
    setLoginCount(count)
    // Fast path: tour_done flag in session (loaded from users table on every login, device-agnostic)
    if (session?.tourDone) { localStorage.setItem(doneKey, 'true'); return }
    if (localStorage.getItem(doneKey) === 'true') return
    // Fallback DB check for existing users (pre-tour_done column) who have dashboard prefs
    sb.from('user_dashboard_prefs').select('has_set_dashboard, active_modules').eq('user_id', uid).limit(1)
      .then(({ data }) => {
        const row = data?.[0]
        if (row?.has_set_dashboard || Array.isArray(row?.active_modules)) {
          localStorage.setItem(doneKey, 'true')
        } else {
          setTimeout(() => setShowTour(true), 600)
        }
      })
      .catch(() => { setTimeout(() => setShowTour(true), 600) })
  }, [session?.userId, session?.mustChangePassword])

  async function handleTourDone() {
    setShowTour(false)
    const uid = session?.userId
    if (!uid) return
    localStorage.setItem(`ictlab_tour_done_${uid}`, 'true')
    // Write tour_done to the user's own row — simple UPDATE, no unique-constraint issues
    sb.from('users').update({ tour_done: true }).eq('id', uid).then(() => {})
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <header style={{ background: '#0d47a1', borderBottom: '1px solid #0a3d91', paddingLeft: 16, paddingRight: 16, paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 0, height: 'calc(56px + env(safe-area-inset-top, 0px))', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, zIndex: 100, position: 'relative' }}>
        {/* Org logo — centered in header, only for team users */}
        {orgLogoUrl && !isMobile && (
          <div style={{ position: 'absolute', left: '50%', top: 'env(safe-area-inset-top, 0px)', bottom: 0, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
            <img src={orgLogoUrl} alt="Organization logo" style={{ height: 38, maxWidth: 200, objectFit: 'contain' }} />
          </div>
        )}

        {isMobile && !isProto && session && (
          <button
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Open menu"
            style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.9)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 8 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
            </svg>
          </button>
        )}
        <div onClick={() => setScreen('dashboard')} style={{ cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <IctLabLogo height={38} />
          {!isMobile && (
            <div>
              <div style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px', color: '#ffffff', lineHeight: 1.1 }}>ICT-Lab</div>
              <div style={{ fontSize: 10, color: '#ffb380', fontWeight: 400, letterSpacing: '0.02em', lineHeight: 1.2 }}>The All-in-One Research Lab Platform</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* About — glass icon button */}
          <button
            onClick={() => setShowAbout(true)}
            title="About ICT-Lab"
            style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.18s ease' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.transform = 'translateY(-1px) scale(1.06)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.25)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
          </button>

          {/* Help / Tour button */}
          {session?.userId && (
            <HelpTourButton
              loginCount={loginCount}
              onOpen={() => setShowTour(true)}
              accentRgb="29,198,130"
            />
          )}

          {session?.userId === null && session?.role === 'admin' ? <SuperAdminBell /> : session?.userId ? <NotificationBell /> : null}

          {/* Profile pill */}
          {session && (
            <button onClick={() => setScreen('profile')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 99, padding: '4px 10px 4px 4px', cursor: 'pointer', transition: 'all 0.18s ease' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {session.photoUrl
                  ? <img src={session.photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  : session.avatar
                    ? <span style={{ fontSize: 15 }}>{session.avatar}</span>
                    : <span style={{ fontSize: 12, fontWeight: 700, color: '#ffffff' }}>{(session.username || 'A')[0].toUpperCase()}</span>
                }
              </div>
              {!isMobile && displayName && (
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', fontFamily: 'var(--mono)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
              )}
            </button>
          )}

          {/* Sign out — glass icon button */}
          <button
            onClick={() => clearSession()}
            title="Sign out"
            style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.18s ease' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,80,80,0.22)'; e.currentTarget.style.transform = 'translateY(-1px) scale(1.06)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,100,100,0.3)'; e.currentTarget.style.color = '#ff9e9e'; e.currentTarget.style.borderColor = 'rgba(255,100,100,0.35)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── Body: sidebar + content ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

        {showSidebar && (
          <Sidebar
            session={session}
            screen={screen}
            activeModules={activeModules}
            sidebarSubTab={sidebarSubTab}
            setSidebarSubTab={setSidebarSubTab}
            setScreen={setScreen}
            accentColor={accentColor}
            accentLight={accentLight}
            safetyLocked={safetyLocked}
          />
        )}

        <main style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflowY: 'auto',
          scrollbarGutter: 'stable',
          paddingTop: isProto ? 0 : '24px',
          paddingLeft: isProto ? 0 : isMobile ? '20px' : '24px',
          paddingRight: isProto ? 0 : isMobile ? '20px' : '24px',
          paddingBottom: isMobile
            ? 'calc(72px + env(safe-area-inset-bottom, 0px))'
            : isProto ? 0 : '24px',
        }}>
          {session?.userId && !isProto && screen !== 'dashboard' && (
            <ModuleTip screen={screen} userId={session.userId} />
          )}
          {children}
          {!isMobile && !isProto && screen !== 'dashboard' && (
            <div style={{ textAlign: 'center', padding: '16px 0 4px', fontSize: 11, color: 'var(--text3)' }}>
              <a href="/terms.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text3)', textDecoration: 'underline' }}>Terms of Service</a>
            </div>
          )}
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      {isMobile && (
        <nav style={{ flexShrink: 0, zIndex: 200, background: '#fff', borderTop: '1px solid #e0e0e0', boxShadow: '0 -2px 12px rgba(0,0,0,0.07)', paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) / 2), 4px)' }}>
          <div style={{ display: 'flex', height: 56 }}>
            {NAV_TABS.map(tab => {
              const isActive = tab.screens.includes(screen)
              const dest = tab.id === 'home' ? 'dashboard' : tab.id === 'supply' ? 'home' : tab.id === 'booking' ? 'booking' : tab.id === 'projects' ? 'projects' : 'profile'
              return (
                <button key={tab.id} onClick={() => setScreen(dest)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, border: 'none', background: 'transparent', cursor: 'pointer', padding: '6px 2px 4px', position: 'relative', WebkitTapHighlightColor: 'transparent' }}>
                  {isActive && <span style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', width: 40, height: 32, background: accentLight, borderRadius: 10 }} />}
                  <span style={{ fontSize: 20, lineHeight: 1, position: 'relative', zIndex: 1 }}>{tab.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? accentColor : '#aaa', fontFamily: 'var(--sans)', position: 'relative', zIndex: 1, letterSpacing: '-0.01em' }}>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      )}

      {/* ── Mobile sidebar drawer ── */}
      {isMobile && !isProto && session && mobileDrawerOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400 }}>
          <div onClick={() => setMobileDrawerOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
          <div className="mobile-drawer" style={{ position: 'absolute', top: 0, left: 0, bottom: 0, display: 'flex', background: '#fff', boxShadow: '4px 0 24px rgba(0,0,0,0.25)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            <Sidebar
              session={session}
              screen={screen}
              activeModules={activeModules}
              sidebarSubTab={sidebarSubTab}
              setSidebarSubTab={setSidebarSubTab}
              setScreen={setScreen}
              accentColor={accentColor}
              accentLight={accentLight}
              forceExpanded
              safetyLocked={safetyLocked}
            />
          </div>
        </div>
      )}

      {showAbout   && <AboutModal onClose={() => setShowAbout(false)} onContact={() => { setShowAbout(false); setShowContact(true) }} />}
      {showContact && <CustomerServiceModal onClose={() => setShowContact(false)} />}
      {showTour && <OnboardingTour session={session} onDone={handleTourDone} />}
      <FeedbackWidget bottomOffset={isMobile ? 80 : 24} />
      <SaraChat bottomOffset={isMobile ? 80 : 24} color={accentColor} onContact={() => setShowContact(true)} />
    </div>
  )
}
