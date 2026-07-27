#!/usr/bin/env node
// Spacing normalizer — snaps padding/margin/gap values to the ICT-Lab scale:
//   even values 0–16, multiples of 4 above 16 (20, 24, 28, 32, 40, 48).
// Off-scale values are snapped to the nearest step (ties round DOWN).
//
// Usage:
//   node scripts/normalize-spacing.mjs          # report what would change
//   node scripts/normalize-spacing.mjs --write  # apply changes
//
// Guardrails — never touches:
//   • negative values (compensating margins are coupled to artwork/layout)
//   • decimals, calc(), %, em, env(), var(), 'auto'
//   • values > 48 (usually coupled: 72px bottom-nav clearance, etc.)
//   • numeric props on lines without a style context (avoids jsPDF/xlsx configs)

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const WRITE = process.argv.includes('--write')

const PROPS_JSX = '(?:padding|margin|gap|rowGap|columnGap|paddingTop|paddingRight|paddingBottom|paddingLeft|marginTop|marginRight|marginBottom|marginLeft)'
const PROPS_CSS = '(?:padding|margin|gap|row-gap|column-gap|padding-(?:top|right|bottom|left)|margin-(?:top|right|bottom|left))'

function snap(n) {
  if (n <= 2 || n > 48) return n                 // micro + large: leave alone
  if (n <= 16) {
    if (n % 2 === 0) return n                    // even ≤16: on-scale
    return n === 3 || n === 5 ? 4 : n === 7 || n === 9 ? 8 : n === 11 || n === 13 ? 12 : 16
  }
  if (n % 4 === 0) return n                      // multiple of 4: on-scale
  const down = Math.floor(n / 4) * 4
  const up = down + 4
  return n - down <= up - n ? down : up          // nearest step, ties down
}

// Remap every integer px token inside a pure px-list string like "8px 12px" / "10px 14px 14px"
function snapPxString(s) {
  return s.replace(/(\d+)px/g, (_, d) => `${snap(+d)}px`)
}

const files = execSync('git ls-files "src/*.jsx" "src/**/*.jsx" "src/*.css" "src/**/*.css"', { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)

let totalChanges = 0
const report = []
const skipped = []

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  let changed = false

  const out = lines.map((line, i) => {
    let newLine = line

    // 1) JSX numeric props:  padding: 14,   marginBottom: 18 }
    //    Only on lines with a style context. Negatives can't match: the '-'
    //    between ':' and the digits blocks the pattern.
    if (/style|Style/.test(line)) {
      newLine = newLine.replace(
        new RegExp(`\\b(${PROPS_JSX})(\\s*:\\s*)(\\d+)(?![\\d.])(\\s*[,}\\)\\s])`, 'g'),
        (m, prop, sep, num, tail) => {
          const v = +num, s = snap(v)
          return v === s ? m : `${prop}${sep}${s}${tail}`
        }
      )
    } else if (new RegExp(`\\b(${PROPS_JSX})\\s*:\\s*\\d`).test(line)) {
      skipped.push(`${file}:${i + 1}  (numeric spacing outside style context) ${line.trim().slice(0, 90)}`)
    }

    // 2) JSX string props:  padding: '8px 18px'  — only pure px lists
    newLine = newLine.replace(
      new RegExp(`\\b(${PROPS_JSX})(\\s*:\\s*)(['"])([0-9px\\s]+)\\3`, 'g'),
      (m, prop, sep, q, val) => {
        const snapped = snapPxString(val)
        return snapped === val ? m : `${prop}${sep}${q}${snapped}${q}`
      }
    )

    // 3) CSS props:  padding: 8px 18px;  — skip lines with calc/%/-/var/env/decimal
    if (file.endsWith('.css')) {
      newLine = newLine.replace(
        new RegExp(`(^|[\\s;{])(${PROPS_CSS})(\\s*:\\s*)([0-9px\\s]+)(;|})`, 'g'),
        (m, pre, prop, sep, val, tail) => {
          const snapped = snapPxString(val)
          return snapped === val ? m : `${pre}${prop}${sep}${snapped}${tail}`
        }
      )
    }

    if (newLine !== line) {
      changed = true
      totalChanges++
      report.push(`${file}:${i + 1}\n  - ${line.trim().slice(0, 110)}\n  + ${newLine.trim().slice(0, 110)}`)
    }
    return newLine
  })

  if (changed && WRITE) writeFileSync(file, out.join('\n'))
}

console.log(report.join('\n'))
console.log(`\n${WRITE ? 'APPLIED' : 'DRY RUN'}: ${totalChanges} line changes`)
if (skipped.length) {
  console.log(`\nSKIPPED (manual review — spacing-like numbers outside style context):`)
  console.log(skipped.join('\n'))
}
