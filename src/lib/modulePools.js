// The module-visibility hierarchy, in one place.
//
//   1. Super admin   settings.app_allowed_modules            global default
//                    organizations.allowed_modules           per-org grant
//   2. Org admin     organizations.allowed_modules_labusers  role pools
//                    organizations.allowed_modules_labmanagers
//   3. Lab manager   user_dashboard_prefs.allowed_modules    per lab user
//   4. The user      user_dashboard_prefs.active_modules     their own picks
//
// Each layer NARROWS the one above it, so nobody can grant themselves more
// than the layer above allowed. There is exactly one documented exception:
// a per-org grant REPLACES the global pool rather than intersecting it, so an
// org's own pool is authoritative for that org (CLAUDE.md rule 9).
//
// `null` at any layer means "no restriction here". These are pure functions —
// every screen must compose pools through them rather than inlining its own
// rule, which is how the dashboard and the picker came to disagree about
// whether a per-user assignment could exceed the org pool.

const nonEmpty = a => (Array.isArray(a) && a.length ? a : null)

/**
 * Layers 1–2: what the organisation may use.
 * Role pool wins over the outer org grant; the org grant REPLACES the global
 * pool (not an intersection). Returns an array, or null for unrestricted.
 */
export function orgCapabilityPool({ appPool, orgOuterPool, orgRolePool } = {}) {
  const org = nonEmpty(orgRolePool) ?? nonEmpty(orgOuterPool)
  return org ?? nonEmpty(appPool)
}

/**
 * Layers 1–3: what this particular user may use.
 * A lab manager's per-user assignment narrows the org pool — it can never
 * introduce a module the org admin did not grant.
 */
export function capabilityPool({ appPool, orgOuterPool, orgRolePool, perUserPool } = {}) {
  const org = orgCapabilityPool({ appPool, orgOuterPool, orgRolePool })
  const perUser = nonEmpty(perUserPool)
  if (!perUser) return org
  return org ? perUser.filter(k => org.includes(k)) : perUser
}

/**
 * Layer 4: what the user actually sees, given their own selection.
 * `pinned` keys (profile, and Lab Management for staff) always survive — they
 * are force-shown by the dashboard regardless of any pool, so filtering them
 * out here would make the picker disagree with the screen.
 * Order follows the user's selection, then any pinned keys they hadn't picked.
 */
export function visibleModules({ pool, activeModules, pinned = [] } = {}) {
  const allowed = k => !pool || pool.includes(k) || pinned.includes(k)
  if (!Array.isArray(activeModules)) {
    // No saved selection: everything the pool allows, pinned included.
    return pool ? [...new Set([...pool, ...pinned])] : null
  }
  const picked = activeModules.filter(allowed)
  return [...new Set([...picked, ...pinned.filter(k => !picked.includes(k))])]
}

/**
 * Picks the layer-2 pool that applies to a role, falling back to the outer
 * per-org grant. `orgRow` is a row from `organizations`.
 * Duplicated inline in three screens before this existed.
 */
export function orgPoolForRole(role, orgRow) {
  if (!orgRow) return null
  if (role === 'lab_user') return orgRow.allowed_modules_labusers ?? orgRow.allowed_modules
  if (role === 'user')     return orgRow.allowed_modules_labmanagers ?? orgRow.allowed_modules
  return orgRow.allowed_modules
}
