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

// ── Tested materials (Sept 2026) ─────────────────────────────────────────
// A tested sample is its own physical thing, so its label carries its OWN
// identity — never the material's barcode or QR.

export const TESTED_LIMITS = { test_type: 30, storage_location_other: 30 }
export const TESTED_LOCATIONS = ['Tent', 'Shed', 'High bay A', 'High bay B', 'High bay C', 'MPF', 'Other']

export function testedLocation(t) {
  if (t?.storage_location === 'Other') return t.storage_location_other?.trim() || 'Other'
  return t?.storage_location || '—'
}

// PROJECT-TST-XXXXXX from the tested row's own uuid: stable and unique, the
// same rule generateBarcodeId follows for materials.
export function generateTestedBarcodeId(project, tested) {
  const suffix = String(tested.id || '').replace(/-/g, '').slice(0, 6).toUpperCase()
  // No single project (several picked, a non-project material, or Other):
  // no prefix, rather than one that names the wrong project.
  const projectId = (project?.project_id || project?.id?.slice(0, 8) || '').toUpperCase().replace(/\s/g, '-')
  return projectId ? `${projectId}-TST-${suffix}` : `TST-${suffix}`
}

// Built on buildScanUrl so the host rule stays in one place; only what
// identifies the tested sample differs. The scan page already shows `storage`.
export function buildTestedScanUrl(tested, material, project) {
  const url = new URL(buildScanUrl(material, project || {}))
  url.searchParams.set('item', `${material.name || typeLabel(material.material_type)} — ${tested.test_type}`)
  url.searchParams.set('barcode', tested.barcode_id || generateTestedBarcodeId(project, tested))
  url.searchParams.set('storage', testedLocation(tested))
  if (tested.test_date) url.searchParams.set('stored_date', tested.test_date)
  return url.toString()
}

// Three groups, one fewer line than a reduction label, because the Tested
// Material block adds three. A reduction label is already the tallest there
// is (~537 of 576px); this keeps the tested label at ~511 with room for one
// value that wraps. Do the arithmetic before adding a line.
export function testedLabelSections(tested, material, project, parent) {
  const type = material?.material_type
  const isReduction = !!material?.parent_material_id
  const spec = m => originalValues(m, type, m?.sampling_date).slice(1)
  const materialValues = isReduction
    ? [parent?.name || material.name || '—', `Reduced · ${reducedSpec(material, type)}`]
    : [material?.name || '—', spec(material).join(' · ')]
  return [
    { title: 'Project info:', values: [project?.name || '—', material?.pi_name || '—'] },
    { title: 'Material:', values: materialValues },
    { title: 'Tested Material:', values: [tested.test_type || '—', tested.test_date || '—', testedLocation(tested)], strong: true },
  ]
}

// ── The "Tested" pill: labels not tied to one material ─────────────────────
// A label is a list of lines, each in a section, so the page can measure it
// and let the user drop lines until it fits on the 4x6. Lines marked `lock`
// can never be dropped: the test name, its date and where the sample is.

export const TESTED_OTHER_LIMITS = { name: 30, project: 40, info: 60 }
export const TESTED_SECTION_ORDER = ['Tested Material:', 'Material:', 'Materials:', 'Additional info:', 'Project info:']

// items: [{ kind: 'project'|'material', name, pi_name, sampling_date }]
export function testedPillLines({ testName, testDate, location, items = [], other = null, includeInfo = false }) {
  const out = [
    { sec: 'Tested Material:', v: testName || '\u2014', lock: true },
    { sec: 'Tested Material:', v: testDate || '\u2014', lock: true },
    { sec: 'Tested Material:', v: location || '\u2014', lock: true },
  ]
  const matSec = items.length + (other ? 1 : 0) > 1 ? 'Materials:' : 'Material:'
  items.forEach(i => out.push({ sec: matSec, v: i.name || '\u2014' }))
  if (other) {
    out.push({ sec: matSec, v: other.name || 'Other material' })
    if (other.project) out.push({ sec: matSec, v: other.project })
    if (other.info) out.push({ sec: 'Additional info:', v: other.info })
  }
  if (includeInfo && items.length) {
    // One item: its PI and sampling date. Several: the PIs only, each name
    // once — three projects with the same PI print that PI once.
    const pis = [...new Set(items.map(i => (i.pi_name || '').trim()).filter(Boolean))]
    pis.forEach(pi => out.push({ sec: 'Project info:', v: pi }))
    if (items.length === 1 && items[0].sampling_date) out.push({ sec: 'Project info:', v: items[0].sampling_date })
  }
  return out
}

// Lines → the sections MaterialLabel draws. Lines with `off` were removed.
export function linesToSections(lines) {
  const kept = (lines || []).filter(l => !l.off)
  return TESTED_SECTION_ORDER
    .map(title => ({ title, values: kept.filter(l => l.sec === title).map(l => l.v), strong: title === 'Tested Material:' }))
    .filter(sec => sec.values.length)
}

// For a label made from a material's own tab (no stored lines): the same
// sections, as lines, with the Tested Material block locked.
export function sectionsToLines(sections) {
  return sections.flatMap(sec => sec.values.map(v => ({ sec: sec.title, v, lock: sec.title === 'Tested Material:' })))
}

// What was tested, in words — the records list and the QR use it.
export function testedWhat(rec) {
  const names = (rec.items || []).map(i => i.name)
  if (rec.other_material_name) names.push(rec.other_material_name)
  return names.join(', ') || '\u2014'
}
