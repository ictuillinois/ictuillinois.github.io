// CSV export for project materials.
//
// One row per material, one column per field on the material form — the same
// "questions" the Material tab asks. Type-specific fields (aggregate / asphalt
// binder / plant mix) are all present as columns; a material simply leaves the
// ones that don't apply to it blank, which is what keeps a single sheet
// readable in Excel rather than one sheet per material type.
//
// Plain CSV rather than a real .xlsx: it opens natively in Excel, Numbers and
// Sheets, needs no dependency, and adds nothing to the bundle. The exceljs /
// xlsx paths already in the app are lazy-loaded chunks worth ~900KB.

const TYPE_LABEL = {
  aggregate: 'Aggregate', asphalt_binder: 'Asphalt Binder',
  plant_mix: 'Plant Mix', cores: 'Cores', other: 'Other',
}

const yesNo = v => (v === true ? 'Yes' : v === false ? 'No' : '')

// `locations` is an array of objects from the floor-plan picker; `photos` and
// `agg_sieve_sizes` are plain arrays. Flatten them to something a human can
// read in a spreadsheet cell.
const joinLocations = locs =>
  Array.isArray(locs) ? locs.map(l => l?.location_label || l?.location_id || '').filter(Boolean).join(' | ') : ''

const joinArray = a => (Array.isArray(a) ? a.filter(Boolean).join(', ') : (a || ''))

// Ordered so the sheet reads the way the form does: identity, then sourcing,
// then container, then the type-specific blocks, then storage.
export const MATERIAL_COLUMNS = [
  { label: 'Material Name',        get: m => m.name || '' },
  { label: 'Type',                 get: m => TYPE_LABEL[m.material_type] || m.material_type || '' },
  { label: 'Barcode ID',           get: m => m.barcode_id || '' },
  { label: 'PI / Owner',           get: m => m.pi_name || '' },
  { label: 'Sampling Date',        get: m => m.sampling_date || '' },
  { label: 'Storage Date',         get: m => m.storage_date || '' },

  { label: 'Source Name',          get: m => m.source_name || '' },
  { label: 'Source Type',          get: m => m.source_type || '' },
  { label: 'Source Location',      get: m => m.source_location || '' },

  { label: 'Container Type',       get: m => m.container_type || '' },
  { label: 'Container Other',      get: m => m.container_other || '' },
  { label: 'Container Count',      get: m => (m.container_count ?? '') },
  { label: 'Container Color',      get: m => m.container_color || '' },
  { label: 'Total Quantity',       get: m => m.qty_total || '' },

  // Aggregate
  { label: 'Condition (Raw/RAP)',  get: m => m.agg_raw_or_rap || '' },
  { label: 'IDOT Gradation',       get: m => m.idot_gradation_cat || '' },
  { label: 'IDOT Grade',           get: m => m.idot_gradation_grade || '' },
  { label: 'Sieve Sizes',          get: m => joinArray(m.agg_sieve_sizes) },

  // Asphalt binder
  { label: 'Binder PG Grade',      get: m => m.ab_binder_pg || '' },
  { label: 'Has Polymer',          get: m => yesNo(m.ab_has_polymer) },
  { label: 'Polymer Info',         get: m => m.ab_polymer_info || '' },
  { label: 'Binder Mix Design',    get: m => m.ab_mix_design || '' },
  { label: 'Other Additives',      get: m => m.ab_other_additives || '' },

  // Plant mix
  { label: 'Plant Mix PG Grade',   get: m => m.pm_binder_pg || '' },
  { label: 'Plant Mix Design',     get: m => m.pm_mix_design || '' },
  { label: 'NMAS',                 get: m => m.pm_nmas || '' },

  { label: 'Storage Locations',    get: m => joinLocations(m.locations) },
  { label: 'Photos',               get: m => (Array.isArray(m.photos) ? m.photos.length : 0) },
  { label: 'Other Info',           get: m => m.other_info || '' },
]

// RFC 4180: wrap in quotes and double any embedded quote. Also force-quote
// anything with a separator, newline or leading zero so Excel does not eat it
// (barcode IDs and phone-like values otherwise lose their leading zeros).
function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value)
  if (s === '') return ''
  const needsQuote = /[",\n\r]/.test(s) || /^0\d/.test(s) || s !== s.trim()
  return needsQuote ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * @param materials rows from project_materials
 * @param opts.includeProject  add a leading Project column (for multi-project exports)
 * @param opts.projectName     used when a material has no joined project row
 */
export function materialsToCsv(materials, opts = {}) {
  const cols = opts.includeProject
    ? [{ label: 'Project', get: m => m.projects?.name || opts.projectName || '' },
       { label: 'Project ID', get: m => m.projects?.project_id || '' },
       ...MATERIAL_COLUMNS]
    : MATERIAL_COLUMNS
  const head = cols.map(c => csvCell(c.label)).join(',')
  const body = (materials || []).map(m => cols.map(c => csvCell(c.get(m))).join(','))
  return [head, ...body].join('\r\n')
}

/** Triggers a download. The BOM is what makes Excel read UTF-8 correctly. */
export function downloadCsv(filename, csv) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Filesystem-safe filename stem. */
export function safeFileName(s) {
  return String(s || 'export').replace(/[^\w\-. ]+/g, '_').replace(/\s+/g, '_').slice(0, 80)
}
