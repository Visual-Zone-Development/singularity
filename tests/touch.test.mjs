// Touch-only play test: a tablet with no keyboard or controller (PushPlay mobile).
// Run with `node --test tests/`. Needs Playwright with Chromium (local or global install).
import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' }
const LANDSCAPE = { width: 1180, height: 820 }
const PORTRAIT = { width: 820, height: 1180 }
const MIN_TARGET = 44 // CSS px, the usual smallest comfortable touch target

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    try {
      const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
      return createRequire(join(root, 'noop.js'))('playwright')
    } catch {
      return null
    }
  }
}

// Same drop order every run, so a merge comes in a predictable number of drops.
const SEEDED_RANDOM = () => {
  let s = 1234567
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  // Keep the text drawn on the canvas, so the test can read the prompts.
  const fill = CanvasRenderingContext2D.prototype.fillText
  window.__drawn = []
  CanvasRenderingContext2D.prototype.fillText = function (s, ...rest) {
    window.__drawn.push(String(s))
    if (window.__drawn.length > 4000) window.__drawn.splice(0, 2000)
    return fill.call(this, s, ...rest)
  }
}

const pw = await loadPlaywright()
let server
let base
let browser

before(async () => {
  if (!pw) return
  server = http.createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '')
    const file = join(ROOT, path || 'index.html')
    if (!file.startsWith(ROOT)) return res.writeHead(403).end()
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}/`
  browser = await pw.chromium.launch()
})

after(async () => {
  await browser?.close()
  server?.close()
})

async function openGame(viewport = LANDSCAPE, query = '?debug') {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
  await context.addInitScript(SEEDED_RANDOM)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base + query)
  await page.waitForFunction(() => window.__game?.screen === 'title')
  const cdp = await context.newCDPSession(page)
  return { context, page, cdp, errors }
}

/** Game space (1280×800) to page CSS px, from the canvas' bounding rect. */
async function toPage(page, x, y) {
  return page.evaluate(
    ([x, y]) => {
      const r = document.getElementById('game').getBoundingClientRect()
      return { x: r.left + (x / 1280) * r.width, y: r.top + (y / 800) * r.height, scale: r.width / 1280 }
    },
    [x, y]
  )
}
const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2]
async function tapAt(page, x, y) {
  const p = await toPage(page, x, y)
  await page.touchscreen.tap(p.x, p.y)
  await page.waitForTimeout(120)
}
const tapRect = async (page, r) => tapAt(page, ...centre(r))
async function menuRect(page, menu, id) {
  return page.evaluate(
    ([menu, id]) => {
      const m = window.__game.menus[menu]
      const i = m.items.findIndex((it) => it.id === id)
      if (i < 0) throw new Error(`no ${id} in ${menu}`)
      return m.rect(i)
    },
    [menu, id]
  )
}
const tapMenu = async (page, menu, id) => tapRect(page, await menuRect(page, menu, id))
const rects = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.rects)))
const game = (page, fn) => page.evaluate(fn)
const screen = (page) => page.evaluate(() => window.__game.screen)
async function waitScreen(page, s) {
  await page.waitForFunction((s) => window.__game.screen === s, s, { timeout: 4000 })
}

/** Touch down at one game-space point, slide to another, lift: steer the dropper and drop. */
async function drag(page, cdp, [x0, y0], [x1, y1], steps = 6) {
  const a = await toPage(page, x0, y0)
  const b = await toPage(page, x1, y1)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] })
  await page.waitForTimeout(40)
  for (let i = 1; i <= steps; i++) {
    const k = i / steps
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }] })
    await page.waitForTimeout(20)
  }
  await page.waitForTimeout(40)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(80)
}

describe('touch only, tablet landscape', { skip: !pw && 'Playwright is not installed' }, () => {
  test('starts in touch mode on a touch screen, so prompts say Tap before the first touch', async () => {
    const { context, page, errors } = await openGame(LANDSCAPE, '')
    await page.waitForTimeout(300)
    assert.equal(await game(page, () => window.__game.inputMode), 'touch')
    const drawn = await page.evaluate(() => window.__drawn.slice(-200))
    assert.ok(drawn.includes('Tap'), 'title prompts show a Tap chip')
    assert.ok(!drawn.includes('Space') && !drawn.includes('Esc'), 'no keyboard keys in the prompts')
    assert.deepEqual(errors, [])
    await context.close()
  })

  test('page blocks scrolling, zooming, text selection and the long-press callout', async () => {
    const { context, page } = await openGame(LANDSCAPE, '')
    const css = await page.evaluate(() => {
      const s = getComputedStyle(document.body)
      return { touchAction: s.touchAction, userSelect: s.userSelect || s.webkitUserSelect, tap: s.webkitTapHighlightColor }
    })
    assert.equal(css.touchAction, 'none')
    assert.equal(css.userSelect, 'none')
    assert.equal(css.tap, 'rgba(0, 0, 0, 0)')
    await context.close()
  })

  describe('a Classic run', () => {
    let s
    before(async () => {
      s = await openGame()
    })
    after(async () => {
      await s.context.close()
    })

    test('title → Classic by tap', async () => {
      await tapMenu(s.page, 'title', 'classic')
      await waitScreen(s.page, 'playing')
      assert.equal(await game(s.page, () => window.__game.state.game.mode), 'classic')
    })

    test('tap HOLD stores the current piece', async () => {
      await s.page.waitForTimeout(500) // the opening cooldown
      const before = await game(s.page, () => window.__game.state.game.cur.kind)
      await tapRect(s.page, (await rects(s.page)).hold.classic)
      const g = await game(s.page, () => ({ hold: window.__game.state.game.hold, canHold: window.__game.state.game.canHold }))
      assert.equal(g.hold?.kind, before)
      assert.equal(g.canHold, false)
    })

    test('drag steers the dropper and release drops; drops lead to a merge', async () => {
      const { page, cdp } = s
      const xs = [520, 760, 600, 700, 450, 820, 640]
      let drops = 0
      for (let i = 0; i < 40; i++) {
        const x = xs[i % xs.length]
        const before = await game(page, () => window.__game.state.game.drops)
        await drag(page, cdp, [640, 400], [x, 420])
        const g = await game(page, () => ({ drops: window.__game.state.game.drops, dropX: window.__game.state.game.dropX, score: window.__game.state.game.score }))
        assert.equal(g.drops, before + 1, `drag ${i + 1} dropped a piece`)
        assert.ok(Math.abs(g.dropX - x) < 80, `dropper followed the finger (${g.dropX} vs ${x})`)
        drops++
        if (g.score > 0) break
        await page.waitForTimeout(450) // drop cooldown
      }
      await page.waitForFunction(() => window.__game.state.game.score > 0, null, { timeout: 4000 })
      assert.ok(drops > 0)
    })

    test('tap pause → Settings → change a setting → Back → Resume', async () => {
      const { page } = s
      await tapRect(page, (await rects(page)).pause)
      await waitScreen(page, 'paused')
      await tapMenu(page, 'pause', 'settings')
      await waitScreen(page, 'settings')
      const shake = await game(page, () => window.__game.menus.settings.value('reducedShake'))
      await tapMenu(page, 'settings', 'reducedShake')
      assert.equal(await game(page, () => window.__game.menus.settings.value('reducedShake')), !shake)
      await tapMenu(page, 'settings', 'reducedShake')
      await tapMenu(page, 'settings', 'back')
      await waitScreen(page, 'paused')
      await tapMenu(page, 'pause', 'resume')
      await waitScreen(page, 'playing')
    })

    test('game over → initials by tap → Save → Leaderboards → Back', async () => {
      const { page } = s
      await game(page, () => window.__game.debug.endRun())
      await waitScreen(page, 'gameover')
      await page.waitForFunction(() => window.__game.state.game.overT > 0.9)
      assert.ok(await game(page, () => Boolean(window.__game.state.game.entry)), 'the score asks for initials')
      const r = await rects(page)
      await tapRect(page, r.initials[1]) // pick the middle slot
      assert.equal(await game(page, () => window.__game.state.game.entry.slot), 1)
      const was = await game(page, () => window.__game.state.game.entry.chars[1])
      await tapAt(page, r.initials[1].x + r.initials[1].w / 2, r.initials[1].y + 10) // top half: next letter
      const now = await game(page, () => window.__game.state.game.entry.chars[1])
      assert.notEqual(now, was)
      await tapRect(page, r.save)
      const g = await game(page, () => ({ entry: window.__game.state.game.entry, rank: window.__game.state.game.rank, board: window.__game.state.boards.classic }))
      assert.equal(g.entry, null)
      assert.equal(g.rank, 1)
      assert.equal(g.board[0].name[1], now)

      await page.waitForTimeout(500) // the game-over menu comes back after a beat
      await tapMenu(page, 'over', 'title')
      await waitScreen(page, 'title')
      await tapMenu(page, 'title', 'boards')
      await waitScreen(page, 'boards')
      await tapRect(page, r.boardTabs[2])
      assert.equal(await game(page, () => window.__game.state.boardMode), 2)
      await tapMenu(page, 'back', 'back')
      await waitScreen(page, 'title')
      assert.deepEqual(s.errors, [])
    })

    test('How to play opens by tap, tabs switch by tap, Back returns', async () => {
      const { page } = s
      await tapMenu(page, 'title', 'guide')
      await waitScreen(page, 'guide')
      await tapRect(page, (await rects(page)).guideTabs[3])
      assert.equal(await game(page, () => window.__game.state.guide.tab), 3)
      await tapMenu(page, 'back', 'back')
      await waitScreen(page, 'title')
    })
  })

  test('Countdown starts by tap; HOLD by tap; pause → Quit to title by tap', async () => {
    const { context, page, errors } = await openGame()
    await tapMenu(page, 'title', 'countdown')
    await waitScreen(page, 'playing')
    assert.equal(await game(page, () => window.__game.state.game.mode), 'countdown')
    await page.waitForTimeout(700)
    await tapRect(page, (await rects(page)).hold.countdown)
    assert.ok(await game(page, () => window.__game.state.game.hold !== null), 'held a piece')
    await tapRect(page, (await rects(page)).pause)
    await waitScreen(page, 'paused')
    await tapMenu(page, 'pause', 'title')
    await waitScreen(page, 'title')
    assert.deepEqual(errors, [])
    await context.close()
  })

  test('Anomaly starts by tap; Pulse buttons and HOLD by tap', async () => {
    const { context, page, cdp, errors } = await openGame()
    await tapMenu(page, 'title', 'anomaly')
    await waitScreen(page, 'playing')
    assert.equal(await game(page, () => window.__game.state.game.mode), 'anomaly')
    await page.waitForTimeout(500)
    await drag(page, cdp, [640, 400], [560, 400])
    assert.equal(await game(page, () => window.__game.state.game.drops), 1)
    const r = await rects(page)
    await tapRect(page, r.pulse[0])
    assert.equal(await game(page, () => window.__game.state.game.pulses), 2)
    await tapRect(page, r.pulse[1])
    assert.equal(await game(page, () => window.__game.state.game.pulses), 1)
    await page.waitForTimeout(500)
    await tapRect(page, r.hold.anomaly)
    assert.ok(await game(page, () => window.__game.state.game.hold !== null), 'held a piece')
    assert.deepEqual(errors, [])
    await context.close()
  })
})

describe('touch only, tablet portrait', { skip: !pw && 'Playwright is not installed' }, () => {
  test('on-screen buttons stay at least 44 px, or the game asks to turn the tablet sideways', async () => {
    const { context, page } = await openGame(PORTRAIT)
    await page.waitForTimeout(200)
    const r = await rects(page)
    const { scale } = await toPage(page, 0, 0)
    const smallest = Math.min(r.pause.w, r.pause.h, ...r.pulse.flatMap((b) => [b.w, b.h]), r.hold.classic.h, r.hold.anomaly.h) * scale
    const overlay = await page.evaluate(() => {
      const el = document.getElementById('rotate')
      return Boolean(el) && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height >= innerHeight
    })
    console.log(`# portrait 820×1180: canvas scale ${scale.toFixed(3)}, smallest play target ${smallest.toFixed(1)} CSS px, rotate overlay ${overlay}`)
    assert.ok(smallest >= MIN_TARGET || overlay, `smallest target ${smallest.toFixed(1)} px and no rotate overlay`)
    await context.close()
  })

  test('turning to portrait mid-run pauses behind the overlay; turning back keeps it paused until Resume', async () => {
    const { context, page } = await openGame(LANDSCAPE)
    await tapMenu(page, 'title', 'classic')
    await waitScreen(page, 'playing')
    await page.setViewportSize(PORTRAIT)
    await page.waitForTimeout(200)
    const shown = async () => page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display !== 'none')
    if (!(await shown())) {
      // No overlay: then portrait must be playable as is.
      assert.equal(await screen(page), 'playing')
      return context.close()
    }
    assert.equal(await screen(page), 'paused')
    // A tap on the overlay, right over the hidden Resume button, does nothing underneath.
    await tapMenu(page, 'pause', 'resume')
    assert.equal(await screen(page), 'paused')
    await page.setViewportSize(LANDSCAPE)
    await page.waitForTimeout(200)
    assert.equal(await shown(), false)
    assert.equal(await screen(page), 'paused')
    await tapMenu(page, 'pause', 'resume')
    await waitScreen(page, 'playing')
    await context.close()
  })
})
