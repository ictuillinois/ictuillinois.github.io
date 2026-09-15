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
export const LABEL_TYPE = { header: 17, barcode: 25, title: 17, field: 20 }

// How many characters each free-text field may hold. The label is 4in wide;
// past these lengths a value wraps onto extra lines and pushes the rest of the
// label down. Enforced on the FORM so the author sees the limit while typing,
// rather than discovering it at the printer.
// 30, not 40: a value now sits on its own line with no "Material Label:"
// prefix in front of it, but 40 characters of 20px bold Arial is still wider
// than a 4in label and wraps. 30 fits on one line.
// Hard caps, not advice: the inputs refuse further typing and the save is
// rejected, because a value that does not fit is only discovered at the
// printer otherwise. project_name may run to 40 — it is the one value the
// label has room to wrap onto a second line.
export const FIELD_LIMITS = { name: 30, pi_name: 30, project_name: 40 }

// Returns an error string when a value is over its limit, or null. Used on
// save so a value that predates the limit cannot be carried forward unchanged.
export function overLimit(label, value, max) {
  const n = (value || '').length
  return n > max ? `${label} is ${n} characters. The printed label fits ${max} — please shorten it.` : null
}

const joinList = v => (Array.isArray(v) ? v.filter(Boolean).join(' \u00b7 ') : v) || '\u2014'

// The Original Material block: label, then whatever identifies a material of
// this type at a glance, then the date it was sampled. Aggregate is graded by
// sieve; binder and plant mix by PG grade; the rest have nothing better than
// their type. Plant mix also carries NMAS, which is why it is the one type
// that can run to four lines.
function originalValues(m, type, fallbackDate) {
  const out = [m?.name || '\u2014']
  if (type === 'aggregate')           out.push(joinList(m?.agg_sieve_sizes))
  else if (type === 'asphalt_binder') out.push(m?.ab_binder_pg || '\u2014')
  else if (type === 'plant_mix') {
    out.push(m?.pm_binder_pg || '\u2014')
    // Only when it is recorded — a plant mix without NMAS stays three lines.
    if (m?.pm_nmas) out.push(m.pm_nmas)
  }
  else out.push(typeLabel(type) || '\u2014')
  out.push(m?.sampling_date || fallbackDate || '\u2014')
  return out
}

// The equivalent line for the reduced material: what the reduction produced.
function reducedSpec(m, type) {
  if (type === 'aggregate') return m.reduction_value || joinList(m.agg_sieve_sizes)
  if (type === 'plant_mix') {
    const n = m.reduction_count
    return n ? `${n} sample${n === 1 ? '' : 's'}` : (m.reduction_value || '\u2014')
  }
  return m.reduction_value || '\u2014'
}

// What goes on a label, grouped. ONE definition: the label is rendered in
// three places (project storage tab, single-material storage tab, and the
// material's own label tab) and they had already drifted apart once.
//
// Only the three section titles are printed as words. Everything under them is
// the value the user typed, with no field name in front of it — a printed
// label is read by someone who already knows what a project name looks like.
export function labelSections(material, project, parent) {
  const type = material?.material_type
  const isReduction = !!material?.parent_material_id
  // On a reduction the "original" is the parent it came from; on a plain
  // material it is that material itself.
  const original = isReduction ? parent : material

  const out = [
    { title: 'Project info:', values: [project?.name || '\u2014', material?.pi_name || '\u2014'] },
    { title: 'Original Material:', values: originalValues(original, type, material?.sampling_date) },
  ]
  if (isReduction) {
    out.push({ title: 'Reduced Material:', values: [material.name || '\u2014', reducedSpec(material, type)] })
  }
  return out
}
