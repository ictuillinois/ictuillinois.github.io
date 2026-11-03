// Exam questions from a Word / PDF / text file — no AI, nothing leaves the
// browser (Nov 2026). Replaced "Extract questions with AI", which called
// Anthropic from the browser and never worked (no key; .docx read as text).
//
// parseExamLines() is pure (lines in, questions out) so it can be tested
// directly. Accepted layout, as the upload box describes it:
//   1. Question text            (also "Q1." / "1)" / Word auto-numbering)
//   A. option  B. option ...    (also "a)" / "(A)" / Word auto-lettering)
//   ☐ True  ☐ False             (a True / False question)
// The correct answer can be given any of these ways:
//   "Answer: B" under the question · an "Answer Key" section at the end
//   ("1. Answer: B" or "1. B") · ✓ / * / "(correct)" on the option ·
//   the option in bold (Word) · a ticked box ☑ / ☒ (True / False).

const Q_RE      = /^(?:q(?:uestion)?\s*)?(\d{1,3})\s*[.)]\s*(.+)$/i
const OPT_RE    = /^\(?([a-d])[.)]\s*(.+)$/i
const TF_RE     = /^([\u2610\u2611\u2612\u25a1\u25a0\u2713\u2714]?)\s*(true|false)\s*([\u2713\u2714*]?)\s*$/i
const ANS_RE    = /^(?:correct\s+)?(?:answer|ans)\s*[:.\-–]\s*([a-d]|true|false)\b/i
const KEY_HEAD  = /^answer\s*key\b|^answers\s*$/i
const KEY_LINE  = /^(\d{1,3})\s*[.)]\s*(?:(?:correct\s+)?(?:answer|ans)\s*[:.\-–]?\s*)?([a-d]|true|false)\b/i
const MARK_RE   = /\s*(?:\(correct\)|\[correct\]|[\u2713\u2714]|\*)\s*$|^\s*\*\s*/i
const TYPE_TAG  = /^\((?:multiple\s*choice|true\s*\/?\s*false|t\s*\/\s*f|mcq?)\)\s*/i

const letterOf = v => {
  const s = String(v).toLowerCase()
  return s === 'true' ? 'a' : s === 'false' ? 'b' : s
}

/**
 * @param {{ text: string, bold?: boolean, auto?: 'q' | 'opt' }[] | string[]} input
 * @returns {{ questions: object[], warnings: string[] }}
 */
export function parseExamLines(input) {
  const lines = input.map(l => (typeof l === 'string' ? { text: l } : l))
    .map(l => ({ ...l, text: (l.text || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim() }))
    .filter(l => l.text)

  const questions = []
  const key = {}
  let cur = null
  let inKey = false
  let autoQ = 0

  const close = () => { if (cur) questions.push(cur); cur = null }
  const addOption = (letter, text, marked) => {
    if (!cur) return
    cur[`option_${letter}`] = text
    if (marked && !cur.correct_answer) cur.correct_answer = letter
  }

  for (const line of lines) {
    const t = line.text
    if (KEY_HEAD.test(t)) { close(); inKey = true; continue }
    if (inKey) {
      const k = t.match(KEY_LINE)
      if (k) key[Number(k[1])] = letterOf(k[2])
      continue   // explanations under each key line are not needed
    }

    // a new question: "1. …" or a Word auto-numbered top-level paragraph
    const q = line.auto === 'q' ? [null, String(++autoQ), t] : t.match(Q_RE)
    if (q && !(cur && OPT_RE.test(t) && line.auto !== 'q')) {
      close()
      if (line.auto !== 'q') autoQ = Number(q[1])
      cur = { num: Number(q[1]), question: q[2].replace(TYPE_TAG, '').trim(), option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: '' }
      continue
    }
    if (!cur) continue   // title, name / date lines, instructions

    const ans = t.match(ANS_RE)
    if (ans) { cur.correct_answer = letterOf(ans[1]); continue }

    const tf = t.match(TF_RE)
    if (tf) {
      const isTrue = tf[2].toLowerCase() === 'true'
      addOption(isTrue ? 'a' : 'b', isTrue ? 'True' : 'False', /[\u2611\u2612\u25a0\u2713\u2714]/.test(tf[1]) || !!tf[3])
      continue
    }

    const o = line.auto === 'opt'
      ? [null, 'abcd'[['a', 'b', 'c', 'd'].findIndex(x => !cur[`option_${x}`])] || 'd', t]
      : t.match(OPT_RE)
    if (o) {
      const raw = o[2]
      const marked = MARK_RE.test(raw) || !!line.bold
      addOption(o[1].toLowerCase(), raw.replace(MARK_RE, '').trim(), marked)
      continue
    }

    // anything else: the question wrapped onto another line (before options)
    if (!cur.option_a) cur.question += ' ' + t
  }
  close()

  const warnings = []
  for (const q of questions) {
    if (!q.correct_answer && key[q.num]) q.correct_answer = key[q.num]
    const filled = ['a', 'b', 'c', 'd'].filter(x => q[`option_${x}`])
    if (filled.length < 2) warnings.push(`Question ${q.num} has fewer than two options.`)
    if (q.correct_answer && !q[`option_${q.correct_answer}`]) q.correct_answer = ''
  }
  const noAnswer = questions.filter(q => !q.correct_answer).map(q => q.num)
  if (noAnswer.length) warnings.push(`No answer found for question${noAnswer.length > 1 ? 's' : ''} ${noAnswer.join(', ')} — pick it below.`)
  return { questions: questions.map(({ num, ...q }) => q), warnings }
}

// ── File readers ─────────────────────────────────────────────────────────────

// .docx is a zip; word/document.xml holds the paragraphs. Bold is kept per
// paragraph (an option written entirely in bold = the marked answer), and
// Word's own numbering / lettering is recognised so auto-numbered lists work.
async function docxLines(file) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) throw new Error('This Word file could not be read.')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const out = []
  for (const p of doc.getElementsByTagNameNS(W, 'p')) {
    const runs = [...p.getElementsByTagNameNS(W, 'r')]
    let text = '', boldChars = 0, chars = 0
    for (const r of runs) {
      const t = [...r.getElementsByTagNameNS(W, 't')].map(n => n.textContent).join('')
        + (r.getElementsByTagNameNS(W, 'tab').length ? ' ' : '')
      if (!t) continue
      const b = r.getElementsByTagNameNS(W, 'b')[0]
      const isBold = b && b.getAttributeNS(W, 'val') !== '0' && b.getAttributeNS(W, 'val') !== 'false'
      text += t; chars += t.trim().length; if (isBold) boldChars += t.trim().length
    }
    if (!text.trim()) continue
    const numPr = p.getElementsByTagNameNS(W, 'numPr')[0]
    let auto
    if (numPr && !Q_RE.test(text.trim()) && !OPT_RE.test(text.trim())) {
      const lvl = Number(numPr.getElementsByTagNameNS(W, 'ilvl')[0]?.getAttributeNS(W, 'val') || 0)
      auto = lvl === 0 ? 'q' : 'opt'
    }
    out.push({ text, bold: chars > 0 && boldChars === chars, auto })
  }
  return out
}

// PDF text comes as positioned fragments; pdf.js marks line ends (hasEOL).
async function pdfLines(file) {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const out = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const { items } = await (await pdf.getPage(n)).getTextContent()
    let line = ''
    for (const it of items) {
      line += it.str
      if (it.hasEOL) { out.push(line); line = '' }
    }
    if (line) out.push(line)
  }
  return out
}

export async function readExamFile(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) return parseExamLines(await docxLines(file))
  if (name.endsWith('.pdf')) return parseExamLines(await pdfLines(file))
  if (name.endsWith('.txt')) return parseExamLines((await file.text()).split(/\r?\n/))
  if (name.endsWith('.doc')) throw new Error('Old .doc files cannot be read. In Word, choose File → Save As → Word Document (.docx), then upload that.')
  throw new Error('Choose a .docx, .pdf or .txt file.')
}
