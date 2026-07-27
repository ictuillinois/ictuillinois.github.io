import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'

const BLUE = '#0d47a1'
const LS_USERS_KEY = 'ictlab_admin_seen_solo_ts'
const LS_SUPPORT_KEY = 'ictlab_admin_seen_support_ts'

const NOTIF_TYPES = [
  { key: 'new_solo_user',      label: 'New Solo User Registrations', icon: '👤' },
  { key: 'support_message',    label: 'Customer Service Requests',   icon: '💬' },
  { key: 'feedback_response',  label: 'User Feedback Responses',     icon: '📝' },
  { key: 'app_error',          label: 'System Errors & Bugs',        icon: '🐛' },
]

const DEFAULT_PREFS = {
  new_solo_user:      { app: true, email: false },
  support_message:    { app: true, email: false },
  feedback_response:  { app: true, email: false },
  app_error:          { app: true, email: false },
}

export default function SuperAdminBell() {
  const [newUsers, setNewUsers]         = useState([])
  const [supportMsgs, setSupportMsgs]   = useState([])
  const [alerts, setAlerts]             = useState([])
  const [open, setOpen]                 = useState(false)
  const [showPrefs, setShowPrefs]       = useState(false)
  const [prefs, setPrefs]               = useState(DEFAULT_PREFS)
  const [prefsSaving, setPrefsSaving]   = useState(false)
  const panelRef = useRef(null)

  const feedbackAlerts = alerts.filter(a => a.type === 'feedback_response')
  const systemAlerts   = alerts.filter(a => a.type !== 'feedback_response')

  const unread =
    (prefs.new_solo_user?.app      ? newUsers.length    : 0) +
    (prefs.support_message?.app    ? supportMsgs.length : 0) +
    (prefs.feedback_response?.app  ? feedbackAlerts.filter(a => !a.read).length : 0) +
    (prefs.app_error?.app          ? systemAlerts.filter(a => !a.read).length   : 0)

  useEffect(() => {
    load()

    const ch1 = sb.channel('sa_solo_users')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'solo_users' }, p => {
        if (prefs.new_solo_user?.app) setNewUsers(prev => [p.new, ...prev])
      }).subscribe()

    const ch2 = sb.channel('sa_support_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, p => {
        if (prefs.support_message?.app) setSupportMsgs(prev => [p.new, ...prev])
      }).subscribe()

    const ch3 = sb.channel('sa_admin_notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_notifications' }, p => {
        setAlerts(prev => [p.new, ...prev])
      }).subscribe()

    return () => { sb.removeChannel(ch1); sb.removeChannel(ch2); sb.removeChannel(ch3) }
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
        setShowPrefs(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function load() {
    const usersSince   = localStorage.getItem(LS_USERS_KEY)   || new Date(0).toISOString()
    const supportSince = localStorage.getItem(LS_SUPPORT_KEY) || new Date(0).toISOString()

    const [{ data: users }, { data: support }, { data: notifs }, { data: prefRow }] = await Promise.all([
      sb.from('solo_users').select('id, name, email, created_at').gt('created_at', usersSince).order('created_at', { ascending: false }).limit(50),
      sb.from('support_messages').select('id, subject, user_name, user_email, message, created_at, status').gt('created_at', supportSince).order('created_at', { ascending: false }).limit(50),
      sb.from('admin_notifications').select('*').order('created_at', { ascending: false }).limit(50),
      sb.from('settings').select('value').eq('key', 'admin_notif_prefs').maybeSingle(),
    ])

    setNewUsers(users || [])
    setSupportMsgs(support || [])
    setAlerts(notifs || [])
    if (prefRow?.value) {
      try { setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(prefRow.value) }) } catch (_) {}
    }
  }

  async function savePrefs(updated) {
    setPrefsSaving(true)
    await sb.from('settings').upsert({ key: 'admin_notif_prefs', value: JSON.stringify(updated) })
    setPrefs(updated)
    setPrefsSaving(false)
  }

  function togglePref(type, channel) {
    const updated = { ...prefs, [type]: { ...prefs[type], [channel]: !prefs[type][channel] } }
    savePrefs(updated)
  }

  function markUsersSeen() {
    localStorage.setItem(LS_USERS_KEY, new Date().toISOString())
    setNewUsers([])
  }

  function markSupportSeen() {
    localStorage.setItem(LS_SUPPORT_KEY, new Date().toISOString())
    setSupportMsgs([])
  }

  async function markAlertRead(alert) {
    await sb.from('admin_notifications').update({ read: true }).eq('id', alert.id)
    setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, read: true } : a))
  }

  async function markAllAlertsRead() {
    await sb.from('admin_notifications').update({ read: true }).eq('read', false)
    setAlerts(prev => prev.map(a => ({ ...a, read: true })))
  }

  const fmt = (ts) => {
    const diff = Date.now() - new Date(ts).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  const SectionHeader = ({ label, count, onDismiss }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px 4px', background: 'var(--surface2)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label} {count > 0 && `(${count})`}</div>
      {onDismiss && <button onClick={onDismiss} style={{ border: 'none', background: 'none', fontSize: 11, color: 'var(--text3)', cursor: 'pointer', padding: '2px 4px' }}>Dismiss all</button>}
    </div>
  )

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      <button onClick={() => { setOpen(!open); setShowPrefs(false) }}
        style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 8, color: 'white', fontSize: 18, display: 'flex', alignItems: 'center', transition: 'background 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
        🔔
        {unread > 0 && (
          <span style={{ position: 'absolute', top: 0, right: 0, width: 16, height: 16, borderRadius: '50%', background: '#ff3b30', color: 'white', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #0d47a1' }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 360, maxHeight: 520, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 500 }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              Admin Alerts {unread > 0 && <span style={{ fontSize: 11, color: '#ff3b30', marginLeft: 4 }}>{unread} new</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {alerts.some(a => !a.read) && (
                <button onClick={markAllAlertsRead} style={{ border: 'none', background: 'none', fontSize: 11, color: BLUE, cursor: 'pointer', fontWeight: 500 }}>Mark all read</button>
              )}
              <button onClick={() => setShowPrefs(s => !s)}
                title="Notification preferences"
                style={{ border: 'none', background: showPrefs ? 'var(--surface2)' : 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15, padding: '2px 6px', color: showPrefs ? BLUE : 'var(--text2)', transition: 'background 0.15s' }}>
                ⚙️
              </button>
            </div>
          </div>

          {/* Preferences Panel */}
          {showPrefs && (
            <div style={{ borderBottom: '2px solid var(--border)', background: 'var(--row-a)', padding: '12px 16px' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: BLUE }}>Notification Preferences</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '6px 12px', alignItems: 'center', fontSize: 12 }}>
                <div style={{ color: 'var(--text3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Event</div>
                <div style={{ color: 'var(--text3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', textAlign: 'center' }}>App</div>
                <div style={{ color: 'var(--text3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', textAlign: 'center' }}>Email*</div>
                {NOTIF_TYPES.map(({ key, label, icon }) => (
                  <>
                    <div key={`lbl_${key}`} style={{ color: 'var(--text)', fontSize: 12 }}>{icon} {label}</div>
                    <div key={`app_${key}`} style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={!!prefs[key]?.app} onChange={() => togglePref(key, 'app')} style={{ cursor: 'pointer', accentColor: BLUE, width: 15, height: 15 }} />
                    </div>
                    <div key={`email_${key}`} style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={!!prefs[key]?.email} onChange={() => togglePref(key, 'email')} style={{ cursor: 'pointer', accentColor: BLUE, width: 15, height: 15 }} />
                    </div>
                  </>
                ))}
              </div>
              {prefsSaving && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Saving…</div>}
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
                * Set your notification email in <strong>Profile → Notification Email</strong>. Actual delivery requires a Supabase Edge Function (e.g. Resend).
              </div>
            </div>
          )}

          {/* New Solo Users */}
          {prefs.new_solo_user?.app && newUsers.length > 0 && (
            <>
              <SectionHeader label="New Solo Users" count={newUsers.length} onDismiss={markUsersSeen} />
              {newUsers.map(u => (
                <div key={u.id} style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--surface2)', background: '#eef6ff' }}>
                  <div style={{ fontSize: 18, flexShrink: 0 }}>👤</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || 'Unknown'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{fmt(u.created_at)}</div>
                  </div>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: BLUE, flexShrink: 0, alignSelf: 'center' }} />
                </div>
              ))}
            </>
          )}

          {/* Support / Feedback Messages */}
          {prefs.support_message?.app && supportMsgs.length > 0 && (
            <>
              <SectionHeader label="Customer Service" count={supportMsgs.length} onDismiss={markSupportSeen} />
              {supportMsgs.map(m => (
                <div key={m.id} style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--surface2)', background: '#fff8ee' }}>
                  <div style={{ fontSize: 18, flexShrink: 0 }}>💬</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject || '(no subject)'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.user_name ? `${m.user_name} · ` : ''}{m.user_email}</div>
                    {m.message && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.message}</div>}
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{fmt(m.created_at)}</div>
                  </div>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#e67e00', flexShrink: 0, alignSelf: 'center' }} />
                </div>
              ))}
            </>
          )}

          {/* User Feedback */}
          {prefs.feedback_response?.app && feedbackAlerts.length > 0 && (
            <>
              <SectionHeader label="User Feedback" count={feedbackAlerts.filter(a => !a.read).length} />
              {feedbackAlerts.map(a => (
                <div key={a.id} onClick={() => markAlertRead(a)}
                  style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--surface2)', cursor: 'pointer', background: a.read ? 'transparent' : '#fffbeb', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = a.read ? 'transparent' : '#fffbeb'}>
                  <div style={{ fontSize: 18, flexShrink: 0 }}>📝</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: a.read ? 400 : 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                    {a.body && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.body}</div>}
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{fmt(a.created_at)}</div>
                  </div>
                  {!a.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#d97706', flexShrink: 0, alignSelf: 'center' }} />}
                </div>
              ))}
            </>
          )}

          {/* System Errors */}
          {prefs.app_error?.app && systemAlerts.length > 0 && (
            <>
              <SectionHeader label="System Alerts" count={systemAlerts.filter(a => !a.read).length} />
              {systemAlerts.map(a => (
                <div key={a.id} onClick={() => markAlertRead(a)}
                  style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--surface2)', cursor: 'pointer', background: a.read ? 'transparent' : '#fff5f5', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = a.read ? 'transparent' : '#fff5f5'}>
                  <div style={{ fontSize: 18, flexShrink: 0 }}>{a.type === 'app_error' ? '🐛' : '⚠️'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: a.read ? 400 : 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                    {a.body && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.body}</div>}
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{fmt(a.created_at)}</div>
                  </div>
                  {!a.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#b71c1c', flexShrink: 0, alignSelf: 'center' }} />}
                </div>
              ))}
            </>
          )}

          {unread === 0 && !showPrefs && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No new notifications.</div>
          )}
        </div>
      )}
    </div>
  )
}
