// Tiny WebAudio synth: every sound is generated, nothing to download.
// Plays through the runtime's audio.js buses (createAudio), so the Settings volumes apply and the
// context is unlocked on the first real gesture by the runtime, not here.
let ac = null
let master = null
let noiseBuf = null

/** Call once with the object from createAudio({ settings }). */
export function initSfx(runtime) {
  ac = runtime?.ctx ?? null
  master = runtime?.buses?.sfx ?? null
  noiseBuf = null
}

function audio() {
  if (!ac || !master) return null
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return ac
}

/** The old master gain, now applied per sound so the runtime's sfx bus can sit at 100%. */
const MIX = 0.45

function tone({ f = 440, f2 = f, type = 'sine', dur = 0.15, vol = 0.3, delay = 0 }) {
  const a = audio()
  if (!a) return
  vol *= MIX
  const t = a.currentTime + delay
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.05)
}

function noise({ dur = 0.3, vol = 0.3, freq = 800, delay = 0 }) {
  const a = audio()
  if (!a) return
  vol *= MIX
  const t = a.currentTime + delay
  const src = a.createBufferSource()
  src.buffer = noiseBuf
  const flt = a.createBiquadFilter()
  flt.type = 'lowpass'
  flt.frequency.setValueAtTime(freq, t)
  flt.frequency.exponentialRampToValueAtTime(60, t + dur)
  const g = a.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(flt).connect(g).connect(master)
  src.start(t)
  src.stop(t + dur + 0.05)
}

export const sfx = {
  /** The runtime unlocks audio on the first press; kept so old call sites stay harmless. */
  wake: () => {},
  ui: () => tone({ f: 620, f2: 700, type: 'triangle', dur: 0.06, vol: 0.15 }),
  select: () => {
    tone({ f: 660, f2: 990, type: 'triangle', dur: 0.1, vol: 0.2 })
    tone({ f: 990, f2: 1320, type: 'sine', dur: 0.12, vol: 0.12, delay: 0.06 })
  },
  back: () => tone({ f: 500, f2: 330, type: 'triangle', dur: 0.1, vol: 0.15 }),
  drop: () => tone({ f: 260, f2: 140, type: 'triangle', dur: 0.1, vol: 0.18 }),
  hold: () => tone({ f: 420, f2: 560, type: 'square', dur: 0.06, vol: 0.06 }),
  merge(tier) {
    const base = 260 * Math.pow(1.13, tier)
    tone({ f: base, f2: base * 1.5, type: 'sine', dur: 0.18, vol: 0.28 })
    tone({ f: base * 2, f2: base * 3, type: 'triangle', dur: 0.14, vol: 0.1, delay: 0.03 })
    if (tier >= 7) noise({ dur: 0.35, vol: 0.12, freq: 1200 })
  },
  collapse() {
    tone({ f: 500, f2: 30, type: 'sawtooth', dur: 1.1, vol: 0.22 })
    tone({ f: 80, f2: 30, type: 'sine', dur: 1.2, vol: 0.4 })
    noise({ dur: 1.0, vol: 0.25, freq: 2000 })
  },
  boom() {
    noise({ dur: 0.7, vol: 0.5, freq: 3000 })
    tone({ f: 140, f2: 30, type: 'sine', dur: 0.7, vol: 0.45 })
  },
  alarm() {
    ;[0, 0.22, 0.44].forEach((d) => {
      tone({ f: 880, f2: 520, type: 'sawtooth', dur: 0.18, vol: 0.1, delay: d })
      tone({ f: 440, f2: 260, type: 'square', dur: 0.18, vol: 0.05, delay: d })
    })
  },
  meteor() {
    noise({ dur: 0.35, vol: 0.18, freq: 2600 })
    tone({ f: 900, f2: 180, type: 'triangle', dur: 0.3, vol: 0.08 })
  },
  freeze() {
    ;[2400, 1900, 1500].forEach((f, i) => tone({ f, f2: f * 0.8, type: 'triangle', dur: 0.12, vol: 0.09, delay: i * 0.06 }))
    noise({ dur: 0.3, vol: 0.12, freq: 7000 })
  },
  wind: () => noise({ dur: 1.4, vol: 0.18, freq: 1600 }),
  jam() {
    noise({ dur: 0.4, vol: 0.16, freq: 5000 })
    tone({ f: 180, f2: 160, type: 'square', dur: 0.35, vol: 0.06 })
  },
  worm() {
    tone({ f: 300, f2: 1200, type: 'sine', dur: 0.3, vol: 0.18 })
    tone({ f: 450, f2: 1800, type: 'triangle', dur: 0.3, vol: 0.08, delay: 0.05 })
  },
  thaw: () => {
    tone({ f: 2400, f2: 1800, type: 'triangle', dur: 0.08, vol: 0.08 })
    noise({ dur: 0.15, vol: 0.1, freq: 6000 })
  },
  pulse() {
    tone({ f: 160, f2: 70, type: 'square', dur: 0.22, vol: 0.12 })
    noise({ dur: 0.25, vol: 0.18, freq: 900 })
  },
  warn: () => tone({ f: 540, f2: 540, type: 'square', dur: 0.07, vol: 0.07 }),
  mission() {
    ;[523, 659, 784, 1046].forEach((f, i) => tone({ f, f2: f, type: 'triangle', dur: 0.12, vol: 0.15, delay: i * 0.07 }))
  },
  incoming() {
    noise({ dur: 0.18, vol: 0.12, freq: 4000 })
    ;[880, 1320, 880, 1320].forEach((f, i) => tone({ f, f2: f, type: 'square', dur: 0.07, vol: 0.07, delay: 0.12 + i * 0.09 }))
  },
  fail: () => tone({ f: 400, f2: 200, type: 'triangle', dur: 0.35, vol: 0.15 }),
  over() {
    tone({ f: 440, f2: 110, type: 'sawtooth', dur: 0.9, vol: 0.16 })
    noise({ dur: 0.8, vol: 0.15, freq: 900 })
  }
}
