import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { sb } from '../lib/supabase'
import { PasswordStrengthHint } from './PasswordStrengthHint'
import { passwordError } from '../lib/passwordPolicy'
import { IconKey, IconEye, IconEyeOff } from './Icons'

export default function ForcePasswordChange() {
  const { session, setSession, clearSession, toast } = useAppStore()
  const [next, setNext]         = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showNext, setShowNext] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const perr = passwordError(next)
    if (perr)             { setError(perr); return }
    if (next !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)

    const { error: updateErr } = await sb.auth.updateUser({ password: next })
    if (updateErr) { setError(updateErr.message || 'Failed to update password. Try again.'); setLoading(false); return }

    await sb.from('users').update({ must_change_password: false }).eq('id', session.userId)

    const updated = { ...session, mustChangePassword: false }
    setSession(updated)
    localStorage.setItem('ictlab_session', JSON.stringify(updated))
    toast('Password updated successfully.')
    setLoading(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'var(--surface)', borderRadius: 16, padding: 32, boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button type="button" onClick={clearSession}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text3)', padding: '2px 4px' }}>
            Sign out
          </button>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ marginBottom: 8, color: 'var(--accent)' }}><IconKey size={36} /></div>
          <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>Set your new password</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
            Your admin set a temporary password. You must change it before you can use the app.<br/>
            Needs upper &amp; lower case, a number and a symbol.
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>New password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showNext ? 'text' : 'password'}
                value={next}
                onChange={e => { setNext(e.target.value); setError('') }}
                placeholder="••••••••"
                autoComplete="new-password"
                style={{ paddingRight: 44 }}
                autoFocus
              />
              <button type="button" onClick={() => setShowNext(s => !s)} title={showNext ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, display: 'flex', alignItems: 'center' }}>
                {showNext ? <IconEyeOff size={17} /> : <IconEye size={17} />}
              </button>
            </div>
            <PasswordStrengthHint password={next} />
          </div>

          <div className="field">
            <label>Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError('') }}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: 'var(--accent2)', background: 'var(--accent2-light)', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
              ⚠️ {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: 12,
            background: loading ? 'var(--border)' : '#1D9E75',
            color: loading ? 'var(--text3)' : '#fff',
            border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 15,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? 'Saving…' : 'Set new password & continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
