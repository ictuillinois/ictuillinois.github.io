import { useState } from 'react'
import { sb } from '../../lib/supabase'
import { passwordError } from '../../lib/passwordPolicy'

// Where a password-reset link lands.
//
// Supabase puts a recovery token in the URL fragment and the client library
// exchanges it for a session before this renders — so by the time someone is
// here they are signed in, and setting a password is just updateUser. That is
// also why this must be shown INSTEAD of the app: a recovery session is a real
// session, and without this screen the link would silently sign them in with a
// password they still do not know.

export default function ResetPassword({ onDone }) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  async function save() {
    setError(null)
    const perr = passwordError(pw)
    if (perr) { setError(perr); return }
    if (pw !== confirm) { setError('The two passwords do not match.'); return }
    setSaving(true)
    const { error: err } = await sb.auth.updateUser({ password: pw })
    if (err) { setError(err.message); setSaving(false); return }
    // must_change_password would otherwise send them straight back into the
    // forced-change screen having just chosen a password.
    const { data: { user } } = await sb.auth.getUser()
    if (user?.id) {
      await sb.from('users').update({ must_change_password: false }).eq('auth_id', user.id)
    }
    setSaving(false)
    setDone(true)
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', padding: 20, background: 'var(--bg)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: 28 }}>
        {done ? (
          <>
            <div style={{ fontSize: 34, textAlign: 'center', marginBottom: 10 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 17, textAlign: 'center', marginBottom: 8 }}>Password updated</div>
            <div style={{ fontSize: 13.5, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.6, marginBottom: 20 }}>
              You are signed in. Use this password next time.
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={onDone}>Continue</button>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Choose a new password</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 18 }}>
              This link signed you in. Set a password and you will use it from now on.
            </div>
            <div className="field">
              <label>New password</label>
              <input type={show ? 'text' : 'password'} value={pw} autoComplete="new-password"
                onChange={e => setPw(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input type={show ? 'text' : 'password'} value={confirm} autoComplete="new-password"
                onChange={e => setConfirm(e.target.value)} />
            </div>
            <button type="button" onClick={() => setShow(s => !s)}
              style={{ border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5,
                       fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 14 }}>
              {show ? 'Hide password' : 'Show password'}
            </button>
            {error && (
              <div style={{ fontSize: 13, color: '#c84b2f', marginBottom: 12, lineHeight: 1.5 }}>⚠️ {error}</div>
            )}
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={saving || !pw || !confirm} onClick={save}>
              {saving ? 'Saving…' : 'Set password'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
