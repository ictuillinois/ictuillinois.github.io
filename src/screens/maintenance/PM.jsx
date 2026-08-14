import * as XLSX from 'xlsx-js-style'
import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import { buildEmailHtml } from '../../lib/emailTemplate'
import ScrollTabs from '../../components/ScrollTabs'
import HelpPanel from '../../components/HelpPanel'

const BLUE = '#0d47a1'
const ORANGE = '#ff6b00'
const ORANGE_LIGHT = '#fff3e0'
const isDesktop = () => window.innerWidth >= 768

const PRIORITY = {
  high:   { label: 'High',   color: '#c84b2f', bg: '#fde8e8' },
  medium: { label: 'Medium', color: '#d97706', bg: '#fef3c7' },
  low:    { label: 'Low',    color: '#0d47a1', bg: '#e3f2fd' },
}

function PriorityBadge({ priority }) {
  const p = PRIORITY[priority] || PRIORITY.medium
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: p.bg, color: p.color }}>{p.label}</span>
}

function progressColor(pct) {
  if (pct === 100) return '#2e7d32'
  if (pct >= 75)  return '#0369a1'
  if (pct >= 50)  return BLUE
  if (pct >= 25)  return ORANGE
  return '#c84b2f'
}

async function sendNotification(userId, type, title, body, taskId = null) {
  if (!userId) return
  const { data: prefs } = await sb.from('notification_prefs').select('*').eq('user_id', userId).maybeSingle()
  if (!prefs || prefs[type] !== false) {
    await sb.from('notifications').insert({ user_id: userId, type, title, body, task_id: taskId, read: false })
  }
  if (prefs && prefs[`email_${type}`] === true) {
    const { data: user } = await sb.from('users').select('phone, email, organization_id').eq('id', userId).maybeSingle()
    const toEmail = user?.phone || user?.email
    if (toEmail) {
      let orgContact = null
      if (user?.organization_id) {
        const { data: org } = await sb.from('organizations').select('contact_name, contact_email').eq('id', user.organization_id).maybeSingle()
        orgContact = org
      }
      const htmlBody = buildEmailHtml({ title, body, ctaLabel: 'View Task in ICT-Lab →', ctaUrl: 'https://ictlab.app/?screen=pm', prefsUrl: 'https://ictlab.app/?screen=profile', orgContact })
      await sb.from('email_notifications_queue').insert({ to_email: toEmail, subject: title, body, html_body: htmlBody, user_id: userId, type })
        .then(({ error }) => { if (error) console.warn('PM email queue failed:', error.message) })
    }
  }
}

function ProgressCircle({ progress, onChange }) {
  const size = 36, stroke = 3
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (progress / 100) * circumference
  const color = progressColor(progress)
  const next = { 0: 25, 25: 50, 50: 75, 75: 100, 100: 0 }
  return (
    <div style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onChange(next[progress] ?? 0) }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#e0e0e0" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dashoffset 0.3s, stroke 0.3s' }}
        />
        <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="500" fill={color}>{progress}%</text>
      </svg>
    </div>
  )
}

function ProgressTape({ progress }) {
  const color = progressColor(progress)
  const segments = [{ pct: 25, label: '25%' }, { pct: 50, label: '50%' }, { pct: 75, label: '75%' }, { pct: 100, label: '100%' }]
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>Progress</span>
        <span style={{ fontSize: 12, fontWeight: 600, color }}>{progress}%</span>
      </div>
      <div style={{ position: 'relative', height: 10, background: '#e8e8e8', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${progress}%`, borderRadius: 99, background: `linear-gradient(to right, #c84b2f, ${ORANGE}, ${BLUE}, #2e7d32)`, backgroundSize: '400% 100%', backgroundPosition: `${100 - progress}% 0`, transition: 'width 0.5s ease' }} />
        {segments.map(s => <div key={s.pct} style={{ position: 'absolute', top: 0, left: `${s.pct}%`, width: 1, height: '100%', background: 'rgba(255,255,255,0.5)' }} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        {segments.map(s => <span key={s.pct} style={{ fontSize: 9, color: progress >= s.pct ? color : 'var(--text3)', fontWeight: progress >= s.pct ? 600 : 400 }}>{s.label}</span>)}
      </div>
    </div>
  )
}

function TaskComments({ taskId, currentUserId, currentUserName, assignedTo }) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    loadComments()
    const channel = sb.channel(`task_comments_${taskId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_comments', filter: `task_id=eq.${taskId}` }, payload => {
        setComments(prev => [...prev, payload.new])
      }).subscribe()
    return () => sb.removeChannel(channel)
  }, [taskId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [comments])

  async function loadComments() {
    const { data } = await sb.from('task_comments').select('*').eq('task_id', taskId).order('created_at', { ascending: true })
    setComments(data || []); setLoading(false)
  }

  async function postComment() {
    if (!newComment.trim()) return
    setPosting(true)
    const name = currentUserName || 'Lab Manager'
    await sb.from('task_comments').insert({ task_id: taskId, user_id: currentUserId || null, user_name: name, body: newComment.trim() }).select().single()
    if (assignedTo && assignedTo !== currentUserId) {
      await sendNotification(assignedTo, 'task_comment', 'New comment on your task', `${name}: ${newComment.trim().slice(0, 60)}`, taskId)
    }
    setNewComment('')
    setPosting(false)
  }

  const formatTime = (ts) => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        💬 Comments {comments.length > 0 && <span style={{ background: 'var(--surface2)', borderRadius: 99, padding: '1px 8px', fontSize: 11, color: 'var(--text3)' }}>{comments.length}</span>}
      </div>
      {loading ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>Loading…</div> : (
        <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {comments.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '12px 0' }}>No comments yet. Be the first!</div>}
          {comments.map(c => {
            const isMe = c.user_id === currentUserId || (!currentUserId && c.user_name === currentUserName)
            return (
              <div key={c.id} style={{ display: 'flex', gap: 8, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: isMe ? '#e8f0fe' : ORANGE_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: isMe ? BLUE : ORANGE, flexShrink: 0 }}>{c.user_name?.slice(0,2).toUpperCase()}</div>
                <div style={{ maxWidth: '75%' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2, textAlign: isMe ? 'right' : 'left' }}>{c.user_name} · {formatTime(c.created_at)}</div>
                  <div style={{ background: isMe ? '#e8f0fe' : 'var(--surface2)', borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '8px 12px', fontSize: 13, color: 'var(--text)' }}>{c.body}</div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={newComment} onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment() } }}
          placeholder="Add a comment… (Enter to send)" style={{ flex: 1, fontSize: 13 }} />
        <button className="btn btn-primary" onClick={postComment} disabled={posting || !newComment.trim()} style={{ flexShrink: 0, padding: '0 14px' }}>
          {posting ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}

function MiniCalendar({ tasks, onDayClick, initialCal, outOfLabDays }) {
  const [cal, setCal] = useState(() => initialCal || { year: new Date().getFullYear(), month: new Date().getMonth() })
  const today = new Date()
  const firstDay = new Date(cal.year, cal.month, 1).getDay()
  const daysInMonth = new Date(cal.year, cal.month + 1, 0).getDate()
  const monthName = new Date(cal.year, cal.month).toLocaleString('default', { month: 'long', year: 'numeric' })
  const tasksByDay = {}
  tasks.forEach(t => {
    if (!t.deadline) return
    const d = new Date(t.deadline + 'T12:00:00')
    if (d.getFullYear() === cal.year && d.getMonth() === cal.month) {
      const key = d.getDate(); tasksByDay[key] = (tasksByDay[key] || 0) + 1
    }
  })
  const oolDaySet = new Set((outOfLabDays || []).map(e => {
    const ds = typeof e === 'string' ? e : e.date
    const [y, m, day] = ds.split('-')
    return `${parseInt(y)}-${parseInt(m)-1}-${parseInt(day)}`
  }))
  const prev = () => setCal(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 })
  const next = () => setCal(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 })
  const isToday = (d) => d === today.getDate() && cal.month === today.getMonth() && cal.year === today.getFullYear()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa']
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={prev} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text2)', padding: '0 4px' }}>‹</button>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{monthName}</div>
        <button onClick={next} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text2)', padding: '0 4px' }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {DOW.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text3)', fontWeight: 500 }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />
          const count = tasksByDay[d] || 0
          const today_ = isToday(d)
          const isOOL = oolDaySet.has(`${cal.year}-${cal.month}-${d}`)
          const isClickable = count > 0 || isOOL
          return (
            <div key={d} onClick={() => isClickable && onDayClick(cal.year, cal.month, d)}
              style={{ textAlign: 'center', borderRadius: 6, padding: '4px 0', cursor: isClickable ? 'pointer' : 'default', background: today_ ? BLUE : isOOL && !count ? '#fff5f5' : 'transparent', border: count > 0 && !today_ ? `1px solid ${ORANGE}` : isOOL && !today_ ? '1px solid #fca5a5' : '1px solid transparent', transition: 'background 0.15s' }}
              onMouseEnter={e => { if (isClickable && !today_) e.currentTarget.style.background = count > 0 ? ORANGE_LIGHT : '#fee2e2' }}
              onMouseLeave={e => { if (!today_) e.currentTarget.style.background = isOOL && !count ? '#fff5f5' : 'transparent' }}>
              <div style={{ fontSize: 11, fontWeight: today_ ? 700 : 400, color: today_ ? 'white' : 'var(--text)' }}>{d}</div>
              {count > 0 && <div style={{ width: 14, height: 14, borderRadius: '50%', background: today_ ? 'white' : ORANGE, color: today_ ? BLUE : 'white', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '1px auto 0' }}>{count}</div>}
              {isOOL && count === 0 && <div style={{ fontSize: 9, color: today_ ? 'rgba(255,255,255,0.85)' : '#c84b2f', fontWeight: 700, lineHeight: 1.2, marginTop: 1 }}>✕</div>}
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8, textAlign: 'center' }}>
        {outOfLabDays?.length ? 'Orange = tasks due · Red ✕ = out of lab' : 'Highlighted days have tasks due'}
      </div>
    </div>
  )
}

// Requires: user_out_of_lab table in Supabase
// SQL: CREATE TABLE IF NOT EXISTS user_out_of_lab (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, user_id UUID, date DATE NOT NULL, note TEXT, organization_id UUID, login_mode TEXT DEFAULT 'team', created_at TIMESTAMPTZ DEFAULT NOW()); ALTER TABLE user_out_of_lab ENABLE ROW LEVEL SECURITY; CREATE POLICY "allow_all" ON user_out_of_lab FOR ALL USING (true) WITH CHECK (true);
function OutOfLabPanel({ userId, isSolo, orgId, onChanged }) {
  const [entries, setEntries] = useState([])
  const [newDateStart, setNewDateStart] = useState('')
  const [newDateEnd, setNewDateEnd] = useState('')
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useAppStore()
  const _od = new Date()
  const today = [_od.getFullYear(), String(_od.getMonth()+1).padStart(2,'0'), String(_od.getDate()).padStart(2,'0')].join('-')

  useEffect(() => { if (userId) load() }, [userId])

  async function load() {
    const { data } = await sb.from('user_out_of_lab').select('*').eq('user_id', userId).gte('date', today).order('date', { ascending: true })
    setEntries(data || [])
  }

  function datesBetween(start, end) {
    const dates = []
    const cur = new Date(start + 'T12:00:00')
    const last = new Date((end || start) + 'T12:00:00')
    while (cur <= last) {
      dates.push(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 1)
    }
    return dates
  }

  async function add() {
    if (!newDateStart) { toast('Pick a start date first.'); return }
    if (newDateEnd && newDateEnd < newDateStart) { toast('End date must be after start date.'); return }
    setSaving(true)
    const dates = datesBetween(newDateStart, newDateEnd)
    const rows = dates.map(d => ({ user_id: userId, date: d, note: newNote.trim() || null, organization_id: isSolo ? null : orgId, login_mode: isSolo ? 'solo' : 'team' }))
    const { data, error } = await sb.from('user_out_of_lab').insert(rows).select()
    if (error) { toast('Could not save: ' + error.message); setSaving(false); return }
    setEntries(prev => [...prev, ...(data || [])].sort((a, b) => a.date.localeCompare(b.date)))
    setNewDateStart(''); setNewDateEnd(''); setNewNote('')
    toast(dates.length > 1 ? `${dates.length} days marked as out of lab.` : 'Out of lab day saved.')
    setSaving(false)
    onChanged?.()
  }

  async function remove(id) {
    await sb.from('user_out_of_lab').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
    toast('Removed.')
    onChanged?.()
  }

  const inputStyle = { fontSize: 12, padding: '4px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', width: 'auto' }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Out of Lab</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>From</span>
        <input type="date" value={newDateStart} min={today} onChange={e => { setNewDateStart(e.target.value); if (newDateEnd && e.target.value > newDateEnd) setNewDateEnd('') }} style={{ ...inputStyle, flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: newDateStart ? 6 : 0 }}>
        <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>To</span>
        <input type="date" value={newDateEnd} min={newDateStart || today} onChange={e => setNewDateEnd(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <button className="btn btn-sm" onClick={add} disabled={saving || !newDateStart} style={{ fontSize: 11, flexShrink: 0 }}>+ Add</button>
      </div>
      {newDateStart && (
        <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Reason (optional)" style={{ ...inputStyle, width: '100%', marginBottom: 8, boxSizing: 'border-box' }} />
      )}
      {entries.length === 0
        ? <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '8px 0' }}>No upcoming out-of-lab days.</div>
        : <div style={{ marginTop: 8 }}>{entries.map(e => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--surface2)' }}>
            <span style={{ fontSize: 11, color: '#c84b2f', fontWeight: 700, flexShrink: 0, lineHeight: 1 }}>✕</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
              {e.note && <div style={{ fontSize: 10, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.note}</div>}
            </div>
            <button onClick={() => remove(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c84b2f', fontSize: 15, padding: '1px 4px', opacity: 0.6, lineHeight: 1, flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>×</button>
          </div>
        ))}</div>
      }
    </div>
  )
}

// Requires: team_task_groups + team_task_group_members tables (see CLAUDE.md SQL)
function TaskGroupPanel({ userId, orgId, onGroupChange }) {
  const [myGroup, setMyGroup] = useState(null)
  const [accepted, setAccepted] = useState([])
  const [pendingOut, setPendingOut] = useState([])
  const [pendingIn, setPendingIn] = useState([])
  const [orgUsers, setOrgUsers] = useState([])
  const [inviteeId, setInviteeId] = useState('')
  const [groupName, setGroupName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [saving, setSaving] = useState(false)
  const { toast } = useAppStore()

  useEffect(() => { if (userId) load() }, [userId])

  async function load() {
    const { data: myMembership } = await sb.from('team_task_group_members').select('id, group_id').eq('user_id', userId).eq('status', 'accepted').maybeSingle()
    if (myMembership) {
      const { data: grp } = await sb.from('team_task_groups').select('id, name').eq('id', myMembership.group_id).maybeSingle()
      setMyGroup(grp)
      const { data: allMembers } = await sb.from('team_task_group_members').select('id, user_id, status').eq('group_id', myMembership.group_id)
      const uids = [...new Set((allMembers || []).map(m => m.user_id).filter(Boolean))]
      const { data: users } = uids.length ? await sb.from('users').select('id, name').in('id', uids) : { data: [] }
      const uMap = Object.fromEntries((users || []).map(u => [u.id, u.name]))
      setAccepted((allMembers || []).filter(m => m.status === 'accepted' && m.user_id !== userId).map(m => ({ ...m, name: uMap[m.user_id] || 'Unknown' })))
      setPendingOut((allMembers || []).filter(m => m.status === 'pending').map(m => ({ ...m, name: uMap[m.user_id] || 'Unknown' })))
      setPendingIn([])
    } else {
      setMyGroup(null); setAccepted([]); setPendingOut([])
      const { data: incoming } = await sb.from('team_task_group_members').select('id, group_id, invited_by').eq('user_id', userId).eq('status', 'pending')
      if (incoming?.length) {
        const gids = incoming.map(i => i.group_id)
        const iids = incoming.map(i => i.invited_by).filter(Boolean)
        const [{ data: grps }, { data: inv }] = await Promise.all([
          sb.from('team_task_groups').select('id, name').in('id', gids),
          iids.length ? sb.from('users').select('id, name').in('id', iids) : Promise.resolve({ data: [] })
        ])
        const gMap = Object.fromEntries((grps || []).map(g => [g.id, g.name]))
        const iMap = Object.fromEntries((inv || []).map(u => [u.id, u.name]))
        setPendingIn(incoming.map(i => ({ ...i, groupName: gMap[i.group_id] || 'Unknown group', inviterName: iMap[i.invited_by] || 'Someone' })))
      } else { setPendingIn([]) }
    }
    const { data: ou } = await sb.from('users').select('id, name').eq('role', 'lab_user').eq('is_active', true).eq('organization_id', orgId).neq('id', userId).order('name')
    setOrgUsers(ou || [])
  }

  async function createGroup() {
    if (!groupName.trim()) { toast('Enter a group name.'); return }
    setSaving(true)
    const { data: grp, error } = await sb.from('team_task_groups').insert({ name: groupName.trim(), organization_id: orgId, created_by: userId }).select().single()
    if (error) { toast('Error: ' + error.message); setSaving(false); return }
    await sb.from('team_task_group_members').insert({ group_id: grp.id, user_id: userId, invited_by: userId, status: 'accepted' })
    setGroupName(''); setShowCreate(false); setSaving(false)
    onGroupChange?.(grp.id); toast('Group created!'); load()
  }

  async function invite() {
    if (!inviteeId || !myGroup) return
    const { data: ex } = await sb.from('team_task_group_members').select('id').eq('group_id', myGroup.id).eq('user_id', inviteeId).maybeSingle()
    if (ex) { toast('Already in group or invited.'); return }
    await sb.from('team_task_group_members').insert({ group_id: myGroup.id, user_id: inviteeId, invited_by: userId, status: 'pending' })
    setInviteeId(''); setShowInvite(false); toast('Invite sent!'); load()
  }

  async function accept(inviteId, groupId) {
    await sb.from('team_task_group_members').update({ status: 'accepted' }).eq('id', inviteId)
    onGroupChange?.(groupId); toast('Joined group!'); load()
  }

  async function decline(inviteId) {
    await sb.from('team_task_group_members').delete().eq('id', inviteId)
    toast('Invite declined.'); load()
  }

  async function leaveGroup() {
    if (!confirm('Leave this group? You will no longer see Group Tasks.')) return
    await sb.from('team_task_group_members').delete().eq('group_id', myGroup.id).eq('user_id', userId)
    setMyGroup(null); setAccepted([]); setPendingOut([])
    onGroupChange?.(null); toast('You left the group.'); load()
  }

  async function cancelInvite(id) {
    await sb.from('team_task_group_members').delete().eq('id', id)
    toast('Invite cancelled.'); load()
  }

  const available = orgUsers.filter(u => !accepted.some(a => a.user_id === u.id) && !pendingOut.some(p => p.user_id === u.id))

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Task Group</div>

      {!myGroup && pendingIn.length > 0 && pendingIn.map(inv => (
        <div key={inv.id} style={{ background: '#E1F5EE', border: '1px solid #a7d4be', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D9E75', marginBottom: 1 }}>"{inv.groupName}"</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>Invited by {inv.inviterName}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-primary" onClick={() => accept(inv.id, inv.group_id)} style={{ fontSize: 11 }}>Accept</button>
            <button className="btn btn-sm" onClick={() => decline(inv.id)} style={{ fontSize: 11 }}>Decline</button>
          </div>
        </div>
      ))}

      {!myGroup && (
        <>
          {pendingIn.length === 0 && <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '4px 0', marginBottom: 8 }}>No active group.</div>}
          {showCreate
            ? <div>
                <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Group name" autoFocus
                  style={{ width: '100%', fontSize: 12, padding: '4px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', marginBottom: 6, boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm btn-primary" onClick={createGroup} disabled={saving} style={{ fontSize: 11 }}>Create</button>
                  <button className="btn btn-sm" onClick={() => { setShowCreate(false); setGroupName('') }} style={{ fontSize: 11 }}>Cancel</button>
                </div>
              </div>
            : <button className="btn btn-sm" onClick={() => setShowCreate(true)} style={{ fontSize: 11, width: '100%' }}>+ Create group</button>
          }
        </>
      )}

      {myGroup && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>{myGroup.name}</div>
          {accepted.length === 0
            ? <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>Only you so far — invite others!</div>
            : <div style={{ marginBottom: 8 }}>{accepted.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#1D9E75', flexShrink: 0 }}>{m.name?.slice(0,2).toUpperCase()}</div>
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>{m.name}</span>
                </div>
              ))}</div>
          }
          {pendingOut.length > 0 && (
            <div style={{ marginBottom: 8 }}>{pendingOut.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff3e0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: ORANGE, flexShrink: 0 }}>{p.name?.slice(0,2).toUpperCase()}</div>
                <span style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', flex: 1 }}>{p.name} (pending)</span>
                <button onClick={() => cancelInvite(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c84b2f', fontSize: 14, padding: '1px 4px', opacity: 0.6, lineHeight: 1 }}
                  onMouseEnter={e => e.currentTarget.style.opacity='1'} onMouseLeave={e => e.currentTarget.style.opacity='0.6'}>×</button>
              </div>
            ))}</div>
          )}
          {showInvite
            ? <div style={{ marginBottom: 8 }}>
                <select value={inviteeId} onChange={e => setInviteeId(e.target.value)}
                  style={{ width: '100%', fontSize: 12, padding: '4px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', marginBottom: 6 }}>
                  <option value="">— Select lab user —</option>
                  {available.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm btn-primary" onClick={invite} disabled={!inviteeId} style={{ fontSize: 11 }}>Send invite</button>
                  <button className="btn btn-sm" onClick={() => { setShowInvite(false); setInviteeId('') }} style={{ fontSize: 11 }}>Cancel</button>
                </div>
              </div>
            : available.length > 0 && <button className="btn btn-sm" onClick={() => setShowInvite(true)} style={{ fontSize: 11, width: '100%', marginBottom: 6 }}>+ Invite lab user</button>
          }
          <button onClick={leaveGroup} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c84b2f', fontSize: 11, padding: '4px 0', width: '100%', textAlign: 'center', marginTop: 2 }}>Leave group</button>
        </>
      )}
    </div>
  )
}

// Requires: task_attachments table + task-files storage bucket in Supabase
// SQL: CREATE TABLE task_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid REFERENCES tasks(id) ON DELETE CASCADE, file_name text, file_url text, file_size bigint, uploaded_by text, created_at timestamptz DEFAULT now());
function TaskAttachments({ taskId, userName, refreshToken }) {
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const { toast } = useAppStore()

  useEffect(() => { loadAttachments() }, [taskId, refreshToken])

  async function loadAttachments() {
    const { data } = await sb.from('task_attachments').select('*').eq('task_id', taskId).order('created_at', { ascending: false })
    setAttachments(data || [])
  }

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast('File too large (max 10MB)'); return }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${taskId}/${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage.from('task-files').upload(path, file)
      if (upErr) throw upErr
      const { data: { publicUrl } } = sb.storage.from('task-files').getPublicUrl(path)
      const { data, error } = await sb.from('task_attachments').insert({ task_id: taskId, file_name: file.name, file_url: publicUrl, file_size: file.size, uploaded_by: userName || 'Lab Manager' }).select().single()
      if (error) throw error
      if (data) setAttachments(prev => [data, ...prev])
      toast('File attached!')
    } catch (err) { toast('Upload failed: ' + (err?.message || String(err))) }
    setUploading(false)
    e.target.value = ''
  }

  async function deleteAttachment(att) {
    if (!confirm(`Delete "${att.file_name}"?`)) return
    try {
      const url = new URL(att.file_url)
      const path = url.pathname.split('/task-files/')[1]
      if (path) await sb.storage.from('task-files').remove([decodeURIComponent(path)])
    } catch {}
    await sb.from('task_attachments').delete().eq('id', att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
    toast('Attachment deleted.')
  }

  const fmtSize = (b) => !b ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>📎 Attachments {attachments.length > 0 && <span style={{ background: 'var(--surface2)', borderRadius: 99, padding: '1px 8px', fontSize: 11, color: 'var(--text3)' }}>{attachments.length}</span>}</span>
        <label style={{ cursor: uploading ? 'default' : 'pointer' }}>
          <input type="file" style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
          <span className="btn btn-sm" style={{ fontSize: 11, padding: '4px 10px', pointerEvents: 'none', opacity: uploading ? 0.6 : 1 }}>{uploading ? 'Uploading…' : '+ Attach file'}</span>
        </label>
      </div>
      {attachments.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '8px 0' }}>No attachments yet.</div>
        : attachments.map(att => {
          const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(att.file_name || '')
          const isDrawing = att.file_name?.startsWith('drawing_')
          return (
            <div key={att.id} style={{ background: 'var(--surface2)', borderRadius: 10, marginBottom: 8, overflow: 'hidden', border: isDrawing ? '1px solid #bfdbfe' : '1px solid transparent' }}>
              {isImage && (
                <a href={att.file_url} target="_blank" rel="noopener">
                  <img src={att.file_url} alt={att.file_name} style={{ width: '100%', maxHeight: 220, objectFit: 'contain', display: 'block', background: 'var(--row-a)', borderBottom: '1px solid var(--border)' }} />
                </a>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>{isDrawing ? '🎨' : isImage ? '🖼' : '📄'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={att.file_url} target="_blank" rel="noopener" style={{ fontSize: 12, fontWeight: 500, color: BLUE, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {isDrawing ? `Drawing — ${new Date(parseInt(att.file_name.replace('drawing_','').replace('.png',''))).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : att.file_name}
                  </a>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtSize(att.file_size)}{att.uploaded_by ? ` · ${att.uploaded_by}` : ''}</div>
                </div>
                <button onClick={() => deleteAttachment(att)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c84b2f', fontSize: 16, flexShrink: 0, lineHeight: 1 }}>×</button>
              </div>
            </div>
          )
        })
      }
    </div>
  )
}

// ── Live Drawing Board ────────────────────────────────────────────────────────
// Broadcasts strokes via Supabase Realtime (no DB writes until Save is clicked).
// Discard → nothing persisted. Save → PNG uploaded to task-files, inserted into
// task_attachments, then visible in the task's attachment list permanently.
function DrawingBoard({ taskId, taskTitle, currentUserName, onClose, onAttachmentSaved }) {
  const canvasRef = useRef(null)
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('#1a1a2e')
  const [lineWidth, setLineWidth] = useState(3)
  const [saving, setSaving] = useState(false)
  const [connectedCount, setConnectedCount] = useState(1)
  const { toast } = useAppStore()
  const channelRef = useRef(null)
  const isDrawingRef = useRef(false)
  const currentPath = useRef([])
  const allStrokes = useRef([])
  const toolRef = useRef('pen')
  const colorRef = useRef('#1a1a2e')
  const lineWidthRef = useRef(3)

  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { lineWidthRef.current = lineWidth }, [lineWidth])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = 800; canvas.height = 450
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)

    const channel = sb.channel(`drawing-${taskId}`, { config: { broadcast: { self: false }, presence: { key: currentUserName || 'user' } } })
    channel
      .on('broadcast', { event: 'stroke' }, ({ payload }) => {
        renderStroke(canvas, payload); allStrokes.current.push(payload)
      })
      .on('broadcast', { event: 'clear' }, () => {
        const c = canvas.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, canvas.width, canvas.height)
        allStrokes.current = []
      })
      .on('broadcast', { event: 'sync_request' }, () => {
        if (allStrokes.current.length > 0)
          channel.send({ type: 'broadcast', event: 'sync_strokes', payload: { strokes: allStrokes.current } })
      })
      .on('broadcast', { event: 'sync_strokes' }, ({ payload }) => {
        if (!payload?.strokes) return
        const c = canvas.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, canvas.width, canvas.height)
        payload.strokes.forEach(s => renderStroke(canvas, s))
        allStrokes.current = payload.strokes
      })
      .on('presence', { event: 'sync' }, () => {
        setConnectedCount(Object.keys(channel.presenceState()).length)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user: currentUserName || 'anonymous' })
          channel.send({ type: 'broadcast', event: 'sync_request', payload: {} })
        }
      })
    channelRef.current = channel
    return () => { sb.removeChannel(channel) }
  }, [taskId])

  function renderStroke(canvas, { points, color, lineWidth, tool }) {
    if (!points || points.length < 2) return
    const ctx = canvas.getContext('2d')
    ctx.save()
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
    ctx.stroke(); ctx.restore()
  }

  function getPos(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) }
  }

  function onPointerDown(e) {
    e.preventDefault(); isDrawingRef.current = true; currentPath.current = [getPos(e)]
  }
  function onPointerMove(e) {
    if (!isDrawingRef.current) return; e.preventDefault()
    const pos = getPos(e); currentPath.current.push(pos)
    if (currentPath.current.length >= 2)
      renderStroke(canvasRef.current, { points: currentPath.current.slice(-2), color: colorRef.current, lineWidth: lineWidthRef.current, tool: toolRef.current })
  }
  function onPointerUp(e) {
    if (!isDrawingRef.current) return; isDrawingRef.current = false
    const stroke = { points: currentPath.current, color: colorRef.current, lineWidth: lineWidthRef.current, tool: toolRef.current }
    allStrokes.current.push(stroke)
    channelRef.current?.send({ type: 'broadcast', event: 'stroke', payload: stroke })
    currentPath.current = []
  }

  function clearBoard() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    allStrokes.current = []; channelRef.current?.send({ type: 'broadcast', event: 'clear', payload: {} })
  }

  async function saveDrawing() {
    setSaving(true)
    try {
      const canvas = canvasRef.current
      if (!canvas) throw new Error('Canvas not ready.')
      const blob = await new Promise((res, rej) =>
        canvas.toBlob(b => b ? res(b) : rej(new Error('Canvas export failed.')), 'image/png')
      )
      const fileName = `drawing_${Date.now()}.png`
      const path = `${taskId}/${fileName}`
      const { error: upErr } = await sb.storage.from('task-files').upload(path, blob, { contentType: 'image/png' })
      if (upErr) throw new Error('Upload failed: ' + upErr.message)
      const { data: { publicUrl } } = sb.storage.from('task-files').getPublicUrl(path)
      const { data: att, error: insertErr } = await sb.from('task_attachments')
        .insert({ task_id: taskId, file_name: fileName, file_url: publicUrl, file_size: blob.size, uploaded_by: currentUserName || 'Lab Manager' })
        .select().single()
      if (insertErr) throw new Error('Could not link drawing: ' + insertErr.message)
      toast('Drawing saved!')
      onAttachmentSaved?.(att)
      onClose()
    } catch (err) {
      toast(err.message || 'Save failed.')
    }
    setSaving(false)
  }

  const COLORS = ['#1a1a2e', '#1D9E75', '#0369a1', '#c84b2f', '#92400e', '#5b21b6', '#be185d', '#ffffff']

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>🎨 {taskTitle}</span>
          {connectedCount > 1 && <span style={{ fontSize: 11, color: '#065f46', background: '#d1fae5', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>👥 {connectedCount} live</span>}
          <div style={{ flex: 1 }} />
          {[{ k: 'pen', l: '✏️ Pen' }, { k: 'eraser', l: '🧹 Eraser' }].map(t => (
            <button key={t.k} onClick={() => setTool(t.k)} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid', cursor: 'pointer', background: tool === t.k ? (t.k === 'pen' ? 'var(--accent)' : '#e5e7eb') : 'transparent', color: tool === t.k ? (t.k === 'pen' ? '#fff' : '#374151') : 'var(--text2)', borderColor: tool === t.k ? (t.k === 'pen' ? 'var(--accent)' : '#9ca3af') : 'var(--border)' }}>{t.l}</button>
          ))}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => { setColor(c); setTool('pen') }}
                style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: color === c && tool === 'pen' ? '3px solid var(--accent)' : '1px solid var(--border)', cursor: 'pointer', padding: 0 }} />
            ))}
            <input type="color" value={color} onChange={e => { setColor(e.target.value); setTool('pen') }} style={{ width: 24, height: 22, padding: 0, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }} title="Custom color" />
          </div>
          <select value={lineWidth} onChange={e => setLineWidth(Number(e.target.value))} style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}>
            <option value={2}>Thin</option>
            <option value={4}>Medium</option>
            <option value={8}>Thick</option>
            <option value={16}>Bold</option>
          </select>
          <button onClick={clearBoard} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #fca5a5', background: 'transparent', color: '#c84b2f', cursor: 'pointer' }}>🗑 Clear</button>
        </div>
        {/* Canvas */}
        <canvas ref={canvasRef}
          style={{ width: '100%', height: 450, cursor: tool === 'eraser' ? 'cell' : 'crosshair', display: 'block', touchAction: 'none', background: '#fff' }}
          onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
          onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}
        />
        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--border)', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text3)', flex: 1 }}>Live — all participants see your strokes in real time. Save attaches a PNG to this task permanently.</span>
          <button onClick={onClose} disabled={saving}
            style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1.5px solid #fca5a5', background: '#fff5f5', color: '#c84b2f', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            🗑 Discard
          </button>
          <button onClick={saveDrawing} disabled={saving}
            style={{ fontSize: 13, padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 4 }}>
            {saving ? 'Saving…' : '💾 Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TaskModal({ task, onClose, onUpdate, onDelete, currentUserId, currentUserName }) {
  const [localTask, setLocalTask] = useState(task)
  const [saving, setSaving] = useState(false)
  const [creatorName, setCreatorName] = useState(null)
  const [meetingDate, setMeetingDate] = useState(null)
  const [iconUploading, setIconUploading] = useState(false)
  const [showDrawing, setShowDrawing] = useState(false)
  const [attachmentRefresh, setAttachmentRefresh] = useState(0)
  const { toast } = useAppStore()

  useEffect(() => {
    if (task.created_by && task.created_by !== task.assigned_to) {
      sb.from('users').select('name').eq('id', task.created_by).maybeSingle()
        .then(({ data }) => { if (data) setCreatorName(data.name) })
    }
    if (task.is_meeting_task && task.meeting_id) {
      sb.from('meetings').select('date').eq('id', task.meeting_id).maybeSingle()
        .then(({ data }) => { if (data) setMeetingDate(data.date) })
    }
  }, [task.id])
  const statusStyle = (s) => ({ todo: { background: '#f1f1f1', color: '#555' }, in_progress: { background: ORANGE_LIGHT, color: ORANGE }, done: { background: '#e8f5e9', color: '#2e7d32' } }[s] || {})
  const cycleStatus = async () => {
    const next = { todo: 'in_progress', in_progress: 'done', done: 'todo' }
    const newStatus = next[localTask.status]
    await sb.from('tasks').update({ status: newStatus }).eq('id', localTask.id)
    const updated = { ...localTask, status: newStatus }
    setLocalTask(updated); onUpdate(updated)
  }
  const cyclePriority = async () => {
    const order = ['high', 'medium', 'low']
    const cur = localTask.priority || 'medium'
    const nextP = order[(order.indexOf(cur) + 1) % order.length]
    await sb.from('tasks').update({ priority: nextP }).eq('id', localTask.id)
    const updated = { ...localTask, priority: nextP }
    setLocalTask(updated); onUpdate(updated)
  }
  const updateProgress = async (val) => {
    await sb.from('tasks').update({ progress: val }).eq('id', localTask.id)
    const updated = { ...localTask, progress: val }
    setLocalTask(updated); onUpdate(updated)
  }
  const saveDetails = async () => {
    setSaving(true)
    await sb.from('tasks').update({ notes: localTask.notes, start_date: localTask.start_date || null, start_time: localTask.start_time || null, deadline: localTask.deadline || null, deadline_time: localTask.deadline_time || null, reference_url: localTask.reference_url || null, icon_url: localTask.icon_url || null }).eq('id', localTask.id)
    onUpdate(localTask); setSaving(false); toast('Task details saved!')
  }
  const changeIcon = async (file) => {
    if (!file) return
    setIconUploading(true)
    const ext = file.name.split('.').pop().toLowerCase()
    const iconPath = `icons/${localTask.id}_${Date.now()}.${ext}`
    const { error } = await sb.storage.from('task-files').upload(iconPath, file, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = sb.storage.from('task-files').getPublicUrl(iconPath)
      await sb.from('tasks').update({ icon_url: publicUrl }).eq('id', localTask.id)
      const updated = { ...localTask, icon_url: publicUrl }
      setLocalTask(updated); onUpdate(updated)
      toast('Icon updated!')
    } else { toast('Upload failed.') }
    setIconUploading(false)
  }
  const color = progressColor(localTask.progress || 0)
  const pData = PRIORITY[localTask.priority || 'medium']
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, paddingRight: 12 }}>
            <label style={{ cursor: 'pointer', flexShrink: 0 }} title={localTask.icon_url ? 'Change icon' : 'Add icon'}>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { changeIcon(e.target.files[0]); e.target.value = '' }} disabled={iconUploading} />
              <div style={{ width: 44, height: 44, borderRadius: 10, border: '1px dashed var(--border)', background: 'var(--surface2)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.15s', opacity: iconUploading ? 0.5 : 1 }}>
                {localTask.icon_url
                  ? <img src={localTask.icon_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 18 }}>🖼</span>}
              </div>
            </label>
            <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.3, paddingTop: 4 }}>{localTask.title}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: (creatorName || meetingDate) ? 10 : 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={cycleStatus} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, fontWeight: 600, border: 'none', cursor: 'pointer', ...statusStyle(localTask.status) }}>{localTask.status.replace('_', ' ')} ↻</button>
          <button onClick={cyclePriority} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, fontWeight: 600, border: 'none', cursor: 'pointer', background: pData.bg, color: pData.color }}>{pData.label} priority ↻</button>
          <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, background: '#e8f0fe', color: BLUE, fontWeight: 600 }}>{localTask.progress || 0}% complete</span>
        </div>
        {(creatorName || meetingDate) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {creatorName && (
              <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: '#e3f2fd', color: BLUE, fontWeight: 500 }}>👤 Assigned by {creatorName}</span>
            )}
            {meetingDate && (
              <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: '#f3e8ff', color: '#7c3aed', fontWeight: 500 }}>
                📋 Decided in meeting on {new Date(meetingDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
        )}
        <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <ProgressTape progress={localTask.progress || 0} />
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {[0, 25, 50, 75, 100].map(val => (
              <button key={val} onClick={() => updateProgress(val)}
                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, border: `1px solid ${(localTask.progress||0) === val ? color : 'var(--border)'}`, background: (localTask.progress||0) === val ? color : 'transparent', color: (localTask.progress||0) === val ? 'white' : 'var(--text2)', cursor: 'pointer', fontWeight: (localTask.progress||0) === val ? 600 : 400, transition: 'all 0.15s' }}>
                {val}%
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>📋 Task detail</div>
            <button onClick={() => setShowDrawing(true)}
              style={{ fontSize: 13, padding: '4px 14px', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              🎨 Drawing board
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Start date</label>
              <input type="date" value={localTask.start_date || ''} onChange={e => setLocalTask({ ...localTask, start_date: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Start time <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span></label>
              <input type="time" value={localTask.start_time || ''} onChange={e => setLocalTask({ ...localTask, start_time: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Deadline</label>
              <input type="date" value={localTask.deadline || ''} onChange={e => setLocalTask({ ...localTask, deadline: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Deadline time <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span></label>
              <input type="time" value={localTask.deadline_time || ''} onChange={e => setLocalTask({ ...localTask, deadline_time: e.target.value })} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Reference URL <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span></label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={localTask.reference_url || ''} onChange={e => setLocalTask({ ...localTask, reference_url: e.target.value })} placeholder="https://…" style={{ flex: 1, fontSize: 13 }} />
              {localTask.reference_url && (
                <a href={localTask.reference_url} target="_blank" rel="noopener" style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#e0f2fe', color: '#0369a1', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>Open →</a>
              )}
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Notes</label>
            <textarea rows={3} style={{ resize: 'vertical', width: '100%', boxSizing: 'border-box', fontSize: 13 }}
              value={localTask.notes || ''} onChange={e => setLocalTask({ ...localTask, notes: e.target.value })} placeholder="Add notes about this task…" />
          </div>
          {(currentUserId === localTask.assigned_to || currentUserId === localTask.created_by) && (
            <div
              onClick={async () => {
                const next = !localTask.remind_daily
                await sb.from('tasks').update({ remind_daily: next }).eq('id', localTask.id)
                const updated = { ...localTask, remind_daily: next }
                setLocalTask(updated); onUpdate(updated)
                toast(next ? '⏰ Daily 8 AM reminder enabled.' : 'Reminder turned off.')
              }}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: localTask.remind_daily ? '#fef3c7' : 'var(--surface2)', cursor: 'pointer', transition: 'background 0.15s', textAlign: 'left', marginTop: 10 }}
            >
              <input
                type="checkbox"
                checked={localTask.remind_daily || false}
                readOnly
                onClick={e => e.stopPropagation()}
                style={{ verticalAlign: 'middle', marginRight: 8, accentColor: '#d97706', width: 'auto' }}
              />
              <span style={{ verticalAlign: 'middle', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>⏰ Daily reminder at 8 AM</span>
              <span style={{ verticalAlign: 'middle', fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>
                {localTask.remind_daily ? '— on (for you)' : '— click to enable for yourself'}
              </span>
            </div>
          )}
          <button className="btn btn-primary" style={{ marginTop: 10, fontSize: 12, padding: '6px 16px' }} onClick={saveDetails} disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', marginBottom: 16 }} />
        <TaskComments taskId={localTask.id} currentUserId={currentUserId} currentUserName={currentUserName} assignedTo={localTask.assigned_to} />
        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />
        {showDrawing && (
          <DrawingBoard
            taskId={localTask.id}
            taskTitle={localTask.title}
            currentUserName={currentUserName}
            onClose={() => setShowDrawing(false)}
            onAttachmentSaved={() => setAttachmentRefresh(n => n + 1)}
          />
        )}
        <TaskAttachments taskId={localTask.id} userName={currentUserName} refreshToken={attachmentRefresh} />
        {onDelete && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => { if (confirm(`Delete "${localTask.title}"?`)) { onDelete(localTask.id); onClose() } }}
              style={{ background: 'none', border: '1px solid #fca5a5', color: '#c84b2f', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
              🗑 Delete task
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Overview({ userId, isOwnerAdmin, isSolo, orgId, onTaskClick }) {
  const [tasks, setTasks] = useState([])
  const [staffMap, setStaffMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [activePriority, setActivePriority] = useState(null)
  const { toast } = useAppStore()

  useEffect(() => {
    let q = sb.from('tasks').select('*').eq('login_mode', isSolo ? 'solo' : 'team')
    if (!isSolo) q = q.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
    if (!isOwnerAdmin && userId) q = q.or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
    const staffQ = isSolo ? Promise.resolve({ data: [] }) : (() => { let q = sb.from('users').select('id, name').eq('is_active', true); if (orgId) q = q.eq('organization_id', orgId); return q })()
    Promise.all([q, staffQ])
      .then(([{ data: t }, { data: u }]) => {
        setTasks(t || [])
        const map = {}; (u || []).forEach(x => { map[x.id] = x.name })
        setStaffMap(map); setLoading(false)
      })

    // Realtime: update progress/status in place without tab switch
    const channel = sb.channel('overview-tasks-' + (orgId || 'solo'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, ({ new: row }) => {
        setTasks(prev => prev.map(t => t.id === row.id ? { ...t, ...row } : t))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, ({ new: row }) => {
        const mine = !userId || row.assigned_to === userId || row.created_by === userId || isOwnerAdmin
        if (mine) setTasks(prev => [...prev, row])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, ({ old: row }) => {
        setTasks(prev => prev.filter(t => t.id !== row.id))
      })
      .subscribe()
    return () => sb.removeChannel(channel)
  }, [userId, isOwnerAdmin, isSolo, orgId])

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const in7 = new Date(today); in7.setDate(today.getDate() + 7)
  const total = tasks.length
  const done = tasks.filter(t => t.status === 'done').length
  const inProgress = tasks.filter(t => t.status === 'in_progress').length
  const todo = tasks.filter(t => t.status === 'todo').length
  const pct = total ? Math.round(tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / total) : 0
  const overdueTasks = tasks.filter(t => t.deadline && new Date(t.deadline + 'T23:59:59') < today && t.status !== 'done').sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
  const upcoming = tasks.filter(t => { if (!t.deadline || t.status === 'done') return false; const d = new Date(t.deadline + 'T12:00:00'); return d >= today && d <= in7 }).sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
  const byPriority = { high: 0, medium: 0, low: 0 }
  tasks.filter(t => t.status !== 'done').forEach(t => { byPriority[t.priority || 'medium']++ })

  function exportExcel() {
    try {
      const CENTER = { horizontal: 'center' }
      const HDR_STYLE = { fill: { fgColor: { rgb: 'BBDEFB' } }, font: { bold: true, color: { rgb: '0D47A1' } }, alignment: CENTER }
      const tRows = [['Title', 'Status', 'Priority', 'Progress %', 'Start Date', 'Deadline', 'Notes']]
      tasks.forEach(t => tRows.push([t.title, t.status.replace('_', ' '), t.priority || 'medium', t.progress || 0, t.start_date || '', t.deadline || '', t.notes || '']))
      const tWs = XLSX.utils.aoa_to_sheet(tRows)
      tWs['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 40 }]
      for (let c = 0; c < 7; c++) { const ref = XLSX.utils.encode_cell({ r: 0, c }); if (!tWs[ref]) tWs[ref] = { v: '', t: 's' }; tWs[ref].s = HDR_STYLE }
      for (let r = 1; r < tRows.length; r++) {
        const dl = tRows[r][5]; const isOD = dl && new Date(dl + 'T23:59:59') < today && tRows[r][1] !== 'done'
        for (let c = 0; c < 7; c++) { const ref = XLSX.utils.encode_cell({ r, c }); if (!tWs[ref]) tWs[ref] = { v: '', t: 's' }; if (isOD) tWs[ref].s = { fill: { fgColor: { rgb: 'FDE8E8' } }, font: { bold: true } }; else if (c >= 1 && c <= 5) tWs[ref].s = { alignment: CENTER } }
      }
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, tWs, 'My Tasks')
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `My_Tasks_${new Date().toLocaleDateString('en-CA')}.xlsx`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      toast('Export ready — overdue tasks highlighted in red')
    } catch (e) { toast('Export failed: ' + (e?.message || String(e))) }
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
        {[
          { label: 'Total', value: total, color: 'var(--text)' },
          { label: 'Done', value: done, color: '#2e7d32' },
          { label: 'In Progress', value: inProgress, color: ORANGE },
          { label: 'To Do', value: todo, color: 'var(--text2)' },
          { label: 'Overdue', value: overdueTasks.length, color: '#c84b2f' },
          { label: 'Overall', value: `${pct}%`, color: progressColor(pct) },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: `1px solid ${s.label === 'Overdue' && overdueTasks.length ? '#fca5a5' : 'var(--border)'}`, borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>My progress</div>
        <ProgressTape progress={pct} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Open tasks by priority</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {Object.entries(byPriority).map(([key, count]) => {
            const p = PRIORITY[key]
            const isActive = activePriority === key
            return (
              <div
                key={key}
                onClick={() => setActivePriority(isActive ? null : key)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, background: p.bg, borderRadius: 10, padding: '10px 16px', cursor: 'pointer', border: `2px solid ${isActive ? p.color : 'transparent'}`, transition: 'border-color 0.15s, opacity 0.15s', opacity: activePriority && !isActive ? 0.5 : 1 }}
              >
                <span style={{ fontSize: 22, fontWeight: 700, color: p.color }}>{count}</span>
                <span style={{ fontSize: 13, color: p.color, fontWeight: 600 }}>{p.label}</span>
                {isActive && <span style={{ fontSize: 11, color: p.color, marginLeft: 2 }}>▲</span>}
              </div>
            )
          })}
        </div>

        {activePriority && (() => {
          const p = PRIORITY[activePriority]
          const filtered = tasks.filter(t => t.status !== 'done' && (t.priority || 'medium') === activePriority)
          return (
            <div style={{ marginTop: 14, borderTop: `2px solid ${p.bg}`, paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: p.color, marginBottom: 8 }}>
                {filtered.length} {p.label} priority task{filtered.length !== 1 ? 's' : ''}
              </div>
              {filtered.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>No open {p.label.toLowerCase()} priority tasks.</div>
              ) : filtered.map((t, idx) => (
                <div
                  key={t.id}
                  onClick={() => onTaskClick?.(t)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 8, cursor: 'pointer', background: idx % 2 === 0 ? 'var(--row-a-strong)' : 'var(--row-b-strong)', marginBottom: 2, transition: 'background 0.13s' }}
                  onMouseEnter={e => e.currentTarget.style.background = p.bg}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'var(--row-a-strong)' : 'var(--row-b-strong)'}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                      {t.deadline && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Due {t.deadline}</span>}
                      {t.assigned_to && t.assigned_to !== userId && staffMap[t.assigned_to] && (
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>→ {staffMap[t.assigned_to]}</span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, background: t.status === 'in_progress' ? '#fff3e0' : 'var(--surface2)', color: t.status === 'in_progress' ? ORANGE : 'var(--text3)', borderRadius: 4, padding: '2px 6px', fontWeight: 600, flexShrink: 0 }}>
                    {t.status === 'in_progress' ? 'In Progress' : 'To Do'}
                  </span>
                </div>
              ))}
            </div>
          )
        })()}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            📅 Upcoming (next 7 days) <span style={{ background: '#e3f2fd', color: BLUE, borderRadius: 99, padding: '1px 8px', fontSize: 12 }}>{upcoming.length}</span>
          </div>
          {upcoming.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text3)' }}>No tasks due in the next 7 days.</div> : upcoming.map(t => (
            <div key={t.id} onClick={() => onTaskClick?.(t)} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--surface2)', cursor: 'pointer', borderRadius: 8, padding: '8px 6px', margin: '0 -6px 2px', transition: 'background 0.13s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: progressColor(t.progress || 0), flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Due {t.deadline}{t.deadline_time ? ` at ${t.deadline_time}` : ''}</div>
                {t.created_by && t.created_by !== userId && staffMap[t.created_by] && (
                  <div style={{ fontSize: 10, color: BLUE, marginTop: 1 }}>👤 Assigned by {staffMap[t.created_by]}</div>
                )}
                {t.assigned_to && t.assigned_to !== userId && staffMap[t.assigned_to] && (
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>→ Assigned to {staffMap[t.assigned_to]}</div>
                )}
              </div>
              <PriorityBadge priority={t.priority || 'medium'} />
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--surface)', border: `1px solid ${overdueTasks.length ? '#fca5a5' : 'var(--border)'}`, borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, color: overdueTasks.length ? '#c84b2f' : 'var(--text)' }}>
            ⚠ Overdue <span style={{ background: '#fde8e8', color: '#c84b2f', borderRadius: 99, padding: '1px 8px', fontSize: 12 }}>{overdueTasks.length}</span>
          </div>
          {overdueTasks.length === 0 ? <div style={{ fontSize: 13, color: '#2e7d32' }}>All your tasks are on track! ✓</div> : overdueTasks.map(t => (
            <div key={t.id} onClick={() => onTaskClick?.(t)} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--surface2)', cursor: 'pointer', borderRadius: 8, padding: '8px 6px', margin: '0 -6px 2px', transition: 'background 0.13s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#fff5f5'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#c84b2f', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                <div style={{ fontSize: 11, color: '#c84b2f' }}>Was due {t.deadline}</div>
                {t.created_by && t.created_by !== userId && staffMap[t.created_by] && (
                  <div style={{ fontSize: 10, color: BLUE, marginTop: 1 }}>👤 Assigned by {staffMap[t.created_by]}</div>
                )}
                {t.assigned_to && t.assigned_to !== userId && staffMap[t.assigned_to] && (
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>→ Assigned to {staffMap[t.assigned_to]}</div>
                )}
              </div>
              <PriorityBadge priority={t.priority || 'medium'} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn" onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>📥 Export to Excel</button>
      </div>
    </div>
  )
}

function CalendarView({ onTaskClick, userId, isOwnerAdmin, isSolo, orgId }) {
  const [tasks, setTasks] = useState([])
  const [outOfLab, setOutOfLab] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [calDayPopup, setCalDayPopup] = useState(null)

  useEffect(() => {
    async function load() {
      let q = sb.from('tasks').select('*').eq('login_mode', isSolo ? 'solo' : 'team')
      if (!isSolo) q = q.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
      if (!isOwnerAdmin && userId) q = q.or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
      // Admin sees all org members; others see only their own out-of-lab days
      let oolQ = sb.from('user_out_of_lab').select('id, user_id, date, note').eq('login_mode', isSolo ? 'solo' : 'team')
      if (!isSolo) oolQ = oolQ.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
      if (!isOwnerAdmin && userId) oolQ = oolQ.eq('user_id', userId)
      const [{ data: t }, { data: ool }] = await Promise.all([q, oolQ])
      setTasks(t || [])
      setOutOfLab(ool || [])
      setLoading(false)
    }
    load()
  }, [userId, isOwnerAdmin, isSolo, orgId])

  const now = new Date()
  const lastMonth = { year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), month: now.getMonth() === 0 ? 11 : now.getMonth() - 1 }
  const thisMonth = { year: now.getFullYear(), month: now.getMonth() }
  const nextMonth = { year: now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear(), month: now.getMonth() === 11 ? 0 : now.getMonth() + 1 }

  const statusStyle = (s) => ({ todo: { background: '#f1f1f1', color: '#555' }, in_progress: { background: ORANGE_LIGHT, color: ORANGE }, done: { background: '#e8f5e9', color: '#2e7d32' } }[s] || {})

  const filtered = tasks.filter(t => {
    if (filterStatus && t.status !== filterStatus) return false
    if (filterPriority && (t.priority || 'medium') !== filterPriority) return false
    return true
  })

  const tasksOnDay = (year, month, day) => filtered.filter(t => {
    if (!t.deadline) return false
    const d = new Date(t.deadline + 'T12:00:00')
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
  })

  const oolOnDay = (year, month, day) => {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return outOfLab.filter(e => e.date === ds)
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      {calDayPopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', width: '100%', maxWidth: 440, padding: 24, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{new Date(calDayPopup.year, calDayPopup.month, calDayPopup.day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
              <button onClick={() => setCalDayPopup(null)} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text3)' }}>×</button>
            </div>
            {oolOnDay(calDayPopup.year, calDayPopup.month, calDayPopup.day).map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 8, background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: '#c84b2f', fontWeight: 700, flexShrink: 0 }}>✕</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#c84b2f' }}>Out of lab{e.note ? ` — ${e.note}` : ''}</div>
                </div>
              </div>
            ))}
            {tasksOnDay(calDayPopup.year, calDayPopup.month, calDayPopup.day).map(task => (
              <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--surface2)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: progressColor(task.progress||0), flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    onClick={() => { setCalDayPopup(null); onTaskClick && onTaskClick(task) }}
                    style={{ fontSize: 13, fontWeight: 600, color: BLUE, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title="Open in My Tasks"
                  >{task.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    {task.deadline && <span>Due {new Date(task.deadline + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{task.deadline_time ? ` at ${task.deadline_time}` : ''}</span>}
                  </div>
                </div>
                <PriorityBadge priority={task.priority || 'medium'} />
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, flexShrink: 0, ...statusStyle(task.status) }}>{task.status.replace('_', ' ')}</span>
              </div>
            ))}
            {oolOnDay(calDayPopup.year, calDayPopup.month, calDayPopup.day).length === 0 && tasksOnDay(calDayPopup.year, calDayPopup.month, calDayPopup.day).length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '12px 0' }}>Nothing scheduled.</div>
            )}
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Click a task title to open details</span>
              <button className="btn" onClick={() => setCalDayPopup(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>Filter:</span>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <option value="">All statuses</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        {(filterStatus || filterPriority) && <button className="btn btn-sm" onClick={() => { setFilterStatus(''); setFilterPriority('') }} style={{ fontSize: 11 }}>Clear</button>}
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{filtered.filter(t => t.deadline).length} tasks with deadlines</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
        <MiniCalendar tasks={filtered} outOfLabDays={outOfLab} onDayClick={(y, m, d) => setCalDayPopup({ year: y, month: m, day: d })} initialCal={lastMonth} />
        <MiniCalendar tasks={filtered} outOfLabDays={outOfLab} onDayClick={(y, m, d) => setCalDayPopup({ year: y, month: m, day: d })} initialCal={thisMonth} />
        <MiniCalendar tasks={filtered} outOfLabDays={outOfLab} onDayClick={(y, m, d) => setCalDayPopup({ year: y, month: m, day: d })} initialCal={nextMonth} />
      </div>

      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>All deadlines</div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {filtered.filter(t => t.deadline).length === 0
          ? <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text3)' }}>No tasks with deadlines{filterStatus || filterPriority ? ' matching filters' : ''}.</div>
          : filtered.filter(t => t.deadline).sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).map(task => {
            const tod = new Date(); tod.setHours(0,0,0,0)
            const isOD = new Date(task.deadline + 'T12:00:00') < tod && task.status !== 'done'
            return (
              <div key={task.id}
                onClick={() => onTaskClick && onTaskClick(task)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--surface2)', background: isOD ? '#fef2f2' : 'transparent', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = isOD ? '#fde8e8' : 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = isOD ? '#fef2f2' : 'transparent'}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: isOD ? '#c84b2f' : progressColor(task.progress||0), flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: BLUE }}>{task.title}</div>
                  <div style={{ fontSize: 11, color: isOD ? '#c84b2f' : 'var(--text3)' }}>{isOD ? 'Overdue: ' : 'Due: '}{task.deadline}{task.deadline_time ? ` at ${task.deadline_time}` : ''}</div>
                </div>
                <PriorityBadge priority={task.priority || 'medium'} />
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, flexShrink: 0, ...statusStyle(task.status) }}>{task.status.replace('_', ' ')}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: progressColor(task.progress||0), flexShrink: 0 }}>{task.progress||0}%</span>
              </div>
            )
          })
        }
      </div>
    </div>
  )
}

function MyTasks({ userId, isAdmin, isOwnerAdmin, userName, isSolo, orgId, isStudent, pendingTask, onPendingTaskConsumed, onGroupChange }) {
  const [tasks, setTasks] = useState([])
  const [staffMap, setStaffMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState(null)
  const [outOfLab, setOutOfLab] = useState([])

  useEffect(() => {
    if (pendingTask) { setSelectedTask(pendingTask); onPendingTaskConsumed?.() }
  }, [pendingTask])
  const [calDayPopup, setCalDayPopup] = useState(null)
  const [desktop, setDesktop] = useState(isDesktop())
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', start_date: '', start_time: '', deadline: '', deadline_time: '', notes: '', priority: 'medium', is_private: isStudent ? true : false, remind_daily: false })
  const [saving, setSaving] = useState(false)
  const { toast } = useAppStore()

  async function loadOutOfLab() {
    if (!userId) return
    const today = new Date().toISOString().split('T')[0]
    const { data } = await sb.from('user_out_of_lab').select('id, date, note').eq('user_id', userId).gte('date', today).order('date', { ascending: true })
    setOutOfLab(data || [])
  }

  useEffect(() => {
    const handler = () => setDesktop(isDesktop())
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => { load(); loadOutOfLab() }, [userId, isOwnerAdmin, orgId, isSolo])

  async function load() {
    try {
      const mode = isSolo ? 'solo' : 'team'
      const orgFilter = orgId || '00000000-0000-0000-0000-000000000000'
      const baseQ = () => {
        let q = sb.from('tasks').select('*').eq('login_mode', mode)
        if (!isSolo) q = q.eq('organization_id', orgFilter)
        return q
      }
      const usersQ = isSolo
        ? Promise.resolve({ data: [] })
        : (() => { let q = sb.from('users').select('id, name').eq('is_active', true); if (orgId) q = q.eq('organization_id', orgId); return q })()

      let rawTasks
      if (isOwnerAdmin || !userId) {
        const [{ data, error }, { data: users }] = await Promise.all([baseQ(), usersQ])
        if (error) console.error('Load tasks error:', error)
        const map = {}; (users || []).forEach(u => { map[u.id] = u.name })
        setStaffMap(map)
        rawTasks = data || []
      } else {
        // Two explicit queries avoid any .or() ambiguity with UUIDs
        const [assignedRes, createdRes, { data: users }] = await Promise.all([
          baseQ().eq('assigned_to', userId),
          baseQ().eq('created_by', userId),
          usersQ,
        ])
        const map = {}; (users || []).forEach(u => { map[u.id] = u.name })
        setStaffMap(map)
        const seen = new Set()
        rawTasks = [...(assignedRes.data || []), ...(createdRes.data || [])].filter(t => {
          if (seen.has(t.id)) return false
          seen.add(t.id)
          return true
        })
      }
      const sorted = (rawTasks || []).sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return new Date(a.deadline) - new Date(b.deadline)
      })
      setTasks(sorted)
      if (userId) checkDeadlineNotifications(sorted)
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function checkDeadlineNotifications(taskList) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]
    const due = (taskList || []).filter(t => t.deadline === tomorrowStr && t.status !== 'done' && t.assigned_to === userId)
    for (const task of due) {
      const key = `ictlab_dl_notif_${task.id}_${todayStr}`
      if (localStorage.getItem(key)) continue
      localStorage.setItem(key, '1')
      await sendNotification(userId, 'deadline_reminder', '⏰ Task due tomorrow', `"${task.title}" is due tomorrow`, task.id)
    }
  }

  const toggleStatus = async (task, e) => {
    e.stopPropagation()
    const next = { todo: 'in_progress', in_progress: 'done', done: 'todo' }
    const newStatus = next[task.status]
    await sb.from('tasks').update({ status: newStatus }).eq('id', task.id)
    setTasks(tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
  }

  const updateProgress = async (task, val) => {
    await sb.from('tasks').update({ progress: val }).eq('id', task.id)
    setTasks(tasks.map(t => t.id === task.id ? { ...t, progress: val } : t))
  }

  const addTask = async () => {
    if (!newTask.title.trim()) { toast('Please enter a task title.'); return }
    setSaving(true)
    try {
      const payload = { title: newTask.title, start_date: newTask.start_date || null, start_time: newTask.start_time || null, deadline: newTask.deadline || null, deadline_time: newTask.deadline_time || null, notes: newTask.notes || '', status: 'todo', progress: 0, is_meeting_task: false, priority: newTask.priority || 'medium', is_private: newTask.is_private || false, remind_daily: newTask.remind_daily || false, login_mode: isSolo ? 'solo' : 'team', organization_id: !isSolo ? (orgId || null) : null }
      if (userId) { payload.assigned_to = userId; payload.created_by = userId }
      const { data, error } = await sb.from('tasks').insert(payload).select().single()
      if (error) throw error
      if (data) setTasks(prev => {
        const next = [...prev, data].sort((a, b) => {
          if (!a.deadline && !b.deadline) return 0
          if (!a.deadline) return 1
          if (!b.deadline) return -1
          return new Date(a.deadline) - new Date(b.deadline)
        })
        return next
      })
      setNewTask({ title: '', start_date: '', start_time: '', deadline: '', deadline_time: '', notes: '', priority: 'medium', is_private: isStudent ? true : false, remind_daily: false })
      setShowAddTask(false); toast('Task added!')
    } catch (err) { toast('Could not add task: ' + (err?.message || 'Check tasks table')) }
    setSaving(false)
  }

  const deleteTask = async (id) => {
    await sb.from('tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
    if (selectedTask?.id === id) setSelectedTask(null)
    toast('Task deleted.')
  }

  const done = tasks.filter(t => t.status === 'done').length
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0
  const statusStyle = (s) => ({ todo: { background: '#f1f1f1', color: '#555' }, in_progress: { background: ORANGE_LIGHT, color: ORANGE }, done: { background: '#e8f5e9', color: '#2e7d32' } }[s] || {})
  const tasksOnDay = (year, month, day) => tasks.filter(t => {
    if (!t.deadline) return false
    const d = new Date(t.deadline + 'T12:00:00')
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
  })

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      {selectedTask && <TaskModal task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={updated => { setTasks(tasks.map(t => t.id === updated.id ? updated : t)); setSelectedTask(updated) }} onDelete={deleteTask} currentUserId={userId} currentUserName={userName} />}

      {calDayPopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', width: '100%', maxWidth: 420, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Tasks due {new Date(calDayPopup.year, calDayPopup.month, calDayPopup.day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
              <button onClick={() => setCalDayPopup(null)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}>×</button>
            </div>
            {tasksOnDay(calDayPopup.year, calDayPopup.month, calDayPopup.day).map(task => (
              <div key={task.id} onClick={() => { setCalDayPopup(null); setSelectedTask(task) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--surface2)', cursor: 'pointer' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: progressColor(task.progress||0), flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{task.title}</div>
                  {desktop && task.notes && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{task.notes}</div>}
                </div>
                <PriorityBadge priority={task.priority || 'medium'} />
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, ...statusStyle(task.status) }}>{task.status.replace('_', ' ')}</span>
              </div>
            ))}
            <button className="btn" style={{ marginTop: 16 }} onClick={() => setCalDayPopup(null)}>Close</button>
          </div>
        </div>
      )}

      {showAddTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', overflowX: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 0' }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>Add new task</div>
              <button onClick={() => setShowAddTask(false)} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>
            {/* Body */}
            <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Task title *</label>
                <input value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} placeholder="What needs to be done?" autoFocus />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Priority</label>
                <select value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value })}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field" style={{ marginBottom: 0 }}><label>Start date</label><input type="date" value={newTask.start_date} onChange={e => setNewTask({ ...newTask, start_date: e.target.value })} /></div>
                <div className="field" style={{ marginBottom: 0 }}><label>Start time <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11 }}>(opt)</span></label><input type="time" value={newTask.start_time} onChange={e => setNewTask({ ...newTask, start_time: e.target.value })} /></div>
                <div className="field" style={{ marginBottom: 0 }}><label>Deadline</label><input type="date" value={newTask.deadline} onChange={e => setNewTask({ ...newTask, deadline: e.target.value })} /></div>
                <div className="field" style={{ marginBottom: 0 }}><label>Deadline time <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11 }}>(opt)</span></label><input type="time" value={newTask.deadline_time} onChange={e => setNewTask({ ...newTask, deadline_time: e.target.value })} /></div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Notes <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11 }}>(opt)</span></label>
                <textarea rows={3} style={{ resize: 'vertical' }} value={newTask.notes} onChange={e => setNewTask({ ...newTask, notes: e.target.value })} placeholder="Optional notes…" />
              </div>
              {/* Daily reminder toggle */}
              <div
                onClick={() => setNewTask(prev => ({ ...prev, remind_daily: !prev.remind_daily }))}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: newTask.remind_daily ? '#fef3c7' : 'var(--surface2)', cursor: 'pointer', transition: 'background 0.15s', textAlign: 'left' }}
              >
                <input
                  type="checkbox"
                  checked={newTask.remind_daily || false}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setNewTask(prev => ({ ...prev, remind_daily: e.target.checked }))}
                  style={{ verticalAlign: 'middle', marginRight: 8, accentColor: '#d97706', width: 'auto' }}
                />
                <span style={{ verticalAlign: 'middle', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>⏰ Remind me daily at 8 AM</span>
                <span style={{ verticalAlign: 'middle', fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>— until this task is done</span>
              </div>
              {/* Private toggle */}
              <div
                onClick={() => setNewTask(prev => ({ ...prev, is_private: !prev.is_private }))}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: newTask.is_private ? 'var(--accent-light)' : 'var(--surface2)', cursor: 'pointer', transition: 'background 0.15s', textAlign: 'left' }}
              >
                <input
                  type="checkbox"
                  checked={newTask.is_private}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setNewTask(prev => ({ ...prev, is_private: e.target.checked }))}
                  style={{ verticalAlign: 'middle', marginRight: 8, accentColor: 'var(--accent)', width: 'auto' }}
                />
                <span style={{ verticalAlign: 'middle', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>🔒 Private task</span>
                <span style={{ verticalAlign: 'middle', fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>
                  — {isStudent ? 'Hidden from group members.' : 'Others see this as "Personal task" — title and notes stay private.'}
                </span>
              </div>
            </div>
            {/* Footer */}
            <div style={{ display: 'flex', gap: 10, padding: '0 20px 20px' }}>
              <button className="btn btn-primary" onClick={addTask} disabled={saving} style={{ flex: 1 }}>{saving ? 'Adding…' : 'Add task'}</button>
              <button className="btn" onClick={() => setShowAddTask(false)} style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {[{ label: 'Total', value: tasks.length, color: 'var(--text)' }, { label: 'Done', value: done, color: '#2e7d32' }, { label: 'Progress', value: `${pct}%`, color: BLUE }].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: desktop ? '10px 16px' : '8px 12px' }}>
              {desktop && <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>{s.label}</div>}
              <div style={{ fontSize: desktop ? 20 : 16, fontWeight: 600, color: s.color }}>{s.value}</div>
              {!desktop && <div style={{ fontSize: 9, color: 'var(--text3)' }}>{s.label}</div>}
            </div>
          ))}
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowAddTask(true)} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>+</span>{desktop ? ' Add task' : ''}
          </button>
        )}
      </div>

      <div style={{ marginBottom: 20 }}><ProgressTape progress={pct} /></div>

      <div style={{ display: desktop ? 'grid' : 'block', gridTemplateColumns: desktop ? '1fr 220px' : undefined, gap: 20 }}>
        <div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {tasks.length === 0
              ? <div style={{ padding: 24, color: 'var(--text3)', fontSize: 14, textAlign: 'center' }}>No tasks yet.{isAdmin && <span onClick={() => setShowAddTask(true)} style={{ color: BLUE, cursor: 'pointer', marginLeft: 6 }}>Add one →</span>}</div>
              : tasks.map(task => {
                const tColor = progressColor(task.progress || 0)
                return (
                  <div key={task.id} onClick={() => setSelectedTask(task)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--surface2)', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <button onClick={e => toggleStatus(task, e)}
                      style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${task.status === 'done' ? '#2e7d32' : 'var(--border)'}`, background: task.status === 'done' ? '#2e7d32' : 'transparent', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {task.status === 'done' && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: task.status === 'done' ? 'var(--text3)' : 'var(--text)', textDecoration: task.status === 'done' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                      <div style={{ height: 3, background: '#e8e8e8', borderRadius: 99, marginTop: 4, overflow: 'hidden', maxWidth: 120 }}>
                        <div style={{ height: '100%', width: `${task.progress || 0}%`, background: tColor, borderRadius: 99, transition: 'width 0.3s' }} />
                      </div>
                      {desktop && task.deadline && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Due {task.deadline}{task.deadline_time ? ` at ${task.deadline_time}` : ''}</div>}
                      {task.created_by && task.created_by !== (task.assigned_to || userId) && staffMap[task.created_by] && (
                        <div style={{ fontSize: 10, color: BLUE, marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>👤</span><span>Assigned by {staffMap[task.created_by]}</span>
                        </div>
                      )}
                    </div>
                    {desktop && <PriorityBadge priority={task.priority || 'medium'} />}
                    {task.notes && <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>📝</span>}
                    {desktop && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, flexShrink: 0, ...statusStyle(task.status) }}>{task.status.replace('_', ' ')}</span>}
                    <ProgressCircle progress={task.progress || 0} onChange={val => updateProgress(task, val)} />
                    <button onClick={e => { e.stopPropagation(); deleteTask(task.id) }} title="Delete task"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c84b2f', fontSize: 16, padding: '2px 4px', flexShrink: 0, opacity: 0.6, lineHeight: 1 }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>×</button>
                  </div>
                )
              })
            }
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>Click a task to view details & comments · Click circle to update progress</div>
        </div>
        <div style={{ marginTop: desktop ? 0 : 20 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Deadline calendar</div>
          <MiniCalendar tasks={tasks} outOfLabDays={outOfLab} onDayClick={(y, m, d) => setCalDayPopup({ year: y, month: m, day: d })} />
          {userId && <OutOfLabPanel userId={userId} isSolo={isSolo} orgId={orgId} onChanged={loadOutOfLab} />}
          {isStudent && userId && <TaskGroupPanel userId={userId} orgId={orgId} onGroupChange={onGroupChange} />}
        </div>
      </div>
    </div>
  )
}

function TaskViewModal({ task, onClose }) {
  const statusStyle = (s) => ({ todo: { background: '#f1f1f1', color: '#555' }, in_progress: { background: ORANGE_LIGHT, color: ORANGE }, done: { background: '#e8f5e9', color: '#2e7d32' } }[s] || {})
  const pData = PRIORITY[task.priority || 'medium']
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 17, flex: 1, paddingRight: 12, lineHeight: 1.3 }}>{task.title}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, fontWeight: 600, ...statusStyle(task.status) }}>{task.status.replace('_', ' ')}</span>
          <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, fontWeight: 600, background: pData.bg, color: pData.color }}>{pData.label} priority</span>
          <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, background: '#e8f0fe', color: BLUE, fontWeight: 600 }}>{task.progress || 0}% complete</span>
        </div>
        <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <ProgressTape progress={task.progress || 0} />
        </div>
        {(task.start_date || task.deadline) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {task.start_date && <div style={{ fontSize: 13 }}><div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>Start</div>{task.start_date}{task.start_time ? ` at ${task.start_time}` : ''}</div>}
            {task.deadline && <div style={{ fontSize: 13 }}><div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>Due</div>{task.deadline}{task.deadline_time ? ` at ${task.deadline_time}` : ''}</div>}
          </div>
        )}
        {task.notes && (
          <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{task.notes}</div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text3)', paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Read-only view</span>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function Team({ orgId, isSolo, userId, isAdmin, userName }) {
  const { toast } = useAppStore()
  const [staffUsers, setStaffUsers] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [colWidths, setColWidths] = useState({})
  const resizing = useRef(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTeamTask, setNewTeamTask] = useState({ title: '', assigned_to: [], deadline: '', priority: 'medium', notes: '' })
  const [addingTask, setAddingTask] = useState(false)

  useEffect(() => {
    let usersQ = sb.from('users').select('id, name, role').eq('role', 'user').eq('is_active', true).order('name')
    if (orgId) usersQ = usersQ.eq('organization_id', orgId)
    let tasksQ = sb.from('tasks').select('*').eq('login_mode', isSolo ? 'solo' : 'team')
    if (!isSolo) tasksQ = tasksQ.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
    Promise.all([usersQ, tasksQ]).then(([{ data: u }, { data: t }]) => { setStaffUsers(u || []); setTasks(t || []); setLoading(false) })
  }, [orgId, isSolo])

  useEffect(() => {
    function onMove(e) {
      if (!resizing.current) return
      const { startX, startWidth, userId } = resizing.current
      const newW = Math.max(180, startWidth + (e.clientX - startX))
      setColWidths(prev => ({ ...prev, [userId]: newW }))
    }
    function onUp() { resizing.current = null; document.body.style.cursor = '' }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const [viewTask, setViewTask] = useState(null)

  async function addTeamTask() {
    if (!newTeamTask.title.trim()) { toast('Task title required.'); return }
    setAddingTask(true)
    const assignees = newTeamTask.assigned_to.length > 0 ? newTeamTask.assigned_to : staffUsers.map(u => u.id)
    const rows = assignees.map(assigneeId => ({
      title: newTeamTask.title.trim(),
      assigned_to: assigneeId,
      deadline: newTeamTask.deadline || null,
      priority: newTeamTask.priority,
      notes: newTeamTask.notes || null,
      status: 'todo',
      login_mode: isSolo ? 'solo' : 'team',
      organization_id: orgId || null,
      created_by: userId || null,
    }))
    const { data, error } = await sb.from('tasks').insert(rows).select()
    if (error) { toast('Error: ' + error.message); setAddingTask(false); return }
    if (userId && data) {
      for (const t of data) {
        if (t.assigned_to && t.assigned_to !== userId) {
          sendNotification(t.assigned_to, 'task_assigned', 'New task assigned', `${userName || 'Lab Manager'} assigned you: ${t.title}`, t.id).catch(() => {})
        }
      }
    }
    setTasks(prev => [...prev, ...(data || [])])
    setNewTeamTask({ title: '', assigned_to: [], deadline: '', priority: 'medium', notes: '' })
    setShowAddTask(false)
    setAddingTask(false)
    toast(`Task assigned to ${assignees.length} team member${assignees.length > 1 ? 's' : ''} ✓`)
  }

  const userTasks = (uid) => tasks.filter(t => t.assigned_to === uid)
  const doneTasks = (uid) => tasks.filter(t => t.assigned_to === uid && t.status === 'done').length
  const pct = (uid) => { const tot = userTasks(uid).length; return tot ? Math.round((doneTasks(uid) / tot) * 100) : 0 }
  const statusStyle = (s) => ({ todo: { background: '#f1f1f1', color: '#555' }, in_progress: { background: ORANGE_LIGHT, color: ORANGE }, done: { background: '#e8f5e9', color: '#2e7d32' } }[s] || {})
  const statusLabel = (s) => ({ todo: 'To Do', in_progress: 'In Progress', done: 'Done' }[s] || s)

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (staffUsers.length === 0) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>No lab managers found.</div>

  return (
    <div>
      {viewTask && <TaskViewModal task={viewTask} onClose={() => setViewTask(null)} />}

      {/* Quick Assign Task to Team */}
      {isAdmin && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: showAddTask ? 12 : 0 }}>
            <button className="btn btn-sm btn-primary" onClick={() => setShowAddTask(v => !v)}>
              {showAddTask ? 'Cancel' : '+ Assign Task to Team'}
            </button>
          </div>
          {showAddTask && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Assign Task to Team Member(s)</div>

              <div className="field" style={{ marginBottom: 10 }}>
                <label>Task title</label>
                <input value={newTeamTask.title} onChange={e => setNewTeamTask(t => ({ ...t, title: e.target.value }))} placeholder="What needs to be done?" />
              </div>

              <div className="field" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ marginBottom: 0 }}>Assign to <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11 }}>— select one or more, or assign to all</span></label>
                  <button type="button"
                    onClick={() => setNewTeamTask(t => ({ ...t, assigned_to: t.assigned_to.length === staffUsers.length ? [] : staffUsers.map(u => u.id) }))}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, border: `1.5px solid ${newTeamTask.assigned_to.length === staffUsers.length ? 'var(--accent)' : 'var(--border)'}`, background: newTeamTask.assigned_to.length === staffUsers.length ? 'var(--accent-light)' : 'var(--surface2)', color: newTeamTask.assigned_to.length === staffUsers.length ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
                    {newTeamTask.assigned_to.length === staffUsers.length ? '✓ All Team' : 'All Team'}
                  </button>
                </div>
                <MultiAssignSelect users={staffUsers} selected={newTeamTask.assigned_to} onChange={v => setNewTeamTask(t => ({ ...t, assigned_to: v }))} />
                {newTeamTask.assigned_to.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>No selection = assign to all team members</div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Deadline <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11 }}>(optional)</span></label>
                  <input type="date" value={newTeamTask.deadline} onChange={e => setNewTeamTask(t => ({ ...t, deadline: e.target.value }))} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Priority</label>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    {['low', 'medium', 'high'].map(p => (
                      <button key={p} type="button"
                        onClick={() => setNewTeamTask(t => ({ ...t, priority: p }))}
                        style={{ padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${newTeamTask.priority === p ? ({ low: '#22c55e', medium: '#f59e0b', high: '#ef4444' }[p]) : 'var(--border)'}`, background: newTeamTask.priority === p ? ({ low: '#dcfce7', medium: '#fef3c7', high: '#fee2e2' }[p]) : 'var(--surface2)', color: newTeamTask.priority === p ? ({ low: '#166534', medium: '#92400e', high: '#991b1b' }[p]) : 'var(--text2)', cursor: 'pointer', fontWeight: 600, fontSize: 12, textTransform: 'capitalize' }}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="field" style={{ marginBottom: 12 }}>
                <label>Notes <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11 }}>(optional)</span></label>
                <textarea value={newTeamTask.notes} onChange={e => setNewTeamTask(t => ({ ...t, notes: e.target.value }))} placeholder="Additional details…" rows={2} style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={addTeamTask} disabled={addingTask}>
                  {addingTask ? 'Saving…' : `Assign Task${newTeamTask.assigned_to.length === 0 ? ' to All' : newTeamTask.assigned_to.length > 1 ? ` to ${newTeamTask.assigned_to.length} members` : ''}`}
                </button>
                <button className="btn" onClick={() => { setShowAddTask(false); setNewTeamTask({ title: '', assigned_to: [], deadline: '', priority: 'medium', notes: '' }) }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ overflowX: 'auto', overflowY: 'visible', paddingBottom: 12, userSelect: resizing.current ? 'none' : 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 'max-content', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {staffUsers.map((user, idx) => {
          const width = colWidths[user.id] || 230
          const uPct = pct(user.id)
          const utasks = userTasks(user.id)
          const isLast = idx === staffUsers.length - 1
          return (
            <div key={user.id} style={{ width, flexShrink: 0, position: 'relative', borderRight: isLast ? 'none' : '1px solid var(--border)' }}>
              <div style={{ padding: '12px 14px 10px', background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: ORANGE_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, color: ORANGE, flexShrink: 0 }}>
                    {user.name?.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{utasks.length} task{utasks.length !== 1 ? 's' : ''} · {doneTasks(user.id)} done</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: progressColor(uPct), flexShrink: 0 }}>{uPct}%</span>
                </div>
                <div style={{ height: 5, background: '#e0e0e0', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${uPct}%`, background: progressColor(uPct), borderRadius: 99, transition: 'width 0.4s' }} />
                </div>
              </div>
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg)', minHeight: 80 }}>
                {utasks.length === 0
                  ? <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '24px 8px' }}>No tasks assigned</div>
                  : utasks.map(task => (
                    <div key={task.id}
                      onClick={task.is_private ? undefined : () => setViewTask(task)}
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 12px', borderLeft: `3px solid ${progressColor(task.progress || 0)}`, cursor: task.is_private ? 'default' : 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => { if (!task.is_private) e.currentTarget.style.background = 'var(--surface2)' }}
                      onMouseLeave={e => { if (!task.is_private) e.currentTarget.style.background = 'var(--surface)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: task.is_private ? 'var(--text3)' : task.status === 'done' ? 'var(--text3)' : 'var(--text)', textDecoration: task.status === 'done' && !task.is_private ? 'line-through' : 'none', marginBottom: 6, lineHeight: 1.4, wordBreak: 'break-word', fontStyle: task.is_private ? 'italic' : 'normal' }}>
                        {task.is_private ? '🔒 Personal task' : task.title}
                      </div>
                      <div style={{ height: 4, background: '#e8e8e8', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                        <div style={{ height: '100%', width: `${task.progress || 0}%`, background: progressColor(task.progress || 0), borderRadius: 99 }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, ...statusStyle(task.status) }}>{statusLabel(task.status)}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <PriorityBadge priority={task.priority || 'medium'} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: progressColor(task.progress || 0) }}>{task.progress || 0}%</span>
                        </div>
                      </div>
                      {task.deadline && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                          📅 {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                  ))
                }
              </div>
              {!isLast && (
                <div
                  onMouseDown={e => { e.preventDefault(); resizing.current = { startX: e.clientX, startWidth: width, userId: user.id }; document.body.style.cursor = 'col-resize' }}
                  style={{ position: 'absolute', top: 0, right: -3, width: 6, height: '100%', cursor: 'col-resize', zIndex: 10 }}
                  title="Drag to resize column"
                />
              )}
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, textAlign: 'right' }}>↔ Drag column edge to resize</div>
      </div>
    </div>
  )
}

function StudentTeamView({ userId, groupId, orgId }) {
  const [members, setMembers] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewTask, setViewTask] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: memberships } = await sb.from('team_task_group_members').select('user_id').eq('group_id', groupId).eq('status', 'accepted')
      const memberIds = (memberships || []).map(m => m.user_id)
      if (!memberIds.length) { setLoading(false); return }
      const { data: users } = await sb.from('users').select('id, name').in('id', memberIds)
      setMembers(users || [])
      const { data: t } = await sb.from('tasks').select('*').eq('login_mode', 'team').eq('organization_id', orgId).in('assigned_to', memberIds).eq('is_private', false).order('deadline', { ascending: true, nullsFirst: false })
      // Only show self-created tasks (not tasks assigned by lab managers)
      setTasks((t || []).filter(task => task.created_by === task.assigned_to))
      setLoading(false)
    }
    load()
  }, [groupId, orgId])

  const statusStyle = (s) => ({ todo: { background: '#f1f1f1', color: '#555' }, in_progress: { background: ORANGE_LIGHT, color: ORANGE }, done: { background: '#e8f5e9', color: '#2e7d32' } }[s] || {})
  const userTasks = (uid) => tasks.filter(t => t.assigned_to === uid)

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (!members.length) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>No group members found.</div>

  return (
    <div>
      {viewTask && <TaskViewModal task={viewTask} onClose={() => setViewTask(null)} />}
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Only tasks each member marked as shared are visible here — private tasks are hidden.</div>
      <div style={{ overflowX: 'auto', paddingBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 'max-content', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {members.map((user, idx) => {
            const utasks = userTasks(user.id)
            const done = utasks.filter(t => t.status === 'done').length
            const pct = utasks.length ? Math.round((done / utasks.length) * 100) : 0
            const isMe = user.id === userId
            const isLast = idx === members.length - 1
            return (
              <div key={user.id} style={{ width: 220, flexShrink: 0, borderRight: isLast ? 'none' : '1px solid var(--border)' }}>
                <div style={{ padding: '12px 14px 10px', background: isMe ? '#f0f4ff' : 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: isMe ? '#dbeafe' : ORANGE_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, color: isMe ? BLUE : ORANGE, flexShrink: 0 }}>{user.name?.slice(0,2).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}{isMe ? ' (You)' : ''}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{utasks.length} shared · {done} done</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: progressColor(pct), flexShrink: 0 }}>{pct}%</span>
                  </div>
                  <div style={{ height: 5, background: '#e0e0e0', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: progressColor(pct), borderRadius: 99, transition: 'width 0.4s' }} />
                  </div>
                </div>
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg)', minHeight: 80 }}>
                  {utasks.length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '24px 8px' }}>{isMe ? 'No shared tasks yet' : 'No shared tasks'}</div>
                    : utasks.map(task => (
                      <div key={task.id} onClick={() => setViewTask(task)}
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 12px', borderLeft: `3px solid ${progressColor(task.progress||0)}`, cursor: 'pointer', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
                        onMouseLeave={e => e.currentTarget.style.background='var(--surface)'}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: task.status==='done' ? 'var(--text3)' : 'var(--text)', textDecoration: task.status==='done' ? 'line-through' : 'none', marginBottom: 6, lineHeight: 1.4, wordBreak: 'break-word' }}>{task.title}</div>
                        <div style={{ height: 4, background: '#e8e8e8', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                          <div style={{ height: '100%', width: `${task.progress||0}%`, background: progressColor(task.progress||0), borderRadius: 99 }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, ...statusStyle(task.status) }}>{task.status.replace('_',' ')}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <PriorityBadge priority={task.priority||'medium'} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: progressColor(task.progress||0) }}>{task.progress||0}%</span>
                          </div>
                        </div>
                        {task.deadline && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>📅 {new Date(task.deadline).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>}
                      </div>
                    ))
                  }
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>Click a task to view details.</div>
    </div>
  )
}

function MultiAssignSelect({ users, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const selectedNames = selected.map(id => users.find(u => u.id === id)?.name).filter(Boolean)
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: selected.length ? 'var(--text)' : 'var(--text3)', fontSize: 14, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {selected.length === 0 ? '— Select lab manager(s) —' : selectedNames.join(', ')}
        </span>
        <span style={{ color: 'var(--text3)', marginLeft: 8, flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 200, maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
          {users.length === 0 && <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text3)' }}>No staff users.</div>}
          {users.map(u => (
            <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 13, background: selected.includes(u.id) ? '#e0f2fe' : 'transparent', marginBottom: 0 }}>
              <input type="checkbox" checked={selected.includes(u.id)}
                onChange={() => onChange(selected.includes(u.id) ? selected.filter(id => id !== u.id) : [...selected, u.id])}
                style={{ width: 'auto', cursor: 'pointer' }} />
              {u.name}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function DateRangePicker({ startDate, endDate, onStartChange, onEndChange }) {
  const todayStr = new Date().toISOString().split('T')[0]
  const [view, setView] = useState(() => {
    const ref = startDate ? new Date(startDate + 'T12:00:00') : new Date()
    return { year: ref.getFullYear(), month: ref.getMonth() }
  })
  const [hovered, setHovered] = useState(null)
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']
  function prevMonth() { setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 }) }
  function nextMonth() { setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 }) }
  function toStr(y, m, d) { return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}` }
  function handleDay(ds) {
    if (!startDate || (startDate && endDate)) { onStartChange(ds); onEndChange('') }
    else if (ds < startDate) { onStartChange(ds) }
    else if (ds === startDate) { onStartChange(''); onEndChange('') }
    else { onEndChange(ds) }
  }
  const effEnd = endDate || hovered
  function dayStyle(ds) {
    const isStart = ds === startDate
    const isEnd = ds === endDate
    const inRange = startDate && effEnd && ds > (startDate <= effEnd ? startDate : effEnd) && ds < (startDate <= effEnd ? effEnd : startDate)
    const isToday = ds === todayStr
    let bg = 'transparent', color = 'var(--text)', fw = 400, br = '6px', outline = 'none'
    if (isStart || isEnd) { bg = 'var(--accent)'; color = '#fff'; fw = 700; br = isStart && endDate ? '6px 0 0 6px' : isEnd ? '0 6px 6px 0' : '6px' }
    else if (inRange) { bg = '#dbeafe'; br = '0' }
    else if (isToday) { color = 'var(--accent)'; fw = 700; outline = '1px dashed var(--accent)' }
    return { textAlign: 'center', padding: '6px 0', borderRadius: br, background: bg, color, fontWeight: fw, cursor: 'pointer', fontSize: 13, outline, transition: 'background 0.1s' }
  }
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const firstDay = new Date(view.year, view.month, 1).getDay()
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'inline-block', userSelect: 'none', minWidth: 260 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <button type="button" onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text2)', padding: '0 8px', lineHeight: 1 }}>‹</button>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{MONTHS[view.month]} {view.year}</span>
        <button type="button" onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text2)', padding: '0 8px', lineHeight: 1 }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {DAYS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text3)', padding: '2px 0', marginBottom: 2 }}>{d}</div>)}
        {cells.map((day, i) => day === null ? <div key={`e${i}`} /> : (
          <div key={day} onClick={() => handleDay(toStr(view.year, view.month, day))}
            onMouseEnter={() => !endDate && startDate && setHovered(toStr(view.year, view.month, day))}
            onMouseLeave={() => setHovered(null)}
            style={dayStyle(toStr(view.year, view.month, day))}>
            {day}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text3)' }}>Start:</span>
        <strong style={{ color: startDate ? 'var(--text)' : 'var(--text3)' }}>{startDate || '—'}</strong>
        <span style={{ color: 'var(--text3)', margin: '0 2px' }}>→</span>
        <span style={{ color: 'var(--text3)' }}>End:</span>
        <strong style={{ color: endDate ? 'var(--text)' : 'var(--text3)' }}>{endDate || (startDate ? '← pick end' : '—')}</strong>
        {(startDate || endDate) && (
          <button type="button" onClick={() => { onStartChange(''); onEndChange('') }}
            style={{ marginLeft: 'auto', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>Clear</button>
        )}
      </div>
    </div>
  )
}

function Meetings({ userId, isAdmin, userName, orgId }) {
  const [meetings, setMeetings] = useState([])
  const [tasks, setTasks] = useState([])
  const [staffUsers, setStaffUsers] = useState([])
  const [allUsersMap, setAllUsersMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [activeMeeting, setActiveMeeting] = useState(null)
  const [showNewTask, setShowNewTask] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', assigned_to: [], start_date: '', deadline: '', reference_url: '', icon_url: '', notes: '' })
  const [showCalendar, setShowCalendar] = useState(false)
  const [iconFile, setIconFile] = useState(null)
  const [iconPreview, setIconPreview] = useState(null)
  const [iconUploading, setIconUploading] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [drawingNewTask, setDrawingNewTask] = useState(null)
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterUser, setFilterUser] = useState('all')
  const [filterDeadline, setFilterDeadline] = useState('all')
  const [sortBy, setSortBy] = useState('default')
  const [filterYear, setFilterYear] = useState('all')
  const [newMeetingDate, setNewMeetingDate] = useState(() => new Date().toISOString().split('T')[0])
  useEffect(() => {
    async function load() {
      let usersQ = sb.from('users').select('id, name, role').eq('is_active', true).order('name')
      if (orgId) usersQ = usersQ.eq('organization_id', orgId)
      const { data: u } = await usersQ
      const allUsers = u || []
      const uMap = {}; allUsers.forEach(x => { uMap[x.id] = x.name })
      setAllUsersMap(uMap); setStaffUsers(allUsers.filter(x => x.role === 'user'))
      let tasksQ = sb.from('tasks').select('*').eq('is_meeting_task', true)
      if (orgId) tasksQ = tasksQ.eq('organization_id', orgId)
      const { data: t } = await tasksQ
      setTasks(t || [])
      let meetingsQ = sb.from('meetings').select('*').order('date', { ascending: false })
      if (orgId) meetingsQ = meetingsQ.eq('organization_id', orgId)
      const { data: m } = await meetingsQ
      const meetingsData = m || []
      setMeetings(meetingsData)
      if (meetingsData.length) setActiveMeeting(meetingsData[0])
      setLoading(false)
    }
    load()
  }, [orgId])
  const staffMap = {}; staffUsers.forEach(u => { staffMap[u.id] = u.name })
  const createMeeting = async () => {
    const payload = { date: newMeetingDate || new Date().toISOString().split('T')[0], notes: '', organization_id: orgId || null }
    if (userId) payload.created_by = userId
    const { data } = await sb.from('meetings').insert(payload).select().single()
    if (data) {
      const updated = [data, ...meetings].sort((a, b) => (b.date || '') < (a.date || '') ? -1 : 1)
      setMeetings(updated)
      setActiveMeeting(data)
      setNewMeetingDate(new Date().toISOString().split('T')[0])
    }
  }
  const addTask = async (e) => {
    e.preventDefault()
    let iconUrl = null
    if (iconFile) {
      setIconUploading(true)
      const ext = iconFile.name.split('.').pop().toLowerCase()
      const iconPath = `icons/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await sb.storage.from('task-files').upload(iconPath, iconFile)
      if (!upErr) {
        const { data: { publicUrl } } = sb.storage.from('task-files').getPublicUrl(iconPath)
        iconUrl = publicUrl
      }
      setIconUploading(false)
    }
    const assignees = newTask.assigned_to.length > 0 ? newTask.assigned_to : [null]
    const newRows = []
    for (const assigneeId of assignees) {
      const payload = { title: newTask.title, notes: newTask.notes || null, assigned_to: assigneeId || null, start_date: newTask.start_date || null, deadline: newTask.deadline || null, reference_url: newTask.reference_url || null, icon_url: iconUrl, meeting_id: activeMeeting.id, is_meeting_task: true, status: 'todo', login_mode: 'team', organization_id: orgId || null }
      if (userId) payload.created_by = userId
      const { data } = await sb.from('tasks').insert(payload).select().single()
      if (data) {
        newRows.push(data)
        if (assigneeId) await sendNotification(assigneeId, 'meeting_added', 'New meeting task assigned', `Task: ${newTask.title}`, data.id)
      }
    }
    setTasks(prev => [...prev, ...newRows])
    setNewTask({ title: '', assigned_to: [], start_date: '', deadline: '', reference_url: '', icon_url: '', notes: '' })
    setIconFile(null); setIconPreview(null); setShowNewTask(false); setShowCalendar(false)
  }
  const addTaskAndDraw = async () => {
    if (!newTask.title.trim()) { alert('Please enter a task title first.'); return }
    let iconUrl = null
    if (iconFile) {
      setIconUploading(true)
      const ext = iconFile.name.split('.').pop().toLowerCase()
      const iconPath = `icons/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await sb.storage.from('task-files').upload(iconPath, iconFile)
      if (!upErr) {
        const { data: { publicUrl } } = sb.storage.from('task-files').getPublicUrl(iconPath)
        iconUrl = publicUrl
      }
      setIconUploading(false)
    }
    const assigneeId = newTask.assigned_to[0] || null
    const payload = { title: newTask.title, notes: newTask.notes || null, assigned_to: assigneeId, start_date: newTask.start_date || null, deadline: newTask.deadline || null, reference_url: newTask.reference_url || null, icon_url: iconUrl, meeting_id: activeMeeting.id, is_meeting_task: true, status: 'todo', login_mode: 'team', organization_id: orgId || null }
    if (userId) payload.created_by = userId
    const { data } = await sb.from('tasks').insert(payload).select().single()
    if (data) {
      setTasks(prev => [...prev, data])
      setNewTask({ title: '', assigned_to: [], start_date: '', deadline: '', reference_url: '', icon_url: '', notes: '' })
      setIconFile(null); setIconPreview(null); setShowNewTask(false); setShowCalendar(false)
      setDrawingNewTask(data)
    }
  }
  const deleteMeeting = async (m) => {
    if (!window.confirm(`Delete meeting "${meetingDate(m)?.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) ?? 'this meeting'}"?\n\nTasks linked to this meeting will not be deleted.`)) return
    await sb.from('meetings').delete().eq('id', m.id)
    const updated = meetings.filter(x => x.id !== m.id)
    setMeetings(updated)
    if (activeMeeting?.id === m.id) setActiveMeeting(updated[0] ?? null)
  }
  const toggleStatus = async (task) => {
    const next = { todo: 'in_progress', in_progress: 'done', done: 'todo' }
    const newStatus = next[task.status]
    await sb.from('tasks').update({ status: newStatus }).eq('id', task.id)
    setTasks(tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
  }
  const meetingTasks = (mid) => tasks.filter(t => t.meeting_id === mid)
  const filteredMeetingTasks = (mid) => {
    const today = new Date().toISOString().split('T')[0]
    const in7 = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0]
    let list = meetingTasks(mid)
    if (filterPriority !== 'all') list = list.filter(t => (t.priority || 'medium') === filterPriority)
    if (filterUser !== 'all') list = list.filter(t => t.assigned_to === filterUser)
    if (filterDeadline === 'overdue') list = list.filter(t => t.deadline && t.deadline < today && t.status !== 'done')
    else if (filterDeadline === 'this_week') list = list.filter(t => t.deadline && t.deadline >= today && t.deadline <= in7)
    else if (filterDeadline === 'no_deadline') list = list.filter(t => !t.deadline)
    if (sortBy === 'deadline') list = [...list].sort((a, b) => (a.deadline || '9999') < (b.deadline || '9999') ? -1 : 1)
    else if (sortBy === 'priority') { const order = { high: 0, medium: 1, low: 2 }; list = [...list].sort((a, b) => (order[a.priority || 'medium'] || 1) - (order[b.priority || 'medium'] || 1)) }
    return list
  }
  const activeFilters = [filterPriority !== 'all', filterUser !== 'all', filterDeadline !== 'all'].filter(Boolean).length
  const meetingDate = (m) => {
    if (!m?.date) return null
    const dateOnly = String(m.date).split('T')[0]   // strip any time/tz suffix Supabase may return
    const d = new Date(dateOnly + 'T12:00:00')
    return !isNaN(d.getTime()) ? d : null
  }
  const availableYears = [...new Set(meetings.map(m => meetingDate(m)?.getFullYear()).filter(y => y != null))].sort((a, b) => b - a)
  const displayedMeetings = filterYear === 'all' ? meetings : meetings.filter(m => meetingDate(m)?.getFullYear() === Number(filterYear))
  const statusStyle = (s) => ({ todo: { background: '#f1f1f1', color: '#555' }, in_progress: { background: ORANGE_LIGHT, color: ORANGE }, done: { background: '#e8f5e9', color: '#2e7d32' } }[s] || {})
  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  return (
    <div>
      {drawingNewTask && <DrawingBoard taskId={drawingNewTask.id} taskTitle={drawingNewTask.title} currentUserName={userName} onClose={() => setDrawingNewTask(null)} onAttachmentSaved={() => setDrawingNewTask(null)} />}
      {selectedTask && <TaskModal task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={updated => { setTasks(tasks.map(t => t.id === updated.id ? updated : t)); setSelectedTask(updated) }} onDelete={selectedTask?.created_by === userId ? id => { setTasks(tasks.filter(t => t.id !== id)); sb.from('tasks').delete().eq('id', id) } : undefined} currentUserId={userId} currentUserName={userName} />}

      {/* ── Step 1: Meeting selector card ─────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
          Step 1 — Select or schedule a meeting
        </div>

        {/* Row A: existing meeting picker */}
        {meetings.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Pick an existing meeting</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Year pills when needed */}
              {availableYears.length > 1 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {['all', ...availableYears].map(y => (
                    <button key={y} onClick={() => setFilterYear(y)}
                      style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, border: 'none', background: filterYear === y ? BLUE : 'var(--surface2)', color: filterYear === y ? 'white' : 'var(--text3)', cursor: 'pointer', fontWeight: 600 }}>
                      {y === 'all' ? 'All' : y}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <select
                  value={activeMeeting?.id || ''}
                  onChange={e => setActiveMeeting(displayedMeetings.find(m => m.id === e.target.value) || null)}
                  style={{ width: '100%', appearance: 'none', padding: '8px 32px 8px 14px', borderRadius: 10, border: `2px solid ${activeMeeting ? BLUE : 'var(--border)'}`, background: activeMeeting ? `${BLUE}0d` : 'var(--surface)', color: activeMeeting ? BLUE : 'var(--text3)', fontSize: 14, fontWeight: activeMeeting ? 600 : 400, cursor: 'pointer', outline: 'none' }}>
                  <option value="">— Choose a meeting date —</option>
                  {displayedMeetings.map(m => {
                    const d = meetingDate(m)
                    const lbl = d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'
                    return <option key={m.id} value={m.id}>{lbl}</option>
                  })}
                </select>
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, pointerEvents: 'none', color: 'var(--text3)' }}>▾</span>
              </div>
              {activeMeeting && isAdmin && (
                <button onClick={() => deleteMeeting(activeMeeting)}
                  style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #f87171', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
                  🗑 Delete
                </button>
              )}
            </div>
          </div>
        )}

        {/* Row B: schedule a new date (always visible for admins) */}
        {isAdmin && (
          <>
            {meetings.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>or schedule a new meeting</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
                  {meetings.length === 0 ? 'Pick a date to schedule your first meeting' : 'New meeting date'}
                </div>
                <input type="date" value={newMeetingDate} onChange={e => setNewMeetingDate(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `2px solid ${BLUE}20`, fontSize: 14, outline: 'none' }}
                  onFocus={e => e.target.style.borderColor = BLUE}
                  onBlur={e => e.target.style.borderColor = `${BLUE}20`} />
              </div>
              <button onClick={createMeeting}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: BLUE, color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                📅 Schedule
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Step 2: Tasks ─────────────────────────────────────────────────── */}
      {!activeMeeting ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>☝</div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Select a meeting above to view its tasks</div>
          <div style={{ fontSize: 12 }}>or schedule a new meeting date to get started</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Step 2 — Tasks</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginTop: 2 }}>{meetingDate(activeMeeting)?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) ?? 'Meeting'}</div>
            </div>
            {isAdmin && (
              <button className="btn btn-sm btn-primary" onClick={() => setShowNewTask(!showNewTask)}>
                + Task for {meetingDate(activeMeeting)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? 'meeting'}
              </button>
            )}
          </div>
          {showNewTask && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <label style={{ cursor: 'pointer', flexShrink: 0 }} title="Upload task icon">
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                      const f = e.target.files[0]; if (!f) return
                      setIconFile(f); setIconPreview(URL.createObjectURL(f))
                      e.target.value = ''
                    }} />
                    <div style={{ width: 48, height: 48, borderRadius: 10, border: '2px dashed var(--border)', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', transition: 'border-color 0.15s' }}>
                      {iconPreview
                        ? <img src={iconPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 20 }}>🖼</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', marginTop: 4 }}>Icon</div>
                  </label>
                  <div style={{ flex: 1 }}>
                    <div className="field" style={{ marginBottom: 8 }}><label>Task title</label><input value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} placeholder="Task title" /></div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Reference URL <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11 }}>(optional)</span></label>
                      <input value={newTask.reference_url} onChange={e => setNewTask({ ...newTask, reference_url: e.target.value })} placeholder="https://…" style={{ fontSize: 13 }} />
                    </div>
                  </div>
                </div>
                <div className="field" style={{ marginTop: 8 }}>
                  <label>Assign to (staff) <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11 }}>— select one or more</span></label>
                  <MultiAssignSelect users={staffUsers} selected={newTask.assigned_to} onChange={v => setNewTask({ ...newTask, assigned_to: v })} />
                </div>
                <div className="field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ marginBottom: 0 }}>Date range (start → deadline)</label>
                    <button type="button" onClick={() => setShowCalendar(c => !c)}
                      style={{ fontSize: 12, background: showCalendar ? 'var(--accent)' : 'var(--surface2)', color: showCalendar ? '#fff' : 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                      📅 {showCalendar ? 'Hide calendar' : 'Calendar'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: showCalendar ? 12 : 0 }}>
                    <input type="date" value={newTask.start_date} onChange={e => setNewTask({ ...newTask, start_date: e.target.value })} placeholder="Start date" style={{ flex: 1, padding: '8px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 13 }} />
                    <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text3)' }}>→</span>
                    <input type="date" value={newTask.deadline} onChange={e => setNewTask({ ...newTask, deadline: e.target.value })} placeholder="Deadline" style={{ flex: 1, padding: '8px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 13 }} />
                  </div>
                  {showCalendar && (
                    <DateRangePicker
                      startDate={newTask.start_date} endDate={newTask.deadline}
                      onStartChange={v => setNewTask(t => ({ ...t, start_date: v }))}
                      onEndChange={v => setNewTask(t => ({ ...t, deadline: v }))}
                    />
                  )}
                </div>
                <div className="field">
                  <label>Notes <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11 }}>(optional — longer description)</span></label>
                  <textarea
                    value={newTask.notes}
                    onChange={e => setNewTask({ ...newTask, notes: e.target.value })}
                    placeholder="Describe the task in more detail…"
                    rows={3}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={addTask} disabled={iconUploading}>{iconUploading ? 'Uploading…' : 'Add task'}</button>
                  <button className="btn" onClick={() => { setShowNewTask(false); setShowCalendar(false); setIconFile(null); setIconPreview(null) }}>Cancel</button>
                  <button onClick={addTaskAndDraw} disabled={iconUploading}
                    style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', cursor: iconUploading ? 'default' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🎨 Add &amp; draw
                  </button>
                </div>
              </div>
            )}
            {/* Filter bar */}
            {(() => {
              const pill = (active, activeColor, activeBg) => ({
                appearance: 'none', fontSize: 12, padding: '4px 24px 4px 10px',
                borderRadius: 20, cursor: 'pointer', outline: 'none', fontWeight: active ? 600 : 400,
                border: `1.5px solid ${active ? activeColor : 'var(--border)'}`,
                background: active ? activeBg : 'var(--surface)',
                color: active ? activeColor : 'var(--text2)',
                boxShadow: active ? `0 0 0 2px ${activeBg}` : 'none',
                transition: 'all 0.15s',
              })
              const Wrap = ({ children }) => (
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  {children}
                  <span style={{ position: 'absolute', right: 8, pointerEvents: 'none', fontSize: 9, color: 'var(--text3)' }}>▾</span>
                </div>
              )
              return (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 2 }}>Filter</span>
                  <Wrap>
                    <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={pill(filterPriority !== 'all', '#b45309', '#fef3c7')}>
                      <option value="all">⚡ Priority</option>
                      <option value="high">🔴 High</option>
                      <option value="medium">🟡 Medium</option>
                      <option value="low">🟢 Low</option>
                    </select>
                  </Wrap>
                  <Wrap>
                    <select value={filterUser} onChange={e => setFilterUser(e.target.value)} style={pill(filterUser !== 'all', '#1d4ed8', '#dbeafe')}>
                      <option value="all">👤 Person</option>
                      {staffUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </Wrap>
                  <Wrap>
                    <select value={filterDeadline} onChange={e => setFilterDeadline(e.target.value)} style={pill(filterDeadline !== 'all', '#be185d', '#fce7f3')}>
                      <option value="all">📅 Deadline</option>
                      <option value="overdue">⚠ Overdue</option>
                      <option value="this_week">This week</option>
                      <option value="no_deadline">No deadline</option>
                    </select>
                  </Wrap>
                  <Wrap>
                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={pill(sortBy !== 'default', '#5b21b6', '#ede9fe')}>
                      <option value="default">↕ Sort</option>
                      <option value="deadline">By deadline</option>
                      <option value="priority">By priority</option>
                    </select>
                  </Wrap>
                  {activeFilters > 0 && (
                    <button onClick={() => { setFilterPriority('all'); setFilterUser('all'); setFilterDeadline('all'); setSortBy('default') }}
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, border: '1.5px solid #f87171', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', fontWeight: 600 }}>
                      ✕ Clear {activeFilters > 1 ? `(${activeFilters})` : ''}
                    </button>
                  )}
                </div>
              )
            })()}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              {filteredMeetingTasks(activeMeeting.id).length === 0
                ? <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text3)' }}>{meetingTasks(activeMeeting.id).length === 0 ? 'No tasks for this meeting yet.' : 'No tasks match the current filters.'}</div>
                : filteredMeetingTasks(activeMeeting.id).map((task, taskIdx) => {
                  const rowBg = taskIdx % 2 === 0 ? 'var(--surface)' : '#f0f7ff'
                  return (
                  <div key={task.id} onClick={() => setSelectedTask(task)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s', background: rowBg }}
                    onMouseEnter={e => e.currentTarget.style.background = '#e8f4fd'}
                    onMouseLeave={e => e.currentTarget.style.background = rowBg}>
                    {task.icon_url
                      ? <img src={task.icon_url} alt="" style={{ width: 32, height: 32, borderRadius: 7, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }} />
                      : <button onClick={e => { e.stopPropagation(); toggleStatus(task) }} style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${task.status === 'done' ? '#2e7d32' : 'var(--border)'}`, background: task.status === 'done' ? '#2e7d32' : 'transparent', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {task.status === 'done' && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
                        </button>
                    }
                    {task.icon_url && (
                      <button onClick={e => { e.stopPropagation(); toggleStatus(task) }} style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${task.status === 'done' ? '#2e7d32' : 'var(--border)'}`, background: task.status === 'done' ? '#2e7d32' : 'transparent', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {task.status === 'done' && <span style={{ color: 'white', fontSize: 9, fontWeight: 700 }}>✓</span>}
                      </button>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {task.title}
                        {task.reference_url && (
                          <a href={task.reference_url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
                            style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: '#e0f2fe', color: '#0369a1', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>🔗 Ref</a>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{allUsersMap[task.assigned_to] || staffMap[task.assigned_to] || 'Unassigned'} · {task.start_date || '—'} → {task.deadline || '—'}</div>
                      {task.created_by && task.created_by !== task.assigned_to && allUsersMap[task.created_by] && (
                        <div style={{ fontSize: 10, color: BLUE, marginTop: 2 }}>Assigned by {allUsersMap[task.created_by]} · decided in this meeting</div>
                      )}
                      {task.notes && <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2, fontStyle: 'italic' }}>{task.notes}</div>}
                    </div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, flexShrink: 0, ...statusStyle(task.status) }}>{task.status.replace('_', ' ')}</span>
                  </div>
                  )
                })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Click a task to view details, add notes, comments, and start a 🎨 live drawing</div>
          </>
        )}
    </div>
  )
}

function AssignOthers({ userId, orgId }) {
  const [staffUsers, setStaffUsers] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTask, setNewTask] = useState({ title: '', assigned_to: [], start_date: '', deadline: '', priority: 'medium', is_meeting_task: false, reference_url: '', icon_url: '' })
  const [showCalendar, setShowCalendar] = useState(false)
  const [iconFile, setIconFile] = useState(null)
  const [iconPreview, setIconPreview] = useState(null)
  const [iconUploading, setIconUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const { toast } = useAppStore()
  useEffect(() => {
    let usersQ = sb.from('users').select('id, name').eq('role', 'user').eq('is_active', true).order('name')
    if (orgId) usersQ = usersQ.eq('organization_id', orgId)
    let tasksQ = sb.from('tasks').select('*').eq('login_mode', 'team').order('created_at', { ascending: false })
    if (orgId) tasksQ = tasksQ.eq('organization_id', orgId)
    Promise.all([usersQ, tasksQ]).then(([{ data: u }, { data: t }]) => { setStaffUsers(u || []); setTasks(t || []); setLoading(false) })
  }, [orgId])
  const staffMap = {}; staffUsers.forEach(u => { staffMap[u.id] = u.name })
  const createTask = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      let iconUrl = null
      if (iconFile) {
        setIconUploading(true)
        const ext = iconFile.name.split('.').pop().toLowerCase()
        const iconPath = `icons/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await sb.storage.from('task-files').upload(iconPath, iconFile)
        if (!upErr) {
          const { data: { publicUrl } } = sb.storage.from('task-files').getPublicUrl(iconPath)
          iconUrl = publicUrl
        }
        setIconUploading(false)
      }
      const assignees = newTask.assigned_to.length > 0 ? newTask.assigned_to : [null]
      const newRows = []
      for (const assigneeId of assignees) {
        const payload = { title: newTask.title, assigned_to: assigneeId || null, start_date: newTask.start_date || null, deadline: newTask.deadline || null, priority: newTask.priority, is_meeting_task: newTask.is_meeting_task, reference_url: newTask.reference_url || null, icon_url: iconUrl, status: 'todo', progress: 0, login_mode: 'team', organization_id: orgId || null }
        if (userId) payload.created_by = userId
        const { data, error } = await sb.from('tasks').insert(payload).select().single()
        if (error) throw error
        if (data) {
          newRows.push(data)
          if (assigneeId) await sendNotification(assigneeId, 'task_assigned', 'You have a new task', `Task: ${newTask.title}`, data.id)
        }
      }
      setTasks(prev => [...newRows, ...prev])
      setNewTask({ title: '', assigned_to: [], start_date: '', deadline: '', priority: 'medium', is_meeting_task: false, reference_url: '', icon_url: '' })
      setIconFile(null); setIconPreview(null); setShowCalendar(false)
      toast('Task created!')
    } catch(err) { toast('Error: ' + (err?.message || 'Could not create task')) }
    setSaving(false)
  }
  const deleteTask = async (id) => {
    if (!confirm('Delete this task?')) return
    await sb.from('tasks').delete().eq('id', id)
    setTasks(tasks.filter(t => t.id !== id)); toast('Task deleted.')
  }
  const statusStyle = (s) => ({ todo: { background: '#f1f1f1', color: '#555' }, in_progress: { background: ORANGE_LIGHT, color: ORANGE }, done: { background: '#e8f5e9', color: '#2e7d32' } }[s] || {})
  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Create & assign a task</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
          <label style={{ cursor: 'pointer', flexShrink: 0 }} title="Upload task icon">
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
              const f = e.target.files[0]; if (!f) return
              setIconFile(f); setIconPreview(URL.createObjectURL(f)); e.target.value = ''
            }} />
            <div style={{ width: 48, height: 48, borderRadius: 10, border: '2px dashed var(--border)', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {iconPreview ? <img src={iconPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 20 }}>🖼</span>}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', marginTop: 4 }}>Icon</div>
          </label>
          <div style={{ flex: 1 }}>
            <div className="field" style={{ marginBottom: 8 }}><label>Task title</label><input value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} placeholder="Task title" /></div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Reference URL <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11 }}>(optional)</span></label>
              <input value={newTask.reference_url} onChange={e => setNewTask({ ...newTask, reference_url: e.target.value })} placeholder="https://…" style={{ fontSize: 13 }} />
            </div>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Assign to (staff) <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11 }}>— select one or more</span></label>
            <MultiAssignSelect users={staffUsers} selected={newTask.assigned_to} onChange={v => setNewTask({ ...newTask, assigned_to: v })} />
          </div>
          <div className="field"><label>Priority</label>
            <select value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value })}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
        <div className="field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ marginBottom: 0 }}>Date range (start → deadline)</label>
            <button type="button" onClick={() => setShowCalendar(c => !c)}
              style={{ fontSize: 12, background: showCalendar ? 'var(--accent)' : 'var(--surface2)', color: showCalendar ? '#fff' : 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              📅 {showCalendar ? 'Hide calendar' : 'Calendar'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: showCalendar ? 12 : 0 }}>
            <input type="date" value={newTask.start_date} onChange={e => setNewTask({ ...newTask, start_date: e.target.value })} style={{ flex: 1, padding: '8px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 13 }} />
            <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text3)' }}>→</span>
            <input type="date" value={newTask.deadline} onChange={e => setNewTask({ ...newTask, deadline: e.target.value })} style={{ flex: 1, padding: '8px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 13 }} />
          </div>
          {showCalendar && (
            <DateRangePicker
              startDate={newTask.start_date} endDate={newTask.deadline}
              onStartChange={v => setNewTask(t => ({ ...t, start_date: v }))}
              onEndChange={v => setNewTask(t => ({ ...t, deadline: v }))}
            />
          )}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={newTask.is_meeting_task} onChange={e => setNewTask({ ...newTask, is_meeting_task: e.target.checked })} /> This is a meeting task
        </label>
        <button className="btn btn-primary" onClick={createTask} disabled={saving || iconUploading}>{iconUploading ? 'Uploading icon…' : saving ? 'Creating…' : 'Create & assign task'}</button>
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>All tasks ({tasks.length})</div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {tasks.length === 0 ? <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text3)' }}>No tasks yet.</div>
            : tasks.map(task => (
              <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--surface2)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{task.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{staffMap[task.assigned_to] || 'Unassigned'} · {task.start_date} → {task.deadline}{task.is_meeting_task && <span style={{ color: BLUE, marginLeft: 8 }}>meeting task</span>}</div>
                  <div style={{ height: 3, background: '#e8e8e8', borderRadius: 99, overflow: 'hidden', maxWidth: 100 }}><div style={{ height: '100%', width: `${task.progress||0}%`, background: progressColor(task.progress||0), borderRadius: 99 }} /></div>
                </div>
                <PriorityBadge priority={task.priority || 'medium'} />
                <span style={{ fontSize: 11, color: progressColor(task.progress||0), fontWeight: 600 }}>{task.progress||0}%</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, ...statusStyle(task.status) }}>{task.status.replace('_', ' ')}</span>
                <button onClick={() => deleteTask(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c84b2f', fontSize: 12 }}>delete</button>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

function TaskReminderRow({ task, today, onTurnOff }) {
  const isUpcoming = task.start_date && task.start_date > today
  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--surface2)', background: 'transparent' }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #d97706', background: '#fef3c7', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 10 }}>⏰</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{task.title}</span>
          <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 6px', fontWeight: 600, flexShrink: 0 }}>Task · Daily 8 AM</span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          {task.start_date && <span style={{ fontSize: 11, color: 'var(--text3)' }}>📅 {isUpcoming ? 'Starts ' : ''}{fmtDate(task.start_date)}{task.deadline ? ` → ${fmtDate(task.deadline)}` : ''}</span>}
          {!task.start_date && task.deadline && <span style={{ fontSize: 11, color: 'var(--text3)' }}>📅 Due {fmtDate(task.deadline)}</span>}
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{task.progress || 0}% complete</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>Daily notification until done · <span style={{ color: '#d97706', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => onTurnOff(task.id)}>Turn off</span></div>
      </div>
    </div>
  )
}

function Reminders({ userId }) {
  const [reminders, setReminders] = useState([])
  const [taskReminders, setTaskReminders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ title: '', notes: '', start_day: '', end_day: '', start_time: '', end_time: '' })
  const [saving, setSaving] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const { toast } = useAppStore()
  const _d = new Date()
  const today = [_d.getFullYear(), String(_d.getMonth()+1).padStart(2,'0'), String(_d.getDate()).padStart(2,'0')].join('-')

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    load()
    checkNotifications()
  }, [userId])

  async function load() {
    const [{ data: rems }, { data: tasks }] = await Promise.all([
      sb.from('reminders').select('*').eq('user_id', userId)
        .order('start_day', { ascending: true, nullsFirst: false })
        .order('start_time', { ascending: true, nullsFirst: false }),
      sb.from('tasks').select('id, title, deadline, start_date, status, progress')
        .eq('remind_daily', true)
        .neq('status', 'done')
        .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
    ])
    setReminders(rems || [])
    setTaskReminders(tasks || [])
    setLoading(false)
  }

  async function turnOffTaskReminder(taskId) {
    await sb.from('tasks').update({ remind_daily: false }).eq('id', taskId)
    setTaskReminders(prev => prev.filter(t => t.id !== taskId))
    toast('Daily reminder turned off.')
  }

  async function checkNotifications() {
    const _n = new Date()
    const todayStr = [_n.getFullYear(), String(_n.getMonth()+1).padStart(2,'0'), String(_n.getDate()).padStart(2,'0')].join('-')
    const hour = new Date().getHours()
    const min = new Date().getMinutes()

    // Daily morning check (7–11 am)
    const morningKey = `ictlab_rem_morning_${userId}_${todayStr}`
    if (!localStorage.getItem(morningKey) && hour >= 7 && hour < 11) {
      localStorage.setItem(morningKey, '1')
      await sendNotification(userId, 'reminder_daily', '☀️ Good morning!', 'Check your daily reminder list for today.', null)
    }

    // Noon check (11 am–1 pm)
    const noonKey = `ictlab_rem_noon_${userId}_${todayStr}`
    if (!localStorage.getItem(noonKey) && hour >= 11 && hour < 13) {
      localStorage.setItem(noonKey, '1')
      const { data: todayRems } = await sb.from('reminders').select('*').eq('user_id', userId).or(`start_day.is.null,start_day.lte.${todayStr}`).eq('is_done', false)
      if ((todayRems || []).length > 0) {
        await sendNotification(userId, 'reminder_items', '🌤 Midday reminder', `You have ${todayRems.length} item(s) on your list today.`, null)
      }
    }

    // Afternoon check (3–5 pm)
    const afternoonKey = `ictlab_rem_afternoon_${userId}_${todayStr}`
    if (!localStorage.getItem(afternoonKey) && hour >= 15 && hour < 17) {
      localStorage.setItem(afternoonKey, '1')
      const { data: openRems } = await sb.from('reminders').select('*').eq('user_id', userId).or(`start_day.is.null,start_day.lte.${todayStr}`).eq('is_done', false)
      if ((openRems || []).length > 0) {
        await sendNotification(userId, 'reminder_items', '🌆 Afternoon check', `${openRems.length} reminder item(s) still open today.`, null)
      }
    }

    // Item-level: notify within 60 min of start_time today
    const { data: timedItems } = await sb.from('reminders').select('*').eq('user_id', userId).eq('start_day', todayStr).not('start_time', 'is', null).eq('is_done', false)
    const nowMin = hour * 60 + min
    for (const r of (timedItems || [])) {
      const [rH, rM] = r.start_time.split(':').map(Number)
      const rMin = rH * 60 + rM
      const diff = rMin - nowMin
      if (diff >= 0 && diff <= 60) {
        const itemKey = `ictlab_rem_item_${r.id}_${todayStr}`
        if (!localStorage.getItem(itemKey)) {
          localStorage.setItem(itemKey, '1')
          await sendNotification(userId, 'reminder_items', `⏰ Coming up: ${r.title}`, `Starts today at ${r.start_time}`, null)
        }
      }
    }
  }

  async function save() {
    if (!form.title.trim()) { toast('Please enter a title.'); return }
    setSaving(true)
    const payload = { user_id: userId, title: form.title.trim(), notes: form.notes.trim(), start_day: form.start_day || null, end_day: form.end_day || null, start_time: form.start_time || null, end_time: form.end_time || null }
    const isEdit = !!editId
    if (isEdit) {
      const { error } = await sb.from('reminders').update(payload).eq('id', editId)
      if (error) { toast('Could not save: ' + error.message); setSaving(false); return }
      setEditId(null)
    } else {
      const { error } = await sb.from('reminders').insert({ ...payload, is_done: false })
      if (error) { toast('Could not save: ' + error.message); setSaving(false); return }
    }
    setForm({ title: '', notes: '', start_day: '', end_day: '', start_time: '', end_time: '' })
    setShowAdd(false); setSaving(false)
    await load()
    toast(isEdit ? 'Reminder updated!' : 'Reminder added!')
  }

  async function toggleDone(r) {
    const { data } = await sb.from('reminders').update({ is_done: !r.is_done }).eq('id', r.id).select().single()
    if (data) setReminders(prev => prev.map(x => x.id === r.id ? data : x))
  }

  async function deleteReminder(id) {
    if (!confirm('Delete this reminder?')) return
    await sb.from('reminders').delete().eq('id', id)
    setReminders(prev => prev.filter(r => r.id !== id)); toast('Deleted.')
  }

  function startEdit(r) {
    setEditId(r.id)
    setForm({ title: r.title, notes: r.notes || '', start_day: r.start_day || '', end_day: r.end_day || '', start_time: r.start_time || '', end_time: r.end_time || '' })
    setShowAdd(true)
  }

  const isActiveToday = (r) => {
    if (r.start_day && r.start_day > today) return false
    if (r.end_day && r.end_day < today) return false
    return true
  }

  const fmtTime = (t) => { if (!t) return ''; const [h, m] = t.split(':'); const hr = +h; return `${hr % 12 || 12}:${m} ${hr < 12 ? 'AM' : 'PM'}` }

  const activeItems = reminders.filter(r => !r.is_done && isActiveToday(r))
  const futureItems = reminders.filter(r => !r.is_done && r.start_day && r.start_day > today)
  const activeTaskItems = taskReminders.filter(t => !t.start_date || t.start_date <= today)
  const upcomingTaskItems = taskReminders.filter(t => t.start_date && t.start_date > today)
  // Past = completed items + undone items whose end_day has passed, newest first
  const pastItems = reminders
    .filter(r => r.is_done || (!r.is_done && r.end_day && r.end_day < today))
    .sort((a, b) => {
      const aDate = a.end_day || a.start_day || ''
      const bDate = b.end_day || b.start_day || ''
      return bDate.localeCompare(aDate)
    })

  if (!userId) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>Reminders are personal — sign in as a lab manager to use this feature.</div>
  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  const ReminderCard = ({ r, isFuture = false, isExpired = false }) => {
    const isGhosted = isFuture || r.is_done || isExpired
    return (
      <div
        onClick={() => !r.is_done && startEdit(r)}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--surface2)', background: r.is_done ? 'var(--surface2)' : 'transparent', opacity: isGhosted ? 0.6 : 1, transition: 'background 0.15s, opacity 0.15s', cursor: r.is_done ? 'default' : 'pointer' }}
        onMouseEnter={e => { if (!r.is_done) { e.currentTarget.style.background = 'var(--surface2)'; if (isGhosted) e.currentTarget.style.opacity = '0.85' } }}
        onMouseLeave={e => { if (!r.is_done) { e.currentTarget.style.background = 'transparent'; if (isGhosted) e.currentTarget.style.opacity = '0.6' } }}>
        <button onClick={e => { e.stopPropagation(); if (!isFuture) toggleDone(r) }} style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${r.is_done ? '#2e7d32' : isExpired ? '#c84b2f' : 'var(--border)'}`, background: r.is_done ? '#2e7d32' : 'transparent', flexShrink: 0, cursor: isFuture ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }} title={isFuture ? 'Not active yet' : isExpired ? 'Mark as done' : ''}>
          {r.is_done && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
          {isExpired && !r.is_done && <span style={{ color: '#c84b2f', fontSize: 11, fontWeight: 700 }}>!</span>}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: r.is_done || isExpired ? 'var(--text3)' : isFuture ? 'var(--text2)' : 'var(--text)', textDecoration: r.is_done ? 'line-through' : 'none' }}>{r.title}</div>
            {isExpired && !r.is_done && <span style={{ fontSize: 10, background: '#fdecea', color: '#c84b2f', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>Expired</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            {(r.start_day || r.end_day) && (
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                📅 {r.start_day && new Date(r.start_day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {r.end_day && r.start_day !== r.end_day && ` → ${new Date(r.end_day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </span>
            )}
            {(r.start_time || r.end_time) && (
              <span style={{ fontSize: 11, color: isFuture || isExpired ? 'var(--text3)' : BLUE }}>
                🕐 {r.start_time ? fmtTime(r.start_time) : ''}
                {r.end_time ? ` – ${fmtTime(r.end_time)}` : ''}
              </span>
            )}
          </div>
          {r.notes && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, fontStyle: 'italic' }}>{r.notes}</div>}
          {!r.is_done && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
            {isFuture ? 'Tap to edit · Not active yet' : isExpired ? 'Tap to edit · Mark done or update dates' : 'Tap to edit'}
          </div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={e => { e.stopPropagation(); deleteReminder(r.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c84b2f', fontSize: 16, padding: '2px 4px', opacity: 0.6, lineHeight: 1 }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.6'} title="Delete">×</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 680 }}>
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', width: '100%', maxWidth: 480, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{editId ? 'Edit reminder' : 'Add reminder'}</div>
              <button onClick={() => { setShowAdd(false); setEditId(null) }} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}>×</button>
            </div>
            <div className="field"><label>Title *</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="What to remember…" autoFocus /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label>Start day <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opt)</span></label><input type="date" value={form.start_day} onChange={e => setForm({ ...form, start_day: e.target.value })} /></div>
              <div className="field"><label>End day <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opt)</span></label><input type="date" value={form.end_day} onChange={e => setForm({ ...form, end_day: e.target.value })} /></div>
              <div className="field"><label>Start time <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opt)</span></label><input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} /></div>
              <div className="field"><label>End time <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opt)</span></label><input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} /></div>
            </div>
            <div className="field"><label>Notes <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opt)</span></label><textarea rows={2} style={{ resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional details…" /></div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14, background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', lineHeight: 1.6 }}>
              <strong>Notifications:</strong> If a start time is set, you'll be alerted when it's within 60 minutes. You'll also get morning (7–11am), noon, and afternoon reminders for all active items.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editId ? 'Save changes' : 'Add'}</button>
              <button className="btn" onClick={() => { setShowAdd(false); setEditId(null) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>My Daily Reminders</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Personal list — only visible to you</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditId(null); setForm({ title: '', notes: '', start_day: '', end_day: '', start_time: '', end_time: '' }); setShowAdd(true) }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>+</span> Add reminder
        </button>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '10px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Today &amp; Active</span>
          <span style={{ fontSize: 11, background: BLUE, color: 'white', borderRadius: 99, padding: '1px 8px', fontWeight: 600 }}>{activeItems.length + activeTaskItems.length}</span>
        </div>
        {activeItems.map(r => <ReminderCard key={r.id} r={r} />)}
        {activeTaskItems.map(t => <TaskReminderRow key={t.id} task={t} today={today} onTurnOff={turnOffTaskReminder} />)}
        {activeItems.length === 0 && activeTaskItems.length === 0 && (
          <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>No active reminders for today. 🎉</div>
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '10px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>📅 Upcoming</span>
          <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>{futureItems.length + upcomingTaskItems.length} item{futureItems.length + upcomingTaskItems.length !== 1 ? 's' : ''}</span>
        </div>
        {futureItems.map(r => <ReminderCard key={r.id} r={r} isFuture />)}
        {upcomingTaskItems.map(t => <TaskReminderRow key={t.id} task={t} today={today} onTurnOff={turnOffTaskReminder} />)}
        {futureItems.length === 0 && upcomingTaskItems.length === 0 && (
          <div style={{ padding: '16px', fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>No upcoming reminders.</div>
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <button onClick={() => setShowDone(s => !s)} style={{ width: '100%', padding: '10px 16px', background: 'var(--surface2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🕘 Past &amp; History</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)' }}>{pastItems.length} item{pastItems.length !== 1 ? 's' : ''}</span>
          </div>
          <span style={{ fontSize: 12 }}>{showDone ? '▲' : '▼'}</span>
        </button>
        {showDone && (
          pastItems.length === 0
            ? <div style={{ padding: '16px', fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>No past reminders yet.</div>
            : pastItems.map(r => {
                const isExpired = !r.is_done && r.end_day && r.end_day < today
                return <ReminderCard key={r.id} r={r} isExpired={!!isExpired} />
              })
        )}
      </div>
    </div>
  )
}

export default function PM() {
  const { session, sidebarSubTab, setSidebarSubTab } = useAppStore()
  const activeTab = sidebarSubTab || 'overview'
  const [pendingTask, setPendingTask] = useState(null)
  const [studentGroupId, setStudentGroupId] = useState(undefined) // undefined=loading, null=no group, uuid=has group
  const userId = session?.userId
  const isOwnerAdmin = !userId
  const isAdmin = session?.role === 'admin' || session?.role === 'user'
  const isStudent = session?.role === 'lab_user'
  const userName = session?.username || 'Lab Manager'
  const isSolo = session?.loginMode === 'solo'
  const orgId = session?.organizationId || null

  useEffect(() => {
    if (isStudent && userId) {
      sb.from('team_task_group_members').select('group_id').eq('user_id', userId).eq('status', 'accepted').maybeSingle()
        .then(({ data }) => setStudentGroupId(data?.group_id || null))
    }
  }, [userId, isStudent])

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.3px' }}>Task Board</div>
        </div>
        <HelpPanel screen="pm" />
      </div>
      {activeTab === 'overview'  && <Overview userId={userId} isOwnerAdmin={isOwnerAdmin} isSolo={isSolo} orgId={orgId} onTaskClick={task => { setPendingTask(task); setSidebarSubTab('tasks') }} />}
      {activeTab === 'tasks'     && <MyTasks userId={userId} isAdmin={isAdmin || isStudent} isOwnerAdmin={isOwnerAdmin} userName={userName} isSolo={isSolo} orgId={orgId} isStudent={isStudent} pendingTask={pendingTask} onPendingTaskConsumed={() => setPendingTask(null)} onGroupChange={gid => { setStudentGroupId(gid || null); if (!gid && activeTab === 'team') setSidebarSubTab('tasks') }} />}
      {activeTab === 'team'      && !isStudent && <Team orgId={orgId} isSolo={isSolo} userId={userId} isAdmin={isAdmin} userName={userName} />}
      {activeTab === 'team'      && isStudent && studentGroupId && <StudentTeamView userId={userId} groupId={studentGroupId} orgId={orgId} />}
      {activeTab === 'calendar'  && <CalendarView userId={userId} isOwnerAdmin={isOwnerAdmin} isSolo={isSolo} orgId={orgId} onTaskClick={task => { setPendingTask(task); setSidebarSubTab('tasks') }} />}
      {activeTab === 'meetings'  && !isStudent && <Meetings userId={userId} isAdmin={isAdmin} userName={userName} orgId={orgId} />}
      {activeTab === 'reminder'  && <Reminders userId={userId} />}
      {activeTab === 'assign'    && session?.role === 'admin' && <AssignOthers userId={userId} orgId={orgId} />}
    </div>
  )
}
