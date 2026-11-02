# Singularity

Drop space objects into a containment field and merge matching pairs, growing stardust into moons, planets, stars and finally a black hole. Play pure Classic, race the clock in Countdown where merges buy time, or take on Anomaly's Transmissions and Cosmic Events. Controller, keyboard, mouse or touch.

## Play

- **PushPlay (Steam Deck, Legion Go, PC):** find it in the launcher's **Discover** tab.
- **Browser:** `npm run setup`, then `npm run dev` (http://localhost:5173).

| Command | |
|---|---|
| `npm run dev` | Play locally with live reload |
| `npm run check` | Headless play test + art render (run before pushing) |

## Releasing

The code lives in this **private** repo; players get the game from the **public** release repo [`Visual-Zone-Development/singularity`](https://github.com/Visual-Zone-Development/singularity), which PushPlay's Discover tab lists.

- **Pushes** run the check (and update this repo's own private build), but never reach players.
- **To release:** bump `version` in `pushplay.json`, add a Changelog line to `DESIGN.md`, push, then **Actions → Release to PushPlay → Run workflow**. It builds and checks the game and, only if that passes, publishes it to `Visual-Zone-Development/singularity`'s `pushplay-latest` release. Or from a terminal: `gh workflow run release.yml`.
- It needs the `RELEASE_TOKEN` secret (a fine-grained token with *Contents: read and write* on `Visual-Zone-Development/singularity`). Never commit code or files to the release repo by hand: it only holds a README and the release.

Plays with a controller, keyboard, mouse or touch. Agents: rules are in [`AGENTS.md`](AGENTS.md); the design brief is [`DESIGN.md`](DESIGN.md).
