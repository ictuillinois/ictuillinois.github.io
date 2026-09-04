import { useAppStore } from '../../store/useAppStore'
import { sb } from '../../lib/supabase'
import { useState, useEffect, useRef } from 'react'
import CustomerServiceModal from '../../components/CustomerServiceModal'
import { IconAlert, IconEye, IconEyeOff, IconMail } from '../../components/Icons'

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
  const [showContact, setShowContact] = useState(false)
  // Shown only when a user has multiple roles — never for single-role accounts
  const [accountPicker, setAccountPicker] = useState(null) // { rows, orgsMap }
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

  function applySession(user) {
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

    // Fetch settings + all active users rows for this email in parallel
    const [{ data: settings }, { data: emailRows }] = await Promise.all([
      sb.from('settings').select('key, value').in('key', ['super_admin_auth_id', 'admin_email']),
      sb.from('users').select('*').ilike('email', emailLower).eq('is_active', true),
    ])
    const cfg = Object.fromEntries((settings || []).map(r => [r.key, r.value]))

    // Link any rows that are missing an auth_id
    const toLink = (emailRows || []).filter(u => !u.auth_id)
    if (toLink.length) {
      await sb.from('users').update({ auth_id: authUserId }).in('id', toLink.map(u => u.id))
    }

    const userRows = emailRows || []

    // Check if this login is also the super admin
    const isSuperAdmin =
      cfg.super_admin_auth_id === authUserId ||
      cfg.admin_email?.toLowerCase() === emailLower

    // Build final options list — super admin synthetic entry + user rows
    const superAdminEntry = isSuperAdmin
      ? [{ __superAdmin: true, name: 'Super Admin', role: '__super_admin' }]
      : []
    const allOptions = [...superAdminEntry, ...userRows]

    if (allOptions.length === 0) {
      await sb.auth.signOut()
      setError('No account found. Contact your organization admin.')
      setLoading(false); return
    }

    if (allOptions.length === 1) {
      // Single option — log in directly, no picker
      if (allOptions[0].__superAdmin) {
        setSession({ role: 'admin', username: 'Admin', userId: null, adminLevel: 3, loginMode: 'team' })
      } else {
        applySession(allOptions[0])
      }
      setLoading(false); return
    }

    // Multiple options — show picker
    const orgIds = [...new Set(userRows.map(u => u.organization_id).filter(Boolean))]
    const { data: orgsData } = orgIds.length
      ? await sb.from('organizations').select('id, name').in('id', orgIds)
      : { data: [] }
    const orgsMap = Object.fromEntries((orgsData || []).map(o => [o.id, o.name]))
    setAccountPicker({ rows: allOptions, orgsMap })
    setLoading(false)
  }

  const ROLE_META = {
    __super_admin: { label: 'Super Admin', bg: '#FEE2E2', color: '#991B1B' },
    admin:         { label: 'Org Admin',   bg: '#FEF3C7', color: '#92400E' },
    user:          { label: 'Lab Manager', bg: '#E1F5EE', color: '#065F46' },
    lab_user:      { label: 'Lab User',    bg: '#EDE9FE', color: '#5B21B6' },
  }

  return (
    <>
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        <div className="card" style={{ padding: '28px 28px 12px' }}>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <img src={`${import.meta.env.BASE_URL}ict-logo.png`} alt="ICT-Lab"
              style={{ width: 160, objectFit: 'contain', display: 'block', margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>ICT-Lab Sign In</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>Access is managed by your organization admin</div>
          </div>

          {accountPicker ? (
            /* Role picker — only shown for multi-role accounts */
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Select account</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>This email has multiple roles. Which would you like to sign in with?</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {accountPicker.rows.map(u => {
                  const meta = ROLE_META[u.role] || { label: u.role, bg: '#f0f0f0', color: '#555' }
                  const orgName = accountPicker.orgsMap[u.organization_id] || ''
                  return (
                    <button key={u.__superAdmin ? '__sa' : u.id}
                      onClick={() => u.__superAdmin
                        ? setSession({ role: 'admin', username: 'Admin', userId: null, adminLevel: 3, loginMode: 'team' })
                        : applySession(u)}
                      style={{ padding: '12px 14px', border: '1.5px solid var(--border)', borderRadius: 10, background: 'var(--surface)', cursor: 'pointer', textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{u.name}</div>
                        {orgName && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{orgName}</div>}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: meta.bg, color: meta.color, flexShrink: 0 }}>{meta.label}</span>
                    </button>
                  )
                })}
              </div>
              <button type="button" onClick={() => setAccountPicker(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text3)', padding: 0, width: '100%', textAlign: 'center' }}>
                ← Back to sign in
              </button>
            </div>
          ) : (
            /* Standard login form — shown to everyone */
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
                <a href="/terms/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text3)', textDecoration: 'underline' }}>Terms of Service</a>
              </div>
            </form>
          )}

          <div style={{ marginTop: 16 }}>
            <button type="button" onClick={() => setShowHelpLookup(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text3)', padding: 0, width: '100%', textAlign: 'center' }}>
              {showHelpLookup ? '▲ Hide' : 'Need help logging in? →'}
            </button>
            {showHelpLookup && (
              <div style={{ marginTop: 12, background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>Contact the ICT-Lab team for access assistance:</div>
                <a href="mailto:ictengineers@mx.uillinois.edu"
                  style={{ fontSize: 13, fontWeight: 600, color: '#1D9E75', textDecoration: 'none' }}>
                  ictengineers@mx.uillinois.edu
                </a>
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
