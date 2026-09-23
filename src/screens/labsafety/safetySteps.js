// The safety steps a lab user can be required to complete, and who must do
// which.
//
// Lives in its own file so Layout can ask "is this user still locked?" without
// importing the whole Safety screen, and so the step list exists in exactly
// one place. Layout previously hardcoded [1, 2, 3, 4] — a number left over
// from the retired four-step layout. With only three steps here, step 4 could
// never be completed, so every lab user stayed locked out of every module
// except Profile, permanently, with nothing reporting it.

export const SAFETY_STEPS = [
  { number: 1, label: 'Step 1 — Building safety video & knowledge check' },
  { number: 2, label: 'Step 2 — Laboratory Safety Guide & DRS training' },
  { number: 3, label: 'Step 3 — Lab safety videos & acknowledgement' },
]

export const ALL_SAFETY_STEP_NUMBERS = SAFETY_STEPS.map(s => s.number)

// Which steps THIS user must complete.
//
// null / undefined / empty means all of them. That default matters: a lab user
// created before this column existed, or by a manager who did not think about
// it, must end up with the strictest setting rather than the loosest. An empty
// array meaning "none required" would silently let someone skip safety
// training entirely.
export function requiredSafetySteps(value) {
  if (!Array.isArray(value) || value.length === 0) return ALL_SAFETY_STEP_NUMBERS
  const valid = value
    .map(Number)
    .filter(n => ALL_SAFETY_STEP_NUMBERS.includes(n))
  return valid.length ? valid.sort((a, b) => a - b) : ALL_SAFETY_STEP_NUMBERS
}

// True once every step this user is required to do has been approved.
export function safetyComplete(required, completedStepNumbers) {
  const done = new Set(completedStepNumbers)
  return requiredSafetySteps(required).every(n => done.has(n))
}
