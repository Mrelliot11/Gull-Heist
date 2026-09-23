'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const GH = require('../public/shared.js');

const SEED = 123456789;
const WALKERS = 46;
// entity layout from buildEnts: 46 walkers, 8 blanket sitters, 4 bench sitters (the 2nd a grump), 4 carts
const SITTER = WALKERS; // first blanket sitter, never a grump
const GRUMP = WALKERS + 8 + 1;
const CART = WALKERS + 8 + 4;

// a point in the person's own frame (forward, right), like foodPos uses
function local(M, i, t, fwd, right) {
  const e = M.ents[i], b = GH.bodyAt(e, t), f = GH.faceAt(e, t, M.al[i], []);
  return { x: b.x + Math.cos(f) * fwd - Math.sin(f) * right, y: b.y + Math.sin(f) * fwd + Math.cos(f) * right };
}
const behind = (M, i, t) => local(M, i, t, -8, 6); // within grab reach of the food, outside the cone
const front = (M, i, t) => local(M, i, t, 16, 4); // right in front of the face

test('buildEnts / createMatch are deterministic for a seed', () => {
  const a = GH.createMatch('m1', SEED), b = GH.createMatch('m1', SEED);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const c = GH.createMatch('m1', SEED + 1);
  assert.notEqual(JSON.stringify(a.ents), JSON.stringify(c.ents));
  assert.equal(a.ents.length, WALKERS + 8 + 4 + 4);
  assert.equal(a.ents[GRUMP].grump, true);
  assert.equal(a.ents[SITTER].grump, false);
  assert.equal(a.ents[CART].kind, 'cart');

  // walker positions don't depend on the order in which times are queried
  const e1 = GH.buildEnts(SEED), e2 = GH.buildEnts(SEED);
  const late = e2.slice(0, WALKERS).map(e => GH.walkerAt(e, 80));
  for (let t = 0; t <= 80; t += 0.5) e1.slice(0, WALKERS).forEach(e => GH.walkerAt(e, t));
  assert.deepEqual(e1.slice(0, WALKERS).map(e => GH.walkerAt(e, 80)), late);
});

test('walkerAt stays inside the city and moves/turns smoothly', () => {
  const ents = GH.buildEnts(42);
  for (const e of ents.slice(0, WALKERS)) {
    let prev = GH.walkerAt(e, 0);
    for (let t = 0.05; t <= GH.DUR; t += 0.05) {
      const p = GH.walkerAt(e, t);
      assert.ok(p.x >= 0 && p.x <= GH.W && p.y >= 0 && p.y <= GH.W, `out of bounds at t=${t}: ${p.x},${p.y}`);
      assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y) < 10, `jump at t=${t}`);
      assert.ok(Math.abs(GH.wrap(p.dir - prev.dir)) < 0.2, `facing jump at t=${t}`);
      prev = p;
    }
  }
});

test('judgeSteal: behind a sitter is a steal', () => {
  const M = GH.createMatch('m', SEED), pl = GH.newPlayer('a'), t = 5;
  const p = behind(M, SITTER, t);
  const r = GH.judgeSteal(M, pl, SITTER, p.x, p.y, t, []);
  assert.equal(r.k, 'steal');
  assert.equal(r.combo, 1);
  assert.equal(r.pts, GH.valueFor(M.ents[SITTER], r.type));
});

test('judgeSteal: from the front a regular person shoos', () => {
  const M = GH.createMatch('m', SEED), pl = GH.newPlayer('a'), t = 5;
  const p = front(M, SITTER, t);
  assert.equal(GH.judgeSteal(M, pl, SITTER, p.x, p.y, t, []).k, 'shoo');
});

test('judgeSteal: from the front a grump swats, but only shoos while invulnerable', () => {
  const M = GH.createMatch('m', SEED), pl = GH.newPlayer('a'), t = 5;
  const p = front(M, GRUMP, t);
  assert.equal(GH.judgeSteal(M, pl, GRUMP, p.x, p.y, t, []).k, 'swat');
  pl.invUntil = t + 1;
  assert.equal(GH.judgeSteal(M, pl, GRUMP, p.x, p.y, t, []).k, 'shoo');
});

test('judgeSteal: a cart vendor facing the cart swats', () => {
  const M = GH.createMatch('m', SEED), pl = GH.newPlayer('a'), e = M.ents[CART];
  const c = GH.coneOf(e, false);
  let t = null;
  for (let s = 0; s < GH.DUR && t == null; s += 0.1) {
    const b = GH.bodyAt(e, s), f = GH.faceAt(e, s, 0, []);
    if (GH.inCone(GH.guardPos(e, b), f, e.x, e.y, c.half - 0.2, c.range)) t = s;
  }
  assert.ok(t != null, 'vendor never looks at the cart');
  assert.equal(GH.judgeSteal(M, pl, CART, e.x, e.y, t, []).k, 'swat');
});

test('judgeSteal: gone after the food is taken until it restocks', () => {
  const M = GH.createMatch('m', SEED), pl = GH.newPlayer('a'), t = 5;
  const p = behind(M, SITTER, t);
  assert.equal(GH.attemptSteal(M, pl, SITTER, p.x, p.y, t, []).k, 'steal');
  assert.ok(M.fu[SITTER] > t);
  const pl2 = GH.newPlayer('b'), t2 = t + 1;
  const q = behind(M, SITTER, t2);
  assert.equal(GH.judgeSteal(M, pl2, SITTER, q.x, q.y, t2, []).k, 'gone');
  const t3 = M.fu[SITTER] + 0.05;
  const r = behind(M, SITTER, t3);
  assert.notEqual(GH.judgeSteal(M, pl2, SITTER, r.x, r.y, t3, []).k, 'gone');
});

test('judgeSteal: bad during the countdown or while grounded', () => {
  const M = GH.createMatch('m', SEED), pl = GH.newPlayer('a');
  const p = behind(M, SITTER, -1);
  assert.equal(GH.judgeSteal(M, pl, SITTER, p.x, p.y, -1, []).k, 'bad');
  const q = behind(M, SITTER, 5);
  pl.groundUntil = 8;
  assert.equal(GH.judgeSteal(M, pl, SITTER, q.x, q.y, 5, []).k, 'bad');
  assert.equal(GH.judgeSteal(M, pl, 9999, q.x, q.y, 5, []).k, 'bad');
});

test('attemptSteal: combo climbs to 5 and resets on a swat', () => {
  const M = GH.createMatch('m', SEED), pl = GH.newPlayer('a');
  const targets = [46, 47, 48, 49, 50, 51];
  let t = 5, total = 0;
  targets.forEach((i, n) => {
    const p = behind(M, i, t);
    const r = GH.attemptSteal(M, pl, i, p.x, p.y, t, []);
    assert.equal(r.k, 'steal', `target ${i}`);
    assert.equal(r.combo, Math.min(5, n + 1));
    assert.equal(r.pts, GH.valueFor(M.ents[i], r.type) * r.combo);
    total += r.pts;
    t += 1;
  });
  assert.equal(M.sc.a, total);
  const g = front(M, GRUMP, t);
  const s = GH.attemptSteal(M, pl, GRUMP, g.x, g.y, t, []);
  assert.equal(s.k, 'swat');
  assert.equal(s.feathers, GH.MAX_FEATHERS - 1);
  assert.equal(pl.comboN, 0);
  t += 0.5;
  const p = behind(M, 52, t);
  assert.equal(GH.attemptSteal(M, pl, 52, p.x, p.y, t, []).combo, 1);
});

test('three swats ground the player; tickPlayer gives the feathers back', () => {
  const M = GH.createMatch('m', SEED), pl = GH.newPlayer('a');
  let t = 5, r;
  for (let n = 0; n < GH.MAX_FEATHERS; n++) {
    const g = front(M, GRUMP, t);
    r = GH.attemptSteal(M, pl, GRUMP, g.x, g.y, t, []);
    assert.equal(r.k, 'swat', `swat ${n + 1}`);
    t += GH.INV_TIME + 0.3;
  }
  const tg = t - GH.INV_TIME - 0.3;
  assert.equal(pl.feathers, 0);
  assert.equal(pl.groundUntil, tg + GH.GROUND_TIME);
  assert.ok(Math.abs(r.ground - GH.GROUND_TIME) < 1e-9);
  const p = behind(M, SITTER, tg + 1);
  assert.equal(GH.judgeSteal(M, pl, SITTER, p.x, p.y, tg + 1, []).k, 'bad');
  assert.equal(GH.tickPlayer(pl, tg + GH.GROUND_TIME - 0.1), false);
  assert.equal(pl.feathers, 0);
  assert.equal(GH.tickPlayer(pl, tg + GH.GROUND_TIME), true);
  assert.equal(pl.feathers, GH.MAX_FEATHERS);
  assert.equal(pl.groundUntil, 0);
});

test('findTarget: a swoop that passes the food between two samples still catches it', () => {
  const M = GH.createMatch('m', SEED), t = 5, e = M.ents[SITTER];
  const fp = GH.foodPos(e, GH.bodyAt(e, t), GH.faceAt(e, t, 0, []));
  const a = { x: fp.x - 60, y: fp.y + 1 }, b = { x: fp.x + 60, y: fp.y + 1 };
  const hit = GH.findTarget(M, t, b.x, b.y, a.x, a.y, []);
  assert.ok(hit, 'no target');
  assert.equal(hit.i, SITTER);
  assert.ok(hit.d < 2);
  for (const q of [a, b]) {
    const only = GH.findTarget(M, t, q.x, q.y, q.x, q.y, []);
    assert.ok(!only || only.i !== SITTER, 'endpoints alone should not reach it');
  }
});

test('cleanNick strips control and bidi characters and trims to 14', () => {
  assert.equal(GH.cleanNick('  ‮ab\u0000c​⁦d﻿  '), 'abcd');
  assert.equal(GH.cleanNick('abcdefghijklmnopqrstuvwxyz'), 'abcdefghijklmn');
  assert.equal(GH.cleanNick('\u0007‮'), 'Gull');
  assert.equal(GH.cleanNick(42), 'Gull');
  assert.equal(GH.cleanRoom('AbC-12!3'), 'abc-123');
});

test('spawnPoint gives 12 distinct points inside the city', () => {
  for (const seed of [1, SEED, 0x7fffffff]) {
    const seen = new Set();
    for (let s = 0; s < 12; s++) {
      const p = GH.spawnPoint(seed, s);
      assert.ok(p.x > 0 && p.x < GH.W && p.y > 0 && p.y < GH.W);
      seen.add(p.x + ',' + p.y);
    }
    assert.equal(seen.size, 12);
  }
});
