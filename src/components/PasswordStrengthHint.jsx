import { PASSWORD_RULES } from '../lib/passwordPolicy'

// Live checklist driven by the shared policy in lib/passwordPolicy.js —
// single source of truth mirrored to the Supabase Auth password settings.
export function PasswordStrengthHint({ password }) {
  if (!password) return null
  return (
    <div style={{ marginTop: 6, marginBottom: 2, padding: '8px 10px', background: 'var(--bg2, #f5f5f5)', borderRadius: 8 }}>
      {PASSWORD_RULES.map(r => {
        const ok = r.test(password)
        return (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: ok ? '#1D9E75' : '#999', marginBottom: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{ok ? '✓' : '○'}</span>
            {r.label[0].toUpperCase() + r.label.slice(1)}
          </div>
        )
      })}
    </div>
  )
}
