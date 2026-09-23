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
- A dashed ring marks the food a swoop from where you are would grab.

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
- Opening `public/index.html` straight from disk works for solo play only.

## Tests

```bash
npm test
```
