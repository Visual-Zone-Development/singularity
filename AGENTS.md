# Singularity

Drop space objects into a containment field and merge matching pairs, growing stardust into moons, planets, stars and finally a black hole. Play pure Classic, race the clock in Countdown where merges buy time, or take on Anomaly's Transmissions and Cosmic Events. Controller, keyboard, mouse or touch.

This repo is one game, published through **PushPlay**: every push builds the game and publishes it, and the PushPlay launcher on a handheld (Steam Deck or Legion Go) or PC picks it up — from the owner's library, and from PushPlay's **Discover** tab for everyone else. It is played **on a handheld, with a controller, on the couch**, and sometimes on a PC with a keyboard, a mouse or a touchscreen. Design for that.

The game is the repo root: `pushplay.json`, `index.html`, `game.js` and friends, and `art/`. Its design brief is [`DESIGN.md`](DESIGN.md).

## Workflow (follow it every time)

1. **Read `DESIGN.md` first** and keep changes consistent with it. Design guides live in [`docs/game-design/`](docs/game-design/), including the [definition of done](docs/game-design/complete-game.md) and [debugging](docs/game-design/debugging.md).
2. Make the change. Gameplay numbers go in the `TUNING` object at the top of `game.js`. Never edit the runtime files (see *Runtime files*).
3. **Run `npm run check` and fix everything it reports.** It builds the game, plays it headlessly at 1280×800 with a virtual gamepad, then keyboard-only, then touch, checks that Start pauses, renders it in a 16:9 window at DPR 2, and renders the art to PNG.
4. **Look at the images it prints** (`.github/pushplay/.work/out/singularity/__art/cover.png`, `hero.png`, `screenshot.png`) and iterate until they look right.
5. **Verify by hand** against the matrix in *Verification*.
6. Bump `version` in `pushplay.json` (patch: fixes and tuning, minor: features and content), add a Changelog line to `DESIGN.md`, commit and push. Pushing `main` publishes the build; other branches only run the check.

First time in a fresh checkout: `npm run setup` (installs dependencies and the headless browser).

## Game rules

### Runtime files (don't edit)

`input.js`, `menu.js`, `fit.js`, `audio.js`, `save.js`, `settings.js` and `prompts.js` in each game folder start with the header `pushplay runtime vN — replaced by npm run update-kit; don't edit`. They are shared code: `npm run update-kit` overwrites them in every game, so any edit is lost. Import them; never change them. Game-specific key aliases go through `input.extendKeys({ KeyR: 'y' })` in `game.js`.

### Controls: every input, alone

Games are played on a Steam Deck or Legion Go with their built-in controls, and on Linux, Windows and Mac PCs with a controller, a keyboard, a mouse or a touchscreen. **Every menu and screen must work with each of those alone.** Gameplay must work with a controller and with a keyboard; mouse and touch gameplay are expected too, unless the genre genuinely can't (then omit them from the manifest's `inputs` and say so on the title screen).

`input.js`: call `input.update()` once at the top of every frame, and `input.attach(canvas, 1280, 800)` once at startup (it maps mouse and touch into game space; the check warns if it's missing).

| `input` button | Controller | Keyboard | Mouse / touch | Use it for |
|---|---|---|---|---|
| `a` | A | Space, Enter | click, tap | confirm, jump, main action |
| `b` | B | Backspace | right-click | back in menus; **free for gameplay** (dash, cancel, secondary) |
| `x` | X | Shift | | secondary action |
| `y` | Y | F | | secondary action |
| `lb` / `rb` | LB / RB | Q / E | | cycle, tabs, rotate |
| `lt` / `rt` | LT / RT | Z / C | | hold actions, triggers |
| `select` | Select / View | Tab | | map, scoreboard, extra info |
| `up` `down` `left` `right` | d-pad | arrows, WASD | | discrete steps |
| `menu` (virtual) | Start | Esc, P | on-screen pause button → `input.requestMenu()` | **pause and menu only** |

- `input.x`, `input.y` (−1..1): left stick + d-pad + WASD/arrows. `input.aimX`, `input.aimY`: right stick. `input.navX`, `input.navY`: stepped with key repeat, for menus and grids. `input.pointer` (mouse or primary touch, in 1280×800 game space) and `input.pointers` for multitouch.
- `input.held(b)`, `input.pressed(b)`, `input.released(b)`. Use `pressed()` for one-shot actions.
- **Pause is `menu`, back is `b`. They are different buttons.** Esc always pauses and never acts as B; B/Backspace never pauses. So B is a normal gameplay button and a stray Esc can't cancel a run.
- **Never bind F10, Start+Select, or a held Esc.** The launcher uses them to quit the game (see *Exit and pause*). Nothing in the game may depend on a chord of two buttons.
- Nothing may need hover, a double-click, a scroll wheel, a modifier chord or typed text: a controller has none of them. Pointer-driven ideas (aiming, dragging, placing) also need a stick-driven cursor or snapping between targets.
- **Local multiplayer** uses `input.pads[i]` (`{ index, connected, x, y, aimX, aimY, held(), pressed() }`), one per controller; player 1 may also use the keyboard. Join screen: `${input.label('a')} to join`, one slot per pad that pressed. The merged `input.*` view is for menus only in a multiplayer game. Tag it `"local multiplayer"` and set `players` to e.g. `"2-4"`.

### Menus (`menu.js`)

- `createMenu(items, opts)`; items are `{ id, label, disabled? }` or value items `{ id, label, type: 'toggle' | 'range' | 'choice', value, min, max, step, options, onChange }`.
- Each frame: `const action = menu.update(input, dt)` returns the chosen item id, `'back'` (B or `menu`) or `null`; then `menu.draw(ctx)`. Read values with `menu.value(id)`; `menu.select(id)`, `menu.selected`, `menu.items` for custom drawing.
- It moves with d-pad, stick, arrows and WASD; chooses with A, Space, Enter, click or tap; goes back with B, Backspace, Esc/Start or right-click; highlights on hover; left/right, LB/RB, the arrow buttons and taps change values.
- Use it for **every** menu: title, pause, settings, game over, level select. A custom menu must do all of the above, including touch.
- Inside the launcher, a menu with a `resume` item (the pause menu) gets **Quit to library** added at the end by itself (see *Leaving your game*). Don't add your own.

### Leaving your game

Players must always be able to get back to their library, including people who never read a hint. There are two ways out, and a kit game has both without writing any code:

- **The game's own pause menu.** Inside the launcher, `menu.js` ends the pause menu (any menu with a `resume` item) with **Quit to library**. Choosing it asks the launcher to close the game, so `game.js` never sees it, and it isn't there outside the launcher (in a browser, `npm run dev` or the check). Keep the item ids `resume` for the pause menu and you get it. A pause menu without `resume` can ask for it with `createMenu(items, { quitToLibrary: true })`; a game that really can't be left mid-way (rare) can opt out with `{ quitToLibrary: false }`.
- **The launcher's menu.** Holding Start+Select, F10, holding Esc for 1 s, or the ≡ button the launcher draws for mouse and touch open the launcher's own menu (Resume, Restart game, Quit game) over any game. It pauses the game first (`input.onPause`). The launcher shows how at launch and again whenever the player presses the game's pause.

So:
- **Don't build an "exit to launcher" of your own** and never bind F10, Start+Select or a held Esc.
- **"Quit to title" stays inside the game** (to the title screen). Name in-game exits by where they lead ("Back to the arcade", "Quit to title"); the library exit is the kit's.
- **A pause menu not built with `menu.js`** (a custom menu, a game ported from another engine) adds the same item itself, shown only inside the launcher: `if (window.pushplay?.quit) items.push({ id: 'library', label: 'Quit to library' })`, and on choosing it calls `window.pushplay.quit()`. Always use `?.`: outside the launcher `window.pushplay` is undefined.

### Exit and pause

- **The launcher owns quitting**: see *Leaving your game*. The game's own Quit to library and the launcher's menu are the only ways out.
- **Launcher contract:** `window.pushplay?.{ version, gamingMode, inputMode, quit(), restart(), onPause(cb), onResume(cb) }` plus window events `pushplay:pause` / `pushplay:resume`. `input.js` already wires these: use `input.onPause(cb)` and `input.paused`.
- **Auto-pause:** `input.onPause(cb)` fires when the launcher overlay opens, the window loses focus or is hidden, or all controllers disconnect. The callback must switch to the pause screen and save (see *Saves*); `audio.js` mutes on its own. Never auto-resume: the player presses Resume.
- **Pause menu = Resume, Restart, Settings, Quit to title**, in that order, built with `menu.js` (inside the launcher it then shows Quit to library last, on its own). `menu` (Start / Esc / P / on-screen button) opens it from gameplay and `'back'` resumes. Quit to title goes to the title screen, not out of the game. The game is fully frozen while paused (no timers, physics or spawns advance).
- **On-screen pause button:** a ≥ 56×56 px button in a corner during gameplay that calls `input.requestMenu()`; it's how mouse and touch players pause. The starter has one; keep it.
- Never use `alert()`, `confirm()`, `prompt()`, `window.open()` or new tabs; they block every input. Draw confirmations in-game.

### Screens and scaling

- **Logical space is 1280×800** (the Steam Deck's screen). Lay out every screen in it, text ≥ **24px** and important HUD ≥ **32px** from the edges. Everything else is handled by `fit.js`.
- Call `fitCanvas(canvas, { w: 1280, h: 800, maxDpr: 2, integer: false, letterbox: '#000' })` once; it resizes on every window change, letterboxes, caps the device pixel ratio at `maxDpr` and keeps drawing coordinates at 1280×800. Don't write your own resize code.
- Targets it must look right on: Steam Deck **1280×800** at DPR 1; Legion Go **1920×1200** and **2560×1600** (the launcher zooms the window, so DPR reaches 1.5–2 in the same 1280×800 space); desktop **16:9** windows such as 1920×1080 (bars left and right); any resizable window, including smaller than 1280×800.
- `letterbox`: use the game's background colour so bars disappear, or black. Never white, never transparent.
- `maxDpr: 2` is the cap; don't read `devicePixelRatio` in 2D code. Text, lines and vector shapes stay crisp at DPR 2 automatically. Pre-rendered bitmaps (glow sprites, cached text) made at 1× look soft at DPR 2: render them at 2× or keep them small.
- Pixel art: `integer: true` plus `ctx.imageSmoothingEnabled = false`, and draw sprites at whole-number scales.
- 3D: render to a fixed 1280×800 surface with `renderer.setPixelRatio(Math.min(devicePixelRatio, 1))` and let `fitCanvas` scale it; see [`docs/game-design/3d.md`](docs/game-design/3d.md).
- Cursor: hide it (`canvas.style.cursor = 'none'`) **only during gameplay** in mouse mode, and show it again on every menu (title, pause, settings, game over). Never hide it in a menu.

### Settings (`settings.js`)

Every game has a Settings screen, **reachable from the title and from the pause menu**, built with `createSettingsScreen({ settings, audio, extra })` → `{ update, draw }` (same calling pattern as a menu: `update(input, dt)` returns `'back'` when the player leaves). It provides:
- **Master, Music and SFX** volume (0–100).
- **Reduced shake / flash** toggle: when on, skip screen shake, white flashes and strobing. Every game that shakes or flashes must honour `settings.data.reducedShake`.
- **Text size** (`settings.data.textScale`, 1 = normal): multiply HUD and menu font sizes by it.
- `extra`: game-specific items such as difficulty, colourblind palette or rumble, as `menu.js` value items.

`const settings = createSettings(id, defaults)` stores them under `<id>-settings-v1` with defaults `{ master, music, sfx, reducedShake, textScale }`. Pass the same object to `createAudio({ settings })` so the buses follow the sliders.

### Input hints

- Prompts come from the runtime, never from hard-coded names: `input.label('a')` → "A" on a controller, "Space" on a keyboard, "Tap" on touch (and a click label with a mouse); `input.label('menu')` → "START" / "Esc" / the pause button; `input.stickLabel()` and `input.dpadLabel()` name the movement input for the current mode.
- HUD legends: `drawPrompts(ctx, input, [['a', 'Jump'], ['x', 'Dash'], ['menu', 'Pause']], opts)` draws icons for the current mode.
- `input.mode` is `'gamepad' | 'keyboard' | 'mouse' | 'touch'`, follows the last device used, and starts as `'gamepad'` inside the launcher's gaming mode (`input.gamingMode`, `input.usingGamepad`). Build prompt strings every frame, not once at load, so they switch when the player changes device.
- Title screen: `Press ${input.label('a')} to start` (on touch that reads "Press Tap to start", so phrase it as `${input.label('a')} to start` or use `drawPrompts`), plus a pause hint built from `input.label('menu')`. If gameplay doesn't support mouse or touch, say so there ("Needs a controller or keyboard").
- Never write "Press A", "Space", "LB/RB", "Click" or "Tap" as literal text in the game.

### Saves (`save.js`)

- `const save = createSave(id, 1, defaults, migrate?)` → `{ data, load, save, reset }`, stored under `<id>-save-v1`. Keep best scores, unlocks and progress in `save.data` and call `save.save()` after every change that matters, **on pause and in `input.onPause`**. Bump the version and pass `migrate(old)` when the shape changes.
- All `localStorage` keys must start with the game id (the check fails otherwise). Only `save.js` and `createSettings` should touch `localStorage`.

### Audio (`audio.js`)

- `const audio = createAudio({ settings })`: buses `master`, `music`, `sfx`; `audio.tone()`, `audio.noise()` for generated SFX, `audio.load()` + `audio.play()` for bundled files, `audio.setVolume()`.
- Browsers only start audio after a user gesture. `audio.js` unlocks itself on the first key, click, tap or gamepad press and mutes on pause; the launcher allows autoplay, a normal browser doesn't, so never assume sound is running before the first input and don't rely on music playing on the title screen before a press. Draw the first frame immediately; never wait for a click or for audio before drawing.
- Every action has a sound; a music loop fits the mood; both obey the Settings sliders.

### Flow

- Screens: `title` → `playing` ↔ `paused` → `gameover`, plus `settings`. Keep the current one in `state.screen` with exactly those names, and expose `window.__game = { state, TUNING }` (the check presses Start and expects `'paused'`).
- The title screen is the first thing drawn and says how to start and how to pause. Game over shows score, best and retries in one press.
- Restart (from pause or game over) resets everything the run touched: timers, particles, audio loops, RNG seed if seeded.

### Offline and self-contained

- No CDNs, remote fonts, analytics or network calls. Bundle everything inside the game folder (or install it with npm in a `--vite` game). The check fails on internet requests and on WebSockets.
- Saves persist per game on the handheld via `localStorage` (see *Saves*).

### Performance

The Deck and the Legion Go have mid-range integrated GPUs. Aim for a steady 60fps at 1280×800 and no drops at DPR 2. Prefer canvas 2D or modest WebGL scenes, cap particle counts, avoid `shadowBlur` and huge textures.

### Tech

- Default: plain HTML + ES modules (`<script type="module">`) and canvas.
- Keep everything in this repo. Don't commit or ship working files: `tools/`, `mockups/`, `*.py`, `__pycache__/`, reference images. The build skips those plus `DESIGN.md`; list anything else to skip in `.pushplayignore`.
- For 3D games (three.js), follow the budgets in [`docs/game-design/3d.md`](docs/game-design/3d.md).
- Put all gameplay numbers in a `TUNING` object at the top of `game.js`, so tuning later is quick. Clamp `dt` (`Math.min(1/20, …)`).

### Verification

Do all of these before pushing; `npm run check` covers them headlessly, you cover them for real:

| Pass | How | Must be true |
|---|---|---|
| Controller | pad plugged into `npm run dev`, or on the Deck / Legion Go | every screen; Start pauses; B never quits anything without a menu |
| Keyboard only | hands off the mouse, no pad | Enter starts, Esc pauses, Backspace backs, every action reachable, prompts show key names |
| Mouse only | hands off the keyboard | every menu by click; pause button works; gameplay if `inputs` includes `"mouse"` |
| Touch | DevTools device mode (touch emulation) | every menu by tap; pause button; prompts say "Tap"; gameplay if `inputs` includes `"touch"` |
| Scaling | resize the window to 1920×1080, then DevTools device mode at DPR 2 | centred, letterboxed in the right colour, crisp text, no blur or clipping |
| `npm run check` | | passes, screenshot shows real content, `window.__game.state.screen` exposed |

## Assets

Games can be fully procedural, or use the user's own sprites, audio, models and fonts. Copy them into `assets/` (never link outside the folder or to the internet), record where each came from and its license in `assets/CREDITS.md`, and keep files small (sprite sheets ≤ 2048px, music ≤ ~3 MB, < 30 MB total). Details: [`docs/game-design/assets.md`](docs/game-design/assets.md). 
## Manifest (`pushplay.json`)

```json
{
  "$schema": "../../.github/pushplay/manifest.schema.json",
  "id": "star-courier",
  "name": "Star Courier",
  "description": "Pilot a tiny courier ship through an asteroid field, grabbing parcels before the clock runs out.",
  "version": "1.0.0",
  "entry": { "web": "index.html" },
  "art": { "cover": "art/cover.svg", "hero": "art/hero.svg" },
  "controls": "gamepad",
  "inputs": ["gamepad", "keyboard", "mouse", "touch"],
  "players": "1",
  "tags": ["arcade", "space", "score attack"],
  "online": false
}
```

- `id` must stay `singularity`: changing it makes PushPlay treat it as a new game (and loses saves).
- `description`: 1–3 sentences in plain language: what you do and what makes it fun. It's shown in the library.
- `players`: like `"1"` or `"1-4"`.
- `tags` (**required**; the check fails without it): 2–5 lowercase words players can filter the library by: genre first (`"racing"`, `"puzzle"`, `"platformer"`, `"shooter"`), then setting or style (`"space"`, `"pixel art"`, `"cozy"`), and `"local multiplayer"` if it supports more than one player. Letters, digits, spaces, `-`, `&` and `'`, up to 24 characters each, at most 8.
- `inputs` (**required**): which inputs the whole game, gameplay included, is playable with: any of `"gamepad"`, `"keyboard"`, `"mouse"`, `"touch"`. Menus must always support all four regardless; only drop `"mouse"` or `"touch"` when gameplay genuinely can't work with them, and say so on the title screen. `"gamepad"` and `"keyboard"` are always present.
- `version`: bump it when you make a notable change.

## Art

Every game needs two images, written as **SVG** (or `.html` for art drawn with canvas). The check renders them to PNG. Both are required and must look good: they're the first thing anyone sees in the library.

| File | Size | Where it shows | Rules |
|---|---|---|---|
| `art/cover.svg` | 720×500 | Library tile (shown at ~216×150) | **Must include the game's title**, big and bold. Keep the **bottom 110px clear of important content** (the launcher draws badges there). |
| `art/hero.svg` | 1920×450 | Banner on the game's detail page | **No title text**: the launcher writes the title over the **bottom-left**, so keep that area calm and put the key visual on the **right half**. |

Guidelines:
- Set `width`, `height` and `viewBox` on the root `<svg>` to the exact size.
- Show what the game *is*: its hero character, ship or key object, in the game's own palette. Composition and contrast beat detail. It must read at thumbnail size.
- Fill the frame with a background (no transparency). Use bold shapes, 2–4 main colors, and a clear focal point.
- **Fonts for art text:** use one of these (bundled, so they look identical everywhere): `Chakra Petch` (600, 700), `Rubik` (400, 700, 900), `Bungee`, `Lilita One`, `Press Start 2P`. Other fonts won't be available when the art is rendered.
- No external images or links inside the SVG. Embedded `<image href="data:...">` is fine.
- For a pixel-art or canvas look, an `art/cover.html` page that draws with the game's own code also works. Set `"cover": "art/cover.html"`. The page is rendered at exactly 720×500, after `load`.

If you're truly unable to make art, remove the `art` field: the check will generate a basic cover from a screenshot. Hand-made art is strongly preferred.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Play it in a browser with live reload (http://localhost:5173) |
| `npm run check` | Validate, build, headless play test, render art. Must pass before pushing. |

## Don'ts

- Don't edit `.github/pushplay/` or `.github/workflows/pushplay.yml`: that's the PushPlay build kit.
- Don't edit the runtime files (`input.js`, `menu.js`, `fit.js`, `audio.js`, `save.js`, `settings.js`, `prompts.js`).
- Don't bind F10, Start+Select or a held Esc; don't build an "exit to launcher" of your own.
- Don't change `id` in `pushplay.json` or the save keys: players' saves and the Discover listing depend on them.
- Don't commit `node_modules/` or `dist/`.
