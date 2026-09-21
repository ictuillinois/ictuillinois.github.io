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
      b: 'Enter your four-digit code and press "One" within 60 seconds.',
      c: 'Enter your four-digit code and press "Two" within 60 seconds.',
      d: 'Call a Research Engineer to disarm the system remotely.',
    },
    correct: 'b',
    explanation: 'When you enter the building and hear the beeping, you have exactly 60 seconds to enter your unique four-digit code followed by the number "One" to disarm the security alarm. Pressing "Two" is for arming the system when you are the last to leave.',
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

// Score a set of answers. Returns everything the UI and the DB row need, so
// the pass rule lives in exactly one place.
export function scoreSafetyExam(answers) {
  const total = SAFETY_EXAM_QUESTIONS.length
  const score = SAFETY_EXAM_QUESTIONS.reduce(
    (n, q) => n + (answers[q.id] === q.correct ? 1 : 0), 0)
  return {
    score,
    total,
    // Ceil, so the threshold can never be met by rounding down a near miss.
    needed: Math.ceil(total * SAFETY_EXAM_PASS_RATIO),
    passed: score >= Math.ceil(total * SAFETY_EXAM_PASS_RATIO),
    percent: Math.round((score / total) * 100),
  }
}
