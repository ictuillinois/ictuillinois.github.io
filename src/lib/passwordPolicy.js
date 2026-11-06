// Mirrors the Supabase Auth password policy (Dashboard → Authentication →
// Passwords): lower + upper + digit + symbol, min 6 chars. Validating here
// gives a readable message BEFORE auth rejects with its wall-of-characters
// error. If the dashboard policy changes, update these rules to match.
export const PASSWORD_RULES = [
  { test: p => (p || '').length >= 6,     label: 'at least 6 characters' },
  { test: p => /[a-z]/.test(p || ''),     label: 'a lowercase letter' },
  { test: p => /[A-Z]/.test(p || ''),     label: 'an uppercase letter' },
  { test: p => /[0-9]/.test(p || ''),     label: 'a number' },
  { test: p => /[^a-zA-Z0-9]/.test(p || ''), label: 'a symbol (e.g. ! @ # $)' },
]

// Returns null when valid, otherwise a human-readable message
export function passwordError(p) {
  const missing = PASSWORD_RULES.filter(r => !r.test(p)).map(r => r.label)
  return missing.length ? `Password needs ${missing.join(', ')}.` : null
}

export const PASSWORD_HINT = 'e.g. Lab2026! — needs upper & lower case, a number and a symbol'

// Leaked-password check (Nov 2026). Supabase's own "Prevent use of leaked
// passwords" is Pro-plan only, so the app asks Have I Been Pwned itself, the
// same service Supabase uses. k-anonymity: only the first 5 hex characters of
// the password's SHA-1 leave the browser; the full match is done here, so the
// password (and its full hash) is never sent anywhere. Padding hides how many
// real matches came back. FAILS OPEN — offline or a slow service must never
// stop someone setting a password; the rules above still apply.
export async function breachedPasswordError(p) {
  try {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(p || ''))
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' }, signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const suffix = hex.slice(5)
    const line = (await res.text()).split('\n').map(l => l.trim()).find(l => l.split(':')[0] === suffix)
    const seen = line ? parseInt(line.split(':')[1], 10) || 0 : 0
    return seen > 0
      ? `This password has appeared in data breaches (${seen.toLocaleString()} times), so it is easy to guess. Choose a different one.`
      : null
  } catch { return null }
}
