# Gull Heist

A top-down seagull food-heist game for phones and computers, with online multiplayer.

This folder is the whole website. `server.js` serves the game and relays multiplayer data between players over WebSocket. Players don't need accounts.

```
server.js          web server + multiplayer relay (Node 18+, one dependency: ws)
public/index.html  the game (a single self-contained page)
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

- `https://yourgame.gg/` puts everyone in the room called `public`.
- `https://yourgame.gg/?room=friday` is a private room called `friday`. Only people with that link (or who type that code in the lobby) see each other.
- Room codes can use lowercase letters, numbers and dashes, up to 24 characters.
- Each room holds up to 12 players.

The lobby has a **Copy link** button that copies the current room's link.

## Settings (environment variables)

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `8080` | Port the server listens on. Most hosts set this for you. |
| `PUBLIC_URL` | *(unset)* | Your site's address, e.g. `https://yourgame.gg`. Turns on the link-preview image in Discord and similar apps. |
| `MAX_PEERS_PER_ROOM` | `12` | Players allowed in one room. |
| `MAX_ROOMS` | `200` | Rooms allowed at once. |

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
Then install [Caddy](https://caddyserver.com), copy `Caddyfile.example` to `/etc/caddy/Caddyfile`, change the domain, and reload Caddy. It gets the HTTPS certificate on its own and forwards WebSocket traffic without extra setup.

Point the domain at the VPS with an `A` record (and `AAAA` for IPv6) at your registrar.

## The .gg domain

`.gg` domains are sold by most domain registrars. After you buy one:
- **Hosted platform (Render/Fly/Railway):** add the domain in the host's dashboard first. It tells you exactly which `CNAME`/`A` records to create at your registrar.
- **VPS:** create an `A` record for `@` (and optionally `www`) pointing to the server's IP.

DNS changes can take a few minutes to a few hours. Once the site loads over `https://`, multiplayer connects over `wss://` automatically.

## Notes

- Each match runs in one player's browser (the "host") and everyone else follows it. If the host leaves, another player takes over and the match continues.
- If the host hides the browser tab, the match can pause for everyone until they come back. Browsers slow down background tabs.
- Scores are trusted from players' browsers, so this is built for playing with friends, not for a public leaderboard.
- Opening `public/index.html` straight from disk works for solo play only.
