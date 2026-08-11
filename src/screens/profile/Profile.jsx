import HelpPanel from '../../components/HelpPanel'
import ScrollTabs from '../../components/ScrollTabs'
import { PasswordStrengthHint } from '../../components/PasswordStrengthHint'
import { passwordError } from '../../lib/passwordPolicy'
import { queueWelcomeEmail } from '../../lib/welcomeEmail'
import { useAppStore } from '../../store/useAppStore'
import { sb } from '../../lib/supabase'
import { useState, useEffect, useRef } from 'react'
import { IconEye, IconEyeOff } from '../../components/Icons'
import DashboardIconPicker, { ALL_MODULES_META, PINNED_MODULES, STAFF_PINNED_MODULES } from '../../components/DashboardIconPicker'
import StudentIconManager from '../../components/StudentIconManager'
import TeammatesPanel from '../../components/TeammatesPanel'
import TeamMembersPanel from '../../components/TeamMembersPanel'

function PasswordInput({ value, onChange, placeholder, autoComplete, show, onToggle, id }) {
  return (
    <>
      <input
        key={show ? 'txt' : 'pwd'}
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button type="button" onClick={onToggle}
        style={{ marginTop: 4, fontSize: 12, color: 'var(--accent)', border: 'none', background: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'var(--sans)', display: 'block' }}>
        {show ? 'Hide password' : 'Show password'}
      </button>
    </>
  )
}

async function notifyOrgManagers(organizationId, message, type = 'info', excludeUserId = null) {
  let q = sb.from('users').select('id').eq('organization_id', organizationId).in('role', ['user', 'admin']).eq('is_active', true)
  if (excludeUserId) q = q.neq('id', excludeUserId)
  const { data: managers } = await q
  if (!managers?.length) return
  await sb.from('notifications').insert(managers.map(m => ({ user_id: m.id, title: message, type, read: false })))
}

const PROJECT_GROUPS = ['Material', 'Sustainability', 'GPR', 'Mechanic', 'Other']
const ICT_ORG_ID = '5bab5b33-fff9-4a4a-b617-3dac179f9678'
const DEGREES = ['MS', 'PhD', 'BS', 'Other']
const SEMESTERS = ['Fall', 'Spring', 'Summer']
const YEARS = Array.from({ length: 15 }, (_, i) => String(new Date().getFullYear() - i))

const groupColor = { Material: '#92400e', Sustainability: '#085041', GPR: '#0369a1', Mechanic: '#534AB7', Other: '#6b6860' }
const groupBg   = { Material: '#fef3c7', Sustainability: '#E1F5EE', GPR: '#e0f2fe', Mechanic: '#EEEDFE', Other: '#f0efe9' }

const sFirstName  = s => s?.name      || ''
const sLastName   = s => s?.last_name || ''
const sEmail      = s => s?.email     || ''
const sSupervisor = s => s?.supervisor || s?.degree || ''

async function createAuthUser(email, password) {
  const emailLC = email.trim().toLowerCase()
  const { data: { session: prev } } = await sb.auth.getSession()
  const { data, error } = await sb.auth.signUp({ email: emailLC, password })
  if (prev) await sb.auth.setSession({ access_token: prev.access_token, refresh_token: prev.refresh_token })
  if (error) {
    if (error.message?.toLowerCase().includes('already registered') || error.message?.toLowerCase().includes('already been registered')) {
      // Orphaned auth user — delete it then retry signUp so the new password is correct
      const { data: orphanId } = await sb.rpc('get_auth_user_id_by_email', { p_email: emailLC })
      if (orphanId) try { await sb.rpc('delete_auth_user', { p_auth_id: orphanId }) } catch (_) {}
      const { data: retryData, error: retryError } = await sb.auth.signUp({ email: emailLC, password })
      if (prev) await sb.auth.setSession({ access_token: prev.access_token, refresh_token: prev.refresh_token })
      if (retryError) throw retryError
      await sb.rpc('confirm_auth_user_email', { p_email: emailLC })
      return retryData.user
    }
    throw error
  }
  await sb.rpc('confirm_auth_user_email', { p_email: emailLC })
  return data.user
}

// ══════════════════════════════════════════════════════════════
// [TeammatesPanel imported from components/TeammatesPanel.jsx]
// ══════════════════════════════════════════════════════════════

const SOLO_PROFILE_TABS    = ['info','teammates','dashboard','notifications','password','danger']
const STAFF_PROFILE_TABS   = ['info','password','dashboard','notifs','team','danger']
const STUDENT_PROFILE_TABS = ['info','password','dashboard','notifs','team','danger']
const ADMIN_PROFILE_TABS   = ['admin','icons','dashboard','notifs','org']

// ══════════════════════════════════════════════════════════════
// SOLO PROFILE — reads from solo_users table
// ══════════════════════════════════════════════════════════════
function SoloProfile({ session }) {
  const { toast, setSession, clearSession, sidebarSubTab, setSidebarSubTab } = useAppStore()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({})
  const [pinForm, setPinForm] = useState({ current: '', newPin: '', confirm: '' })
  const [pinError, setPinError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPinCur, setShowPinCur] = useState(false)
  const [showPinNew, setShowPinNew] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const activeTab = SOLO_PROFILE_TABS.includes(sidebarSubTab) ? sidebarSubTab : 'info'

  useEffect(() => { load() }, [])
  useEffect(() => { if (!SOLO_PROFILE_TABS.includes(sidebarSubTab)) setSidebarSubTab('info') }, [])

  async function load() {
    setLoading(true)
    if (!session?.userId) { setLoading(false); return }
    const { data } = await sb.from('solo_users').select('*').eq('id', session.userId).maybeSingle()
    setUser(data)
    if (data) setForm({
      name: data.name || '',
      last_name: data.last_name || '',
      nick_name: data.nick_name || '',
      email: data.email || '',
      phone: data.phone || '',
      photo_url: data.photo_url || '',
    })
    setLoading(false)
  }

  async function saveInfo() {
    setSaving(true)
    const { error } = await sb.from('solo_users').update({
      name: form.name.trim(),
      last_name: form.last_name?.trim() || null,
      nick_name: form.nick_name?.trim() || null,
      email: form.email || null,
      phone: form.phone || null,
      photo_url: form.photo_url || null,
    }).eq('id', user.id)
    if (error) { toast('Error saving: ' + error.message); setSaving(false); return }
    setSession({ ...session, username: form.nick_name?.trim() || form.name.trim(), photoUrl: form.photo_url || null })
    toast('Profile saved ✓'); setSaving(false); load()
  }

  async function savePassword() {
    setPinError('')
    if (!pinForm.current) { setPinError('Enter your current password.'); return }
    { const perr = passwordError(pinForm.newPin); if (perr) { setPinError(perr); return } }
    if (pinForm.newPin !== pinForm.confirm) { setPinError('Passwords do not match.'); return }
    const { error: reAuthErr } = await sb.auth.signInWithPassword({ email: session.email, password: pinForm.current })
    if (reAuthErr) { setPinError('Current password is incorrect.'); return }
    const { error: updateErr } = await sb.auth.updateUser({ password: pinForm.newPin })
    if (updateErr) { setPinError('Failed to update. Try again.'); return }
    toast('Password updated ✓'); setPinForm({ current: '', newPin: '', confirm: '' })
  }

  async function uploadPhoto(file) {
    if (!file?.type.startsWith('image/')) { toast('Please select an image.'); return }
    setUploading(true)
    try {
      const compressed = await new Promise(resolve => {
        const img = new Image(), url = URL.createObjectURL(file)
        img.onload = () => {
          const s = Math.min(1, 400 / Math.max(img.width, img.height))
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(img.width * s); canvas.height = Math.round(img.height * s)
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
          URL.revokeObjectURL(url); canvas.toBlob(resolve, 'image/jpeg', 0.85)
        }
        img.src = url
      })
      const path = `avatars/solo_${user.id}_${Date.now()}.jpg`
      const { error: uploadErr } = await sb.storage.from('project-files').upload(path, compressed, { contentType: 'image/jpeg' })
      if (uploadErr) throw uploadErr
      const photoUrl = sb.storage.from('project-files').getPublicUrl(path).data.publicUrl
      await sb.from('solo_users').update({ photo_url: photoUrl }).eq('id', user.id)
      setForm(f => ({ ...f, photo_url: photoUrl }))
      setSession({ ...session, photoUrl })
      toast('Photo saved ✓')
    } catch (err) { toast('Upload failed: ' + (err?.message || String(err))) }
    setUploading(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (!user) return <div className="empty-state"><div className="empty-icon">👤</div>Profile not found.</div>

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="section-title">My Profile</div>
        <HelpPanel screen="profile" />
      </div>

      <WorkspaceTransferBanner session={session} />

      {/* Avatar card */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--surface2)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {form.photo_url ? <img src={form.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 32, color: 'var(--text3)' }}>👤</span>}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>{form.nick_name?.trim() || form.name || user.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>{form.email || user.email}</div>
          <span style={{ display: 'inline-block', marginTop: 6, background: '#EEEDFE', color: '#534AB7', borderRadius: 99, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>Solo</span>
        </div>
      </div>

      {/* Tabs */}
      <ScrollTabs style={{ borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {[
          { key: 'info',          label: '👤 My Info' },
          { key: 'teammates',     label: '👥 Teammates' },
          { key: 'dashboard',     label: '🎛️ Dashboard Icons' },
          { key: 'notifications', label: '🔔 Notifications' },
          { key: 'password',      label: '🔑 Password' },
          { key: 'danger',        label: '⚠️ Delete Account' },
        ].map(t => (
          <button key={t.key} onClick={() => setSidebarSubTab(t.key)}
            style={{ padding: '10px 20px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: activeTab === t.key ? '#534AB7' : 'var(--text2)', borderBottom: `2px solid ${activeTab === t.key ? '#534AB7' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </ScrollTabs>

      {activeTab === 'info' && (
        <div className="card">
          <div className="grid-2">
            <div className="field"><label>First Name *</label><input autoComplete="given-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="field"><label>Last Name *</label><input autoComplete="family-name" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} /></div>
          </div>
          <div className="field">
            <label>Nick Name <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 12 }}>(optional — shown instead of first name)</span></label>
            <input autoComplete="nickname" value={form.nick_name} onChange={e => setForm(f => ({ ...f, nick_name: e.target.value }))} placeholder="e.g. Alex" />
          </div>
          <div className="field"><label>Email</label><input type="email" autoComplete="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div className="field"><label>Phone</label><input autoComplete="tel" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Profile Photo</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 'var(--radius-lg)' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {form.photo_url ? <img src={form.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 28, color: 'var(--text3)' }}>👤</span>}
              </div>
              <div style={{ flex: 1, fontSize: 13, color: 'var(--text3)' }}>Saves automatically after upload.</div>
              {form.photo_url && (
                <button className="btn btn-sm" onClick={async () => {
                  await sb.from('solo_users').update({ photo_url: null }).eq('id', user.id)
                  setForm(f => ({ ...f, photo_url: '' }))
                  setSession({ ...session, photoUrl: null })
                  toast('Photo removed.')
                }}>Remove</button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadPhoto(e.target.files[0])} />
            <button className="btn btn-sm btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? '⏳ Uploading…' : '⬆️ Choose photo'}</button>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
            <button className="btn btn-primary" onClick={saveInfo} disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      )}

      {activeTab === 'teammates' && <TeammatesPanel session={session} />}

      {activeTab === 'dashboard' && <DashboardIconsPanel session={session} />}

      {activeTab === 'notifications' && <NotificationPrefsPanel userId={session?.userId} role="solo" />}

      {activeTab === 'password' && (
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Change password</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Min. 8 characters with uppercase, lowercase &amp; symbol.</div>
          <form onSubmit={e => { e.preventDefault(); savePassword() }} autoComplete="on">
            <div className="field">
              <label>Current password</label>
              <PasswordInput show={showPinCur} onToggle={() => setShowPinCur(s => !s)} value={pinForm.current} onChange={e => { setPinForm(f => ({ ...f, current: e.target.value })); setPinError('') }} placeholder="••••••••" autoComplete="current-password" />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>New password</label>
                <PasswordInput show={showPinNew} onToggle={() => setShowPinNew(s => !s)} value={pinForm.newPin} onChange={e => { setPinForm(f => ({ ...f, newPin: e.target.value })); setPinError('') }} autoComplete="new-password" />
              </div>
              <div className="field"><label>Confirm</label><input type="password" autoComplete="new-password" value={pinForm.confirm} onChange={e => { setPinForm(f => ({ ...f, confirm: e.target.value })); setPinError('') }} /></div>
            </div>
            <PasswordStrengthHint password={pinForm.newPin} />
            {pinError && <div style={{ fontSize: 13, color: 'var(--accent2)', marginBottom: 12 }}>⚠️ {pinError}</div>}
            <button type="submit" className="btn btn-primary" disabled={!pinForm.current || !pinForm.newPin || !pinForm.confirm}>Update password</button>
          </form>
        </div>
      )}

      {activeTab === 'danger' && (
        <SoloDeleteAccountPanel session={session} clearSession={clearSession} toast={toast} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// WORKSPACE TRANSFER BANNER — shown when a pending transfer request exists
// ══════════════════════════════════════════════════════════════
function WorkspaceTransferBanner({ session }) {
  const { toast, sharedWorkspaces, setSharedWorkspaces } = useAppStore()
  const [requests, setRequests] = useState([])
  const [processing, setProcessing] = useState(null)

  useEffect(() => { loadRequests() }, [])

  async function loadRequests() {
    const { data } = await sb
      .from('solo_workspace_transfer_requests')
      .select('*')
      .eq('member_id', session.userId)
      .eq('status', 'pending')
    setRequests(data || [])
  }

  async function deleteOwnerData(ownerId) {
    const { data: projs } = await sb.from('projects').select('id').eq('solo_owner_id', ownerId)
    if (projs?.length) {
      const ids = projs.map(p => p.id)
      await sb.from('project_results').delete().in('project_id', ids)
      await sb.from('project_links').delete().in('project_id', ids)
      await sb.from('projects').delete().in('id', ids)
    }
    await sb.from('solo_workspace_members').delete().eq('owner_id', ownerId)
    await sb.from('solo_workspace_invites').delete().eq('owner_id', ownerId)
    await sb.from('solo_workspace_transfer_requests').delete().eq('owner_id', ownerId)
    await sb.from('solo_users').delete().eq('id', ownerId)
  }

  async function handleAccept(req) {
    setProcessing(req.owner_id)
    try {
      const newOwner = session.userId
      const oldOwner = req.owner_id
      await sb.from('projects').update({ solo_owner_id: newOwner }).eq('solo_owner_id', oldOwner)
      const { data: oldMembers } = await sb.from('solo_workspace_members').select('member_id').eq('owner_id', oldOwner)
      const toInsert = (oldMembers || []).filter(m => m.member_id !== newOwner).map(m => ({ owner_id: newOwner, member_id: m.member_id }))
      if (toInsert.length) await sb.from('solo_workspace_members').insert(toInsert)
      await sb.from('solo_workspace_members').delete().eq('owner_id', oldOwner)
      await sb.from('solo_workspace_invites').delete().eq('owner_id', oldOwner)
      await sb.from('solo_workspace_transfer_requests').delete().eq('owner_id', oldOwner)
      await sb.from('solo_users').delete().eq('id', oldOwner)
      setSharedWorkspaces((sharedWorkspaces || []).filter(ws => ws.ownerId !== oldOwner))
      toast('Workspace transferred. You are now the workspace owner.')
      setRequests(r => r.filter(x => x.owner_id !== oldOwner))
    } catch (err) {
      toast('Transfer failed: ' + (err.message || String(err)))
    }
    setProcessing(null)
  }

  async function handleDecline(req) {
    setProcessing(req.owner_id)
    try {
      await sb.from('solo_workspace_transfer_requests').update({ status: 'declined' }).eq('id', req.id)
      const { data: remaining } = await sb.from('solo_workspace_transfer_requests')
        .select('id').eq('owner_id', req.owner_id).eq('status', 'pending')
      if (!remaining?.length) await deleteOwnerData(req.owner_id)
      setSharedWorkspaces((sharedWorkspaces || []).filter(ws => ws.ownerId !== req.owner_id))
      toast('Transfer declined.')
      setRequests(r => r.filter(x => x.id !== req.id))
    } catch (err) {
      toast('Error: ' + (err.message || String(err)))
    }
    setProcessing(null)
  }

  if (!requests.length) return null

  return (
    <div style={{ marginBottom: 20 }}>
      {requests.map(req => (
        <div key={req.id} className="card" style={{ border: '1.5px solid #f59e0b', background: '#fffbeb' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#92400e', marginBottom: 8 }}>Workspace Transfer Request</div>
          <p style={{ fontSize: 14, color: '#78350f', marginBottom: 8, lineHeight: 1.6 }}>
            <strong>{req.owner_name}</strong> is deleting their account and has offered you ownership of their workspace.
            If you accept, all shared projects and data will transfer to you. If you decline and all teammates decline, the data will be permanently deleted.
          </p>
          <p style={{ fontSize: 12, color: '#92400e', marginBottom: 14 }}>
            Expires: {new Date(req.expires_at).toLocaleDateString()}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => handleAccept(req)} disabled={!!processing}
              style={{ background: '#16a34a', borderColor: '#16a34a' }}>
              {processing === req.owner_id ? 'Processing…' : 'Accept & Take Ownership'}
            </button>
            <button className="btn" onClick={() => handleDecline(req)} disabled={!!processing}>Decline</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function SoloDeleteAccountPanel({ session, clearSession, toast }) {
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [step, setStep] = useState('confirm') // 'confirm' | 'notify'
  const [teammates, setTeammates] = useState([])
  const [loadingTeammates, setLoadingTeammates] = useState(true)

  useEffect(() => { loadTeammates() }, [])

  async function loadTeammates() {
    const { data: members } = await sb.from('solo_workspace_members').select('member_id').eq('owner_id', session.userId)
    if (!members?.length) { setLoadingTeammates(false); return }
    const { data: users } = await sb.from('solo_users').select('id, name, email').in('id', members.map(m => m.member_id))
    setTeammates(users || [])
    setLoadingTeammates(false)
  }

  async function handleDelete() {
    if (typed !== 'DELETE') return
    if (teammates.length > 0) { setStep('notify'); return }
    await doImmediateDelete()
  }

  async function notifyAndPendDelete() {
    setDeleting(true)
    try {
      const uid = session.userId
      await sb.from('solo_workspace_transfer_requests').insert(
        teammates.map(m => ({ owner_id: uid, owner_name: session.username || 'A user', member_id: m.id }))
      )
      await sb.from('solo_users').update({ deletion_requested_at: new Date().toISOString() }).eq('id', uid)
      await sb.auth.signOut()
      clearSession()
    } catch (err) {
      toast('Error: ' + (err.message || String(err)))
      setDeleting(false)
    }
  }

  async function doImmediateDelete() {
    setDeleting(true)
    try {
      const uid = session.userId
      const email = session.email?.toLowerCase()
      await sb.from('solo_workspace_members').delete().eq('member_id', uid)
      await sb.from('solo_workspace_members').delete().eq('owner_id', uid)
      if (email) await sb.from('solo_workspace_invites').delete().eq('invitee_email', email)
      await sb.from('solo_workspace_invites').delete().eq('owner_id', uid)
      const { data: projs } = await sb.from('projects').select('id').eq('solo_owner_id', uid)
      if (projs?.length) {
        const ids = projs.map(p => p.id)
        await sb.from('project_results').delete().in('project_id', ids)
        await sb.from('project_links').delete().in('project_id', ids)
        await sb.from('projects').delete().in('id', ids)
      }
      await sb.from('solo_users').delete().eq('id', uid)
      await sb.auth.signOut()
      clearSession()
    } catch (err) {
      toast('Error deleting account: ' + (err.message || String(err)))
      setDeleting(false)
    }
  }

  if (loadingTeammates) return <div className="card" style={{ border: '1.5px solid #fca5a5' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  if (step === 'notify') {
    return (
      <div className="card" style={{ border: '1.5px solid #fca5a5' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#b91c1c', marginBottom: 8 }}>Notify Teammates</div>
        <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.6 }}>
          You have <strong>{teammates.length} teammate{teammates.length !== 1 ? 's' : ''}</strong> sharing your workspace.
          They will be notified and given <strong>7 days</strong> to take over your workspace data.
          If no one accepts, all data will be permanently deleted.
        </p>
        <div style={{ marginBottom: 16 }}>
          {teammates.map(t => (
            <div key={t.id} style={{ padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 6, fontSize: 14 }}>
              <strong>{t.name}</strong>{t.email ? ` — ${t.email}` : ''}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-danger" onClick={notifyAndPendDelete} disabled={deleting}>
            {deleting ? 'Processing…' : 'Notify teammates & delete my account'}
          </button>
          <button className="btn" onClick={() => setStep('confirm')} disabled={deleting}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ border: '1.5px solid #fca5a5' }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#b91c1c', marginBottom: 8 }}>Delete Account</div>
      <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
        This permanently deletes your account and all associated data — projects, records, teammates, and files. <strong>This cannot be undone.</strong>
      </p>
      <div className="field">
        <label style={{ color: '#b91c1c', fontWeight: 600 }}>Type DELETE to confirm</label>
        <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="DELETE" />
      </div>
      <button className="btn btn-danger" onClick={handleDelete} disabled={typed !== 'DELETE' || deleting} style={{ marginTop: 8 }}>
        {deleting ? 'Deleting…' : 'Delete my account permanently'}
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD ICONS MANAGER — works for all roles
// ══════════════════════════════════════════════════════════════
function DashboardIconsPanel({ session }) {
  const { toast, setActiveModules } = useAppStore()
  const isSolo = session?.loginMode === 'solo'
  const loginMode = session?.loginMode || 'team'

  const roleKey = loginMode === 'solo' ? 'solo' : 'team'
  const isStaff = session?.role === 'admin' || session?.role === 'user'
  const pinnedKeys = isStaff ? [...PINNED_MODULES, ...STAFF_PINNED_MODULES] : PINNED_MODULES
  const uiPinnedKeys = PINNED_MODULES // grayed-out + non-draggable (profile only)
  const available = ALL_MODULES_META.filter(m => m.roles.includes(roleKey) && (!m.hideForStaff || !isStaff) && (!m.staffOnly || isStaff))

  const [selected, setSelected] = useState(null)
  const [displayOrder, setDisplayOrder] = useState(null)
  const [dragKey, setDragKey] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)
  const dragKeyRef = useRef(null)
  const [allowedPool, setAllowedPool] = useState(null)
  const [adminPool, setAdminPool] = useState(null) // pool set by super admin (solo or org+app)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [session?.userId])

  function initOrder(savedModules, allKeys) {
    if (savedModules?.length) {
      return [...savedModules.filter(k => allKeys.includes(k)), ...allKeys.filter(k => !savedModules.includes(k))]
    }
    return allKeys
  }

  async function load() {
    const allKeys = available.map(m => m.key)
    try {
      if (!session?.userId) {
        const saved = localStorage.getItem('ictlab_admin_modules')
        const savedArr = saved ? JSON.parse(saved) : null
        setSelected(new Set(savedArr?.length ? savedArr : allKeys))
        setDisplayOrder(initOrder(savedArr, allKeys))
        return
      }
      if (isSolo) {
        const [soloRes, settingsRes] = await Promise.all([
          sb.from('solo_users').select('active_modules').eq('id', session.userId).maybeSingle(),
          sb.from('settings').select('value').eq('key', 'solo_allowed_modules').maybeSingle(),
        ])
        let pool = null
        try { pool = settingsRes?.data?.value ? JSON.parse(settingsRes.data.value) : null } catch {}
        setAdminPool(pool)
        const displayKeys = pool !== null ? allKeys.filter(k => pool.includes(k) || k === 'profile') : allKeys
        const savedArr = soloRes.data?.active_modules?.length
          ? soloRes.data.active_modules.filter(k => displayKeys.includes(k))
          : null
        setSelected(new Set([...pinnedKeys, ...(savedArr || displayKeys)]))
        setDisplayOrder(initOrder(savedArr, displayKeys))
      } else {
        const [prefsRes, orgResRaw, appRes] = await Promise.all([
          sb.from('user_dashboard_prefs').select('active_modules, allowed_modules').eq('user_id', session.userId).order('created_at', { ascending: false }).limit(1),
          session?.organizationId
            ? sb.from('organizations').select('allowed_modules, allowed_modules_labusers, allowed_modules_labmanagers').eq('id', session.organizationId).maybeSingle()
            : Promise.resolve(null),
          sb.from('settings').select('value').eq('key', 'app_allowed_modules').maybeSingle(),
        ])
        let orgRes = orgResRaw
        if (orgResRaw?.error && session?.organizationId) {
          orgRes = await sb.from('organizations').select('allowed_modules').eq('id', session.organizationId).maybeSingle()
        }
        const data = prefsRes.data?.[0] ?? null
        let appPool = null
        try { appPool = appRes?.data?.value ? JSON.parse(appRes.data.value) : null } catch {}
        // Role-specific org pool: lab users use labusers pool, staff use labmanagers pool, org admin uses outer pool
        const outerOrgPool = session?.role === 'lab_user'
          ? (orgRes?.data?.allowed_modules_labusers ?? orgRes?.data?.allowed_modules)
          : session?.role === 'user'
            ? (orgRes?.data?.allowed_modules_labmanagers ?? orgRes?.data?.allowed_modules)
            : orgRes?.data?.allowed_modules
        const orgPool = outerOrgPool || null
        const effectivePool = orgPool ?? appPool
        setAdminPool(effectivePool)
        if (session?.role === 'lab_user') {
          const pool = data?.allowed_modules || []
          setAllowedPool(pool)
          const poolKeys = effectivePool !== null ? pool.filter(k => effectivePool.includes(k)) : pool
          const savedArr = data?.active_modules?.length
            ? data.active_modules.filter(k => poolKeys.includes(k) || pinnedKeys.includes(k))
            : poolKeys
          // Always include pinnedKeys so they are never filtered out on save
          setSelected(new Set([...pinnedKeys, ...savedArr]))
          setDisplayOrder(initOrder(savedArr, poolKeys))
        } else {
          const displayKeys = effectivePool !== null ? allKeys.filter(k => effectivePool.includes(k) || pinnedKeys.includes(k)) : allKeys
          const savedArr = data?.active_modules?.length
            ? data.active_modules.filter(k => displayKeys.includes(k))
            : null
          // Always include pinnedKeys so they are never filtered out on save
          setSelected(new Set([...pinnedKeys, ...(savedArr || displayKeys)]))
          setDisplayOrder(initOrder(savedArr, displayKeys))
        }
      }
    } catch (e) {
      setSelected(new Set(allKeys))
      setDisplayOrder(allKeys)
    }
  }

  function toggle(key) {
    if (pinnedKeys.includes(key)) return
    if (isSolo && ALL_MODULES_META.find(m => m.key === key)?.soloLocked) return
    setSelected(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  async function save() {
    if (!selected) return
    setSaving(true)
    const order = displayOrder || Array.from(selected)
    const soloLockedKeys = new Set(ALL_MODULES_META.filter(m => m.soloLocked).map(m => m.key))
    const modules = order.filter(k => selected.has(k) && !(isSolo && soloLockedKeys.has(k)))
    try {
      if (!session?.userId) {
        localStorage.setItem('ictlab_admin_modules', JSON.stringify(modules))
        localStorage.setItem('ictlab_admin_dashboard_set', 'true')
      } else if (isSolo) {
        await sb.from('solo_users').update({ active_modules: modules, has_set_dashboard: true }).eq('id', session.userId)
      } else {
        const { data: updated } = await sb.from('user_dashboard_prefs')
          .update({ active_modules: modules, has_set_dashboard: true })
          .eq('user_id', session.userId)
          .select('id')
        if (!updated?.length) {
          await sb.from('user_dashboard_prefs')
            .insert({ user_id: session.userId, active_modules: modules, has_set_dashboard: true })
        }
      }
      toast('Dashboard icons saved ✓')
    } catch (e) { toast('Error saving preferences.') }
    setActiveModules(modules)
    setSaving(false)
  }

  if (selected === null) return (
    <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  )

  if (session?.role === 'lab_user' && allowedPool !== null && allowedPool.length === 0) return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>No icons assigned yet</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>Your lab manager hasn't assigned dashboard icons for you yet.</div>
    </div>
  )

  const baseDisplay = (() => {
    if (session?.role === 'lab_user' && allowedPool?.length) {
      const studentPool = adminPool !== null
        ? allowedPool.filter(k => adminPool.includes(k))
        : allowedPool
      return available.filter(m => studentPool.includes(m.key) || pinnedKeys.includes(m.key))
    }
    if (adminPool !== null) return available.filter(m => adminPool.includes(m.key) || pinnedKeys.includes(m.key))
    return available
  })()

  const displayModules = displayOrder !== null
    ? displayOrder.map(k => baseDisplay.find(m => m.key === k)).filter(Boolean)
    : baseDisplay

  const selectedCount = selected.size

  function handleDragStart(e, key) {
    if (uiPinnedKeys.includes(key)) return
    dragKeyRef.current = key
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', key)
    setDragKey(key)
  }
  function handleDragOver(e, key) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverKey(key) }
  function handleDrop(e, targetKey) {
    e.preventDefault()
    const sourceKey = dragKeyRef.current
    if (!sourceKey || sourceKey === targetKey) { setDragKey(null); setDragOverKey(null); return }
    setDisplayOrder(order => {
      const from = order.indexOf(sourceKey)
      const to = order.indexOf(targetKey)
      if (from === -1 || to === -1) return order
      const next = [...order]
      next.splice(from, 1)
      next.splice(to, 0, sourceKey)
      return next
    })
    dragKeyRef.current = null
    setDragKey(null)
    setDragOverKey(null)
  }
  function handleDragEnd() { dragKeyRef.current = null; setDragKey(null); setDragOverKey(null) }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🎛️ Dashboard Icons</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          Choose which shortcuts appear on your dashboard.
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}><span style={{ fontWeight: 600, color: 'var(--text)' }}>{selectedCount}</span> of {displayModules.length} selected</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => setSelected(new Set(displayModules.map(m => m.key)))} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600 }}>Select all</button>
          <button onClick={() => setSelected(new Set(pinnedKeys))} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontWeight: 500 }}>Clear</button>
        </div>
      </div>
      <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 99, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(selectedCount / displayModules.length) * 100}%`, background: loginMode === 'solo' ? '#534AB7' : 'var(--accent)', borderRadius: 99, transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        💡 Drag cards to reorder icons on your home screen
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 10, marginBottom: 24 }}>
        {displayModules.map(m => {
          const uiPinned = uiPinnedKeys.includes(m.key)
          const alwaysOn = !uiPinned && pinnedKeys.includes(m.key) // draggable but cannot be removed
          const locked = isSolo && !!m.soloLocked
          const sel = selected.has(m.key)
          const isDragging = dragKey === m.key
          const isOver = dragOverKey === m.key && dragKey !== m.key

          if (locked) return (
            <div key={m.key} style={{ borderRadius: 12, border: '2px solid var(--border)', background: 'var(--surface2)', padding: '14px 14px 12px', cursor: 'default', position: 'relative', opacity: 0.5, userSelect: 'none', filter: 'grayscale(0.6)' }}>
              <div style={{ position: 'absolute', top: 9, right: 9, width: 20, height: 20, borderRadius: '50%', background: 'var(--surface2)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, pointerEvents: 'none' }}>🔒</div>
              <div style={{ fontSize: 26, marginBottom: 8, pointerEvents: 'none' }}>{m.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2, paddingRight: 20, pointerEvents: 'none' }}>{m.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4, pointerEvents: 'none' }}>{m.sub}</div>
              <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text3)', fontWeight: 600, pointerEvents: 'none' }}>Team accounts only</div>
            </div>
          )

          return (
            <div key={m.key}
              draggable={!uiPinned}
              onDragStart={e => handleDragStart(e, m.key)}
              onDragOver={e => handleDragOver(e, m.key)}
              onDrop={e => handleDrop(e, m.key)}
              onDragEnd={handleDragEnd}
              onClick={() => !uiPinned && toggle(m.key)}
              style={{ borderRadius: 12, border: isOver ? `2px dashed ${loginMode === 'solo' ? '#534AB7' : 'var(--accent)'}` : sel ? `2px solid ${m.color}` : '2px solid var(--border)', background: sel ? `${m.color}12` : 'var(--surface)', padding: '14px 14px 12px', cursor: uiPinned ? 'default' : 'grab', position: 'relative', transition: 'opacity 0.15s', opacity: isDragging ? 0.35 : uiPinned ? 0.7 : 1, userSelect: 'none' }}>
              <div style={{ position: 'absolute', top: 9, right: 9, width: 20, height: 20, borderRadius: '50%', background: sel ? m.color : 'var(--surface2)', border: `2px solid ${sel ? m.color : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                {sel && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
              <div style={{ fontSize: 26, marginBottom: 8, pointerEvents: 'none' }}>{m.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: sel ? m.color : 'var(--text)', marginBottom: 2, paddingRight: 20, pointerEvents: 'none' }}>{m.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4, pointerEvents: 'none' }}>{m.sub}</div>
              {(uiPinned || alwaysOn) && <div style={{ marginTop: 6, fontSize: 10, color: m.color, fontWeight: 600, pointerEvents: 'none' }}>Always visible</div>}
            </div>
          )
        })}
        {/* studentLocked modules: visible on dashboard as gray cards, also shown here so students see the full picture */}
        {session?.role === 'lab_user' && ALL_MODULES_META
          .filter(m => m.studentLocked && m.roles.includes('team') && !allowedPool?.includes(m.key))
          .map(m => (
            <div key={m.key} style={{ borderRadius: 12, border: '2px solid var(--border)', background: 'var(--surface2)', padding: '14px 14px 12px', cursor: 'default', position: 'relative', opacity: 0.45, userSelect: 'none', filter: 'grayscale(0.7)' }}>
              <div style={{ position: 'absolute', top: 9, right: 9, width: 20, height: 20, borderRadius: '50%', background: 'var(--surface2)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, pointerEvents: 'none' }}>🔒</div>
              <div style={{ fontSize: 26, marginBottom: 8, pointerEvents: 'none' }}>{m.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2, paddingRight: 20, pointerEvents: 'none' }}>{m.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4, pointerEvents: 'none' }}>{m.sub}</div>
              <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text3)', fontWeight: 600, pointerEvents: 'none' }}>Staff access only</div>
            </div>
          ))
        }
      </div>
      <button className="btn btn-primary" onClick={save} disabled={saving || !selected}>{saving ? 'Saving…' : 'Save dashboard icons'}</button>
      {isSolo && <CustomLinksManager session={session} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// CUSTOM EXTERNAL LINKS MANAGER — solo users only, max 2 links
// ══════════════════════════════════════════════════════════════
function CustomLinksManager({ session }) {
  const { toast } = useAppStore()
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | { idx: number | -1, label, url, image_url, enabled }
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await sb.from('solo_users').select('custom_external_links').eq('id', session.userId).maybeSingle()
    setLinks(data?.custom_external_links || [])
    setLoading(false)
  }

  async function persist(newLinks) {
    await sb.from('solo_users').update({ custom_external_links: newLinks }).eq('id', session.userId)
    setLinks(newLinks)
  }

  async function uploadImage(file) {
    if (!file?.type.startsWith('image/')) { toast('Please select an image.'); return }
    setUploading(true)
    try {
      const compressed = await new Promise(resolve => {
        const img = new Image(), url = URL.createObjectURL(file)
        img.onload = () => {
          const s = Math.min(1, 400 / Math.max(img.width, img.height))
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(img.width * s); canvas.height = Math.round(img.height * s)
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
          URL.revokeObjectURL(url); canvas.toBlob(resolve, 'image/jpeg', 0.85)
        }
        img.src = url
      })
      const path = `avatars/solo_link_${session.userId}_${Date.now()}.jpg`
      await sb.storage.from('project-files').upload(path, compressed, { contentType: 'image/jpeg' })
      const imageUrl = sb.storage.from('project-files').getPublicUrl(path).data.publicUrl
      setEditing(e => ({ ...e, image_url: imageUrl }))
      toast('Image uploaded ✓')
    } catch (err) { toast('Upload failed: ' + (err?.message || String(err))) }
    setUploading(false)
  }

  async function saveLink() {
    if (!editing.label.trim()) { toast('Label is required.'); return }
    if (!editing.url.trim() || !/^https?:\/\//i.test(editing.url.trim())) { toast('Enter a valid URL starting with https://'); return }
    const entry = { id: editing.idx === -1 ? Date.now().toString() : links[editing.idx].id, label: editing.label.trim(), url: editing.url.trim(), image_url: editing.image_url || '', enabled: editing.enabled }
    const newLinks = editing.idx === -1 ? [...links, entry] : links.map((l, i) => i === editing.idx ? entry : l)
    await persist(newLinks)
    setEditing(null)
    toast('Link saved ✓')
  }

  async function deleteLink(idx) {
    await persist(links.filter((_, i) => i !== idx))
    toast('Link removed.')
  }

  async function toggleEnabled(idx) {
    await persist(links.map((l, i) => i === idx ? { ...l, enabled: !l.enabled } : l))
  }

  if (loading) return null

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🔗 Custom External Links</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
        Add up to 2 custom shortcut icons on your dashboard that open external websites. Each icon can have a custom image and label.
      </div>

      {links.map((link, idx) => (
        <div key={link.id} className="card" style={{ padding: '12px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          {link.image_url
            ? <img src={link.image_url} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
            : <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🔗</div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.url}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => toggleEnabled(idx)}
              style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 99, border: '1px solid', cursor: 'pointer',
                background: link.enabled ? '#E1F5EE' : 'var(--surface2)',
                color: link.enabled ? '#0f6e56' : 'var(--text3)',
                borderColor: link.enabled ? '#0f6e56' : 'var(--border)' }}>
              {link.enabled ? 'Visible' : 'Hidden'}
            </button>
            <button className="btn btn-sm" onClick={() => setEditing({ idx, ...link })}>Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => deleteLink(idx)}>Remove</button>
          </div>
        </div>
      ))}

      {links.length < 2 && !editing && (
        <button className="btn btn-sm btn-primary" style={{ background: '#534AB7', borderColor: '#534AB7', marginTop: 4 }}
          onClick={() => setEditing({ idx: -1, label: '', url: '', image_url: '', enabled: true })}>
          + Add external link
        </button>
      )}

      {editing && (
        <div className="card" style={{ border: '1.5px solid #534AB7', marginTop: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#534AB7', marginBottom: 12 }}>{editing.idx === -1 ? 'New external link' : 'Edit link'}</div>
          <div className="field">
            <label>Label (shown on icon)</label>
            <input value={editing.label} onChange={e => setEditing(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Mileage Form" maxLength={30} />
          </div>
          <div className="field">
            <label>URL</label>
            <input type="url" value={editing.url} onChange={e => setEditing(f => ({ ...f, url: e.target.value }))} placeholder="https://..." />
          </div>
          <div className="field">
            <label>Icon image (optional)</label>
            {editing.image_url && <img src={editing.image_url} style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', marginBottom: 8, display: 'block' }} />}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadImage(e.target.files[0])} />
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? '⏳ Uploading…' : editing.image_url ? '🔄 Change image' : '⬆️ Upload image'}</button>
            {editing.image_url && <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => setEditing(f => ({ ...f, image_url: '' }))}>Remove</button>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <input type="checkbox" id="link-enabled" checked={editing.enabled} onChange={e => setEditing(f => ({ ...f, enabled: e.target.checked }))} />
            <label htmlFor="link-enabled" style={{ fontSize: 13, cursor: 'pointer' }}>Show on dashboard</label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ background: '#534AB7', borderColor: '#534AB7' }} onClick={saveLink}>Save</button>
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// NOTIFICATION PREFERENCES
// ══════════════════════════════════════════════════════════════
function NotificationPrefsPanel({ userId, role }) {
  const [prefs, setPrefs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast, showTooltips, setShowTooltips } = useAppStore()

  const SECTIONS = [
    { title: '📅 Equipment Booking', desc: 'Notifications about your equipment reservations.', roles: ['lab_user', 'user', 'admin', 'solo'], events: [
      { key: 'booking_confirmed', label: 'Booking confirmed' },
      { key: 'booking_reminder',  label: 'Upcoming booking reminder (1 day before)' },
      { key: 'booking_cancelled', label: 'Booking cancelled' },
    ]},
    { title: '🎓 Training & Certifications', desc: 'Stay on top of your training status.', roles: ['lab_user'], events: [
      { key: 'training_approved',  label: 'Training certificate approved' },
      { key: 'training_expiring',  label: 'Training certificate expiring soon' },
      { key: 'training_submitted', label: 'Training submission received' },
    ]},
    { title: '📋 Task Board', desc: 'Notifications from the PM workspace.', roles: ['user', 'admin'], events: [
      { key: 'task_assigned',       label: 'Task assigned to me' },
      { key: 'task_comment',        label: 'New comment on my task' },
      { key: 'meeting_added',       label: 'New meeting task assigned to me' },
      { key: 'task_status_changed', label: 'Task status changed by someone else' },
      { key: 'deadline_reminder',   label: 'Task due tomorrow — advance reminder' },
    ]},
    { title: '📝 Daily Reminders', desc: 'Notifications from your personal reminder list.', roles: ['user', 'admin'], events: [
      { key: 'reminder_daily', label: 'Morning check — see today\'s reminder list (7–11 am)' },
      { key: 'reminder_items', label: 'Reminder item alerts — noon, afternoon & timed items' },
    ]},
    { title: '🤝 Project Team', desc: 'Notifications about project team invites.', roles: ['lab_user', 'user', 'admin'], events: [
      { key: 'team_invite', label: 'Project team invite received or accepted' },
    ]},
    { title: '🔧 Equipment Maintenance', desc: 'Reminders when equipment you are responsible for is coming due.', roles: ['user', 'admin', 'solo'], events: [
      { key: 'maintenance_reminder', label: 'Maintenance due — reminder 2 weeks before and 1 week before due date' },
    ]},
  ].filter(s => s.roles.includes(role))

  useEffect(() => { if (userId) load() }, [userId])

  async function load() {
    setLoading(true)
    const { data } = await sb.from('notification_prefs').select('*').eq('user_id', userId).maybeSingle()
    const defaults = {}
    SECTIONS.forEach(sec => sec.events.forEach(ev => { defaults[ev.key] = true; defaults[`email_${ev.key}`] = false }))
    setPrefs(data ? { ...defaults, ...data } : defaults)
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    const { error } = await sb.from('notification_prefs').upsert(
      { ...prefs, user_id: userId },
      { onConflict: 'user_id' }
    )
    if (error) {
      toast('Error saving preferences: ' + error.message)
      console.error('notification_prefs upsert error:', error)
    } else {
      toast('Notification preferences saved ✓')
    }
    setSaving(false)
  }

  if (!userId) return <div style={{ fontSize: 13, color: 'var(--text3)', padding: 16 }}>Sign in to manage notification preferences.</div>
  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  const allEvents  = SECTIONS.flatMap(s => s.events)
  const allAppOn   = allEvents.every(ev => !!prefs[ev.key])
  const allEmailOn = allEvents.every(ev => !!prefs[`email_${ev.key}`])
  function toggleAll(type) {
    const newVal = type === 'app' ? !allAppOn : !allEmailOn
    setPrefs(p => {
      const next = { ...p }
      allEvents.forEach(ev => { next[type === 'app' ? ev.key : `email_${ev.key}`] = newVal })
      return next
    })
  }

  return (
    <div>
      {/* App Preferences */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>⚙️ App Preferences</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>General display and behavior settings.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>UI guidance tooltips</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Show explanations when hovering over icons and buttons.</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0, marginBottom: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{showTooltips ? 'On' : 'Off'}</span>
            <div onClick={() => setShowTooltips(!showTooltips)} style={{ width: 44, height: 24, borderRadius: 12, background: showTooltips ? 'var(--accent)' : 'var(--border)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 2, left: showTooltips ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
            </div>
          </label>
        </div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>Choose how you want to be notified. <strong>In-app</strong> shows a 🔔 inside ICT-Lab. <strong>Email</strong> sends to your registered address.</div>

      {/* Select All row */}
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 16px', marginBottom: 20 }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Select all</div>
        <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
          {[{ label: 'App 🔔', on: allAppOn, type: 'app' }, { label: 'Email 📧', on: allEmailOn, type: 'email' }].map(({ label, on, type }) => (
            <div key={type} style={{ width: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }} onClick={() => toggleAll(type)}>
              <span style={{ fontSize: 11, fontWeight: 600, color: on ? 'var(--accent)' : 'var(--text3)', minWidth: 22, textAlign: 'right' }}>{on ? 'On' : 'Off'}</span>
              <div style={{ width: 44, height: 24, borderRadius: 12, background: on ? 'var(--accent)' : 'var(--border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {SECTIONS.map(sec => (
        <div key={sec.title} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '12px 16px', background: 'var(--accent-light)', borderBottom: '1px solid #9FE1CB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><div style={{ fontWeight: 600, fontSize: 14, color: '#085041' }}>{sec.title}</div><div style={{ fontSize: 12, color: '#1D9E75', marginTop: 2 }}>{sec.desc}</div></div>
            <div style={{ display: 'flex', gap: 20, fontSize: 11, fontWeight: 600, color: '#085041', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
              <span style={{ width: 80, textAlign: 'center' }}>In-app 🔔</span>
              <span style={{ width: 80, textAlign: 'center' }}>Email 📧</span>
            </div>
          </div>
          {sec.events.map((ev, i) => (
            <div key={ev.key} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: i < sec.events.length - 1 ? '1px solid var(--surface2)' : 'none' }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{ev.label}</div>
              <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
                {[ev.key, `email_${ev.key}`].map(key => {
                  const on = !!prefs[key]
                  return (
                    <div key={key} style={{ width: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: on ? 'var(--accent)' : 'var(--text3)', minWidth: 22, textAlign: 'right' }}>{on ? 'On' : 'Off'}</span>
                      <div onClick={() => setPrefs(p => ({ ...p, [key]: !p[key] }))} style={{ width: 44, height: 24, borderRadius: 12, background: on ? 'var(--accent)' : 'var(--border)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>Email notifications require your email address to be set in your profile.</div>
      <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save notification preferences'}</button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ADMIN PROFILE
// ══════════════════════════════════════════════════════════════
function OrgContactPanel({ session, toast }) {
  const [org, setOrg] = useState(null)
  const [form, setForm] = useState({ contact_name: '', contact_email: '' })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    if (!session?.organizationId) { setLoading(false); return }
    const { data } = await sb.from('organizations').select('*').eq('id', session.organizationId).maybeSingle()
    setOrg(data)
    if (data) setForm({ contact_name: data.contact_name || '', contact_email: data.contact_email || '' })
    setLoading(false)
  }

  async function save() {
    if (!session?.organizationId) return
    setSaving(true)
    const { error } = await sb.from('organizations').update({
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim().toLowerCase() || null,
    }).eq('id', session.organizationId)
    if (error) { toast('Error saving: ' + error.message); setSaving(false); return }
    toast('Contact info saved ✓')
    setSaving(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🏢 Organization Contact Info</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 20 }}>
        Set a contact name and email for your organization. Members who need help logging in will see this on the login page.
      </div>
      {org && (
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
          <span style={{ color: 'var(--text3)' }}>Organization: </span>
          <strong>{org.name}</strong>
        </div>
      )}
      <div className="field">
        <label>Contact person's name</label>
        <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="e.g. Dr. Smith" />
      </div>
      <div className="field">
        <label>Contact email address</label>
        <input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="admin@yourlab.edu" />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>This email will appear on the login page when a member of your organization asks for help.</div>
      </div>
      <button className="btn btn-primary" onClick={save} disabled={saving || !form.contact_email.trim()}>
        {saving ? 'Saving…' : 'Save contact info'}
      </button>
    </div>
  )
}


function AdminProfile() {
  const { session, toast, sidebarSubTab, setSidebarSubTab } = useAppStore()
  const isOrgAdmin = !!session?.userId   // false = super admin (userId null)

  const adminTab = ADMIN_PROFILE_TABS.includes(sidebarSubTab) ? sidebarSubTab : 'admin'

  useEffect(() => { if (isOrgAdmin && !ADMIN_PROFILE_TABS.includes(sidebarSubTab)) setSidebarSubTab('admin') }, [])

  // Super admin: password change + notification email
  if (!isOrgAdmin) {
    return (
      <div>
        <div className="section-title" style={{ marginBottom: 24 }}>Profile</div>
        <AdminSettings session={session} toast={toast} isSuperAdmin />
      </div>
    )
  }

  const tabs = [
    { key: 'admin',     label: '🔑 Admin Settings' },
    { key: 'icons',     label: '🖼️ Icon Images' },
    { key: 'dashboard', label: '🎛️ Dashboard Icons' },
    { key: 'notifs',    label: '🔔 Notifications' },
    { key: 'org',       label: '🏢 Organization' },
  ]
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="section-title">Profile</div>
        <HelpPanel screen="profile" />
      </div>
      <ScrollTabs style={{ borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setSidebarSubTab(t.key)}
            style={{ padding: '10px 24px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: adminTab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${adminTab === t.key ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </ScrollTabs>
      {adminTab === 'admin'     && <AdminSettings session={session} toast={toast} />}
      {adminTab === 'icons'     && <IconImageManager toast={toast} session={session} />}
      {adminTab === 'dashboard' && <DashboardIconsPanel session={session} />}
      {adminTab === 'notifs'    && <NotificationPrefsPanel userId={session?.userId} role="admin" />}
      {adminTab === 'org'       && <OrgContactPanel session={session} toast={toast} />}
    </div>
  )
}

function AdminSettings({ session: sessionProp, toast, isSuperAdmin = false }) {
  const { session: storeSession } = useAppStore()
  const session = sessionProp ?? storeSession
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notifEmail, setNotifEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    if (!isSuperAdmin) return
    sb.from('settings').select('value').eq('key', 'admin_notif_email').maybeSingle()
      .then(({ data }) => { if (data?.value) setNotifEmail(data.value) })
  }, [isSuperAdmin])

  async function saveEmail() {
    if (!notifEmail.trim()) { toast('Enter an email address.'); return }
    setEmailSaving(true)
    await sb.from('settings').upsert({ key: 'admin_notif_email', value: notifEmail.trim().toLowerCase() })
    toast('Notification email saved ✓')
    setEmailSaving(false)
  }

  async function savePassword() {
    setError('')
    if (!form.currentPassword) { setError('Enter your current password.'); return }
    if (!form.newPassword) { setError('Enter a new password.'); return }
    if (form.newPassword !== form.confirmPassword) { setError('Passwords do not match.'); return }
    { const perr = passwordError(form.newPassword); if (perr) { setError(perr); return } }
    setSaving(true)
    const email = session?.email || (await sb.auth.getUser()).data?.user?.email
    if (!email) { setError('Cannot verify identity. Sign out and back in.'); setSaving(false); return }
    const { error: reAuthErr } = await sb.auth.signInWithPassword({ email, password: form.currentPassword })
    if (reAuthErr) { setError('Current password is incorrect.'); setSaving(false); return }
    const { error: updateErr } = await sb.auth.updateUser({ password: form.newPassword })
    if (updateErr) { setError('Failed to update. Try again.'); setSaving(false); return }
    toast('Password updated ✓')
    setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 440 }}>
      {isSuperAdmin && (
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>📧 Notification Email</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Email address used for notification alerts from the bell (when email notifications are enabled).</div>
          <div className="field">
            <label>Email address</label>
            <input type="email" value={notifEmail} onChange={e => setNotifEmail(e.target.value)} placeholder="admin@example.com" />
          </div>
          <button className="btn btn-primary" onClick={saveEmail} disabled={emailSaving}>{emailSaving ? 'Saving…' : 'Save email'}</button>
        </div>
      )}
      <div className="card">
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🔑 Account Settings</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Update the admin password.</div>
        <form onSubmit={e => { e.preventDefault(); savePassword() }} autoComplete="on">
          <div className="field">
            <label>Current password</label>
            <PasswordInput show={showCurrent} onToggle={() => setShowCurrent(s => !s)} value={form.currentPassword} onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))} placeholder="••••••••" autoComplete="current-password" />
          </div>
          <div className="field">
            <label>New password</label>
            <PasswordInput show={showNew} onToggle={() => setShowNew(s => !s)} value={form.newPassword} onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="Min. 8 characters" autoComplete="new-password" />
          </div>
          <PasswordStrengthHint password={form.newPassword} />
          <div className="field">
            <label>Confirm new password</label>
            <PasswordInput show={showConfirm} onToggle={() => setShowConfirm(s => !s)} value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="••••••••" autoComplete="new-password" />
          </div>
          {error && <div style={{ fontSize: 13, color: 'var(--accent2)', marginBottom: 12 }}>⚠️ {error}</div>}
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Update password'}</button>
        </form>
      </div>
    </div>
  )
}

// ── Self-service delete for team users (staff / lab users) ──
function TeamDeleteAccountPanel({ session, toast }) {
  const [pending, setPending] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [orgUsers, setOrgUsers] = useState([])
  const [suggestTo, setSuggestTo] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: req }, { data: users }] = await Promise.all([
      sb.from('account_deletion_requests').select('*').eq('user_id', session.userId).eq('status', 'pending').maybeSingle(),
      sb.from('users').select('id, name, role').eq('organization_id', session.organizationId).eq('is_active', true).neq('id', session.userId),
    ])
    setPending(req || null)
    setOrgUsers(users || [])
    setLoading(false)
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const transferUser = suggestTo ? orgUsers.find(u => u.id === suggestTo) : null
      await sb.from('account_deletion_requests').insert({
        user_id: session.userId,
        user_name: session.username,
        organization_id: session.organizationId,
        suggested_transfer_to: suggestTo || null,
        suggested_transfer_name: transferUser?.name || null,
      })
      await notifyOrgManagers(session.organizationId, `${session.username} has submitted an account deletion request.`, 'deletion_request', session.userId)
      await load()
      toast('Request submitted. Your lab manager has been notified.')
    } catch (err) {
      toast('Error: ' + (err.message || String(err)))
    }
    setSubmitting(false)
  }

  async function handleCancel() {
    await sb.from('account_deletion_requests').delete().eq('user_id', session.userId).eq('status', 'pending')
    setPending(null)
    toast('Deletion request cancelled.')
  }

  if (loading) return <div className="card" style={{ border: '1.5px solid #e5e7eb' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  if (pending) {
    return (
      <div className="card" style={{ border: '1.5px solid #f59e0b', background: '#fffbeb' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#92400e', marginBottom: 8 }}>Deletion Request Pending</div>
        <p style={{ fontSize: 14, color: '#78350f', lineHeight: 1.6, marginBottom: 8 }}>
          Your request has been submitted and is awaiting review by your lab manager.
        </p>
        <p style={{ fontSize: 12, color: '#92400e', marginBottom: 16 }}>
          Submitted: {new Date(pending.requested_at).toLocaleDateString()}
          {pending.suggested_transfer_name && ` · Suggested transfer to: ${pending.suggested_transfer_name}`}
        </p>
        <button className="btn" onClick={handleCancel}>Cancel request</button>
      </div>
    )
  }

  return (
    <div className="card" style={{ border: '1.5px solid #fca5a5' }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#b91c1c', marginBottom: 8 }}>Request Account Deletion</div>
      <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
        Submit a deletion request to your lab manager. They will review it, optionally archive or transfer your data, and approve or deny it.
      </p>
      {orgUsers.length > 0 && (
        <div className="field">
          <label>Suggest who should receive your data (optional)</label>
          <select value={suggestTo} onChange={e => setSuggestTo(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontFamily: 'var(--sans)', fontSize: 14, background: 'var(--surface)', color: 'var(--text1)' }}>
            <option value="">No preference</option>
            {orgUsers.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.role === 'user' ? 'Lab Manager' : u.role === 'admin' ? 'Org Admin' : 'Lab User'})</option>
            ))}
          </select>
        </div>
      )}
      <button className="btn btn-danger" onClick={handleSubmit} disabled={submitting} style={{ marginTop: 8 }}>
        {submitting ? 'Submitting…' : 'Submit deletion request'}
      </button>
    </div>
  )
}

// ── Shared delete confirmation modal for team users ──
function DeleteUserModal({ user, onClose, onConfirm, deleting }) {
  const [typed, setTyped] = useState('')
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', padding:28, maxWidth:440, width:'100%', border:'2px solid #fca5a5' }}>
        <div style={{ fontWeight:700, fontSize:16, color:'#b91c1c', marginBottom:10 }}>Delete {user.name}?</div>
        <p style={{ fontSize:14, color:'var(--text2)', marginBottom:16, lineHeight:1.6 }}>This permanently deletes the account and all access data. <strong>This cannot be undone.</strong></p>
        <div className="field">
          <label style={{ color:'#b91c1c', fontWeight:600 }}>Type DELETE to confirm</label>
          <input value={typed} onChange={e=>setTyped(e.target.value)} placeholder="DELETE" autoFocus />
        </div>
        <div style={{ display:'flex', gap:10, marginTop:16 }}>
          <button className="btn btn-danger" disabled={typed !== 'DELETE' || deleting} onClick={() => onConfirm(user.id)}>
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── STUDENTS PANEL ── with 🎛️ icon button per student
// Round avatar for user cards: profile photo → gender scientist emoji
// (same fallback chain as the Training hub / Lab Messages)
function PersonAvatar({ user, size = 56 }) {
  if (user?.photo_url) {
    return <img src={user.photo_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }} />
  }
  const g = (user?.gender || '').toLowerCase()
  const emoji = g === 'male' ? '👨‍🔬' : g === 'female' ? '👩‍🔬' : '🧑‍🔬'
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--accent-light)', border: '2px solid #9FE1CB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.5), flexShrink: 0, lineHeight: 1 }}>
      {emoji}
    </div>
  )
}

export function StudentsPanel({ toast, session }) {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editStudent, setEditStudent] = useState(null)
  const [iconStudent, setIconStudent] = useState(null)
  const [pendingIconSetup, setPendingIconSetup] = useState(null)
  const [importPreview, setImportPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let q = sb.from('users').select('*').eq('role', 'lab_user').order('name')
    if (session?.organizationId) q = q.eq('organization_id', session.organizationId)
    const { data } = await q
    setStudents(data || [])
    setLoading(false)
  }

  const filtered = students.filter(s => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return sFirstName(s).toLowerCase().includes(q) || sLastName(s).toLowerCase().includes(q) || sEmail(s).toLowerCase().includes(q)
  })

  async function saveStudent(form, id) {
    if (!form.firstName.trim() && !form.lastName.trim()) { toast('Name is required.'); return }
    const actualEmail = form.emailAddr?.trim().toLowerCase()
    if (!id) {
      if (!form.password) { toast('Password is required.'); return }
      if (!actualEmail) { toast('Email is required for student login.'); return }
    }
    if (form.password) {
      const perr = passwordError(form.password)
      if (perr) { toast(perr); return }
    }
    if (!form.selectedProjectIds || form.selectedProjectIds.length === 0) { toast('Please assign at least one project.'); return }
    const payload = { name: form.firstName.trim(), last_name: form.lastName.trim() || null, email: actualEmail || null, supervisor: form.supervisor || null, year_semester: form.year_semester || null, project_group: form.project_group || null, assigned_project_ids: form.selectedProjectIds || [], nick_name: form.nickname || null, organization_id: session?.organizationId || null, role: 'lab_user', is_active: true, admin_level: 0, pin: '', must_change_password: !id && !!form.password, terms_accepted_version: null }
    if (!id && form.password && actualEmail) {
      try {
        const authUser = await createAuthUser(actualEmail, form.password)
        if (authUser) payload.auth_id = authUser.id
      } catch (err) { toast('Error creating login account: ' + (err.message || 'Try again.')); return }
    }
    if (id) {
      const { error } = await sb.from('users').update(payload).eq('id', id)
      if (error) { toast('Error: ' + error.message); return }
      setShowModal(false); setEditStudent(null); load(); toast('Student saved ✓')
    } else {
      const { data: newUser, error } = await sb.from('users').insert(payload).select('id').single()
      if (error) { toast('Error: ' + error.message); return }
      if (session?.organizationId) notifyOrgManagers(session.organizationId, `New lab user added: ${payload.name}`, 'new_user', session.userId)
      const dispName = `${form.firstName} ${form.lastName}`.trim() || form.emailAddr || 'New user'
      queueWelcomeEmail(sb, { name: dispName, toEmail: actualEmail, orgId: session?.organizationId, userId: newUser.id, password: form.password })
      setShowModal(false); setEditStudent(null)
      setPendingIconSetup({ userId: newUser.id, displayName: dispName })
    }
  }

  async function toggleActive(s) { await sb.from('users').update({ is_active: !s.is_active }).eq('id', s.id); load(); toast(s.is_active ? 'Deactivated.' : 'Activated.') }
  async function clearPhotoFlag(s) { await sb.from('users').update({ photo_denial_flagged: false }).eq('id', s.id); load(); toast('Photo flag cleared.') }
  async function deleteStudent(id) {
    setDeleting(true)
    const { data: u } = await sb.from('users').select('auth_id').eq('id', id).maybeSingle()
    await sb.from('user_screen_access').delete().eq('user_id', id)
    await sb.from('user_dashboard_prefs').delete().eq('user_id', id)
    if (u?.auth_id) try { await sb.rpc('delete_auth_user', { p_auth_id: u.auth_id }) } catch (_) {}
    await sb.from('users').delete().eq('id', id)
    setDeleting(false); setDeleteTarget(null); load(); toast('Lab user deleted.')
  }

  async function parseExcel(file) {
    const XLSX = await import('xlsx')
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'binary' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
          const items = []
          for (let i = 1; i < rows.length; i++) {
            const [name, email, phone, degree, year_semester, supervisor, project_group] = rows[i]
            if (name?.trim()) items.push({ name: name.trim(), email: email||'', phone: phone||'', degree: degree||'', year_semester: year_semester||'', supervisor: supervisor||'', project_group: project_group||'' })
          }
          resolve(items)
        } catch(err) { reject(err) }
      }
      reader.onerror = reject
      reader.readAsBinaryString(file)
    })
  }

  async function confirmImport() {
    if (!importPreview) return
    setImporting(true)
    let added = 0
    for (const s of importPreview) {
      const { error } = await sb.from('users').insert({ ...s, pin: '', role: 'lab_user', is_active: true, admin_level: 0, must_change_password: true, terms_accepted_version: null })
      if (!error) added++
    }
    setImportPreview(null); setImporting(false); load(); toast(`${added} students imported. Set their passwords individually to activate login.`)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>{students.length} lab user{students.length !== 1 ? 's' : ''}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>⬇️ Import Excel</button>
          <button className="btn btn-sm btn-primary" onClick={() => { setEditStudent(null); setShowModal(true) }}>+ Add lab user</button>
        </div>
      </div>
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text3)', pointerEvents: 'none' }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" style={{ paddingLeft: 36, width: '100%', boxSizing: 'border-box' }} />
        {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text3)' }}>×</button>}
      </div>
      <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={async e => { try { setImportPreview(await parseExcel(e.target.files[0])) } catch { toast('Error reading file.') } }} />
      {importPreview && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Import preview — {importPreview.length} lab users</div>
          {importPreview.slice(0,3).map((s,i) => <div key={i} style={{ fontSize: 13, padding: '2px 0', color: 'var(--text2)' }}>· {s.name}</div>)}
          {importPreview.length > 3 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>…and {importPreview.length - 3} more</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={confirmImport} disabled={importing}>{importing ? 'Importing…' : 'Import now'}</button>
            <button className="btn btn-sm" onClick={() => setImportPreview(null)}>Cancel</button>
          </div>
        </div>
      )}
      {loading ? <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : filtered.length === 0 ? <div className="empty-state"><div className="empty-icon">👥</div>{search ? 'No lab users match your search.' : 'No lab users yet.'}</div>
        : (
        /* Supply-Inventory-style card grid: photo strip on top,
           action buttons under each user */
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          {filtered.map(s => (
            <div key={s.id} className="manage-card" style={{ width: 176, flexShrink: 0, padding: s.photo_url ? '0 12px 14px' : '16px 12px 14px', overflow: 'hidden', opacity: s.is_active ? 1 : 0.55, ...(s.photo_denial_flagged ? { borderColor: '#f59e0b', background: '#fefce8' } : {}) }}>
              {s.photo_url
                ? <img src={s.photo_url} alt="" style={{ width: 'calc(100% + 24px)', height: 90, objectFit: 'cover', borderRadius: '10px 10px 0 0', margin: '0 -12px 10px' }} />
                : <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><PersonAvatar user={s} /></div>}
              <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.nick_name?.trim() || sFirstName(s) || '—'}
              </div>
              {sEmail(s) && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sEmail(s)}</div>}
              <div style={{ marginTop: 4, marginBottom: 10, display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap', minHeight: 16 }}>
                {!s.is_active && <span style={{ fontSize: 10, color: '#fff', background: 'var(--accent2)', borderRadius: 99, padding: '1px 8px', fontWeight: 700 }}>Inactive</span>}
                {s.photo_denial_flagged && <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b', padding: '1px 8px', borderRadius: 99, fontWeight: 700 }}>⚠️ Photo</span>}
                {s.project_group && !s.photo_denial_flagged && s.is_active && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{s.project_group}</span>}
              </div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} title="Set allowed dashboard icons" onClick={() => setIconStudent(s)}>Icons</button>
                <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => { setEditStudent(s); setShowModal(true) }}>Edit</button>
                <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => toggleActive(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button>
                <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setDeleteTarget(s)}>Delete</button>
                {s.photo_denial_flagged && (
                  <button className="btn" style={{ fontSize: 12, padding: '4px 8px', background: '#fef3c7', borderColor: '#f59e0b', color: '#92400e' }} title="Clear photo denial flag" onClick={() => clearPhotoFlag(s)}>✕ Flag</button>
                )}
              </div>
            </div>
          ))}
        </div>
        )
      }
      {showModal && <StudentModal student={editStudent} session={session} onClose={() => { setShowModal(false); setEditStudent(null) }} onSave={saveStudent} />}
      {iconStudent && <StudentIconManager student={iconStudent} orgId={session?.organizationId} onClose={(saved) => { setIconStudent(null); if (saved) toast(`Icons updated for ${iconStudent.email || iconStudent.name} ✓`) }} />}
      {pendingIconSetup && <IconSetupModal userId={pendingIconSetup.userId} displayName={pendingIconSetup.displayName} organizationId={session?.organizationId} userRole="student" onDone={() => { setPendingIconSetup(null); load(); toast('Lab user created & icons saved ✓') }} />}
      {deleteTarget && <DeleteUserModal user={{ id: deleteTarget.id, name: sLastName(deleteTarget) || sFirstName(deleteTarget) || 'this user' }} onClose={() => setDeleteTarget(null)} onConfirm={deleteStudent} deleting={deleting} />}
    </div>
  )
}

function StudentModal({ student, session, onClose, onSave }) {
  const [form, setForm] = useState(student ? {
    firstName: sFirstName(student), lastName: sLastName(student), emailAddr: sEmail(student), supervisor: sSupervisor(student),
    password: '', year_semester: student.year_semester||'', project_group: student.project_group||'',
    selectedProjectIds: student.assigned_project_ids || [],
    nickname: student.nick_name || '',
  } : { firstName: '', lastName: '', emailAddr: '', supervisor: '', password: '', year_semester: '', project_group: '', selectedProjectIds: [], nickname: '' })
  const [orgProjects, setOrgProjects] = useState([])
  const [showPw, setShowPw] = useState(false)

  useEffect(() => {
    if (!session?.organizationId) return
    sb.from('projects').select('id, name, project_id')
      .eq('organization_id', session.organizationId)
      .is('solo_owner_id', null)
      .order('name')
      .then(({ data }) => setOrgProjects(data || []))
  }, [session?.organizationId])

  function toggleProject(id) {
    setForm(f => ({
      ...f,
      selectedProjectIds: f.selectedProjectIds.includes(id)
        ? f.selectedProjectIds.filter(x => x !== id)
        : [...f.selectedProjectIds, id],
    }))
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <form onSubmit={e => e.preventDefault()} autoComplete="on" style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', padding:28, maxWidth:520, width:'100%', maxHeight:'90vh', overflowY:'auto', border:'1px solid var(--border)' }}>
        <div style={{ fontWeight:600, fontSize:16, marginBottom:20 }}>{student ? 'Edit lab user' : 'Add lab user'}</div>
        <div className="grid-2">
          <div className="field"><label>First Name *</label><input value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))} placeholder="e.g. Ivan" autoFocus /></div>
          <div className="field"><label>Last Name *</label><input value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))} placeholder="e.g. Akonya" /></div>
        </div>
        <div className="grid-2">
          <div className="field"><label>Nickname <span style={{ fontWeight:400, color:'var(--text3)' }}>(optional)</span></label><input value={form.nickname} onChange={e=>setForm(f=>({...f,nickname:e.target.value}))} placeholder="e.g. Alex" /></div>
          <div className="field"><label>Email Address</label><input type="email" value={form.emailAddr} onChange={e=>setForm(f=>({...f,emailAddr:e.target.value}))} placeholder="netid@illinois.edu" /></div>
        </div>
        <div className="field">
          <label>Password{student ? ' (leave blank to keep current)' : ' *'}</label>
          <PasswordInput show={showPw} onToggle={() => setShowPw(s => !s)} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder={student ? 'Leave blank to keep unchanged' : 'e.g. Lab2026! — upper, lower, number, symbol'} autoComplete="new-password" />
          <PasswordStrengthHint password={form.password} />
        </div>
        <div className="grid-2">
          <div className="field"><label>Supervisor</label><input value={form.supervisor} onChange={e=>setForm(f=>({...f,supervisor:e.target.value}))} placeholder="e.g. Prof. James Carter" /></div>
          {session?.organizationId === ICT_ORG_ID && (
            <div className="field"><label>Project Group</label>
              <select value={form.project_group} onChange={e=>setForm(f=>({...f,project_group:e.target.value}))}>
                <option value="">— Select —</option>{PROJECT_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          )}
        </div>
        {orgProjects.length > 0 && (
          <div className="field">
            <label>Assigned Projects *</label>
            <div style={{ border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'8px 12px', maxHeight:180, overflowY:'auto' }}>
              {orgProjects.map(p => (
                <div key={p.id} onClick={() => toggleProject(p.id)}
                  style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer', userSelect:'none', padding:'4px 0' }}>
                  <input type="checkbox" readOnly checked={form.selectedProjectIds.includes(p.id)} style={{ width:'auto', flexShrink:0, cursor:'pointer' }} />
                  <span style={{ lineHeight:1.3 }}>{p.project_id ? `${p.project_id} – ${p.name}` : p.name}</span>
                </div>
              ))}
            </div>
            {form.selectedProjectIds.length > 0 && (
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>{form.selectedProjectIds.length} project{form.selectedProjectIds.length !== 1 ? 's' : ''} selected</div>
            )}
          </div>
        )}
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button type="button" className="btn btn-primary" onClick={()=>onSave(form, student?.id)}>Save</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  )
}

export function StaffPanel({ toast, session }) {
  // Access Control merged into the cards — "Access" button per lab manager
  return <StaffListPanel toast={toast} session={session} />
}

function StaffListPanel({ toast, session }) {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editStaff, setEditStaff] = useState(null)
  const [pendingIconSetup, setPendingIconSetup] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [accessTarget, setAccessTarget] = useState(null)
  useEffect(() => { load() }, [])
  async function load() { setLoading(true); let q = sb.from('users').select('*').in('role', ['user', 'admin']).order('name'); if (session?.organizationId) q = q.eq('organization_id', session.organizationId); const { data } = await q; setStaff(data || []); setLoading(false) }
  async function saveStaff(form, id) {
    const fullName = [form.firstName?.trim(), form.lastName?.trim()].filter(Boolean).join(' ')
    if (!fullName) { toast('Name is required.'); return }
    const actualEmail = form.email?.trim().toLowerCase()
    if (!id) {
      if (!form.password) { toast('Password is required.'); return }
      if (!actualEmail) { toast('Email is required for lab manager login.'); return }
    }
    if (form.password) {
      const perr = passwordError(form.password)
      if (perr) { toast(perr); return }
    }
    const payload = { name: fullName, email: actualEmail || null, phone: form.phone || null, role: 'user', is_active: true, admin_level: 0, pin: '', organization_id: session?.organizationId || null, must_change_password: !id && !!form.password, terms_accepted_version: null }
    if (!id && form.password && actualEmail) {
      try {
        const authUser = await createAuthUser(actualEmail, form.password)
        if (authUser) payload.auth_id = authUser.id
      } catch (err) { toast('Error creating login account: ' + (err.message || 'Try again.')); return }
    }
    if (id) { const { error } = await sb.from('users').update(payload).eq('id', id); if (error) { toast('Error: ' + error.message); return }; setShowModal(false); setEditStaff(null); load(); toast('Staff saved ✓') }
    else { const { data: newUser, error } = await sb.from('users').insert(payload).select('id').single(); if (error) { toast('Error: ' + error.message); return }; if (session?.organizationId) notifyOrgManagers(session.organizationId, `New lab manager added: ${fullName}`, 'new_manager', session.userId); queueWelcomeEmail(sb, { name: fullName, toEmail: actualEmail, orgId: session?.organizationId, userId: newUser.id, password: form.password }); setShowModal(false); setEditStaff(null); setPendingIconSetup({ userId: newUser.id, displayName: fullName }) }
  }
  async function toggleActive(s) { await sb.from('users').update({ is_active: !s.is_active }).eq('id', s.id); load(); toast(s.is_active ? 'Deactivated.' : 'Activated.') }
  async function deleteStaff(id) {
    setDeleting(true)
    const { data: u } = await sb.from('users').select('auth_id').eq('id', id).maybeSingle()
    await sb.from('user_screen_access').delete().eq('user_id', id)
    await sb.from('user_dashboard_prefs').delete().eq('user_id', id)
    if (u?.auth_id) try { await sb.rpc('delete_auth_user', { p_auth_id: u.auth_id }) } catch (_) {}
    await sb.from('users').delete().eq('id', id)
    setDeleting(false); setDeleteTarget(null); load(); toast('Member deleted.')
  }
  // Role change must REMAP name/email columns: staff store name=full,
  // email=login; lab users (legacy student convention) store email=firstName,
  // name=lastName, phone=login email. Without this, a converted user shows
  // their email as first name and loses their login email display.
  async function setMemberRole(u, newRole) {
    let payload = { role: newRole, admin_level: 0 }
    if (newRole === 'lab_user') {
      const parts = (u.name || '').trim().split(/\s+/)
      payload = {
        ...payload,
        email: parts[0] || null,                                  // first name
        name: parts.slice(1).join(' ') || null,                   // last name
        phone: u.email || u.phone || null,                        // login email
      }
    } else if (newRole === 'user') {
      payload = {
        ...payload,
        name: [u.email, u.name].filter(Boolean).join(' ') || u.name,  // full name
        email: u.phone || u.email || null,                            // login email
        phone: null,
      }
    }
    await sb.from('users').update(payload).eq('id', u.id)
    toast(`${u.name} updated to ${newRole === 'user' ? 'Lab Manager' : 'Lab User'} ✓`)
    load()
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>{staff.length} lab manager{staff.length !== 1 ? 's' : ''} &amp; org admin{staff.filter(s=>s.role==='admin').length !== 1 ? 's' : ''}</div>
        <button className="btn btn-sm btn-primary" onClick={() => { setEditStaff(null); setShowModal(true) }}>+ Add lab manager</button>
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : staff.length === 0 ? <div className="empty-state"><div className="empty-icon">👨‍💼</div>No lab managers yet.</div>
        : (
        /* Supply-Inventory-style card grid: photo strip on top,
           action buttons under each member */
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          {staff.map(s => (
            <div key={s.id} className="manage-card" style={{ width: 176, flexShrink: 0, padding: s.photo_url ? '0 12px 14px' : '16px 12px 14px', overflow: 'hidden', opacity: s.is_active ? 1 : 0.55 }}>
              {s.photo_url
                ? <img src={s.photo_url} alt="" style={{ width: 'calc(100% + 24px)', height: 90, objectFit: 'cover', borderRadius: '10px 10px 0 0', margin: '0 -12px 10px' }} />
                : <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><PersonAvatar user={s} /></div>}
              <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
              {s.email && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</div>}
              <div style={{ marginTop: 4, marginBottom: 10, display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, background: s.role === 'admin' ? '#fce8ff' : '#fff3e0', color: s.role === 'admin' ? '#7e22ce' : '#ff6b00', borderRadius: 99, padding: '1px 8px', fontWeight: 700 }}>{s.role === 'admin' ? 'Org Admin' : 'Lab Manager'}</span>
                {!s.is_active && <span style={{ fontSize: 10, color: '#fff', background: 'var(--accent2)', borderRadius: 99, padding: '1px 8px', fontWeight: 700 }}>Inactive</span>}
              </div>
              {!(session?.role === 'user' && s.role === 'admin') && (
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {s.role === 'user' && (
                    <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} title="Set module access" onClick={() => setAccessTarget(s)}>Access</button>
                  )}
                  <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => { setEditStaff(s); setShowModal(true) }}>Edit</button>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => toggleActive(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button>
                  <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setDeleteTarget(s)}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
        )
      }
      {showModal && <StaffModal staff={editStaff} onClose={() => { setShowModal(false); setEditStaff(null) }} onSave={saveStaff} onRoleChange={setMemberRole} />}
      {accessTarget && <AccessModal user={accessTarget} toast={toast} session={session} onClose={() => setAccessTarget(null)} />}
      {pendingIconSetup && <IconSetupModal userId={pendingIconSetup.userId} displayName={pendingIconSetup.displayName} organizationId={session?.organizationId} userRole="user" onDone={() => { setPendingIconSetup(null); load(); toast('Lab manager created & icons saved ✓') }} />}
      {deleteTarget && <DeleteUserModal user={{ id: deleteTarget.id, name: deleteTarget.name || 'this member' }} onClose={() => setDeleteTarget(null)} onConfirm={deleteStaff} deleting={deleting} />}
    </div>
  )
}

function StaffModal({ staff, onClose, onSave, onRoleChange }) {
  // First/Last collected separately (stored joined in `name`) so role
  // conversions to lab user can split reliably
  const [form, setForm] = useState(() => {
    if (!staff) return { firstName: '', lastName: '', password: '', email: '', phone: '' }
    const parts = (staff.name || '').trim().split(/\s+/)
    return { firstName: parts[0] || '', lastName: parts.slice(1).join(' '), password: '', email: staff.email || '', phone: staff.phone || '' }
  })
  const [confirmDowngrade, setConfirmDowngrade] = useState(false)
  const [showPw, setShowPw] = useState(false)

  function handleRoleClick(opt) {
    if (opt.role === staff.role) return
    if (opt.role === 'lab_user') { setConfirmDowngrade(true); return }
    onRoleChange(staff, opt.role); onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <form onSubmit={e => e.preventDefault()} autoComplete="on" style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', padding:28, maxWidth:480, width:'100%', border:'1px solid var(--border)' }}>
        <div style={{ fontWeight:600, fontSize:16, marginBottom:20 }}>{staff ? 'Edit lab manager' : 'Add lab manager'}</div>
        <div className="grid-2">
          <div className="field"><label>First Name *</label><input value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))} placeholder="e.g. Sara" autoFocus /></div>
          <div className="field"><label>Last Name *</label><input value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))} placeholder="e.g. Chen" /></div>
        </div>
        <div className="field"><label>Email</label><input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="netid@illinois.edu" /></div>
        <div className="grid-2">
          <div className="field">
            <label>Password{staff ? ' (leave blank to keep)' : ' *'}</label>
            <PasswordInput show={showPw} onToggle={() => setShowPw(s => !s)} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder={staff ? 'Type to change' : 'e.g. Lab2026! — upper, lower, number, symbol'} autoComplete="new-password" />
            <PasswordStrengthHint password={form.password} />
          </div>
          <div className="field"><label>Phone</label><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></div>
        </div>
        {staff && onRoleChange && (
          <div className="field">
            <label>Role</label>
            <div style={{ display:'flex', gap:8 }}>
              {[{ label: 'Lab Manager', role: 'user' }, { label: 'Lab User', role: 'lab_user' }].map(opt => (
                <button key={opt.role}
                  className={`btn btn-sm${staff.role === opt.role ? ' btn-primary' : ''}`}
                  onClick={() => handleRoleClick(opt)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {confirmDowngrade && (
          <div style={{ background:'#fff8f0', border:'1.5px solid #f59e0b', borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:12 }}>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:6, color:'#92400e' }}>⚠️ Change role to Lab User?</div>
            <div style={{ fontSize:13, color:'#78350f', lineHeight:1.6, marginBottom:12 }}>
              By changing the role, this user will become a lab user and will be listed under the Lab Users tab. All lab manager access will be removed. Do you still want to change the role?
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-sm btn-primary" style={{ background:'#d97706', borderColor:'#d97706' }}
                onClick={() => { onRoleChange(staff, 'lab_user'); onClose() }}>Yes, change role</button>
              <button className="btn btn-sm" onClick={() => setConfirmDowngrade(false)}>No, keep as Lab Manager</button>
            </div>
          </div>
        )}
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button type="button" className="btn btn-primary" onClick={()=>onSave(form, staff?.id)}>Save</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  )
}

function SupervisorSelect({ value, onChange }) {
  const { session } = useAppStore()
  const [supervisors, setSupervisors] = useState([])
  useEffect(() => {
    let q = sb.from('users').select('id, name').eq('role', 'user').eq('is_active', true).order('name')
    if (session?.organizationId) q = q.eq('organization_id', session.organizationId)
    q.then(({ data }) => setSupervisors(data || []))
  }, [session?.organizationId])
  return (
    <select value={value||''} onChange={e => onChange(e.target.value)}>
      <option value="">— Select supervisor —</option>
      {supervisors.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
    </select>
  )
}

// ══════════════════════════════════════════════════════════════
// MANDATORY ICON SETUP MODAL (shown after new user creation)
// ══════════════════════════════════════════════════════════════
function IconSetupModal({ userId, displayName, organizationId, userRole = 'lab_user', onDone }) {
  const [orgPool, setOrgPool] = useState(null)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [userId])

  async function load() {
    let pool = null
    if (organizationId) {
      const { data } = await sb.from('organizations').select('allowed_modules, allowed_modules_labusers, allowed_modules_labmanagers').eq('id', organizationId).maybeSingle()
      const outerPool = data?.allowed_modules
      const rolePool = userRole === 'lab_user' ? data?.allowed_modules_labusers : data?.allowed_modules_labmanagers
      pool = rolePool ?? outerPool
    }
    const allKeys = ALL_MODULES_META.filter(m => !m.adminOnly && !m.soloLocked).map(m => m.key)
    const availablePool = pool ?? allKeys
    setOrgPool(availablePool)
    const initSelected = new Set([...availablePool, 'profile'])
    setSelected(initSelected)
  }

  function toggle(key) {
    if (key === 'profile') return
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function save() {
    if (!selected || saving) return
    setSaving(true)
    const modules = ['profile', ...Array.from(selected).filter(k => k !== 'profile')]
    const { data: existing } = await sb.from('user_dashboard_prefs').select('id').eq('user_id', userId).maybeSingle()
    if (existing) {
      await sb.from('user_dashboard_prefs').update({ allowed_modules: modules }).eq('user_id', userId)
    } else {
      await sb.from('user_dashboard_prefs').insert({ user_id: userId, allowed_modules: modules })
    }
    setSaving(false)
    onDone()
  }

  const displayModules = orgPool ? ALL_MODULES_META.filter(m => orgPool.includes(m.key) || m.key === 'profile') : []

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(3px)' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 6 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#e0f7ef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🎛️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>Step 2 of 2 — Dashboard Icons</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>Choose which icons <strong>{displayName}</strong> will see on their dashboard.</div>
            </div>
          </div>
          <div style={{ background: '#fef3c7', borderRadius: 8, padding: '8px 14px', marginTop: 14, fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
            ⚠️ This step is required to complete user setup. Select icons, then click "Save &amp; complete".
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0 14px' }}>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {selected ? <><span style={{ fontWeight: 600, color: 'var(--text)' }}>{selected.size}</span> of {displayModules.length} selected</> : ''}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => orgPool && setSelected(new Set([...orgPool, 'profile']))} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600 }}>Select all</button>
              <span style={{ color: 'var(--border)' }}>·</span>
              <button onClick={() => setSelected(new Set(['profile']))} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontWeight: 500 }}>Clear</button>
            </div>
          </div>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 24px', flex: 1 }}>
          {selected === null ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 10, paddingBottom: 20 }}>
              {displayModules.map(m => {
                const pinned = m.key === 'profile'
                const sel = pinned || selected.has(m.key)
                return (
                  <div key={m.key} onClick={() => toggle(m.key)}
                    style={{ borderRadius: 12, border: sel ? `2px solid ${m.color}` : '2px solid var(--border)', background: sel ? `${m.color}12` : 'var(--surface)', padding: '12px 12px 10px', cursor: pinned ? 'default' : 'pointer', position: 'relative', transition: 'all 0.15s', opacity: pinned ? 0.75 : 1, userSelect: 'none' }}>
                    <div style={{ position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: '50%', background: sel ? m.color : 'var(--surface2)', border: `2px solid ${sel ? m.color : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      {sel && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                    <div style={{ fontSize: 24, marginBottom: 6, pointerEvents: 'none' }}>{m.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: sel ? m.color : 'var(--text)', marginBottom: 2, paddingRight: 20, pointerEvents: 'none' }}>{m.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.4, pointerEvents: 'none' }}>{m.sub}</div>
                    {pinned && <div style={{ marginTop: 4, fontSize: 9, color: m.color, fontWeight: 700, pointerEvents: 'none' }}>Always visible</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div style={{ padding: '14px 24px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Profile is always visible. Tap icons to toggle.</div>
          <button className="btn btn-primary" onClick={save} disabled={saving || selected === null}>
            {saving ? 'Saving…' : 'Save & complete ✓'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// STAFF: MANAGE STUDENT DASHBOARD ICONS
// ══════════════════════════════════════════════════════════════
function StaffStudentIconManager() {
  const { toast, session } = useAppStore()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [iconStudent, setIconStudent] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let q = sb.from('users').select('*').eq('role', 'lab_user').order('name')
    if (session?.organizationId) q = q.eq('organization_id', session.organizationId)
    const { data } = await q
    setStudents(data || [])
    setLoading(false)
  }

  const filtered = students.filter(s => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return sFirstName(s).toLowerCase().includes(q) || sLastName(s).toLowerCase().includes(q) || sEmail(s).toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🎛️ Student Dashboard Icons</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          Select a student to choose which icons they are allowed to see and pick from on their dashboard.
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text3)', pointerEvents: 'none' }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" style={{ paddingLeft: 36, width: '100%', boxSizing: 'border-box' }} />
        {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text3)' }}>×</button>}
      </div>

      {loading
        ? <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : filtered.length === 0
          ? <div className="empty-state"><div className="empty-icon">👥</div>{search ? 'No lab users match your search.' : 'No lab users yet.'}</div>
          : filtered.map((s, idx) => (
            <div key={s.id} className="card" style={{ padding: '12px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginRight: 6 }}>#{idx + 1}</span>
                    {s.nick_name?.trim() || sFirstName(s) || '—'}
                  </div>
                  {sEmail(s) && <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>📧 {sEmail(s)}</div>}
                </div>
                <button className="btn btn-sm" onClick={() => setIconStudent(s)}>🎛️ Assign Icons</button>
              </div>
            </div>
          ))
      }

      {iconStudent && (
        <StudentIconManager
          student={iconStudent}
          onClose={(saved) => {
            setIconStudent(null)
            if (saved) toast(`Icons updated for ${sFirstName(iconStudent) || iconStudent.name} ✓`)
          }}
        />
      )}
    </div>
  )
}

function PasswordChangePanel({ session, toast }) {
  const [form, setForm] = useState({ current: '', newPin: '', confirm: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCur, setShowCur] = useState(false)
  const [showNew, setShowNew] = useState(false)

  async function save() {
    setError('')
    if (!form.current) { setError('Enter your current password.'); return }
    { const perr = passwordError(form.newPin); if (perr) { setError(perr); return } }
    if (form.newPin !== form.confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    const email = session?.email || (await sb.auth.getUser()).data?.user?.email
    const { error: reAuthErr } = await sb.auth.signInWithPassword({ email, password: form.current })
    if (reAuthErr) { setError('Current password is incorrect.'); setSaving(false); return }
    const { error: updateErr } = await sb.auth.updateUser({ password: form.newPin })
    if (updateErr) { setError('Failed to update. Try again.'); setSaving(false); return }
    toast('Password updated ✓')
    setForm({ current: '', newPin: '', confirm: '' })
    setSaving(false)
  }

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Change password</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Min. 8 characters with uppercase, lowercase &amp; symbol.</div>
      <form onSubmit={e => { e.preventDefault(); save() }} autoComplete="on">
        <div className="field">
          <label>Current password</label>
          <PasswordInput show={showCur} onToggle={() => setShowCur(s => !s)} value={form.current} onChange={e => { setForm(f => ({ ...f, current: e.target.value })); setError('') }} placeholder="••••••••" autoComplete="current-password" />
        </div>
        <div className="grid-2">
          <div className="field">
            <label>New password</label>
            <PasswordInput show={showNew} onToggle={() => setShowNew(s => !s)} value={form.newPin} onChange={e => { setForm(f => ({ ...f, newPin: e.target.value })); setError('') }} placeholder="Min. 8 characters" autoComplete="new-password" />
          </div>
          <div className="field"><label>Confirm</label><input type="password" autoComplete="new-password" value={form.confirm} onChange={e => { setForm(f => ({ ...f, confirm: e.target.value })); setError('') }} /></div>
        </div>
        <PasswordStrengthHint password={form.newPin} />
        {error && <div style={{ fontSize: 13, color: 'var(--accent2)', marginBottom: 12 }}>⚠️ {error}</div>}
        <button type="submit" className="btn btn-primary" disabled={saving || !form.current || !form.newPin || !form.confirm}>{saving ? 'Saving…' : 'Update password'}</button>
      </form>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// STAFF PROFILE
// ══════════════════════════════════════════════════════════════
function StaffProfile({ session }) {
  const { toast, pendingProfileTab, setPendingProfileTab, clearSession, sidebarSubTab, setSidebarSubTab } = useAppStore()

  const activeTab = STAFF_PROFILE_TABS.includes(sidebarSubTab) ? sidebarSubTab : 'info'

  useEffect(() => { if (!STAFF_PROFILE_TABS.includes(sidebarSubTab)) setSidebarSubTab('info') }, [])
  useEffect(() => {
    if (pendingProfileTab) {
      setSidebarSubTab(pendingProfileTab)
      setPendingProfileTab(null)
    }
  }, [pendingProfileTab])
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="section-title">Profile</div>
        <HelpPanel screen="profile" />
      </div>
      <ScrollTabs style={{ borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {[
          { key: 'info',      label: '👤 My Profile' },
          { key: 'password',  label: '🔑 Password' },
          { key: 'dashboard', label: '🎛️ Dashboard Icons' },
          { key: 'notifs',    label: '🔔 Notifications' },
          { key: 'team',      label: '🤝 Project Team' },
          { key: 'danger',    label: '⚠️ Delete Account' },
        ].map(t => (
          <button key={t.key} onClick={() => setSidebarSubTab(t.key)}
            style={{ padding: '10px 24px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: activeTab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${activeTab === t.key ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </ScrollTabs>
      {activeTab === 'info'      && <UserProfileForm session={session} toast={toast} />}
      {activeTab === 'password'  && <PasswordChangePanel session={session} toast={toast} />}
      {activeTab === 'dashboard' && <DashboardIconsPanel session={session} />}
      {activeTab === 'notifs'    && <NotificationPrefsPanel userId={session?.userId} role="user" />}
      {activeTab === 'team'      && <TeamMembersPanel session={session} />}
      {activeTab === 'danger'    && <TeamDeleteAccountPanel session={session} toast={toast} />}
    </div>
  )
}

function UserProfileForm({ session, toast }) {
  const { setSession } = useAppStore()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let u = null
    if (session.userId) { const { data } = await sb.from('users').select('*').eq('id', session.userId).maybeSingle(); u = data }
    if (!u) { const { data } = await sb.from('users').select('*').eq('name', session.username).maybeSingle(); u = data }
    setUser(u)
    if (u) setForm({ name: u.name||'', last_name: u.last_name||'', nick_name: u.nick_name||'', email: u.email||'', phone: u.phone||'', degree: u.degree||'', year_semester: u.year_semester||'', supervisor: u.supervisor||'', project_group: u.project_group||'', photo_url: u.photo_url||'', gender: u.gender||'' })
    setLoading(false)
  }

  const isStudent = session?.role === 'lab_user'

  async function saveInfo() {
    setSaving(true)
    const payload = { name: form.name.trim(), last_name: form.last_name||null, nick_name: form.nick_name?.trim()||null, phone: form.phone||null, degree: form.degree||null, year_semester: form.year_semester||null, photo_url: form.photo_url||null, gender: form.gender||null }
    if (!isStudent) { payload.supervisor = form.supervisor||null; payload.project_group = form.project_group||null }
    const { error } = await sb.from('users').update(payload).eq('id', user.id)
    if (error) { toast('Error saving: ' + error.message); setSaving(false); return }
    setSession({ ...session, username: form.nick_name?.trim() || form.name.trim(), photoUrl: form.photo_url||null })
    toast('Profile saved ✓'); setSaving(false); load()
  }

  async function uploadPhoto(file) {
    if (!file?.type.startsWith('image/')) { toast('Please select an image.'); return }
    setUploading(true)
    try {
      const compressed = await new Promise(resolve => {
        const img = new Image(), url = URL.createObjectURL(file)
        img.onload = () => {
          const s = Math.min(1, 400 / Math.max(img.width, img.height))
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(img.width * s); canvas.height = Math.round(img.height * s)
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
          URL.revokeObjectURL(url); canvas.toBlob(resolve, 'image/jpeg', 0.85)
        }
        img.src = url
      })
      const path = `avatars/${user.id}_${Date.now()}.jpg`
      const { error: uploadErr } = await sb.storage.from('project-files').upload(path, compressed, { contentType: 'image/jpeg' })
      if (uploadErr) throw uploadErr
      const photoUrl = sb.storage.from('project-files').getPublicUrl(path).data.publicUrl
      await sb.from('users').update({ photo_url: photoUrl }).eq('id', user.id)
      setForm(f => ({ ...f, photo_url: photoUrl }))
      setUser(u => ({ ...u, photo_url: photoUrl }))
      setSession({ ...session, photoUrl })
      toast('Photo saved ✓')
    } catch (err) { toast('Upload failed: ' + (err?.message || String(err))) }
    setUploading(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (!user) return <div className="empty-state"><div className="empty-icon">👤</div>Profile not found.</div>

  const displayName = form.nick_name?.trim() || [user.name, user.last_name].filter(Boolean).join(' ')
  const previewPhoto = form.photo_url || user.photo_url

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--surface2)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {previewPhoto ? <img src={previewPhoto} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 32, color: 'var(--text3)' }}>👤</span>}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>{displayName || user.name}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ background: 'var(--surface2)', borderRadius: 99, padding: '4px 12px', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{user.role === 'lab_user' ? 'Lab User' : 'Lab Manager'}</span>
            {user.project_group && <span style={{ background: groupBg[user.project_group]||'#f0efe9', color: groupColor[user.project_group]||'#6b6860', borderRadius: 99, padding: '4px 12px', fontSize: 12, fontWeight: 600 }}>{user.project_group}</span>}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="grid-2">
          <div className="field"><label>First Name *</label><input autoComplete="given-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="field"><label>Last Name *</label><input autoComplete="family-name" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} /></div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Nick Name <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 12 }}>(optional)</span></label>
            <input autoComplete="nickname" value={form.nick_name} onChange={e => setForm(f => ({ ...f, nick_name: e.target.value }))} placeholder="e.g. Alex" />
          </div>
          <div className="field">
            <label>Gender <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 12 }}>(sets your avatar when no photo)</span></label>
            <select value={form.gender || ''} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
              <option value="">— Prefer not to say —</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Email</label>
            <input value={form.email} readOnly placeholder="—" style={{ background: 'var(--surface2)', color: 'var(--text3)', cursor: 'default' }} />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Email is managed by your organization admin.</div>
          </div>
          <div className="field"><label>Phone</label><input autoComplete="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
        </div>
        <div className="grid-2">
          <div className="field"><label>Degree</label>
            <select value={form.degree} onChange={e => setForm(f => ({ ...f, degree: e.target.value }))}>
              <option value="">— Select —</option>{DEGREES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="field"><label>Semester &amp; Year Started</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={(form.year_semester||'').split(' ')[0]||''} onChange={e => { const yr = (form.year_semester||'').split(' ')[1]||''; setForm(f => ({ ...f, year_semester: `${e.target.value} ${yr}`.trim() })) }} style={{ flex: 1 }}>
                <option value="">Sem</option>{SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={(form.year_semester||'').split(' ')[1]||''} onChange={e => { const sem = (form.year_semester||'').split(' ')[0]||''; setForm(f => ({ ...f, year_semester: `${sem} ${e.target.value}`.trim() })) }} style={{ flex: 1 }}>
                <option value="">Year</option>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="grid-2">
          <div className="field"><label>Supervisor</label>
            {isStudent
              ? <input value={form.supervisor || '—'} readOnly style={{ background: 'var(--surface2)', color: 'var(--text3)', cursor: 'default' }} />
              : <SupervisorSelect value={form.supervisor} onChange={v => setForm(f => ({ ...f, supervisor: v }))} />}
          </div>
          {session?.organizationId === ICT_ORG_ID && (
            <div className="field"><label>Project Group</label>
              {isStudent
                ? <input value={form.project_group || '—'} readOnly style={{ background: 'var(--surface2)', color: 'var(--text3)', cursor: 'default' }} />
                : <select value={form.project_group} onChange={e => setForm(f => ({ ...f, project_group: e.target.value }))}>
                    <option value="">— Select —</option>{PROJECT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>}
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Profile Photo</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {form.photo_url ? <img src={form.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 28, color: 'var(--text3)' }}>👤</span>}
            </div>
            <div style={{ flex: 1, fontSize: 13, color: 'var(--text3)' }}>Saves automatically after upload.</div>
            {form.photo_url && (
              <button className="btn btn-sm" onClick={async () => {
                await sb.from('users').update({ photo_url: null }).eq('id', user.id)
                setForm(f => ({ ...f, photo_url: '' })); setUser(u => ({ ...u, photo_url: null })); setSession({ ...session, photoUrl: null }); toast('Photo removed.')
              }}>Remove</button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadPhoto(e.target.files[0])} />
          <button className="btn btn-sm btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? '⏳ Uploading…' : '⬆️ Choose photo'}</button>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
          <button className="btn btn-primary" onClick={saveInfo} disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// STUDENT PROFILE
// ══════════════════════════════════════════════════════════════
function UserProfile({ session }) {
  const { toast, pendingProfileTab, setPendingProfileTab, clearSession, sidebarSubTab, setSidebarSubTab } = useAppStore()

  const activeTab = STUDENT_PROFILE_TABS.includes(sidebarSubTab) ? sidebarSubTab : 'info'

  useEffect(() => { if (!STUDENT_PROFILE_TABS.includes(sidebarSubTab)) setSidebarSubTab('info') }, [])
  useEffect(() => {
    if (pendingProfileTab) {
      setSidebarSubTab(pendingProfileTab)
      setPendingProfileTab(null)
    }
  }, [pendingProfileTab])
  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="section-title">My Profile</div>
        <HelpPanel screen="profile" />
      </div>
      <ScrollTabs style={{ borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {[
          { key: 'info',      label: '👤 My Info' },
          { key: 'password',  label: '🔑 Password' },
          { key: 'dashboard', label: '🎛️ Dashboard Icons' },
          { key: 'notifs',    label: '🔔 Notifications' },
          { key: 'team',      label: '🤝 Project Team' },
          { key: 'danger',    label: '⚠️ Delete Account' },
        ].map(t => (
          <button key={t.key} onClick={() => setSidebarSubTab(t.key)}
            style={{ padding: '10px 24px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: activeTab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${activeTab === t.key ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </ScrollTabs>
      {activeTab === 'info'      && <UserProfileForm session={session} toast={toast} />}
      {activeTab === 'password'  && <PasswordChangePanel session={session} toast={toast} />}
      {activeTab === 'dashboard' && <DashboardIconsPanel session={session} />}
      {activeTab === 'notifs'    && <NotificationPrefsPanel userId={session?.userId} role="lab_user" />}
      {activeTab === 'team'      && <TeamMembersPanel session={session} />}
      {activeTab === 'danger'    && <TeamDeleteAccountPanel session={session} toast={toast} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// APPROVAL REQUESTS PANEL — lab manager / org admin view
// ══════════════════════════════════════════════════════════════
export function ApprovalRequestsPanel({ toast, session, onCountChange }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)
  const [orgUsers, setOrgUsers] = useState([])
  // keyed by req.id → selected transfer userId string
  const [transferTo, setTransferTo] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: reqs }, { data: users }] = await Promise.all([
      sb.from('account_deletion_requests')
        .select('*')
        .eq('organization_id', session.organizationId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: true }),
      sb.from('users')
        .select('id, name, role')
        .eq('organization_id', session.organizationId)
        .eq('is_active', true),
    ])
    setRequests(reqs || [])
    onCountChange?.((reqs || []).length)
    // Pre-fill transfer dropdown with user's suggestion
    const defaults = {}
    ;(reqs || []).forEach(r => { if (r.suggested_transfer_to) defaults[r.id] = r.suggested_transfer_to })
    setTransferTo(defaults)
    setOrgUsers(users || [])
    setLoading(false)
  }

  // Transfer all work data (results, training, exams, files) — not personal profile
  async function transferUserData(fromId, toId) {
    const from = String(fromId)
    const to   = String(toId)
    const DATA_TABLES = [
      'training_equipment', 'training_fresh', 'training_golf_car',
      'training_building_alarm', 'equipment_exam_results',
      'equipment_sop_notes', 'equipment_material_progress', 'retraining_requests',
    ]
    await Promise.all([
      ...DATA_TABLES.map(t => sb.from(t).update({ user_id: to }).eq('user_id', from)),
      sb.from('project_results').update({ submitted_by: to }).eq('submitted_by', from),
    ])
  }

  async function exportUserData(userId, userName) {
    try {
      const XLSX = await import('xlsx')
      const uid = String(userId)
      const [
        { data: profile }, { data: trainEq }, { data: trainFresh },
        { data: trainGolf }, { data: trainAlarm }, { data: examResults },
        { data: bookings }, { data: sopNotes }, { data: projResults },
      ] = await Promise.all([
        sb.from('users').select('id, name, last_name, nick_name, email, role, degree, year_semester, supervisor, project_group, created_at').eq('id', userId).maybeSingle(),
        sb.from('training_equipment').select('*').eq('user_id', uid),
        sb.from('training_fresh').select('*').eq('user_id', uid),
        sb.from('training_golf_car').select('*').eq('user_id', uid),
        sb.from('training_building_alarm').select('*').eq('user_id', uid),
        sb.from('equipment_exam_results').select('*').eq('user_id', uid),
        sb.from('equipment_bookings').select('*').eq('user_id', uid),
        sb.from('equipment_sop_notes').select('*').eq('user_id', uid),
        sb.from('project_results').select('*').eq('submitted_by', uid),
      ])
      const wb = XLSX.utils.book_new()
      if (profile) {
        const rows = [['Field', 'Value'],
          ['Name', profile.nick_name?.trim() || [profile.name, profile.last_name].filter(Boolean).join(' ')], ['Email', profile.email], ['Role', profile.role],
          ['Degree', profile.degree], ['Year/Semester', profile.year_semester],
          ['Supervisor', profile.supervisor], ['Project Group', profile.project_group],
          ['Member Since', profile.created_at],
        ]
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Profile')
      }
      const addSheet = (data, name) => { if (data?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), name) }
      addSheet(trainEq,     'Training — Equipment')
      addSheet(trainFresh,  'Training — Fresh')
      addSheet(trainGolf,   'Training — Golf Car')
      addSheet(trainAlarm,  'Training — Alarm')
      addSheet(examResults, 'Exam Results')
      addSheet(bookings,    'Equipment Bookings')
      addSheet(sopNotes,    'SOP Notes')
      addSheet(projResults, 'Project Results')
      if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No data found']]), 'Empty')
      XLSX.writeFile(wb, `${userName.replace(/\s+/g, '_')}_data_archive.xlsx`)
      toast('Export complete ✓')
    } catch (err) {
      toast('Export failed: ' + (err.message || String(err)))
    }
  }

  async function handleApprove(req) {
    setProcessing(req.id)
    try {
      const uid = req.user_id
      const toId = transferTo[req.id]
      if (toId) await transferUserData(uid, toId)
      await sb.from('user_screen_access').delete().eq('user_id', uid)
      await sb.from('user_dashboard_prefs').delete().eq('user_id', uid)
      await sb.from('account_deletion_requests').update({ status: 'approved', reviewed_by: session.userId, reviewed_at: new Date().toISOString() }).eq('id', req.id)
      await sb.from('users').delete().eq('id', uid)
      const toName = toId ? orgUsers.find(u => u.id === toId)?.name : null
      toast(toName ? `${req.user_name}'s data transferred to ${toName} and account deleted.` : `${req.user_name}'s account deleted.`)
      const updated = requests.filter(x => x.id !== req.id)
      setRequests(updated)
      onCountChange?.(updated.length)
    } catch (err) {
      toast('Error: ' + (err.message || String(err)))
    }
    setProcessing(null)
  }

  async function handleDeny(req) {
    setProcessing(req.id)
    try {
      await sb.from('account_deletion_requests').update({ status: 'denied', reviewed_by: session.userId, reviewed_at: new Date().toISOString() }).eq('id', req.id)
      await sb.from('notifications').insert({ user_id: req.user_id, message: 'Your account deletion request has been denied by your lab manager.', type: 'deletion_denied', read: false })
      toast(`${req.user_name}'s deletion request denied.`)
      const updated = requests.filter(x => x.id !== req.id)
      setRequests(updated)
      onCountChange?.(updated.length)
    } catch (err) {
      toast('Error: ' + (err.message || String(err)))
    }
    setProcessing(null)
  }

  const roleLabel = r => r.role === 'admin' ? 'Org Admin' : r.role === 'user' ? 'Lab Manager' : 'Lab User'

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (!requests.length) return <div className="empty-state"><div className="empty-icon">✅</div>No pending approval requests.</div>

  return (
    <div>
      {requests.map((req, idx) => {
        const selectedTo = transferTo[req.id] || ''
        return (
          <div key={req.id} className="card" style={{ marginBottom: 16, background: idx % 2 === 0 ? 'var(--row-a-strong)' : 'var(--row-b-strong)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{req.user_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                  Requested: {new Date(req.requested_at).toLocaleDateString()}
                  {req.suggested_transfer_name && <span style={{ marginLeft: 8, background: '#e0f2fe', color: '#0369a1', borderRadius: 4, padding: '1px 8px', fontWeight: 600 }}>User suggests → {req.suggested_transfer_name}</span>}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => exportUserData(req.user_id, req.user_name)}>⬇️ Export Data</button>
            </div>

            {/* Lab manager transfer preference */}
            <div className="field" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13 }}>Transfer work data &amp; results to (optional)</label>
              <select
                value={selectedTo}
                onChange={e => setTransferTo(t => ({ ...t, [req.id]: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontFamily: 'var(--sans)', fontSize: 14, background: 'var(--surface)', color: 'var(--text1)' }}>
                <option value="">No transfer — delete data</option>
                {orgUsers.filter(u => u.id !== req.user_id).map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({roleLabel(u)})</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Includes training records, exam results, project results, SOP notes, and file references. Personal profile data is always deleted.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm btn-danger" onClick={() => handleApprove(req)} disabled={processing === req.id}>
                {processing === req.id ? 'Processing…' : selectedTo ? 'Approve, Transfer & Delete' : 'Approve & Delete'}
              </button>
              <button className="btn btn-sm" onClick={() => handleDeny(req)} disabled={processing === req.id}>Deny</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN EXPORT — routes by role
// ══════════════════════════════════════════════════════════════

function StorageTab({ toast }) {
  const { session } = useAppStore()
  const [showModal, setShowModal] = useState(false)
  const loginMode = session?.loginMode || localStorage.getItem('ictlab_login_mode') || 'team'
  const isOrgAdmin = loginMode === 'team' && session?.role === 'admin' && session?.userId !== null
  const oauthError = localStorage.getItem('ictlab_oauth_error')

  const modeA = localStorage.getItem('ictlab_solo_mode_a') || 'website_only'
  const modeB = localStorage.getItem('ictlab_solo_mode_b') || 'website_only'
  const orgMode = localStorage.getItem('ictlab_org_storage_mode') || 'website_only'
  const teamBProvider = localStorage.getItem('ictlab_team_b_provider') || null
  const groupStorage = localStorage.getItem('ictlab_group_storage') || 'website'

  const MODE_LABELS = { website_only: 'ICT-Lab Cloud only ⭐', website_plus_copy: 'ICT-Lab Cloud + backup copy', external_only: 'External provider only' }

  function summary() {
    if (loginMode === 'solo') {
      if (modeA === 'website_only' && modeB === 'website_only') return 'All files on ICT-Lab Cloud ⭐'
      return `Core data: ${MODE_LABELS[modeA]} · Activity data: ${MODE_LABELS[modeB]}`
    }
    if (isOrgAdmin) return `Organisation: ${MODE_LABELS[orgMode]}`
    return teamBProvider ? `Personal backup copy active` : 'Following organisation storage setting'
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🗄️ File Storage</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
        {loginMode === 'solo'
          ? 'Choose where your files are stored. ICT-Lab Cloud is always recommended for the best performance. You can optionally connect Google Drive or OneDrive as a backup or alternative.'
          : isOrgAdmin
            ? 'Configure where your organisation\'s files are stored. ICT-Lab Cloud is recommended for the best team experience.'
            : 'Your organisation\'s admin controls primary file storage. You can optionally add a personal backup copy of your activity and workspace data.'}
      </div>

      {oauthError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#b91c1c', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <span>Connection failed: {oauthError}</span>
          <button onClick={() => { localStorage.removeItem('ictlab_oauth_error'); toast('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--surface2)', borderRadius: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Current setting</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{summary()}</div>
          {loginMode === 'solo' && groupStorage !== 'website' && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Group workspace: {groupStorage}</div>
          )}
        </div>
        <button className="btn btn-sm btn-primary" style={{ flexShrink: 0, marginLeft: 12 }} onClick={() => setShowModal(true)}>Configure</button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.7 }}>
        {loginMode === 'solo'
          ? 'Your account details (name, email, login) always stay on ICT-Lab\'s servers regardless of your storage choice.'
          : 'Equipment SOPs, calibration docs, booking records, and other core org files stay on ICT-Lab\'s servers to ensure all team members can access them.'}
      </div>

      {showModal && <StorageProviderModal toast={toast} onClose={() => setShowModal(false)} />}
    </div>
  )
}

export default function Profile() {
  const { session } = useAppStore()
  if (session?.role === 'admin') return <AdminProfile />
  if (session?.role === 'user') return <StaffProfile session={session} />
  if (session?.loginMode === 'solo') return <SoloProfile session={session} />
  return <UserProfile session={session} />
}

// Per-user module access editor — opened from the "Access" button on a
// Lab Manager card (replaces the old Access Control sub-tab)
function AccessModal({ user, toast, session, onClose }) {
  const ALL_SCREENS = [
    { key: 'home',         label: 'Supply Inventory',    icon: '📦', moduleKey: 'supply' },
    { key: 'projects',     label: 'Project Workspace',  icon: '🧪', moduleKey: 'projects' },
    { key: 'training',     label: 'Training Records',    icon: '🎓', moduleKey: 'training' },
    { key: 'equipment',    label: 'Equipment List', icon: '🔧', moduleKey: 'equipment' },
    { key: 'equipmenthub', label: 'Equipment',           icon: '📚', moduleKey: 'equipmenthub' },
    { key: 'booking',      label: 'Reserve Equipment',   icon: '📅', moduleKey: 'booking' },
    { key: 'mileage',      label: 'Mileage Form',        icon: '🚗', moduleKey: 'mileage' },
    { key: 'labsafety',    label: 'Lab Safety',          icon: '🦺', moduleKey: 'labsafety' },
    { key: 'pm',           label: 'Task Board',  icon: '📋', moduleKey: 'pm' },
    { key: 'barcode',      label: 'QR Scan',             icon: '📷', moduleKey: 'barcode' },
    { key: 'profile',      label: 'Profile',             icon: '👤', moduleKey: 'profile' },
    { key: 'barcodeqr',    label: 'QR Labels',             icon: '🔲', moduleKey: 'barcodeqr' },
  ]
  const [access, setAccess] = useState({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [visibleScreens, setVisibleScreens] = useState(ALL_SCREENS)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let pool = null
    if (session?.organizationId) {
      let orgRes = await sb.from('organizations').select('allowed_modules, allowed_modules_labmanagers').eq('id', session.organizationId).maybeSingle()
      if (orgRes?.error) {
        orgRes = await sb.from('organizations').select('allowed_modules').eq('id', session.organizationId).maybeSingle()
      }
      pool = orgRes?.data?.allowed_modules_labmanagers ?? orgRes?.data?.allowed_modules ?? null
    }
    const screens = pool ? ALL_SCREENS.filter(s => pool.includes(s.moduleKey)) : ALL_SCREENS
    setVisibleScreens(screens)
    const { data } = await sb.from('user_screen_access').select('screen_key').eq('user_id', user.id)
    const map = {}
    if (data?.length) { data.forEach(r => { map[r.screen_key] = true }) } else { screens.forEach(s => { map[s.key] = true }) }
    setAccess(map)
    setLoading(false)
  }

  async function saveAccess() {
    setSaving(true)
    await sb.from('user_screen_access').delete().eq('user_id', user.id)
    const rows = Object.entries(access).filter(([, v]) => v).map(([key]) => ({ user_id: user.id, screen_key: key }))
    if (rows.length) await sb.from('user_screen_access').insert(rows)
    toast('Access updated ✓'); setSaving(false)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>🗂️ Module Access — {user.name}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Control which modules this lab manager can see on their dashboard.</div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
              {visibleScreens.map(s => (
                <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1px solid ${access[s.key] ? 'var(--accent)' : 'var(--border)'}`, background: access[s.key] ? 'var(--accent-light)' : 'var(--surface2)', cursor: 'pointer', marginBottom: 0 }}>
                  <input type="checkbox" checked={!!access[s.key]} onChange={e => setAccess(a => ({ ...a, [s.key]: e.target.checked }))} style={{ width: 'auto' }} />
                  <span style={{ fontSize: 16 }}>{s.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: access[s.key] ? 'var(--accent)' : 'var(--text)' }}>{s.label}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={saveAccess} disabled={saving}>{saving ? 'Saving…' : 'Save access'}</button>
              <button className="btn" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function IconImageManager({ toast, session }) {
  const ALL_MODULES = [
    { key: 'supply',         label: 'Supply Inventory',    icon: '📦', bg: '#E1F5EE' },
    { key: 'projects',       label: 'Project Workspace',  icon: '🧪', bg: '#EEEDFE' },
    { key: 'training',       label: 'Training Records',    icon: '🎓', bg: '#e0f2fe' },
    { key: 'equipment',      label: 'Equipment List', icon: '🔧', bg: '#fef3c7' },
    { key: 'equipmenthub',   label: 'Equipment',           icon: '📚', bg: '#E1F5EE' },
    { key: 'booking',        label: 'Reserve Equipment',   icon: '📅', bg: '#e0f2fe' },
    { key: 'mileage',        label: 'Mileage Form',        icon: '🚗', bg: '#fdf0ed' },
    { key: 'labsafety',      label: 'Lab Safety',          icon: '🦺', bg: '#fef3c7' },
    { key: 'profile',        label: 'Profile',             icon: '👤', bg: '#EEEDFE' },
    { key: 'pm',             label: 'Task Board',  icon: '📋', bg: '#fff3e0' },
    { key: 'barcode',        label: 'Barcode Scanner',     icon: '📷', bg: '#e0f7fa' },
    { key: 'labmanagement',  label: 'Lab Management',      icon: '🏛️', bg: '#E1F5EE' },
  ]
  const [images, setImages] = useState({})
  const [uploading, setUploading] = useState(null)
  const fileRefs = useRef({})
  const orgId = session?.organizationId || null
  useEffect(() => { loadImages() }, [])
  async function loadImages() {
    const keys = ALL_MODULES.map(m => `img_${m.key}`)
    const { data } = await sb.from('settings').select('key, value').in('key', keys)
    const map = {}; (data || []).forEach(r => { map[r.key.replace('img_', '')] = r.value })
    if (orgId) {
      const { data: orgData } = await sb.from('organizations').select('module_images').eq('id', orgId).maybeSingle()
      Object.assign(map, orgData?.module_images || {})
    }
    setImages(map)
  }
  async function uploadImage(moduleKey, file) {
    if (!file?.type.startsWith('image/') && !file?.name.toLowerCase().endsWith('.svg')) { toast('Please select an image file.'); return }
    setUploading(moduleKey)
    try {
      const W = 800, H = 500
      const canvas = document.createElement('canvas')
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#111'
      ctx.fillRect(0, 0, W, H)
      const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
      if (isSvg) {
        await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onerror = () => reject(new Error('File read failed'))
          reader.onload = e => {
            const img = new Image()
            img.onerror = () => reject(new Error('Image render failed'))
            img.onload = () => {
              const iw = img.naturalWidth || W, ih = img.naturalHeight || H
              const scale = Math.max(W / iw, H / ih)
              const sw = iw * scale, sh = ih * scale
              ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh)
              resolve()
            }
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(e.target.result)
          }
          reader.readAsText(file)
        })
      } else {
        await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onerror = () => reject(new Error('File read failed'))
          reader.onload = e => {
            const img = new Image()
            img.onerror = () => reject(new Error('Image load failed'))
            img.onload = () => {
              const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight)
              const sw = img.naturalWidth * scale, sh = img.naturalHeight * scale
              ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh)
              resolve()
            }
            img.src = e.target.result
          }
          reader.readAsDataURL(file)
        })
      }
      const compressed = await new Promise((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas export failed')), 'image/jpeg', 0.85)
      )
      const path = `module-icons/${moduleKey}_${Date.now()}.jpg`
      const { error } = await sb.storage.from('project-files').upload(path, compressed, { contentType: 'image/jpeg' })
      if (error) throw error
      const publicUrl = sb.storage.from('project-files').getPublicUrl(path).data.publicUrl
      if (orgId) {
        const { data: orgData } = await sb.from('organizations').select('module_images').eq('id', orgId).maybeSingle()
        const current = orgData?.module_images || {}
        const { data: updated, error: saveErr } = await sb.from('organizations').update({ module_images: { ...current, [moduleKey]: publicUrl } }).eq('id', orgId).select()
        if (saveErr) throw new Error('Save failed: ' + saveErr.message)
        if (!updated?.length) throw new Error('Save failed: org not found (orgId: ' + orgId + ')')
      } else {
        const { error: saveErr } = await sb.from('settings').upsert({ key: `img_${moduleKey}`, value: publicUrl }, { onConflict: 'key' })
        if (saveErr) throw new Error('Save failed: ' + saveErr.message)
      }
      setImages(prev => ({ ...prev, [moduleKey]: publicUrl }))
      toast(`Image updated for ${ALL_MODULES.find(m => m.key === moduleKey)?.label} ✓`)
    } catch (e) { toast('Upload failed: ' + (e?.message || e)) }
    setUploading(null)
  }
  async function removeImage(moduleKey) {
    if (orgId) {
      const { data: orgData } = await sb.from('organizations').select('module_images').eq('id', orgId).maybeSingle()
      const current = { ...(orgData?.module_images || {}) }
      delete current[moduleKey]
      await sb.from('organizations').update({ module_images: Object.keys(current).length ? current : null }).eq('id', orgId)
    } else {
      await sb.from('settings').delete().eq('key', `img_${moduleKey}`)
    }
    setImages(prev => { const n = { ...prev }; delete n[moduleKey]; return n }); toast('Image removed.')
  }
  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🖼️ Dashboard Icon Images</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4, lineHeight: 1.6 }}>Upload a background photo for each dashboard card.</div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>Recommended: 800×500px or wider. JPG, PNG, or WebP.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {ALL_MODULES.map(m => {
          const img = images[m.key]
          return (
            <div key={m.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ height: 130, position: 'relative', background: m.bg, cursor: 'pointer' }} onClick={() => fileRefs.current[m.key]?.click()}>
                {img && <img src={img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                <div style={{ position: 'absolute', inset: 0, background: img ? 'linear-gradient(to top, rgba(0,0,0,0.65) 35%, transparent 100%)' : 'transparent' }} />
                {!img && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: 0.5 }}>{m.icon}</div>}
                {img && <div style={{ position: 'absolute', bottom: 8, left: 10 }}><div style={{ fontSize: 12, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{m.label}</div></div>}
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.25)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0)'}>
                  <div style={{ background: 'rgba(255,255,255,0.92)', borderRadius: 8, padding: '4px 14px', fontSize: 12, fontWeight: 500, color: '#1a1916', pointerEvents: 'none' }}>
                    {uploading === m.key ? '⏳ Uploading…' : '📷 Click to upload'}
                  </div>
                </div>
                <input ref={el => fileRefs.current[m.key] = el} type="file" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) uploadImage(m.key, e.target.files[0]) }} />
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.icon} {m.label}</div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-sm" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => fileRefs.current[m.key]?.click()} disabled={uploading === m.key}>{uploading === m.key ? '⏳' : img ? 'Change' : 'Upload'}</button>
                  {img && <button className="btn btn-sm btn-danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => removeImage(m.key)}>x</button>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
