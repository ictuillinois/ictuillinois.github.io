import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { providers, getActiveProviderKey,
  ORG_MODE_KEY, ORG_COPY_KEY, TEAM_B_KEY,
  SOLO_MODE_A_KEY, SOLO_MODE_B_KEY, GROUP_STORAGE_KEY,
  MODE_WEBSITE_ONLY, MODE_WEBSITE_PLUS_COPY, MODE_EXTERNAL_ONLY,
} from '../lib/storage/StorageService'
import { useAppStore } from '../store/useAppStore'
import { isSupported as localFolderSupported } from '../lib/storage/LocalFolderProvider'

// ── Provider catalogue ─────────────────────────────────────────────────────
export const PROVIDER_OPTIONS = [
  { key: 's3',          icon: '🟠', label: 'AWS S3 (ictlab-files)', color: '#FF9900', bg: '#FFF3E0', server: true },
  { key: 'gdrive',      icon: '🟢', label: 'Google Drive',          color: '#1a73e8', bg: '#e8f0fe', oauth: true },
  { key: 'onedrive',    icon: '🔵', label: 'Microsoft OneDrive',    color: '#0078d4', bg: '#e3f2fd', oauth: true },
  { key: 'localfolder', icon: '🗂️', label: 'Local Folder',          color: '#534AB7', bg: '#EEEDFE', localfolder: true },
  { key: 'filesystem',  icon: '📱', label: 'iCloud / Device',       color: '#0369a1', bg: '#e0f2fe', mobileOnly: true },
]

export const PROVIDER_LABELS = {
  supabase:    { icon: '☁️', label: 'ICT-Lab Cloud' },
  s3:          { icon: '🟠', label: 'AWS S3' },
  gdrive:      { icon: '🟢', label: 'Google Drive' },
  onedrive:    { icon: '🔵', label: 'Microsoft OneDrive' },
  localfolder: { icon: '🗂️', label: 'Local Folder' },
  filesystem:  { icon: '📱', label: 'iCloud / Device' },
  website:     { icon: '☁️', label: 'ICT-Lab Cloud' },
}

const MODE_OPTIONS = [
  { key: MODE_WEBSITE_ONLY,      label: 'ICT-Lab Cloud only',       icon: '☁️',  sub: 'Best performance. Your data is always available.', recommended: true },
  { key: MODE_WEBSITE_PLUS_COPY, label: 'ICT-Lab Cloud + backup',   icon: '☁️➕', sub: 'ICT-Lab keeps the primary copy; a second copy goes to your connected provider.' },
  { key: MODE_EXTERNAL_ONLY,     label: 'External provider only',   icon: '💾',  sub: 'Data lives in your connected provider only. ICT-Lab does not store these files.', warn: true },
]

const EXTERNAL_WARN = 'When using an external provider only, ICT-Lab does not store these files on its servers. Loading speed depends on your provider, and you are responsible for availability and backups. Your account information (name, email, login) always stays on ICT-Lab regardless.'
const LOCAL_WARN = 'Local Folder is device-specific. Files will not be available on other computers or devices. You are fully responsible for backups and recovery.'

// ── Shared: provider connector ─────────────────────────────────────────────
function ProviderRow({ opt, connected, active, onSelect, onDisconnect, connecting }) {
  if (opt.key === 'localfolder' && !localFolderSupported()) return null
  return (
    <div onClick={() => onSelect(opt)}
      style={{ border: `2px solid ${active ? opt.color : 'var(--border)'}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', background: active ? opt.bg : 'var(--surface)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 24, flexShrink: 0 }}>{opt.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{opt.label}</span>
          {active && <span style={{ fontSize: 10, background: opt.color, color: '#fff', borderRadius: 4, padding: '1px 8px', fontWeight: 700 }}>Active</span>}
          {!active && connected && <span style={{ fontSize: 10, background: '#E1F5EE', color: '#1D9E75', borderRadius: 4, padding: '1px 8px', fontWeight: 700 }}>Connected</span>}
          {opt.mobileOnly && <span style={{ fontSize: 10, background: '#f0efe9', color: '#6b6860', borderRadius: 4, padding: '1px 8px', fontWeight: 600 }}>Mobile only</span>}
        </div>
      </div>
      {connecting === opt.key && <div className="spinner" style={{ width: 16, height: 16, flexShrink: 0 }} />}
      {!opt.server && connected && !active && <button className="btn btn-sm" style={{ fontSize: 11, flexShrink: 0 }} onClick={e => { e.stopPropagation(); onDisconnect(opt) }}>Disconnect</button>}
      {!opt.server && active && opt.key !== 'supabase' && <button className="btn btn-sm" style={{ fontSize: 11, flexShrink: 0 }} onClick={e => { e.stopPropagation(); onDisconnect(opt) }}>Disconnect</button>}
    </div>
  )
}

function useProviderStatuses() {
  const [statuses, setStatuses] = useState({})
  function refresh() {
    const s = {}
    PROVIDER_OPTIONS.forEach(o => { s[o.key] = providers[o.key]?.isConnected() })
    setStatuses(s)
  }
  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  return [statuses, refresh]
}

// ── Solo storage modal ─────────────────────────────────────────────────────
function SoloStorageModal({ onClose, toast }) {
  const { session } = useAppStore()
  const [modeA, setModeA_]   = useState(() => localStorage.getItem(SOLO_MODE_A_KEY) || MODE_WEBSITE_ONLY)
  const [modeB, setModeB_]   = useState(() => localStorage.getItem(SOLO_MODE_B_KEY) || MODE_WEBSITE_ONLY)
  const [groupStorage, setGroupStorage_] = useState(() => localStorage.getItem(GROUP_STORAGE_KEY) || 'website')
  const currentProvider = getActiveProviderKey()
  const [statuses, refreshStatuses] = useProviderStatuses()
  const [connecting, setConnecting] = useState(null)

  const needsProvider = modeA !== MODE_WEBSITE_ONLY || modeB !== MODE_WEBSITE_ONLY || (groupStorage !== 'website')
  const externalWarn = modeA === MODE_EXTERNAL_ONLY || modeB === MODE_EXTERNAL_ONLY

  function setModeA(m) { setModeA_(m); localStorage.setItem(SOLO_MODE_A_KEY, m) }
  function setModeB(m) { setModeB_(m); localStorage.setItem(SOLO_MODE_B_KEY, m) }
  function setGroupStorage(v) {
    setGroupStorage_(v)
    localStorage.setItem(GROUP_STORAGE_KEY, v)
    // Persist to DB so workspace invitees can see the storage notice
    if (session?.userId) {
      sb.from('settings').upsert({ key: `solo_group_storage_${session.userId}`, value: v }, { onConflict: 'key' })
    }
  }

  function isAllWebsite() {
    return modeA === MODE_WEBSITE_ONLY && modeB === MODE_WEBSITE_ONLY && groupStorage === 'website'
  }

  function setAllWebsite() {
    setModeA(MODE_WEBSITE_ONLY); setModeB(MODE_WEBSITE_ONLY); setGroupStorage('website')
    useAppStore.getState().setStorageProviderKey('supabase')
    toast('Storage set to ICT-Lab Cloud ✓')
  }

  async function connectProvider(opt) {
    if (opt.localfolder) {
      setConnecting(opt.key)
      try {
        await providers.localfolder.pickFolder()
        useAppStore.getState().setStorageProviderKey('localfolder')
        refreshStatuses()
        toast('Local folder connected ✓')
      } catch (e) {
        if (e.name !== 'AbortError') toast('Could not access folder: ' + (e.message || 'Permission denied'))
      }
      setConnecting(null); return
    }
    if (opt.oauth && !providers[opt.key].isConnected()) {
      setConnecting(opt.key)
      try {
        await providers[opt.key].connect()
        toast(`${opt.label}: complete sign-in in the browser that opened.`)
      } catch (e) { toast('Could not open auth: ' + (e.message || '')) }
      setConnecting(null); return
    }
    useAppStore.getState().setStorageProviderKey(opt.key)
    refreshStatuses()
    toast(`Provider switched to ${opt.label} ✓`)
  }

  async function disconnectProvider(opt) {
    await providers[opt.key].disconnect?.()
    refreshStatuses()
    if (currentProvider === opt.key) {
      useAppStore.getState().setStorageProviderKey('supabase')
      toast(`${opt.label} disconnected. Switched back to ICT-Lab Cloud.`)
    } else {
      toast(`${opt.label} disconnected.`)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 560, width: '100%', border: '1px solid var(--border)', maxHeight: '92vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>🗄️ Storage Settings</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}>×</button>
        </div>

        {/* Recommended quick option */}
        <div onClick={setAllWebsite} style={{ border: `2px solid ${isAllWebsite() ? '#1D9E75' : 'var(--border)'}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', background: isAllWebsite() ? '#E1F5EE' : 'var(--surface2)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 28 }}>☁️</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>ICT-Lab Cloud for everything</span>
              <span style={{ fontSize: 11, background: '#1D9E75', color: '#fff', borderRadius: 4, padding: '1px 8px', fontWeight: 700 }}>⭐ Recommended</span>
              {isAllWebsite() && <span style={{ fontSize: 11, background: '#1D9E75', color: '#fff', borderRadius: 4, padding: '1px 8px', fontWeight: 700 }}>Active</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Best performance • Always accessible • Full features • You can still delete anytime</div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Or customize per data type</div>

        {/* Category A */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>📋 Core Data <span style={{ fontWeight: 400, color: 'var(--text3)' }}>— SOPs, equipment info, calibration docs, training records, messages</span></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MODE_OPTIONS.map(m => (
              <button key={m.key} onClick={() => setModeA(m.key)}
                style={{ flex: 1, minWidth: 130, padding: '8px 10px', border: `2px solid ${modeA === m.key ? '#534AB7' : 'var(--border)'}`, borderRadius: 8, background: modeA === m.key ? '#ede9fe' : 'var(--surface)', cursor: 'pointer', textAlign: 'left', fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: modeA === m.key ? '#534AB7' : 'var(--text)', marginBottom: 2 }}>{m.icon} {m.label}{m.recommended ? ' ⭐' : ''}</div>
                <div style={{ color: 'var(--text3)', fontSize: 11 }}>{m.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Category B */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>📊 Activity &amp; Workspace Data <span style={{ fontWeight: 400, color: 'var(--text3)' }}>— test results, project files, QR records, inspection results</span></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MODE_OPTIONS.map(m => (
              <button key={m.key} onClick={() => setModeB(m.key)}
                style={{ flex: 1, minWidth: 130, padding: '8px 10px', border: `2px solid ${modeB === m.key ? '#534AB7' : 'var(--border)'}`, borderRadius: 8, background: modeB === m.key ? '#ede9fe' : 'var(--surface)', cursor: 'pointer', textAlign: 'left', fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: modeB === m.key ? '#534AB7' : 'var(--text)', marginBottom: 2 }}>{m.icon} {m.label}{m.recommended ? ' ⭐' : ''}</div>
                <div style={{ color: 'var(--text3)', fontSize: 11 }}>{m.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* External provider picker */}
        {needsProvider && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Connect your external provider</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PROVIDER_OPTIONS.map(opt => (
                <ProviderRow key={opt.key} opt={opt}
                  connected={statuses[opt.key]}
                  active={currentProvider === opt.key}
                  onSelect={connectProvider}
                  onDisconnect={disconnectProvider}
                  connecting={connecting} />
              ))}
            </div>
            {externalWarn && (
              <div style={{ marginTop: 10, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#92400e' }}>
                ⚠️ {EXTERNAL_WARN}
              </div>
            )}
            {currentProvider === 'localfolder' && (
              <div style={{ marginTop: 8, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#92400e' }}>
                ⚠️ {LOCAL_WARN}
              </div>
            )}
          </div>
        )}

        {/* Group workspace storage */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginBottom: 4 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>👥 Group Workspace Storage</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>Where are shared files stored when teammates collaborate in your workspace?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setGroupStorage('website')}
              style={{ flex: 1, minWidth: 160, padding: '10px 12px', border: `2px solid ${groupStorage === 'website' ? '#1D9E75' : 'var(--border)'}`, borderRadius: 8, background: groupStorage === 'website' ? '#E1F5EE' : 'var(--surface)', cursor: 'pointer', textAlign: 'left', fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: groupStorage === 'website' ? '#1D9E75' : 'var(--text)', marginBottom: 2 }}>☁️ ICT-Lab Cloud ⭐</div>
              <div style={{ color: 'var(--text3)', fontSize: 11 }}>Group files on ICT-Lab's servers. New members are informed before accepting.</div>
            </button>
            {PROVIDER_OPTIONS.filter(o => o.oauth).map(opt => (
              <button key={opt.key} onClick={() => { setGroupStorage(opt.key); if (!statuses[opt.key]) connectProvider(opt) }}
                style={{ flex: 1, minWidth: 160, padding: '10px 12px', border: `2px solid ${groupStorage === opt.key ? opt.color : 'var(--border)'}`, borderRadius: 8, background: groupStorage === opt.key ? opt.bg : 'var(--surface)', cursor: 'pointer', textAlign: 'left', fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: groupStorage === opt.key ? opt.color : 'var(--text)', marginBottom: 2 }}>{opt.icon} {opt.label}</div>
                <div style={{ color: 'var(--text3)', fontSize: 11 }}>Shared files go to a dedicated folder in your {opt.label}. Members are warned before accepting.</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
          Your account details (name, email, login) are always stored on ICT-Lab's servers regardless of your storage choice — they are needed to keep your account running.
        </div>
      </div>
    </div>
  )
}

// ── Team org-admin storage modal ───────────────────────────────────────────
function OrgStorageModal({ onClose, toast }) {
  const [mode, setMode_]     = useState(() => localStorage.getItem(ORG_MODE_KEY) || MODE_WEBSITE_ONLY)
  const [provider, setProvider_] = useState(() => localStorage.getItem(ORG_COPY_KEY) || '')
  const [statuses, refreshStatuses] = useProviderStatuses()
  const [connecting, setConnecting] = useState(null)

  function setMode(m) { setMode_(m); localStorage.setItem(ORG_MODE_KEY, m) }
  function setProvider(k) { setProvider_(k); localStorage.setItem(ORG_COPY_KEY, k) }

  async function connectProvider(opt) {
    if (opt.oauth && !providers[opt.key].isConnected()) {
      setConnecting(opt.key)
      try {
        await providers[opt.key].connect()
        toast(`${opt.label}: complete sign-in in the browser that opened.`)
      } catch (e) { toast('Could not open auth: ' + (e.message || '')) }
      setConnecting(null); return
    }
    setProvider(opt.key)
    refreshStatuses()
    toast(`Organisation backup provider set to ${opt.label} ✓`)
  }

  async function disconnectProvider(opt) {
    await providers[opt.key].disconnect?.()
    setProvider('')
    refreshStatuses()
    toast(`${opt.label} disconnected.`)
  }

  const needsProvider = mode !== MODE_WEBSITE_ONLY
  const isExternal = mode === MODE_EXTERNAL_ONLY

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 520, width: '100%', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>🏢 Organisation Storage</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}>×</button>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
          Choose how your organisation's files are stored. This setting applies to all team members. ICT-Lab Cloud is always recommended for the best experience.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {MODE_OPTIONS.map(m => (
            <button key={m.key} onClick={() => setMode(m.key)}
              style={{ padding: '12px 14px', border: `2px solid ${mode === m.key ? '#1D9E75' : 'var(--border)'}`, borderRadius: 10, background: mode === m.key ? '#E1F5EE' : 'var(--surface)', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{m.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: mode === m.key ? '#1D9E75' : 'var(--text)' }}>{m.label}{m.recommended ? ' ⭐' : ''}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{m.sub}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {isExternal && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
            ⚠️ <strong>Performance notice:</strong> When files are stored in an external provider, load times depend on your provider's speed and your team's internet connection. Some features may feel slower. ICT-Lab account and configuration data always stays on its servers.
          </div>
        )}

        {needsProvider && (
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Select provider for {isExternal ? 'organisation storage' : 'backup copies'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PROVIDER_OPTIONS.filter(o => o.oauth || o.server).map(opt => (
                <ProviderRow key={opt.key} opt={opt}
                  connected={statuses[opt.key]}
                  active={provider === opt.key}
                  onSelect={o => { connectProvider(o); setProvider(o.key) }}
                  onDisconnect={disconnectProvider}
                  connecting={connecting} />
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
          Files in any connected provider remain fully under your organisation's control. ICT-Lab does not access, manage, or delete them.
        </div>
      </div>
    </div>
  )
}

// ── Team user (non-admin) secondary storage modal ──────────────────────────
function TeamUserStorageModal({ onClose, toast }) {
  const [secondary, setSecondary_] = useState(() => localStorage.getItem(TEAM_B_KEY) || '')
  const [statuses, refreshStatuses] = useProviderStatuses()
  const [connecting, setConnecting] = useState(null)

  function setSecondary(k) { setSecondary_(k); if (k) localStorage.setItem(TEAM_B_KEY, k); else localStorage.removeItem(TEAM_B_KEY) }

  async function connectProvider(opt) {
    if (opt.oauth && !providers[opt.key].isConnected()) {
      setConnecting(opt.key)
      try {
        await providers[opt.key].connect()
        toast(`${opt.label}: complete sign-in in the browser that opened.`)
      } catch (e) { toast('Could not open auth: ' + (e.message || '')) }
      setConnecting(null); return
    }
    setSecondary(opt.key)
    refreshStatuses()
    toast(`Personal backup set to ${opt.label} ✓`)
  }

  async function disconnectProvider(opt) {
    await providers[opt.key].disconnect?.()
    setSecondary('')
    refreshStatuses()
    toast(`${opt.label} disconnected.`)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 480, width: '100%', border: '1px solid var(--border)' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>🗄️ Personal File Backup</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}>×</button>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
          Your organisation's admin controls where team files are primarily stored. You can optionally choose a personal cloud drive to receive an extra copy of your own activity and workspace data (test results, project files, etc.).
        </div>

        <button onClick={() => setSecondary('')}
          style={{ width: '100%', padding: '12px 14px', border: `2px solid ${!secondary ? '#1D9E75' : 'var(--border)'}`, borderRadius: 10, background: !secondary ? '#E1F5EE' : 'var(--surface)', cursor: 'pointer', textAlign: 'left', marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: !secondary ? '#1D9E75' : 'var(--text)' }}>☁️ No extra copy — use org default ⭐</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Your files follow the organisation's storage setting.</div>
        </button>

        {PROVIDER_OPTIONS.filter(o => o.oauth).map(opt => (
          <div key={opt.key} style={{ marginBottom: 8 }}>
            <ProviderRow opt={opt}
              connected={statuses[opt.key]}
              active={secondary === opt.key}
              onSelect={o => { connectProvider(o); setSecondary(o.key) }}
              onDisconnect={disconnectProvider}
              connecting={connecting} />
          </div>
        ))}

        <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
          ICT-Lab always keeps its own copy of your activity data. Your personal backup is an additional copy only.
        </div>
      </div>
    </div>
  )
}

// ── Main exported modal — context-aware ────────────────────────────────────
export default function StorageProviderModal({ onClose, toast }) {
  const { session } = useAppStore()
  const loginMode = session?.loginMode || localStorage.getItem('ictlab_login_mode') || 'team'
  const isOrgAdmin = loginMode === 'team' && session?.role === 'admin' && session?.userId !== null

  if (loginMode === 'solo') return <SoloStorageModal onClose={onClose} toast={toast} />
  if (isOrgAdmin) return <OrgStorageModal onClose={onClose} toast={toast} />
  return <TeamUserStorageModal onClose={onClose} toast={toast} />
}
