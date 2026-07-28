import { create } from 'zustand'
import { sb } from '../lib/supabase'

export const useAppStore = create((set, get) => ({
  // ── Auth ──
  session: null,
  setSession: (s) => set({ session: s }),
  clearSession: () => {
    sb.auth.signOut()
    localStorage.removeItem('ictlab_login_mode')
    set({ session: null, loginMode: null, activeModules: null, currentProjectId: null, sidebarSubTab: null })
  },

  // ── Active dashboard modules (icon picker) ──
  activeModules: null,
  setActiveModules: (modules) => set({ activeModules: modules }),

  // ── Login mode: 'team' | null ──
  loginMode: null,
  setLoginMode: (m) => set({ loginMode: m }),

  // ── Cache ──
  rooms: [],
  supplies: [],
  settings: {},

  refreshCache: async () => {
    const session = get().session
    const safeOrgId = session?.organizationId || '00000000-0000-0000-0000-000000000000'
    const [r, s, cfg] = await Promise.all([
      sb.from('rooms').select('*').eq('login_mode', 'team').eq('organization_id', safeOrgId).order('created_at'),
      sb.from('supplies').select('*').eq('login_mode', 'team').eq('organization_id', safeOrgId).order('created_at'),
      sb.from('settings').select('*'),
    ])
    const settings = {}
    ;(cfg.data || []).forEach((x) => (settings[x.key] = x.value))
    set({ rooms: r.data || [], supplies: s.data || [], settings })
  },

  // ── Toast ──
  toastMsg: '',
  toastVisible: false,
  toastIsError: false,
  toast: (msg) => {
    const isError = /^error|^please|^could not|^failed|^invalid|^unable/i.test(msg?.trim())
    set({ toastMsg: msg, toastVisible: true, toastIsError: isError })
    if (!isError) setTimeout(() => set({ toastVisible: false }), 2500)
  },
  dismissToast: () => set({ toastVisible: false, toastIsError: false }),

  // ── Navigation ──
  screen: 'dashboard',
  setScreen: (s) => set({ screen: s, sidebarSubTab: null }),

  // ── Sidebar sub-tab (set by Layout sidebar, read by each screen) ──
  sidebarSubTab: null,
  setSidebarSubTab: (key) => set({ sidebarSubTab: key }),
  pendingAdminTab: null,
  setPendingAdminTab: (tab) => set({ pendingAdminTab: tab }),
  pendingProfileTab: null,
  setPendingProfileTab: (tab) => set({ pendingProfileTab: tab }),
  pendingBookingNotif: null,
  setPendingBookingNotif: (n) => set({ pendingBookingNotif: n }),

  // ── Inspection state ──
  inspection: null,
  setInspection: (i) => set({ inspection: i }),

  // ── Last completed inspection record ──
  lastRecord: null,
  setLastRecord: (r) => set({ lastRecord: r }),

  // ── Current project ──
  currentProjectId: null,
  setCurrentProjectId: (id) => set({ currentProjectId: id }),

  // ── Equipment QR scan (from URL param ?eq=<uuid>) ──
  scanEquipmentId: null,
  setScanEquipmentId: (id) => set({ scanEquipmentId: id }),
  clearScanEquipmentId: () => set({ scanEquipmentId: null }),

  // ── Storage provider (mirrors localStorage ictlab_storage_provider) ──
  storageProviderKey: localStorage.getItem('ictlab_storage_provider') || 'supabase',
  setStorageProviderKey: (key) => {
    localStorage.setItem('ictlab_storage_provider', key)
    set({ storageProviderKey: key })
  },

  // ── UI Guidance tooltips ──
  showTooltips: localStorage.getItem('ictlab_show_tooltips') !== 'false',
  setShowTooltips: (val) => {
    localStorage.setItem('ictlab_show_tooltips', val ? 'true' : 'false')
    if (val) document.body.classList.remove('tooltips-off')
    else document.body.classList.add('tooltips-off')
    set({ showTooltips: val })
  },
}))
