// Which equipment a lab user may see.
//
// equipment_inventory.lab_user_access (default TRUE) is the "Lab user access"
// tick box in the equipment form. Unticked = lab-only equipment: lab managers
// and admins still see it everywhere (they maintain and calibrate it), but it
// is left out of every list a lab user browses, books or trains from.
//
// Applied to LISTS only. Lookups that resolve a name for an existing booking
// or training record stay unfiltered, or that record would lose its label.

export function isLabUserSession(session) {
  return session?.loginMode !== 'solo' && session?.role === 'lab_user'
}

// Narrow an equipment_inventory query for a lab user; unchanged for everyone else.
export function forLabUsers(query, session) {
  return isLabUserSession(session) ? query.eq('lab_user_access', true) : query
}

// For lists a manager fills in ON BEHALF of a lab user (assigning training):
// lab-only equipment is not something a lab user can be trained on.
export function labUserEquipment(list) {
  return (list || []).filter(e => e.lab_user_access !== false)
}
