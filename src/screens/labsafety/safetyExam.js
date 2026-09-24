// Building Safety knowledge check — the questions behind Step 1.
//
// Transcribed from "Building safety knowledge check.docx". Each correct answer
// is the one the source document's own explanation argues for, and that
// explanation is shown after submitting so a wrong answer teaches rather than
// just scores.
//
// Kept in code rather than in equipment_exam_questions: these are fixed safety
// content tied to one video, not a per-equipment bank a manager curates, and
// that table's rows hang off an equipment_id this exam has none of.

export const SAFETY_EXAM_PASS_RATIO = 0.9

// NOTE ON THE THRESHOLD: with five questions the only reachable scores are
// 0/20/40/60/80/100%. 4 correct is 80% and fails, so 90% is arithmetically the
// same rule as "all five correct". That is deliberate and was flagged — if a
// miss should be survivable, either add questions or drop the ratio to 0.8.

export const SAFETY_EXAM_QUESTIONS = [
  {
    id: 'alarm-disarm',
    question: 'When arriving at the ICT main building and hearing the alarm beeping, what is the correct procedure to disarm the system?',
    options: {
      a: 'Press "One" immediately, then enter your four-digit code.',
      b: 'Enter your four-digit code and press "One" within 15 seconds.',
      c: 'Enter your four-digit code and press "Two" within 15 seconds.',
      d: 'Call a Research Engineer to disarm the system remotely.',
    },
    correct: 'b',
    explanation: 'When you enter the building and hear the beeping, you have exactly 15 seconds to enter your unique four-digit code followed by the number "One" to disarm the security alarm. Pressing "Two" is for arming the system when you are the last to leave.',
  },
  {
    id: 'fire-first-action',
    question: 'If you discover a fire in the building, which of the following should be your very first action?',
    options: {
      a: 'Locate a fire extinguisher and begin the P.A.S.S. method.',
      b: 'Pull the fire alarm to alert everyone in the building.',
      c: 'Call 911 to report the fire.',
      d: 'Check for toxic smoke and find an escape route.',
    },
    correct: 'b',
    explanation: 'In any fire emergency, the absolute first priority is notification. By pulling the fire alarm first, you ensure that every occupant in the facility is alerted to evacuate immediately. Calling 911 and deciding whether to fight the fire should only happen after the building-wide alert has been activated.',
  },
  {
    id: 'pass-acronym',
    question: 'When using a dry chemical fire extinguisher, what does the "A" in the P.A.S.S. acronym stand for?',
    options: {
      a: 'Aim at the top of the flames to smother them.',
      b: 'Activate the trigger to release the agent.',
      c: 'Aim at the base of the fire.',
      d: 'Assess the size of the fire before engaging.',
    },
    correct: 'c',
    explanation: 'P.A.S.S. is Pull the pin, Aim at the base of the fire, Squeeze the trigger, Sweep side to side. Aiming at the base hits the fuel source rather than the smoke or flames, which is the most effective way to put the fire out. Stay 8 to 10 feet away while doing it.',
  },
  {
    id: 'tornado-shelters',
    question: 'During a Tornado Warning, where are the three designated shelter areas located within the ICT facility?',
    options: {
      a: 'The kitchen, the student offices, and the main hallway.',
      b: 'Any room with no windows or the Materials Processing Facility.',
      c: 'The janitorial closet, the IT server room, or the Highbay A tool room.',
      d: 'The nearest exterior ditch or your personal vehicle.',
    },
    correct: 'c',
    explanation: 'ICT has three specific designated shelter areas: the janitorial closet, the server room (both across from the student offices), and the Highbay A tool room. These rooms are typically locked, but Research Engineers will unlock them when severe weather is imminent.',
  },
  {
    id: 'tornado-posture',
    question: 'Once you are inside a designated tornado shelter, what is the recommended physical posture to protect yourself from flying debris?',
    options: {
      a: 'Stand against the interior wall with your arms crossed.',
      b: 'Sit low, keep your head down, and lock your hands over your head.',
      c: 'Lay flat on your back and look toward the ceiling.',
      d: 'Stay near the door to monitor the weather conditions outside.',
    },
    correct: 'b',
    explanation: 'If a tornado strikes, flying debris is the primary hazard. Sitting low and locking your hands over your head protects your skull and vital organs. Covering yourself with something heavy like a coat adds protection against shattered glass or dust.',
  },
]

// Is one answer right? Handles all three question shapes:
//   single / boolean — one key
//   multi            — the EXACT set, no partial credit. "Select all that
//                      apply" with credit for a subset would pass someone who
//                      ticked one of two engineering controls and missed the
//                      other, which is the part that matters.
export function isCorrect(q, given) {
  if (Array.isArray(q.correct)) {
    const got = Array.isArray(given) ? given : []
    return got.length === q.correct.length && q.correct.every(k => got.includes(k))
  }
  return given === q.correct
}

// Has this question been answered at all? `[]` is truthy, so a multi-select
// with nothing ticked would otherwise count as answered and let someone submit
// a blank one.
export function isAnswered(q, given) {
  return q.type === 'multi' ? Array.isArray(given) && given.length > 0 : !!given
}

// Score a bank of questions. Returns everything the UI and the DB row need, so
// the pass rule lives in exactly one place.
export function scoreQuiz(questions, answers, passRatio = SAFETY_EXAM_PASS_RATIO) {
  const total = questions.length
  const score = questions.reduce((n, q) => n + (isCorrect(q, answers[q.id]) ? 1 : 0), 0)
  // Ceil, so the threshold can never be met by rounding down a near miss.
  const needed = Math.ceil(total * passRatio)
  return { score, total, needed, passed: score >= needed, percent: Math.round((score / total) * 100) }
}

// Step 1's bank, kept as its own export so its call sites do not change.
export function scoreSafetyExam(answers) {
  return scoreQuiz(SAFETY_EXAM_QUESTIONS, answers)
}

// ── Per-user option order ───────────────────────────────────────────────────
//
// Every lab user sees the same four options in a different order, so "the
// answer is B, B, C, C, B" is worthless passed between them. The order is
// derived from the user's id, which means it is stable for that person across
// reloads and retakes — a shuffle that changed on every render would move an
// option out from under the click that selected it.
//
// The ANSWER STORED IS ALWAYS THE ORIGINAL KEY (a/b/c/d), never the displayed
// position, so scoring and any stored answers stay meaningful no matter how
// the options were arranged on screen.

function hash32(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// mulberry32 — small, fast, and deterministic for a given seed.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Which academic year we are in. August starts a new one, so a fall retake
// always lands in a different year from the previous fall's.
//
// This is in the seed because ICT-Lab wipes lab_safety_progress each fall for
// the annual retake — which resets exam_attempts to 0. Seeding on the attempt
// number alone would therefore hand every returning user the exact order they
// saw the first time, a year of memory later.
export function academicYear(now = new Date()) {
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

// Returns the original option keys in the order this user should see them.
//
// The order changes per user, per attempt, and per academic year. It is stable
// WITHIN an attempt: callers pass a fixed `attempt`, and the panel memoises on
// it, so options never move under a click that is choosing one.
// Works for any option count — four, five, or the two of a True/False. The
// shuffle applies there too: with two options it only halves the benefit of
// sharing positions, but it costs nothing and the rule stays one rule.
export function optionOrderFor(question, userId, attempt = 0, year = academicYear()) {
  const keys = Object.keys(question.options)
  if (!userId) return keys

  // "All of the above" has to stay at the bottom. Shuffled into first place it
  // refers to nothing, and a question that reads as nonsense is a worse
  // problem than a memorised option order.
  const pinned = question.pinLast ? [question.pinLast].flat() : []
  const movable = keys.filter(k => !pinned.includes(k))

  const next = rng(hash32(`${userId}:${question.id}:${year}:${attempt}`))
  const out = [...movable]
  for (let i = out.length - 1; i > 0; i--) {         // Fisher-Yates
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return [...out, ...pinned]
}
