'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');
const { toPlain } = require('./support');

// Pure board/game math (Derive.gs) — no Sheet needed. Ports the equivalent
// groups from apps-script/Tests.gs; see that file's new header comment for
// why they moved here instead of staying editor-only.

test('clampTile_ clamps to the board', () => {
  const { globals: g } = createHarness();
  assert.equal(g.clampTile_(-3), 0);
  assert.equal(g.clampTile_(0), 0);
  assert.equal(g.clampTile_(100), 100);
  assert.equal(g.clampTile_(104), 100);
});

test('validateSeason_ accepts DEFAULT_SEASON', () => {
  const { globals: g } = createHarness();
  assert.doesNotThrow(() => g.validateSeason_(g.DEFAULT_SEASON));
});

test('validateSeason_ rejects a tile that is two things at once', () => {
  const { globals: g } = createHarness();
  const bad = { shortcuts: { 5: 17 }, setbacks: { 17: 7 }, power: [] };
  assert.throws(() => g.validateSeason_(bad), /tile 17 is both/);
});

test('validateSeason_ rejects a shortcut that does not climb', () => {
  const { globals: g } = createHarness();
  assert.throws(() => g.validateSeason_({ shortcuts: { 20: 10 }, setbacks: {}, power: [] }), /does not climb/);
});

test('validateSeason_ rejects a setback that does not slide down', () => {
  const { globals: g } = createHarness();
  assert.throws(() => g.validateSeason_({ shortcuts: {}, setbacks: { 10: 20 }, power: [] }), /does not slide down/);
});

test('validateSeason_ rejects tile 100 as a shortcut/setback/power tile', () => {
  const { globals: g } = createHarness();
  assert.throws(() => g.validateSeason_({ shortcuts: {}, setbacks: {}, power: [100] }), /finish\)/);
});

test('validatePowerup_ accepts POWERUP_', () => {
  const { globals: g } = createHarness();
  assert.doesNotThrow(() => g.validatePowerup_(g.POWERUP_));
});

test('validatePowerup_ rejects a ratio that grants zero items', () => {
  const { globals: g } = createHarness();
  assert.throws(
    () => g.validatePowerup_(Object.assign({}, g.POWERUP_, { rollsPerLanding: 2, rollsPerPowerup: 3 })),
    /grants zero items/
  );
});

test('validatePowerup_ rejects negative/zero tunables', () => {
  const { globals: g } = createHarness();
  assert.throws(() => g.validatePowerup_(Object.assign({}, g.POWERUP_, { jumpDistance: 0 })), /jumpDistance/);
  assert.throws(() => g.validatePowerup_(Object.assign({}, g.POWERUP_, { shieldCharges: 0 })), /shieldCharges/);
  assert.throws(() => g.validatePowerup_(Object.assign({}, g.POWERUP_, { windPushback: -1 })), /windPushback/);
  assert.throws(() => g.validatePowerup_(Object.assign({}, g.POWERUP_, { pullMaxDistance: 0 })), /pullMaxDistance/);
});

test('ladderPath_ rails are parallel and equidistant from the centerline', () => {
  const { globals: g } = createHarness();
  const p = g.ladderPath_(4, 22);
  const [r1, r2] = p.rails;
  const dx1 = r1.x2 - r1.x1, dy1 = r1.y2 - r1.y1;
  const dx2 = r2.x2 - r2.x1, dy2 = r2.y2 - r2.y1;
  assert.ok(Math.abs(dx1 * dy2 - dy1 * dx2) < 1e-9, 'rails should be parallel');

  const mid1 = g.tileCenter_(4), mid2 = g.tileCenter_(22);
  const distToCenter = (rail, t, center) => {
    const x = rail.x1 + (rail.x2 - rail.x1) * t, y = rail.y1 + (rail.y2 - rail.y1) * t;
    return Math.hypot(x - center.x, y - center.y);
  };
  assert.ok(Math.abs(distToCenter(r1, 0, mid1) - distToCenter(r2, 0, mid1)) < 1e-9);
  assert.ok(Math.abs(distToCenter(r1, 1, mid2) - distToCenter(r2, 1, mid2)) < 1e-9);
});

test('ladderPath_ rungs lie on both rails', () => {
  const { globals: g } = createHarness();
  const p = g.ladderPath_(4, 22);
  const onSegment = (px, py, seg) => {
    const cross = (seg.x2 - seg.x1) * (py - seg.y1) - (seg.y2 - seg.y1) * (px - seg.x1);
    const within = px >= Math.min(seg.x1, seg.x2) - 1e-6 && px <= Math.max(seg.x1, seg.x2) + 1e-6 &&
      py >= Math.min(seg.y1, seg.y2) - 1e-6 && py <= Math.max(seg.y1, seg.y2) + 1e-6;
    return Math.abs(cross) < 1e-6 && within;
  };
  p.rungs.forEach((rung) => {
    assert.ok(onSegment(rung.x1, rung.y1, p.rails[0]), 'rung endpoint on rail 1');
    assert.ok(onSegment(rung.x2, rung.y2, p.rails[1]), 'rung endpoint on rail 2');
  });
});

test('snakePath_ starts and ends at the head/tail tile centers', () => {
  const { globals: g } = createHarness();
  const p = g.snakePath_(17, 7);
  const head = g.tileCenter_(17), tail = g.tileCenter_(7);
  assert.ok(Math.abs(p.headX - head.x) < 1e-9 && Math.abs(p.headY - head.y) < 1e-9);
  const parts = p.d.trim().split(' ');
  const lastX = Number(parts[parts.length - 2].replace(/^[ML]/, ''));
  const lastY = Number(parts[parts.length - 1]);
  assert.ok(Math.abs(lastX - tail.x) < 1e-2 && Math.abs(lastY - tail.y) < 1e-2);
});

test('computeStandings_ sorts by tile desc then name asc, and shares rank on ties', () => {
  const { globals: g } = createHarness();
  const players = [
    { name: 'Zed', tile: 50 },
    { name: 'Ann', tile: 50 },
    { name: 'Bo', tile: 90 },
    { name: 'Cy', tile: 10 }
  ];
  const ranked = g.computeStandings_(players);
  assert.deepEqual(ranked.map((r) => r.player.name), ['Bo', 'Ann', 'Zed', 'Cy']);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 2, 4]);
  assert.deepEqual(ranked.map((r) => r.tied), [false, true, true, false]);
});

test('classifyTile_ marks the finish tile even though it is not in `power`', () => {
  const { globals: g } = createHarness();
  const ct = g.classifyTile_(100, g.DEFAULT_SEASON);
  assert.equal(ct.type, 'finish');
});

test('resolveLanding_ resolves a shortcut, a setback, and a plain tile', () => {
  const { globals: g } = createHarness();
  // toPlain: resolveLanding_ builds its return object inside the harness's
  // own vm realm — see support.js's comment on why that needs stripping
  // before a strict deepEqual against a literal written here.
  assert.deepEqual(toPlain(g.resolveLanding_(4, g.DEFAULT_SEASON)), { tile: 22, via: 'shortcut' });
  assert.deepEqual(toPlain(g.resolveLanding_(17, g.DEFAULT_SEASON)), { tile: 7, via: 'setback' });
  assert.deepEqual(toPlain(g.resolveLanding_(8, g.DEFAULT_SEASON)), { tile: 8, via: null });
});
