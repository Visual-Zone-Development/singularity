// Singularity: drop space objects, merge matching pairs, grow them into a black hole.
// Three modes: Classic (pure merging), Anomaly (wormholes, ice, Gravity Pulse, chains, Transmissions, Cosmic Events)
// and Countdown (a race against a clock that merges refill).
import { input } from './input.js'
import { createMenu } from './menu.js'
import { fitCanvas } from './fit.js'
import { createAudio } from './audio.js'
import { createSave, createSettings } from './save.js'
import { createSettingsScreen } from './settings.js'
import { drawPrompts } from './prompts.js'
import { sfx, initSfx } from './sfx.js'
import { R, PTS, TIERS, BLACK_HOLE, TAU, drawKind, drawIce, radiusOf, colorOf, rgba, rng } from './art.js'

const ID = 'singularity'
// Draw in a fixed 1280×800 space (the Steam Deck screen); fit.js scales and letterboxes it.
const W = 1280
const H = 800
const canvas = document.getElementById('game')
const fit = fitCanvas(canvas, { w: W, h: H, letterbox: '#0e0a24' })
const ctx = fit.ctx
input.attach(canvas, W, H)
// R is Gravity Pulse right on the keyboard too (E is the default for rb).
input.extendKeys({ KeyR: 'rb' })
// Device pixels per game unit, for the pre-rendered background.
let pixelScale = fit.scale * fit.dpr
fit.onResize(() => {
  pixelScale = fit.scale * fit.dpr
  bgCanvas = null
})

const settings = createSettings(ID) // singularity-settings-v1
const audio = createAudio({ settings })
initSfx(audio)
const debug = new URLSearchParams(location.search).has('debug')

const DISP = '"Lilita One", "Rubik", system-ui, sans-serif'
const UI = 'Rubik, system-ui, sans-serif'
const C = { ink: '#fff8ec', muted: '#b9aee8', acc: '#ffb347', hot: '#ff5a7a', ice: '#7df9ff', panel: 'rgba(255,255,255,.07)', edge: '#8f7dff', jar: '#a9b6ff' }

// ---------- field geometry ----------
const J = { x: 380, y: 150, w: 520, h: 600, horizon: 232 }
const DROP_Y = 104
const FLOOR = J.y + J.h - 4
const LEFT = J.x + 4
const RIGHT = J.x + J.w - 4
const VORTEX = { x: J.x + J.w / 2, y: FLOOR - 230 }
const STEP = 1 / 120
const GRAVITY = 2300 * STEP * STEP
const OVER_LIMIT = 2 // seconds above the Horizon before the run ends

// Countdown mode (times in seconds)
const CD = {
  start: 60, // on the clock at the start
  maxClock: 120,
  timeFor: [0, 0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 10, 12], // added when a merge forms this tier
  collapseTime: 15,
  ventLimit: 1, // seconds above the Horizon before the field vents
  ventPenalty: 10, // the first vent costs this...
  ventStep: 5, // ...and every vent after costs this much more (never resets)
  cooldown: 0.2, // between drops
  shipSpeed: 760,
  fuse: [3, 1.2], // auto-drop fuse per piece: at the start, and by fuseRamp
  fuseRamp: 180,
  prefill: 14 // small objects already in the field at the start
}
const ventCost = (g) => CD.ventPenalty + CD.ventStep * (g.vents ?? 0)
const overLimit = (g) => (g.mode === 'countdown' ? CD.ventLimit : OVER_LIMIT)
const fuseTime = (g) => CD.fuse[0] + (CD.fuse[1] - CD.fuse[0]) * Math.min(1, g.t / CD.fuseRamp)
const CHAIN_WINDOW = 3 // seconds after a merge in which the next merge extends the chain

// Anomaly-mode numbers (times in seconds)
const TUNING = {
  wormAfter: 60, // no random wormholes before this
  wormChance: 1 / 60, // per drop, once allowed
  wormGap: 30, // at least this many drops between random wormholes
  iceAfter: 120,
  iceChance: 1 / 8,
  // Transmissions and Cosmic Events take turns, never overlapping, with calm in between
  firstCalm: 35, // before the first Transmission
  calmGap: 20, // after each Transmission or event ends
  eventRamp: 360, // events reach full strength after this many seconds
  amplify: 0.4, // extra escalation for the event after a lost Transmission
  eventWarn: 3, // warning before an event hits
  eventBanner: 2.2,
  // event strength: [when events start, once fully escalated at eventRamp]
  meteorCount: [8, 12],
  meteorMoonChance: [0.15, 0.4], // the rest are Stardust and Asteroids
  meteorSpacing: 0.35,
  freezeCount: [5, 7],
  // field events last this many drops
  windDrops: [5, 8],
  windForce: [0.05, 0.08], // px per physics step², sideways
  vortexDrops: [5, 8],
  vortexForce: [0.035, 0.055], // px per physics step², around the field's centre
  bounceDrops: [5, 8],
  bounce: [0.65, 0.85], // how much speed a bouncy drop keeps per impact
  shakyDrops: [5, 8],
  shakySpeed: [240, 380], // px/s the dropper sways on its own
  polarityDrops: [4, 6],
  dropTail: 1.5, // seconds a field event lingers after its last drop
  quakeKicks: [5, 7],
  quakePower: [1, 1.4],
  quakeSpacing: 0.6,
  jamDrops: [6, 9],
  rogueTiers: [6, 7], // Saturn or Jupiter, and it can't go in Hold
  eventScoreMult: 2, // merges while an event is active score double
  txHardFrom: 90, // Transmissions start turning hard after this...
  txHardFull: 210, // ...and are mostly hard (txHardMax) by this
  txHardMax: 0.8
}
const between = ([a, b]) => a + Math.random() * (b - a)
const escalation = (g) => Math.min(1, g.t / TUNING.eventRamp)
const scaled = (g, [a, b], extra = 0) => a + (b - a) * Math.min(1, escalation(g) + extra)

// ---------- saves ----------
// singularity-save-v1: bests, the top-10 boards and the last initials in one save. 1.10 kept them under
// bare keys (singularity.best3.<mode>, singularity.board.<mode>.v3, singularity.initials): read them once.
const BOARD_SIZE = 10
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const MODES = ['classic', 'anomaly', 'countdown']
const oldKey = (k) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const cleanBoard = (list) => (Array.isArray(list) ? list.filter((e) => e && typeof e.name === 'string' && Number.isFinite(e.score)).slice(0, BOARD_SIZE) : [])
function oldSave() {
  const d = { best: {}, boards: {}, initials: 'AAA' }
  for (const mode of MODES) {
    d.best[mode] = Number(oldKey(`singularity.best3.${mode}`) ?? 0) || 0
    try {
      d.boards[mode] = cleanBoard(JSON.parse(oldKey(`singularity.board.${mode}.v3`) ?? 'null'))
    } catch {
      d.boards[mode] = []
    }
  }
  const ini = oldKey('singularity.initials')
  if (ini && /^[A-Z]{3}$/.test(ini)) d.initials = ini
  return d
}
const save = createSave(ID, 1, oldSave())
save.data.best ??= {}
save.data.boards ??= {}
for (const mode of MODES) {
  if (!Number.isFinite(save.data.best[mode])) save.data.best[mode] = 0
  save.data.boards[mode] = cleanBoard(save.data.boards[mode])
}
if (!/^[A-Z]{3}$/.test(save.data.initials ?? '')) save.data.initials = 'AAA'
try {
  const oldKeys = [...MODES.flatMap((m) => [`singularity.best3.${m}`, `singularity.board.${m}.v3`]), 'singularity.initials']
  if (oldKeys.some((k) => localStorage.getItem(k) !== null)) {
    save.save()
    for (const k of oldKeys) localStorage.removeItem(k)
  }
} catch {}
const loadBest = (mode) => save.data.best[mode]
function saveBest(mode, v) {
  save.data.best[mode] = v
  save.save()
}
const loadBoard = (mode) => save.data.boards[mode]
function saveBoard(mode, list) {
  save.data.boards[mode] = list
  save.save()
}
const loadInitials = () => save.data.initials
function saveInitials(v) {
  save.data.initials = v
  save.save()
}
const qualifies = (mode, score) => score > 0 && (state.boards[mode].length < BOARD_SIZE || score > state.boards[mode][BOARD_SIZE - 1].score)

// ---------- state ----------
const state = {
  screen: 'title', // title | playing | paused | settings | gameover, plus the title sub-screens guide | boards
  from: 'title', // where Settings and the Field Guide return to
  t: 0,
  best: { classic: 0, anomaly: 0, countdown: 0 },
  boards: { classic: loadBoard('classic'), anomaly: loadBoard('anomaly'), countdown: loadBoard('countdown') },
  game: null
}

const WEIGHTS = [34, 30, 22, 14] // only the 4 smallest tiers drop in
function randTier() {
  let r = Math.random() * 100
  for (let i = 0; i < WEIGHTS.length; i++) if ((r -= WEIGHTS[i]) < 0) return i
  return 0
}

function rollPiece(g) {
  if (g.mode === 'anomaly') {
    if (g.t > TUNING.wormAfter && g.drops - g.lastWorm >= TUNING.wormGap && Math.random() < TUNING.wormChance) {
      g.lastWorm = g.drops
      return { kind: 'worm' }
    }
    return { kind: randTier(), ice: g.t > TUNING.iceAfter && Math.random() < TUNING.iceChance }
  }
  return { kind: randTier() }
}

function newGame(mode) {
  const g = {
    mode,
    bodies: [],
    cur: null,
    next: null,
    hold: null,
    canHold: true,
    dropX: J.x + J.w / 2,
    cooldown: 0.35,
    score: 0,
    t: 0,
    drops: 0,
    maxTier: 0,
    chain: 0,
    chainT: 0,
    pulses: 3,
    mission: null,
    calm: TUNING.firstCalm, // seconds until the next Transmission or event
    nextUp: 'tx', // which of the two comes next
    amplified: false, // a lost Transmission makes the next event stronger
    event: null,
    lastEvent: null,
    wind: 0,
    vortex: 0,
    lastWorm: 0,
    missionRewardIdx: 0,
    missionLog: null,
    danger: 0,
    warnT: 0,
    overT: 0,
    over: false,
    newBest: false,
    acc: 0,
    shake: 0,
    jarKick: 0,
    flash: 0
  }
  g.cur = { kind: randTier() }
  g.next = rollPiece(g)
  if (mode === 'countdown') {
    g.clock = CD.start
    g.fuse = g.fuseMax = fuseTime(g)
    g.cooldown = 0.6
    prefill(g)
  }
  return g
}

let fx = { parts: [], rings: [], pops: [] }

// Countdown starts with a loose spread of small objects. Kinds cycle through Stardust, Asteroid
// and Moon so no two neighbours (side by side or diagonal) start out matching.
function prefill(g) {
  const cols = 7
  const shift = Math.floor(Math.random() * 3)
  for (let i = 0; i < CD.prefill; i++) {
    const c = i % cols
    const row = Math.floor(i / cols)
    const kind = (c + row * 2 + shift) % 3
    const x = LEFT + 40 + c * ((RIGHT - LEFT - 80) / (cols - 1)) + (row % 2) * 20
    const b = addBody(g, { kind }, x, FLOOR - 40 - row * 70)
    b.touched = true
    b.age = 1
  }
}

function startGame(mode) {
  state.game = newGame(mode)
  fx = { parts: [], rings: [], pops: [] }
  dragging = false
  state.screen = 'playing'
}

// ---------- effects ----------
function burst(x, y, col, n = 14, speed = 260, size = 6) {
  for (let i = 0; i < n && fx.parts.length < 360; i++) {
    const a = Math.random() * TAU
    const s = speed * (0.4 + Math.random() * 0.8)
    fx.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, max: 0.9, col, size: size * (0.5 + Math.random()) })
  }
}
function ring(x, y, r, col, width = 6) {
  fx.rings.push({ x, y, r: r * 0.5, max: r * 1.8, life: 0.4, col, width })
}
function pop(text, x, y, col = C.acc, size = 34) {
  fx.pops.push({ text, x, y, col, size, life: 1.1 })
}
function shake(g, amt) {
  if (settings.data.reducedShake) return
  g.shake = Math.min(18, g.shake + amt)
}
function flash(g, amt) {
  g.flash = settings.data.reducedShake ? 0 : amt
}

// ---------- physics ----------
let nextId = 1
function addBody(g, piece, x, y, opts = {}) {
  const tr = radiusOf(piece.kind)
  const b = {
    id: nextId++,
    kind: piece.kind,
    ice: !!piece.ice,
    x,
    y,
    px: x - (opts.vx ?? 0) * STEP,
    py: y - (opts.vy ?? 0) * STEP,
    r: opts.grow ? tr * 0.55 : tr,
    tr,
    a: Math.random() * 0.6 - 0.3,
    age: 0,
    touched: false,
    over: 0,
    dead: false
  }
  g.bodies.push(b)
  return b
}

function step(g) {
  const B = g.bodies
  for (const b of B) {
    if (b.r < b.tr) b.r = Math.min(b.tr, b.r + (b.tr - b.r) * 0.2 + 0.4)
    let vx = (b.x - b.px) * 0.996 + g.wind
    let vy = (b.y - b.py) * 0.996
    if (g.vortex) {
      // swirl around the middle of the field
      const dx = b.x - VORTEX.x
      const dy = b.y - VORTEX.y
      const d = Math.hypot(dx, dy) || 1
      vx += (-dy / d) * g.vortex
      vy += (dx / d) * g.vortex
    }
    const sp = Math.hypot(vx, vy)
    if (sp > 24) {
      vx *= 24 / sp
      vy *= 24 / sp
    }
    b.px = b.x
    b.py = b.y
    b.x += vx
    b.y += vy + GRAVITY
    b.contact = false
  }
  const events = []
  for (let it = 0; it < 6; it++) {
    for (let i = 0; i < B.length; i++) {
      const a = B[i]
      if (a.dead) continue
      for (let j = i + 1; j < B.length; j++) {
        const b = B[j]
        if (b.dead) continue
        let dx = b.x - a.x
        const dy = b.y - a.y
        const m = a.r + b.r
        // perfectly stacked circles would balance forever; real objects topple
        if (dx > -0.4 && dx < 0.4) dx += (Math.random() - 0.5) * 0.8
        if (dx > m || dx < -m || dy > m || dy < -m) continue
        const d2 = dx * dx + dy * dy
        if (d2 >= m * m) continue
        const d = Math.sqrt(d2) || 0.01
        if (it === 0) {
          events.push([a, b])
          if (a.bouncy || b.bouncy) bounceOff(a, b, dx / d, dy / d, Math.max(a.bouncy || 0, b.bouncy || 0))
        }
        const o = (m - d) / d
        const ma = a.r * a.r
        const mb = b.r * b.r
        const t = ma + mb
        a.x -= (dx * o * mb) / t
        a.y -= (dy * o * mb) / t
        b.x += (dx * o * ma) / t
        b.y += (dy * o * ma) / t
        a.contact = b.contact = true
        // a little friction so piles settle instead of flowing like liquid
        a.px += (a.x - a.px) * 0.015
        b.px += (b.x - b.px) * 0.015
      }
    }
    for (const b of B) {
      if (b.y + b.r > FLOOR) {
        const vy = b.y - b.py
        b.y = FLOOR - b.r
        if (b.bouncy && vy > 1) b.py = b.y + vy * b.bouncy
        b.px += (b.x - b.px) * 0.08
        b.contact = true
        b.floor = true
      }
      if (b.x - b.r < LEFT) {
        const vx = b.x - b.px
        b.x = LEFT + b.r
        if (b.bouncy) b.px = b.x + vx * b.bouncy
        b.contact = true
      }
      if (b.x + b.r > RIGHT) {
        const vx = b.x - b.px
        b.x = RIGHT - b.r
        if (b.bouncy) b.px = b.x + vx * b.bouncy
        b.contact = true
      }
    }
  }
  for (const b of B) {
    if (b.contact) {
      b.a += ((b.x - b.px) / b.r) * 0.9
      b.touched = true
    }
  }
  for (const [a, b] of events) {
    if (a.dead || b.dead) continue
    contact(g, a, b)
  }
  if (B.some((b) => b.dead)) g.bodies = B.filter((b) => !b.dead)
}

// elastic kick between two touching bodies (Bouncy Field drops)
function bounceOff(a, b, nx, ny, e) {
  const rel = (b.x - b.px - (a.x - a.px)) * nx + (b.y - b.py - (a.y - a.py)) * ny
  if (rel >= 0) return // already separating
  const ma = a.r * a.r
  const mb = b.r * b.r
  const j = (-(1 + e) * rel) / (ma + mb)
  a.px += j * mb * nx
  a.py += j * mb * ny
  b.px -= j * ma * nx
  b.py -= j * ma * ny
}

function contact(g, a, b) {
  // Specials react to touch
  if (a.kind === 'worm' || b.kind === 'worm') {
    const w = a.kind === 'worm' ? a : b
    const o = w === a ? b : a
    wormhole(g, w, o)
    return
  }
  if (typeof a.kind !== 'number' || a.kind !== b.kind || a.ice || b.ice) return
  if (polarized(g)) {
    repel(a, b)
    return
  }
  merge(g, a, b)
}

// Polarity Flip: matching objects shove each other apart instead of merging
function repel(a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy) || 1
  const k = 3
  a.px += (dx / d) * k
  a.py += (dy / d) * k
  b.px -= (dx / d) * k
  b.py -= (dy / d) * k
  if (!(a.age - (a.sparkT ?? -1) < 0.4)) {
    a.sparkT = a.age
    burst((a.x + b.x) / 2, (a.y + b.y) / 2, '#ff7ac0', 6, 180, 4)
  }
}

function multiplier(g) {
  g.chain = g.chainT > 0 ? Math.min(5, g.chain + 1) : 1
  g.chainT = CHAIN_WINDOW
  if (g.mission?.type === 'chain') g.mission.count = Math.max(g.mission.count, g.chain)
  return g.chain * (eventActive(g) ? TUNING.eventScoreMult : 1)
}

function merge(g, a, b) {
  const t = a.kind
  a.dead = b.dead = true
  const ma = a.r * a.r
  const mb = b.r * b.r
  const x = (a.x * ma + b.x * mb) / (ma + mb)
  const y = (a.y * ma + b.y * mb) / (ma + mb)
  const mult = multiplier(g)
  if (t === BLACK_HOLE) {
    collapse(g, x, y, mult)
    return
  }
  const nt = t + 1
  const vx = ((a.x - a.px + b.x - b.px) / 2) / STEP
  const vy = ((a.y - a.py + b.y - b.py) / 2) / STEP
  const nb = addBody(g, { kind: nt }, x, y, { grow: true, vx: vx * 0.5, vy: vy * 0.5 })
  nb.touched = true
  nb.age = 1
  gained(g, nt, x, y, mult)
}

function gained(g, nt, x, y, mult) {
  const pts = PTS[nt] * mult
  g.score += pts
  g.maxTier = Math.max(g.maxTier, nt)
  const label = `+${pts.toLocaleString('en-US')}`
  pop(mult > 1 ? `${label} ×${mult}` : label, x, y - R[nt] - 6, mult > 1 ? C.acc : C.ink, nt >= 7 ? 40 : 32)
  burst(x, y, TIERS[nt].col, 10 + nt * 2, 160 + nt * 30)
  ring(x, y, R[nt], TIERS[nt].col)
  sfx.merge(nt)
  if (nt >= 7) {
    shake(g, 3 + nt)
    g.callout = { text: CALLOUTS[nt - 7], col: TIERS[nt].col, t: 0 }
  }
  if (g.mode === 'countdown') addTime(g, CD.timeFor[nt])
  if (g.mode === 'anomaly') {
    if (nt >= 7 && g.pulses < 3) {
      g.pulses++
      pop('+1 PULSE', x, y - R[nt] - 46, C.ice, 28)
    }
    missionMerge(g, nt - 1, x, y)
    thawNear(g, x, y, R[nt] + 26)
  }
}

// Two Black Holes open a Singularity: it swallows everything within reach and scores each object
const SINGULARITY = { bonus: 50000, reach: 250 }
const CALLOUTS = ['GIANT!', 'STELLAR!', 'SUPERGIANT!', 'ULTRA DENSE!', 'COSMIC!']

function collapse(g, x, y, mult) {
  let swallowed = 0
  let pts = SINGULARITY.bonus
  for (const b of g.bodies) {
    if (b.dead || Math.hypot(b.x - x, b.y - y) - b.r > SINGULARITY.reach) continue
    b.dead = true
    swallowed++
    if (typeof b.kind === 'number') pts += PTS[b.kind]
    // debris spirals into the centre
    for (let i = 0; i < 5 && fx.parts.length < 360; i++) {
      const px = b.x + (Math.random() - 0.5) * b.r
      const py = b.y + (Math.random() - 0.5) * b.r
      fx.parts.push({ x: px, y: py, vx: (x - px) * 2.4, vy: (y - py) * 2.4, life: 0.45, max: 0.45, col: colorOf(b.kind), size: 7 })
    }
  }
  pts *= mult
  g.score += pts
  ring(x, y, SINGULARITY.reach, '#ffe3a3', 6)
  pop('SINGULARITY!', x, y - 70, '#ffe3a3', 50)
  pop(`+${pts.toLocaleString('en-US')}${swallowed ? `  ·  ${swallowed} swallowed` : ''}`, x, y - 20, C.acc, 34)
  for (let i = 0; i < 60 && fx.parts.length < 360; i++) {
    const a = Math.random() * TAU
    const d = 120 + Math.random() * 200
    fx.parts.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d * 2 + Math.sin(a) * 200, vy: -Math.sin(a) * d * 2 - Math.cos(a) * 200, life: 0.5, max: 0.5, col: i % 2 ? '#ffb347' : '#a77bff', size: 6 })
  }
  ring(x, y, 220, '#a77bff', 12)
  ring(x, y, 140, '#ffb347', 8)
  flash(g, 0.6)
  shake(g, 18)
  sfx.collapse()
  if (g.mode === 'countdown') addTime(g, CD.collapseTime)
}

function addTime(g, secs) {
  if (!secs) return
  g.clock = Math.min(CD.maxClock, g.clock + secs)
  g.clockKick = 1
  pop(`+${secs}s`, 1083 + (Math.random() - 0.5) * 80, 556, C.ice, 30)
}

// Countdown: anything resting above the Horizon gets sucked out, at a cost
function vent(g) {
  for (const b of g.bodies) {
    if (b.touched && b.y - b.r < J.horizon + 40) {
      b.dead = true
      burst(b.x, b.y, C.hot, 16, 320)
      fx.parts.length < 360 && burst(b.x, J.y, '#ffd0dc', 6, 200, 4)
    }
    b.over = 0
  }
  const cost = ventCost(g)
  g.vents = (g.vents ?? 0) + 1
  g.chain = 0
  g.chainT = 0
  g.clock = Math.max(0, g.clock - cost)
  g.clockKick = -1
  pop(`VENT  −${cost}s`, J.x + J.w / 2, J.horizon + 50, C.hot, 44)
  pop('CHAIN BROKEN', J.x + J.w / 2, J.horizon + 100, C.muted, 30)
  pop(`−${cost}s`, 1083, 556, C.hot, 36)
  ring(J.x + J.w / 2, J.horizon, 120, C.hot, 8)
  flash(g, 0.35)
  shake(g, 12)
  sfx.boom()
}

function thawNear(g, x, y, reach) {
  for (const b of g.bodies) {
    if (!b.ice || b.dead) continue
    if (Math.hypot(b.x - x, b.y - y) < reach + b.r) {
      b.ice = false
      burst(b.x, b.y, '#e8fbff', 16, 220, 5)
      sfx.thaw()
    }
  }
}

function wormhole(g, w, o) {
  w.dead = true
  sfx.worm()
  ring(w.x, w.y, 60, '#b388ff', 8)
  burst(w.x, w.y, '#b388ff', 18, 240)
  if (typeof o.kind !== 'number') {
    o.dead = true
    return
  }
  const t = o.kind
  o.dead = true
  const mult = multiplier(g)
  if (t === BLACK_HOLE) {
    collapse(g, o.x, o.y, mult)
    return
  }
  const nb = addBody(g, { kind: t + 1 }, o.x, o.y, { grow: true })
  nb.touched = true
  nb.age = 1
  gained(g, t + 1, o.x, o.y, mult)
}

function pulse(g, dir) {
  if (g.pulses <= 0) {
    sfx.back()
    return
  }
  g.pulses--
  for (const b of g.bodies) {
    b.px -= dir * 5
    b.py += 1.5
  }
  g.jarKick = dir * 16
  shake(g, 5)
  sfx.pulse()
}

// ---------- Transmissions (Anomaly goals) ----------
// One timed goal at a time. Early ones are easy; as the run goes on they turn hard and pay more.
// Completing one pushes the Horizon back up a step; failing one calls in a Cosmic Event.
const MISSION_ALERT = 2.6 // seconds the incoming-transmission banner stays up
const TX = {
  weights: { form: 0.7, zone: 1.4, tidy: 1, sweep: 1, chain: 1, score: 1, variety: 1 },
  reward: { easy: { pulse: 1, score: 15000 }, hard: { pulse: 2, score: 50000 } }
}

const fmtTime = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
const settled = (b) => b.touched && b.age > 0.6
const stardustLeft = (g) => g.bodies.filter((b) => b.kind === 0 && !b.dead).length

// Build one mission of a type at a difficulty, or null when it doesn't fit the field right now.
function makeMission(g, type, hard) {
  const pick = (a, b) => a + Math.floor(Math.random() * (b - a + 1))
  if (type === 'form') {
    const tier = hard ? pick(Math.max(5, Math.min(7, g.maxTier)), Math.min(8, Math.max(6, g.maxTier + 1))) : pick(3, Math.max(4, Math.min(5, g.maxTier)))
    const goal = !hard && tier <= 4 ? 2 : 1
    const time = 35 + (tier - 3) * 12
    return { type, tier, goal, time, text: `Form ${goal} ${goal > 1 ? TIERS[tier].plural : TIERS[tier].name}` }
  }
  if (type === 'zone') {
    const r = hard ? 75 : 95
    const zone = { x: J.x + 40 + r + Math.random() * (J.w - 80 - r * 2), y: J.horizon + 160 + Math.random() * Math.max(0, FLOOR - r * 0.7 - J.horizon - 160), r }
    const goal = hard ? 3 : 2
    return { type, zone, goal, time: hard ? 45 : 35, text: `${goal} merges in zone` }
  }
  if (type === 'tidy') {
    // counts drops, not seconds, so waiting around doesn't help
    const goal = hard ? 8 : 6
    return { type, line: J.horizon + (hard ? 150 : 90), goal, time: hard ? 50 : 40, text: `Drop ${goal}, stay low` }
  }
  if (type === 'sweep') {
    if (!hard) return stardustLeft(g) >= 2 ? { type, sub: 'dust', goal: 1, time: 30, text: 'Clear all Stardust' } : null
    const n = g.bodies.length
    return n >= 10 ? { type, sub: 'count', target: Math.max(4, n - 6), goal: 1, time: 40, text: `Down to ${Math.max(4, n - 6)} objects` } : null
  }
  if (type === 'chain') {
    const goal = hard ? 4 : 3
    return { type, goal, time: hard ? 45 : 40, text: `Chain ×${goal}` }
  }
  if (type === 'score') {
    const goal = Math.round((hard ? 20000 + g.maxTier * 4000 : 8000 + g.maxTier * 1500) / 500) * 500
    const time = hard ? 30 : 25
    return { type, goal, time, text: `+${goal} pts fast` }
  }
  if (type === 'variety') {
    const goal = hard ? 4 : 3
    return { type, goal, time: 20, text: `Merge ${goal} kinds` }
  }
  return null
}

function weightedOrder() {
  const pool = Object.entries(TX.weights).map(([k, w]) => ({ k, r: Math.pow(Math.random(), 1 / w) }))
  return pool.sort((a, b) => b.r - a.r).map((e) => e.k)
}

function hardChance(g) {
  const T = TUNING
  return Math.max(0, Math.min(T.txHardMax, ((g.t - T.txHardFrom) / (T.txHardFull - T.txHardFrom)) * T.txHardMax))
}

function newMission(g) {
  const hard = Math.random() < hardChance(g)
  let m = null
  for (const type of weightedOrder()) if (type !== g.lastMissionType && (m = makeMission(g, type, hard))) break
  const pts = TX.reward[hard ? 'hard' : 'easy']
  const usePulse = g.pulses < 3 && (g.missionRewardIdx++ % 2 === 0 || g.pulses === 0)
  m.reward = usePulse ? { id: 'pulse', n: pts.pulse, text: `+${pts.pulse} Pulse${pts.pulse > 1 ? 's' : ''}` } : { id: 'score', n: pts.score, text: `+${pts.score} pts` }
  m.hard = hard
  m.count = 0
  m.max = m.time
  g.lastMissionType = m.type
  if (m.type === 'score') m.start = g.score
  if (m.type === 'tidy') m.firstId = nextId // only drops made after accepting count
  if (m.type === 'variety') m.kinds = new Set()
  g.mission = m
}

// called for every merge (and wormhole upgrade) in Anomaly mode
function missionMerge(g, merged, x, y) {
  const m = g.mission
  if (!m) return
  if (m.type === 'form' && m.tier === merged + 1) m.count++
  if (m.type === 'zone' && Math.hypot(x - m.zone.x, y - m.zone.y) < m.zone.r) {
    m.count++
    ring(m.zone.x, m.zone.y, m.zone.r, C.acc, 6)
  }
  if (m.type === 'variety') {
    m.kinds.add(merged)
    m.count = m.kinds.size
  }
}

function missionProgress(g, m) {
  if (m.type === 'sweep') return m.sub === 'dust' ? `${stardustLeft(g)} left` : `${g.bodies.length} now`
  return `${Math.min(m.count, m.goal)}/${m.goal}`
}

// Transmissions and Cosmic Events take turns: only one is ever running, then a calm gap.
function updateDirector(g, dt) {
  if (g.mission) updateMission(g, dt)
  else if (g.event) updateEvent(g, dt)
  else if ((g.calm -= dt) <= 0) {
    if (g.nextUp === 'tx') {
      newMission(g)
      g.missionAlert = MISSION_ALERT
      g.missionFlash = 5
      sfx.incoming()
      g.nextUp = 'event'
    } else {
      startEvent(g)
      g.nextUp = 'tx'
    }
  }
}

function updateMission(g, dt) {
  const m = g.mission
  m.time -= dt
  if (m.type === 'tidy') {
    // a drop counts once it has landed; anything resting above the line resets the count
    const over = g.bodies.some((b) => settled(b) && b.y - b.r < m.line)
    for (const b of g.bodies) {
      if (b.dropped && !b.counted && b.id >= m.firstId && settled(b)) {
        b.counted = true
        if (!over) m.count++
      }
    }
    if (over) m.count = 0
  } else if (m.type === 'sweep') {
    m.count = (m.sub === 'dust' ? stardustLeft(g) === 0 : g.bodies.length <= m.target) ? 1 : 0
  } else if (m.type === 'score') m.count = g.score - m.start
  if (m.count >= m.goal) {
    if (m.reward.id === 'pulse') g.pulses = Math.min(3, g.pulses + m.reward.n)
    if (m.reward.id === 'score') g.score += m.reward.n
    g.missionLog = { text: 'TRANSMISSION COMPLETE', col: C.acc, t: 2 }
    sfx.mission()
    g.mission = null
    g.calm = TUNING.calmGap
  } else if (m.time <= 0) {
    // a lost signal has consequences: the next Cosmic Event comes in amplified
    g.missionLog = { text: 'SIGNAL LOST', col: C.hot, t: 2 }
    sfx.fail()
    g.mission = null
    g.calm = TUNING.calmGap
    g.amplified = true
  }
}

// ---------- Cosmic Events (Anomaly hazards) ----------
// Every so often something bad (or at least messy) happens to the field.
// Each one is announced TUNING.eventWarn seconds ahead so the player can brace.
// One-shot events hit once; field events change the rules for the next few drops.
const EVENTS = {
  meteor: { name: 'METEOR SHOWER', desc: 'Rocks are raining into the field!', col: '#ff8a4c' },
  freeze: { name: 'DEEP FREEZE', desc: 'Objects in the field will freeze solid', col: C.ice },
  wind: { name: 'SOLAR WIND', desc: 'The whole field will drift', col: '#ffd43b' },
  vortex: { name: 'COSMIC VORTEX', desc: 'The field is about to churn in a circle', col: '#b388ff' },
  bounce: { name: 'BOUNCY FIELD', desc: 'Your drops will bounce and scatter', col: '#7dff9a' },
  shaky: { name: 'SHAKY DROPPER', desc: 'Your ship will sway on its own', col: '#7df9ff' },
  polarity: { name: 'POLARITY FLIP', desc: 'Matching objects will repel, not merge', col: '#ff7ac0' },
  quake: { name: 'GRAVITY QUAKE', desc: 'The pile is about to be shaken up', col: '#ff6a8a' },
  jam: { name: 'SIGNAL JAM', desc: 'Next and Hold go dark', col: '#b9aee8' },
  rogue: { name: 'ROGUE PLANET', desc: "Something huge is next, and it can't be held", col: '#e9c46a' }
}
const EVENT_IDS = Object.keys(EVENTS)
// field events and how many drops they last
const DROP_EVENTS = { wind: 'windDrops', vortex: 'vortexDrops', bounce: 'bounceDrops', shaky: 'shakyDrops', polarity: 'polarityDrops', jam: 'jamDrops' }

function startEvent(g) {
  const ids = EVENT_IDS.filter((k) => k !== g.lastEvent)
  const id = ids[Math.floor(Math.random() * ids.length)]
  g.lastEvent = id
  g.event = { id, phase: 'warn', t: TUNING.eventWarn, max: TUNING.eventWarn, banner: TUNING.eventBanner, dir: Math.random() < 0.5 ? -1 : 1, boost: g.amplified ? TUNING.amplify : 0 }
  g.amplified = false
  shake(g, 4)
  sfx.alarm()
}

function beginEvent(g, e) {
  e.phase = 'active'
  const T = TUNING
  const sc = (range) => scaled(g, range, e.boost)
  if (DROP_EVENTS[e.id]) {
    e.drops = e.dropsMax = Math.round(sc(T[DROP_EVENTS[e.id]]))
    e.t = e.max = Infinity // ends TUNING.dropTail seconds after its last drop
  }
  if (e.id === 'meteor') {
    e.left = Math.round(sc(T.meteorCount))
    e.next = 0
    e.t = e.max = e.left * T.meteorSpacing + 0.4
  } else if (e.id === 'freeze') {
    const pool = g.bodies.filter((b) => typeof b.kind === 'number' && !b.ice && !b.dead && b.touched)
    const n = Math.round(sc(T.freezeCount))
    for (let i = 0; i < n && pool.length; i++) {
      const b = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]
      b.ice = true
      burst(b.x, b.y, '#e8fbff', 18, 240, 5)
      ring(b.x, b.y, b.r, C.ice, 5)
    }
    sfx.freeze()
    e.t = e.max = 1
  } else if (e.id === 'wind') {
    e.force = sc(T.windForce)
    sfx.wind()
  } else if (e.id === 'vortex') {
    e.force = sc(T.vortexForce)
    sfx.wind()
  } else if (e.id === 'bounce') {
    e.bounce = sc(T.bounce)
    sfx.jam()
  } else if (e.id === 'shaky') {
    e.speed = sc(T.shakySpeed)
    e.phase0 = Math.random() * TAU
    sfx.jam()
  } else if (e.id === 'polarity') {
    sfx.jam()
  } else if (e.id === 'quake') {
    e.left = Math.round(sc(T.quakeKicks))
    e.power = sc(T.quakePower)
    e.next = 0
    e.t = e.max = e.left * T.quakeSpacing
  } else if (e.id === 'jam') {
    sfx.jam()
  } else if (e.id === 'rogue') {
    const tiers = T.rogueTiers
    g.next = { kind: tiers[Math.floor(Math.random() * tiers.length)], locked: true }
    sfx.jam()
    e.t = e.max = 1.5
  }
}

function tickEvent(g, e, dt) {
  const T = TUNING
  if (e.id === 'meteor' && e.left > 0 && (e.next -= dt) <= 0) {
    e.left--
    e.next = T.meteorSpacing
    const kind = Math.random() < scaled(g, T.meteorMoonChance, e.boost) ? 2 : Math.random() < 0.55 ? 0 : 1
    const x = LEFT + R[kind] + Math.random() * (RIGHT - LEFT - R[kind] * 2)
    const b = addBody(g, { kind }, x, J.y - 30, { vy: 420, vx: (Math.random() - 0.5) * 160 })
    b.meteor = true
    burst(x, J.y - 30, '#ff8a4c', 8, 160, 5)
    sfx.meteor()
  } else if (e.id === 'quake' && e.left > 0 && (e.next -= dt) <= 0) {
    e.left--
    e.next = T.quakeSpacing
    for (const b of g.bodies) {
      b.py += (2 + Math.random() * 2.5) * e.power
      b.px += (Math.random() - 0.5) * 2.5 * e.power
    }
    g.jarKick = (Math.random() < 0.5 ? -1 : 1) * 10
    shake(g, 12)
    sfx.boom()
  }
  // field events ease in, and ease out over the tail after their last drop
  const ease = e.drops > 0 ? Math.min(1, (e.age = (e.age ?? 0) + dt) * 2) : Math.max(0, e.t / T.dropTail)
  g.wind = e.id === 'wind' ? e.dir * e.force * ease : 0
  g.vortex = e.id === 'vortex' ? e.dir * e.force * ease : 0
  if (e.id === 'shaky' && e.drops > 0) {
    const r = radiusOf(g.cur.kind)
    g.dropX = Math.max(LEFT + r, Math.min(RIGHT - r, g.dropX + Math.sin(g.t * 2.4 + e.phase0) * e.speed * dt))
  }
}

function updateEvent(g, dt) {
  const e = g.event
  e.t -= dt
  e.banner -= dt
  if (e.phase === 'warn') {
    if (e.t <= 0) beginEvent(g, e)
    return
  }
  tickEvent(g, e, dt)
  if (e.t <= 0) {
    g.event = null
    g.wind = 0
    g.vortex = 0
    g.calm = TUNING.calmGap
  }
}

// a drop counts down the field event in progress
function eventDrop(g, b) {
  const e = g.event
  if (!e || e.phase !== 'active' || !(e.drops > 0)) return
  if (e.id === 'bounce') b.bouncy = e.bounce
  if (--e.drops === 0) e.t = TUNING.dropTail
}

const eventActive = (g) => g.event?.phase === 'active'
const jammed = (g) => g.event?.id === 'jam' && eventActive(g)
const polarized = (g) => g.event?.id === 'polarity' && eventActive(g)

// ---------- menus ----------
// Every menu is a menu.js menu (controller, keyboard, mouse and touch), drawn in the game's own style.
// Stepped navigation with key repeat comes from input.js.
const navY = () => input.navY
const navX = () => input.navX
const BOARD_MODES = ['classic', 'anomaly', 'countdown']
const GUIDE_TABS = ['Basics', 'Objects', 'Anomaly', 'Countdown']
const titleMenu = createMenu(
  [
    { id: 'classic', label: 'Classic' },
    { id: 'anomaly', label: 'Anomaly' },
    { id: 'countdown', label: 'Countdown' },
    { id: 'boards', label: 'Leaderboards' },
    { id: 'guide', label: 'How to play' },
    { id: 'settings', label: 'Settings' }
  ],
  { x: 84 + 260, y: 322, width: 520, height: 54, gap: 6 }
)
const pauseMenu = createMenu(
  [
    { id: 'resume', label: 'Resume' },
    { id: 'restart', label: 'Restart' },
    { id: 'settings', label: 'Settings' },
    { id: 'guide', label: 'Field guide' },
    { id: 'title', label: 'Quit to title' }
  ],
  { x: W / 2, y: 250, width: 400, height: 60, gap: 16 }
)
const overMenu = createMenu(
  [
    { id: 'again', label: 'Play again' },
    { id: 'title', label: 'Title' }
  ],
  { x: W / 2, y: 692, width: 400, height: 46, gap: 8 }
)
// 'Back' pill in the top-right corner of the Field Guide and the Leaderboards.
const backMenu = createMenu([{ id: 'back', label: 'Back' }], { x: 1120, y: 42, width: 200, height: 48 })
const settingsScreen = createSettingsScreen({ settings, audio })
const TAB_GAP = 16
const tabRect = (tabs, tw, i) => ({ x: W / 2 - (tabs.length * tw + (tabs.length - 1) * TAB_GAP) / 2 + i * (tw + TAB_GAP), y: 124, w: tw, h: 52 })

// On-screen buttons for mouse and touch during play (game space).
const PAUSE_BUTTON = { x: W - 32 - 56, y: 24, w: 56, h: 56 }
const HOLD_BOX = { classic: { x: 64, y: 394, w: 210, h: 150 }, countdown: { x: 64, y: 354, w: 210, h: 190 }, anomaly: { x: 64, y: 474, w: 210, h: 140 } }
const PULSE_BUTTONS = [
  { x: 64, y: 724, w: 100, h: 56, dir: -1 },
  { x: 174, y: 724, w: 100, h: 56, dir: 1 }
]
const SAVE_BUTTON = { x: W / 2 - 110, y: 700, w: 220, h: 52 }
const initialRect = (i) => ({ x: W / 2 - 140 + i * 100, y: 568, w: 80, h: 92 })
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
const pointerMode = () => input.mode === 'mouse' || input.mode === 'touch'
// A press that started inside the field drags the dropper; releasing it drops.
let dragging = false

function openGuide(tab, from) {
  state.guide = { tab }
  state.from = from
  backMenu.select('back')
  state.screen = 'guide'
}
function openSettings(from) {
  state.from = from
  state.screen = 'settings'
}
function pause() {
  pauseMenu.select('resume')
  state.screen = 'paused'
  dragging = false
  save.save()
}
// Launcher overlay, window hidden or unfocused, every controller gone: pause (never auto-resume).
input.onPause(() => {
  if (state.screen === 'playing') pause()
})

/** Drop the current piece where the dropper is (A, a tap release, or the Countdown fuse). */
function dropPiece(g) {
  const countdown = g.mode === 'countdown'
  const b = addBody(g, g.cur, g.dropX + (Math.random() - 0.5) * 2, DROP_Y, { vy: 60 })
  b.dropped = true
  if (g.mode === 'anomaly') eventDrop(g, b)
  g.cur = g.next
  g.next = rollPiece(g)
  g.canHold = true
  g.cooldown = countdown ? CD.cooldown : 0.45
  g.drops++
  if (countdown) g.fuse = g.fuseMax = fuseTime(g)
  sfx.drop()
}
/** Hold / swap the current piece (X or a tap on the HOLD box), once per drop. */
function holdPiece(g) {
  if (!g.canHold || g.cooldown > 0) return
  if (g.cur.locked || g.hold?.locked) return sfx.back()
  if (g.hold) [g.cur, g.hold] = [g.hold, g.cur]
  else {
    g.hold = g.cur
    g.cur = g.next
    g.next = rollPiece(g)
  }
  g.canHold = false
  if (g.mode === 'countdown') g.fuse = g.fuseMax = fuseTime(g)
  sfx.hold()
}

// the best score shown in menus and HUD is whichever is higher: the old single best or the board's #1
for (const mode of BOARD_MODES) state.best[mode] = Math.max(loadBest(mode), state.boards[mode][0]?.score ?? 0)

// ---------- update ----------
function update(dt) {
  state.t += dt
  const s = state.screen
  if (s === 'title') {
    const choice = titleMenu.update(input, dt)
    if (choice === 'boards') {
      sfx.select()
      state.boardMode = state.boardMode ?? 0
      backMenu.select('back')
      state.screen = 'boards'
    } else if (choice === 'guide') {
      sfx.select()
      openGuide(0, 'title')
    } else if (choice === 'settings') {
      sfx.select()
      openSettings('title')
    } else if (choice && choice !== 'back') {
      sfx.select()
      startGame(choice)
    }
    return
  }
  if (s === 'settings') {
    if (settingsScreen.update(input, dt) === 'back') {
      sfx.back()
      state.screen = state.from
    }
    return
  }
  if (s === 'boards') {
    const d = navX() + (input.pressed('rb') ? 1 : 0) - (input.pressed('lb') ? 1 : 0)
    const tapped = input.pointer.released ? BOARD_MODES.findIndex((_, k) => inside(input.pointer, tabRect(BOARD_MODES, 240, k))) : -1
    if (tapped >= 0 && tapped !== state.boardMode) {
      state.boardMode = tapped
      sfx.ui()
    } else if (d) {
      state.boardMode = (state.boardMode + Math.sign(d) + BOARD_MODES.length) % BOARD_MODES.length
      sfx.ui()
    }
    if (backMenu.update(input, dt)) {
      sfx.back()
      state.screen = 'title'
    }
    return
  }
  if (s === 'guide') {
    const d = navX() + (input.pressed('rb') ? 1 : 0) - (input.pressed('lb') ? 1 : 0)
    const tapped = input.pointer.released ? GUIDE_TABS.findIndex((_, k) => inside(input.pointer, tabRect(GUIDE_TABS, 210, k))) : -1
    if (tapped >= 0 && tapped !== state.guide.tab) {
      state.guide.tab = tapped
      sfx.ui()
    } else if (d) {
      state.guide.tab = (state.guide.tab + Math.sign(d) + GUIDE_TABS.length) % GUIDE_TABS.length
      sfx.ui()
    }
    if (backMenu.update(input, dt)) {
      sfx.back()
      state.screen = state.from
    }
    return
  }
  const g = state.game
  if (s === 'paused') {
    const choice = pauseMenu.update(input, dt)
    if (choice === 'resume' || choice === 'back') {
      sfx.back()
      state.screen = 'playing'
    } else if (choice === 'restart') {
      sfx.select()
      startGame(g.mode)
    } else if (choice === 'settings') {
      sfx.select()
      openSettings('paused')
    } else if (choice === 'guide') {
      sfx.select()
      openGuide(g.mode === 'anomaly' ? 2 : g.mode === 'countdown' ? 3 : 1, 'paused')
    } else if (choice === 'title') {
      sfx.select()
      state.screen = 'title'
    }
    return
  }
  if (s === 'gameover') {
    tickFx(g, dt)
    g.overT += dt
    if (g.entry && g.overT > 0.8) {
      // arcade initials: up/down picks a letter, left/right moves between slots, A saves.
      // Mouse and touch: tap a slot to pick it, tap its top/bottom half to change the letter, tap Save.
      const en = g.entry
      let dx = navX()
      let dy = navY()
      let confirm = input.pressed('a') || input.pressed('menu')
      const p = input.pointer
      if (p.released) {
        const i = [0, 1, 2].findIndex((k) => inside(p, initialRect(k)))
        if (i >= 0 && i !== en.slot) dx = i - en.slot
        else if (i >= 0) dy = p.y < initialRect(i).y + initialRect(i).h / 2 ? -1 : 1
        else if (inside(p, SAVE_BUTTON)) confirm = true
      }
      if (dx) {
        en.slot = (en.slot + dx + 3) % 3
        sfx.ui()
      }
      if (dy) {
        const i = LETTERS.indexOf(en.chars[en.slot])
        en.chars[en.slot] = LETTERS[(i - dy + LETTERS.length) % LETTERS.length]
        sfx.hold()
      }
      if (confirm) {
        const name = en.chars.join('')
        const list = state.boards[g.mode]
        const entry = { name, score: g.score }
        list.push(entry)
        list.sort((a, b) => b.score - a.score)
        list.length = Math.min(list.length, BOARD_SIZE)
        g.rank = list.indexOf(entry) + 1
        saveBoard(g.mode, list)
        saveInitials(name)
        g.entry = null
        g.overT = 0.5 // short pause so the save press doesn't also restart
        overMenu.select('again')
        sfx.mission()
      }
    } else if (!g.entry && g.overT > 0.8) {
      const choice = overMenu.update(input, dt)
      if (choice === 'again') {
        sfx.select()
        startGame(g.mode)
      } else if (choice === 'title' || choice === 'back') {
        sfx.back()
        state.screen = 'title'
      }
    }
    return
  }

  // playing
  const p = input.pointer
  if (p.pressed && inside(p, PAUSE_BUTTON)) input.requestMenu()
  if (input.pressed('menu')) {
    sfx.ui()
    return pause()
  }
  g.t += dt
  const r = radiusOf(g.cur.kind)
  const countdown = g.mode === 'countdown'
  g.dropX = Math.max(LEFT + r, Math.min(RIGHT - r, g.dropX + input.x * (countdown ? CD.shipSpeed : 560) * dt))
  g.cooldown -= dt
  if (countdown && g.cooldown <= 0) {
    // auto-drop fuse: drops the piece where the ship is when it runs out
    const before = g.fuse
    g.fuse -= dt
    if (before > 0.5 && g.fuse <= 0.5) sfx.warn()
  }

  // Mouse and touch: a press in the field (or a hovering mouse) steers the dropper; release drops.
  // The HOLD box and the Pulse buttons are tap targets.
  if (pointerMode() && p.active) {
    const field = { x: J.x - 60, y: 40, w: J.w + 120, h: J.y + J.h - 40 }
    if (p.pressed) {
      if (inside(p, HOLD_BOX[g.mode])) holdPiece(g)
      else if (g.mode === 'anomaly' && PULSE_BUTTONS.some((b) => inside(p, b))) pulse(g, PULSE_BUTTONS.find((b) => inside(p, b)).dir)
      else if (inside(p, field) && !inside(p, PAUSE_BUTTON)) dragging = true
    }
    if (dragging || (input.mode === 'mouse' && !p.down && inside(p, field))) g.dropX = Math.max(LEFT + r, Math.min(RIGHT - r, p.x))
    if (p.released) {
      if (dragging && g.cooldown <= 0) dropPiece(g)
      dragging = false
    }
  } else dragging = false

  if (g.cooldown <= 0 && (input.pressed('a') || (countdown && g.fuse <= 0))) dropPiece(g)
  if (input.pressed('x')) holdPiece(g)
  if (g.mode !== 'anomaly') {
    if (g.chainT > 0) g.chainT -= dt
    else g.chain = 0
  }
  if (countdown) {
    g.clock -= dt
    g.clockKick = (g.clockKick ?? 0) * 0.9
    if (g.clock <= 10 && Math.ceil(g.clock) !== Math.ceil(g.clock + dt)) sfx.warn()
  }
  if (g.mode === 'anomaly') {
    if (input.pressed('lb')) pulse(g, -1)
    if (input.pressed('rb')) pulse(g, 1)
    if (g.chainT > 0) g.chainT -= dt
    else g.chain = 0
    updateDirector(g, dt)
    if (g.missionLog && (g.missionLog.t -= dt) <= 0) g.missionLog = null
    g.missionAlert = Math.max(0, (g.missionAlert ?? 0) - dt)
    g.missionFlash = Math.max(0, (g.missionFlash ?? 0) - dt)
  }

  g.acc = Math.min(g.acc + dt, 0.1)
  while (g.acc >= STEP) {
    step(g)
    g.acc -= STEP
  }

  // specials, ages and the Horizon
  let danger = 0
  for (const b of g.bodies) {
    b.age += dt
    if (b.bouncy && g.event?.id !== 'bounce') b.bouncy = 0
    if (b.meteor) {
      if (b.touched) b.meteor = false
      else if (fx.parts.length < 360) fx.parts.push({ x: b.x + (Math.random() - 0.5) * b.r, y: b.y - b.r * 0.6, vx: 0, vy: -120, life: 0.3, max: 0.3, col: Math.random() < 0.5 ? '#ff8a4c' : '#ffd43b', size: 6 })
    }
    if (b.touched && b.age > 0.6 && b.y - b.r < J.horizon) b.over += dt
    else b.over = Math.max(0, b.over - dt * 2)
    danger = Math.max(danger, b.over)
  }
  if (g.bodies.some((b) => b.dead)) g.bodies = g.bodies.filter((b) => !b.dead)
  g.danger = danger
  if (danger > 0) {
    g.warnT -= dt
    if (g.warnT <= 0) {
      sfx.warn()
      g.warnT = 0.4
    }
  }
  if (countdown) {
    if (danger >= CD.ventLimit) vent(g)
    if (g.clock <= 0) {
      g.clock = 0
      g.timeUp = true
      gameOver(g)
    }
  } else if (danger >= OVER_LIMIT) gameOver(g)
  tickFx(g, dt)
}

function gameOver(g) {
  state.screen = 'gameover'
  overMenu.select('again')
  dragging = false
  g.overT = 0
  if (g.score > state.best[g.mode]) {
    state.best[g.mode] = g.score
    saveBest(g.mode, g.score)
    g.newBest = g.score > 0
  }
  if (qualifies(g.mode, g.score)) g.entry = { chars: loadInitials().split(''), slot: 0 }
  for (const b of g.bodies) if (b.over > 0) burst(b.x, b.y, C.hot, 20, 260)
  shake(g, 10)
  sfx.over()
}

function tickFx(g, dt) {
  for (const p of fx.parts) {
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vx *= 0.94
    p.vy = p.vy * 0.94 + 300 * dt
    p.life -= dt
  }
  fx.parts = fx.parts.filter((p) => p.life > 0)
  for (const r of fx.rings) {
    r.life -= dt
    r.r += (r.max - r.r) * 0.2
  }
  fx.rings = fx.rings.filter((r) => r.life > 0)
  for (const p of fx.pops) {
    p.life -= dt
    p.y -= 50 * dt
  }
  fx.pops = fx.pops.filter((p) => p.life > 0)
  if (g) {
    // the shown score rolls up toward the real one
    const gap = g.score - (g.shown ?? 0)
    if (gap > 0) {
      g.shown = Math.min(g.score, (g.shown ?? 0) + Math.max(1, Math.ceil(gap * Math.min(1, dt * 8))))
      g.scoreKick = Math.min(1, (g.scoreKick ?? 0) + gap / 20000)
    } else g.shown = g.score
    g.scoreKick = Math.max(0, (g.scoreKick ?? 0) - dt * 2)
    if (g.callout && (g.callout.t += dt) > 1.3) g.callout = null
    g.shake *= 0.86
    g.jarKick *= 0.85
    g.flash = Math.max(0, g.flash - dt * 1.5)
  }
}

// ---------- drawing helpers ----------
let bgCanvas = null
function background() {
  if (!bgCanvas) {
    bgCanvas = document.createElement('canvas')
    bgCanvas.width = Math.round(W * pixelScale)
    bgCanvas.height = Math.round(H * pixelScale)
    const c = bgCanvas.getContext('2d')
    c.scale(pixelScale, pixelScale)
    c.fillStyle = '#191241'
    c.fillRect(0, 0, W, H)
    const neb = (x, y, rr, col, a) => {
      const g = c.createRadialGradient(x, y, 0, x, y, rr)
      g.addColorStop(0, rgba(col, a))
      g.addColorStop(1, rgba(col, 0))
      c.fillStyle = g
      c.fillRect(0, 0, W, H)
    }
    neb(W * 0.8, H * 0.25, 520, '#6b2fb3', 0.38)
    neb(W * 0.12, H * 0.9, 480, '#16708f', 0.32)
    neb(W * 0.45, H * 0.5, 380, '#2a1f7a', 0.25)
    const q = rng(7)
    for (let i = 0; i < 190; i++) {
      const s = q()
      c.fillStyle = `rgba(235,230,255,${0.25 + s * 0.6})`
      c.beginPath()
      c.arc(q() * W, q() * H, 0.6 + s * s * 1.8, 0, TAU)
      c.fill()
    }
  }
  ctx.drawImage(bgCanvas, 0, 0, W, H)
}

const TS = () => settings.data.textScale || 1
function text(s, x, y, size, col, align = 'left', font = UI, weight = 700) {
  ctx.font = `${weight} ${Math.round(size * TS())}px ${font}`
  ctx.fillStyle = col
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(s, x, y)
}
function outlined(s, x, y, size, col, align = 'center', lw = 8) {
  ctx.font = `${size}px ${DISP}`
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  if (lw > 0) {
    ctx.lineWidth = lw
    ctx.strokeStyle = '#140b30'
    ctx.strokeText(s, x, y)
  }
  ctx.fillStyle = col
  ctx.fillText(s, x, y)
}
function rrect(x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
function box(x, y, w, h) {
  rrect(x, y, w, h, 18)
  ctx.fillStyle = C.panel
  ctx.fill()
  ctx.save()
  ctx.strokeStyle = C.edge
  ctx.globalAlpha = 0.7
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.restore()
}
// Prompts come from prompts.js for the current device. 'move' and 'tap' are pseudo-buttons.
const promptInput = {
  get mode() {
    return input.mode
  },
  label(b) {
    if (b === 'move') return pointerMode() ? 'Drag' : input.stickLabel()
    if (b === 'tap') return input.mode === 'touch' ? 'Tap' : 'Click'
    return input.label(b)
  }
}
function prompts(pairs, x, y, align = 'left', size = 24) {
  drawPrompts(ctx, promptInput, pairs, { x, y, align, size: size * TS(), color: C.ink, font: `700 ${Math.round(size * TS())}px ${UI}` })
}
/** menu.js menu drawn in the game's style: accent pill on the selected row, Lilita One labels. */
function drawMenu(menu, { align = 'center', size = 32, dy = 42, extra } = {}) {
  menu.items.forEach((it, i) => {
    const r = menu.rect(i)
    const sel = it === menu.selected
    if (sel) {
      rrect(r.x, r.y, r.w, r.h, 14)
      ctx.fillStyle = C.acc
      ctx.fill()
    }
    const tx = align === 'left' ? r.x + 28 : r.x + r.w / 2
    text(it.label.toUpperCase(), tx, r.y + dy, size, sel ? '#1a0f05' : C.ink, align, DISP, 400)
    extra?.(it, r, sel)
  })
}
function drawButton(r, label, { accent = false } = {}) {
  rrect(r.x, r.y, r.w, r.h, 14)
  ctx.fillStyle = accent ? 'rgba(255,179,71,.22)' : 'rgba(255,255,255,.12)'
  ctx.fill()
  ctx.strokeStyle = accent ? C.acc : 'rgba(255,255,255,.35)'
  ctx.lineWidth = 2
  ctx.stroke()
  text(label, r.x + r.w / 2, r.y + r.h / 2 + 9, 24, C.ink, 'center')
}
function drawPauseButton() {
  const r = PAUSE_BUTTON
  rrect(r.x, r.y, r.w, r.h, 14)
  ctx.fillStyle = 'rgba(255,255,255,.12)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,.35)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = C.ink
  ctx.fillRect(r.x + 18, r.y + 16, 7, 24)
  ctx.fillRect(r.x + 31, r.y + 16, 7, 24)
}

function jarPath() {
  const { x, y, w, h } = J
  const r = 30
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x, y + h - r)
  ctx.arcTo(x, y + h, x + r, y + h, r)
  ctx.lineTo(x + w - r, y + h)
  ctx.arcTo(x + w, y + h, x + w, y + h - r, r)
  ctx.lineTo(x + w, y)
}

function surfaceY(g, x, r) {
  let y = FLOOR
  for (const b of g.bodies) {
    const dx = Math.abs(b.x - x)
    const reach = b.r + r * 0.2
    if (dx < reach) y = Math.min(y, b.y - Math.sqrt(reach * reach - dx * dx))
  }
  return y
}

// ---------- scenes ----------
function drawField(g) {
  ctx.save()
  const sx = g.shake ? (Math.random() - 0.5) * g.shake : 0
  const sy = g.shake ? (Math.random() - 0.5) * g.shake : 0
  ctx.translate(sx + g.jarKick, sy)

  jarPath()
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,.05)'
  ctx.fill()

  // dropper, aim line and the piece waiting to drop
  const playing = state.screen === 'playing' || state.screen === 'paused'
  if (playing) {
    const cr = radiusOf(g.cur.kind)
    const ready = g.cooldown <= 0
    const k = ready ? 1 : Math.max(0.2, 1 - g.cooldown / 0.45)
    const sy2 = surfaceY(g, g.dropX, cr)
    if (ready) {
      ctx.save()
      ctx.setLineDash([2, 14])
      ctx.lineCap = 'round'
      ctx.strokeStyle = 'rgba(255,255,255,.45)'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(g.dropX, DROP_Y + cr + 8)
      ctx.lineTo(g.dropX, sy2 - 6)
      ctx.stroke()
      ctx.restore()
    }
    drawShip(g.dropX, cr)
    drawPiece({ kind: g.cur.kind, ice: g.cur.ice, a: 0 }, g.dropX, DROP_Y, cr * k)
    if (g.mode === 'countdown' && ready) {
      const f = Math.max(0, g.fuse / g.fuseMax)
      const hot = g.fuse <= 0.5
      ctx.save()
      ctx.strokeStyle = hot ? (Math.floor(state.t * 12) % 2 ? C.hot : '#fff') : 'rgba(255,255,255,.75)'
      ctx.lineWidth = 5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(g.dropX, DROP_Y, cr + 9, -Math.PI / 2, -Math.PI / 2 + TAU * f)
      ctx.stroke()
      ctx.restore()
    }
  }

  if (g.mission) drawMissionMarks(g, g.mission)
  for (const b of g.bodies) drawPiece(b, b.x, b.y, b.r)
  if (g.wind) drawWind(g)
  if (g.vortex) drawVortex(g)
  if (polarized(g)) {
    ctx.fillStyle = `rgba(255,122,192,${0.06 + 0.04 * Math.sin(state.t * 6)})`
    ctx.fillRect(J.x + 6, J.y, J.w - 12, J.h)
  }

  // jar walls
  ctx.save()
  jarPath()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#0d0828'
  ctx.lineWidth = 14
  ctx.stroke()
  ctx.strokeStyle = C.jar
  ctx.lineWidth = 8
  ctx.stroke()
  ctx.restore()

  // the Horizon
  const danger = g.danger / overLimit(g)
  ctx.save()
  ctx.setLineDash([18, 12])
  ctx.lineDashOffset = -state.t * 30
  const blink = danger > 0 ? 0.5 + 0.5 * Math.sin(state.t * 20) : 0
  ctx.strokeStyle = danger > 0 ? `rgba(255,${90 - 60 * blink},${122 - 80 * blink},1)` : rgba(C.hot, 0.8)
  ctx.lineWidth = danger > 0 ? 6 : 4
  ctx.beginPath()
  ctx.moveTo(J.x + 8, J.horizon)
  ctx.lineTo(J.x + J.w - 8, J.horizon)
  ctx.stroke()
  ctx.restore()
  if (danger > 0) {
    ctx.fillStyle = rgba(C.hot, 0.12 + 0.1 * blink)
    ctx.fillRect(J.x + 6, J.y, J.w - 12, J.horizon - J.y)
  }

  // effects
  for (const r of fx.rings) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, r.life / 0.4)
    ctx.strokeStyle = r.col
    ctx.lineWidth = r.width
    ctx.beginPath()
    ctx.arc(r.x, r.y, r.r, 0, TAU)
    ctx.stroke()
    ctx.restore()
  }
  for (const p of fx.parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.3))
    ctx.fillStyle = p.col
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
  }
  ctx.globalAlpha = 1
  for (const p of fx.pops) {
    ctx.save()
    ctx.globalAlpha = Math.min(1, p.life * 2)
    outlined(p.text, p.x, p.y, p.size, p.col)
    ctx.restore()
  }
  if (g.callout) {
    // big-merge callout: punches in, holds, fades
    const t = g.callout.t
    const k = t < 0.15 ? 0.6 + (t / 0.15) * 0.6 : t < 0.3 ? 1.2 - ((t - 0.15) / 0.15) * 0.2 : 1
    ctx.save()
    ctx.globalAlpha = Math.min(1, (1.3 - t) * 3)
    ctx.translate(J.x + J.w / 2, J.y + 70)
    ctx.scale(k, k)
    outlined(g.callout.text, 0, 0, 64, g.callout.col, 'center', 10)
    ctx.restore()
  }
  ctx.restore()
}

function drawMissionMarks(g, m) {
  ctx.save()
  const k = 0.5 + 0.5 * Math.sin(state.t * 4)
  if (m.type === 'zone') {
    const { x, y, r } = m.zone
    ctx.fillStyle = rgba(C.acc, 0.08 + 0.06 * k)
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
    ctx.setLineDash([14, 10])
    ctx.lineDashOffset = -state.t * 20
    ctx.strokeStyle = rgba(C.acc, 0.7 + 0.3 * k)
    ctx.lineWidth = 5
    ctx.stroke()
  } else if (m.type === 'tidy') {
    const bad = m.count === 0 && g.bodies.some((b) => settled(b) && b.y - b.r < m.line)
    ctx.setLineDash([10, 10])
    ctx.lineDashOffset = state.t * 30
    ctx.strokeStyle = bad ? rgba('#ffd43b', 0.45 + 0.5 * k) : '#ffd43b'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(J.x + 8, m.line)
    ctx.lineTo(J.x + J.w - 8, m.line)
    ctx.stroke()
  }
  ctx.restore()
}

function spinIcon(cx, cy, dir, col) {
  ctx.save()
  ctx.strokeStyle = col
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  const a0 = state.t * 3 * dir
  for (let i = 0; i < 2; i++) {
    ctx.beginPath()
    ctx.arc(cx, cy, 16, a0 + i * Math.PI, a0 + i * Math.PI + 2)
    ctx.stroke()
  }
  ctx.restore()
}

// slow rotating spiral arms around the vortex centre
function drawVortex(g) {
  const k = Math.min(1, Math.abs(g.vortex) / TUNING.vortexForce[0])
  const dir = Math.sign(g.vortex)
  ctx.save()
  ctx.beginPath()
  ctx.rect(J.x + 6, J.y, J.w - 12, J.h)
  ctx.clip()
  ctx.strokeStyle = '#d9c2ff'
  ctx.lineCap = 'round'
  ctx.lineWidth = 3
  for (let i = 0; i < 6; i++) {
    const base = state.t * 1.6 * dir + (i / 6) * TAU
    ctx.globalAlpha = 0.3 * k
    ctx.beginPath()
    for (let j = 0; j <= 16; j++) {
      const rr = 40 + j * 14
      const a = base - dir * j * 0.14
      const px = VORTEX.x + Math.cos(a) * rr
      const py = VORTEX.y + Math.sin(a) * rr
      if (j === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function drawWind(g) {
  const k = Math.min(1, Math.abs(g.wind) / TUNING.windForce[0])
  const dir = Math.sign(g.wind)
  ctx.save()
  ctx.beginPath()
  ctx.rect(J.x + 6, J.y, J.w - 12, J.h)
  ctx.clip()
  ctx.strokeStyle = '#ffe9a8'
  ctx.lineCap = 'round'
  ctx.lineWidth = 3
  for (let i = 0; i < 12; i++) {
    const y = J.y + 30 + ((i * 97) % (J.h - 60))
    const len = 50 + ((i * 37) % 60)
    const x = J.x + ((((state.t * 700 + i * 173) % (J.w + len)) + J.w + len) % (J.w + len)) - len
    const sx = dir > 0 ? x : J.x + J.w - (x - J.x) - len
    ctx.globalAlpha = 0.35 * k
    ctx.beginPath()
    ctx.moveTo(sx, y)
    ctx.lineTo(sx + len, y)
    ctx.stroke()
  }
  ctx.restore()
}

function arrow(x, y, dir, col, size = 14) {
  ctx.save()
  ctx.strokeStyle = col
  ctx.fillStyle = col
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - dir * size, y)
  ctx.lineTo(x + dir * size * 0.4, y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + dir * size, y)
  ctx.lineTo(x, y - size * 0.7)
  ctx.lineTo(x, y + size * 0.7)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function hazardIcon(cx, cy, s, col) {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(cx, cy - s)
  ctx.lineTo(cx + s * 1.1, cy + s * 0.85)
  ctx.lineTo(cx - s * 1.1, cy + s * 0.85)
  ctx.closePath()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 5
  ctx.strokeStyle = col
  ctx.stroke()
  ctx.restore()
  outlined('!', cx, cy + s * 0.62, s * 1.2, col, 'center', 0)
}

// static noise over a HUD box while Signal Jam is active
function jamBox(x, y, w, h) {
  ctx.save()
  rrect(x, y, w, h, 18)
  ctx.fillStyle = '#1b1440'
  ctx.fill()
  ctx.clip()
  const seed = Math.floor(state.t * 20)
  for (let i = 0; i < 90; i++) {
    const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
    const f = v - Math.floor(v)
    const v2 = Math.sin(seed * 39.3468 + i * 11.135) * 24634.6345
    const f2 = v2 - Math.floor(v2)
    ctx.fillStyle = `rgba(200,190,255,${0.15 + f * 0.35})`
    ctx.fillRect(x + f * w, y + f2 * h, 6 + f2 * 26, 3)
  }
  ctx.restore()
  outlined('???', x + w / 2, y + h / 2 + 14, 40, C.muted, 'center', 6)
}

function drawShip(x, r) {
  ctx.save()
  ctx.fillStyle = 'rgba(201,210,255,.14)'
  ctx.beginPath()
  ctx.moveTo(x - 18, 62)
  ctx.lineTo(x + 18, 62)
  ctx.lineTo(x + r + 6, DROP_Y)
  ctx.lineTo(x - r - 6, DROP_Y)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(x, 52, 40, 12, 0, 0, TAU)
  ctx.fillStyle = '#c9d2ff'
  ctx.fill()
  ctx.strokeStyle = '#2b2160'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(x, 46, 18, 14, 0, Math.PI, TAU)
  ctx.closePath()
  ctx.fillStyle = '#8f7dff'
  ctx.fill()
  ctx.stroke()
  const blink = Math.floor(state.t * 3) % 3
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i === blink ? '#ffe36e' : '#7d6cff'
    ctx.beginPath()
    ctx.arc(x - 22 + i * 22, 54, 3.5, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

function drawPiece(b, x, y, r) {
  drawKind(ctx, b.kind, x, y, r, b.a)
  if (b.bouncy) {
    ctx.save()
    ctx.strokeStyle = '#7dff9a'
    ctx.globalAlpha = 0.7
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(x, y, r + 4, 0, TAU)
    ctx.stroke()
    ctx.restore()
  }
  if (b.ice) {
    ctx.save()
    ctx.translate(x, y)
    drawIce(ctx, r)
    ctx.restore()
  }
  if (b.over > 0) {
    ctx.save()
    ctx.strokeStyle = C.hot
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(x, y, r + 8, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, b.over / overLimit(state.game)))
    ctx.stroke()
    ctx.restore()
  }
}

// Classic sidebar: a zigzag climb from Stardust (bottom) to Black Hole (top)
function ladder(cx, top, bottom, reached) {
  const n = TIERS.length
  const pts = []
  for (let i = 0; i < n; i++) pts.push([cx + (i % 2 ? 60 : -60), bottom - (i * (bottom - top)) / (n - 1)])
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([4, 9])
  ctx.strokeStyle = 'rgba(185,174,232,.3)'
  ctx.lineWidth = 4
  ctx.beginPath()
  pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y))
  ctx.stroke()
  ctx.setLineDash([])
  ctx.strokeStyle = C.acc
  ctx.lineWidth = 5
  ctx.beginPath()
  pts.slice(0, reached + 1).forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y))
  ctx.stroke()
  ctx.restore()
  pts.forEach(([x, y], i) => {
    const r = 9 + i * 1.3
    if (i === reached + 1) {
      // the next object to aim for pulses gently
      ctx.save()
      ctx.strokeStyle = C.acc
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(state.t * 4)
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(x, y, r + 7, 0, TAU)
      ctx.stroke()
      ctx.restore()
    }
    ctx.globalAlpha = i > reached ? 0.4 : 1
    drawKind(ctx, i, x, y, r)
    ctx.globalAlpha = 1
  })
}

function drawHUD(g) {
  const anomaly = g.mode === 'anomaly'
  const countdown = g.mode === 'countdown'
  text('SCORE', 64, 122, 24, C.muted)
  const shown = (g.shown ?? g.score).toLocaleString('en-US')
  ctx.font = `54px ${DISP}`
  const fit = Math.min(54, Math.floor((54 * 290) / ctx.measureText(shown).width))
  const kick = g.scoreKick ?? 0
  outlined(shown, 64, 180, fit * (1 + kick * 0.12), kick > 0.05 ? '#fff3c4' : C.ink, 'left', 0)
  if (!anomaly) {
    text('BEST', 64, 228, 24, C.muted)
    text(Math.max(state.best[g.mode], g.score).toLocaleString('en-US'), 64, 266, 32, C.acc, 'left', DISP, 400)
    // Classic shows its chain here; Countdown shows it under the clock
    const hy = countdown ? 0 : 40
    if (!countdown) {
      text('CHAIN', 64, 316, 24, C.muted)
      const chain = g.chainT > 0 ? g.chain : 0
      outlined(chain > 1 ? `×${chain}` : '×1', 150, 318, 34, chain > 1 ? C.acc : C.muted, 'left', 0)
      if (g.chainT > 0) {
        rrect(204, 302, Math.max(10, 70 * (g.chainT / CHAIN_WINDOW)), 12, 6)
        ctx.fillStyle = C.acc
        ctx.fill()
      }
    }
    text('HOLD', 64, 336 + hy, 24, C.muted)
    box(64, 354 + hy, 210, 190 - hy)
    if (g.hold) drawPiece({ kind: g.hold.kind, ice: g.hold.ice, a: 0 }, 169, 449 + hy / 2, Math.min(64 - hy / 4, radiusOf(g.hold.kind) * 1.4))
    if (!g.canHold) {
      rrect(64, 354 + hy, 210, 190 - hy, 18)
      ctx.fillStyle = 'rgba(14,10,31,.45)'
      ctx.fill()
    }
    if (pointerMode()) {
      prompts([['tap', 'Drop']], 64, 636)
      prompts([['tap', 'Hold box']], 64, 686)
    } else {
      prompts([['a', 'Drop']], 64, 636)
      prompts([['x', 'Hold']], 64, 686)
      prompts([['menu', 'Pause']], 64, 736)
    }
  } else {
    text('CHAIN', 64, 236, 24, C.muted)
    const chain = g.chainT > 0 ? g.chain : 0
    outlined(chain > 1 ? `×${chain}` : '×1', 64, 292, 52, chain > 1 ? C.acc : C.muted, 'left', 0)
    rrect(150, 262, 124, 16, 8)
    ctx.fillStyle = 'rgba(255,255,255,.12)'
    ctx.fill()
    if (g.chainT > 0) {
      rrect(150, 262, Math.max(16, 124 * (g.chainT / CHAIN_WINDOW)), 16, 8)
      ctx.fillStyle = C.acc
      ctx.fill()
    }
    text('PULSE', 64, 352, 24, C.muted)
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.arc(84 + i * 40, 384, 13, 0, TAU)
      ctx.fillStyle = i < g.pulses ? C.ice : 'rgba(255,255,255,.15)'
      ctx.fill()
    }
    text('HOLD', 64, 456, 24, C.muted)
    box(64, 474, 210, 140)
    if (jammed(g)) jamBox(64, 474, 210, 140)
    else if (g.cur.locked || g.hold?.locked) {
      if (g.hold) drawPiece({ kind: g.hold.kind, ice: g.hold.ice, a: 0 }, 169, 544, Math.min(52, radiusOf(g.hold.kind) * 1.3))
      rrect(64, 474, 210, 140, 18)
      ctx.fillStyle = 'rgba(14,10,31,.6)'
      ctx.fill()
      outlined('LOCKED', 169, 556, 34, C.hot, 'center', 6)
    } else if (g.hold) drawPiece({ kind: g.hold.kind, ice: g.hold.ice, a: 0 }, 169, 544, Math.min(52, radiusOf(g.hold.kind) * 1.3))
    if (!g.canHold) {
      rrect(64, 474, 210, 140, 18)
      ctx.fillStyle = 'rgba(14,10,31,.45)'
      ctx.fill()
    }
    if (pointerMode()) {
      prompts([['tap', 'Drop']], 64, 652)
      drawButton(PULSE_BUTTONS[0], '‹ Pulse', { accent: g.pulses > 0 })
      drawButton(PULSE_BUTTONS[1], 'Pulse ›', { accent: g.pulses > 0 })
    } else {
      prompts([['a', 'Drop']], 64, 652)
      prompts([['x', 'Hold']], 64, 700)
      prompts([['lb', ''], ['rb', 'Pulse']], 64, 748)
    }
  }

  // right column
  text('NEXT', 950, 122, 24, C.muted)
  if (countdown) {
    box(950, 140, 266, 190)
    drawPiece({ kind: g.next.kind, ice: g.next.ice, a: 0 }, 1083, 235, Math.min(70, radiusOf(g.next.kind) * 1.6))
    drawClock(g)
  } else if (!anomaly) {
    box(950, 140, 266, 190)
    drawPiece({ kind: g.next.kind, ice: g.next.ice, a: 0 }, 1083, 235, Math.min(70, radiusOf(g.next.kind) * 1.6))
    text('ASCENT', 1083, 384, 24, C.muted, 'center')
    ladder(1083, 420, 744, g.maxTier)
  } else {
    box(950, 140, 266, 150)
    if (jammed(g)) jamBox(950, 140, 266, 150)
    else drawPiece({ kind: g.next.kind, ice: g.next.ice, a: 0 }, 1083, 215, Math.min(56, radiusOf(g.next.kind) * 1.3))
    box(950, 316, 266, 186)
    const m = g.mission
    const urgent = m && m.time <= 10
    if (g.missionFlash > 0 || urgent) {
      const k = urgent && !(g.missionFlash > 0) ? 0.5 + 0.5 * Math.sin(state.t * 10) : Math.min(1, g.missionFlash) * (0.55 + 0.45 * Math.sin(state.t * 12))
      ctx.save()
      rrect(950, 316, 266, 186, 18)
      ctx.strokeStyle = urgent && !(g.missionFlash > 0) ? C.hot : C.acc
      ctx.globalAlpha = k
      ctx.lineWidth = 6
      ctx.shadowColor = ctx.strokeStyle
      ctx.shadowBlur = 24
      ctx.stroke()
      ctx.globalAlpha = k * 0.12
      ctx.fillStyle = ctx.strokeStyle
      ctx.fill()
      ctx.restore()
    }
    if (m) {
      text(m.hard ? 'HARD SIGNAL' : 'TRANSMISSION', 972, 352, 22, m.hard ? C.hot : C.acc)
      text(m.text, 972, 392, 26, C.ink)
      rrect(972, 408, 222, 12, 6)
      ctx.fillStyle = 'rgba(255,255,255,.12)'
      ctx.fill()
      rrect(972, 408, Math.max(12, 222 * Math.max(0, Math.min(1, m.count / m.goal))), 12, 6)
      ctx.fillStyle = m.hard ? C.hot : C.acc
      ctx.fill()
      text(missionProgress(g, m), 972, 452, 24, C.ink)
      const secs = Math.max(0, Math.ceil(m.time))
      text(fmtTime(secs), 1194, 452, 24, secs <= 10 ? C.hot : C.muted, 'right')
      text(`Reward: ${m.reward.text}`, 972, 488, 24, C.muted)
    } else if (g.missionLog) {
      outlined(g.missionLog.text.split(' ')[0], 1083, 400, 34, g.missionLog.col, 'center', 6)
      if (g.missionLog.text.includes(' ')) outlined(g.missionLog.text.split(' ').slice(1).join(' '), 1083, 444, 34, g.missionLog.col, 'center', 6)
    } else {
      text('TRANSMISSION', 972, 356, 22, C.muted)
      text('Awaiting signal' + '.'.repeat(1 + (Math.floor(state.t * 2) % 3)), 972, 420, 24, C.muted)
    }
    drawEventBox(g)
  }
  if (state.screen === 'playing') drawPauseButton()
}

function drawClock(g) {
  const secs = Math.max(0, g.clock)
  const low = secs <= 10
  text('TIME', 1083, 390, 24, C.muted, 'center')
  const kick = g.clockKick ?? 0
  const size = 96 + Math.abs(kick) * 18
  const col = kick < -0.2 || (low && Math.floor(state.t * 4) % 2) ? C.hot : kick > 0.2 ? C.ice : low ? '#ffd0dc' : C.ink
  outlined(secs >= 10 ? String(Math.ceil(secs)) : secs.toFixed(1), 1083, 484, size, col, 'center', 8)
  text('CHAIN', 950, 592, 24, C.muted)
  const chain = g.chainT > 0 ? g.chain : 0
  outlined(chain > 1 ? `×${chain}` : '×1', 950, 652, 52, chain > 1 ? C.acc : C.muted, 'left', 0)
  rrect(1040, 622, 176, 16, 8)
  ctx.fillStyle = 'rgba(255,255,255,.12)'
  ctx.fill()
  if (g.chainT > 0) {
    rrect(1040, 622, Math.max(16, 176 * (g.chainT / CHAIN_WINDOW)), 16, 8)
    ctx.fillStyle = C.acc
    ctx.fill()
  }
  if (g.vents) {
    text(`VENTS ${g.vents}`, 950, 722, 24, C.hot)
    text(`next −${ventCost(g)}s`, 1216, 722, 24, '#ffb3c2', 'right')
  } else text('Merges add time', 1083, 722, 24, C.muted, 'center')
}

function drawEventBox(g) {
  const x = 950
  const y = 528
  const w = 266
  const h = 210
  box(x, y, w, h)
  const e = g.event
  if (!e) {
    text('COSMIC EVENT', x + 22, y + 40, 22, C.muted)
    text('Calm skies', x + 22, y + 96, 26, C.ink)
    if (g.nextUp === 'event' && !g.mission) text(`Next in ${fmtTime(Math.max(0, Math.ceil(g.calm)))}`, x + 22, y + 140, 24, C.muted)
    else text('After a signal', x + 22, y + 140, 24, C.muted)
    if (g.amplified) outlined('AMPLIFIED', x + 22, y + 186, 28, C.hot, 'left', 5)
    return
  }
  const ev = EVENTS[e.id]
  const warn = e.phase === 'warn'
  if (warn) {
    const k = 0.5 + 0.5 * Math.sin(state.t * 14)
    ctx.save()
    rrect(x, y, w, h, 18)
    ctx.strokeStyle = C.hot
    ctx.globalAlpha = k
    ctx.lineWidth = 6
    ctx.shadowColor = C.hot
    ctx.shadowBlur = 24
    ctx.stroke()
    ctx.globalAlpha = k * 0.12
    ctx.fillStyle = C.hot
    ctx.fill()
    ctx.restore()
  }
  hazardIcon(x + 36, y + 32, 15, warn ? C.hot : ev.col)
  text(warn ? (e.boost ? 'AMPLIFIED' : 'WARNING') : 'ACTIVE', x + 62, y + 42, 22, warn ? C.hot : ev.col)
  const words = ev.name.split(' ')
  outlined(words[0], x + 22, y + 90, 32, ev.col, 'left', 6)
  outlined(words.slice(1).join(' '), x + 22, y + 128, 32, ev.col, 'left', 6)
  if (e.id === 'wind') arrow(x + w - 44, y + 112, e.dir, ev.col, 18)
  if (e.id === 'vortex') spinIcon(x + w - 44, y + 112, e.dir, ev.col)
  if (warn) text(`Hits in ${Math.max(1, Math.ceil(e.t))}`, x + 22, y + 180, 24, C.ink)
  else if (e.dropsMax) {
    outlined(`×${TUNING.eventScoreMult} PTS`, x + w - 22, y + 42, 26, C.acc, 'right', 5)
    text(e.drops > 0 ? `${e.drops} drop${e.drops > 1 ? 's' : ''} left` : 'Fading...', x + 22, y + 182, 26, C.ink)
  } else {
    outlined(`×${TUNING.eventScoreMult} PTS`, x + w - 22, y + 42, 26, C.acc, 'right', 5)
    rrect(x + 22, y + 166, w - 44, 14, 7)
    ctx.fillStyle = 'rgba(255,255,255,.12)'
    ctx.fill()
    rrect(x + 22, y + 166, Math.max(14, (w - 44) * Math.max(0, e.t / e.max)), 14, 7)
    ctx.fillStyle = ev.col
    ctx.fill()
  }
}

function logo(s, x, y, size) {
  ctx.font = `${size}px ${DISP}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 18
  ctx.strokeStyle = '#140b30'
  ctx.strokeText(s, x, y)
  const g = ctx.createLinearGradient(0, y - size, 0, y)
  g.addColorStop(0, '#ffe3a3')
  g.addColorStop(0.6, '#ffb347')
  g.addColorStop(1, '#ff6a8a')
  ctx.fillStyle = g
  ctx.fillText(s, x, y)
}

const ORBITERS = [
  { k: 6, r: 62, cx: 960, cy: 380, d: 330, s: 0.12, p: 4.6 },
  { k: 4, r: 42, cx: 960, cy: 380, d: 300, s: -0.09, p: 2.4 },
  { k: 2, r: 28, cx: 960, cy: 380, d: 230, s: 0.18, p: 3.6 },
  { k: 0, r: 18, cx: 960, cy: 380, d: 270, s: -0.15, p: 0.9 }
]
function drawTitle() {
  background()
  const t = state.t
  for (const o of ORBITERS) {
    const a = o.p + t * o.s
    drawKind(ctx, o.k, o.cx + Math.cos(a) * o.d, o.cy + Math.sin(a) * o.d * 0.9, o.r, Math.sin(t + o.p) * 0.2)
  }
  drawKind(ctx, BLACK_HOLE, 960, 380, 240 + Math.sin(t * 1.5) * 4, Math.sin(t * 0.5) * 0.05)

  logo('SINGULARITY', 96, 250, 110)
  text('Merge your way to a black hole', 100, 304, 28, C.muted)
  drawMenu(titleMenu, {
    align: 'left',
    size: 30,
    dy: 39,
    extra: (it, r, sel) => {
      if (!BOARD_MODES.includes(it.id)) return
      ctx.font = `400 30px ${DISP}`
      const room = 580 - (112 + ctx.measureText(it.label.toUpperCase()).width + 28)
      text(fitScore('BEST ', state.best[it.id], room), 580, r.y + 37, 24, sel ? '#4a2a08' : C.muted, 'right')
    }
  })
  const blurb = {
    classic: 'Pure merging. How far up the cycle can you get?',
    anomaly: 'Wormholes, ice, missions and cosmic events.',
    countdown: 'A race against the clock. Merges add time!',
    boards: 'Top 10 scores for each mode.',
    guide: 'Controls and special objects.',
    settings: 'Volume, screen shake and text size.'
  }[titleMenu.selected.id]
  text(blurb, 100, 700, 24, C.muted)
  prompts([['a', 'Select'], ['menu', 'Pause in play']], 96, 748)
}

// "BEST 1,234,567", or a compact "BEST 1.23B" when the full number won't fit in `room` px
function fitScore(prefix, n, room) {
  ctx.font = `700 24px ${UI}`
  const full = prefix + n.toLocaleString('en-US')
  if (ctx.measureText(full).width <= room) return full
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]
  for (const [v, u] of units) {
    if (n < v) continue
    for (const digits of [2, 1, 0]) {
      const str = prefix + Number((n / v).toFixed(digits)) + u
      if (ctx.measureText(str).width <= room || digits === 0) return str
    }
  }
  return full
}

function drawBoards() {
  background()
  ctx.fillStyle = 'rgba(12,8,30,.6)'
  ctx.fillRect(0, 0, W, H)
  outlined('LEADERBOARDS', W / 2, 96, 52, C.acc)
  drawMenu(backMenu, { size: 26, dy: 34 })
  const tw = 240
  const gap = TAB_GAP
  const tx = tabRect(BOARD_MODES, tw, 0).x
  BOARD_MODES.forEach((mode, i) => {
    const x = tx + i * (tw + gap)
    const sel = i === state.boardMode
    rrect(x, 124, tw, 52, 14)
    ctx.fillStyle = sel ? C.acc : 'rgba(255,255,255,.07)'
    ctx.fill()
    text(mode.toUpperCase(), x + tw / 2, 160, 28, sel ? '#1a0f05' : C.muted, 'center', DISP, 400)
  })
  if (!pointerMode()) {
    prompts([['lb', '']], tx - 70, 150)
    prompts([['rb', '']], tx + BOARD_MODES.length * (tw + gap) - gap + 18, 150)
  }
  drawBoard(BOARD_MODES[state.boardMode], W / 2 - 330, 200, 660, 552)
}

function drawBoard(mode, x, y, w, h) {
  rrect(x, y, w, h, 22)
  ctx.fillStyle = 'rgba(16,10,40,.92)'
  ctx.fill()
  ctx.strokeStyle = C.edge
  ctx.lineWidth = 3
  ctx.stroke()
  const list = state.boards[mode]
  if (!list.length) {
    text('No scores yet.', x + w / 2, y + h / 2 - 10, 28, C.muted, 'center')
    text('Be the first!', x + w / 2, y + h / 2 + 32, 28, C.muted, 'center')
    return
  }
  const mine = loadInitials()
  for (let i = 0; i < BOARD_SIZE; i++) {
    const ry = y + 66 + i * 50
    const e = list[i]
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,.04)'
      ctx.fillRect(x + 16, ry - 34, w - 32, 48)
    }
    const col = i === 0 ? '#ffe3a3' : e && e.name === mine ? C.ink : C.muted
    text(`${i + 1}.`, x + 84, ry, 30, i === 0 ? C.acc : C.muted, 'right')
    text(e ? e.name : '---', x + 112, ry, 30, e ? col : 'rgba(185,174,232,.35)', 'left', DISP, 400)
    if (e) text(e.score.toLocaleString('en-US'), x + w - 40, ry, 30, col, 'right')
  }
}

function drawGuide() {
  if (state.guide.from === 'paused') {
    background()
    drawField(state.game)
  } else background()
  ctx.fillStyle = 'rgba(12,8,30,.86)'
  ctx.fillRect(0, 0, W, H)
  outlined('FIELD GUIDE', W / 2, 96, 52, C.acc)
  drawMenu(backMenu, { size: 26, dy: 34 })

  // tabs (tappable)
  const tw = 210
  const gap = TAB_GAP
  const tx = tabRect(GUIDE_TABS, tw, 0).x
  GUIDE_TABS.forEach((name, i) => {
    const x = tx + i * (tw + gap)
    const sel = i === state.guide.tab
    rrect(x, 124, tw, 52, 14)
    ctx.fillStyle = sel ? C.acc : 'rgba(255,255,255,.07)'
    ctx.fill()
    text(name.toUpperCase(), x + tw / 2, 160, 28, sel ? '#1a0f05' : C.muted, 'center', DISP, 400)
  })
  if (!pointerMode()) {
    prompts([['lb', '']], tx - 70, 150)
    prompts([['rb', '']], tx + GUIDE_TABS.length * (tw + gap) - gap + 18, 150)
  }

  const tab = state.guide.tab
  if (tab === 0) {
    text('Drop objects into the field. Two of the same kind fuse into the next one.', W / 2, 250, 26, C.ink, 'center')
    for (let i = 0; i < TIERS.length; i++) {
      const x = 100 + i * 98
      drawKind(ctx, i, x, 320, 15 + i * 2.4)
      if (i < TIERS.length - 1) text('›', x + 49, 330, 30, C.muted, 'center')
    }
    text('Keep everything below the red Horizon. Anything resting above it for 2 seconds ends the run.', W / 2, 410, 24, C.muted, 'center')
    text("Each merge scores the new object's points. Two Black Holes open a Singularity!", W / 2, 448, 24, C.muted, 'center')
    text('Hold stores the current object for later. You can swap once per drop.', W / 2, 486, 24, C.muted, 'center')
    if (pointerMode()) {
      prompts([['move', 'Aim'], ['tap', 'Drop'], ['tap', 'Hold box to hold'], ['menu', 'Pause']], W / 2, 560, 'center')
      prompts([['tap', 'Pulse buttons: Gravity Pulse (Anomaly only)']], W / 2, 616, 'center')
    } else {
      prompts([['move', 'Aim'], ['a', 'Drop'], ['x', 'Hold'], ['menu', 'Pause']], W / 2, 560, 'center')
      prompts([['lb', ''], ['rb', 'Gravity Pulse (Anomaly only)']], W / 2, 616, 'center')
    }
  } else if (tab === 1) {
    const cw = 284
    const ch = 124
    const x0 = (W - (4 * cw + 3 * 10)) / 2
    for (let i = 0; i < TIERS.length; i++) {
      const x = x0 + (i % 4) * (cw + 10)
      const y = 196 + Math.floor(i / 4) * (ch + 12)
      box(x, y, cw, ch)
      const drops = i < WEIGHTS.length
      drawKind(ctx, i, x + 50, y + ch / 2, Math.min(40, R[i] * 0.85))
      text(TIERS[i].name, x + 98, y + 52, 24, C.ink)
      text(drops ? `+${PTS[i]} · drops in` : `+${PTS[i]} pts`, x + 98, y + 88, 24, drops ? C.acc : C.muted)
    }
    // the finale
    const x = W / 2 - 450
    const y = 196 + 3 * (ch + 12)
    box(x, y, 900, ch)
    drawKind(ctx, BLACK_HOLE, x + 58, y + ch / 2, 34)
    drawKind(ctx, BLACK_HOLE, x + 112, y + ch / 2, 34)
    text('Singularity', x + 170, y + 52, 26, C.ink)
    text(`+${SINGULARITY.bonus.toLocaleString('en-US')}, then it swallows everything nearby for points`, x + 170, y + 88, 24, C.acc)
  } else if (tab === 3) {
    drawCountdownGuide()
  } else {
    const rows = [
      ['event', 'Cosmic Events', 'Hazards that take turns with Transmissions. Merges during one score double.'],
      ['worm', 'Wormhole', 'Rare. Pushes the first object it touches one step up the cycle.'],
      ['ice', 'Frozen', "Can't merge until a merge happens right next to it. Appears after 2:00."],
      ['pulse', 'Gravity Pulse', 'Shoves the whole field left or right. 3 charges; Jupiter or bigger refills one.'],
      ['chain', 'Chain', `Merges within ${CHAIN_WINDOW} seconds of each other multiply points, up to ×5.`],
      ['tx', 'Transmissions', 'Timed goals that get harder over the run. Fail one and the next event is amplified.']
    ]
    rows.forEach(([k, name, desc], i) => {
      const y = 200 + i * 90
      const cx = 150
      const cy = y + 40
      if (k === 'worm') drawKind(ctx, k, cx, cy, 32)
      else if (k === 'event') hazardIcon(cx, cy, 26, C.hot)
      else if (k === 'ice') {
        drawKind(ctx, 4, cx, cy, 30)
        ctx.save()
        ctx.translate(cx, cy)
        drawIce(ctx, 30)
        ctx.restore()
      } else if (k === 'pulse') {
        prompts(pointerMode() ? [['tap', '']] : [['lb', ''], ['rb', '']], cx, cy, 'center', 22)
      } else if (k === 'chain') outlined('×3', cx, cy + 14, 40, C.acc, 'center', 6)
      else {
        rrect(cx - 34, cy - 24, 68, 48, 10)
        ctx.strokeStyle = C.edge
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.strokeStyle = C.acc
        ctx.lineWidth = 4
        ctx.lineCap = 'round'
        for (let j = 1; j <= 3; j++) {
          ctx.beginPath()
          ctx.arc(cx - 20, cy + 14, j * 9, -Math.PI / 2, 0)
          ctx.stroke()
        }
      }
      text(name, 220, y + 30, 26, C.ink)
      text(desc, 220, y + 66, 24, C.muted)
    })
  }
}

function drawCountdownGuide() {
  const rows = [
    ['clock', 'The clock', `You start with ${CD.start} seconds. When it reaches zero, the run is over.`],
    ['time', 'Merges add time', `Bigger merges add more: Saturn +${CD.timeFor[6]}s, Sun +${CD.timeFor[8]}s, Collapse +${CD.collapseTime}s.`],
    ['vent', 'Vent', `Above the Horizon for ${CD.ventLimit}s gets sucked out: −${CD.ventPenalty}s, +${CD.ventStep}s more each time.`],
    ['fuse', 'Auto-drop', 'A ring drains around your piece, then it drops itself. Hold resets it.'],
    ['chain', 'Chain', `Merges within ${CHAIN_WINDOW} seconds of each other multiply points, up to ×5.`],
    ['fast', 'Quick start', 'The field starts with small objects in it, and you can drop much faster.']
  ]
  rows.forEach(([k, name, desc], i) => {
    const y = 200 + i * 90
    const cx = 150
    const cy = y + 40
    if (k === 'clock') {
      ctx.save()
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(cx, cy, 28, 0, TAU)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx, cy - 18)
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + 13, cy + 6)
      ctx.stroke()
      ctx.restore()
    } else if (k === 'time') outlined(`+${CD.timeFor[6]}s`, cx, cy + 13, 38, C.ice, 'center', 6)
    else if (k === 'vent') outlined(`−${CD.ventPenalty}s`, cx, cy + 13, 36, C.hot, 'center', 6)
    else if (k === 'fuse') {
      drawKind(ctx, 1, cx, cy, 20)
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,.8)'
      ctx.lineWidth = 5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(cx, cy, 29, -Math.PI / 2, -Math.PI / 2 + TAU * 0.65)
      ctx.stroke()
      ctx.restore()
    } else if (k === 'chain') outlined('×3', cx, cy + 14, 40, C.acc, 'center', 6)
    else {
      drawKind(ctx, 0, cx - 20, cy + 10, 14)
      drawKind(ctx, 2, cx + 14, cy + 6, 18)
      drawKind(ctx, 1, cx - 4, cy - 18, 14)
    }
    text(name, 220, y + 30, 26, C.ink)
    text(desc, 220, y + 66, 24, C.muted)
  })
}

function drawPaused() {
  ctx.fillStyle = 'rgba(10,6,26,.72)'
  ctx.fillRect(0, 0, W, H)
  outlined('PAUSED', W / 2, 200, 72, C.ink)
  drawMenu(pauseMenu)
  prompts([['a', 'Select'], ['b', 'Resume']], W / 2, 680, 'center')
}

function drawSettings() {
  background()
  if (state.from === 'paused') drawField(state.game)
  ctx.fillStyle = 'rgba(12,8,30,.86)'
  ctx.fillRect(0, 0, W, H)
  settingsScreen.draw(ctx, { font: `700 ${Math.round(26 * TS())}px ${UI}`, titleFont: `52px ${DISP}`, color: C.acc })
  prompts([['left', 'Change'], ['b', 'Back']], W / 2, 756, 'center')
}

function drawOver(g) {
  const k = Math.min(1, g.overT / 0.6)
  ctx.fillStyle = `rgba(10,6,26,${0.72 * k})`
  ctx.fillRect(0, 0, W, H)
  if (k < 1) return
  outlined(g.timeUp ? 'TIME UP!' : 'THE FIELD OVERFLOWED', W / 2, 220, 60, C.hot)
  text(g.mode === 'countdown' ? `COUNTDOWN  ·  LASTED ${fmtTime(Math.floor(g.t))}` : g.mode.toUpperCase(), W / 2, 280, 24, C.muted, 'center')
  outlined(g.score.toLocaleString('en-US'), W / 2, 380, 96, C.ink)
  if (g.newBest) outlined('NEW BEST!', W / 2, 440, 40, C.acc, 'center', 6)
  else text(`BEST ${state.best[g.mode].toLocaleString('en-US')}`, W / 2, 436, 28, C.muted, 'center')
  if (g.entry) {
    drawInitialsEntry(g)
    return
  }
  text('Biggest object', W / 2, 510, 24, C.muted, 'center')
  drawKind(ctx, g.maxTier, W / 2, 568, 36)
  text(TIERS[g.maxTier].name, W / 2, 640, 26, C.ink, 'center')
  if (g.rank) outlined(`#${g.rank} ON THE BOARD`, W / 2, 680, 30, C.acc, 'center', 6)
  if (g.overT > 0.8) drawMenu(overMenu, { size: 28, dy: 33 })
}

function drawInitialsEntry(g) {
  const en = g.entry
  const list = state.boards[g.mode]
  const rank = list.filter((e) => e.score >= g.score).length + 1
  outlined(`HIGH SCORE  #${rank}`, W / 2, 510, 36, C.acc, 'center', 6)
  text('Enter your initials', W / 2, 548, 24, C.muted, 'center')
  for (let i = 0; i < 3; i++) {
    const x = W / 2 - 140 + i * 100
    const sel = i === en.slot
    rrect(x, 568, 80, 92, 14)
    ctx.fillStyle = sel ? 'rgba(255,179,71,.18)' : 'rgba(255,255,255,.07)'
    ctx.fill()
    ctx.strokeStyle = sel ? C.acc : C.edge
    ctx.lineWidth = sel ? 5 : 3
    ctx.stroke()
    outlined(en.chars[i], x + 40, 636, 60, sel ? C.acc : C.ink, 'center', 0)
    if (sel) {
      // up/down hints
      const bob = Math.sin(state.t * 6) * 2
      ctx.fillStyle = C.acc
      ctx.beginPath()
      ctx.moveTo(x + 40, 552 + bob)
      ctx.lineTo(x + 30, 562 + bob)
      ctx.lineTo(x + 50, 562 + bob)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(x + 40, 676 - bob)
      ctx.lineTo(x + 30, 666 - bob)
      ctx.lineTo(x + 50, 666 - bob)
      ctx.fill()
    }
  }
  if (g.overT > 0.8) {
    if (pointerMode()) drawButton(SAVE_BUTTON, 'SAVE', { accent: true })
    else prompts([['move', 'Change'], ['a', 'Save']], W / 2, 728, 'center')
  }
}

function draw() {
  const s = state.screen
  canvas.style.cursor = s === 'playing' && input.mode === 'mouse' ? 'none' : 'default'
  if (s === 'title') return drawTitle()
  if (s === 'guide') return drawGuide()
  if (s === 'boards') return drawBoards()
  if (s === 'settings') return drawSettings()
  const g = state.game
  background()
  drawField(g)
  drawHUD(g)
  if (g.flash > 0) {
    ctx.fillStyle = `rgba(255,240,250,${g.flash * 0.6})`
    ctx.fillRect(0, 0, W, H)
  }
  if (g.missionAlert > 0 && g.mission && s !== 'gameover') drawMissionAlert(g)
  if (g.event?.banner > 0 && s !== 'gameover') drawEventAlert(g)
  if (s === 'paused') drawPaused()
  if (s === 'gameover') drawOver(g)
}

function drawMissionAlert(g) {
  const t = MISSION_ALERT - g.missionAlert // time since it arrived
  const slide = Math.min(1, t / 0.25)
  const ease = 1 - Math.pow(1 - slide, 3)
  const fade = Math.min(1, g.missionAlert / 0.4)
  ctx.save()
  ctx.globalAlpha = fade
  ctx.translate((1 - ease) * -W, 0)
  const y = 288
  ctx.fillStyle = 'rgba(14,8,36,.9)'
  ctx.fillRect(0, y, W, 132)
  ctx.fillStyle = C.acc
  ctx.fillRect(0, y, W, 5)
  ctx.fillRect(0, y + 127, W, 5)
  // signal arcs
  ctx.strokeStyle = C.acc
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  for (let i = 1; i <= 3; i++) {
    ctx.globalAlpha = fade * (0.4 + 0.6 * ((Math.floor(state.t * 6) + i) % 3 === 0 ? 1 : 0.4))
    ctx.beginPath()
    ctx.arc(300, y + 96, i * 18, -Math.PI / 2, 0)
    ctx.stroke()
  }
  ctx.globalAlpha = fade
  outlined(g.mission.hard ? 'INCOMING: HARD SIGNAL' : 'INCOMING TRANSMISSION', W / 2, y + 54, 44, g.mission.hard ? C.hot : C.acc, 'center', 8)
  const m = g.mission
  text(`${m.text}  ·  ${m.reward.text}`, W / 2, y + 102, 28, m.hard ? '#ffb3c2' : C.ink, 'center')
  ctx.restore()
}

function drawEventAlert(g) {
  const e = g.event
  const ev = EVENTS[e.id]
  const t = TUNING.eventBanner - e.banner
  const slide = Math.min(1, t / 0.25)
  const ease = 1 - Math.pow(1 - slide, 3)
  const fade = Math.min(1, e.banner / 0.4)
  ctx.save()
  ctx.globalAlpha = fade
  ctx.translate((1 - ease) * W, 0)
  const y = 288
  ctx.fillStyle = 'rgba(36,8,24,.9)'
  ctx.fillRect(0, y, W, 132)
  // hazard stripes along the edges
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, y, W, 8)
  ctx.rect(0, y + 124, W, 8)
  ctx.clip()
  ctx.fillStyle = '#1a0612'
  ctx.fillRect(0, y, W, 132)
  ctx.fillStyle = C.hot
  for (let sx = -40 + ((state.t * 120) % 40); sx < W; sx += 40) {
    ctx.beginPath()
    ctx.moveTo(sx, y + 132)
    ctx.lineTo(sx + 20, y + 132)
    ctx.lineTo(sx + 40, y)
    ctx.lineTo(sx + 20, y)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  hazardIcon(250, y + 52, 26, C.hot)
  hazardIcon(W - 250, y + 52, 26, C.hot)
  outlined(ev.name, W / 2, y + 66, 52, ev.col, 'center', 8)
  text(e.boost ? `${ev.desc}, amplified by the lost signal!` : ev.desc, W / 2, y + 108, 28, e.boost ? '#ffb3c2' : C.ink, 'center')
  if (e.id === 'wind') {
    arrow(W / 2 - 260 * e.dir, y + 99, e.dir, ev.col, 18)
    arrow(W / 2 + 260 * e.dir, y + 99, e.dir, ev.col, 18)
  }
  ctx.restore()
}

/** ?debug: live state in the corner. */
function drawDebug() {
  ctx.save()
  ctx.font = '500 16px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(8, 8, 460, 56)
  ctx.fillStyle = '#9fe'
  ctx.fillText(`screen ${state.screen}  mode ${input.mode}  fps ${fps.toFixed(0)}  scale ${fit.scale.toFixed(2)} dpr ${fit.dpr}`, 16, 16)
  const g = state.game
  ctx.fillText(g ? `bodies ${g.bodies.length}  parts ${fx.parts.length}  danger ${g.danger.toFixed(2)}  dropX ${g.dropX.toFixed(0)}` : 'no game', 16, 36)
  ctx.restore()
}

// ---------- loop ----------
// The check and the debug overlay read state.screen with the standard names; the guide and the
// leaderboards are title sub-screens.
window.__game = {
  state: Object.create(state, { screen: { get: () => (state.screen === 'guide' || state.screen === 'boards' ? 'title' : state.screen) } }),
  TUNING,
  save,
  settings,
  get titleMenu() {
    return titleMenu
  }
}
document.fonts?.load(`400 32px ${DISP}`).catch(() => {})
document.fonts?.load(`700 24px ${UI}`).catch(() => {})

let last = performance.now()
let fps = 60
function frame(now) {
  const dt = Math.min(1 / 20, (now - last) / 1000)
  last = now
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05
  input.update(dt)
  update(dt)
  draw()
  if (debug) drawDebug()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
