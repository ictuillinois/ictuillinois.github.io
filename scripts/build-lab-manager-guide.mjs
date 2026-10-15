// Builds the Lab Manager Guide for BOTH apps from one source, and prints the PDFs.
//
//   node scripts/build-lab-manager-guide.mjs
//
// Source:  guide/template.html (text) + guide/head.html (styles)
// Writes:  ictlab/ictlab-lab-manager-guide.html     ictlab/public/lab-manager-guide.pdf
//          labhive/labhive-lab-manager-guide.html   labhive/public/lab-manager-guide.pdf
//                                                   labhive/docs/lab-manager-guide.pdf
//          (labhive serves the guide from the site root, outside /app — see
//           LabManagement.jsx PDF_URL — so the root copy must be written too.)
//
// In the template, an "ict" comment-marker pair wraps ICT-Lab-only text and a
// "labhive" pair wraps LabHive-only text. Replaces scripts/make-labhive-guide.mjs
// in labhive, which converted the ICT HTML by search-and-replace.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ICT = path.join(__dirname, '..')
const LH = path.join(ICT, '../labhive')

const head = fs.readFileSync(path.join(ICT, 'guide/head.html'), 'utf8')
const body = fs.readFileSync(path.join(ICT, 'guide/template.html'), 'utf8')

const b64 = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`

const APPS = {
  ictlab: {
    APP: 'ICT-Lab',
    URL: 'https://ictlab.labhive.app',
    PROJ: 'Project &amp; Material',
    // The cover CSS turns the logo white on the dark cover
    LOGO: `<img src="${b64(path.join(ICT, 'public/ict-logo.png'), 'image/png')}" alt="ICT-Lab">`,
    COVER_META: 'Illinois Center for Transportation<br>\n    University of Illinois Urbana-Champaign',
    FOOTER_META: 'Illinois Center for Transportation &nbsp;·&nbsp; University of Illinois Urbana-Champaign',
    html: path.join(ICT, 'ictlab-lab-manager-guide.html'),
    pdfs: [path.join(ICT, 'public/lab-manager-guide.pdf')],
  },
  labhive: {
    APP: 'LabHive',
    URL: 'https://labhive.app/app',
    PROJ: 'Project Workspace',
    // filter:none: the LabHive logo keeps its own colours on the cover
    LOGO: `<img src="${b64(path.join(LH, 'public/labhive_logo.svg'), 'image/svg+xml')}" alt="LabHive" style="width:160px;height:auto;filter:none;">`,
    COVER_META: 'Lab Management Platform',
    FOOTER_META: 'Lab Management Platform',
    html: path.join(LH, 'labhive-lab-manager-guide.html'),
    pdfs: [path.join(LH, 'public/lab-manager-guide.pdf'), path.join(LH, 'docs/lab-manager-guide.pdf')],
  },
}

function render(key) {
  const a = APPS[key]
  const other = key === 'ictlab' ? 'labhive' : 'ict'
  const mine = key === 'ictlab' ? 'ict' : 'labhive'
  let html = body
    .replace(/<!--\s*Lab Manager Guide — ONE source[\s\S]*?-->\s*/, '')   // the template's own notes
    .replace(new RegExp(`<!--${other}-->[\\s\\S]*?<!--/${other}-->`, 'g'), '')
    .replace(new RegExp(`<!--/?${mine}-->`, 'g'), '')
  for (const k of ['APP', 'URL', 'PROJ', 'LOGO', 'COVER_META', 'FOOTER_META']) html = html.split(`{{${k}}}`).join(a[k])
  const left = html.match(/\{\{[A-Z_]+\}\}/)
  if (left) throw new Error(`${key}: unfilled placeholder ${left[0]}`)
  return head.replace(/<title>[^<]*<\/title>/, `<title>${a.APP} — Lab Manager Guide</title>`) + html
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
try {
  for (const key of Object.keys(APPS)) {
    const a = APPS[key]
    fs.writeFileSync(a.html, render(key), 'utf8')
    const page = await browser.newPage()
    await page.goto('file://' + a.html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '0.4in', bottom: '0.5in', left: '0.4in', right: '0.4in' } })
    for (const out of a.pdfs) fs.writeFileSync(out, pdf)
    await page.close()
    console.log(`✓ ${a.APP}: ${path.relative(path.join(ICT, '..'), a.html)} + ${a.pdfs.length} PDF(s), ${(pdf.length / 1024).toFixed(0)} KB`)
  }
} finally {
  await browser.close()
}
