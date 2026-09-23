'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const GH = require('../public/shared.js');

const SEED = 123456789;
const SITTER = 46; // first blanket sitter, never a grump
const GRUMP = 46 + 8 + 1;

function local(M, i, t, fwd, right) {
  const e = M.ents[i], b = GH.bodyAt(e, t), f = GH.faceAt(e, t, M.al[i], []);
  return { x: b.x + Math.cos(f) * fwd - Math.sin(f) * right, y: b.y + Math.sin(f) * fwd + Math.cos(f) * right };
}
const behind = (M, i, t) => local(M, i, t, -8, 6);
const front = (M, i, t) => local(M, i, t, 16, 4);
// a spot in reach of the food, n px further out than a normal grab reaches
function beyondReach(M, i, t, n) {
  const e = M.ents[i], b = GH.bodyAt(e, t), f = GH.faceAt(e, t, M.al[i], []), fp = GH.foodPos(e, b, f);
  const d = GH.grabRadius(e) + n; // straight back from the food, away from the face
  return { x: fp.x - Math.cos(f) * d, y: fp.y - Math.sin(f) * d };
}

test('createMatch without options is Classic with no power-ups', () => {
  const M = GH.createMatch('m', SEED);
  assert.equal(M.mode, 'classic');
  assert.equal(M.ents.length, 62);
  assert.deepEqual(M.pus, []);
  assert.equal(M.gold, undefined);
  assert.equal(GH.createMatch('m', SEED, 90, { mode: 'nope' }).mode, 'classic');
});

test('Frenzy adds walkers after the usual cast, all with food, restocking sooner', () => {
  const C = GH.createMatch('m', SEED), F = GH.createMatch('m', SEED, 60, { mode: 'frenzy' });
  assert.equal(F.ents.length, 62 + GH.MODES.frenzy.crowd);
  const strip = e => JSON.stringify({ ...e, rr: 0 });
  C.ents.forEach((e, i) => assert.equal(strip(F.ents[i]), strip(e), `ent ${i} changed`));
  assert.ok(F.fu.every(v => v === 0));
  const pc = GH.newPlayer('a'), pf = GH.newPlayer('a'), t = 5;
  const p = behind(C, SITTER, t);
  GH.attemptSteal(C, pc, SITTER, p.x, p.y, t, []);
  GH.attemptSteal(F, pf, SITTER, p.x, p.y, t, []);
  assert.ok(F.fu[SITTER] - t < (C.fu[SITTER] - t) * 0.6);
});

test('Rush: each steal adds time to the clock', () => {
  const M = GH.createMatch('m', SEED, 30, { mode: 'rush' }), pl = GH.newPlayer('a'), t = 5;
  const p = behind(M, SITTER, t);
  const r = GH.attemptSteal(M, pl, SITTER, p.x, p.y, t, []);
  assert.equal(r.k, 'steal');
  assert.equal(r.bonus, 2);
  assert.equal(M.dur, 32);
  // Classic's clock never moves
  const C = GH.createMatch('m', SEED);
  GH.attemptSteal(C, GH.newPlayer('a'), SITTER, p.x, p.y, t, []);
  assert.equal(C.dur, GH.DUR);
});

test('puSchedule is fixed by the seed and keeps to the streets', () => {
  const a = GH.puSchedule(SEED, 'classic'), b = GH.puSchedule(SEED, 'classic');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, GH.puSchedule(SEED + 1, 'classic'));
  assert.ok(a.length >= 8);
  const lines = new Set([...Array(GH.NS).keys()].map(GH.nodeXY));
  for (const s of a) {
    assert.ok(GH.PU_KEYS.includes(s.type));
    assert.ok(lines.has(s.x) || lines.has(s.y), 'not on a street');
    assert.ok(s.x > 0 && s.x < GH.W && s.y > 0 && s.y < GH.W);
    assert.ok(s.t1 <= GH.DUR + GH.PU_LIFE && s.t1 - s.t0 === GH.PU_LIFE);
  }
  assert.ok(GH.puSchedule(SEED, 'frenzy').length > a.length * (60 / 90));
  assert.equal(GH.createMatch('m', SEED, 90, { pu: true }).pus.length, a.length);
});

test('pickups: only in reach, only while up, only once', () => {
  const M = GH.createMatch('m', SEED, 90, { pu: true }), pl = GH.newPlayer('a'), s = M.pus[0];
  const t = s.t0 + 1;
  assert.equal(GH.attemptPickup(M, pl, 0, s.x, s.y, s.t0 - 0.5).k, 'gone');
  assert.equal(GH.attemptPickup(M, pl, 0, s.x + GH.PU_R + 5, s.y, t).k, 'far');
  assert.equal(GH.attemptPickup(M, pl, 0, s.x + GH.PU_R + 5, s.y, t, { slack: 10 }).k, 'pu');
  assert.equal(GH.attemptPickup(M, GH.newPlayer('b'), 0, s.x, s.y, t).k, 'gone');
  assert.equal(GH.attemptPickup(M, pl, 99, s.x, s.y, t).k, 'bad');
  const late = M.pus[1];
  assert.equal(GH.attemptPickup(M, pl, 1, late.x, late.y, late.t1 + 0.2).k, 'gone');
  assert.equal(GH.attemptPickup(M, pl, 1, late.x, late.y, late.t1 + 0.2, { grace: 0.4 }).k, 'pu');
  const grounded = GH.newPlayer('c'); grounded.groundUntil = 99;
  assert.equal(GH.attemptPickup(M, grounded, 2, M.pus[2].x, M.pus[2].y, M.pus[2].t0 + 1).k, 'bad');
});

// force power-up k of a match to be of a given type, for the effect tests below
function withPu(type) {
  const M = GH.createMatch('m', SEED, 90, { pu: true });
  M.pus[0].type = type;
  return M;
}

test('tailwind raises the speed limit while it lasts', () => {
  const M = withPu('wind'), pl = GH.newPlayer('a'), s = M.pus[0];
  assert.equal(GH.speedMult(pl, s.t0), 1);
  GH.attemptPickup(M, pl, 0, s.x, s.y, s.t0);
  assert.equal(GH.speedMult(pl, s.t0 + 1), GH.WIND);
  assert.equal(GH.speedMult(pl, s.t0 + GH.PU.wind.dur + 0.01), 1);
});

test('double loot doubles points; big beak reaches further', () => {
  const t = 5;
  const M = withPu('dbl'), pl = GH.newPlayer('a');
  GH.applyPickup(M, pl, 0, 0, 0, t - 1);
  const p = behind(M, SITTER, t);
  const r = GH.judgeSteal(M, pl, SITTER, p.x, p.y, t, []);
  assert.equal(r.pts, GH.valueFor(M.ents[SITTER], r.type) * 2);

  const B = withPu('beak'), pb = GH.newPlayer('b');
  const q = beyondReach(B, SITTER, t, GH.BEAK - 3);
  assert.equal(GH.judgeSteal(B, pb, SITTER, q.x, q.y, t, []).k, 'far');
  GH.applyPickup(B, pb, 0, 0, 0, t - 1);
  assert.equal(GH.judgeSteal(B, pb, SITTER, q.x, q.y, t, []).k, 'steal');
});

test('camouflage fools regular people but not grumps', () => {
  const t = 5, M = withPu('cloak'), pl = GH.newPlayer('a');
  GH.applyPickup(M, pl, 0, 0, 0, t - 1);
  const p = front(M, SITTER, t);
  assert.equal(GH.judgeSteal(M, pl, SITTER, p.x, p.y, t, []).k, 'steal');
  const g = front(M, GRUMP, t);
  assert.equal(GH.judgeSteal(M, pl, GRUMP, g.x, g.y, t, []).k, 'swat');
});

test('a shield feather blocks one swat, keeps the combo, then is gone', () => {
  let t = 5;
  const M = withPu('shield'), pl = GH.newPlayer('a');
  GH.applyPickup(M, pl, 0, 0, 0, t - 1);
  assert.equal(pl.shield, 1);
  const p = behind(M, SITTER, t);
  GH.attemptSteal(M, pl, SITTER, p.x, p.y, t, []);
  t += 1;
  const g = front(M, GRUMP, t);
  const r = GH.attemptSteal(M, pl, GRUMP, g.x, g.y, t, []);
  assert.equal(r.k, 'block');
  assert.equal(pl.feathers, GH.MAX_FEATHERS);
  assert.equal(pl.shield, 0);
  assert.equal(pl.comboN, 1);
  t += GH.INV_TIME + 0.1;
  const g2 = front(M, GRUMP, t);
  assert.equal(GH.attemptSteal(M, pl, GRUMP, g2.x, g2.y, t, []).k, 'swat');
});

test('a screech dazes people nearby: they see nothing for a while', () => {
  const t = 5, M = withPu('screech'), pl = GH.newPlayer('a');
  const e = M.ents[GRUMP], o = GH.guardPos(e, GH.bodyAt(e, t));
  const dazed = GH.applyPickup(M, pl, 0, o.x + 40, o.y, t);
  assert.ok(dazed.includes(GRUMP));
  assert.ok(!dazed.includes(SITTER), 'the park is far from the plaza');
  const g = front(M, GRUMP, t + 1);
  assert.equal(GH.judgeSteal(M, GH.newPlayer('b'), GRUMP, g.x, g.y, t + 1, []).k, 'steal');
  const t2 = t + GH.SCREECH_TIME + 0.1, g2 = front(M, GRUMP, t2);
  assert.equal(GH.judgeSteal(M, GH.newPlayer('b'), GRUMP, g2.x, g2.y, t2, []).k, 'swat');
});

test('Golden Chip: pick up, safe for a moment, snatched, dropped, and it pays by the second', () => {
  const M = GH.createMatch('g', SEED, 120, { mode: 'gold' });
  const a = GH.newPlayer('a'), b = GH.newPlayer('b'), H = GH.GOLD_HOME;
  assert.deepEqual([M.gold.x, M.gold.y, M.gold.by], [H.x, H.y, null]);
  assert.equal(GH.goldGrab(M, a, H.x, H.y, -1, 0, 0).k, 'bad');
  assert.equal(GH.goldGrab(M, a, H.x + GH.GOLD_R + 5, H.y, 2, 0, 0).k, 'far');
  assert.equal(GH.goldGrab(M, a, H.x, H.y, 2, 0, 0).k, 'pick');
  assert.equal(M.gold.by, 'a');
  assert.equal(GH.goldGrab(M, a, H.x, H.y, 2.1, 0, 0).k, 'bad');
  assert.equal(GH.goldGrab(M, b, 500, 500, 2.5, 500, 500).k, 'safe');
  assert.equal(GH.goldTick(M, 4.2), 2 * GH.GOLD_PTS);
  assert.equal(M.sc.a, 2 * GH.GOLD_PTS);
  assert.equal(GH.goldGrab(M, b, 500, 500, 4.3, 500 + GH.GOLD_MUG + 5, 500).k, 'far');
  const r = GH.goldGrab(M, b, 500, 500, 4.3, 510, 500);
  assert.equal(r.k, 'mug');
  assert.equal(r.from, 'a');
  assert.equal(GH.goldTick(M, 5.2), 0);
  assert.equal(GH.goldDrop(M, 700, 710, 6), true);
  assert.equal(M.gold.by, null);
  assert.equal(GH.goldGrab(M, a, 700, 710, 6.2, 0, 0).k, 'bad', 'too soon after the drop');
  assert.equal(GH.goldGrab(M, a, 700, 710, 7, 0, 0).k, 'pick');
});
