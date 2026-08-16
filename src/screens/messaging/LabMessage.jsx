import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import { buildEmailHtml } from '../../lib/emailTemplate'
import HelpPanel from '../../components/HelpPanel'
import { IconPaperclip, IconSend, IconChat, IconMegaphone } from '../../components/Icons'

async function sendAppNotification(userId, senderName, messageBody) {
  if (!userId) return
  await sb.from('notifications').insert({
    user_id: userId,
    type: 'new_message',
    title: `New message from ${senderName}`,
    body: messageBody.slice(0, 100) + (messageBody.length > 100 ? '…' : ''),
    read: false,
  })
}

async function sendMessageEmail(userId, senderName, messageBody) {
  if (!userId) return
  const { data: prefs } = await sb.from('notification_prefs').select('*').eq('user_id', userId).maybeSingle()
  if (!prefs || prefs['email_message_reply'] !== true) return
  const { data: user } = await sb.from('users').select('email, organization_id').eq('id', userId).maybeSingle()
  const toEmail = user?.email
  if (!toEmail) return
  let orgContact = null
  if (user?.organization_id) {
    const { data: org } = await sb.from('organizations').select('contact_name, contact_email').eq('id', user.organization_id).maybeSingle()
    orgContact = org
  }
  const title = `New message from ${senderName}`
  const body = messageBody.slice(0, 200) + (messageBody.length > 200 ? '…' : '')
  const htmlBody = buildEmailHtml({ title, body, ctaLabel: 'View Message in ICT-Lab →', ctaUrl: 'https://ictlab.app/?screen=remessages', prefsUrl: 'https://ictlab.app/?screen=profile', orgContact })
  await sb.from('email_notifications_queue').insert({ to_email: toEmail, subject: title, body, html_body: htmlBody, user_id: userId, type: 'message_reply' })
}

function fmtDate(d) {
  if (!d) return ''
  const date = new Date(d)
  const now = new Date()
  const diff = (now - date) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

// "Today" / "Yesterday" / "Jul 12" — for thread date separators
function dayLabel(d) {
  const date = new Date(d)
  const now = new Date()
  const startOf = x => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

function sameDay(a, b) {
  const x = new Date(a), y = new Date(b)
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
}

const CHAT_BACKGROUNDS = [
  { key: 'default',   label: 'Default',   preview: '#f3f4f6', style: { background: 'var(--bg)' } },
  { key: 'sky',       label: 'Sky',       preview: '#bae6fd', style: { background: 'linear-gradient(160deg,#e0f2fe 0%,#f0f9ff 100%)' } },
  { key: 'mint',      label: 'Mint',      preview: '#6ee7b7', style: { background: 'linear-gradient(160deg,#d1fae5 0%,#ecfdf5 100%)' } },
  { key: 'warm',      label: 'Warm',      preview: '#fcd34d', style: { background: 'linear-gradient(160deg,#fef3c7 0%,#fffbeb 100%)' } },
  { key: 'lavender',  label: 'Lavender',  preview: '#c4b5fd', style: { background: 'linear-gradient(160deg,#ede9fe 0%,#f5f3ff 100%)' } },
  { key: 'slate',     label: 'Slate',     preview: '#475569', style: { background: 'linear-gradient(160deg,#1e293b 0%,#0f172a 100%)' } },
  { key: 'dotgrid',   label: 'Dot Grid',  preview: '#94a3b8', style: { background: '#f8fafc', backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)', backgroundSize: '20px 20px' } },
]

const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i
function isImageFile(name, url) {
  return IMG_EXT.test(name || '') || IMG_EXT.test((url || '').split('?')[0])
}

function getUserDisplayName(u) {
  if (!u) return ''
  return u.nick_name?.trim() || [u.name, u.last_name].filter(Boolean).join(' ').trim() || '—'
}
function getRoleLabel(u) {
  if (u.role === 'admin') return 'Admin'
  if (u.role === 'lab_user') return 'Lab User'
  return 'Lab Manager'
}

function UserMultiSelectDropdown({ users, selectedIds, onChange, isLabUser, orgName }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    function onDown(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const q = query.toLowerCase()
  const filtered = q
    ? users.filter(u => getUserDisplayName(u).toLowerCase().includes(q) || getRoleLabel(u).toLowerCase().includes(q))
    : users

  function toggle(u) {
    const list = selectedIds ?? []
    const already = list.includes(u.id)
    onChange(already ? list.filter(id => id !== u.id) : [...list, u.id])
  }

  function remove(id) { onChange((selectedIds ?? []).filter(x => x !== id)) }

  const isBroadcast = !isLabUser && selectedIds !== null && selectedIds.length === 0

  return (
    <div ref={wrapRef}>
      {/* Selected chips */}
      {(selectedIds !== null && (selectedIds.length > 0 || isBroadcast)) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {isBroadcast && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
              <IconMegaphone size={11} /> All {orgName || 'org'} users
              <span onClick={() => onChange(null)} style={{ cursor: 'pointer', fontWeight: 700, fontSize: 18, lineHeight: 1, marginLeft: 4 }}>×</span>
            </span>
          )}
          {selectedIds.map(id => {
            const u = users.find(x => x.id === id)
            if (!u) return null
            return (
              <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 500 }}>
                {getUserDisplayName(u)}
                <span onClick={() => remove(id)} style={{ cursor: 'pointer', fontWeight: 700, fontSize: 18, lineHeight: 1, marginLeft: 4 }}>×</span>
              </span>
            )
          })}
        </div>
      )}
      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={isLabUser ? 'Search by name…' : (selectedIds?.length ? 'Add more…' : 'Search by name, or choose "All org users"…')}
          autoComplete="off"
        />
        {open && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 200, maxHeight: 220, overflowY: 'auto' }}>
            {!isLabUser && (
              <div onClick={() => { onChange([]); setQuery(''); setOpen(false) }}
                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 500, color: 'var(--accent)', background: isBroadcast ? 'var(--accent-light)' : undefined }}>
                <IconMegaphone size={12} style={{ marginRight: 6 }} /> All {orgName || 'org'} users (broadcast)
              </div>
            )}
            {filtered.length === 0
              ? <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text3)' }}>No users found</div>
              : filtered.map(u => {
                  const selected = (selectedIds ?? []).includes(u.id)
                  return (
                    <div key={u.id} onClick={() => { toggle(u); setQuery('') }}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: selected ? 'var(--accent-light)' : undefined }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, background: selected ? 'var(--accent)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selected && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                      </div>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{u.nick_name?.trim() || u.name || '—'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', borderRadius: 4, padding: '2px 6px' }}>{getRoleLabel(u)}</span>
                    </div>
                  )
                })
            }
          </div>
        )}
      </div>
    </div>
  )
}

// Profile photo → gender scientist emoji → initial letter (same fallback
// chain as the Training hub's UserAvatar for app-wide consistency)
function Avatar({ name, user, size = 32 }) {
  if (user?.photo_url) {
    return <img src={user.photo_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid var(--border)', flexShrink: 0 }} />
  }
  const g = (user?.gender || '').toLowerCase()
  const emoji = g === 'male' ? '👨‍🔬' : g === 'female' ? '👩‍🔬' : null
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--accent-light)', border: '1.5px solid var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: emoji ? Math.floor(size * 0.5) : Math.floor(size * 0.38),
      fontWeight: 700, color: 'var(--accent)', flexShrink: 0, lineHeight: 1,
    }}>
      {emoji || (name || '?')[0].toUpperCase()}
    </div>
  )
}

function NewConvModal({ session, staff, orgName, onSent, onClose }) {
  const { toast } = useAppStore()
  const [receiverIds, setReceiverIds] = useState(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [file, setFile] = useState(null)
  const [sending, setSending] = useState(false)
  const fileRef = useRef(null)
  const isLabUser = session?.role === 'lab_user'

  const ids = receiverIds ?? []
  const canSend = receiverIds !== null && subject.trim().length > 0 && body.trim().length > 0

  async function send() {
    if (receiverIds === null) { toast('Please select who to send to.'); return }
    if (!subject.trim()) { toast('Subject is required.'); return }
    if (!body.trim()) { toast('Message is required.'); return }
    setSending(true)
    let fileUrl = null, fileName = null
    if (file) {
      const ext = file.name.split('.').pop()
      const path = `re_messages/${Date.now()}_${session.userId}.${ext}`
      const { error } = await sb.storage.from('lab-files').upload(path, file)
      if (!error) {
        const { data: url } = sb.storage.from('lab-files').getPublicUrl(path)
        fileUrl = url.publicUrl; fileName = file.name
      }
    }

    const isBroadcast = ids.length === 0
    const baseMsg = {
      sender_id: session.userId, sender_name: session.username,
      subject: subject || null, body: body.trim(),
      organization_id: session?.organizationId || null,
      ...(fileUrl ? { file_url: fileUrl, file_name: fileName } : {}),
    }

    if (isBroadcast) {
      const { error } = await sb.from('re_messages').insert({
        ...baseMsg,
        receiver_id: null,
        receiver_name: 'All org users',
      })
      if (error) { toast('Failed to send: ' + error.message); setSending(false); return }
    } else {
      for (const rid of ids) {
        const receiver = staff.find(s => s.id === rid)
        const { error } = await sb.from('re_messages').insert({
          ...baseMsg,
          receiver_id: rid,
          receiver_name: receiver ? getUserDisplayName(receiver) : null,
        })
        if (error) { toast('Failed to send: ' + error.message); setSending(false); return }
        await sendAppNotification(rid, session.username, body.trim())
        await sendMessageEmail(rid, session.username, body.trim())
      }
    }

    toast(isBroadcast ? 'Broadcast sent ✓' : `Message sent to ${ids.length} recipient${ids.length > 1 ? 's' : ''} ✓`)
    setSending(false)
    onSent()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 520, width: '100%', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>New conversation</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <div className="field">
          <label>To <span style={{ color: '#c84b2f' }}>*</span></label>
          <UserMultiSelectDropdown users={staff} selectedIds={receiverIds} onChange={setReceiverIds} isLabUser={isLabUser} orgName={orgName} />
        </div>
        <div className="field">
          <label>Subject <span style={{ color: '#c84b2f' }}>*</span></label>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Equipment question, Booking issue…" />
        </div>
        <div className="field">
          <label>Message <span style={{ color: '#c84b2f' }}>*</span></label>
          <textarea rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message here…" style={{ resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>📎 {file ? file.name : 'Attach file'}</button>
          {file && <button className="btn btn-sm btn-danger" onClick={() => setFile(null)}>✕</button>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={send} disabled={sending || !canSend}>{sending ? 'Sending…' : 'Send'}</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function LabMessage() {
  const { session, toast, setScreen } = useAppStore()
  const [conversations, setConversations] = useState([])
  const [staff, setStaff] = useState([])
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [showCompose, setShowCompose] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replyFile, setReplyFile] = useState(null)
  const [sendingReply, setSendingReply] = useState(false)
  const [mobileShowThread, setMobileShowThread] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null) // { type:'conv', conv } | { type:'all' }
  const [listSearch, setListSearch] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [showBgPicker, setShowBgPicker] = useState(false)
  const [chatBg, setChatBg] = useState(() => localStorage.getItem('ictlab_chat_bg') || 'default')
  const [orgName, setOrgName] = useState('')
  const threadRef = useRef(null)
  const replyFileRef = useRef(null)
  const textareaRef = useRef(null)
  const selectedIdRef = useRef(null)   // avoids stale closure in realtime/poll callbacks
  const reloadTimer = useRef(null)

  const [fromEquipScan] = useState(() => {
    const flag = sessionStorage.getItem('ictlab_return_scan') === '1'
    if (flag) sessionStorage.removeItem('ictlab_return_scan')
    return flag
  })

  const isAdmin = session?.role === 'admin'
  const isStaff = session?.role === 'user'
  const isOrgAdmin = isAdmin && !!session?.userId  // excludes super admin (userId===null)
  const selectedConv = conversations.find(c => c.id === selectedId) || null

  useEffect(() => { load(); loadStaff() }, [])

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  // Live updates: Supabase realtime on re_messages, plus a 20s poll and a
  // refresh on tab focus as fallback (realtime needs the table in the
  // supabase_realtime publication — polling guarantees delivery regardless)
  useEffect(() => {
    const scheduleReload = () => {
      clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(loadSilent, 250)
    }
    const ch = sb.channel('re-messages-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 're_messages' }, scheduleReload)
      .subscribe()
    const iv = setInterval(loadSilent, 20000)
    const onVis = () => { if (!document.hidden) loadSilent() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      sb.removeChannel(ch)
      clearInterval(iv)
      clearTimeout(reloadTimer.current)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [selectedId, selectedConv?.replies?.length])

  async function loadStaff() {
    if (session?.organizationId) {
      const { data: org } = await sb.from('organizations').select('name').eq('id', session.organizationId).maybeSingle()
      if (org?.name) setOrgName(org.name)
    }
    // Students message staff/admins only; staff/admins can message everyone incl. lab users
    const roles = (isAdmin || isStaff) ? ['user', 'admin', 'lab_user'] : ['user', 'admin']
    let q = sb.from('users').select('id, name, last_name, nick_name, email, role').in('role', roles).eq('is_active', true)
    if (session?.organizationId && session?.userId) q = q.eq('organization_id', session.organizationId)
    const { data } = await q
    const ROLE_ORDER = { user: 0, lab_user: 1, admin: 2 }
    const sorted = (data || []).sort((a, b) =>
      (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3) ||
      getUserDisplayName(a).localeCompare(getUserDisplayName(b))
    )
    setStaff(sorted)
    // avatar lookup: all org users (photo + gender), keyed by id
    let uq = sb.from('users').select('id, photo_url, gender, role').eq('is_active', true)
    if (session?.organizationId && session?.userId) uq = uq.eq('organization_id', session.organizationId)
    const { data: allUsers } = await uq
    const m = {}
    ;(allUsers || []).forEach(u => { m[u.id] = u })
    setUserMap(m)
  }

  async function fetchAll() {
    let q = sb.from('re_messages').select('*').order('created_at', { ascending: true })
    if (!isAdmin) {
      // all authenticated team users see broadcast messages (receiver_id is null)
      const broadcastClause = `,receiver_id.is.null`
      q = q.or(`receiver_id.eq.${session.userId},sender_id.eq.${session.userId}${broadcastClause}`)
      if (session?.organizationId) q = q.eq('organization_id', session.organizationId)
    } else if (session?.organizationId && session?.userId) {
      q = q.eq('organization_id', session.organizationId)
    }
    const { data } = await q
    return data || []
  }

  async function load() {
    setLoading(true)
    buildConversations(await fetchAll())
    setLoading(false)
  }

  // Background refresh — no spinner, no selection change. If the open thread
  // received new messages, mark them read right away (we're looking at them).
  async function loadSilent() {
    const convs = buildConversations(await fetchAll())
    const open = convs.find(c => c.id === selectedIdRef.current)
    if (open && open.unreadCount > 0) {
      markRead(open)
      setConversations(cs => cs.map(c => c.id === open.id
        ? {
            ...c, unreadCount: 0,
            is_read: c.sender_id !== session?.userId ? true : c.is_read,
            replies: c.replies.map(r => r.sender_id !== session?.userId ? { ...r, is_read: true } : r),
          }
        : c
      ))
    }
  }

  function buildConversations(msgs) {
    const roots = msgs.filter(m => !m.parent_id)
    const replies = msgs.filter(m => m.parent_id)
    const convs = roots.map(r => {
      const threadReplies = replies
        .filter(x => x.parent_id === r.id)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      const unread = [r, ...threadReplies].filter(m => m.sender_id !== session?.userId && !m.is_read).length
      const lastMsg = threadReplies.length ? threadReplies[threadReplies.length - 1] : r
      return { ...r, replies: threadReplies, unreadCount: unread, lastMessage: lastMsg }
    }).sort((a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at))
    setConversations(convs)
    return convs
  }

  async function markRead(conv) {
    try {
      const ids = [conv, ...conv.replies]
        .filter(m => m.sender_id !== session?.userId && !m.is_read)
        .map(m => m.id)
      if (ids.length) await sb.from('re_messages').update({ is_read: true }).in('id', ids)
    } catch (_) {}
  }

  function selectConv(conv) {
    setSelectedId(conv.id)
    setReplyText('')
    setReplyFile(null)
    setMobileShowThread(true)
    markRead(conv)
    // only mark OTHERS' messages read — own messages' is_read means "seen by recipient"
    setConversations(cs => cs.map(c => c.id === conv.id
      ? {
          ...c, unreadCount: 0,
          is_read: c.sender_id !== session?.userId ? true : c.is_read,
          replies: c.replies.map(r => r.sender_id !== session?.userId ? { ...r, is_read: true } : r),
        }
      : c
    ))
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedConv || sendingReply) return
    setSendingReply(true)
    let fileUrl = null, fileName = null
    if (replyFile) {
      const ext = replyFile.name.split('.').pop()
      const path = `re_messages/${Date.now()}_${session.userId}.${ext}`
      const { error } = await sb.storage.from('lab-files').upload(path, replyFile)
      if (!error) {
        const { data: url } = sb.storage.from('lab-files').getPublicUrl(path)
        fileUrl = url.publicUrl; fileName = replyFile.name
      }
    }
    const otherId = selectedConv.sender_id === session?.userId
      ? selectedConv.receiver_id
      : selectedConv.sender_id
    const otherName = selectedConv.sender_id === session?.userId
      ? selectedConv.receiver_name
      : selectedConv.sender_name

    const { data: newMsg, error: replyErr } = await sb.from('re_messages').insert({
      parent_id: selectedConv.id,
      sender_id: session.userId, sender_name: session.username,
      receiver_id: otherId || null, receiver_name: otherName || null,
      body: replyText.trim(),
      organization_id: session?.organizationId || null,
      ...(fileUrl ? { file_url: fileUrl, file_name: fileName } : {}),
    }).select().single()
    if (replyErr) { toast('Failed to send: ' + replyErr.message); setSendingReply(false); return }

    if (otherId) {
      await sendAppNotification(otherId, session.username, replyText.trim())
      await sendMessageEmail(otherId, session.username, replyText.trim())
    }

    if (newMsg) {
      setConversations(cs => cs.map(c => c.id === selectedId
        ? { ...c, replies: [...c.replies, newMsg], lastMessage: newMsg }
        : c
      ))
    }
    setReplyText('')
    setReplyFile(null)
    setSendingReply(false)
    textareaRef.current?.focus()
  }

  async function deleteMsg(id) {
    await sb.from('re_messages').delete().eq('id', id)
    setDeleteConfirm(null)
    toast('Message deleted.')
    const isRoot = conversations.some(c => c.id === id)
    if (isRoot) {
      setConversations(cs => cs.filter(c => c.id !== id))
      setSelectedId(null)
      setMobileShowThread(false)
    } else {
      setConversations(cs => cs.map(c => ({ ...c, replies: c.replies.filter(r => r.id !== id) })))
    }
  }

  async function deleteConv(conv) {
    await sb.from('re_messages').delete().eq('parent_id', conv.id)
    await sb.from('re_messages').delete().eq('id', conv.id)
    setConversations(cs => cs.filter(c => c.id !== conv.id))
    setSelectedId(null)
    setMobileShowThread(false)
    setConfirmAction(null)
    toast('Conversation deleted.')
  }

  async function deleteAllConvs() {
    const orgId = session?.organizationId
    if (!orgId) return
    await sb.from('re_messages').delete().eq('organization_id', orgId)
    setConversations([])
    setSelectedId(null)
    setMobileShowThread(false)
    setConfirmAction(null)
    toast('All conversations deleted.')
  }

  function canDelete(m) {
    return isAdmin || isStaff ? m.sender_id === session?.userId || isAdmin : m.sender_id === session?.userId
  }

  function otherName(conv) {
    if (!conv) return ''
    if (conv.sender_id === session?.userId) return conv.receiver_name || 'All Staff'
    return conv.sender_name || 'Unknown'
  }

  function otherUser(conv) {
    if (!conv) return null
    const id = conv.sender_id === session?.userId ? conv.receiver_id : conv.sender_id
    return id ? userMap[id] : null
  }

  const isBroadcast = conv => !conv?.receiver_id

  function BroadcastBadge({ small }) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fef3c7', color: '#92400e', borderRadius: 99, padding: small ? '1px 6px' : '2px 8px', fontSize: small ? 9 : 11, fontWeight: 700, flexShrink: 0, lineHeight: 1.5 }}>
        <IconMegaphone size={small ? 10 : 12} /> All lab managers
      </span>
    )
  }

  const totalUnread = conversations.reduce((s, c) => s + (c.unreadCount || 0), 0)

  // List filtering: search matches name, subject and any message body
  const q = listSearch.trim().toLowerCase()
  const visibleConvs = conversations.filter(c => {
    if (unreadOnly && !c.unreadCount) return false
    if (!q) return true
    if (otherName(c).toLowerCase().includes(q)) return true
    if ((c.subject || '').toLowerCase().includes(q)) return true
    return [c, ...c.replies].some(m => (m.body || '').toLowerCase().includes(q))
  })

  // Auto-resize textarea
  function handleTextareaInput(e) {
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    setReplyText(el.value)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 68px)' }}>
      {/* Page header */}
      <div className={mobileShowThread ? 'msg-header-hide-mobile' : ''} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10, flexShrink: 0 }}>
        <div>
          {fromEquipScan && (
            <button onClick={() => setScreen('equipmentscan')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1.5px solid #b2dfcb', background: '#E1F5EE', fontSize: 13, fontWeight: 700, color: '#1D9E75', cursor: 'pointer', marginBottom: 8 }}>
              ← Back to options
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="section-title">Lab Messages</div>
            <HelpPanel screen="remessages" />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>Notes, ideas, questions &amp; issue reports</div>
        </div>
      </div>

      {/* Two-panel container */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface)' }}>

        {/* LEFT — conversation list */}
        <div className={`msg-panel-left${mobileShowThread ? ' msg-hidden' : ''}`} style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface2)', flexShrink: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              Conversations
              {totalUnread > 0 && (
                <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px', lineHeight: 1.4 }}>{totalUnread}</span>
              )}
            </div>
            <button className="btn btn-primary btn-sm" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setShowCompose(true)}>+ New</button>
          </div>

          {/* Search + unread filter */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, background: 'var(--surface)' }}>
            <input
              value={listSearch}
              onChange={e => setListSearch(e.target.value)}
              placeholder="Search…"
              style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            />
            <button
              onClick={() => setUnreadOnly(v => !v)}
              title="Show unread only"
              style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', flexShrink: 0, border: `1px solid ${unreadOnly ? 'var(--accent)' : 'var(--border)'}`, background: unreadOnly ? 'var(--accent)' : 'var(--surface)', color: unreadOnly ? '#fff' : 'var(--text2)', transition: 'all 0.15s' }}
            >
              Unread{totalUnread > 0 ? ` (${totalUnread})` : ''}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" /></div>
            ) : visibleConvs.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>
                <div style={{ marginBottom: 8, opacity: 0.6 }}><IconChat size={36} /></div>
                <div style={{ fontSize: 13 }}>
                  {conversations.length === 0 ? 'No conversations yet'
                    : unreadOnly && !q ? 'No unread conversations'
                    : `No conversations match${q ? ` "${listSearch.trim()}"` : ''}`}
                </div>
              </div>
            ) : visibleConvs.map((conv, idx) => {
              const name = otherName(conv)
              const selected = conv.id === selectedId
              const preview = (conv.lastMessage?.body || '').slice(0, 52) + ((conv.lastMessage?.body?.length || 0) > 52 ? '…' : '')
              return (
                <button key={conv.id} onClick={() => selectConv(conv)} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%',
                  padding: '12px 14px', border: 'none', borderBottom: '1px solid var(--border)',
                  background: selected ? 'var(--accent-light)' : conv.unreadCount > 0 ? 'rgba(29,158,117,0.035)' : idx % 2 === 0 ? 'var(--row-a-strong)' : 'var(--row-b-strong)',
                  cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                }}>
                  <Avatar name={name} user={otherUser(conv)} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4, marginBottom: 1 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                        <span style={{ fontWeight: conv.unreadCount > 0 ? 700 : 500, fontSize: 13, color: selected ? 'var(--accent)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{name}</span>
                        {isBroadcast(conv) && <BroadcastBadge small />}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0, fontFamily: 'var(--mono)' }}>{fmtDate(conv.lastMessage?.created_at)}</span>
                    </div>
                    {conv.subject && (
                      <div style={{ fontSize: 11, fontWeight: 600, color: selected ? 'var(--accent)' : 'var(--text2)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.subject}</div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{preview}</span>
                      {conv.unreadCount > 0 && (
                        <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, fontSize: 9, fontWeight: 700, padding: '1px 4px', flexShrink: 0, lineHeight: 1.4 }}>{conv.unreadCount}</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          {isOrgAdmin && conversations.length > 0 && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface2)', flexShrink: 0 }}>
              <button
                onClick={() => setConfirmAction({ type: 'all' })}
                style={{ width: '100%', padding: '6px 0', background: '#fde8e8', color: '#c84b2f', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                🗑 Delete all conversations
              </button>
            </div>
          )}
        </div>

        {/* RIGHT — thread */}
        <div className={`msg-panel-right${!mobileShowThread ? ' msg-hidden' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: selectedConv ? 'var(--bg)' : 'var(--surface)' }}>
          {!selectedConv ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
              <div style={{ marginBottom: 12, opacity: 0.4 }}><IconChat size={52} /></div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6, color: 'var(--text2)' }}>Select a conversation</div>
              <div style={{ fontSize: 13 }}>or tap <strong>+ New</strong> to start one</div>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', flexShrink: 0 }}>
                <button className="msg-back-btn" onClick={() => { setMobileShowThread(false) }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: 'var(--accent)', padding: '0 4px', lineHeight: 1, flexShrink: 0, display: 'none' }}>←</button>
                <Avatar name={otherName(selectedConv)} user={otherUser(selectedConv)} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {otherName(selectedConv)}
                    {isBroadcast(selectedConv) && <BroadcastBadge />}
                  </div>
                  {selectedConv.subject && <div style={{ fontSize: 12, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedConv.subject}</div>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                  {selectedConv.replies.length + 1} msg{selectedConv.replies.length !== 0 ? 's' : ''}
                </div>
                {/* Background picker button */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    onClick={() => setShowBgPicker(v => !v)}
                    title="Chat background"
                    style={{ border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 8, padding: '4px 10px', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text2)' }}
                  >
                    🎨
                  </button>
                  {showBgPicker && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, zIndex: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', minWidth: 220 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chat background</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {CHAT_BACKGROUNDS.map(bg => (
                          <button
                            key={bg.key}
                            onClick={() => { setChatBg(bg.key); localStorage.setItem('ictlab_chat_bg', bg.key); setShowBgPicker(false) }}
                            title={bg.label}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                          >
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: bg.preview, border: chatBg === bg.key ? '2px solid var(--accent)' : '2px solid var(--border)', boxShadow: chatBg === bg.key ? '0 0 0 2px var(--accent-light)' : 'none', transition: 'all 0.15s' }} />
                            <span style={{ fontSize: 10, color: chatBg === bg.key ? 'var(--accent)' : 'var(--text3)', fontWeight: chatBg === bg.key ? 700 : 400 }}>{bg.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {isOrgAdmin && (
                  <button
                    onClick={() => setConfirmAction({ type: 'conv', conv: selectedConv })}
                    title="Delete entire conversation"
                    style={{ border: 'none', background: '#fde8e8', color: '#c84b2f', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    🗑 Delete
                  </button>
                )}
              </div>

              {/* Bubbles */}
              <div ref={threadRef} onClick={() => showBgPicker && setShowBgPicker(false)} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 6, ...CHAT_BACKGROUNDS.find(b => b.key === chatBg)?.style }}>
                {[selectedConv, ...selectedConv.replies].map((m, i, all) => {
                  // Admins viewing a conversation they didn't participate in:
                  // put the conversation initiator on the right so both sides are visible.
                  const adminObserving = isAdmin &&
                    selectedConv.sender_id !== session?.userId &&
                    selectedConv.receiver_id !== session?.userId
                  const isOwn = adminObserving
                    ? m.sender_id === selectedConv.sender_id
                    : m.sender_id === session?.userId
                  const newDay = i === 0 || !sameDay(all[i - 1].created_at, m.created_at)
                  const prevSame = i > 0 && all[i - 1].sender_id === m.sender_id && !newDay
                  const nextSame = i < all.length - 1 && all[i + 1].sender_id === m.sender_id && sameDay(m.created_at, all[i + 1].created_at)
                  return (
                    <div key={m.id}>
                      {/* Day separator */}
                      {newDay && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: `${i === 0 ? 0 : 14}px 0 10px` }}>
                          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', background: 'var(--surface2)', borderRadius: 99, padding: '2px 10px' }}>{dayLabel(m.created_at)}</span>
                          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                        </div>
                      )}
                      {/* Sender label */}
                      {!prevSame && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: `${i === 0 || newDay ? 0 : 10}px 0 6px`, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
                          {!isOwn && <Avatar name={m.sender_name} user={userMap[m.sender_id]} size={22} />}
                          {isOwn && adminObserving && <Avatar name={m.sender_name} user={userMap[m.sender_id]} size={22} />}
                          <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500 }}>
                            {isOwn && !adminObserving ? 'You' : m.sender_name}
                          </span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginBottom: nextSame ? 2 : 8 }}>
                        <div style={{ maxWidth: '72%' }}>
                          <div style={{
                            background: isOwn ? 'var(--accent)' : '#E0F2FE',
                            color: isOwn ? '#fff' : '#0C4A6E',
                            borderRadius: isOwn
                              ? (prevSame ? '18px 4px 4px 18px' : nextSame ? '18px 18px 4px 18px' : '18px 4px 18px 18px')
                              : (prevSame ? '4px 18px 18px 4px' : nextSame ? '18px 18px 18px 4px' : '4px 18px 18px 18px'),
                            padding: '8px 14px',
                            fontSize: 14, lineHeight: 1.6,
                            border: isOwn ? 'none' : '1px solid #BAE6FD',
                            wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                            boxShadow: isOwn ? '0 2px 8px rgba(29, 158, 117,0.18)' : '0 1px 3px rgba(3,105,161,0.10)',
                          }}>
                            {m.body}
                          </div>
                          {m.file_url && (
                            isImageFile(m.file_name, m.file_url) ? (
                              <a href={m.file_url} target="_blank" rel="noopener" title={m.file_name || 'Image'} style={{ display: 'block', marginTop: 4 }}>
                                <img src={m.file_url} alt={m.file_name || 'Attachment'} loading="lazy"
                                  style={{ maxWidth: 220, maxHeight: 180, borderRadius: 10, border: '1px solid var(--border)', display: 'block', objectFit: 'cover', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }} />
                              </a>
                            ) : (
                              <a href={m.file_url} target="_blank" rel="noopener" style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, marginTop: 4,
                                color: 'var(--accent)',
                                background: 'var(--accent-light)', borderRadius: 6, padding: '4px 8px', textDecoration: 'none',
                              }}>
                                <IconPaperclip size={13} /> {m.file_name || 'Attachment'}
                              </a>
                            )
                          )}
                          {!nextSame && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
                              <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{fmtDate(m.created_at)}</span>
                              {/* Seen: last own message, direct (not broadcast), read by recipient */}
                              {isOwn && m.receiver_id && m.is_read && !all.slice(i + 1).some(x => x.sender_id === session?.userId) && (
                                <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>✓✓ Seen</span>
                              )}
                              {canDelete(m) && (
                                <button onClick={() => setDeleteConfirm(m.id)} title="Delete" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 10, color: 'var(--text3)', padding: 0, opacity: 0.55, lineHeight: 1 }}>✕</button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Reply bar */}
              <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
                {replyFile && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '4px 10px', background: 'var(--accent-light)', borderRadius: 6, fontSize: 12, color: 'var(--text2)' }}>
                    <IconPaperclip size={13} /> <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyFile.name}</span>
                    <button onClick={() => setReplyFile(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text3)', flexShrink: 0 }}>✕</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <input ref={replyFileRef} type="file" style={{ display: 'none' }} onChange={e => setReplyFile(e.target.files[0])} />
                  <button onClick={() => replyFileRef.current?.click()} title="Attach file" style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', flexShrink: 0 }}><IconPaperclip size={16} /></button>
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={replyText}
                    onInput={handleTextareaInput}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                    placeholder="Reply… (Enter to send, Shift+Enter for new line)"
                    style={{ flex: 1, borderRadius: 20, border: '1px solid var(--border)', padding: '8px 14px', fontSize: 14, resize: 'none', background: 'var(--surface)', color: 'var(--text)', lineHeight: 1.5, height: 38, maxHeight: 120, overflowY: 'auto', outline: 'none', fontFamily: 'var(--sans)', transition: 'border-color 0.15s' }}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                  <button
                    onClick={sendReply}
                    disabled={sendingReply || !replyText.trim()}
                    title="Send (Enter)"
                    style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: replyText.trim() ? 'var(--accent)' : 'var(--border)', color: replyText.trim() ? '#fff' : 'var(--text3)', cursor: replyText.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, transition: 'all 0.15s', flexShrink: 0, fontWeight: 700 }}
                  >
                    {sendingReply ? <span style={{ fontSize: 11 }}>…</span> : <IconSend size={16} />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showCompose && (
        <NewConvModal session={session} staff={staff} orgName={orgName} onSent={() => { setShowCompose(false); load() }} onClose={() => setShowCompose(false)} />
      )}

      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 320, width: '100%', border: '1px solid var(--border)', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Delete this message?</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => deleteMsg(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 340, width: '100%', border: '1px solid var(--border)', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
            {confirmAction.type === 'conv' ? (
              <>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Delete entire conversation?</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
                  This will permanently delete all {confirmAction.conv.replies.length + 1} message{confirmAction.conv.replies.length !== 0 ? 's' : ''} in this thread. Cannot be undone.
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button className="btn" onClick={() => setConfirmAction(null)}>Cancel</button>
                  <button className="btn btn-danger" onClick={() => deleteConv(confirmAction.conv)}>Delete conversation</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Delete ALL conversations?</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
                  This permanently removes every message in this organization. Cannot be undone.
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button className="btn" onClick={() => setConfirmAction(null)}>Cancel</button>
                  <button className="btn btn-danger" onClick={deleteAllConvs}>Delete all</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
