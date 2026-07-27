import { useEffect, useRef } from 'react'

// Animated login background — "molecules + logo hexes" scene.
// The four ICT-Lab logo elements (atom, flask+DNA, gears, PCB chip) float as
// frosted-glass hexagon cells among depth-layered benzene rings, DNA ribbons
// and twinkling micro-sparkles. Canvas 2D, retina-aware, small particle counts.
//
// Behavior:
//   • pauses when the tab/app is hidden (visibilitychange) — no battery drain
//   • prefers-reduced-motion → renders ONE static frame, no animation loop
//   • mobile (<768px) → reduced density and smaller cells
// Login screen only — do NOT mount behind data screens (tables/forms).

const TEAL = '29,158,117', PURPLE = '83,74,183', ORANGE = '255,107,26'
const rnd = (a, b) => a + Math.random() * (b - a)

export default function LoginBackground() {
  const ref = useRef(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let W, H, raf = 0, t = 0, running = true

    let rings = [], logoHexes = [], dnas = [], sparks = []

    // The login card is an obstacle: floating items bounce off it instead of
    // sliding underneath. Its viewport rect is re-measured every few frames
    // (cheap) so scrolling / switching to the sign-up form stays accurate.
    let cardRect = null
    function updateCardRect() {
      const el = document.querySelector('.card')
      cardRect = el ? el.getBoundingClientRect() : null
    }
    function bounceOffCard(o, r) {
      if (!cardRect) return
      const L = cardRect.left - r, R = cardRect.right + r
      const T = cardRect.top - r, B = cardRect.bottom + r
      if (o.x > L && o.x < R && o.y > T && o.y < B) {
        const dl = o.x - L, dr = R - o.x, dt = o.y - T, db = B - o.y
        const m = Math.min(dl, dr, dt, db)     // push out along shallowest side
        if (m === dl)      { o.x = L; o.vx = -Math.abs(o.vx) }
        else if (m === dr) { o.x = R; o.vx =  Math.abs(o.vx) }
        else if (m === dt) { o.y = T; o.vy = -Math.abs(o.vy) }
        else               { o.y = B; o.vy =  Math.abs(o.vy) }
      }
    }

    function size() {
      W = window.innerWidth; H = window.innerHeight
      cv.width = W * DPR; cv.height = H * DPR
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    }

    function hexPath(x, y, R, rot) {
      ctx.beginPath()
      for (let k = 0; k < 6; k++) {
        const th = rot + k * Math.PI / 3
        const px = x + R * Math.cos(th), py = y + R * Math.sin(th)
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
      }
      ctx.closePath()
    }

    function drawAtom(x, y, s, al) {
      ctx.strokeStyle = `rgba(187,68,255,${al})`; ctx.lineWidth = 1.5
      const orbits = [0, Math.PI / 3, -Math.PI / 3]
      orbits.forEach((a, i) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a + t * .002)
        ctx.beginPath(); ctx.ellipse(0, 0, s * .52, s * .20, 0, 0, 7); ctx.stroke()
        const ph = t * .02 + i * 2.1
        ctx.fillStyle = `rgba(187,68,255,${Math.min(al + .35, .9)})`
        ctx.beginPath(); ctx.arc(s * .52 * Math.cos(ph), s * .20 * Math.sin(ph), 2.4, 0, 7); ctx.fill()
        ctx.restore()
      })
      ctx.fillStyle = `rgba(187,68,255,${Math.min(al + .25, .85)})`
      ctx.beginPath(); ctx.arc(x - 2.5, y - 1.5, s * .055, 0, 7); ctx.fill()
      ctx.beginPath(); ctx.arc(x + 2.5, y - 1.5, s * .055, 0, 7); ctx.fill()
      ctx.beginPath(); ctx.arc(x, y + 2.5, s * .055, 0, 7); ctx.fill()
    }

    function drawFlask(x, y, s, al) {
      const C = '76,160,60'
      ctx.strokeStyle = `rgba(${C},${al})`; ctx.lineWidth = 1.7; ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(x - s * .17, y - s * .52); ctx.lineTo(x - s * .11, y - s * .52); ctx.lineTo(x - s * .11, y - s * .08); ctx.lineTo(x - s * .40, y + s * .44)
      ctx.quadraticCurveTo(x - s * .44, y + s * .52, x - s * .34, y + s * .52)
      ctx.lineTo(x + s * .34, y + s * .52); ctx.quadraticCurveTo(x + s * .44, y + s * .52, x + s * .40, y + s * .44)
      ctx.lineTo(x + s * .11, y - s * .08); ctx.lineTo(x + s * .11, y - s * .52); ctx.lineTo(x + s * .17, y - s * .52)
      ctx.stroke()
      const ly = y + s * .20 + Math.sin(t * .015) * s * .015
      ctx.fillStyle = `rgba(${C},${al * .30})`
      ctx.beginPath()
      ctx.moveTo(x - s * .275, ly); ctx.quadraticCurveTo(x, ly - s * .05, x + s * .275, ly)
      ctx.lineTo(x + s * .385, y + s * .50); ctx.lineTo(x - s * .385, y + s * .50); ctx.closePath(); ctx.fill()
      ctx.fillStyle = `rgba(${C},${al * .85})`
      for (const [bx, sp, ph, br] of [[-.10, .017, 0, .038], [.07, .013, 2, .030], [-.02, .021, 4, .024]]) {
        const cyc = ((t * sp + ph) % 3) / 3
        const by = (y + s * .44) - cyc * s * .55
        if (by > ly - s * .02) {
          ctx.globalAlpha = 1 - cyc * .6
          ctx.beginPath(); ctx.arc(x + bx * s, by, br * s, 0, 7); ctx.fill()
          ctx.globalAlpha = 1
        }
      }
      ctx.strokeStyle = `rgba(${C},${al * .75})`; ctx.lineWidth = 1.2
      for (let i = 0; i < 7; i++) {
        const yy = y - s * .46 + i * s * .062, ww = Math.sin(t * .01 + i * 1.05) * s * .055
        ctx.beginPath(); ctx.moveTo(x + s * .24 - ww, yy); ctx.lineTo(x + s * .24 + ww, yy); ctx.stroke()
      }
    }

    function drawGear(x, y, s, al) {
      const C = '232,69,96', rot = t * .0015
      const teeth = 8, r1 = s * .26, r2 = s * .38
      ctx.strokeStyle = `rgba(${C},${al})`; ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let k = 0; k < teeth * 2; k++) {
        const th = rot + k * Math.PI / teeth, r = (k % 2 === 0) ? r2 : r1
        const px = x + r * Math.cos(th), py = y + r * Math.sin(th)
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
      }
      ctx.closePath(); ctx.stroke()
      ctx.beginPath(); ctx.arc(x, y, s * .10, 0, 7); ctx.stroke()
      const gx = x + s * .34, gy = y - s * .30, rot2 = -rot * 8 / 5 + .3, r3 = s * .115, r4 = s * .175
      ctx.beginPath()
      for (let k = 0; k < 10; k++) {
        const th = rot2 + k * Math.PI / 5, r = (k % 2 === 0) ? r4 : r3
        const px = gx + r * Math.cos(th), py = gy + r * Math.sin(th)
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
      }
      ctx.closePath(); ctx.stroke()
      ctx.beginPath(); ctx.arc(gx, gy, s * .05, 0, 7); ctx.stroke()
    }

    function drawChip(x, y, s, al) {
      const C = '38,52,120'
      ctx.strokeStyle = `rgba(${C},${al})`; ctx.lineWidth = 1.6
      const w = s * .52
      ctx.strokeRect(x - w / 2, y - w / 2, w, w)
      ctx.strokeRect(x - w * .22, y - w * .22, w * .44, w * .44)
      for (let k = -1; k <= 1; k++) {
        const o = k * w * .3
        ctx.beginPath(); ctx.moveTo(x + o, y - w / 2); ctx.lineTo(x + o, y - w / 2 - s * .11); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(x + o, y + w / 2); ctx.lineTo(x + o, y + w / 2 + s * .11); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(x - w / 2, y + o); ctx.lineTo(x - w / 2 - s * .11, y + o); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(x + w / 2, y + o); ctx.lineTo(x + w / 2 + s * .11, y + o); ctx.stroke()
      }
      const per = (t * .01) % 4, seg = Math.floor(per), f = per - seg, q = w * .22
      const corners = [[x - q, y - q], [x + q, y - q], [x + q, y + q], [x - q, y + q]]
      const [ax, ay] = corners[seg], [bx, by] = corners[(seg + 1) % 4]
      ctx.fillStyle = `rgba(29,158,117,${Math.min(al + .3, .85)})`
      ctx.beginPath(); ctx.arc(ax + (bx - ax) * f, ay + (by - ay) * f, 2.2, 0, 7); ctx.fill()
    }

    function drawDnaSeg(d) {
      const L = d.len, amp = d.amp
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot)
      for (let i = 0; i <= L; i += 10) {
        const ph = i * .055 + t * d.sp
        const y1 = Math.sin(ph) * amp, y2 = Math.sin(ph + Math.PI) * amp
        const dp1 = (Math.cos(ph) + 1) / 2, dp2 = (Math.cos(ph + Math.PI) + 1) / 2
        if ((i / 10) % 2 === 0) {
          ctx.strokeStyle = `rgba(120,130,160,${d.al * .45})`; ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(i - L / 2, y1); ctx.lineTo(i - L / 2, y2); ctx.stroke()
        }
        ctx.fillStyle = `rgba(${TEAL},${d.al * (.35 + dp1 * .65)})`
        ctx.beginPath(); ctx.arc(i - L / 2, y1, 1.4 + dp1 * 1.3, 0, 7); ctx.fill()
        ctx.fillStyle = `rgba(${PURPLE},${d.al * (.35 + dp2 * .65)})`
        ctx.beginPath(); ctx.arc(i - L / 2, y2, 1.4 + dp2 * 1.3, 0, 7); ctx.fill()
      }
      ctx.restore()
    }

    function init() {
      const mobile = W < 768
      const cell = mobile ? .62 : 1        // shrink logo cells on phones
      rings = Array.from({ length: mobile ? 11 : 18 }, () => {
        const depth = rnd(.55, 1)
        return {
          x: rnd(0, W), y: rnd(0, H), R: rnd(26, 62) * depth, a: rnd(0, 6.3), va: rnd(-.001, .001) * depth,
          vx: rnd(-.09, .09) * depth, vy: rnd(-.07, .07) * depth,
          c: [TEAL, PURPLE, ORANGE][Math.floor(rnd(0, 3))], al: rnd(.16, .30) * depth, lw: .9 + depth * .7, depth,
        }
      })
      logoHexes = [
        { x: W * .15, y: H * .26, R: 76 * cell, rot: rnd(0, 6.3), vrot: .0004, vx: .05, vy: .03, col: '187,68,255', al: .36, icon: drawAtom },
        { x: W * .85, y: H * .68, R: 84 * cell, rot: rnd(0, 6.3), vrot: -.0003, vx: -.04, vy: -.03, col: '76,160,60', al: .34, icon: drawFlask },
        { x: W * .74, y: H * .15, R: 66 * cell, rot: rnd(0, 6.3), vrot: .0005, vx: -.05, vy: .04, col: '232,69,96', al: .36, icon: drawGear },
        { x: W * .22, y: H * .78, R: 70 * cell, rot: rnd(0, 6.3), vrot: -.0004, vx: .04, vy: -.035, col: '38,52,120', al: .34, icon: drawChip },
      ]
      dnas = [
        { x: W * .50, y: H * .08, len: 190, amp: 16, rot: -.12, sp: .008, al: .40, vx: .03, vy: .012 },
        { x: W * .42, y: H * .93, len: 150, amp: 13, rot: .10, sp: -.006, al: .32, vx: -.025, vy: -.01 },
      ]
      updateCardRect()
      sparks = Array.from({ length: mobile ? 10 : 16 }, () => {
        let x = rnd(0, W), y = rnd(0, H)
        // sparks are static — re-roll any that would be hidden under the card
        for (let tries = 0; tries < 8 && cardRect &&
             x > cardRect.left - 6 && x < cardRect.right + 6 &&
             y > cardRect.top - 6 && y < cardRect.bottom + 6; tries++) {
          x = rnd(0, W); y = rnd(0, H)
        }
        return {
          x, y, s: rnd(2, 4.5), ph: rnd(0, 6.3), sp: rnd(.008, .02),
          plus: Math.random() < .5, c: [TEAL, PURPLE, ORANGE][Math.floor(rnd(0, 3))],
        }
      })
    }

    function draw() {
      if (t % 15 === 0) updateCardRect()
      ctx.clearRect(0, 0, W, H)
      for (const sp of sparks) {
        const a = (Math.sin(t * sp.sp + sp.ph) + 1) / 2 * .35
        if (sp.plus) {
          ctx.strokeStyle = `rgba(${sp.c},${a})`; ctx.lineWidth = 1.2
          ctx.beginPath(); ctx.moveTo(sp.x - sp.s, sp.y); ctx.lineTo(sp.x + sp.s, sp.y)
          ctx.moveTo(sp.x, sp.y - sp.s); ctx.lineTo(sp.x, sp.y + sp.s); ctx.stroke()
        } else {
          ctx.fillStyle = `rgba(${sp.c},${a})`; ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.s * .45, 0, 7); ctx.fill()
        }
      }
      for (const g of [...rings].sort((a, b) => a.depth - b.depth)) {
        g.x += g.vx; g.y += g.vy; g.a += g.va
        if (g.x < -80) g.x = W + 80; if (g.x > W + 80) g.x = -80
        if (g.y < -80) g.y = H + 80; if (g.y > H + 80) g.y = -80
        bounceOffCard(g, g.R)
        hexPath(g.x, g.y, g.R, g.a); ctx.strokeStyle = `rgba(${g.c},${g.al})`; ctx.lineWidth = g.lw; ctx.stroke()
        for (let k = 0; k < 6; k++) {
          const th = g.a + k * Math.PI / 3
          ctx.fillStyle = `rgba(${g.c},${Math.min(g.al + .12, .4)})`
          ctx.beginPath(); ctx.arc(g.x + g.R * Math.cos(th), g.y + g.R * Math.sin(th), 1.4 + g.depth, 0, 7); ctx.fill()
        }
      }
      for (const d of dnas) {
        d.x += d.vx; d.y += d.vy
        if (d.x < -d.len / 2) d.x = W + d.len / 2; if (d.x > W + d.len / 2) d.x = -d.len / 2
        if (d.y < -40) d.y = H + 40; if (d.y > H + 40) d.y = -40
        bounceOffCard(d, d.amp + 12)
        drawDnaSeg(d)
      }
      for (const h of logoHexes) {
        h.x += h.vx; h.y += h.vy; h.rot += h.vrot
        if (h.x < h.R) h.vx = Math.abs(h.vx); if (h.x > W - h.R) h.vx = -Math.abs(h.vx)
        if (h.y < h.R) h.vy = Math.abs(h.vy); if (h.y > H - h.R) h.vy = -Math.abs(h.vy)
        bounceOffCard(h, h.R)
        const bob = Math.sin(t * .005 + h.R) * 2
        const g = ctx.createRadialGradient(h.x, h.y + bob, h.R * .2, h.x, h.y + bob, h.R * 1.5)
        g.addColorStop(0, `rgba(${h.col},.07)`); g.addColorStop(1, `rgba(${h.col},0)`)
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y + bob, h.R * 1.5, 0, 7); ctx.fill()
        hexPath(h.x, h.y + bob, h.R, h.rot)
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill()
        ctx.fillStyle = `rgba(${h.col},.05)`; ctx.fill()
        ctx.strokeStyle = `rgba(${h.col},${h.al})`; ctx.lineWidth = 2; ctx.stroke()
        hexPath(h.x, h.y + bob, h.R * .9, h.rot)
        ctx.strokeStyle = `rgba(${h.col},${h.al * .4})`; ctx.lineWidth = 1; ctx.stroke()
        h.icon(h.x, h.y + bob, h.R * .92, h.al + .10)
      }
    }

    function loop() {
      if (!running) return
      t++; draw()
      raf = requestAnimationFrame(loop)
    }

    function onResize() { size(); init(); if (reduced) draw() }
    function onVisibility() {
      if (document.hidden) { running = false; cancelAnimationFrame(raf) }
      else if (!reduced && !running) { running = true; loop() }
    }

    size(); init()
    if (reduced) {
      t = 30; draw()               // single static frame
      running = false
    } else {
      loop()
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
    />
  )
}
