import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'
import { PROVIDER_LABELS } from './StorageProviderModal'

export default function TeammatesPanel({ session }) {
  const { toast, setSharedWorkspaces, sharedWorkspaces } = useAppStore()
  const [inviteEmail, setInviteEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [outgoing, setOutgoing] = useState([])
  const [incoming, setIncoming] = useState([])
  const [members, setMembers] = useState([])

  useEffect(() => { load() }, [session?.userId])

  async function load() {
    if (!session?.userId) return

    const { data: out } = await sb
      .from('solo_workspace_invites')
      .select('id, invitee_email, status, created_at')
      .eq('owner_id', session.userId)
      .order('created_at', { ascending: false })
    setOutgoing(out || [])

    if (session?.email) {
      const { data: inc } = await sb
        .from('solo_workspace_invites')
        .select('id, owner_id, status, created_at')
        .eq('invitee_email', session.email.toLowerCase())
        .eq('status', 'pending')
      if (inc?.length) {
        const ownerIds = inc.map(i => i.owner_id)
        const [{ data: owners }, { data: groupSettings }] = await Promise.all([
          sb.from('solo_users').select('id, name').in('id', ownerIds),
          sb.from('settings').select('key, value').in('key', ownerIds.map(id => `solo_group_storage_${id}`)),
        ])
        const ownerMap = Object.fromEntries((owners || []).map(o => [o.id, o.name]))
        const groupMap = Object.fromEntries((groupSettings || []).map(r => [r.key.replace('solo_group_storage_', ''), r.value]))
        setIncoming(inc.map(i => ({
          ...i,
          ownerName: ownerMap[i.owner_id] || 'Unknown',
          groupStorage: groupMap[i.owner_id] || 'website',
        })))
      } else {
        setIncoming([])
      }
    }

    const { data: mems } = await sb
      .from('solo_workspace_members')
      .select('member_id')
      .eq('owner_id', session.userId)
    if (mems?.length) {
      const { data: memberUsers } = await sb.from('solo_users').select('id, name, email').in('id', mems.map(m => m.member_id))
      const memberMap = Object.fromEntries((memberUsers || []).map(u => [u.id, u]))
      setMembers(mems.map(m => ({ memberId: m.member_id, user: memberMap[m.member_id] || null })))
    } else {
      setMembers([])
    }
  }

  async function sendInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    if (email === session?.email?.toLowerCase()) { toast('You cannot invite yourself.'); return }
    if (outgoing.some(i => i.invitee_email === email && i.status !== 'declined')) {
      toast('Already invited this email.'); return
    }
    setSending(true)
    const { error } = await sb.from('solo_workspace_invites').insert({
      owner_id: session.userId,
      invitee_email: email,
      status: 'pending',
    })
    if (error) {
      toast(error.code === '23505' ? 'Already invited this email.' : 'Error sending invite.')
    } else {
      toast('Invite sent!')
      setInviteEmail('')
    }
    setSending(false)
    load()
  }

  async function acceptInvite(invite) {
    const { error } = await sb.from('solo_workspace_members').insert({
      owner_id: invite.owner_id,
      member_id: session.userId,
    })
    if (error && error.code !== '23505') { toast('Error joining workspace.'); return }
    await sb.from('solo_workspace_invites').update({ status: 'accepted' }).eq('id', invite.id)
    toast(`Joined ${invite.ownerName}'s workspace!`)
    const alreadyIn = sharedWorkspaces.some(ws => ws.ownerId === invite.owner_id)
    if (!alreadyIn) {
      setSharedWorkspaces([...sharedWorkspaces, { ownerId: invite.owner_id, ownerName: invite.ownerName }])
    }
    load()
  }

  async function declineInvite(invite) {
    await sb.from('solo_workspace_invites').update({ status: 'declined' }).eq('id', invite.id)
    toast('Invite declined.')
    load()
  }

  async function removeMember(memberId) {
    if (!confirm('Remove this teammate from your workspace?')) return
    await sb.from('solo_workspace_members').delete().eq('owner_id', session.userId).eq('member_id', memberId)
    const memberUser = members.find(m => m.memberId === memberId)?.user
    if (memberUser?.email) {
      await sb.from('solo_workspace_invites').delete().eq('owner_id', session.userId).eq('invitee_email', memberUser.email.toLowerCase())
    }
    toast('Teammate removed.')
    load()
  }

  async function revokeInvite(inviteId) {
    await sb.from('solo_workspace_invites').delete().eq('id', inviteId)
    toast('Invite revoked.')
    load()
  }

  async function leaveWorkspace(ws) {
    if (!confirm(`Leave ${ws.ownerName}'s workspace?`)) return
    await sb.from('solo_workspace_members').delete().eq('owner_id', ws.ownerId).eq('member_id', session.userId)
    setSharedWorkspaces(sharedWorkspaces.filter(w => w.ownerId !== ws.ownerId))
    toast(`Left ${ws.ownerName}'s workspace.`)
    load()
  }

  const statusStyle = (s) => ({
    fontSize: 11, fontWeight: 600, borderRadius: 99, padding: '2px 8px',
    background: s === 'accepted' ? '#E1F5EE' : s === 'declined' ? '#fde8e8' : '#fef3c7',
    color:      s === 'accepted' ? '#0f6e56' : s === 'declined' ? '#b91c1c' : '#92400e',
  })

  return (
    <div>
      {incoming.length > 0 && (
        <div className="card" style={{ marginBottom: 20, border: '1.5px solid #534AB7', background: '#EEEDFE' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: '#534AB7' }}>
            Pending workspace invites for you
          </div>
          {incoming.map(inv => {
            const gs = inv.groupStorage || 'website'
            const providerLabel = gs === 'website' ? 'ICT-Lab Cloud' : (PROVIDER_LABELS[gs]?.label || gs)
            const storageNote = gs === 'website'
              ? `Files shared in this workspace will be stored on ICT-Lab's secure servers, as selected by ${inv.ownerName}.`
              : `Files shared in this workspace will be stored in ${providerLabel} (${inv.ownerName}'s connected drive). You may need to connect your account to that drive to collaborate on files.`
            return (
              <div key={inv.id} style={{ padding: '10px 0', borderBottom: '1px solid #CECBF6' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{inv.ownerName}</div>
                    <div style={{ fontSize: 12, color: '#3730a3', marginTop: 2, lineHeight: 1.6 }}>
                      wants to add you as a teammate. You'll be able to view their <strong>Projects, Materials, and test results</strong>. Their personal profile info is not shared.
                    </div>
                    <div style={{ marginTop: 8, background: gs === 'website' ? '#f0fdf4' : '#fff7ed', border: `1px solid ${gs === 'website' ? '#bbf7d0' : '#fed7aa'}`, borderRadius: 6, padding: '8px 10px', fontSize: 11, color: gs === 'website' ? '#166534' : '#92400e', lineHeight: 1.5 }}>
                      🗄️ <strong>Storage:</strong> {storageNote}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn btn-sm btn-primary" style={{ background: '#534AB7', borderColor: '#534AB7' }} onClick={() => acceptInvite(inv)}>Accept</button>
                    <button className="btn btn-sm" onClick={() => declineInvite(inv)}>Decline</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Invite a teammate</div>

        {/* Requirements info box */}
        <div style={{ background: '#EEEDFE', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: '#3730a3', fontWeight: 600, marginBottom: 6 }}>Before you invite</div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, color: '#4338ca', lineHeight: 1.8 }}>
            <li>The person must already have a <strong>ICT-Lab Solo account</strong>. They cannot accept the invite without one.</li>
            <li>They will receive an <strong>in-app notification</strong> and (if they have an email set) an <strong>email notification</strong> about your invite.</li>
            <li>Once accepted, they can view and collaborate on your <strong>Projects, Materials, and test results</strong>. Your personal profile info (name, email, password) is never shared.</li>
          </ul>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="teammate@email.com"
            onKeyDown={e => e.key === 'Enter' && sendInvite()}
            style={{ flex: 1 }}
          />
          <button
            onClick={sendInvite}
            disabled={sending || !inviteEmail.trim()}
            style={{ padding: '0 20px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: sending || !inviteEmail.trim() ? 'not-allowed' : 'pointer', opacity: sending || !inviteEmail.trim() ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {sending ? 'Sending…' : 'Invite'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
          My Teammates — {members.length} {members.length === 1 ? 'person' : 'people'} can see your workspace
        </div>
        {members.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--text3)' }}>No teammates yet. Use the invite form above.</div>
          : members.map(m => (
            <div key={m.memberId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--surface2)', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{m.user?.name || 'Unknown'}</div>
                {m.user?.email && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{m.user.email}</div>}
              </div>
              <button className="btn btn-sm btn-danger" onClick={() => removeMember(m.memberId)}>Remove</button>
            </div>
          ))
        }
      </div>

      {sharedWorkspaces.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Workspaces I joined</div>
          {sharedWorkspaces.map(ws => (
            <div key={ws.ownerId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--surface2)', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{ws.ownerName}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Switch to their workspace from the Projects screen</div>
              </div>
              <button className="btn btn-sm btn-danger" onClick={() => leaveWorkspace(ws)}>Leave</button>
            </div>
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Sent invites</div>
          {outgoing.map(inv => (
            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--surface2)', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{inv.invitee_email}</div>
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
