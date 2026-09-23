'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const WebSocket = require('ws');
const GH = require('../public/shared.js');
const { server, close } = require('../server.js');

let port;
const clients = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { port = server.address().port; r(); })));
after(async () => {
  for (const c of clients) c.ws.terminate();
  await close();
});

// a WebSocket client that keeps every message it got, so tests can wait for one
function client(path, opts) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, opts);
  const c = { ws, log: [], waiters: [] };
  clients.push(c);
  ws.on('message', d => {
    c.log.push(JSON.parse(d));
    for (const w of [...c.waiters]) w();
  });
  ws.on('error', () => {});
  c.opened = new Promise((res, rej) => { ws.once('open', res); ws.once('unexpected-response', (req, r) => rej(r.statusCode)); });
  c.closed = new Promise(res => ws.once('close', code => res(code)));
  c.send = m => ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  c.mark = () => c.log.length;
  // first message at index >= from that matches
  c.wait = (pred, from = 0, ms = 4000) => new Promise((res, rej) => {
    let timer;
    const check = () => {
      for (let k = from; k < c.log.length; k++) {
        if (pred(c.log[k])) { clearTimeout(timer); c.waiters = c.waiters.filter(w => w !== check); res(c.log[k]); return true; }
      }
      return false;
    };
    if (check()) return;
    timer = setTimeout(() => { c.waiters = c.waiters.filter(w => w !== check); rej(new Error('timed out waiting for a message')); }, ms);
    c.waiters.push(check);
  });
  return c;
}
async function hello(path, nick, tok) {
  const c = client(path);
  await c.opened;
  c.send({ t: 'hello', nick, col: GH.COLS[0], tok });
  c.welcome = await c.wait(m => m.t === 'welcome');
  return c;
}
function get(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path, agent: false }, r => {
      let body = '';
      r.setEncoding('utf8');
      r.on('data', d => { body += d; });
      r.on('end', () => res({ status: r.statusCode, headers: r.headers, body }));
    }).on('error', rej);
  });
}

test('GET / sends a Content-Security-Policy; /shared.js is JavaScript', async () => {
  const idx = await get('/');
  assert.equal(idx.status, 200);
  assert.match(idx.headers['content-security-policy'], /default-src 'self'/);
  assert.match(idx.headers['content-security-policy'], /script-src 'self' 'sha256-/);
  const js = await get('/shared.js');
  assert.equal(js.status, 200);
  assert.match(js.headers['content-type'], /^text\/javascript/);
  assert.match(js.body, /createMatch/);
  assert.equal((await get('/../server.js')).status, 404);
});

test('WebSocket upgrade from a foreign Origin is refused with 403', async () => {
  const c = client('/ws?room=public', { origin: 'https://evil.example' });
  await assert.rejects(c.opened, s => s === 403);
});

test('creating a room returns a code like abc-123', async () => {
  const c = await hello('/ws?create=1', 'solo');
  assert.match(c.welcome.room, /^[a-z0-9]{3}-[a-z0-9]{3}$/);
  assert.equal(c.welcome.pub, false);
  const lobby = await c.wait(m => m.t === 'lobby');
  assert.equal(lobby.leader, c.welcome.you);
  c.ws.close();
  await c.closed;
});

test('invalid JSON spam closes the socket with 4008', async () => {
  const c = client('/ws?room=public');
  await c.opened;
  for (let k = 0; k < 250; k++) c.send('{not json');
  assert.equal(await c.closed, 4008);
});

// ---- one private room with a real match, shared by the tests below ----
let A, B, C, code, matchA, local, target;

test('two clients in a private room see each other', async () => {
  A = await hello('/ws?create=1', 'Alice');
  code = A.welcome.room;
  B = await hello(`/ws?room=${code}`, 'Bob');
  assert.equal(B.welcome.room, code);
  assert.notEqual(B.welcome.you, A.welcome.you);
  const both = m => m.t === 'lobby' && m.members.length === 2;
  const la = await A.wait(both), lb = await B.wait(both);
  for (const l of [la, lb]) {
    assert.deepEqual(l.members.map(p => p.nick).sort(), ['Alice', 'Bob']);
    assert.equal(l.leader, A.welcome.you);
  }
});

test('a gull look is checked and shown to the room', async () => {
  const at = B.mark();
  A.send({ t: 'prof', nick: 'Alice', col: GH.COLS[2], look: { p: 3, h: 99, e: 1 } });
  const l = await B.wait(m => m.t === 'lobby' && m.members.some(p => p.id === A.welcome.you && p.look && p.look.p === 3), at);
  const me = l.members.find(p => p.id === A.welcome.you);
  assert.deepEqual(me.look, { p: 3, h: 0, e: 1 });
  assert.equal(me.col, GH.COLS[2]);
});

test('only the leader of a private room can start', async () => {
  const at = B.mark();
  B.send({ t: 'st', st: 'lobby' });
  B.send({ t: 'start' });
  const err = await B.wait(m => m.t === 'err', at);
  assert.match(err.m, /leader/);
  await sleep(100);
  assert.ok(!A.log.some(m => m.t === 'match') && !B.log.some(m => m.t === 'match'));
});

test('the leader starts a match for their room only', async () => {
  C = await hello('/ws?create=1', 'Carol');
  C.send({ t: 'st', st: 'lobby' });
  A.send({ t: 'st', st: 'lobby' });
  await A.wait(m => m.t === 'lobby' && m.members.every(p => p.st === 'lobby'));
  A.send({ t: 'start' });
  matchA = await A.wait(m => m.t === 'match');
  const matchB = await B.wait(m => m.t === 'match');
  assert.equal(matchB.id, matchA.id);
  assert.equal(matchB.seed, matchA.seed);
  assert.ok(matchA.mt < 0 && matchA.mt >= -GH.COUNTDOWN);
  assert.notDeepEqual(matchA.spawn, matchB.spawn);
  await sleep(300);
  assert.ok(!C.log.some(m => m.t === 'match' || m.t === 's'), 'another room got the match');
  C.ws.close();
  await C.closed;

  A.send({ t: 'st', st: 'play' });
  B.send({ t: 'st', st: 'play' });
  await A.wait(m => m.t === 's');
  await B.wait(m => m.t === 's');
});

test('a steal during the countdown is rejected', async () => {
  const [x, y] = matchA.spawn;
  const at = A.mark();
  A.send({ t: 'steal', seq: 1, i: 46, x, y, mt: -1 });
  const r = await A.wait(m => m.t === 'res' && m.seq === 1, at);
  assert.equal(r.k, 'bad');
});

test('a steal claimed far from the reported position is refused', async () => {
  const [x, y] = matchA.spawn;
  const at = A.mark();
  A.send({ t: 'steal', seq: 2, i: 46, x: x + 200, y, mt: 0 });
  const r = await A.wait(m => m.t === 'res' && m.seq === 2, at);
  assert.equal(r.k, 'far');
});

// the server's match time right now, from the latest snapshot
async function serverMt(c) {
  const at = c.mark();
  const s = await c.wait(m => m.t === 's', at);
  return { s, t: Date.now() };
}
const mtNow = ({ s, t }) => s.mt + (Date.now() - t) / 1000;

test('a legit steal scores and the other player sees it; a teleport does not', async () => {
  local = GH.createMatch(matchA.id, matchA.seed, matchA.dur);
  // closest regular (non-grump) sitter: they stay put, so the gull can walk up to them
  const [sx, sy] = matchA.spawn;
  target = local.ents.map((e, i) => ({ e, i })).filter(({ e }) => e.kind === 'sit' && !e.grump)
    .sort((a, b) => Math.hypot(a.e.x - sx, a.e.y - sy) - Math.hypot(b.e.x - sx, b.e.y - sy))[0];
  const { e, i } = target;

  // walk A over at 400 px/s (the countdown runs meanwhile)
  let x = sx, y = sy;
  for (;;) {
    const d = Math.hypot(e.x - x, e.y - y), step = Math.min(20, d);
    if (d > 0) { x += (e.x - x) / d * step; y += (e.y - y) / d * step; }
    A.send({ t: 'pos', x, y, h: 0, a: 1 });
    await sleep(50);
    if (d === 0) break;
  }
  for (let k = 0; k < 3; k++) { A.send({ t: 'pos', x, y, h: 0, a: 1 }); await sleep(50); }

  let clock = await serverMt(A);
  while (clock.s.mt < 0.3) { await sleep(100); clock = await serverMt(A); }
  const aRow = clock.s.p.find(r => r[0] === A.welcome.you);
  assert.ok(Math.hypot(aRow[1] - e.x, aRow[2] - e.y) <= 2, 'gull did not arrive');

  // B teleports next to the same food in one jump and grabs: the server has not seen B fly there
  {
    const T = mtNow(clock) - 0.05;
    const f = GH.foodPos(e, GH.bodyAt(e, T), GH.faceAt(e, T, local.al[i], []));
    const at = B.mark();
    B.send({ t: 'pos', x: f.x, y: f.y, h: 0, a: 1 });
    B.send({ t: 'steal', seq: 7, i, x: f.x, y: f.y, mt: T });
    const r = await B.wait(m => m.t === 'res' && m.seq === 7, at);
    assert.notEqual(r.k, 'steal');
    assert.equal(r.k, 'far');
  }

  // A steps just behind the sitter (out of their sight, in reach of the food) and grabs
  clock = await serverMt(A);
  const T = mtNow(clock) - 0.05;
  const face = GH.faceAt(e, T, local.al[i], []);
  const px = e.x - Math.cos(face) * 6 - Math.sin(face) * 5, py = e.y - Math.sin(face) * 6 + Math.cos(face) * 5;
  const expect = GH.judgeSteal(local, GH.newPlayer('x'), i, px, py, T, []);
  assert.equal(expect.k, 'steal', 'test picked a bad spot');
  const at = A.mark(), atB = B.mark();
  A.send({ t: 'pos', x: px, y: py, h: face, a: 1 });
  A.send({ t: 'steal', seq: 3, i, x: px, y: py, mt: T });
  const r = await A.wait(m => m.t === 'res' && m.seq === 3, at);
  assert.equal(r.k, 'steal');
  assert.equal(r.type, expect.type);
  assert.equal(r.pts, expect.pts);
  assert.equal(r.combo, 1);

  const ev = await B.wait(m => m.t === 'ev', atB);
  assert.equal(ev.k, 'steal');
  assert.equal(ev.i, i);
  assert.equal(ev.by, A.welcome.you);
  assert.equal(ev.cnt, 1);
  const snap = await B.wait(m => m.t === 's' && m.sc[A.welcome.you] === expect.pts, atB);
  assert.equal(snap.sc[B.welcome.you], 0);

  // the same food again right away is gone
  await sleep(GH.STEAL_CD * 1000 + 50);
  clock = await serverMt(A);
  const T2 = mtNow(clock) - 0.05;
  const at2 = A.mark();
  A.send({ t: 'steal', seq: 4, i, x: px, y: py, mt: T2 });
  assert.equal((await A.wait(m => m.t === 'res' && m.seq === 4, at2)).k, 'gone');
});

test('reconnecting with the token resumes the same player', async () => {
  const { you, tok } = B.welcome;
  B.ws.close();
  await B.closed;
  await A.wait(m => m.t === 'lobby' && m.members.length === 1);
  const B2 = await hello(`/ws?room=${code}`, 'Bob', tok);
  assert.equal(B2.welcome.you, you);
  assert.equal(B2.welcome.room, code);
  const m = await B2.wait(m => m.t === 'match');
  assert.equal(m.id, matchA.id);
  // a token is only good for its own room
  const other = await hello('/ws?create=1', 'Bob', tok);
  assert.notEqual(other.welcome.you, you);
});
