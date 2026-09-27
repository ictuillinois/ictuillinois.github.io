// Which equipment a lab user may see, and where.
//
// The equipment edit form lists the areas below; a lab manager or admin ticks
// where lab users meet the item. Nothing ticked = Lab only: lab managers and
// admins still see it everywhere (they maintain and calibrate it), lab users
// see it nowhere.
//
// Stored on equipment_inventory as two columns, written together by
// accessPatch() so they never disagree:
//   lab_user_access        BOOLEAN  FALSE = nothing ticked (Lab only)
//   lab_user_hidden_areas  TEXT[]   the unticked areas
// HIDDEN rather than allowed, so an area added later defaults to visible.
// Rows written before the area list existed have access FALSE with nothing
// hidden; labUserCan() reads access first, so those read as Lab only.
//
// Managers and admins are never filtered. Applied to LISTS only: lookups that
// resolve a name for an existing booking or training record stay unfiltered,
// or that record would lose its label.

export const LAB_USER_AREAS = [
  // Covers the whole Equipment & Maintenance icon: its equipment list as well
  // as the calibration and maintenance tabs.
  { key: 'maintenance', label: 'Calibration & maintenance', short: 'Calibration', icon: 'Equipment & Maintenance' },
  { key: 'sop',         label: 'Equipment SOP',             short: 'SOP',         icon: 'Equipment SOP' },
  { key: 'booking',     label: 'Booking calendar',          short: 'Booking',     icon: 'Reserve Equipment' },
  // Unticked (with anything else ticked) = no training needed: booking stops
  // asking a lab user for a training record.
  { key: 'training',    label: 'Request training',          short: 'Training',    icon: 'Training Records' },
  { key: 'exam',        label: 'Exam',                      short: 'Exam',        icon: 'Training Records' },
]
export const ALL_AREA_KEYS = LAB_USER_AREAS.map(a => a.key)

export function isLabUserSession(session) {
  return session?.loginMode !== 'solo' && session?.role === 'lab_user'
}

// Can a lab user see this equipment in `area`?
export function labUserCan(eq, area) {
  return eq?.lab_user_access !== false && !(eq?.lab_user_hidden_areas || []).includes(area)
}

// The ticked areas for this item, in LAB_USER_AREAS order.
export function visibleAreas(eq) {
  return ALL_AREA_KEYS.filter(k => labUserCan(eq, k))
}

// Both columns for a set of ticked areas — the only way they are written.
export function accessPatch(visible) {
  const on = ALL_AREA_KEYS.filter(k => (visible || []).includes(k))
  return {
    lab_user_access: on.length > 0,
    lab_user_hidden_areas: ALL_AREA_KEYS.filter(k => !on.includes(k)),
  }
}

// Row badge: Lab only / the one area's short name / Partial / Lab users.
export function accessLabel(eq) {
  const on = visibleAreas(eq)
  if (on.length === 0) return 'Lab only'
  if (on.length === ALL_AREA_KEYS.length) return 'Lab users'
  if (on.length === 1) return LAB_USER_AREAS.find(a => a.key === on[0]).short
  return 'Partial'
}

// Narrow an equipment_inventory query to what a lab user may see in `area`;
// unchanged for everyone else. The column is NOT NULL DEFAULT '{}' — a NULL
// would make `not.cs` evaluate to NULL and silently drop the row.
export function forLabUsers(query, session, area) {
  if (!isLabUserSession(session)) return query
  return query.eq('lab_user_access', true).not('lab_user_hidden_areas', 'cs', `{${area}}`)
}

// For lists a manager fills in ON BEHALF of a lab user (assigning training).
export function labUserEquipment(list, area) {
  return (list || []).filter(e => labUserCan(e, area))
}

// No training is needed only when lab users have the item with Request
// training unticked. A Lab only item keeps its training rules for the
// managers who book it — nothing ticked is not the same as "no training".
export function requiresTraining(eq) {
  return eq?.lab_user_access === false || !(eq?.lab_user_hidden_areas || []).includes('training')
}
