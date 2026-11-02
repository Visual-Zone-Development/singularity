# Singularity: design brief

> Drop space objects into a containment field and merge matching pairs, growing stardust into moons, planets, stars and finally a black hole, without letting the pile cross the Horizon.

*Status: shipped · Version: 1.11.0*

This brief was reverse-engineered from the shipped code (`game.js`, `art.js`, `audio.js`, `input.js`). It describes what the game does today.

## Fun targets
- **Primary:** Challenge. Aim each drop to set up merges in a physics pile; anything resting above the red Horizon for 2 seconds ends the run, so planning and tidy stacking are the skill.
- **Secondary:** Sensation. Every merge gets a particle burst, expanding ring, floating score pop and a WebAudio chime that rises in pitch with the tier; big merges shake the screen and Black Hole collapses flash the whole screen.
- **Secondary:** Discovery. Anomaly mode layers in surprises (rare wormholes, frozen objects, Transmissions, Cosmic Events) and the Field Guide documents the 12-step ascent of objects.

See [framework.md](../../docs/game-design/framework.md). Each target maps to a mechanic or feedback below.

## Core loop
- **Moment-to-moment (seconds):** slide the dropper and drop an object → it settles in the pile and touches a twin → the pair fuses into the next tier (burst, chime, +points) → bigger objects, and (Anomaly) a chain multiplier up to ×5
- **Round (minutes):** keep merging up the 12-tier ascent (Stardust to Neutron Star to Black Hole; two Black Holes open a Singularity) → the pile grows and gets harder to manage (Anomaly adds rare wormholes, ice after 2:00, and Transmissions and Cosmic Events taking turns from 0:35) → the pile sits above the Horizon for 2 s → "The field overflowed" with score, best and biggest object
- **Meta (across sessions):** get onto the top-10 board for each mode with your 3-letter initials (Leaderboards page from the title menu, LB/RB to switch mode). There are no unlocks.

## The 8 formal elements
| Element | This game |
|---|---|
| Players | 1, against the physics and the pile |
| Objectives | Score as high as possible by merging matching objects up the cycle; in Anomaly, also complete timed Transmissions: one goal at a time, easy early and mostly hard after ~3:30 (form a planet, merge inside a target zone, drop N pieces while keeping the pile under a line, clear all Stardust or thin the field, chain ×3/×4, score fast, merge several different kinds) |
| Procedures | Move the dropper left/right, drop the current object, hold/swap an object (once per drop), Gravity Pulse left/right (Anomaly only), pause |
| Rules | Two identical objects touching merge into the next tier at their mass-weighted midpoint; dropped pieces are drawn from the 4 smallest tiers (weights 34/30/22/14); each tier scores 10 × n³ (10 … 17,280); Hold can swap once per drop; Black Hole plus Black Hole opens a Singularity (+50,000, then every object within 250 px is swallowed for its points); an object that has settled and rests above the Horizon for 2 s ends the run |
| Resources | Space in the field (the main one); Gravity Pulse charges (max 3, refilled by forming Jupiter or larger, or by a Transmission reward); the held object; the chain timer (3 s window); Transmission time |
| Conflict | Gravity and a finite jar; randomly drawn objects; in Anomaly: Cosmic Events (telegraphed 3 s ahead; one-shots: Meteor Shower, Deep Freeze, Gravity Quake, Rogue Planet; field events lasting a number of drops: Solar Wind, Cosmic Vortex, Bouncy Field, Shaky Dropper, Polarity Flip, Signal Jam; stronger over the run, and the one after a failed Transmission is amplified), rare wormholes (push the first touched object up one tier), frozen objects (cannot merge until a nearby merge thaws them), and Transmission deadlines |
| Boundaries | One fixed 1280x800 screen; a 520x600 jar with HUD columns on either side; the Horizon line at y=232 |
| Outcome | Endless; the run ends on overflow. The results screen shows score, "New best!" or the best, and the biggest object reached |

## Controls
| Input | Action |
|---|---|
| Left stick / d-pad (left/right) | Move the dropper (560 px/s); menu navigation up/down; guide and leaderboard tabs left/right |
| A | Drop the object (0.45 s cooldown); confirm in menus |
| B | Back in menus (never pauses); resume from the pause menu |
| X | Hold / swap the current object (once per drop) |
| Y | Unused |
| LB / RB | Gravity Pulse left / right (Anomaly only); switch Field Guide and Leaderboard tabs |
| Start (`menu`) | Pause: Resume, Restart, Settings, Field guide, Quit to title. Also Esc, P and the on-screen ≡ button; auto-pauses when the launcher overlay opens, the window loses focus or every controller disconnects |
| Mouse / touch | Drag inside the field to steer the dropper and release to drop (a hovering mouse steers too); tap the HOLD box to hold, the Pulse buttons to pulse, the top-right button to pause; every menu by click or tap; initials by tapping a slot (top/bottom half changes the letter) and Save |

Keyboard: arrows/WASD move, Space/Enter = A, Backspace = B, Shift = X, Q/E (or R) = LB/RB, Esc/P = pause. Button names in the HUD come from `input.label` / `drawPrompts`, so they follow the device in use.

## Inspirations
| Game | Borrow | Change / avoid |
|---|---|---|
| Suika Game (Watermelon Game) | Drop-and-merge fruit ladder in a jar, overflow line ends the run | Space theme with 12 tiers, its own points curve, a Singularity finale and per-tier personalities; the HUD uses a growth ladder, not a ring. Deliberately avoids Suika's tier count, points table and evolution circle; adds a Hold slot and an Anomaly mode |
| Tetris | Next piece preview and a Hold slot used once per drop | No line clearing; merging is the only way to make space |
| Bejeweled-style combo scoring | Chain multiplier and big-moment flashes | Chain is a simple 3 s window capped at ×5 |

## Art direction
- **Style:** Flat bold vector (closest preset), with a soft nebula backdrop and shaded round planets drawn in code
- **Palette:** `#191241` background, `#b9a6ff` hero (stardust / purple objects; the jar uses `#a9b6ff`), `#ffb347` accent, `#ff5a7a` danger, `#fff8ec` text. Extras: `#b9aee8` muted text, `#7df9ff` ice and Pulse, `#8f7dff` panel edge, `#8a5cff` Black Hole
- **Font:** Lilita One for titles and menus, Rubik 700 for HUD and body (both bundled in `fonts/`); same fonts in the cover art
- **Rendering:** 2D canvas with a custom Verlet circle physics (120 Hz fixed step)
- **Assets:** procedural (objects drawn in `art.js`); only the two font files are bundled
- **Cover idea:** big gradient "SINGULARITY" title over an orbit of planets around a giant Black Hole on a purple nebula
- **Hero idea:** Black Hole with orbiting planets and stars on the right half over a nebula and starfield, calm space on the left

## Audio
- **SFX:** WebAudio synth for menu moves, select/back, drop, hold, merge (pitch rises with tier, noise on tier 7+), Black Hole collapse, event alarm, meteor, freeze, wind, jam, quake boom, wormhole, thaw, Pulse, Horizon warning beep, Transmission incoming / complete / lost, game over
- **Music:** none

## Scope
**v1 must-haves** (built)
- Classic and Anomaly modes with separate saved bests
- 12-tier merge ascent with physics, Hold, Next preview and the Horizon fail rule
- Anomaly specials: rare wormhole, frozen objects, Gravity Pulse, chain multiplier, Transmissions, Cosmic Events
- Title, in-game Field Guide (Basics, Objects, Anomaly tabs), pause (resume, guide, restart, quit), game over with one-press replay
- Screen shake, particles (capped at 360), rings, score pops, WebAudio SFX

**Stretch**
- Music loop and a volume/mute setting
- Settings screen with reduced shake and flash options
- Gamepad rumble on big merges and quakes
- Daily seed for the drop order, unlockable object skins, more Transmission types
- `TUNING` object and `?debug` overlay

## Definition of done
Tailored from [complete-game.md](../../docs/game-design/complete-game.md):
- [x] Onboarding: title blurbs and the Field Guide (Basics) teach the verb; HUD shows live button prompts
- [x] Clear goal: merge up the cycle, stay below the Horizon; score is always on screen
- [x] Score to beat: separate saved bests per mode
- [x] Difficulty curve: drops, then specials gated by time and tier (wormholes after 60 s and at most one per 30 drops, ice after 2:00); Transmissions and Cosmic Events alternate one at a time with 20 s of calm between, events escalating to full strength by 6:00 and Transmissions turning hard from 1:30
- [x] Fair failure: Horizon line blinks, objects show a filling red ring, warning beep, 2 s grace
- [x] Retry in one press from game over (A, after 0.8 s)
- [ ] Near-miss feedback ("N away from your best") on game over
- [x] Variety: random drop order and Anomaly specials, though no unlocks or levels
- [x] Visual and audio feedback on drops, merges, specials and menus
- [ ] Rumble on big impacts (`vibrationActuator` is never used)
- [ ] Music
- [ ] Volume / mute setting
- [x] Title, pause (Resume, Restart, Settings, Field guide, Quit to title), game over screens, all on `menu.js` so they work with a controller, keyboard, mouse and touch
- [x] Settings screen (`settings.js`: master / music / SFX volume, reduced shake and flash, text size) from the title and the pause menu, saved under `singularity-settings-v1`
- [x] Saves: one `save.js` store under `singularity-save-v1` with the bests, the top-10 boards per mode (entries `{name, score}`) and the last initials; the 1.10 keys (`singularity.best3.<mode>`, `singularity.board.<mode>.v3`, `singularity.initials`) are read once and removed. Saved on every board change, on pause and in `input.onPause`
- [ ] Colorblind-safe: objects differ by size and drawing, but nothing is verified; the Horizon is red only
- [x] Reduced shake / flash option (`settings.data.reducedShake` skips shake and the white flashes); text scaled by `settings.data.textScale`
- [x] Text at least 24px in the 1280x800 space
- [~] `TUNING` object: Anomaly numbers (wormholes, ice, Transmissions, Cosmic Events) are in `TUNING`; physics constants are still separate
- [x] Delta-time movement, clamped to 1/20 s, with a fixed 120 Hz physics step
- [x] `window.__game = { state, TUNING, save, settings, titleMenu }` with `state.screen` in `title | playing | paused | settings | gameover`; `?debug` overlay with screen, input mode, fps, scale and body counts
- [x] Particles capped (360), background pre-rendered to an offscreen canvas
- [ ] `npm run check` pass and screenshots not verified in this pass

## Open questions / assumptions
- `pushplay.json` says version 1.1.0, so this brief starts there although it is the first brief.
- Y is bound in `input.js` but unused by the game.
- Transmission rewards alternate Pulses and points (easy +1 Pulse / +250, hard +2 Pulses / +750); points are used when Pulses are full. Transmissions are assigned, not offered. Transmissions and Cosmic Events strictly alternate, never overlap, with a 20 s calm after each; failing a Transmission amplifies the next event (+40% escalation). Field events count down by drops, not seconds, then fade over 1.5 s. Merges during an active event score ×2.
- The "Pulse refilled by Jupiter or bigger" rule is tier 7 and up in code (`nt >= 7`).
- The Black Hole palette and nebula colors are hard-coded in several places (`game.js`, `art.js`, art pages), so a palette change touches all of them.
- Start on the title screen confirms the menu item, same as A.

## Changelog
- 1.1.0: Design brief reverse-engineered from shipped code (game version 1.1.0 per `pushplay.json`).
- 1.2.0: Removed the supernova (it cleared too much space for free). Wormholes are now rare (after 1:00, 1-in-60 per drop, at most one per 30 drops) and no longer a Transmission reward. Transmissions come every 30-45 s instead of 8 s (first at 0:45). New Cosmic Events: telegraphed hazards (Meteor Shower, Deep Freeze, Solar Wind, Gravity Quake, Signal Jam, Rogue Planet) that ramp up over the run; failing a Transmission triggers one. Anomaly HUD swaps the cycle ring for an event panel.
- 1.3.0: Transmissions reworked: each one offers an easy (Y) and a hard (B) goal to choose from within 12 s, drawn from seven types: form a planet (now less common), merge inside a target zone, stay under a line, clear Stardust / thin the field, chain, score fast, merge different kinds. Hard goals pay more.
- 1.3.1: Transmissions can't be skipped: if you don't choose within 12 s the easy goal starts. "Stay low" now counts landed drops (6 easy / 8 hard) instead of seconds, so idling no longer completes it.
- 1.4.0: Transmissions are back to one assigned goal (no choice); the hard chance ramps from 0 at 1:30 to 80% at 3:30. Cosmic Events hit harder (8-12 meteors incl. Moons, 5-7 frozen, longer/stronger wind, 5-7 stronger quakes, longer jam, Rogue Planet is Saturn/Jupiter and can't be held) and escalate to full strength by 6:00. Each event permanently lowers the Horizon 12 px (max 132 px); each completed Transmission raises it back one step. Merges during an active event score ×2.
- 1.5.0: Removed Horizon creep. Transmissions and Cosmic Events now alternate one at a time with 20 s of calm between (first Transmission at 0:35); a failed Transmission amplifies the next event instead of adding one. New field events that last a number of drops: Cosmic Vortex, Bouncy Field, Shaky Dropper, Polarity Flip; Solar Wind and Signal Jam are now drop-based too.
- 1.6.0: Arcade initials and top-10 boards per mode. A run that makes the board asks for 3 letters on the game-over screen (up/down letter, left/right slot, A saves; starts from your last initials), then shows its rank. The title screen shows the selected mode's board. Fixed "After the next signal" overflowing the event panel (now "After a signal").
- 1.7.0: Leaderboards moved to their own page (title menu: Classic, Anomaly, Leaderboards, How to play), with LB/RB or left/right to switch between Classic and Anomaly. The title menu shows each mode's best score again, with room for large numbers (shortened to K/M/B/T only if it would not fit).
- 1.8.0: New Countdown mode: start with 60 s and a pre-filled field; merges add time (bigger merges more, Collapse +15 s, clock capped at 2:00); anything resting above the Horizon for 1 s is vented for −10 s instead of ending the run; faster drops (0.2 s) and ship; an auto-drop fuse per piece that tightens from 3 s to 1.2 s over 3 minutes (Hold resets it); chain multiplier on; no Anomaly events. Own leaderboard tab and best score in the menu. Numbers in `CD` at the top of `game.js`.
- 1.8.1: Field Guide gets a Countdown tab (clock, time from merges, vent, auto-drop, chain, quick start); opening the guide from the pause menu in Countdown jumps to it.
- 1.9.0: Distinguished from Suika for a possible Steam release. 12 tiers (new Neutron Star between Red Giant and Black Hole); only the 4 smallest drop in; points are 5 × n² (5 … 720); two Black Holes open a Singularity that scores +2,500 and swallows everything within 250 px for its points. Every object has its own facial personality (no blush). Classic's cycle ring is replaced by an "Ascent" growth ladder. Transmission score rewards and score goals rescaled. Leaderboards start fresh (v2) because of the new score scale.
- 1.10.0: Bigger numbers. Points are now 10 × n³ (Stardust 10 … Black Hole 17,280), Singularity +50,000, Transmission score rewards +15,000 / +50,000 with goals rescaled. The chain multiplier (up to ×5) now applies in Classic too, shown under Best. The score rolls up arcade-style and swells on big gains; merges of Jupiter and up get a callout (GIANT!, STELLAR!, SUPERGIANT!, ULTRA DENSE!, COSMIC!). Leaderboards start fresh (v3).
- 1.11.0: Kit v2. Every menu (title, pause, game over, Field Guide and Leaderboard tabs, initials entry) works with a controller, keyboard, mouse and touch through `menu.js`; mouse and touch play (drag to steer, release to drop, tap HOLD / Pulse / pause); pause is Start / Esc / P / the on-screen button with Resume, Restart, Settings, Field guide, Quit to title, and auto-pauses from the launcher; Settings screen (volumes, reduced shake and flash, text size); saves move to `singularity-save-v1`; `fit.js` letterboxing with crisp text at DPR 2; prompts follow the device in use. Gameplay unchanged.
- 1.10.1: Countdown vents escalate: −10 s for the first, +5 s more for each one after (never resets), and every vent breaks the chain. The HUD shows the vent count and the cost of the next one under the chain.
- 1.11.1: Build kit v6. Inside the launcher the pause menu ends with **Quit to library** (added by `menu.js`), so players can always find their way back to their games.
