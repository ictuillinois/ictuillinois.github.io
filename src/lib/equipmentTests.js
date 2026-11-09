// Several tests on one instrument (Nov 2026). A machine can run more than one
// standard test — TA - DHR runs DSR (T 315) and MSCR (T 350) — and each test
// has its own SOP and its own exam (equipment_tests; equipment_sop.test_id,
// equipment_exam_questions.test_id, equipment_exam_results.test_id).
//
// A machine with no tests works as before: its SOP and questions have
// test_id NULL, shown as one "General" entry. Every rule about which exams a
// lab user owes lives here — never compose it inline.
import { sb } from './supabase'

export const GENERAL = 'general'
export const groupKey = testId => testId || GENERAL
export const testLabel = t => (!t || t === GENERAL) ? 'General' : [t.standard, t.name].filter(Boolean).join(' · ')

// Tests for one instrument (id) or several (array); all the org's when omitted.
// Missing table (SQL not run yet) reads as "no tests", so screens keep working.
export async function loadTests(equipmentIds) {
  let q = sb.from('equipment_tests').select('*').order('order_num').order('created_at')
  if (Array.isArray(equipmentIds)) q = q.in('equipment_id', equipmentIds)
  else if (equipmentIds) q = q.eq('equipment_id', equipmentIds)
  const { data, error } = await q
  return error ? [] : (data || [])
}

// What a machine shows as pills: its tests, plus "General" when it has no
// tests or still holds content (SOP / questions) not tied to a test.
export function testEntries(tests, hasGeneralContent) {
  if (!tests?.length) return [GENERAL]
  return [...(hasGeneralContent ? [GENERAL] : []), ...tests]
}
export const entryKey = e => e === GENERAL ? GENERAL : e.id

// equipment_id → Set of group keys that have exam questions. Falls back to
// equipment_id alone before the test_id column exists.
export async function loadExamGroups(equipmentIds) {
  const run = cols => {
    let q = sb.from('equipment_exam_questions').select(cols)
    if (Array.isArray(equipmentIds)) q = q.in('equipment_id', equipmentIds)
    else if (equipmentIds) q = q.eq('equipment_id', equipmentIds)
    return q
  }
  let { data, error } = await run('equipment_id, test_id')
  if (error) ({ data } = await run('equipment_id'))
  const map = new Map()
  for (const r of data || []) {
    if (!map.has(r.equipment_id)) map.set(r.equipment_id, new Set())
    map.get(r.equipment_id).add(groupKey(r.test_id))
  }
  return map
}

// Group keys a person has passed on one instrument, from exam result rows.
export function passedKeys(results, userId, equipmentId) {
  return new Set((results || [])
    .filter(r => r.passed && String(r.user_id) === String(userId) && r.equipment_id === equipmentId)
    .map(r => groupKey(r.test_id)))
}

// Which exams a lab user still owes before their training can be confirmed.
// Rule (Nov 2026): the exams of the tests they ASKED FOR (testIds, from the
// request / training session). Nothing named — a one-test machine, or a
// request made before tests existed — means any one passed exam counts, as
// it always did. groups = keys with questions on the machine.
// state: 'none' (nothing to pass) | 'passed' | 'waiting'; owed = keys left.
export function examStatus({ groups, testIds, passed }) {
  if (!groups?.size) return { state: 'none', owed: [] }
  const asked = (testIds || []).filter(id => groups.has(id))
  if (testIds?.length && !asked.length) return { state: 'none', owed: [] }
  if (!asked.length) return passed?.size ? { state: 'passed', owed: [] } : { state: 'waiting', owed: [...groups] }
  const owed = asked.filter(k => !passed?.has(k))
  return { state: owed.length ? 'waiting' : 'passed', owed }
}

// "AASHTO T 315 · DSR and AASHTO T 350 · MSCR" for messages.
export function namesOf(keys, tests) {
  const names = (keys || []).map(k => {
    if (k === GENERAL) return 'General'
    const t = (tests || []).find(x => x.id === k)
    return t ? testLabel(t) : null
  }).filter(Boolean)
  return names.length <= 1 ? (names[0] || '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
