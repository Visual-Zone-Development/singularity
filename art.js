// Drawing for every object in the cosmic cycle, plus the Anomaly specials.
// Everything is drawn once into a cached sprite and then blitted (rotated) each frame.

export const TAU = Math.PI * 2

// Radius of each tier in the 1280×800 play space.
export const R = [15, 20, 26, 33, 41, 50, 60, 71, 83, 96, 110, 124]
// points for forming each tier: 10 × n³
export const PTS = R.map((_, i) => 10 * (i + 1) ** 3)
export const TIERS = [
  { name: 'Stardust', plural: 'Stardusts', col: '#b9a6ff' },
  { name: 'Asteroid', plural: 'Asteroids', col: '#9c8f84' },
  { name: 'Moon', plural: 'Moons', col: '#ece6d6' },
  { name: 'Mars', plural: 'Marses', col: '#d9582f' },
  { name: 'Earth', plural: 'Earths', col: '#3d8fe8' },
  { name: 'Ice Giant', plural: 'Ice Giants', col: '#4fcfc4' },
  { name: 'Saturn', plural: 'Saturns', col: '#e9c46a' },
  { name: 'Jupiter', plural: 'Jupiters', col: '#e0a574' },
  { name: 'Sun', plural: 'Suns', col: '#ffd43b' },
  { name: 'Red Giant', plural: 'Red Giants', col: '#ff4757' },
  { name: 'Neutron Star', plural: 'Neutron Stars', col: '#8fd8ff' },
  { name: 'Black Hole', plural: 'Black Holes', col: '#8a5cff' }
]
export const BLACK_HOLE = TIERS.length - 1
export const SPECIAL_R = { nova: 40, worm: 36 }
export const radiusOf = (kind) => (typeof kind === 'number' ? R[kind] : SPECIAL_R[kind])
export const colorOf = (kind) => (typeof kind === 'number' ? TIERS[kind].col : kind === 'nova' ? '#ff4fa3' : '#b388ff')

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export { rng }

function hex(h) {
  const n = parseInt(h.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}
export function rgba(h, a) {
  const [r, g, b] = hex(h)
  return `rgba(${r},${g},${b},${a})`
}
function shade(h, amt) {
  const c = hex(h).map((v) => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt))
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
}
function circ(c, x, y, r) {
  c.beginPath()
  c.arc(x, y, r, 0, TAU)
}
function ell(c, x, y, rx, ry, rot = 0) {
  c.beginPath()
  c.ellipse(x, y, rx, ry, rot, 0, TAU)
}
function fill(c, col, a = 1) {
  c.save()
  c.globalAlpha = a
  c.fillStyle = col
  c.fill()
  c.restore()
}

// A round body: base fill, clipped details, soft lighting and a dark outline.
function body(c, r, col, path) {
  const P = path || (() => circ(c, 0, 0, r))
  P()
  c.fillStyle = col
  c.fill()
  c.save()
  P()
  c.clip()
  return () => {
    let g = c.createRadialGradient(-0.35 * r, -0.4 * r, 0, -0.35 * r, -0.4 * r, 0.7 * r)
    g.addColorStop(0, 'rgba(255,255,255,.38)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = g
    c.fillRect(-r, -r, 2 * r, 2 * r)
    g = c.createRadialGradient(-0.25 * r, -0.3 * r, 0.2 * r, -0.1 * r, -0.1 * r, 1.25 * r)
    g.addColorStop(0.55, 'rgba(12,4,32,0)')
    g.addColorStop(1, 'rgba(12,4,32,.5)')
    c.fillStyle = g
    c.fillRect(-r, -r, 2 * r, 2 * r)
    c.restore()
    P()
    c.strokeStyle = shade(col, -0.58)
    c.lineWidth = Math.max(1.5, r * 0.07)
    c.lineJoin = 'round'
    c.stroke()
  }
}

// Every object has its own personality; curTier is set while a sprite is drawn.
let curTier = 0
function face(c, r) {
  faceExpressive(c, r, curTier)
}

const INK = '#1a0f2e'
function dotEye(c, x, y, e, shine = true) {
  c.fillStyle = INK
  circ(c, x, y, e)
  c.fill()
  if (shine) {
    c.fillStyle = '#fff'
    circ(c, x - e * 0.3, y - e * 0.35, e * 0.38)
    c.fill()
  }
}
function stroke(c, w) {
  c.strokeStyle = INK
  c.lineWidth = w
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.stroke()
}
// Each tier gets its own personality, no blush
function faceExpressive(c, r, t) {
  const e = Math.max(r * 0.1, 1.4)
  const ex = r * 0.3
  const ey = -r * 0.02
  const w = Math.max(1.4, r * 0.055)
  if (t === 11) {
    // black hole: glowing menacing slits
    for (const s of [-1, 1]) {
      c.save()
      c.translate(s * ex, ey)
      c.rotate(s * 0.35)
      ell(c, 0, 0, e * 1.3, e * 0.55)
      c.fillStyle = '#fff'
      c.shadowColor = '#ffb347'
      c.shadowBlur = 10
      c.fill()
      c.restore()
    }
    return
  }
  if (t === 0) {
    // stardust: star-sparkle eyes, little "o"
    for (const s of [-1, 1]) {
      star(c, s * ex, ey, e * 1.6)
      c.fillStyle = INK
      c.fill()
    }
    circ(c, 0, r * 0.24, r * 0.07)
    stroke(c, w * 0.8)
  } else if (t === 1) {
    // asteroid: grumpy brows, flat mouth
    for (const s of [-1, 1]) {
      dotEye(c, s * ex, ey + e * 0.3, e, false)
      c.beginPath()
      c.moveTo(s * (ex + e * 1.4), ey - e * 1.6)
      c.lineTo(s * (ex - e * 1.2), ey - e * 0.7)
      stroke(c, w)
    }
    c.beginPath()
    c.moveTo(-r * 0.12, r * 0.26)
    c.lineTo(r * 0.12, r * 0.24)
    stroke(c, w)
  } else if (t === 2) {
    // moon: sleepy closed eyes, tiny smile, "z"
    for (const s of [-1, 1]) {
      c.beginPath()
      c.arc(s * ex, ey - e * 0.4, e * 1.1, 0.15 * Math.PI, 0.85 * Math.PI)
      stroke(c, w)
    }
    c.beginPath()
    c.arc(0, r * 0.16, r * 0.08, 0.2 * Math.PI, 0.8 * Math.PI)
    stroke(c, w * 0.8)
  } else if (t === 3) {
    // mars: determined, brows down, gritted grin
    for (const s of [-1, 1]) {
      dotEye(c, s * ex, ey, e)
      c.beginPath()
      c.moveTo(s * (ex + e * 1.3), ey - e * 2.0)
      c.lineTo(s * (ex - e * 1.3), ey - e * 1.4)
      stroke(c, w)
    }
    c.beginPath()
    c.roundRect(-r * 0.16, r * 0.17, r * 0.32, r * 0.13, r * 0.05)
    c.fillStyle = '#fff'
    c.fill()
    stroke(c, w * 0.8)
  } else if (t === 4 || t === 7) {
    // earth / jupiter: joyful, open mouth (jupiter: ^ ^ eyes)
    for (const s of [-1, 1]) {
      if (t === 7) {
        c.beginPath()
        c.arc(s * ex, ey + e * 0.6, e * 1.2, 1.15 * Math.PI, 1.85 * Math.PI)
        stroke(c, w)
      } else dotEye(c, s * ex, ey, e * 1.1)
    }
    c.beginPath()
    c.arc(0, r * 0.12, r * 0.16, 0, Math.PI)
    c.closePath()
    c.fillStyle = '#5a1630'
    c.fill()
    stroke(c, w * 0.8)
    c.beginPath()
    c.arc(0, r * 0.22, r * 0.07, Math.PI, TAU)
    c.fillStyle = '#ff7a9a'
    c.fill()
  } else if (t === 5) {
    // ice giant: cool, half-lidded
    for (const s of [-1, 1]) {
      dotEye(c, s * ex, ey, e * 1.1)
      c.beginPath()
      c.moveTo(s * ex - e * 1.4, ey - e * 0.2)
      c.lineTo(s * ex + e * 1.4, ey - e * 0.2)
      stroke(c, w * 1.1)
    }
    c.beginPath()
    c.moveTo(-r * 0.08, r * 0.24)
    c.quadraticCurveTo(r * 0.06, r * 0.3, r * 0.14, r * 0.2)
    stroke(c, w * 0.8)
  } else if (t === 6) {
    // saturn: smug wink
    dotEye(c, -ex, ey, e)
    c.beginPath()
    c.arc(ex, ey + e * 0.4, e * 1.1, 1.15 * Math.PI, 1.85 * Math.PI)
    stroke(c, w)
    c.beginPath()
    c.moveTo(-r * 0.12, r * 0.2)
    c.quadraticCurveTo(r * 0.04, r * 0.32, r * 0.16, r * 0.14)
    stroke(c, w)
  } else if (t === 8) {
    // sun: sunglasses and a grin
    for (const s of [-1, 1]) {
      c.beginPath()
      c.roundRect(s * ex - e * 1.9, ey - e * 1.3, e * 3.8, e * 2.4, e * 0.9)
      c.fillStyle = INK
      c.fill()
      c.beginPath()
      c.moveTo(s * ex - e * 1.1, ey - e * 0.6)
      c.lineTo(s * ex - e * 0.2, ey - e * 0.6)
      c.strokeStyle = 'rgba(255,255,255,.6)'
      c.lineWidth = w * 0.7
      c.stroke()
    }
    c.beginPath()
    c.moveTo(-ex + e * 1.9, ey - e * 0.6)
    c.lineTo(ex - e * 1.9, ey - e * 0.6)
    stroke(c, w)
    c.beginPath()
    c.arc(0, r * 0.14, r * 0.14, 0.1 * Math.PI, 0.9 * Math.PI)
    stroke(c, w)
  } else if (t === 10) {
    // neutron star: spinning so fast its eyes are spirals
    for (const s of [-1, 1]) {
      c.beginPath()
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * TAU * 2.2 * s
        const d = (i / 24) * e * 1.5
        c[i ? 'lineTo' : 'moveTo'](s * ex + Math.cos(a) * d, ey + Math.sin(a) * d)
      }
      stroke(c, w * 0.8)
    }
    c.beginPath()
    c.moveTo(-r * 0.12, r * 0.26)
    for (let i = 1; i <= 4; i++) c.lineTo(-r * 0.12 + i * r * 0.06, r * 0.26 + (i % 2 ? -1 : 1) * r * 0.04)
    stroke(c, w * 0.8)
  } else if (t === 9) {
    // red giant: worn out, droopy eyes, sweat drop
    for (const s of [-1, 1]) {
      dotEye(c, s * ex, ey + e * 0.4, e * 0.9, false)
      c.beginPath()
      c.moveTo(s * (ex - e * 1.3), ey - e * 1.5)
      c.lineTo(s * (ex + e * 1.3), ey - e * 0.9)
      stroke(c, w)
    }
    c.beginPath()
    c.arc(0, r * 0.32, r * 0.1, 1.15 * Math.PI, 1.85 * Math.PI)
    stroke(c, w)
    c.beginPath()
    c.moveTo(r * 0.55, -r * 0.3)
    c.quadraticCurveTo(r * 0.47, -r * 0.12, r * 0.55, -r * 0.08)
    c.quadraticCurveTo(r * 0.63, -r * 0.12, r * 0.55, -r * 0.3)
    c.fillStyle = '#bfefff'
    c.fill()
  }
}
function star(c, x, y, s) {
  c.beginPath()
  c.moveTo(x, y - s)
  c.quadraticCurveTo(x, y, x + s, y)
  c.quadraticCurveTo(x, y, x, y + s)
  c.quadraticCurveTo(x, y, x - s, y)
  c.quadraticCurveTo(x, y, x, y - s)
}
function star4(c, x, y, s) {
  c.beginPath()
  c.moveTo(x, y - s)
  c.quadraticCurveTo(x, y, x + s, y)
  c.quadraticCurveTo(x, y, x, y + s)
  c.quadraticCurveTo(x, y, x - s, y)
  c.quadraticCurveTo(x, y, x, y - s)
  c.closePath()
}

const LUMP = [1, 0.86, 0.95, 0.82, 0.97, 0.88, 1, 0.84, 0.93]
function lump(c, r) {
  const n = LUMP.length
  const p = LUMP.map((m, i) => {
    const a = (i / n) * TAU
    return [Math.cos(a) * r * m, Math.sin(a) * r * m]
  })
  const mid = (i) => {
    const a = p[i % n]
    const b = p[(i + 1) % n]
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  }
  c.beginPath()
  const m0 = mid(n - 1)
  c.moveTo(m0[0], m0[1])
  for (let i = 0; i < n; i++) {
    const m = mid(i)
    c.quadraticCurveTo(p[i][0], p[i][1], m[0], m[1])
  }
  c.closePath()
}

function ring(c, r, a0, a1) {
  c.beginPath()
  c.ellipse(0, 0, 0.9 * r, 0.23 * r, 0, a0, a1)
  c.lineCap = 'butt'
  c.strokeStyle = '#5a3d12'
  c.lineWidth = r * 0.16
  c.stroke()
  c.strokeStyle = '#f6e2a8'
  c.lineWidth = r * 0.11
  c.stroke()
  c.strokeStyle = '#d2a85a'
  c.lineWidth = Math.max(1, r * 0.025)
  c.stroke()
}

function disk(c, r, a0, a1, back) {
  c.beginPath()
  c.ellipse(0, 0, 0.92 * r, 0.2 * r, 0, a0, a1)
  c.lineCap = 'butt'
  const g = c.createLinearGradient(-r, 0, r, 0)
  g.addColorStop(0, '#ff5e3a')
  g.addColorStop(0.5, back ? '#ffb347' : '#ffe3a3')
  g.addColorStop(1, '#ff5e3a')
  c.strokeStyle = '#3a0f08'
  c.lineWidth = r * 0.15
  c.stroke()
  c.strokeStyle = g
  c.lineWidth = r * 0.1
  c.stroke()
}

const DRAW = [
  (c, r) => {
    const f = body(c, r, '#b9a6ff')
    star4(c, 0.32 * r, -0.32 * r, 0.34 * r)
    fill(c, '#fff6cf')
    circ(c, -0.42 * r, 0.38 * r, 0.08 * r)
    fill(c, '#fff6cf', 0.9)
    f()
    face(c, r)
  },
  (c, r) => {
    const f = body(c, r, '#9c8f84', () => lump(c, r))
    for (const [x, y, s] of [[-0.35, 0.32, 0.2], [0.42, -0.12, 0.14], [-0.1, -0.55, 0.1]]) {
      circ(c, x * r, y * r, s * r)
      fill(c, '#6f645b')
    }
    f()
    face(c, r * 0.95)
  },
  (c, r) => {
    const f = body(c, r, '#ece6d6')
    for (const [x, y, s] of [[-0.32, -0.36, 0.2], [0.38, 0.3, 0.24], [-0.15, 0.55, 0.12]]) {
      circ(c, x * r, y * r, s * r)
      fill(c, '#c9c0aa')
    }
    f()
    face(c, r)
  },
  (c, r) => {
    const f = body(c, r, '#d9582f')
    ell(c, -0.3 * r, 0.25 * r, 0.38 * r, 0.17 * r, 0.4)
    fill(c, '#a63d1f')
    ell(c, 0.4 * r, -0.05 * r, 0.2 * r, 0.12 * r)
    fill(c, '#a63d1f')
    ell(c, 0, -r * 0.98, 0.62 * r, 0.3 * r)
    fill(c, '#fff4ea')
    f()
    face(c, r)
  },
  (c, r) => {
    const f = body(c, r, '#3d8fe8')
    ell(c, -0.4 * r, -0.08 * r, 0.36 * r, 0.5 * r, 0.5)
    fill(c, '#57c27a')
    ell(c, 0.45 * r, 0.38 * r, 0.3 * r, 0.22 * r, -0.3)
    fill(c, '#57c27a')
    ell(c, 0.32 * r, -0.55 * r, 0.22 * r, 0.12 * r)
    fill(c, '#57c27a')
    ell(c, 0.05 * r, 0.62 * r, 0.4 * r, 0.07 * r, -0.15)
    fill(c, '#ffffff', 0.85)
    ell(c, -0.2 * r, -0.62 * r, 0.3 * r, 0.06 * r, 0.1)
    fill(c, '#ffffff', 0.85)
    f()
    face(c, r)
  },
  (c, r) => {
    const f = body(c, r, '#4fcfc4')
    for (const [y, h, col, a] of [[-0.45, 0.14, '#b8f3ec', 0.75], [0.38, 0.12, '#b8f3ec', 0.75], [0.62, 0.08, '#2a9d93', 0.8]]) {
      c.beginPath()
      c.rect(-r, y * r, 2 * r, h * r)
      fill(c, col, a)
    }
    f()
    face(c, r)
  },
  (c, r) => {
    circ(c, 0, 0, r)
    c.fillStyle = rgba('#ffe08a', 0.12)
    c.fill()
    const pr = 0.6 * r
    const tilt = -0.32
    c.save()
    c.rotate(tilt)
    ring(c, r, Math.PI, TAU)
    const f = body(c, pr, '#e9c46a')
    c.beginPath()
    c.rect(-pr, -0.32 * pr, 2 * pr, 0.14 * pr)
    fill(c, '#c99a45', 0.85)
    c.beginPath()
    c.rect(-pr, 0.45 * pr, 2 * pr, 0.12 * pr)
    fill(c, '#c99a45', 0.85)
    f()
    c.restore()
    face(c, pr)
    c.save()
    c.rotate(tilt)
    ring(c, r, 0, Math.PI)
    c.restore()
  },
  (c, r) => {
    const f = body(c, r, '#e0a574')
    for (const [y, col] of [[-0.78, '#f6e1c3'], [-0.5, '#b9643a'], [-0.26, '#f6e1c3'], [0.3, '#f6e1c3'], [0.55, '#b9643a'], [0.8, '#f6e1c3']]) {
      c.beginPath()
      c.rect(-r, (y - 0.07) * r, 2 * r, 0.14 * r)
      fill(c, col, 0.9)
    }
    ell(c, 0.4 * r, 0.44 * r, 0.2 * r, 0.11 * r)
    fill(c, '#b23a2a')
    f()
    face(c, r)
  },
  (c, r) => {
    let g = c.createRadialGradient(0, 0, 0.6 * r, 0, 0, r)
    g.addColorStop(0, 'rgba(255,200,60,.45)')
    g.addColorStop(1, 'rgba(255,200,60,0)')
    c.fillStyle = g
    circ(c, 0, 0, r)
    c.fill()
    c.beginPath()
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU
      c.moveTo(Math.cos(a - 0.13) * 0.74 * r, Math.sin(a - 0.13) * 0.74 * r)
      c.lineTo(Math.cos(a) * 0.99 * r, Math.sin(a) * 0.99 * r)
      c.lineTo(Math.cos(a + 0.13) * 0.74 * r, Math.sin(a + 0.13) * 0.74 * r)
      c.closePath()
    }
    c.fillStyle = '#ffa51f'
    c.fill()
    c.strokeStyle = '#a85a00'
    c.lineWidth = Math.max(1.5, r * 0.035)
    c.lineJoin = 'round'
    c.stroke()
    const cr = 0.8 * r
    const f = body(c, cr, '#ffd43b')
    g = c.createRadialGradient(-0.15 * cr, -0.15 * cr, 0, 0, 0, cr)
    g.addColorStop(0, '#fff6c0')
    g.addColorStop(1, 'rgba(255,246,192,0)')
    c.fillStyle = g
    c.fillRect(-cr, -cr, 2 * cr, 2 * cr)
    f()
    face(c, cr)
  },
  (c, r) => {
    circ(c, 0, 0, r)
    c.fillStyle = rgba('#ff7a59', 0.28)
    c.fill()
    const cr = 0.9 * r
    const f = body(c, cr, '#ff4757')
    const q = rng(9)
    for (let i = 0; i < 14; i++) {
      const a = q() * TAU
      const d = q() * 0.8 * cr
      circ(c, Math.cos(a) * d, Math.sin(a) * d, (0.07 + q() * 0.08) * cr)
      fill(c, '#ff9a7a', 0.55)
    }
    ell(c, -0.4 * cr, 0.45 * cr, 0.13 * cr, 0.09 * cr)
    fill(c, '#b81f3a')
    f()
    face(c, cr)
  },
  (c, r) => {
    // neutron star: a small, dense core with pulsar beams and magnetic field loops
    let g = c.createRadialGradient(0, 0, 0.3 * r, 0, 0, r)
    g.addColorStop(0, 'rgba(143,216,255,.5)')
    g.addColorStop(1, 'rgba(143,216,255,0)')
    c.fillStyle = g
    circ(c, 0, 0, r)
    c.fill()
    c.save()
    c.rotate(-0.5)
    for (const s of [-1, 1]) {
      c.beginPath()
      c.moveTo(0, 0)
      c.lineTo(-0.16 * r, s * 0.98 * r)
      c.lineTo(0.16 * r, s * 0.98 * r)
      c.closePath()
      g = c.createLinearGradient(0, 0, 0, s * r)
      g.addColorStop(0, 'rgba(230,250,255,.85)')
      g.addColorStop(1, 'rgba(125,249,255,0)')
      c.fillStyle = g
      c.fill()
    }
    c.strokeStyle = 'rgba(160,230,255,.55)'
    c.lineWidth = Math.max(1.5, r * 0.02)
    for (const k of [0.75, 0.92]) {
      for (const s of [-1, 1]) {
        c.beginPath()
        c.ellipse(s * 0.34 * k * r, 0, 0.36 * k * r, 0.2 * k * r, 0, 0, TAU)
        c.stroke()
      }
    }
    c.restore()
    const cr = 0.62 * r
    const f = body(c, cr, '#d6f0ff')
    g = c.createRadialGradient(-0.1 * cr, -0.1 * cr, 0, 0, 0, cr)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(1, 'rgba(160,220,255,.2)')
    c.fillStyle = g
    c.fillRect(-cr, -cr, 2 * cr, 2 * cr)
    f()
    face(c, cr)
  },
  (c, r) => {
    circ(c, 0, 0, r)
    c.fillStyle = rgba('#6a35c9', 0.3)
    c.fill()
    c.strokeStyle = rgba('#a77bff', 0.6)
    c.lineWidth = Math.max(1.5, r * 0.025)
    c.stroke()
    c.save()
    c.rotate(-0.12)
    disk(c, r, Math.PI, TAU, true)
    c.beginPath()
    c.ellipse(0, 0, 0.58 * r, 0.56 * r, 0, Math.PI * 1.05, Math.PI * 1.95)
    c.strokeStyle = '#ffb347'
    c.lineWidth = r * 0.045
    c.stroke()
    circ(c, 0, 0, 0.46 * r)
    c.fillStyle = '#05020a'
    c.fill()
    c.save()
    c.strokeStyle = '#ffe2b0'
    c.lineWidth = r * 0.035
    c.shadowColor = '#ffb347'
    c.shadowBlur = 14
    c.stroke()
    c.restore()
    c.restore()
    face(c, 0.46 * r)
    c.save()
    c.rotate(-0.12)
    disk(c, r, 0, Math.PI, false)
    c.restore()
  }
]

function drawNova(c, r) {
  c.beginPath()
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU
    const d = i % 2 ? 0.72 * r : r
    c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * d, Math.sin(a) * d)
  }
  c.closePath()
  c.fillStyle = '#ff4fa3'
  c.fill()
  c.strokeStyle = '#7a0f45'
  c.lineWidth = Math.max(1.5, r * 0.05)
  c.lineJoin = 'round'
  c.stroke()
  const f = body(c, 0.6 * r, '#fff0f7')
  const g = c.createRadialGradient(0, 0, 0.1 * r, 0, 0, 0.6 * r)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(1, 'rgba(255,79,163,.55)')
  c.fillStyle = g
  c.fillRect(-r, -r, 2 * r, 2 * r)
  f()
}

function drawWorm(c, r) {
  const f = body(c, r, '#1d0f3a')
  const cols = ['#7df9ff', '#b388ff', '#ff7ad9', '#ffe36e']
  for (let i = 0; i < 5; i++) {
    c.beginPath()
    c.arc(0, 0, r * (0.82 - i * 0.15), i * 1.25, i * 1.25 + Math.PI * 1.35)
    c.strokeStyle = cols[i % 4]
    c.lineWidth = Math.max(1.5, r * 0.08)
    c.lineCap = 'round'
    c.stroke()
  }
  circ(c, 0, 0, r * 0.1)
  c.fillStyle = '#fff'
  c.fill()
  f()
}

/** Ice shell drawn over a frozen object (not rotated with it, so it reads as a solid block). */
export function drawIce(c, r, crack = 0) {
  c.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6
    c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 1.04, Math.sin(a) * r * 1.04)
  }
  c.closePath()
  c.save()
  c.fillStyle = 'rgba(200,242,255,.5)'
  c.fill()
  c.strokeStyle = '#e8fbff'
  c.lineWidth = Math.max(2, r * 0.06)
  c.lineJoin = 'round'
  c.stroke()
  c.restore()
  c.beginPath()
  c.moveTo(-0.2 * r, -0.7 * r)
  c.lineTo(-0.05 * r, -0.35 * r)
  c.lineTo(-0.25 * r, -0.1 * r)
  c.moveTo(-0.05 * r, -0.35 * r)
  c.lineTo(0.2 * r, -0.3 * r)
  c.moveTo(0.5 * r, 0.3 * r)
  c.lineTo(0.3 * r, 0.5 * r)
  c.strokeStyle = 'rgba(255,255,255,.85)'
  c.lineWidth = Math.max(1.2, r * 0.03)
  c.lineCap = 'round'
  c.stroke()
  c.beginPath()
  c.moveTo(-0.6 * r, -0.2 * r)
  c.lineTo(-0.4 * r, -0.55 * r)
  c.lineTo(-0.3 * r, -0.55 * r)
  c.lineTo(-0.5 * r, -0.2 * r)
  c.closePath()
  c.fillStyle = 'rgba(255,255,255,.55)'
  c.fill()
}

const SS = 2 // sprites are drawn at 2× for crisp scaling
const cache = new Map()

/** Cached sprite for a kind at its own radius. Returns { img, size } where size is in play-space px. */
export function sprite(kind, r = radiusOf(kind)) {
  const key = `${kind}|${r}`
  let s = cache.get(key)
  if (s) return s
  const size = Math.ceil(r * 2.3)
  const img = document.createElement('canvas')
  img.width = img.height = size * SS
  // CPU-rasterised: cached sprites are drawn once, and software raster avoids a GPU stall on the
  // first frames (the headless check's swiftshader GPU took over a second to blur the big ones).
  const c = img.getContext('2d', { willReadFrequently: true })
  c.scale(SS, SS)
  c.translate(size / 2, size / 2)
  curTier = kind
  if (typeof kind === 'number') DRAW[kind](c, r)
  else if (kind === 'nova') drawNova(c, r)
  else if (kind === 'worm') drawWorm(c, r)
  s = { img, size }
  cache.set(key, s)
  return s
}

/** Draw a kind centered at x,y with radius r (scales the cached sprite) and rotation a. */
export function drawKind(c, kind, x, y, r, a = 0) {
  const base = radiusOf(kind)
  const s = sprite(kind)
  const k = r / base
  c.save()
  c.translate(x, y)
  if (a) c.rotate(a)
  c.drawImage(s.img, (-s.size / 2) * k, (-s.size / 2) * k, s.size * k, s.size * k)
  c.restore()
}
