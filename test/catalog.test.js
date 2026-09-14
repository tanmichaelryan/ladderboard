'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');
const { toPlain } = require('./support');

// Coverage checks that keep the feed/bag from throwing or rendering blank —
// ported from Tests.gs's catalog-consistency groups. Theme.gs/Roll.gs/
// Use.gs/RenderConsole.gs each maintain one of these lists by hand (no
// import graph in Apps Script to derive one from another), so nothing
// enforces they stay in sync except tests like these.

test('every ACTION_KINDS_ has a KIND_META_ entry', () => {
  const { globals: g } = createHarness();
  g.ACTION_KINDS_.forEach((kind) => {
    assert.ok(g.KIND_META_[kind], `missing KIND_META_ entry for kind "${kind}"`);
  });
});

test('ITEM_POOL_/USABLE_ITEMS_/ITEM_META_ agree with each other', () => {
  const { globals: g } = createHarness();
  g.ITEM_POOL_.forEach((item) => {
    const meta = g.ITEM_META_[item];
    assert.ok(meta && meta.label && meta.fg && meta.bg && meta.desc, `ITEM_META_ missing/incomplete entry for "${item}"`);
  });
  g.USABLE_ITEMS_.forEach((item) => {
    assert.ok(g.ITEM_POOL_.includes(item), `"${item}" is usable but not in ITEM_POOL_`);
  });
  const passive = g.ITEM_POOL_.filter((item) => !g.USABLE_ITEMS_.includes(item));
  assert.deepEqual(toPlain(passive), ['shield'], 'expected exactly one passive pool item (shield)');
});

test('every pool item has an ITEM_CONTROLS_ entry (bagRow_ falls back to no button otherwise)', () => {
  const { globals: g } = createHarness();
  g.ITEM_POOL_.forEach((item) => {
    assert.equal(typeof g.ITEM_CONTROLS_[item], 'function', `missing ITEM_CONTROLS_ entry for "${item}"`);
  });
});

test('retired items (stun, warp) stay labelled, not usable, not in the pool', () => {
  const { globals: g } = createHarness();
  for (const retired of ['stun', 'warp']) {
    assert.ok(g.ITEM_META_[retired], `retired item "${retired}" should still have a label`);
    assert.ok(!g.ITEM_POOL_.includes(retired));
    assert.ok(!g.USABLE_ITEMS_.includes(retired));
  }
});

test('drawItems_ keeps floor(n/m) items, all drawn from the pool', () => {
  const { globals: g } = createHarness();
  const pool = ['a', 'b', 'c'];
  const firstOnly = (arr) => arr[0];

  const r1 = g.drawItems_(pool, 3, 3, firstOnly);
  assert.equal(r1.drawn.length, 3);
  assert.equal(r1.kept.length, 1);
  assert.equal(r1.kept[0], 'a');

  const r2 = g.drawItems_(pool, 7, 3, firstOnly);
  assert.equal(r2.kept.length, 2);

  const r3 = g.drawItems_(pool, 2, 3, firstOnly);
  assert.equal(r3.kept.length, 0);
});
