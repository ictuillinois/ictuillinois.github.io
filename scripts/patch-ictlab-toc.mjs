// Adds clickable TOC (section anchors + sub-chapter links) to the ictlab guide.
// Run: node scripts/patch-ictlab-toc.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(__dirname, '../ictlab-lab-manager-guide.html')

let html = fs.readFileSync(FILE, 'utf8')

// Guard — skip if already patched
if (html.includes('id="sec-1"')) {
  console.log('Already patched — sec-1 id found. Skipping.')
  process.exit(0)
}

// ── 1. Add id="sec-N" to each <div class="sec-head"> ─────────────────────
const secIds = [
  'sec-1','sec-2','sec-3','sec-4','sec-5','sec-6',
  'sec-7','sec-8','sec-9','sec-10','sec-11','sec-12','sec-ref',
]
let sIdx = 0
html = html.replace(/<div class="sec-head"([^>]*)>/g, (_, rest) => {
  const id = secIds[sIdx++] ?? `sec-${sIdx}`
  return `<div class="sec-head" id="${id}"${rest}>`
})

// ── 2. Wrap each <div class="toc-item"> with <a href="#sec-N"> ───────────
let tIdx = 0
html = html.replace(/<div class="toc-item">([\s\S]*?)<\/div>/g, (_, inner) => {
  const id = secIds[tIdx++] ?? 'sec-ref'
  return `<a href="#${id}" class="toc-item">${inner}</a>`
})

// ── 3. Add id="sub-N" to every <h3> in document order ────────────────────
let h3Idx = 0
html = html.replace(/<h3>/g, () => `<h3 id="sub-${++h3Idx}">`)

// ── 4. Wrap toc-subs <li> items with sub-chapter anchor links ─────────────
// Sub-ID mapping mirrors the labhive guide (same HTML source, same h3 order)
const subLinks = [
  // Sec 1 — Getting Started
  ['sub-1', 'sub-2', 'sub-3'],
  // Sec 2 — Lab Management
  ['sub-5', 'sub-6', 'sub-7'],
  // Sec 3 — Training
  ['sub-8', 'sub-9', 'sub-10', 'sub-11', 'sub-12', 'sub-13'],
  // Sec 4 — Equipment
  ['sub-15', 'sub-16', 'sub-17'],
  // Sec 5 — SOP Hub
  ['sub-18', 'sub-19', 'sub-20'],
  // Sec 6 — Booking
  ['sub-21', 'sub-22', 'sub-21', 'sub-23', 'sub-24'],
  // Sec 7 — Task Board
  ['sub-26', 'sub-27', 'sub-29', 'sub-30'],
  // Sec 8 — Supply Inventory
  ['sub-31', 'sub-32', 'sub-33'],
]

let subSecIdx = 0
html = html.replace(/<ul class="toc-subs">([\s\S]*?)<\/ul>/g, (_, content) => {
  const links = subLinks[subSecIdx++] || []
  let liIdx = 0
  const newContent = content.replace(/<li>([\s\S]*?)<\/li>/g, (_, text) => {
    const id = links[liIdx++]
    if (id) return `<li><a href="#${id}" class="toc-sub-link">${text}</a></li>`
    return `<li>${text}</li>`
  })
  return `<ul class="toc-subs">${newContent}</ul>`
})

// ── 5. Inject CSS for both link types ─────────────────────────────────────
html = html.replace('</style>',
  `a.toc-item { color: inherit; text-decoration: none; cursor: pointer; }
a.toc-item:hover .toc-fill { text-decoration: underline; }
a.toc-sub-link { color: #4a5578; text-decoration: none; }
a.toc-sub-link:hover { text-decoration: underline; color: #1a3a6e; }
</style>`)

fs.writeFileSync(FILE, html, 'utf8')
console.log('✅ Clickable TOC patched into:', FILE)
console.log('   Sections linked:', sIdx, '/ Sub-chapters linked:', h3Idx)
console.log('\nNext: open ictlab-lab-manager-guide.html in Chrome → Print → Save as PDF')
console.log('Then copy the PDF to public/lab-manager-guide.pdf')
