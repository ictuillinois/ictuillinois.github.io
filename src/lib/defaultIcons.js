import { sb } from './supabase'

// Apply an organisation's configured default icons to a newly created user.
//
// Replaces the icon picker that used to pop up after every lab user was
// created. That prompt pre-ticked the whole org pool and asked the manager to
// confirm it — which is the same answer every time, and made the org-level
// default setting look like it did nothing.
//
// Widening a single user's icons afterwards is a different job and belongs
// where it already lives: Lab Management → the icon box on that user.

const PREFERENCE_ORDER = {
  lab_user: ['lab_user_default_modules', 'allowed_modules_labusers', 'allowed_modules'],
  user:     ['allowed_modules_labmanagers', 'allowed_modules'],
  admin:    ['allowed_modules'],
}

export async function applyDefaultIcons(userId, orgId, role = 'lab_user') {
  if (!userId || !orgId) return { applied: null }

  const { data: org, error } = await sb.from('organizations')
    .select('lab_user_default_modules, allowed_modules_labusers, allowed_modules_labmanagers, allowed_modules')
    .eq('id', orgId).maybeSingle()
  if (error) { console.warn('[defaultIcons] org lookup failed:', error.message); return { applied: null } }

  // First non-empty wins. An empty list is not "grant nothing" — it means that
  // level was never configured, so fall through to the next.
  let modules = null
  for (const col of (PREFERENCE_ORDER[role] || PREFERENCE_ORDER.lab_user)) {
    if (org?.[col]?.length) { modules = org[col]; break }
  }

  // Nothing configured anywhere: write no row at all and let the pool resolver
  // decide at render time. Writing an empty active_modules would pin them to
  // an empty dashboard, which is worse than having no preference saved.
  if (!modules?.length) return { applied: null }

  const active = ['profile', ...modules.filter(k => k !== 'profile')]

  // Fetch-then-write rather than upsert: user_dashboard_prefs has no unique
  // index on user_id, so onConflict would be rejected — and duplicate rows
  // already exist for some users, which is why this consolidates to one.
  const { data: rows } = await sb.from('user_dashboard_prefs').select('id').eq('user_id', userId)
  const existing = rows || []
  if (existing.length) {
    const [keep, ...extra] = existing.map(r => r.id)
    const { error: upErr } = await sb.from('user_dashboard_prefs')
      .update({ active_modules: active, has_set_dashboard: false }).eq('id', keep)
    if (upErr) { console.warn('[defaultIcons] update failed:', upErr.message); return { applied: null } }
    if (extra.length) await sb.from('user_dashboard_prefs').delete().in('id', extra)
  } else {
    // has_set_dashboard stays false: these are defaults the org chose, not a
    // choice this person made. It flips true the first time they pick for
    // themselves.
    const { error: insErr } = await sb.from('user_dashboard_prefs')
      .insert({ user_id: userId, active_modules: active, has_set_dashboard: false })
    if (insErr) { console.warn('[defaultIcons] insert failed:', insErr.message); return { applied: null } }
  }
  return { applied: active }
}
