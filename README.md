# Singularity

Drop space objects into a containment field and merge matching pairs, growing stardust into moons, planets, stars and finally a black hole. Play pure Classic, race the clock in Countdown where merges buy time, or take on Anomaly's Transmissions and Cosmic Events. Controller, keyboard, mouse or touch.

## Play

- **PushPlay (Steam Deck, Legion Go, PC):** find it in the launcher's **Discover** tab, or **Add game → GitHub → watch this repo**. Every push to `main` builds the game and publishes it to this repo's `pushplay-latest` release.
- **Browser:** serve this folder with any static server (for example `npx serve .`) and open it.

| Command | |
|---|---|
| `node --test tests/*.test.mjs` | Touch-only play test on an emulated tablet (needs Playwright with Chromium) |

Plays with a controller, keyboard, mouse or touch. The design brief is [`DESIGN.md`](DESIGN.md).

## Rights

© Visual Zone Development. All rights reserved. The source is public so PushPlay can build and verify the game; that doesn't make it open source, and it may not be copied, modified or redistributed without permission. Third-party assets (fonts and similar) keep their own licences, listed in the game's credits files.
