# Gull Heist

A top-down seagull food-heist game for phones and computers, with online multiplayer.

This folder is the whole website. `server.js` serves the game and runs every multiplayer match over WebSocket. Players don't need accounts.

```
server.js          web server + multiplayer rooms (Node 18+, one dependency: ws)
public/index.html  the game page
public/shared.js   city, people and steal rules, used by both the page and the server
public/og.png      link-preview image (Discord, iMessage, etc.)
Dockerfile         container build, if your host uses one
Caddyfile.example  HTTPS reverse proxy config for a VPS
android/           Android app (Capacitor) that bundles public/
```

## Run it locally

```bash
npm install
npm start
# open http://localhost:8080 in two browser windows and press Multiplayer in both
```

## How rooms work

- `https://yourgame.gg/` puts everyone in the room called `public`. Anyone there can start a match.
- In the lobby, **New private room** makes a room with a random code such as `k7f-q2m`. The page's address changes to `?room=k7f-q2m`; **Copy link** copies it for friends.
- Type a code and press **Join** to switch rooms, or **Public room** to go back. Switching doesn't reload the page.
- Each room has its own lobby and matches. In a private room, the first player in (marked ★) is the leader and starts matches. If they leave, the next player takes over.
- Players who arrive mid-match press **Join match** to jump in.
- If your connection drops, reconnecting within 30 seconds puts you back in the match with your score.
- Room codes can use lowercase letters, numbers and dashes, up to 24 characters. Each room holds up to 12 players.

## Rules

- Every person watches a cone in front of them. Swoop from behind to steal their food.
- Swooping into a regular person's (white) cone gets you shooed: no food, no harm done.
- Grumps (red cone, double value) and cart vendors (yellow cone, 50 points) swat you. Three swats and you're grounded for 6 seconds (the match ends in solo).
- Someone who was just robbed stays alert for a few seconds: their cone widens and they turn to face the nearest gull.
- Steals within 3.5 seconds of each other chain a combo, up to x5.
- A small reticle ahead of your gull shows where a swoop would come down. When food is in reach, brackets mark it: gold means a clean steal, white means you'd be seen and shooed, red (with **SWAT!**) means you'd lose a feather.
- Food held by a grump twinkles: it's worth double.
- Power-ups float over the streets. Fly through one to take it (see below). The first gull there gets it.

## Modes

Pick a solo mode on the title screen. In a room, the leader picks the mode in the lobby (anyone can in the public room).

| Mode | Where | How it plays |
|---|---|---|
| **Classic** | solo, rooms | 90 seconds. The original rules. |
| **Frenzy** | solo, rooms | 60 seconds. More people, everyone starts with food, food comes back twice as fast, power-ups twice as often. |
| **Rush** | solo | 30 seconds on the clock. Each steal adds 3 seconds (6 for a cart, +1 at a x3 combo or more). |
| **Golden Chip** | rooms | 2 minutes. A golden fry sits by the fountain. Carry it to score 5 points a second, but you fly a little slower. Swoop onto the carrier to snatch it. A swat, a grounding or leaving drops it. |

The best haul is kept for each solo mode.

## Power-ups

Power-ups are on by default. Turn them off with **Power-ups: on/off** on the title screen (solo) or in the lobby (rooms). Timers for the ones you have show under your loot.

| Power-up | What it does |
|---|---|
| **Tailwind** (blue) | Fly 50% faster for 6 seconds. |
| **Camouflage** (lilac) | Regular people don't see you for 6 seconds. Grumps and vendors still do. |
| **Big beak** (orange) | Grab food from further away for 8 seconds. |
| **Shield feather** (green) | Blocks the next swat. You keep your feathers and your combo. |
| **Double loot** (yellow) | Steals are worth double for 8 seconds. |
| **Screech** (red) | People close by are dazed for a few seconds and can't see anyone. |

In rooms the server decides who got a power-up and applies it, including the faster speed limit for a tailwind.

## Trophies and the daily challenge

Matches count toward trophies (press **Trophies** on the title screen) and a daily challenge that changes every day. Both are kept in your browser. Doing the challenge on days in a row builds a streak.

Press **M** to mute. The pause menu has a sound toggle too.

## Your gull

Press **Customize your gull** on the title screen (or **Customize** in the lobby) to pick a name, plumage, scarf color, hat and eyewear. The scarf color is also your color on the minimap and scoreboard. Everyone in a match sees your look; it's saved in your browser.

On a computer, choose **Controls: Mouse** (point to fly, click to swoop) or **Controls: Keyboard** (WASD or arrow keys to fly, Space/J/K to swoop) on the title screen or in the pause menu. Phones use drag to fly and tap to swoop.

## Settings (environment variables)

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `8080` | Port the server listens on. Most hosts set this for you. |
| `PUBLIC_URL` | *(unset)* | Your site's address, e.g. `https://yourgame.gg`. Turns on the link-preview image in Discord and similar apps. |
| `MAX_PEERS_PER_ROOM` | `12` | Players allowed in one room. |
| `MAX_ROOMS` | `200` | Rooms allowed at once. |
| `MAX_CONN_PER_IP` | `8` | Open connections allowed from one IP address. |
| `TRUST_PROXY` | *(unset)* | Set to `1` when running behind a reverse proxy (Caddy, Render, Fly…) so per-IP limits use `X-Forwarded-For`. Leave unset when the server is exposed directly. |
| `ALLOWED_ORIGINS` | *(unset)* | Extra comma-separated site origins allowed to open game connections. The server's own address and `PUBLIC_URL` are always allowed. |

`GET /healthz` returns `{"ok":true,...}` for your host's health check.

## Put it online

The server must stay running for multiplayer to work. That rules out static-only hosts like GitHub Pages or plain Netlify. Pick any host that runs a Node app (or a Docker container) **and supports WebSockets**. A few common options:

### Option A: Render (easiest, no server to manage)
1. Push this folder to a GitHub repo.
2. In Render, create a **Web Service** from the repo.
   - Build command: `npm install`
   - Start command: `npm start`
3. Add the environment variable `PUBLIC_URL` = `https://yourgame.gg`.
4. Under **Custom Domains**, add `yourgame.gg`. Render shows the DNS records to create at your domain registrar.

Free plans on hosts like this usually go to sleep when nobody is playing. The first visitor then waits a few seconds for it to wake up. Check your host's current plans.

### Option B: Fly.io or Railway (Docker)
Both can deploy straight from the `Dockerfile`. Set `PUBLIC_URL`, then attach your custom domain in the host's dashboard and create the DNS records it gives you.

### Option C: Your own VPS
```bash
# on the server (Docker installed)
docker build -t gull-heist .
docker run -d --restart unless-stopped -p 8080:8080 -e PUBLIC_URL=https://yourgame.gg --name gull-heist gull-heist
```
Add `-e TRUST_PROXY=1` when Caddy sits in front. Then install [Caddy](https://caddyserver.com), copy `Caddyfile.example` to `/etc/caddy/Caddyfile`, change the domain, and reload Caddy. It gets the HTTPS certificate on its own and forwards WebSocket traffic without extra setup.

Point the domain at the VPS with an `A` record (and `AAAA` for IPv6) at your registrar.

## The .gg domain

`.gg` domains are sold by most domain registrars. After you buy one:
- **Hosted platform (Render/Fly/Railway):** add the domain in the host's dashboard first. It tells you exactly which `CNAME`/`A` records to create at your registrar.
- **VPS:** create an `A` record for `@` (and optionally `www`) pointing to the server's IP.

DNS changes can take a few minutes to a few hours. Once the site loads over `https://`, multiplayer connects over `wss://` automatically.

## Notes

- The server runs each match: it keeps the clock, decides which steals count, and keeps the scores. A modified browser can't hand itself points or take over a match. Matches keep going when someone's tab is in the background.
- The server checks steals against where it last saw your gull and how fast gulls can fly, so teleporting doesn't work.
- Power-up and Golden Chip grabs are judged at the server's own position for your gull, not the one the page claims.
- Opening `public/index.html` straight from disk works for solo play only.

## Android app

The Android app bundles `public/` inside the APK, so solo play works offline. For multiplayer, enter the server's address in the **Multiplayer server** box on the title screen (for example `yourgame.gg`, or `192.168.1.20:8080` for a server on your Wi-Fi). The app remembers it. **Copy link** gives a web link friends can open in a browser.

The server accepts the app's origins (`https://localhost`, `capacitor://localhost`, `http://localhost`) by default.

To build a debug APK you need the Android SDK and JDK 21 (Android Studio's bundled `jbr` works):

```bash
npm install
# point JAVA_HOME at JDK 21, e.g. "C:\Program Files\Android\Android Studio\jbr"
npm run android:build        # Windows
npm run android:build:unix   # macOS / Linux
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Run `npm run cap:sync` after changing anything in `public/`, or open `android/` in Android Studio. The app allows plain `ws://` connections so it can reach a server on your Wi-Fi; turn that off (`usesCleartextTraffic` in the manifest, `allowMixedContent` in `capacitor.config.json`) before a store release.

## Tests

```bash
npm test
```
