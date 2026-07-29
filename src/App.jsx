import { useEffect, useState, lazy, Suspense } from 'react'
import { useAppStore } from './store/useAppStore'
import { sb } from './lib/supabase'
import Login from './screens/auth/Login'
import AdminLogin from './screens/auth/AdminLogin'
import Layout from './components/Layout'
import Toast from './components/Toast'
import DashboardIconPicker from './components/DashboardIconPicker'
import ForcePasswordChange from './components/ForcePasswordChange'
import CustomerServiceModal from './components/CustomerServiceModal'
import TermsAcceptance from './components/TermsAcceptance'
import { CURRENT_TERMS_VERSION } from './lib/termsVersion'

const Dashboard            = lazy(() => import('./screens/dashboard/Dashboard'))
const Home                 = lazy(() => import('./screens/inspection/Home'))
const Inspection           = lazy(() => import('./screens/inspection/Inspection'))
const Results              = lazy(() => import('./screens/inspection/Results'))
const History              = lazy(() => import('./screens/inspection/History'))
const ProjectMaterial      = lazy(() => import('./screens/projects/ProjectMaterial'))
const ProjectDetail        = lazy(() => import('./screens/projects/ProjectDetail'))
const BookingEquipment     = lazy(() => import('./screens/equipment/BookingEquipment'))
const EquipmentInventory   = lazy(() => import('./screens/equipment/EquipmentInventory'))
const EquipmentHub         = lazy(() => import('./screens/equipment/EquipmentHub'))
const BarcodeScannerScreen = lazy(() => import('./screens/barcode/BarcodeScannerScreen'))
const BarcodeManager       = lazy(() => import('./screens/barcode/BarcodeManager'))
const TrainingRecords      = lazy(() => import('./screens/training/TrainingRecords'))
const LabManagement        = lazy(() => import('./screens/labmanagement/LabManagement'))
const PM                   = lazy(() => import('./screens/maintenance/PM'))
const LabMessage           = lazy(() => import('./screens/messaging/LabMessage'))
const LabSafety            = lazy(() => import('./screens/labsafety/LabSafety'))
const Profile              = lazy(() => import('./screens/profile/Profile'))
const Admin                = lazy(() => import('./screens/admin/Admin'))

const IS_ADMIN_ROUTE = window.location.pathname.endsWith('/admin') || window.location.pathname.endsWith('/admin/')

function TrainingOnboardingModal({ onGoToTraining, onDismiss }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 460, border: '1px solid var(--border)', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg, #1D9E75 0%, #0369a1 100%)', padding: '32px 32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🦺</div>
          <div style={{ fontWeight: 700, fontSize: 22, color: '#fff', marginBottom: 8, letterSpacing: '-0.4px' }}>Safety Training Required</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.88)', lineHeight: 1.6 }}>
            Welcome to ICT-Lab! Before using lab equipment you must complete all required safety steps. Your lab manager will approve each step.
          </div>
        </div>
        <div style={{ padding: '24px 32px 28px' }}>
          <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 20 }}>
            Complete all 4 safety steps, then upload your certificates in Training Records once your lab manager approves them.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={onGoToTraining}
              style={{ padding: '12px 24px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Start Safety Training →
            </button>
            <button onClick={onDismiss}
              style={{ padding: '10px 24px', background: 'none', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              I'll do this later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const INTERNAL = new Set([
  'dashboard', 'profile', 'orgadmin',
  'home', 'inspection', 'results', 'history',
  'projects', 'project-detail',
  'booking', 'barcode', 'barcodeqr',
  'training', 'labmanagement', 'pm', 'equipment', 'equipmenthub', 'remessages',
  'labsafety',
])

export default function App() {
  const { session, screen, refreshCache, setScreen, setActiveModules, setSession, clearSession } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [userAccess, setUserAccess] = useState(null)
  const [showIconPicker, setShowIconPicker] = useState(null)
  const [showTrainingPrompt, setShowTrainingPrompt] = useState(false)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [showSupport, setShowSupport] = useState(() => new URLSearchParams(window.location.search).get('support') === '1')
  const [termsAccepted, setTermsAccepted] = useState(false)

  useEffect(() => {
    if (!session) { setTermsAccepted(false); return }
    if (session.userId === null) { setTermsAccepted(true); return }
    setTermsAccepted(session.termsAcceptedVersion === CURRENT_TERMS_VERSION)
  }, [session?.userId, session?.termsAcceptedVersion])

  async function restoreSessionFromAuth(authUser) {
    const { data: saRow } = await sb.from('settings').select('value').eq('key', 'super_admin_auth_id').maybeSingle()
    if (saRow?.value === authUser.id) {
      setSession({ role: 'admin', username: 'Admin', userId: null, adminLevel: 3, loginMode: 'team' })
      return
    }
    const { data: teamUser } = await sb.from('users').select('*').eq('auth_id', authUser.id).eq('is_active', true).maybeSingle()
    if (teamUser) {
      const adminLevel = teamUser.admin_level || 0
      const role = teamUser.role === 'admin' || adminLevel >= 1 ? 'admin' : teamUser.role
      setSession({
        role, dbRole: teamUser.role,
        username: teamUser.nick_name?.trim() || teamUser.name,
        userId: teamUser.id,
        email: teamUser.email,
        adminLevel,
        photoUrl: teamUser.photo_url,
        avatar: teamUser.avatar,
        loginMode: 'team',
        organizationId: teamUser.organization_id || null,
        projectGroup: teamUser.project_group || null,
        mustChangePassword: teamUser.must_change_password === true,
        termsAcceptedVersion: teamUser.terms_accepted_version || null,
      })
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const [authResult, maintResult] = await Promise.all([
          sb.auth.getSession(),
          sb.from('settings').select('value').eq('key', 'maintenance_mode').maybeSingle(),
        ])
        if (maintResult?.data?.value === 'true') setMaintenanceMode(true)
        if (authResult?.data?.session?.user) await restoreSessionFromAuth(authResult.data.session.user)
        const timeout = new Promise(resolve => setTimeout(resolve, 8000))
        await Promise.race([refreshCache(), timeout])
      } catch (e) {
        console.error('ICT-Lab init error:', e)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (session?.loginMode) {
      localStorage.setItem('ictlab_login_mode', session.loginMode)
      refreshCache()
      const deepScreen = new URLSearchParams(window.location.search).get('screen')
      if (deepScreen && INTERNAL.has(deepScreen)) setScreen(deepScreen)
    } else if (!session) {
      localStorage.removeItem('ictlab_login_mode')
      setShowIconPicker(null)
      setActiveModules(null)
    }
  }, [session])

  useEffect(() => {
    if (!session?.loginMode) return
    checkFirstLogin(session.userId, session.loginMode)
  }, [session?.loginMode, session?.userId])

  useEffect(() => {
    if (session?.role !== 'lab_user' || !session?.userId || session?.mustChangePassword || !termsAccepted) return
    if (localStorage.getItem(`ictlab_training_prompted_${session.userId}`) === 'true') return
    setShowTrainingPrompt(true)
  }, [session?.userId, session?.role, session?.mustChangePassword, termsAccepted])

  async function checkFirstLogin(userId) {
    try {
      if (!userId) { setShowIconPicker(false); return }
      // localStorage is the fast/reliable source — immune to RLS issues on user_dashboard_prefs
      if (localStorage.getItem(`ictlab_picker_done_${userId}`) === 'true') {
        setShowIconPicker(false)
        return
      }
      const { data } = await sb.from('user_dashboard_prefs').select('active_modules, has_set_dashboard').eq('user_id', userId).order('created_at', { ascending: false }).limit(1)
      const row = data?.[0]
      const hasSaved = row && (
        (Array.isArray(row.active_modules) && row.active_modules.length > 0) ||
        row.has_set_dashboard === true
      )
      if (hasSaved) localStorage.setItem(`ictlab_picker_done_${userId}`, 'true')
      setShowIconPicker(!hasSaved)
    } catch {
      setShowIconPicker(false)
    }
  }

  // Super admin idle timeout: sign out after 30 minutes
  useEffect(() => {
    if (!session || session.userId !== null) return
    const IDLE_MS = 30 * 60 * 1000
    let lastActivity = Date.now()
    const touch = () => { lastActivity = Date.now() }
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click']
    events.forEach(ev => window.addEventListener(ev, touch, { passive: true }))
    const interval = setInterval(() => {
      if (Date.now() - lastActivity >= IDLE_MS) clearSession()
    }, 60_000)
    return () => {
      events.forEach(ev => window.removeEventListener(ev, touch))
      clearInterval(interval)
    }
  }, [session?.userId])

  useEffect(() => {
    if (session?.userId && (session?.role === 'user' || session?.role === 'admin' || session?.role === 'lab_user')) {
      sb.from('user_screen_access').select('screen_key').eq('user_id', session.userId)
        .then(({ data }) => {
          if (data?.length) setUserAccess(new Set(data.map(r => r.screen_key)))
          else setUserAccess(null)
        })
        .catch(() => setUserAccess(null))
    } else {
      setUserAccess(null)
    }
  }, [session?.userId])

  useEffect(() => {
    if (session?.role === 'admin' && !session?.userId) {
      if (!['dashboard', 'orgadmin', 'profile'].includes(screen)) setScreen('dashboard')
      return
    }
    if (!INTERNAL.has(screen)) setScreen('dashboard')
    if ((session?.role === 'user' || session?.role === 'admin') && userAccess && !INTERNAL.has(screen)) {
      if (!userAccess.has(screen)) setScreen('dashboard')
    }
  }, [session, screen, userAccess])

  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 999 }}>
      <div className="spinner" />
      <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text3)' }}>Connecting…</div>
    </div>
  )

  if (maintenanceMode && !IS_ADMIN_ROUTE && session?.userId !== null) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0F1B35', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <img src="/ict-logo.png" alt="ICT-Lab" style={{ width: 120, marginBottom: 24 }} />
        <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Maintenance</div>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', textAlign: 'center', maxWidth: 320 }}>The platform is temporarily unavailable. Please check back shortly.</div>
      </div>
    )
  }

  if (IS_ADMIN_ROUTE) {
    if (!session || session.role !== 'admin') return <AdminLogin />
  }

  if (!session) return (
    <>
      <Login />
      {showSupport && <CustomerServiceModal onClose={() => setShowSupport(false)} />}
    </>
  )

  const screens = {
    dashboard:        <Dashboard />,
    home:             <Home />,
    inspection:       <Inspection />,
    results:          <Results />,
    history:          <History />,
    projects:         <ProjectMaterial />,
    'project-detail': <ProjectDetail />,
    booking:          <BookingEquipment />,
    equipment:        <EquipmentInventory />,
    equipmenthub:     <EquipmentHub />,
    barcode:          <BarcodeScannerScreen />,
    barcodeqr:        <BarcodeManager />,
    training:         <TrainingRecords />,
    labmanagement:    <LabManagement />,
    pm:               <PM />,
    remessages:       <LabMessage />,
    labsafety:        <LabSafety />,
    profile:          <Profile />,
    orgadmin:         <Admin />,
  }

  return (
    <>
      <Layout>
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>}>
          {screens[screen] || <Dashboard />}
        </Suspense>
      </Layout>
      <Toast />
      {!termsAccepted && session && <TermsAcceptance session={session} onAccept={() => setTermsAccepted(true)} />}
      {termsAccepted && session?.mustChangePassword && <ForcePasswordChange />}
      {termsAccepted && !session?.mustChangePassword && showTrainingPrompt && showIconPicker !== true && (
        <TrainingOnboardingModal
          onGoToTraining={() => {
            localStorage.setItem(`ictlab_training_prompted_${session.userId}`, 'true')
            setShowTrainingPrompt(false)
            setScreen('labsafety')
          }}
          onDismiss={() => {
            localStorage.setItem(`ictlab_training_prompted_${session.userId}`, 'true')
            setShowTrainingPrompt(false)
          }}
        />
      )}
      {showSupport && <CustomerServiceModal onClose={() => setShowSupport(false)} />}
      {showIconPicker === true && (
        <DashboardIconPicker
          session={session}
          loginMode={session.loginMode}
          onDone={(modules) => {
            if (session.userId) localStorage.setItem(`ictlab_picker_done_${session.userId}`, 'true')
            if (!session.userId) {
              localStorage.setItem('ictlab_admin_dashboard_set', 'true')
            } else if (!modules || modules.length === 0) {
              sb.from('user_dashboard_prefs').select('id').eq('user_id', session.userId).limit(1)
                .then(({ data }) => {
                  if (data?.length) {
                    sb.from('user_dashboard_prefs').update({ has_set_dashboard: true }).eq('user_id', session.userId).then(() => {})
                  } else {
                    sb.from('user_dashboard_prefs').insert({ user_id: session.userId, has_set_dashboard: true, active_modules: [] }).then(() => {})
                  }
                })
            }
            if (modules !== null && modules !== undefined) setActiveModules(modules)
            setShowIconPicker(false)
          }}
        />
      )}
    </>
  )
}
