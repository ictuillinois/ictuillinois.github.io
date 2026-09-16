import { materialIcon } from '../lib/materialFields'

// Drawn icons for the team material types.
//
// Emoji could not carry these: there is one rock glyph and it reads as a
// pebble, and no emoji is a white 5-gallon bucket. These are the containers
// and materials people actually see on the shelf, so they are drawn to look
// like them.
//
// Colour is intentional — these are thumbnails standing in for a photo, not
// UI chrome, so they do not inherit currentColor the way Icons.jsx does.

function Aggregate({ s }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      <g stroke="#57606A" strokeWidth="1" strokeLinejoin="round">
        <polygon points="2.5,19.5 6.5,12.5 11.5,15 9.5,20.5" fill="#8E979D" />
        <polygon points="9.5,20.5 11.5,15 17.5,13 21,19 16,21" fill="#B9C0C5" />
        <polygon points="6.5,12.5 10.5,6.5 15,10.5 11.5,15" fill="#D6DBDE" />
        <polygon points="15,10.5 18.5,8 21.5,12 17.5,13" fill="#9FA8AE" />
      </g>
    </svg>
  )
}

// White 5-gallon bucket: tapered body, rolled rim, wire handle, mould ridges.
function Bucket({ s }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.3 7.4C6.9 4.2 17.1 4.2 17.7 7.4" fill="none" stroke="#6B7280" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M5.1 9.9h13.8l-1.6 10.4a1.3 1.3 0 0 1-1.3 1.1H8a1.3 1.3 0 0 1-1.3-1.1Z" fill="#FFFFFF" stroke="#6B7280" strokeWidth="1" strokeLinejoin="round" />
      <path d="M6.4 13.6h11.2M6.8 16.9h10.4" stroke="#D8DCE1" strokeWidth="0.9" strokeLinecap="round" />
      <rect x="3.9" y="6.9" width="16.2" height="3" rx="1.3" fill="#F4F5F7" stroke="#6B7280" strokeWidth="1" />
    </svg>
  )
}

// Asphalt binder: a sealed drum of hot binder.
function Drum({ s }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 5.5h13v13a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5Z" fill="#3F3F46" stroke="#27272A" strokeWidth="1" strokeLinejoin="round" />
      <ellipse cx="12" cy="5.5" rx="6.5" ry="2.1" fill="#52525B" stroke="#27272A" strokeWidth="1" />
      <path d="M5.8 11h12.4M5.8 15h12.4" stroke="#71717A" strokeWidth="1.1" />
    </svg>
  )
}

// Plant mix: laid and compacted, so a strip of road with its centre line.
function Road({ s }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 3h9l2.5 18H5Z" fill="#3F3F46" stroke="#27272A" strokeWidth="1" strokeLinejoin="round" />
      <path d="M12 5.2v3.2M12 10.6v3.2M12 16v3.2" stroke="#FAFAF9" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

// Cores: a cut cylinder of pavement.
function Core({ s }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 7.5v9c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-9Z" fill="#4B5563" stroke="#27272A" strokeWidth="1" strokeLinejoin="round" />
      <ellipse cx="12" cy="7.5" rx="6.5" ry="2.5" fill="#6B7280" stroke="#27272A" strokeWidth="1" />
      <circle cx="9.4" cy="12.4" r="0.9" fill="#9CA3AF" />
      <circle cx="13.6" cy="14.6" r="1.1" fill="#9CA3AF" />
      <circle cx="14.4" cy="10.6" r="0.7" fill="#9CA3AF" />
    </svg>
  )
}

const DRAWN = {
  aggregate: Aggregate,
  asphalt_binder: Drum,
  plant_mix: Road,
  cores: Core,
  other: Bucket,
}

export default function MaterialIcon({ type, size = 24 }) {
  const Drawn = DRAWN[type]
  if (Drawn) return <Drawn s={size} />
  // Solo types keep their emoji — they are descriptive and there are eleven of
  // them. An unknown type (a custom one added in Equipment settings) falls
  // through materialIcon to the beaker.
  return <span style={{ fontSize: Math.round(size * 0.84), lineHeight: 1 }}>{materialIcon(type)}</span>
}
