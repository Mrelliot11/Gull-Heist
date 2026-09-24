# Code map

Gull Heist: top-down seagull food-heist game. Solo play runs in the browser; online multiplayer is server-authoritative over WebSocket. The Android app is a Capacitor wrapper around `public/`.

## Layout

| Path | Purpose |
|---|---|
| `server.js` | HTTP static server (CSP, security headers) + WebSocket rooms, match ticks, anti-cheat judging. Env config at top. |
| `public/shared.js` | UMD module `GH`, shared by client and server: seeded map/entities, steal/pickup/gold judging, modes, sanitizers. Pure logic, no DOM. |
| `public/index.html` | Entire client: CSS, markup, and one inline `<script>` (~1600 lines) split into `// ===== section =====` blocks. |
| `test/*.test.js` | `node --test`: `shared` (game rules), `server` (WS protocol), `modes`. |
| `android/` | Capacitor Android project. Only `app/src/main/java/.../MainActivity.java` and `AndroidManifest.xml` are hand-edited. |
| `capacitor.config.json` | `webDir: public`, https scheme, mixed content allowed. |
| `Dockerfile`, `Caddyfile.example` | Deployment. `.github/workflows/ci.yml` runs tests. |

## Where to look

| Feature | Location |
|---|---|
| Server message handlers (`ping prof st opts start join pos steal pick gold`) | `server.js:handle` (~L222) |
| Room join / reconnect by token | `server.js:attach`, `join`, `welcome` (~L327-404) |
| Match start/end, lobby broadcast | `server.js:startMatch`, `endMatch`, `lobbyMsg` |
| Rate limits, per-IP caps, origin check | `server.js:clientIp`, `originAllowed`, `connsPerIp` (~L111-135) |
| Map generation (seeded) | `shared.js:split`, `buildEnts`, `mulberry`, `h32` |
| Food types / values / restock | `shared.js:FOODS`, `typeFor`, `valueFor`, `restockFor` |
| Vision cones, guards, walkers | `shared.js:CONES`, `coneOf`, `faceAt`, `walkerAt`, `inCone` |
| Steal rules | `shared.js:judgeSteal`, `attemptSteal`, `findTarget` |
| Power-ups | `shared.js:puSchedule`, `judgePickup`, `applyPickup`; client `index.html:checkPickups`, `onPickup`, `renderFx` |
| Golden Chip | `shared.js:goldGrab`, `goldDrop`, `goldTick`; client `goldCheck`, `onGold`, `drawGold` |
| Game modes | `shared.js:MODES`, `createMatch` |
| Nick/room/look sanitizing | `shared.js:cleanNick`, `cleanRoom`, `cleanLook` |
| Client networking | `index.html` "multiplayer" section: `netConnect`, `onNet`, `netTick`, `setServer`, `wsBase` |
| Client prediction / snapshots | `index.html:pending`, `resolvePending`, `addSnap`, `updateRemote`, `setClock` |
| Player movement / swoop | `index.html:updateBird`, `trySwoop`, input section (~L610) |
| Screens and flow | `index.html` "screens / flow": `toTitle`, `startSolo`, `endSolo`, `toLobby`, `joinMatch`, `showResults` |
| Rendering | `index.html:render` (~L1758), `draw*` functions, `gullSprite` |
| Trophies / daily challenge | `index.html:award`, `renderTrophies`, `renderDaily` |
| Adaptive resolution / FPS | `index.html:setRes`, `trackRes`, `trackFps`, `frameInterval` |
| Debug overlay | `index.html` debug section (`?debug` in URL) |
| Main loop | `index.html:frame` (~L1926) |

## Conventions

- `shared.js` code is dense and minified-style (one-line functions); keep that style there.
- Time in shared logic is match time in seconds (`mt`/`t`); `COUNTDOWN` precedes t=0.
- Server is authoritative: the client predicts, the server judges using the same `GH.*` functions.
- Messages are small JSON objects keyed by `t` (type).
- Client persistence uses `localStorage` keys prefixed `gullheist.`.
- The inline script is hashed into the CSP at startup, so no build step is needed; changing it just works.

## Commands

- `npm test` runs all tests. `npm start` serves on `:8080`.
- `npm run android:build` syncs Capacitor and builds a debug APK.
