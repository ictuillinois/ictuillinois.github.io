// Which equipment a lab user may see, and where.
//
// Two columns on equipment_inventory, both set in the equipment edit form:
//
//   lab_user_access        BOOLEAN  master switch — the "Lab users / Lab only"
//                                    button beside Edit. FALSE = lab managers
//                                    and admins only (maintenance/calibration
//                                    items); hidden from lab users everywhere.
//   lab_user_hidden_areas  TEXT[]   with access on, the areas it is still kept
//                                    out of. Stored as HIDDEN rather than
//                                    allowed so an area added later defaults
//                                    to visible, and so flipping the master
//                                    switch off and on keeps the choices.
//
// Managers and admins are never filtered. Applied to LISTS only: lookups that
// resolve a name for an existing booking or training record stay unfiltered,
// or that record would lose its label.

export const LAB_USER_AREAS = [
  { key: 'list',        label: 'Equipment list',            icon: 'Equipment & Maintenance' },
  { key: 'maintenance', label: 'Calibration & maintenance', icon: 'Equipment & Maintenance' },
  { key: 'sop',         label: 'Equipment SOP',             icon: 'Equipment SOP' },
  { key: 'booking',     label: 'Booking calendar',          icon: 'Reserve Equipment' },
  // Unticked = no training needed: booking stops asking for a training record.
  { key: 'training',    label: 'Request training',          icon: 'Training Records' },
  { key: 'exam',        label: 'Exam',                      icon: 'Training Records' },
]

export function isLabUserSession(session) {
  return session?.loginMode !== 'solo' && session?.role === 'lab_user'
}

// Can a lab user see this equipment in `area`?
export function labUserCan(eq, area) {
  return eq?.lab_user_access !== false && !(eq?.lab_user_hidden_areas || []).includes(area)
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

// Training is required unless the Request training area is unticked. Applies
// to everyone booking: equipment that needs no training has nothing to retrain.
export function requiresTraining(eq) {
  return !(eq?.lab_user_hidden_areas || []).includes('training')
}
