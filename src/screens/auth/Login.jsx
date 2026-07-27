import { useAppStore } from '../../store/useAppStore'
import { sb } from '../../lib/supabase'
import { useState, useEffect, useRef } from 'react'
import CustomerServiceModal from '../../components/CustomerServiceModal'
import { IconAlert, IconEye, IconEyeOff, IconInfo, IconMail } from '../../components/Icons'
import LoginBackground from '../../components/LoginBackground'

export default function Login() {
  const { setSession } = useAppStore()
  const [identifier, setIdentifier] = useState(() => localStorage.getItem('ictlab_remembered_email') || '')
  const [keepSignedIn, setKeepSignedIn] = useState(() => localStorage.getItem('ictlab_keep_signed_in') !== 'false')
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [failCount, setFailCount]   = useState(0)
  const [lockUntil, setLockUntil]   = useState(0)
  const [showHelpLookup, setShowHelpLookup] = useState(false)
  const [helpEmail, setHelpEmail]   = useState('')
  const [helpResult, setHelpResult] = useState(null)
  const [helpLoading, setHelpLoading] = useState(false)
  const [showContact, setShowContact] = useState(false)
  const lockTimerRef = useRef(null)

  useEffect(() => {
    if (lockUntil <= Date.now()) return
    lockTimerRef.current = setInterval(() => {
      const remaining = Math.ceil((lockUntil - Date.now()) / 1000)
      if (remaining <= 0) { clearInterval(lockTimerRef.current); setError('') }
      else setError(`Too many failed attempts. Please wait ${remaining} second${remaining !== 1 ? 's' : ''}.`)
    }, 500)
    return () => clearInterval(lockTimerRef.current)
  }, [lockUntil])

  async function findOrgContact() {
    if (!helpEmail.trim()) return
    setHelpLoading(true); setHelpResult(null)
    const { data: user } = await sb.from('users').select('organization_id').ilike('email', helpEmail.trim()).maybeSingle()
    let org = null
    if (user?.organization_id) {
      const { data } = await sb.from('organizations').select('name, contact_name, contact_email').eq('id', user.organization_id).maybeSingle()
      org = data
    }
    setHelpResult(org || { noContact: true })
    setHelpLoading(false)
  }

  async function handleLogin(e) {
    e.preventDefault()
    if (lockUntil > Date.now()) return
    if (!identifier.trim() || !password.trim()) { setError('Please enter your email and password.'); return }
    localStorage.setItem('ictlab_keep_signed_in', String(keepSignedIn))
    if (keepSignedIn) localStorage.setItem('ictlab_remembered_email', identifier.trim())
    else localStorage.removeItem('ictlab_remembered_email')
    setLoading(true); setError('')
    const emailLower = identifier.trim().toLowerCase()

    const { data: authData, error: authError } = await sb.auth.signInWithPassword({ email: emailLower, password })
    if (authError) {
      const newCount = failCount + 1
      setFailCount(newCount)
      if (newCount >= 3) { setLockUntil(Date.now() + 30_000); setError('Too many failed attempts. Please wait 30 seconds.') }
      else setError('Incorrect email or password.')
      setLoading(false); return
    }
    setFailCount(0); setLockUntil(0)
    const authUserId = authData.user.id

    // Super admin check
    const { data: saRow } = await sb.from('settings').select('value').eq('key', 'super_admin_auth_id').maybeSingle()
    if (saRow?.value === authUserId) {
      setSession({ role: 'admin', username: 'Admin', userId: null, adminLevel: 3, loginMode: 'team' })
      setLoading(false); return
    }

    // Team user
    let user = null
    const { data: byAuthId } = await sb.from('users').select('*').eq('auth_id', authUserId).eq('is_active', true).maybeSingle()
    if (byAuthId) {
      user = byAuthId
    } else {
      const { data: byEmail } = await sb.from('users').select('*').ilike('email', emailLower).is('auth_id', null).eq('is_active', true).maybeSingle()
      if (byEmail) {
        await sb.from('users').update({ auth_id: authUserId }).eq('id', byEmail.id)
        user = { ...byEmail, auth_id: authUserId }
      }
    }
    if (!user) { await sb.auth.signOut(); setError('No account found. Contact your organization admin.'); setLoading(false); return }

    const adminLevel = user.admin_level || 0
    const role = user.role === 'admin' || adminLevel >= 1 ? 'admin' : user.role
    setSession({
      role, dbRole: user.role,
      username: user.nick_name?.trim() || user.name,
      userId: user.id, email: user.email,
      adminLevel, photoUrl: user.photo_url, avatar: user.avatar,
      loginMode: 'team',
      organizationId: user.organization_id || null,
      projectGroup: user.project_group || null,
      mustChangePassword: user.must_change_password === true,
      termsAcceptedVersion: user.terms_accepted_version || null,
    })
    setLoading(false)
  }

  return (
    <>
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', background: 'var(--bg)', padding: '8px 20px 8px' }}>
      <LoginBackground />
      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>

        <div style={{ textAlign: 'center', marginBottom: -40 }}>
          <img src={`${import.meta.env.BASE_URL}ict-logo.png`} alt="ICT-Lab"
            style={{ width: 200, objectFit: 'contain', display: 'block', margin: '0 auto' }} />
        </div>

        <div className="card" style={{ padding: '28px 28px 12px' }}>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>ICT-Lab Sign In</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>Access is managed by your organization admin</div>
          </div>

          <form onSubmit={handleLogin}>
            <div className="field">
              <label>Email address</label>
              <input type="text" value={identifier}
                onChange={e => { setIdentifier(e.target.value); setError('') }}
                placeholder="your@email.com"
                autoComplete="username" />
            </div>
            <div className="field">
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="••••••••" autoComplete="current-password"
                  style={{ paddingRight: 44 }} />
                <button type="button" onClick={() => setShowPassword(s => !s)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, display: 'flex', alignItems: 'center' }}>
                  {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </button>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer', fontSize: 13, color: 'var(--text2)', userSelect: 'none' }}>
              <input type="checkbox" checked={keepSignedIn} onChange={e => setKeepSignedIn(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#1D9E75', cursor: 'pointer', flexShrink: 0 }} />
              Keep me signed in on this device
            </label>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--accent2)', background: 'var(--accent2-light)', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
                <IconAlert size={16} /> {error}
              </div>
            )}

            <button type="submit"
              style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '12px', background: lockUntil <= Date.now() ? '#1D9E75' : 'var(--border)', color: lockUntil <= Date.now() ? '#fff' : 'var(--text3)', border: 'none', borderRadius: 8, cursor: lockUntil <= Date.now() ? 'pointer' : 'not-allowed', fontWeight: 600, transition: 'background 0.2s' }}
              disabled={loading || lockUntil > Date.now()}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'var(--text3)' }}>
              <a href="/privacy/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text3)', textDecoration: 'underline' }}>Privacy Policy</a>
              <span style={{ margin: '0 6px' }}>·</span>
              <a href="/terms/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text3)', textDecoration: 'underline' }}>Terms of Service</a>
            </div>
          </form>

          <div style={{ marginTop: 16 }}>
            <button type="button" onClick={() => { setShowHelpLookup(v => !v); setHelpResult(null); setHelpEmail('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text3)', padding: 0, width: '100%', textAlign: 'center' }}>
              {showHelpLookup ? '▲ Hide' : 'Need help logging in? Find your org contact →'}
            </button>
            {showHelpLookup && (
              <div style={{ marginTop: 12, background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Enter your email to find your organization's contact</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="email" value={helpEmail} onChange={e => { setHelpEmail(e.target.value); setHelpResult(null) }}
                    onKeyDown={e => e.key === 'Enter' && findOrgContact()} placeholder="your@email.com" style={{ flex: 1, fontSize: 13 }} />
                  <button type="button" onClick={findOrgContact} disabled={helpLoading || !helpEmail.trim()}
                    style={{ padding: '8px 14px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    {helpLoading ? '…' : 'Look up'}
                  </button>
                </div>
                {helpResult && (
                  <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: helpResult.noContact || !helpResult.contact_email ? 'var(--surface)' : '#E1F5EE', border: '1px solid var(--border)' }}>
                    {helpResult.noContact || !helpResult.contact_email ? (
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                        {helpResult.noContact ? 'No organization contact found for that email. Please reach out to your lab manager directly.' : `Your organization is ${helpResult.name}, but no contact email is configured yet.`}
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 11, color: '#085041', marginBottom: 4 }}>Organization: <strong>{helpResult.name}</strong></div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#085041' }}>Contact: {helpResult.contact_name || 'Lab Manager'}</div>
                        <a href={`mailto:${helpResult.contact_email}`} style={{ fontSize: 13, color: '#1D9E75', fontWeight: 500, display: 'block', marginTop: 2 }}>{helpResult.contact_email}</a>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--text3)', lineHeight: 1.8 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text2)' }}>ICT-Lab</div>
          <div>Integrated Lab Management Platform</div>
          <div>© {new Date().getFullYear()} All rights reserved</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16, paddingBottom: 8 }}>
          <button onClick={() => setShowContact(true)}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 16px', fontSize: 12, color: 'var(--text2)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconMail size={15} /> Contact Us
          </button>
        </div>
      </div>
    </div>
    {showContact && <CustomerServiceModal onClose={() => setShowContact(false)} />}
    </>
  )
}
