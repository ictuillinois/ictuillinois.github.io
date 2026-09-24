// Lab User Quiz — the knowledge check behind Step 3.
//
// Transcribed from "Lab_User_Quiz_9-22-26.docx", correct answers taken from
// that document's own ANSWER KEY. Same engine as Step 1's check
// (safetyExam.js): one question per screen, options ordered per user, per
// attempt and per academic year, and a pass closes it for good.
//
// Three question shapes appear here that Step 1 did not have:
//   `multi`   — select all that apply, scored as the EXACT set
//   `boolean` — True/False
//   five options rather than four
//
// `pinLast` holds "All of the above" at the bottom. Shuffled into first place
// it refers to nothing.

// 90% of 13 questions. ceil(13 * 0.9) = 12, so exactly one miss is allowed.
// A ratio here rather than a count because the rule really is a percentage —
// scoreQuiz takes either, treating a value at or below 1 as a ratio.
export const STEP3_QUIZ_PASS_COUNT = 0.9

export const STEP3_QUIZ_QUESTIONS = [
  {
    id: 'hazard-first-step',
    type: 'single',
    question: 'What is the first step when assessing a hazard?',
    options: {
      a: 'Prepare for emergencies',
      b: 'Assess the risks',
      c: 'Recognize the hazards',
      d: 'Mitigate the risks',
    },
    correct: 'c',
  },
  {
    id: 'last-control',
    type: 'single',
    question: 'What is the last control used to minimize risks from hazards?',
    options: {
      a: 'Elimination',
      b: 'Administrative controls',
      c: 'PPE',
      d: 'Engineering controls',
      e: 'Substitution',
    },
    correct: 'c',
  },
  {
    id: 'ict-lab-policies',
    type: 'single',
    question: 'Which of the following are ICT laboratory policies?',
    options: {
      a: 'No one is allowed to work in the labs alone.',
      b: 'Headphones and earbuds are not allowed to be worn in lab spaces.',
      c: 'Safety shoes are required to be worn when working in the labs.',
      d: 'No food or drinks are allowed in the labs.',
      e: 'All of the above.',
    },
    correct: 'e',
    pinLast: 'e',
  },
  {
    id: 'chemical-hazard-source',
    type: 'single',
    question: 'Which of the following is the best source of information for assessing the hazards of a chemical?',
    options: {
      a: 'Standard Operating Procedure (SOP) / Equipment SOP',
      b: 'Another lab user',
      c: 'AASHTO test method',
      d: 'Safety Data Sheet (SDS)',
    },
    correct: 'd',
  },
  {
    id: 'engineering-controls',
    type: 'multi',
    question: 'Select the engineering controls (select all that apply):',
    options: {
      a: 'Safety glasses',
      b: 'Fume hood',
      c: 'Standard Operating Procedures (SOP)',
      d: 'Solvent storage cabinet',
      e: 'Lab coat',
    },
    correct: ['b', 'd'],
  },
  {
    id: 'golf-cart',
    type: 'single',
    question: 'Choose the requirements for use of the ICT golf cart:',
    options: {
      a: 'Complete campus unlicensed motorized vehicle form',
      b: 'Complete departmental driver approval form',
      c: 'Complete golf cart training with research engineers',
      d: 'All of the above',
    },
    correct: 'd',
    pinLast: 'd',
  },
  {
    id: 'weekend-alone',
    type: 'boolean',
    question: 'When working on a Saturday, Sunday, or holiday, it is OK if I am the only person at the lab.',
    options: { a: 'True', b: 'False' },
    correct: 'b',
  },
  {
    id: 'ppe-short-visit',
    type: 'boolean',
    question: 'I do not need to wear PPE (glasses, safety shoes, etc.) if I am working for less than 15 minutes in the lab.',
    options: { a: 'True', b: 'False' },
    correct: 'b',
  },
  {
    id: 'leave-tools-out',
    type: 'boolean',
    question: 'It is OK to leave my tools and samples in a work space until the next time I am working in the lab.',
    options: { a: 'True', b: 'False' },
    correct: 'b',
  },
  {
    id: 'report-broken-tools',
    type: 'boolean',
    question: 'It is important to report broken or non-working tools and equipment to the research engineers.',
    options: { a: 'True', b: 'False' },
    correct: 'a',
  },
  {
    id: 'booking-required',
    type: 'boolean',
    question: 'Equipment use must be booked in the ICT-Lab software to avoid conflicts and so the research engineers can monitor maintenance.',
    options: { a: 'True', b: 'False' },
    correct: 'a',
  },
  {
    id: 'ghs-classification',
    type: 'single',
    question: 'Which of the following is the primary chemical category system used to standardize chemical safety worldwide?',
    options: {
      a: 'EPA classification system',
      b: 'Globally harmonized system of classification and labeling (GHS)',
      c: 'ICT global system',
      d: 'All of the above',
    },
    correct: 'b',
    pinLast: 'd',
  },
  {
    id: 'item-breaks',
    type: 'single',
    question: 'If an item breaks when I am using it, I should:',
    options: {
      a: 'Immediately put it in the trash',
      b: 'Hide it on a shelf',
      c: 'Report this to a research engineer',
      d: 'Do nothing and move on',
    },
    correct: 'c',
  },
]
