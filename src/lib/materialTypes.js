export const DEFAULT_TYPES = [
  { key: 'aggregate',      label: 'Aggregate' },
  { key: 'asphalt_binder', label: 'Asphalt Binder' },
  { key: 'plant_mix',      label: 'Plant Mix' },
  { key: 'cores',          label: 'Cores' },
  { key: 'other',          label: 'Other' },
]

// Category-appropriate defaults — used when org has no custom material_types saved
export const CATEGORY_DEFAULT_TYPES = {
  'Medical / Clinical': [
    { key: 'tissue_sample', label: 'Tissue Sample' },
    { key: 'blood_serum',   label: 'Blood / Serum' },
    { key: 'reagent',       label: 'Reagent / Chemical' },
    { key: 'cell_culture',  label: 'Cell Culture' },
    { key: 'device',        label: 'Medical Device' },
    { key: 'other',         label: 'Other' },
  ],
  'Research Institute': [
    { key: 'chemical',    label: 'Chemical / Reagent' },
    { key: 'biological',  label: 'Biological Sample' },
    { key: 'polymer',     label: 'Polymer / Plastic' },
    { key: 'metal',       label: 'Metal / Alloy' },
    { key: 'composite',   label: 'Composite' },
    { key: 'other',       label: 'Other' },
  ],
  'University / Academic': [
    { key: 'chemical',    label: 'Chemical / Reagent' },
    { key: 'biological',  label: 'Biological Sample' },
    { key: 'aggregate',   label: 'Aggregate' },
    { key: 'polymer',     label: 'Polymer / Plastic' },
    { key: 'metal',       label: 'Metal / Alloy' },
    { key: 'other',       label: 'Other' },
  ],
  'Industrial / Manufacturing': [
    { key: 'raw_material', label: 'Raw Material' },
    { key: 'metal',        label: 'Metal / Alloy' },
    { key: 'polymer',      label: 'Polymer / Plastic' },
    { key: 'composite',    label: 'Composite' },
    { key: 'liquid',       label: 'Liquid / Solvent' },
    { key: 'other',        label: 'Other' },
  ],
  'Government / Defense': [
    { key: 'metal',      label: 'Metal / Alloy' },
    { key: 'composite',  label: 'Composite' },
    { key: 'chemical',   label: 'Chemical' },
    { key: 'aggregate',  label: 'Aggregate' },
    { key: 'other',      label: 'Other' },
  ],
  'Teaching / Training': [
    { key: 'chemical',   label: 'Chemical / Reagent' },
    { key: 'aggregate',  label: 'Aggregate' },
    { key: 'metal',      label: 'Metal / Alloy' },
    { key: 'polymer',    label: 'Polymer / Plastic' },
    { key: 'other',      label: 'Other' },
  ],
}

const COLOR_PALETTE = [
  { bg: '#fef3c7', color: '#92400e' },
  { bg: '#e0f2fe', color: '#0369a1' },
  { bg: '#E1F5EE', color: '#085041' },
  { bg: '#EEEDFE', color: '#534AB7' },
  { bg: '#f0efe9', color: '#6b6860' },
  { bg: '#fce7f3', color: '#9d174d' },
  { bg: '#ecfdf5', color: '#065f46' },
  { bg: '#fff7ed', color: '#9a3412' },
]

