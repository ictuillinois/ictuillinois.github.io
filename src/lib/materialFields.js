// Canonical option lists for material fields.
//
// Shared so the Material form and the search filters cannot drift: the search
// used to build its sieve options from whatever sizes happened to be saved
// already, which meant the list was incomplete (a size nobody had used yet was
// unselectable) and alphabetically sorted, putting #100 before #16.
//
// Order is meaningful — coarse to fine — so it must be preserved, never sorted.
export const SIEVE_SIZES = ['2"', '1.5"', '1"', '3/4"', '1/2"', '3/8"', '#4', '#8', '#16', '#30', '#50', '#100', '#200']

// Fractionation splits an aggregate across sieves, so the choices are the
// sieve set plus the Pan (whatever passes the finest sieve). Same coarse-to-
// fine order.
export const FRACTION_SIZES = [...SIEVE_SIZES, 'Pan']

// How each material type may be reduced, and what that produces.
//
// `kind` decides both the question asked and how many materials come out:
//
//   sizes       one material PER SIEVE SIZE. Fractionating an aggregate
//               genuinely yields different materials — a #8 fraction is not
//               the same stuff as a 3/4" fraction — so each needs its own
//               barcode, label and shelf space.
//   containers  ONE material. Splitting a binder drum into five cans is still
//               the same binder; it just occupies five containers.
//   samples     ONE material, in N samples. Same reasoning as containers.
//   note        ONE material, with a free-text note. The fallback for types
//               with no defined procedure yet.
export const REDUCTION_METHODS = {
  aggregate:      [{ key: 'fractionation', label: 'Fractionation', kind: 'sizes', sizes: FRACTION_SIZES }],
  asphalt_binder: [{ key: 'splitting',     label: 'Splitting',     kind: 'containers' }],
  plant_mix:      [{ key: 'splitting',     label: 'Splitting',     kind: 'samples' }],
  cores:          [{ key: 'splitting',     label: 'Splitting',     kind: 'note' }],
  other:          [{ key: 'splitting',     label: 'Splitting',     kind: 'note' }],
}

export function reductionKind(materialType, methodKey) {
  const list = REDUCTION_METHODS[materialType] || []
  const m = methodKey ? list.find(x => x.key === methodKey) : list[0]
  return m?.kind || null
}

// Container types, shared by the material form and the reduction modal so the
// two cannot offer different lists for the same question.
export const CONTAINER_TYPES = ['Metal Bucket','Plastic Bucket','5-Gallon Metal Bucket','5-Gallon Plastic Bucket','3.5-Gallon Plastic Bucket','Gallon Can','Quart Can','Sample Bag','Sample Box','Other']

// Default thumbnail for a material with no photo, by type.
//
// Covers both the team types (aggregate, asphalt_binder, ...) and the solo
// ones, which are free-text keys like 'Chemical / Reagent'. Anything
// unrecognised — including a custom type an org added in Equipment settings —
// falls back to the beaker, so a new type never renders blank.
const MATERIAL_ICONS = {
  aggregate: '\u{1FAA8}',            // rock
  asphalt_binder: '\u{1F6E2}\uFE0F', // oil drum
  plant_mix: '\u{1F6E3}\uFE0F',      // motorway
  cores: '\u{1F9F1}',                // brick
  other: '\u{1F4E6}',                // package

  'Chemical / Reagent': '\u{1F9EA}',
  'Biological Sample': '\u{1F9EC}',
  'Aggregate': '\u{1FAA8}',
  'Soil / Rock': '\u{1F30D}',
  'Metal': '\u{1F529}',
  'Polymer / Plastic': '\u{1F9F4}',
  'Ceramic / Composite': '\u{1F3FA}',
  'Liquid': '\u{1F4A7}',
  'Powder': '\u{1F9C2}',
  'Fiber / Textile': '\u{1F9F5}',
  'Electronic Component': '\u{1F50C}',
}

export function materialIcon(type) {
  return MATERIAL_ICONS[type] || '\u{1F9EA}'
}
