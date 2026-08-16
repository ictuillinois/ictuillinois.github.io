import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'
import { buildEmailHtml } from '../lib/emailTemplate'

function firstName(name) {
  return name?.split(' ')[0] || name || 'Unknown'
}

// Returns an error message string when the in-app notification could not be
// stored (so callers can surface it), or null on success.
async function sendNotification(userId, type, title, body) {
  if (!userId) return null
  // NOTE: this runs on the SENDER's session — reading the recipient's prefs
  // needs the notification_prefs_select_org RLS policy (rls_phase1.sql)
  const { data: prefs } = await sb.from('notification_prefs').select('*').eq('user_id', userId).maybeSingle()

  let notifError = null
  // in-app notification (default ON unless explicitly disabled)
  if (!prefs || prefs[type] !== false) {
    const { error } = await sb.from('notifications').insert({ user_id: userId, type, title, body, read: false })
    if (error) { console.warn('Notification insert failed:', error.message); notifError = error.message }
  }

  // email notification (opt-in — only if user enabled it)
  if (prefs && prefs[`email_${type}`] === true) {
    const { data: recipient } = await sb.from('users').select('phone, email, organization_id').eq('id', userId).maybeSingle()
    const recipientEmail = recipient?.phone || recipient?.email
    if (recipientEmail) {
      let orgContact = null
      if (recipient?.organization_id) {
        const { data: org } = await sb.from('organizations').select('contact_name, contact_email').eq('id', recipient.organization_id).maybeSingle()
        orgContact = org
      }
      const htmlBody = buildEmailHtml({ title, body, ctaLabel: 'View Invite in ICT-Lab →', ctaUrl: 'https://ictlab.app/?screen=profile&tab=team', prefsUrl: 'https://ictlab.app/?screen=profile', orgContact })
      await sb.from('email_notifications_queue').insert({ to_email: recipientEmail, subject: title, body, html_body: htmlBody, user_id: userId, type })
        .then(({ error: emailErr }) => { if (emailErr) console.warn('Email queue insert failed:', emailErr.message) })
    }
  }
  return notifError
}

// Returns display name for a user row: "FirstName LastName" or nickname hint
function displayName(u) {
  const first = u.email || ''   // first name is stored in the email column for students
  const last  = u.name  || ''
  const full  = [first, last].filter(Boolean).join(' ') || last || 'Unknown'
  return u.nickname ? `${full} "${u.nickname}"` : full
}

export default function TeamMembersPanel({ session }) {
  const { toast } = useAppStore()
  const [orgUsers, setOrgUsers] = useState([])
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [sending, setSending] = useState(false)
  const [outgoing, setOutgoing] = useState([])
  const [incoming, setIncoming] = useState([])
  const [members, setMembers] = useState([])
  const [joinedTeams, setJoinedTeams] = useState([])

  useEffect(() => { load() }, [session?.userId])

  async function load() {
    if (!session?.userId || !session?.organizationId) return

    const { data: users } = await sb.from('users')
      .select('id, name, email, phone, nickname, role')
      .eq('organization_id', session.organizationId)
      .eq('is_active', true)
      .neq('id', session.userId)
      .neq('role', 'admin')
      .order('name')
    const allOrgUsers = users || []
    setOrgUsers(allOrgUsers)
    const userMap = Object.fromEntries(allOrgUsers.map(u => [u.id, u]))

    // Outgoing invites (I sent)
    const { data: out } = await sb
      .from('team_workspace_invites')
      .select('id, invitee_id, status, created_at')
      .eq('inviter_id', session.userId)
      .order('created_at', { ascending: false })
    setOutgoing((out || []).map(i => ({ ...i, inviteeName: userMap[i.invitee_id]?.name || 'Unknown' })))

    // Incoming invites pending (sent to me)
    const { data: inc } = await sb
      .from('team_workspace_invites')
      .select('id, inviter_id, status, created_at')
      .eq('invitee_id', session.userId)
      .eq('status', 'pending')
    if (inc?.length) {
      const inviterIds = inc.map(i => i.inviter_id)
      const { data: inviters } = await sb.from('users').select('id, name').in('id', inviterIds)
      const inviterMap = Object.fromEntries((inviters || []).map(u => [u.id, u.name]))
      setIncoming(inc.map(i => ({ ...i, inviterName: inviterMap[i.inviter_id] || 'Unknown' })))
    } else {
      setIncoming([])
    }

    // Members I added (accepted my invite)
    const { data: mems } = await sb
      .from('team_workspace_members')
      .select('member_id')
      .eq('owner_id', session.userId)
    if (mems?.length) {
      const memberIds = mems.map(m => m.member_id)
      const { data: memberUsers } = await sb.from('users').select('id, name, role').in('id', memberIds)
      const memberUserMap = Object.fromEntries((memberUsers || []).map(u => [u.id, u]))
      setMembers(mems.map(m => ({ memberId: m.member_id, user: memberUserMap[m.member_id] || null })))
    } else {
      setMembers([])
    }

    // Teams I joined (I accepted someone else's invite)
    const { data: joined } = await sb
      .from('team_workspace_members')
      .select('owner_id')
      .eq('member_id', session.userId)
    if (joined?.length) {
      const ownerIds = joined.map(j => j.owner_id)
      const { data: owners } = await sb.from('users').select('id, name').in('id', ownerIds)
      const ownerMap = Object.fromEntries((owners || []).map(u => [u.id, u.name]))
      setJoinedTeams(joined.map(j => ({ ownerId: j.owner_id, ownerName: ownerMap[j.owner_id] || 'Unknown' })))
    } else {
      setJoinedTeams([])
    }
  }

  async function sendInvite() {
    if (!selectedUser) return
    const inviterName = firstName(session.username)
    const existing = outgoing.find(i => i.invitee_id === selectedUser.id && i.status !== 'declined')
    if (existing) {
      // Pending invite → re-send the in-app notification as a reminder
      if (existing.status === 'pending') {
        const notifErr = await sendNotification(
          selectedUser.id,
          'team_invite',
          `Reminder: ${inviterName} invited you to their project team`,
          'Open Profile → Project Team to accept or decline.'
        )
        toast(notifErr ? `Reminder failed: ${notifErr}` : 'Invite already pending — reminder sent.')
      } else {
        toast('This person already accepted your invite.')
      }
      return
    }
    setSending(true)
    const { error } = await sb.from('team_workspace_invites').insert({
      inviter_id: session.userId,
      invitee_id: selectedUser.id,
      organization_id: session.organizationId,
      status: 'pending',
    })
    if (error) {
      toast(error.code === '23505' ? 'Already invited this person.' : `Error: ${error.message}`)
      setSending(false)
      return
    }
    const notifErr = await sendNotification(
      selectedUser.id,
      'team_invite',
      `${inviterName} invited you to their project team`,
      'Open Profile → Project Team to accept or decline.'
    )
    toast(notifErr ? `Invite sent, but notifying failed: ${notifErr}` : 'Invite sent!')
    setSelectedUser(null)
    setSearch('')
    setSending(false)
    load()
  }

  async function acceptInvite(invite) {
    const { error } = await sb.from('team_workspace_members').insert({
      owner_id: invite.inviter_id,
      member_id: session.userId,
      organization_id: session.organizationId,
    })
    if (error && error.code !== '23505') { toast('Error accepting invite.'); return }
    await sb.from('team_workspace_invites').update({ status: 'accepted' }).eq('id', invite.id)
    const myName = firstName(session.username)
    await sendNotification(
      invite.inviter_id,
      'team_invite',
      `${myName} accepted your project team invite`,
      'Check Project & Material → Workspace → Project Members.'
    )
    toast(`Joined ${firstName(invite.inviterName)}'s project team!`)
    load()
  }

  async function declineInvite(invite) {
    await sb.from('team_workspace_invites').update({ status: 'declined' }).eq('id', invite.id)
    toast('Invite declined.')
    load()
  }

  async function removeMember(memberId, memberName) {
    if (!confirm(`Remove ${firstName(memberName)} from your project team?`)) return
    await sb.from('team_workspace_members').delete().eq('owner_id', session.userId).eq('member_id', memberId)
    await sb.from('team_workspace_invites').delete().eq('inviter_id', session.userId).eq('invitee_id', memberId)
    toast('Removed from team.')
    load()
  }

  async function leaveTeam(ownerId, ownerName) {
    if (!confirm(`Leave ${firstName(ownerName)}'s project team?`)) return
    await sb.from('team_workspace_members').delete().eq('owner_id', ownerId).eq('member_id', session.userId)
    await sb.from('team_workspace_invites')
      .update({ status: 'declined' })
      .eq('inviter_id', ownerId)
      .eq('invitee_id', session.userId)
    toast(`Left ${firstName(ownerName)}'s team.`)
    load()
  }

  async function revokeInvite(inviteId) {
    await sb.from('team_workspace_invites').delete().eq('id', inviteId)
    toast('Invite revoked.')
    load()
  }

  const statusStyle = (s) => ({
    fontSize: 11, fontWeight: 600, borderRadius: 99, padding: '2px 8px',
    background: s === 'accepted' ? '#E1F5EE' : s === 'declined' ? '#fde8e8' : '#fef3c7',
    color:      s === 'accepted' ? '#0f6e56' : s === 'declined' ? '#b91c1c' : '#92400e',
  })

  const alreadyInvitedOrMember = new Set([
    ...outgoing.filter(i => i.status !== 'declined').map(i => i.invitee_id),
    ...members.map(m => m.memberId),
  ])
  const availableUsers = orgUsers.filter(u => !alreadyInvitedOrMember.has(u.id))

  const q = search.trim().toLowerCase()
  const searchResults = q.length > 0 && !selectedUser
    ? availableUsers.filter(u =>
        (u.name     || '').toLowerCase().includes(q) ||
        (u.email    || '').toLowerCase().includes(q) ||
        (u.phone    || '').toLowerCase().includes(q) ||
        (u.nickname || '').toLowerCase().includes(q)
      )
    : []

  const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--surface2)', gap: 12, flexWrap: 'wrap' }

  return (
    <div>
      {incoming.length > 0 && (
        <div className="card" style={{ marginBottom: 20, border: '1.5px solid var(--accent)', background: 'var(--accent-light)' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: 'var(--accent)' }}>
            Pending project team invites for you
          </div>
          {incoming.map(inv => (
            <div key={inv.id} style={{ ...rowStyle, borderColor: 'rgba(29,158,117,0.2)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{firstName(inv.inviterName)}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>wants you to join their project team</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="btn btn-sm btn-primary" onClick={() => acceptInvite(inv)}>Accept</button>
                <button className="btn btn-sm" onClick={() => declineInvite(inv)}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Invite a team member</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
          Search by first name, last name, or nickname.
        </div>

        {selectedUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: 14 }}>
              <span style={{ fontWeight: 600 }}>{displayName(selectedUser)}</span>
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text3)' }}>{selectedUser.role === 'user' ? 'Lab Manager' : 'Lab User'}</span>
            </div>
            <button className="btn btn-sm" onClick={() => { setSelectedUser(null); setSearch('') }}>✕</button>
            <button onClick={sendInvite} disabled={sending} className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
              {sending ? 'Sending…' : 'Invite'}
            </button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type a name or nickname…"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            {searchResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
                {searchResults.map(u => (
                  <div key={u.id} onClick={() => { setSelectedUser(u); setSearch('') }}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{displayName(u)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8, flexShrink: 0 }}>{u.role === 'user' ? 'Lab Manager' : 'Lab User'}</span>
                  </div>
                ))}
              </div>
            )}
            {q.length > 0 && searchResults.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>No matching users found.</div>
            )}
          </div>
        )}

        {orgUsers.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>No other users found in your organization.</div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
          My Team — {members.length} {members.length === 1 ? 'member' : 'members'}
        </div>
        {members.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--text3)' }}>No team members yet. Use the invite form above.</div>
          : members.map(m => (
            <div key={m.memberId} style={rowStyle}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{firstName(m.user?.name)}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{m.user?.role === 'user' ? 'Lab Manager' : 'Lab User'}</div>
              </div>
              <button className="btn btn-sm btn-danger" onClick={() => removeMember(m.memberId, m.user?.name)}>Remove</button>
            </div>
          ))
        }
      </div>

      {joinedTeams.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Teams I joined</div>
          {joinedTeams.map(t => (
            <div key={t.ownerId} style={rowStyle}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{firstName(t.ownerName)}'s team</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>You are a member of this project team</div>
              </div>
              <button className="btn btn-sm btn-danger" onClick={() => leaveTeam(t.ownerId, t.ownerName)}>Leave</button>
            </div>
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Sent invites</div>
          {outgoing.map(inv => (
            <div key={inv.id} style={rowStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{firstName(inv.inviteeName)}</div>
                <span style={statusStyle(inv.status)}>{inv.status}</span>
              </div>
              {inv.status === 'pending' && (
                <button className="btn btn-sm" onClick={() => revokeInvite(inv.id)}>Revoke</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
