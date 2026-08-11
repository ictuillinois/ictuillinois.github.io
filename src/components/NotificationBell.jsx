import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'

const BLUE = '#0d47a1'

const BOOKING_ICONS = {
  booking_confirmed: '📅',
  booking_approved: '✅',
  booking_denied: '❌',
  before_photo_reminder: '📷',
  after_photo_reminder: '📷',
  after_photo_last_warning: '⚠️',
  missing_photo_manager: '🔍',
  waive_before_photo: '🙏',
  after_photo_review: '🔍',
  waive_response: '✅',
}

export default function NotificationBell() {
  const { session, setScreen, setPendingProfileTab, setPendingBookingNotif } = useAppStore()
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)
  const userId = session?.userId
  const unread = notifications.filter(n => !n.read).length

  useEffect(() => {
    if (!userId) return
    load()
    const ch1 = sb.channel(`notifications_${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, payload => {
        setNotifications(prev => [{ ...payload.new, _src: 'notif' }, ...prev])
      }).subscribe()
    const ch2 = sb.channel(`booking_notifs_${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_notifications', filter: `user_id=eq.${userId}` }, payload => {
        setNotifications(prev => [{ ...payload.new, _src: 'booking' }, ...prev])
      }).subscribe()
    return () => { sb.removeChannel(ch1); sb.removeChannel(ch2) }
  }, [userId])

  useEffect(() => {
    const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function load() {
    const [{ data: notifs }, { data: bookingNotifs }] = await Promise.all([
      sb.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
      sb.from('booking_notifications').select('*').eq('user_id', userId).eq('read', false).order('created_at', { ascending: false }).limit(20),
    ])
    const tagged = (bookingNotifs || []).map(n => ({ ...n, _src: 'booking' }))
    const merged = [...(notifs || []).map(n => ({ ...n, _src: 'notif' })), ...tagged]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 40)
    setNotifications(merged)
  }

  async function markRead(n) {
    if (n._src === 'booking') {
      await sb.from('booking_notifications').update({ read: true }).eq('id', n.id)
    } else {
      await sb.from('notifications').update({ read: true }).eq('id', n.id)
    }
    setNotifications(prev => prev.map(x => (x.id === n.id && x._src === n._src) ? { ...x, read: true } : x))
  }

  async function markAllRead() {
    await Promise.all([
      sb.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false),
      sb.from('booking_notifications').update({ read: true }).eq('user_id', userId).eq('read', false),
    ])
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  async function handleClick(n) {
    await markRead(n)
    if (n._src === 'booking') {
      if (n.type === 'waive_before_photo' || n.type === 'after_photo_review') {
        setPendingBookingNotif(n)
      }
      setScreen('booking')
    } else if (n.type === 'team_invite') {
      setPendingProfileTab('team')
      setScreen('profile')
    } else if (['training_submitted', 'training_approved', 'training_expiring', 'safety_step_submitted', 'safety_skip_request'].includes(n.type)) {
      setScreen('training')
    } else if (n.task_id) {
      setScreen('pm')
    }
    setOpen(false)
  }

  const formatTime = (ts) => {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  if (!userId) return null

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      <button onClick={() => setOpen(!open)}
        style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 8, color: 'white', fontSize: 18, display: 'flex', alignItems: 'center', transition: 'background 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
        🔔
        {unread > 0 && (
          <span style={{ position: 'absolute', top: 0, right: 0, width: 16, height: 16, borderRadius: '50%', background: '#ff3b30', color: 'white', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #0d47a1' }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 320, maxHeight: 420, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 500 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Notifications {unread > 0 && <span style={{ fontSize: 11, color: '#ff3b30', marginLeft: 4 }}>{unread} new</span>}</div>
            {unread > 0 && <button onClick={markAllRead} style={{ border: 'none', background: 'none', fontSize: 12, color: BLUE, cursor: 'pointer', fontWeight: 500 }}>Mark all read</button>}
          </div>
          {notifications.length === 0
            ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No notifications yet.</div>
            : notifications.map(n => {
              const title = n._src === 'booking' ? n.message : n.title
              const icon = n._src === 'booking'
                ? (BOOKING_ICONS[n.type] || '📅')
                : ({ new_message: '💬', task_comment: '💬', task_assigned: '📋', meeting_added: '📅', team_invite: '🤝', training_submitted: '🎓', training_approved: '✅', safety_step_submitted: '🦺', safety_skip_request: '⚠️' }[n.type] || '🔔')
              return (
                <div key={`${n._src}_${n.id}`} onClick={() => handleClick(n)}
                  style={{ display: 'flex', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--surface2)', cursor: 'pointer', background: n.read ? 'transparent' : '#f0f4ff', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : '#f0f4ff'}>
                  <div style={{ fontSize: 18, flexShrink: 0 }}>{icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                    {n.body && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>}
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{formatTime(n.created_at)}</div>
                  </div>
                  {!n.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: BLUE, flexShrink: 0, alignSelf: 'center' }} />}
                </div>
              )
            })
          }
        </div>
      )}
    </div>
  )
}
