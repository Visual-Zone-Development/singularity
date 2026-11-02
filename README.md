# Singularity

Drop space objects into a containment field and merge matching pairs, growing stardust into moons, planets, stars and finally a black hole. Play pure Classic, race the clock in Countdown where merges buy time, or take on Anomaly's Transmissions and Cosmic Events. Controller, keyboard, mouse or touch.

## Play

- **PushPlay (Steam Deck, Legion Go, PC):** find it in the launcher's **Discover** tab, or **Add game → GitHub → watch this repo**. Every push to `main` builds the game and publishes it to this repo's `pushplay-latest` release.
- **Browser:** `npm run setup`, then `npm run dev` (http://localhost:5173).

| Command | |
|---|---|
| `npm run dev` | Play locally with live reload |
| `npm run check` | Headless play test + art render (run before pushing) |

Plays with a controller, keyboard, mouse or touch. Agents: rules are in [`AGENTS.md`](AGENTS.md); the design brief is [`DESIGN.md`](DESIGN.md).
