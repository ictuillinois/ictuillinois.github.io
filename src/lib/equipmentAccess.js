// Which equipment a lab user may see, and where.
//
// The equipment edit form offers one Lab only choice and four lab user areas.
// A lab manager or admin must tick at least one before the form will save:
//
//   Calibration & maintenance  = Lab only. Lab managers and admins see it
//                                everywhere; lab users see it nowhere.
//                                Exclusive with the four areas below.
//   Equipment SOP / Booking calendar / Request training / Exam
//                              = Lab users, in the ticked areas only.
//
// Three states, shown on the button beside Edit:
//   Waiting for decision   nobody has chosen yet (new and imported items, and
//                          every item that predates this). Stays VISIBLE to
//                          lab users, as before — hiding undecided items would
//                          empty every lab user's list until someone had
//                          gone through them all.
//   Lab only / Lab users   decided.
//
// Columns on equipment_inventory, written together by accessPatch():
//   lab_user_decided       BOOLEAN  FALSE = Waiting for decision
//   lab_user_access        BOOLEAN  FALSE = Lab only
//   lab_user_hidden_areas  TEXT[]   the unticked lab user areas — stored as
//                                    hidden, so an area added later defaults
//                                    to visible
//
// Managers and admins are never filtered. Applied to LISTS only: lookups that
// resolve a name for an existing booking or training record stay unfiltered,
// or that record would lose its label.

export const LAB_ONLY_KEY = 'maintenance'
export const LAB_ONLY_OPTION = { key: LAB_ONLY_KEY, label: 'Calibration & maintenance', icon: 'Lab only — lab managers and admins' }

export const LAB_USER_AREAS = [
  { key: 'sop',      label: 'Equipment SOP',    icon: 'Equipment SOP' },
  { key: 'booking',  label: 'Booking calendar', icon: 'Reserve Equipment' },
  // Unticked (with another area ticked) = no training needed: booking stops
  // asking a lab user for a training record.
  { key: 'training', label: 'Request training', icon: 'Training Records' },
  { key: 'exam',     label: 'Exam',             icon: 'Training Records' },
]
export const ALL_AREA_KEYS = LAB_USER_AREAS.map(a => a.key)

export function isLabUserSession(session) {
  return session?.loginMode !== 'solo' && session?.role === 'lab_user'
}

// Can a lab user see this equipment? With `area`, in that area specifically.
export function labUserCan(eq, area) {
  if (eq?.lab_user_access === false) return false
  return !area || !(eq?.lab_user_hidden_areas || []).includes(area)
}

// What the edit form shows ticked: [] while waiting, [LAB_ONLY_KEY] for Lab
// only, otherwise the visible lab user areas.
export function tickedOptions(eq) {
  if (!eq?.lab_user_decided) return []
  if (eq.lab_user_access === false) return [LAB_ONLY_KEY]
  return ALL_AREA_KEYS.filter(k => labUserCan(eq, k))
}

// All three columns for a set of ticked options — the only way they are
// written. Callers must not pass an empty set; that is not a decision.
export function accessPatch(ticked) {
  if ((ticked || []).includes(LAB_ONLY_KEY)) {
    return { lab_user_decided: true, lab_user_access: false, lab_user_hidden_areas: ALL_AREA_KEYS }
  }
  const on = ALL_AREA_KEYS.filter(k => (ticked || []).includes(k))
  return { lab_user_decided: true, lab_user_access: true, lab_user_hidden_areas: ALL_AREA_KEYS.filter(k => !on.includes(k)) }
}

// 'waiting' | 'lab_only' | 'lab_users'
export function accessState(eq) {
  if (!eq?.lab_user_decided) return 'waiting'
  return eq.lab_user_access === false ? 'lab_only' : 'lab_users'
}
export const ACCESS_LABEL = { waiting: 'Waiting for decision', lab_only: 'Lab only', lab_users: 'Lab users' }

// Narrow an equipment_inventory query to what a lab user may see (in `area`,
// if given); unchanged for everyone else. hidden_areas is NOT NULL DEFAULT
// '{}' — a NULL would make `not.cs` evaluate to NULL and silently drop the row.
export function forLabUsers(query, session, area) {
  if (!isLabUserSession(session)) return query
  const q = query.eq('lab_user_access', true)
  return area ? q.not('lab_user_hidden_areas', 'cs', `{${area}}`) : q
}

// For lists a manager fills in ON BEHALF of a lab user (assigning training).
export function labUserEquipment(list, area) {
  return (list || []).filter(e => labUserCan(e, area))
}

// No training is needed only when lab users have the item with Request
// training unticked. A Lab only item keeps its training rules for the
// managers who book it.
export function requiresTraining(eq) {
  return eq?.lab_user_access === false || !(eq?.lab_user_hidden_areas || []).includes('training')
}
