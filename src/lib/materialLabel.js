// Material label + scan-URL logic, in ONE place.
//
// Three screens were building these independently and had drifted: the
// per-material QR tab used a different parameter set and fell back to the
// material NAME when no barcode was saved, so two materials sharing a name
// produced the SAME label and the same QR. A label is physically stuck to a
// container — two containers must never carry one identity.
//
// The scan URL format is load-bearing: labels are already printed and in use.
// Do not change the parameters or the origin without reprinting them.

export function typeLabel(type) {
  return { aggregate: 'Aggregate', asphalt_binder: 'Asphalt Binder', plant_mix: 'Plant Mix', cores: 'Cores', other: 'Other' }[type] || type
}

export function typeAbbr(type) {
  return { aggregate: 'AGG', asphalt_binder: 'AB', plant_mix: 'PM', cores: 'CORE', other: 'OTH' }[type] || 'MAT'
}

// Barcode IDs must be STABLE and UNIQUE — a printed label is physically stuck
// to a container, so the value can never be allowed to change.
//
// The previous version numbered by POSITION: `sameType.findIndex(...) + 1`.
// That made the id depend on the current list, so deleting one material
// renumbered the others, and an id that had not been saved yet was recomputed
// from whatever the caller happened to have loaded — two people could see
// different codes for the same material.
//
// The material's own uuid is the only thing about it that never changes, so
// the sequence comes from that instead. Keeps the readable
// PROJECT-TYPE-XXXX shape; `allMaterials` is no longer needed.
export function generateBarcodeId(project, material) {
  const projectId = (project?.project_id || project?.id?.slice(0, 8) || 'NP').toUpperCase().replace(/\s/g, '-')
  const abbr = typeAbbr(material.material_type)
  // 6 hex chars, not 4: the unique index on barcode_id is database-wide, so a
  // collision is an outright insert failure rather than a silent duplicate.
  // 4 chars is only 65k values and collides within a large project; 6 is 16M.
  const suffix = String(material.id || '').replace(/-/g, '').slice(0, 6).toUpperCase()
  return `${projectId}-${abbr}-${suffix}`
}

export function buildScanUrl(material, project, allMaterials) {
  const name = material.name || typeLabel(material.material_type)
  const barcodeId = material.barcode_id || generateBarcodeId(project, material)
  const params = new URLSearchParams({
    item: name,
    type: 'material',
    project: project.name || '',
    pid: project.project_id || '',
    mtype: material.material_type || '',
    barcode: barcodeId,
  })
  if (material.sampling_date) params.set('sampled', material.sampling_date)
  const base = window.location.hostname === 'localhost' ? 'https://ictlab.labhive.app/' : window.location.origin + '/'
  return `${base}?${params.toString()}`
}


// Type sizes for the printed 4x6 label, chosen from a side-by-side specimen.
// A label is read at arm's length on a shelf, often without picking the
// container up, so it is set larger than screen type would be.
export const LABEL_TYPE = { header: 17, barcode: 25, field: 20 }

// How many characters each free-text field may hold. The label is 4in wide;
// past these lengths a value wraps onto extra lines and pushes the rest of the
// label down. Enforced on the FORM so the author sees the limit while typing,
// rather than discovering it at the printer.
export const FIELD_LIMITS = { name: 40, pi_name: 30 }

const joinList = v => (Array.isArray(v) ? v.filter(Boolean).join(' \u00b7 ') : v) || '\u2014'

// What goes on a label, in order. ONE definition: the label is rendered in
// three places (project storage tab, single-material storage tab, and the
// material's own label tab) and they had already drifted apart once.
export function labelFields(material, project, parent) {
  const t = material?.material_type
  const F = []
  F.push(['Project', project?.name || '\u2014'])

  if (material?.parent_material_id) {
    F.push(['Parent Material Label', parent?.name || '\u2014'])
    if (t === 'aggregate')      F.push(['Parent Sieve Size', joinList(parent?.agg_sieve_sizes)])
    if (t === 'asphalt_binder') F.push(['Parent PG Grade', parent?.ab_binder_pg || '\u2014'])
    if (t === 'plant_mix')      F.push(['Parent PG Grade', parent?.pm_binder_pg || '\u2014'])

    F.push(['Reduced Material Label', material.name || '\u2014'])
    if (t === 'aggregate')       F.push(['Reduced Sieve Size', material.reduction_value || joinList(material.agg_sieve_sizes)])
    else if (t === 'plant_mix')  F.push(['Samples', material.reduction_count ? String(material.reduction_count) : (material.reduction_value || '\u2014')])
    else if (t === 'asphalt_binder') F.push(['Split Into', material.reduction_value || '\u2014'])
    else                         F.push(['Reduction', material.reduction_value || '\u2014'])
  } else {
    F.push(['Material Label', material?.name || '\u2014'])
    F.push(['Material Type', typeLabel(t) || '\u2014'])
    if (t === 'aggregate')      F.push(['Sieve Size', joinList(material?.agg_sieve_sizes)])
    if (t === 'asphalt_binder') F.push(['PG Grade', material?.ab_binder_pg || '\u2014'])
    if (t === 'plant_mix') {
      F.push(['PG Grade', material?.pm_binder_pg || '\u2014'])
      if (material?.pm_nmas) F.push(['NMAS', material.pm_nmas])
    }
  }

  if (material?.sampling_date) F.push(['Sampled', material.sampling_date])
  if (material?.pi_name)       F.push(['PI', material.pi_name])
  return F.map(([label, value]) => ({ label, value }))
}
