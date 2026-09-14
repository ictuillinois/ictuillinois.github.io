// Excel export for project materials.
//
// One row per material, one column per field on the material form — the same
// "questions" the Material tab asks. Type-specific fields (aggregate / asphalt
// binder / plant mix) are all present as columns; a material simply leaves the
// ones that don't apply to it blank, which keeps a project with mixed material
// types on a single readable sheet instead of one sheet per type.
//
// The all-projects export puts each project on its OWN sheet of one workbook,
// which is why this is .xlsx rather than CSV.
//
// `xlsx` is loaded dynamically: it is a ~600KB chunk that only a minority of
// sessions ever need. It is already a dependency and already listed in
// vite.config's obfuscator reservedStrings, so the lazy chunk resolves. Every
// caller must wrap these in try/catch — a chunk deleted by a newer deploy
// rejects, and an unhandled rejection here would leave a button that silently
// does nothing (see CLAUDE.md, silent-failure classes).

const TYPE_LABEL = {
  aggregate: 'Aggregate', asphalt_binder: 'Asphalt Binder',
  plant_mix: 'Plant Mix', cores: 'Cores', other: 'Other',
}

const yesNo = v => (v === true ? 'Yes' : v === false ? 'No' : '')

// `locations` is an array of objects from the floor-plan picker; `photos` and
// `agg_sieve_sizes` are plain arrays. Flatten to something readable in a cell.
const joinLocations = locs =>
  Array.isArray(locs) ? locs.map(l => l?.location_label || l?.location_id || '').filter(Boolean).join(' | ') : ''

const joinArray = a => (Array.isArray(a) ? a.filter(Boolean).join(', ') : (a || ''))

// Ordered so the sheet reads the way the form does: identity, then sourcing,
// then container, then the type-specific blocks, then storage.
export const MATERIAL_COLUMNS = [
  { label: 'Material Name',        width: 30, get: m => m.name || '' },
  { label: 'Type',                 width: 16, get: m => TYPE_LABEL[m.material_type] || m.material_type || '' },
  { label: 'Barcode ID',           width: 20, get: m => m.barcode_id || '' },
  { label: 'PI / Owner',           width: 18, get: m => m.pi_name || '' },
  { label: 'Sampling Date',        width: 14, get: m => m.sampling_date || '' },
  { label: 'Storage Date',         width: 14, get: m => m.storage_date || '' },

  { label: 'Source Name',          width: 22, get: m => m.source_name || '' },
  { label: 'Source Type',          width: 16, get: m => m.source_type || '' },
  { label: 'Source Location',      width: 24, get: m => m.source_location || '' },

  { label: 'Container Type',       width: 22, get: m => m.container_type || '' },
  { label: 'Container Other',      width: 18, get: m => m.container_other || '' },
  { label: 'Container Count',      width: 15, get: m => (m.container_count ?? '') },
  { label: 'Container Color',      width: 15, get: m => m.container_color || '' },
  { label: 'Total Quantity',       width: 15, get: m => m.qty_total || '' },

  // Aggregate
  { label: 'Condition (Raw/RAP)',  width: 18, get: m => m.agg_raw_or_rap || '' },
  { label: 'IDOT Gradation',       width: 16, get: m => m.idot_gradation_cat || '' },
  { label: 'IDOT Grade',           width: 14, get: m => m.idot_gradation_grade || '' },
  { label: 'Sieve Sizes',          width: 22, get: m => joinArray(m.agg_sieve_sizes) },

  // Asphalt binder
  { label: 'Binder PG Grade',      width: 16, get: m => m.ab_binder_pg || '' },
  { label: 'Has Polymer',          width: 12, get: m => yesNo(m.ab_has_polymer) },
  { label: 'Polymer Info',         width: 22, get: m => m.ab_polymer_info || '' },
  { label: 'Binder Mix Design',    width: 20, get: m => m.ab_mix_design || '' },
  { label: 'Other Additives',      width: 20, get: m => m.ab_other_additives || '' },

  // Plant mix
  { label: 'Plant Mix PG Grade',   width: 18, get: m => m.pm_binder_pg || '' },
  { label: 'Plant Mix Design',     width: 20, get: m => m.pm_mix_design || '' },
  { label: 'NMAS',                 width: 12, get: m => m.pm_nmas || '' },

  { label: 'Storage Locations',    width: 34, get: m => joinLocations(m.locations) },
  { label: 'Photos',               width: 9,  get: m => (Array.isArray(m.photos) ? m.photos.length : 0) },
  { label: 'Other Info',           width: 30, get: m => m.other_info || '' },
]

const PROJECT_COLUMNS = [
  { label: 'Project',    width: 26, get: m => m.projects?.name || '' },
  { label: 'Project ID', width: 16, get: m => m.projects?.project_id || '' },
]

/** Excel forbids : \ / ? * [ ] in sheet names and caps them at 31 chars. */
export function safeSheetName(name, used = new Set()) {
  let base = String(name || 'Sheet').replace(/[:\\/?*[\]]/g, '-').trim().slice(0, 31) || 'Sheet'
  let candidate = base
  let n = 2
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n++})`
    candidate = base.slice(0, 31 - suffix.length) + suffix
  }
  used.add(candidate.toLowerCase())
  return candidate
}

/** Filesystem-safe filename stem. */
export function safeFileName(s) {
  return String(s || 'export').replace(/[^\w\-. ]+/g, '_').replace(/\s+/g, '_').slice(0, 80)
}

function sheetFromMaterials(XLSX, materials, cols) {
  const aoa = [cols.map(c => c.label), ...materials.map(m => cols.map(c => c.get(m)))]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = cols.map(c => ({ wch: c.width || 16 }))
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  return ws
}

/** One project -> one sheet, one workbook. */
export async function exportProjectXlsx(projectName, materials) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheetFromMaterials(XLSX, materials, MATERIAL_COLUMNS), safeSheetName(projectName))
  XLSX.writeFile(wb, `${safeFileName(projectName)}_materials.xlsx`)
}

/**
 * Every project -> one workbook, one SHEET PER PROJECT, plus a combined
 * "All Materials" sheet first for anyone who wants to filter across projects.
 */
export async function exportAllProjectsXlsx(materials, filename = 'all_projects_materials.xlsx') {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromMaterials(XLSX, materials, [...PROJECT_COLUMNS, ...MATERIAL_COLUMNS]),
    'All Materials',
  )

  const byProject = new Map()
  for (const m of materials) {
    const key = m.projects?.name || 'No project'
    if (!byProject.has(key)) byProject.set(key, [])
    byProject.get(key).push(m)
  }
  const used = new Set(['all materials'])
  for (const [name, rows] of byProject) {
    XLSX.utils.book_append_sheet(wb, sheetFromMaterials(XLSX, rows, MATERIAL_COLUMNS), safeSheetName(name, used))
  }

  XLSX.writeFile(wb, filename)
}
