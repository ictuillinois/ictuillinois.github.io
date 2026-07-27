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
