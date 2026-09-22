// Gull Heist server: serves the game from ./public and relays multiplayer
// presence between players in the same room over WebSocket (/ws?room=code).
// The server holds no game logic. One player's browser runs each match and
// the others follow it; if that player leaves, the next one takes over.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, ''); // e.g. https://gullheist.gg
const MAX_PEERS_PER_ROOM = Number(process.env.MAX_PEERS_PER_ROOM) || 12;
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 200;
const MAX_PRESENCE_BYTES = 4096;
const PUB = path.join(__dirname, 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

// index.html is read once; PUBLIC_URL fills in the link-preview tags (Discord, etc.)
let indexHtml = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
indexHtml = PUBLIC_URL
  ? indexHtml.replaceAll('__PUBLIC_URL__', PUBLIC_URL)
  : indexHtml.replace(/^.*__PUBLIC_URL__.*\n/gm, '');

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400).end(); return; }

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...securityHeaders });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: wss.clients.size }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, securityHeaders).end(); return; }

  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
  if (rel === '/' || rel === '/index.html') {
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache', ...securityHeaders });
    res.end(req.method === 'HEAD' ? undefined : indexHtml);
    return;
  }
  const file = path.normalize(path.join(PUB, rel));
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403, securityHeaders).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': TYPES['.txt'], ...securityHeaders }).end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'public, max-age=3600',
      ...securityHeaders,
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
});

// ---------- multiplayer relay ----------
// rooms: name -> Map(peerId -> { ws, pr })
const rooms = new Map();
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });

function roomNameFrom(reqUrl) {
  try {
    const r = new URL(reqUrl, 'http://localhost').searchParams.get('room') || '';
    const clean = r.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
    return clean || 'public';
  } catch { return 'public'; }
}

function broadcast(room, exceptPeer, msg) {
  const data = JSON.stringify(msg);
  for (const [peer, c] of room) {
    if (peer !== exceptPeer && c.ws.readyState === 1) c.ws.send(data);
  }
}

wss.on('connection', (ws, req) => {
  const name = roomNameFrom(req.url);
  let room = rooms.get(name);
  if (!room) {
    if (rooms.size >= MAX_ROOMS) { ws.close(4002, 'server full'); return; }
    room = new Map();
    rooms.set(name, room);
  }
  if (room.size >= MAX_PEERS_PER_ROOM) { ws.close(4001, 'room full'); return; }

  const peer = crypto.randomBytes(8).toString('hex');
  const me = { ws, pr: {} };
  room.set(peer, me);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.send(JSON.stringify({
    t: 'welcome',
    you: peer,
    room: name,
    peers: [...room].filter(([p]) => p !== peer).map(([p, c]) => ({ peer: p, pr: c.pr })),
  }));

  // token bucket: ~60 presence updates/s sustained, bursts of 120
  let tokens = 120, last = Date.now();
  ws.on('message', (buf) => {
    const t = Date.now();
    tokens = Math.min(120, tokens + (t - last) * 0.06);
    last = t;
    if (tokens < 1) return;
    tokens -= 1;
    if (buf.length > MAX_PRESENCE_BYTES + 64) return;
    let m;
    try { m = JSON.parse(buf); } catch { return; }
    if (!m || m.t !== 'p' || typeof m.pr !== 'object' || m.pr === null || Array.isArray(m.pr)) return;
    me.pr = m.pr;
    broadcast(room, peer, { t: 'p', peer, pr: m.pr });
  });

  ws.on('close', () => {
    room.delete(peer);
    broadcast(room, peer, { t: 'bye', peer });
    if (room.size === 0) rooms.delete(name);
  });
  ws.on('error', () => {});
});

// drop connections that stopped answering (closed laptops, dead Wi-Fi)
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 20000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`Gull Heist running on http://localhost:${PORT}`);
});

function shutdown() {
  for (const ws of wss.clients) ws.close(1001, 'server restarting');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
