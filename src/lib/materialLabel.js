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

// What a reduction label must say in print, so a fraction can be identified on
// a shelf without scanning it.
export function reductionLabelLines(material, parent) {
  if (!material?.parent_material_id) return []
  const out = []
  if (parent?.name) out.push({ label: 'From', value: parent.name })
  const method = material.reduction_method === 'fractionation' ? 'Fractionation'
    : material.reduction_method === 'splitting' ? 'Splitting'
    : material.reduction_method || null
  if (method) out.push({ label: method, value: material.reduction_value || '—' })
  else if (material.reduction_value) out.push({ label: 'Reduction', value: material.reduction_value })
  if (material.reduction_date) out.push({ label: 'Reduced', value: material.reduction_date })
  return out
}
