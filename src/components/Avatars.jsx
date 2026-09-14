// Illustrated avatar set — an alternative to uploading a photo.
//
// Built parametrically rather than as N separate drawings: one layered figure
// (background → shoulders → neck → head → hair → headwear → face → extras)
// driven by a small config per preset. Adding a preset is one line, and every
// avatar stays visually consistent.
//
// Stored in users.avatar / solo_users.avatar as the string `svg:<id>`. That
// column previously held a single emoji, and plain emoji values still render —
// see resolveAvatar() below.

const SKIN = {
  porcelain: { base: '#F7DDC8', shade: '#E8C3A6' },
  light:     { base: '#EFC9A4', shade: '#DCAE83' },
  tan:       { base: '#D9A97C', shade: '#C08E60' },
  brown:     { base: '#B4794F', shade: '#96603C' },
  deep:      { base: '#8A5533', shade: '#6E4126' },
  dark:      { base: '#5E3A24', shade: '#472A19' },
}

const HAIR = {
  black:  '#241C17', darkbrown: '#43301F', brown: '#7A5334', auburn: '#9E4B24',
  blonde: '#D9A441', grey: '#9E9A96', white: '#E9E4DF',
  purple: '#7C3AED', pink: '#E0457B', teal: '#14857F', blue: '#2563EB',
}

const BG = {
  mint: '#DCF2E9', sky: '#DCEBFA', lilac: '#E9E4FB', peach: '#FBE6DC',
  sand: '#F4EBDA', rose: '#FADCE6', slate: '#E2E8EE', lime: '#E6F3D6',
}

// ── Layer pieces ────────────────────────────────────────────────
function Shoulders({ color }) {
  return <path d="M12 100c0-16 17-24 38-24s38 8 38 24z" fill={color} />
}

function Hair({ style, color }) {
  switch (style) {
    case 'short':
      return <path d="M27 44c0-14 10-22 23-22s23 8 23 22c0-6-6-10-10-11-5 3-22 4-28-1-5 2-8 6-8 12z" fill={color} />
    case 'buzz':
      return <path d="M28 43c0-13 10-21 22-21s22 8 22 21c-3-8-11-12-22-12s-19 4-22 12z" fill={color} />
    case 'wavy':
      return <path d="M26 46c-1-16 10-24 24-24s25 8 24 24c-2-5-4-9-7-10 2 4 2 7 1 9-3-6-7-9-12-9-6 0-13 2-18 6-3 2-5 5-6 9z" fill={color} />
    case 'long':
      return (
        <>
          <path d="M25 48c-1-17 11-26 25-26s26 9 25 26v24c0 3-2 5-5 5h-3V46c0-9-7-13-17-13s-17 4-17 13v31h-3c-3 0-5-2-5-5z" fill={color} />
        </>
      )
    case 'bun':
      return (
        <>
          <circle cx="50" cy="16" r="8" fill={color} />
          <path d="M27 45c0-15 10-23 23-23s23 8 23 23c-3-9-11-14-23-14s-20 5-23 14z" fill={color} />
        </>
      )
    case 'afro':
      return (
        <>
          <circle cx="50" cy="28" r="24" fill={color} />
          <circle cx="30" cy="40" r="11" fill={color} />
          <circle cx="70" cy="40" r="11" fill={color} />
        </>
      )
    case 'curly':
      return (
        <>
          <circle cx="36" cy="27" r="10" fill={color} />
          <circle cx="50" cy="22" r="11" fill={color} />
          <circle cx="64" cy="27" r="10" fill={color} />
          <circle cx="29" cy="40" r="8" fill={color} />
          <circle cx="71" cy="40" r="8" fill={color} />
        </>
      )
    case 'bald':
    default:
      return null
  }
}

function Headwear({ style, color, accent }) {
  switch (style) {
    case 'hijab':
      return (
        <>
          {/* drape over shoulders, then the face-framing band */}
          <path d="M22 52c0-19 12-32 28-32s28 13 28 32c0 14-4 24-9 30l-6-3c4-6 6-14 6-24 0-16-8-26-19-26s-19 10-19 26c0 10 2 18 6 24l-6 3c-5-6-9-16-9-30z" fill={color} />
          <path d="M28 74c-3 9-8 16-14 20h72c-6-4-11-11-14-20-6 6-14 9-22 9s-16-3-22-9z" fill={color} />
        </>
      )
    case 'turban':
      return (
        <>
          <path d="M26 44c0-16 11-25 24-25s24 9 24 25c-4-4-6-8-8-11-5 4-27 5-33 1-2 3-5 6-7 10z" fill={color} />
          <path d="M27 40c6 4 40 4 46 0-2-7-9-13-23-13s-21 6-23 13z" fill={accent || color} />
        </>
      )
    case 'kippah':
      return <path d="M38 26a12 12 0 0 1 24 0c-4-3-8-4-12-4s-8 1-12 4z" fill={color} />
    case 'cap':
      return (
        <>
          <path d="M27 42c0-14 10-22 23-22s23 8 23 22z" fill={color} />
          <path d="M25 42h34c0 3-3 5-8 5H30c-3 0-5-2-5-5z" fill={accent || color} />
        </>
      )
    default:
      return null
  }
}

function Face({ skin, glasses, beard, mustache }) {
  return (
    <>
      {beard && (
        <path d="M28 46c0 18 10 30 22 30s22-12 22-30c0 12-10 18-22 18s-22-6-22-18z" fill={beard} />
      )}
      {/* eyes */}
      <circle cx="41" cy="47" r="2.6" fill="#2C2A28" />
      <circle cx="59" cy="47" r="2.6" fill="#2C2A28" />
      {/* brows */}
      <path d="M36.5 41.5c2-1.6 6-1.6 8 0" stroke="#2C2A28" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.75" />
      <path d="M55.5 41.5c2-1.6 6-1.6 8 0" stroke="#2C2A28" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.75" />
      {/* nose + smile */}
      <path d="M50 50v4" stroke={skin.shade} strokeWidth="2" strokeLinecap="round" />
      <path d="M43 58c3 3.4 11 3.4 14 0" stroke="#2C2A28" strokeWidth="1.9" strokeLinecap="round" fill="none" />
      {mustache && <path d="M43 55c3-2 11-2 14 0-3 2-11 2-14 0z" fill={mustache} />}
      {glasses && (
        <g stroke="#3A3A3A" strokeWidth="1.8" fill="none">
          <circle cx="41" cy="47" r="7.5" />
          <circle cx="59" cy="47" r="7.5" />
          <path d="M48.5 47h3" />
        </g>
      )}
    </>
  )
}

// ── The figure ──────────────────────────────────────────────────
export function AvatarSvg({ cfg, size = 64 }) {
  const skin = SKIN[cfg.skin] || SKIN.light
  const hairColor = HAIR[cfg.hair] || HAIR.black
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ display: 'block', borderRadius: '50%' }}>
      <defs>
        {cfg.bgGradient && (
          <linearGradient id={`g-${cfg.id}`} x1="0" y1="0" x2="0" y2="1">
            {cfg.bgGradient.map((c, i) => (
              <stop key={i} offset={`${(i / (cfg.bgGradient.length - 1)) * 100}%`} stopColor={c} />
            ))}
          </linearGradient>
        )}
      </defs>
      <circle cx="50" cy="50" r="50" fill={cfg.bgGradient ? `url(#g-${cfg.id})` : (BG[cfg.bg] || BG.mint)} />
      <Shoulders color={cfg.shirt || '#4B5563'} />
      <rect x="44" y="60" width="12" height="15" rx="5" fill={skin.shade} />
      <ellipse cx="50" cy="45" rx="22" ry="24" fill={skin.base} />
      <circle cx="27.5" cy="48" r="4" fill={skin.base} />
      <circle cx="72.5" cy="48" r="4" fill={skin.base} />
      {!cfg.headwear && <Hair style={cfg.hairStyle} color={hairColor} />}
      <Face
        skin={skin}
        glasses={cfg.glasses}
        beard={cfg.beard ? hairColor : null}
        mustache={cfg.mustache ? hairColor : null}
      />
      <Headwear style={cfg.headwear} color={cfg.headwearColor} accent={cfg.headwearAccent} />
    </svg>
  )
}

// ── Presets ─────────────────────────────────────────────────────
// Deliberately broad: every skin tone appears with several hair types, and the
// set includes hijab, turban and kippah, bald and grey/white hair, beards, and
// Pride / Trans backgrounds — so most people can find something close without
// any option being a caricature.
const PRIDE = ['#E40303', '#FF8C00', '#FFED00', '#008026', '#004DFF', '#750787']
const TRANS = ['#5BCEFA', '#F5A9B8', '#FFFFFF', '#F5A9B8', '#5BCEFA']

export const AVATAR_PRESETS = [
  { id: 'a1',  skin: 'porcelain', hair: 'brown',     hairStyle: 'short', bg: 'mint',  shirt: '#1D9E75' },
  { id: 'a2',  skin: 'porcelain', hair: 'blonde',    hairStyle: 'long',  bg: 'rose',  shirt: '#E0457B' },
  { id: 'a3',  skin: 'light',     hair: 'black',     hairStyle: 'bun',   bg: 'lilac', shirt: '#534AB7' },
  { id: 'a4',  skin: 'light',     hair: 'darkbrown', hairStyle: 'short', bg: 'sky',   shirt: '#2563EB', glasses: true },
  { id: 'a5',  skin: 'light',     hair: 'auburn',    hairStyle: 'wavy',  bg: 'peach', shirt: '#C2410C' },
  { id: 'a6',  skin: 'tan',       hair: 'black',     hairStyle: 'short', bg: 'sand',  shirt: '#0F766E', beard: true },
  { id: 'a7',  skin: 'tan',       hair: 'darkbrown', hairStyle: 'long',  bg: 'mint',  shirt: '#1D9E75' },
  { id: 'a8',  skin: 'tan',       hair: 'black',     hairStyle: 'curly', bg: 'lilac', shirt: '#7C3AED' },
  { id: 'a9',  skin: 'brown',     hair: 'black',     hairStyle: 'afro',  bg: 'lime',  shirt: '#4D7C0F' },
  { id: 'a10', skin: 'brown',     hair: 'black',     hairStyle: 'short', bg: 'sky',   shirt: '#0369A1', glasses: true },
  { id: 'a11', skin: 'brown',     hair: 'darkbrown', hairStyle: 'bun',   bg: 'rose',  shirt: '#BE185D' },
  { id: 'a12', skin: 'deep',      hair: 'black',     hairStyle: 'curly', bg: 'peach', shirt: '#B45309' },
  { id: 'a13', skin: 'deep',      hair: 'black',     hairStyle: 'buzz',  bg: 'slate', shirt: '#334155', beard: true },
  { id: 'a14', skin: 'deep',      hair: 'black',     hairStyle: 'afro',  bg: 'mint',  shirt: '#1D9E75' },
  { id: 'a15', skin: 'dark',      hair: 'black',     hairStyle: 'short', bg: 'sand',  shirt: '#92400E' },
  { id: 'a16', skin: 'dark',      hair: 'black',     hairStyle: 'long',  bg: 'lilac', shirt: '#534AB7' },
  { id: 'a17', skin: 'dark',      hair: 'white',     hairStyle: 'buzz',  bg: 'slate', shirt: '#475569', beard: true },

  // Headwear
  { id: 'h1',  skin: 'light', hair: 'black', headwear: 'hijab',  headwearColor: '#534AB7', bg: 'lilac', shirt: '#3F3697' },
  { id: 'h2',  skin: 'tan',   hair: 'black', headwear: 'hijab',  headwearColor: '#1D9E75', bg: 'mint',  shirt: '#14785A' },
  { id: 'h3',  skin: 'brown', hair: 'black', headwear: 'hijab',  headwearColor: '#BE185D', bg: 'rose',  shirt: '#9D174D' },
  { id: 'h4',  skin: 'deep',  hair: 'black', headwear: 'hijab',  headwearColor: '#0369A1', bg: 'sky',   shirt: '#075985' },
  { id: 'h5',  skin: 'tan',   hair: 'black', headwear: 'turban', headwearColor: '#D97706', headwearAccent: '#B45309', bg: 'sand', shirt: '#92400E', beard: true },
  { id: 'h6',  skin: 'brown', hair: 'black', headwear: 'turban', headwearColor: '#1D4ED8', headwearAccent: '#1E40AF', bg: 'sky',  shirt: '#1E3A8A', beard: true },
  { id: 'h7',  skin: 'light', hair: 'darkbrown', headwear: 'kippah', headwearColor: '#334155', bg: 'slate', shirt: '#475569' },
  { id: 'h8',  skin: 'porcelain', hair: 'grey', headwear: 'cap', headwearColor: '#1D9E75', headwearAccent: '#14785A', bg: 'mint', shirt: '#334155' },

  // Older / grey
  { id: 'o1',  skin: 'porcelain', hair: 'grey',  hairStyle: 'short', bg: 'slate', shirt: '#475569', glasses: true },
  { id: 'o2',  skin: 'light',     hair: 'white', hairStyle: 'bun',   bg: 'sand',  shirt: '#78716C' },
  { id: 'o3',  skin: 'tan',       hair: 'grey',  hairStyle: 'buzz',  bg: 'sky',   shirt: '#334155', beard: true, mustache: true },

  // Expressive colour
  { id: 'c1',  skin: 'porcelain', hair: 'pink',   hairStyle: 'wavy',  bg: 'rose',  shirt: '#E0457B' },
  { id: 'c2',  skin: 'light',     hair: 'teal',   hairStyle: 'short', bg: 'mint',  shirt: '#0F766E' },
  { id: 'c3',  skin: 'tan',       hair: 'purple', hairStyle: 'bun',   bg: 'lilac', shirt: '#7C3AED' },
  { id: 'c4',  skin: 'brown',     hair: 'blue',   hairStyle: 'curly', bg: 'sky',   shirt: '#2563EB' },

  // Pride
  { id: 'p1',  skin: 'light', hair: 'darkbrown', hairStyle: 'short', bgGradient: PRIDE, shirt: '#FFFFFF' },
  { id: 'p2',  skin: 'brown', hair: 'black',     hairStyle: 'curly', bgGradient: PRIDE, shirt: '#FFFFFF' },
  { id: 'p3',  skin: 'tan',   hair: 'pink',      hairStyle: 'long',  bgGradient: TRANS, shirt: '#FFFFFF' },
  { id: 'p4',  skin: 'deep',  hair: 'blonde',    hairStyle: 'buzz',  bgGradient: TRANS, shirt: '#FFFFFF' },
]

const BY_ID = Object.fromEntries(AVATAR_PRESETS.map(p => [p.id, p]))

/** True when a stored avatar value refers to one of these SVG presets. */
export function isSvgAvatar(value) {
  return typeof value === 'string' && value.startsWith('svg:')
}

/**
 * Renders whatever is stored: a photo URL wins, then an `svg:<id>` preset,
 * then a legacy emoji value, then a neutral fallback. Every avatar surface
 * should go through this so the three storage forms can't drift apart.
 */
export function AvatarDisplay({ photoUrl, value, size = 44, fallback = '🧑‍🔬', ring = true }) {
  const frame = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    border: ring ? '2px solid var(--border)' : 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', background: 'var(--accent-light)',
  }
  if (photoUrl) return <img src={photoUrl} alt="" style={{ ...frame, objectFit: 'cover' }} />
  if (isSvgAvatar(value)) {
    const cfg = BY_ID[value.slice(4)]
    if (cfg) return <div style={frame}><AvatarSvg cfg={cfg} size={size} /></div>
  }
  return <div style={{ ...frame, fontSize: Math.round(size * 0.5), lineHeight: 1 }}>{value || fallback}</div>
}

/**
 * Grid of selectable avatars. `value` is the stored string; onChange receives
 * `svg:<id>`, or null when the current selection is clicked again (clearing
 * back to no avatar).
 */
export function AvatarPicker({ value, onChange, size = 52 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${size + 12}px, 1fr))`, gap: 8 }}>
      {AVATAR_PRESETS.map(cfg => {
        const id = `svg:${cfg.id}`
        const selected = value === id
        return (
          <button
            key={cfg.id}
            type="button"
            title="Use this avatar"
            aria-pressed={selected}
            onClick={() => onChange(selected ? null : id)}
            style={{
              padding: 3, borderRadius: '50%', cursor: 'pointer', lineHeight: 0,
              background: 'transparent',
              border: selected ? '3px solid var(--accent)' : '3px solid transparent',
              boxShadow: selected ? '0 0 0 2px var(--accent-light)' : 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
          >
            <AvatarSvg cfg={cfg} size={size} />
          </button>
        )
      })}
    </div>
  )
}
