import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { sb } from '../../lib/supabase'
import { IconEye, IconEyeOff } from '../../components/Icons'

export default function AdminLogin() {
  const { setSession } = useAppStore()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [show, setShow]         = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) { setError('Enter your email and password.'); return }
    setLoading(true); setError('')

    const { data: authData, error: authError } = await sb.auth.signInWithPassword({
      email: email.trim().toLowerCase(), password,
    })
    if (authError) { setError('Incorrect email or password.'); setLoading(false); return }

    const { data: saRow } = await sb.from('settings').select('value').eq('key', 'super_admin_auth_id').maybeSingle()
    if (saRow?.value !== authData.user.id) {
      await sb.auth.signOut()
      setError('This account does not have super admin access.')
      setLoading(false); return
    }

    setSession({ role: 'admin', username: 'Admin', userId: null, adminLevel: 3, loginMode: 'team' })
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>Admin Access</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>InteleLab — Restricted area</div>
        </div>
        <div className="card" style={{ padding: '28px 28px 24px' }}>
          <form onSubmit={handleLogin}>
            <div className="field">
              <label>Admin email</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="admin@example.com"
                autoComplete="email"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{ paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShow(s => !s)} title={show ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, display: 'flex', alignItems: 'center' }}>
                  {show ? <IconEyeOff size={17} /> : <IconEye size={17} />}
                </button>
              </div>
            </div>
            {error && (
              <div style={{ fontSize: 13, color: 'var(--accent2)', background: 'var(--accent2-light)', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>⚠️ {error}</div>
            )}
            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '12px', background: loading ? 'var(--border)' : '#1a237e', color: loading ? 'var(--text3)' : '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Verifying…' : 'Sign in as Admin'}
            </button>
          </form>
        </div>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text3)' }}>
          <a href="../" style={{ color: 'var(--accent)', textDecoration: 'none' }}>← Back to ICT-Lab</a>
        </div>
      </div>
    </div>
  )
}
