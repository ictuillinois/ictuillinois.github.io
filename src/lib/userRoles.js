import { sb } from './supabase'

// A role is a `users` ROW, not a field on one.
//
// Login fetches every active row matching the email and offers a picker when
// there is more than one, back-filling auth_id across all of them. So someone
// who is both an org admin and a lab manager has two rows sharing an email —
// and giving them that second role means inserting a row, not rewriting one.
//
// This file is the only place that turns "which roles should this person have"
// into rows, so the super admin panel and the org admin's lab manager list
// cannot drift apart on what a role change means.

export const ROLE_LABELS = { admin: 'Org Admin', user: 'Lab Manager', lab_user: 'Lab User' }
export const ROLE_ORDER  = ['admin', 'user', 'lab_user']

// Every row for this email, active or not. Inactive ones matter: re-selecting
// a role should revive the row that already exists rather than stack a second
// one beside it.
export async function rowsForEmail(email) {
  const e = (email || '').trim().toLowerCase()
  if (!e) return { rows: [], error: null }
  const { data, error } = await sb.from('users')
    .select('id, role, is_active, organization_id').ilike('email', e)
  return { rows: data || [], error }
}

export async function activeRolesForEmail(email) {
  const { rows, error } = await rowsForEmail(email)
  if (error) return { roles: [], error }
  return { roles: [...new Set(rows.filter(r => r.is_active !== false).map(r => r.role))], error: null }
}

// Make the rows match `roles`.
//
// Deselecting DEACTIVATES rather than deletes: a users row is referenced by
// tasks, bookings, training records and notifications, and deleting it to undo
// a mis-click would take that history with it. Deactivating is reversible by
// re-ticking the box.
export async function syncUserRoles({ email, roles, template, orgId }) {
  const e = (email || '').trim().toLowerCase()
  if (!e) return { error: 'This person needs an email address — roles are linked by email.' }

  const want = ROLE_ORDER.filter(r => roles.includes(r))
  // Never leave someone with no active row: they would vanish from every list
  // and be unable to sign in, with nothing saying why.
  if (!want.length) return { error: 'Select at least one role.' }

  const { rows, error: readErr } = await rowsForEmail(e)
  if (readErr) return { error: 'Could not read existing roles: ' + readErr.message }

  const added = [], removed = []

  for (const role of want) {
    const active   = rows.find(r => r.role === role && r.is_active !== false)
    if (active) continue
    const dormant  = rows.find(r => r.role === role && r.is_active === false)
    if (dormant) {
      const { error } = await sb.from('users').update({ is_active: true }).eq('id', dormant.id)
      if (error) return { error: `Could not restore ${ROLE_LABELS[role]}: ${error.message}` }
      added.push(role)
      continue
    }
    // No password on the new row — authentication happens once against
    // Supabase Auth for the email; the rows only decide what that login can be.
    const { error } = await sb.from('users').insert({
      name: template?.name || null,
      last_name: template?.last_name || null,
      nick_name: template?.nick_name || null,
      email: e,
      phone: template?.phone || null,
      auth_id: template?.auth_id || null,
      organization_id: orgId || template?.organization_id || null,
      role,
      admin_level: role === 'admin' ? 1 : 0,
      is_active: true,
      must_change_password: false,
      photo_url: template?.photo_url || null,
      avatar: template?.avatar || null,
    })
    if (error) return { error: `Could not add ${ROLE_LABELS[role]}: ${error.message}` }
    added.push(role)
  }

  for (const row of rows) {
    if (row.is_active === false || want.includes(row.role)) continue
    const { error } = await sb.from('users').update({ is_active: false }).eq('id', row.id)
    if (error) return { error: `Could not remove ${ROLE_LABELS[row.role]}: ${error.message}` }
    removed.push(row.role)
  }

  return { added, removed, error: null }
}

export function describeRoleChange({ added = [], removed = [] }) {
  const bits = []
  if (added.length)   bits.push(`added ${added.map(r => ROLE_LABELS[r]).join(', ')}`)
  if (removed.length) bits.push(`removed ${removed.map(r => ROLE_LABELS[r]).join(', ')}`)
  return bits.length ? bits.join(' · ') : 'no role changes'
}
