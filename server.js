// Gull Heist server: serves the game from ./public and runs multiplayer rooms
// over WebSocket (/ws?room=code, or /ws?create=1 for a new private room).
// The server owns every match: clock, food, scores, feathers. Clients send
// their position and steal attempts; the server checks them with the same
// rules the browser uses (public/shared.js).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const GH = require('./public/shared.js');

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, ''); // e.g. https://gullheist.gg
const MAX_PEERS_PER_ROOM = Number(process.env.MAX_PEERS_PER_ROOM) || 12;
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 200;
const MAX_CONN_PER_IP = Number(process.env.MAX_CONN_PER_IP) || 8;
const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || '');
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean));
if (PUBLIC_URL) ALLOWED_ORIGINS.add(new URL(PUBLIC_URL).origin);
const RESUME_GRACE_MS = 30000;
const TICK_MS = 1000 / 15;
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
// the page's inline script is allowed by hash, so no other inline script can run
const scriptHashes = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`).join(' ');

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
const CSP = [
  "default-src 'self'",
  `script-src 'self' ${scriptHashes}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' __WS__",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400, securityHeaders).end(); return; }

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...securityHeaders });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, securityHeaders).end(); return; }

  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400, securityHeaders).end(); return; }
  // a NUL byte makes fs.stat/path.join throw synchronously, which would otherwise crash the process
  if (rel.indexOf('\0') !== -1) { res.writeHead(400, securityHeaders).end(); return; }
  if (rel === '/' || rel === '/index.html') {
    // older Safari doesn't treat ws:/wss: as 'self', so name the socket origin too
    const host = /^[a-z0-9.:[\]-]+$/i.test(req.headers.host || '') ? req.headers.host : '';
    const csp = CSP.replace('__WS__', host ? `ws://${host} wss://${host}` : '');
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache', 'Content-Security-Policy': csp, ...securityHeaders });
    res.end(req.method === 'HEAD' ? undefined : indexHtml);
    return;
  }
  const file = path.normalize(path.join(PUB, rel));
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403, securityHeaders).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': TYPES['.txt'], ...securityHeaders }).end('Not found'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      // scripts must match the page (and the server's copy of the rules), so always revalidate them
      'Cache-Control': ext === '.js' ? 'no-cache' : 'public, max-age=3600',
      ...securityHeaders,
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
});

// ---------- connection limits ----------
function clientIp(req) {
  if (TRUST_PROXY) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (xf.length) return xf[xf.length - 1];
  }
  return req.socket.remoteAddress || '?';
}
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // not a browser; browsers always send Origin on WebSocket upgrades
  let o;
  try { o = new URL(origin); } catch { return false; }
  if (ALLOWED_ORIGINS.has(o.origin)) return true;
  return !!req.headers.host && o.host === req.headers.host;
}
const connsPerIp = new Map();
const recentPerIp = new Map(); // ip -> connection attempts this minute
const roomsCreatedPerIp = new Map(); // ip -> new (never-before-seen) rooms this minute
const MAX_ROOMS_CREATED_PER_IP = 20;

// ---------- rooms ----------
// room: { name, pub, players: Map(id -> player), match, nextSlot, lastEnd }
// player: { id, tok, ws, nick, col, look, st, pl (rules state), x, y, h, a, posAt, goneAt, tokens, dropped }
const rooms = new Map();
const byToken = new Map();
const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
function newRoomCode() {
  for (;;) {
    const b = crypto.randomBytes(6);
    let s = '';
    for (let i = 0; i < 6; i++) s += CODE_CHARS[b[i] % CODE_CHARS.length] + (i === 2 ? '-' : '');
    if (!rooms.has(s)) return s;
  }
}
function roomMt(m) { return (Date.now() - m.t0) / 1000 - GH.COUNTDOWN; }
function connected(room) { return [...room.players.values()].filter(p => p.ws); }
function leaderOf(room) { const c = connected(room); return c.length ? c[0].id : null; }

function send(p, msg, droppable) {
  const ws = p.ws;
  if (!ws || ws.readyState !== 1) return;
  if (ws.bufferedAmount > 1024 * 1024) { ws.terminate(); return; }
  if (droppable && ws.bufferedAmount > 128 * 1024) return;
  ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
}
function broadcast(room, msg, filter, droppable) {
  const data = JSON.stringify(msg);
  for (const p of room.players.values()) if (!filter || filter(p)) send(p, data, droppable);
}
function lobbyMsg(room) {
  const m = room.match, conn = connected(room);
  return {
    t: 'lobby', room: room.name, pub: room.pub, leader: conn.length ? conn[0].id : null,
    members: conn.map(p => ({ id: p.id, nick: p.nick, col: p.col, look: p.look, st: p.st })),
    match: m ? { id: m.M.id, left: Math.max(0, Math.round(m.M.dur - roomMt(m))) } : null,
  };
}
function sendLobby(room) { broadcast(room, lobbyMsg(room)); }

function matchMsg(room, p) {
  const m = room.match, M = m.M, mt = roomMt(m);
  if (!p.pl || p.plMatch !== M.id) {
    const sp = GH.spawnPoint(M.seed, room.nextSlot++);
    p.pl = GH.newPlayer(p.id); p.plMatch = M.id; p.x = sp.x; p.y = sp.y; p.posAt = Date.now();
  }
  if (!(p.id in M.sc)) M.sc[p.id] = 0;
  const sp = { x: Math.round(p.x), y: Math.round(p.y) };
  return {
    t: 'match', id: M.id, seed: M.seed, dur: M.dur, mt, cnt: M.cnt, fu: M.fu, al: M.al,
    spawn: [sp.x, sp.y], f: p.pl.feathers, ground: Math.max(0, p.pl.groundUntil - mt),
  };
}
function startMatch(room) {
  const id = 'm' + crypto.randomBytes(4).toString('hex');
  const seed = crypto.randomBytes(4).readUInt32LE(0) & 0x7fffffff;
  room.match = { M: GH.createMatch(id, seed, GH.DUR), t0: Date.now(), names: {} };
  room.nextSlot = 0;
  for (const p of connected(room)) if (p.st === 'lobby' || p.st === 'results') send(p, matchMsg(room, p));
  sendLobby(room);
}
function endMatch(room) {
  const m = room.match;
  room.match = null;
  const rows = Object.entries(m.M.sc).map(([id, score]) => {
    const p = room.players.get(id), n = p || m.names[id] || {};
    return [id, n.nick || 'Gull', n.col || '#fffaf0', score];
  }).sort((a, b) => b[3] - a[3]);
  broadcast(room, { t: 'end', id: m.M.id, rows });
  sendLobby(room);
}
function gullsIn(room) {
  const out = [];
  for (const p of room.players.values()) if (p.ws && p.st === 'play') out.push({ x: p.x, y: p.y });
  return out;
}

// ---------- message handling ----------
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const MAX_SPEED = 650; // px/s, a bit above the fastest swoop

function handle(room, p, m) {
  switch (m.t) {
    case 'ping':
      if (!num(m.c, 0, 1e13)) return false;
      send(p, { t: 'pong', c: m.c, mt: room.match ? roomMt(room.match) : null });
      return true;
    case 'prof': {
      if (typeof m.nick !== 'string' || typeof m.col !== 'string') return false;
      p.nick = GH.cleanNick(m.nick);
      p.col = GH.COLS.includes(m.col) ? m.col : GH.COLS[0];
      p.look = GH.cleanLook(m.look);
      sendLobby(room);
      return true;
    }
    case 'st': {
      if (!['menu', 'lobby', 'play', 'results'].includes(m.st)) return false;
      if (m.st === 'play' && !(room.match && p.plMatch === room.match.M.id)) return true;
      if (p.st !== m.st) { p.st = m.st; sendLobby(room); }
      return true;
    }
    case 'start': {
      if (room.match) return true;
      if (!room.pub && leaderOf(room) !== p.id) { send(p, { t: 'err', m: 'Only the room leader can start.' }); return true; }
      if (p.st !== 'lobby' && p.st !== 'results') return true;
      startMatch(room);
      return true;
    }
    case 'join': {
      if (room.match && p.st !== 'play') send(p, matchMsg(room, p));
      return true;
    }
    case 'pos': {
      if (!num(m.x, 0, GH.W) || !num(m.y, 0, GH.W) || !num(m.h, -10, 10) || !num(m.a, 0, 1)) return false;
      const now = Date.now();
      if (!room.match || p.plMatch !== room.match.M.id || p.st !== 'play') return true;
      { // never let a reported position move faster than a gull can fly
        const dt = Math.min(0.25, (now - p.posAt) / 1000), lim = MAX_SPEED * dt + 10;
        const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
        const k = d > lim ? lim / d : 1;
        p.x += dx * k; p.y += dy * k;
      }
      p.h = m.h; p.a = m.a; p.posAt = now;
      return true;
    }
    case 'steal': {
      if (!Number.isInteger(m.seq) || !Number.isInteger(m.i) || !num(m.x, 0, GH.W) || !num(m.y, 0, GH.W) || !num(m.mt, -10, 1000)) return false;
      const reply = r => send(p, { t: 'res', seq: m.seq, ...r });
      const match = room.match;
      if (!match || p.plMatch !== match.M.id || p.x == null) { reply({ k: 'bad' }); return true; }
      const M = match.M, mt = roomMt(match), pl = p.pl;
      // measured against the server's own clock, never the client-supplied mt below, so a
      // client can't shrink the cooldown by backdating the judged time of its steal attempts
      if (mt - p.lastStealAt < GH.STEAL_CD) { reply({ k: 'bad' }); return true; }
      // the claimed spot must be close to where the server last saw this gull
      if (Math.hypot(m.x - p.x, m.y - p.y) > 60) { reply({ k: 'far' }); return true; }
      // judge at the moment the client saw it, allowing for up to half a second of lag
      const tc = Math.max(mt - 0.5, Math.min(mt, m.mt));
      const r = GH.attemptSteal(M, pl, m.i, m.x, m.y, tc, gullsIn(room), { margin: 0.12, slack: 14 });
      if (r.k !== 'bad' && r.k !== 'far' && r.k !== 'gone') p.lastStealAt = mt;
      reply({ k: r.k, pts: r.pts, combo: r.combo, type: r.type, f: pl.feathers, ground: Math.max(0, pl.groundUntil - mt) });
      if (r.k === 'steal' || r.k === 'swat' || r.k === 'shoo') {
        broadcast(room, { t: 'ev', k: r.k, i: m.i, by: p.id, cnt: M.cnt[m.i], fu: M.fu[m.i], al: M.al[m.i] });
      }
      return true;
    }
  }
  return false;
}

function attach(ws, req, ip, roomName, create) {
  const helloTimer = setTimeout(() => ws.close(4003, 'no hello'), 5000);
  let p = null, room = null;
  let tokens = 60, last = Date.now(), dropped = 0;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (buf, isBinary) => {
    const t = Date.now();
    tokens = Math.min(60, tokens + (t - last) * 0.05); // 50 msgs/s sustained
    last = t;
    tokens -= 1; // charge binary frames too, so they can't dodge the limiter below
    if (tokens < 0 || isBinary) { if (++dropped > 200) ws.close(4008, 'rate limit'); return; }
    let m;
    try { m = JSON.parse(buf); } catch { m = null; }
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') { if (++dropped > 200) ws.close(4008, 'bad messages'); return; }

    if (!p) {
      if (m.t !== 'hello') return;
      clearTimeout(helloTimer);
      ({ p, room } = join(ws, roomName, create, m, ip) || {});
      return;
    }
    if (!handle(room, p, m) && ++dropped > 200) ws.close(4008, 'bad messages');
  });

  ws.on('close', () => {
    clearTimeout(helloTimer);
    const n = (connsPerIp.get(ip) || 1) - 1;
    if (n > 0) connsPerIp.set(ip, n); else connsPerIp.delete(ip);
    if (p && p.ws === ws) {
      p.ws = null; p.goneAt = Date.now();
      sendLobby(room);
    }
  });
  ws.on('error', () => {});
}

function join(ws, roomName, create, hello, ip) {
  const nick = GH.cleanNick(hello.nick);
  const col = GH.COLS.includes(hello.col) ? hello.col : GH.COLS[0];
  const look = GH.cleanLook(hello.look);
  // resume a recent session (e.g. after a Wi-Fi blip) so the score carries over
  const old = typeof hello.tok === 'string' && /^[0-9a-f]{32}$/.test(hello.tok) ? byToken.get(hello.tok) : null;
  if (old && !create && old.room.name === roomName && old.room.players.get(old.p.id) === old.p) {
    const { p, room } = old;
    if (p.ws && p.ws !== ws) p.ws.close(4004, 'replaced');
    Object.assign(p, { ws, nick, col, look, goneAt: 0 });
    welcome(room, p);
    return { p, room };
  }

  let name = create ? newRoomCode() : roomName;
  let room = rooms.get(name);
  if (!room) {
    if (rooms.size >= MAX_ROOMS) { ws.close(4002, 'server full'); return null; }
    // one IP spamming distinct never-seen room names can't fill up every room slot
    const made = (roomsCreatedPerIp.get(ip) || 0) + 1;
    if (made > MAX_ROOMS_CREATED_PER_IP) { ws.close(4002, 'server full'); return null; }
    roomsCreatedPerIp.set(ip, made);
    room = { name, pub: name === 'public', players: new Map(), match: null, nextSlot: 0 };
    rooms.set(name, room);
  }
  if (room.players.size >= MAX_PEERS_PER_ROOM) { ws.close(4001, 'room full'); return null; }
  const p = {
    id: crypto.randomBytes(6).toString('hex'), tok: crypto.randomBytes(16).toString('hex'),
    ws, nick, col, look, st: 'menu', pl: null, plMatch: null, x: null, y: null, h: 0, a: 1, posAt: 0, goneAt: 0,
    lastStealAt: -1e9,
  };
  room.players.set(p.id, p);
  byToken.set(p.tok, { p, room });
  welcome(room, p);
  sendLobby(room);
  return { p, room };
}
function welcome(room, p) {
  send(p, { t: 'welcome', you: p.id, tok: p.tok, room: room.name, pub: room.pub });
  send(p, lobbyMsg(room));
  if (room.match && p.plMatch === room.match.M.id) send(p, matchMsg(room, p));
}

server.on('upgrade', (req, socket, head) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }
  if (url.pathname !== '/ws' || !originAllowed(req)) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  const ip = clientIp(req);
  const recent = (recentPerIp.get(ip) || 0) + 1;
  recentPerIp.set(ip, recent);
  if ((connsPerIp.get(ip) || 0) >= MAX_CONN_PER_IP || recent > 60) {
    socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
    return;
  }
  connsPerIp.set(ip, (connsPerIp.get(ip) || 0) + 1);
  const create = url.searchParams.get('create') === '1';
  const roomName = GH.cleanRoom(url.searchParams.get('room') || '') || 'public';
  wss.handleUpgrade(req, socket, head, ws => attach(ws, req, ip, roomName, create));
});

// ---------- game loop ----------
let tickN = 0;
const loop = setInterval(() => {
  const now = Date.now();
  tickN++;
  for (const [name, room] of rooms) {
    // forget players whose resume window ran out
    let changed = false;
    for (const [id, p] of room.players) {
      if (!p.ws && now - p.goneAt > RESUME_GRACE_MS) {
        if (room.match) room.match.names[id] = { nick: p.nick, col: p.col };
        room.players.delete(id); byToken.delete(p.tok); changed = true;
      }
    }
    if (room.players.size === 0) { rooms.delete(name); continue; }
    if (changed) sendLobby(room);

    const m = room.match;
    if (!m) continue;
    const mt = roomMt(m);
    if (mt >= m.M.dur) { endMatch(room); continue; }
    const ps = [], sc = m.M.sc;
    for (const p of room.players.values()) {
      if (p.pl && p.plMatch === m.M.id) {
        if (GH.tickPlayer(p.pl, mt)) send(p, { t: 'res', seq: 0, k: 'up', f: p.pl.feathers, ground: 0 });
        if (p.ws && p.st === 'play' && p.x != null) ps.push([p.id, Math.round(p.x), Math.round(p.y), Math.round(p.h * 100) / 100, Math.round(p.a * 100) / 100, p.pl.groundUntil > mt ? 1 : 0]);
      }
    }
    broadcast(room, { t: 's', id: m.M.id, mt: Math.round(mt * 1000) / 1000, p: ps, sc }, p => p.st === 'play', true);
    if (tickN % 15 === 0) sendLobby(room);
  }
  if (tickN % 900 === 0) { recentPerIp.clear(); roomsCreatedPerIp.clear(); } // once a minute
}, TICK_MS);

// drop connections that stopped answering (closed laptops, dead Wi-Fi)
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 20000);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Gull Heist running on http://localhost:${PORT}`);
  });
  const shutdown = () => {
    for (const ws of wss.clients) ws.close(1001, 'server restarting');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function close() {
  clearInterval(loop); clearInterval(heartbeat);
  for (const ws of wss.clients) ws.terminate();
  return new Promise(r => server.close(() => r()));
}

module.exports = { server, rooms, close };
