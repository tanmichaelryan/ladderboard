'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');
const { enrollNamedPlayer } = require('./support');
const { withFixedRandom, dieFaceValue, poolIndexValue } = require('./random-helpers');

// The three privacy invariants both READMEs call out by name: "nobody can
// see what anyone else is holding, or where their mines are," a pickup
// never names the item in the feed, and a mine's tile never appears in any
// PUBLIC text (actorNote/targetNote/feed text) until it actually triggers.

const NOW = new Date('2026-09-20T09:00:00Z');

/**
 * True if `keyName` appears anywhere in the object graph — used to check
 * "no mines array leaked outside `me`" structurally. A plain substring
 * search on the serialized JSON doesn't work for a mine's TILE NUMBER the
 * way it does for an item name: board.tiles always lists all 100 tile
 * numbers (that's public — the board itself is the same for everyone), so
 * a "mine on tile 66" test would find "66" in the public board regardless
 * of any real leak, a false positive. Item names have no such legitimate
 * public occurrence, so those are still checked by plain substring search.
 */
function containsKey(value, keyName, seen) {
  seen = seen || new Set();
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, keyName)) return true;
  return Object.values(value).some((v) => containsKey(v, keyName, seen));
}

test('buildBaseView_ never calls the private Inventory/Dice/Mines accessors ' +
  '(Views.gs\'s own stated boundary — buildBaseView_ must never touch them)', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const p = enrollNamedPlayer(g, 'a@example.com', NOW);
  g.addInventory_(p.id, 'shield', g.POWERUP_.shieldCharges);
  g.placeMine_(p.id, 30, NOW);

  const calls = { inventory: 0, dice: 0, mines: 0 };
  const real = { inventory: g.getInventory_, dice: g.getDiceCount_, mines: g.getMinesForOwner_ };
  g.getInventory_ = (...args) => { calls.inventory++; return real.inventory(...args); };
  g.getDiceCount_ = (...args) => { calls.dice++; return real.dice(...args); };
  g.getMinesForOwner_ = (...args) => { calls.mines++; return real.mines(...args); };

  g.buildBaseView_(NOW);

  assert.deepEqual(calls, { inventory: 0, dice: 0, mines: 0 });
});

test('buildPlayerView_ exposes the bag/dice/mines of only the signed-in player, never another\'s', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const me = enrollNamedPlayer(g, 'me@example.com', NOW);
  const other = enrollNamedPlayer(g, 'other@example.com', NOW);

  // A distinctive item + mine tile for "other" that must never reach
  // anyone's view but their own.
  g.addInventory_(other.id, 'thunder', 1);
  g.placeMine_(other.id, 66, NOW);
  g.addInventory_(me.id, 'jump', 1);
  g.placeMine_(me.id, 12, NOW);

  const view = g.buildPlayerView_(me.id, NOW);

  assert.equal(view.me.id, me.id);
  assert.ok(view.me.items.some((i) => i.item === 'jump'), "my own bag must still show my own item");
  assert.ok(view.me.mines.some((m) => m.tile === 12), 'my own armed mine must still show');

  // Nothing about `other`'s bag or mines anywhere else in the view. Item
  // names have no legitimate public occurrence, so a plain substring
  // search is a valid check; a mine's tile number does NOT work the same
  // way (see containsKey's comment) — checked structurally instead.
  const publicView = Object.assign({}, view, { me: undefined });
  assert.ok(!JSON.stringify(publicView).includes('thunder'), "another player's item name must not leak outside `me`");
  assert.ok(!containsKey(publicView, 'mines'), 'no `mines` field should exist anywhere outside `me`');
});

test('buildPlayerView_ for the OTHER player mirrors the same boundary in reverse', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const me = enrollNamedPlayer(g, 'me@example.com', NOW);
  const other = enrollNamedPlayer(g, 'other@example.com', NOW);
  g.addInventory_(me.id, 'thunder', 1);
  g.placeMine_(me.id, 66, NOW);

  const view = g.buildPlayerView_(other.id, NOW);
  const publicView = Object.assign({}, view, { me: undefined });
  assert.ok(!JSON.stringify(publicView).includes('thunder'));
  assert.ok(!containsKey(publicView, 'mines'));
});

test('a power-tile pickup never names the granted item in the feed, for any item in the pool', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const p = enrollNamedPlayer(g, 'a@example.com', NOW);

  g.ITEM_POOL_.forEach((item, index) => {
    g.addDice_(p.id, 1);
    g.updatePlayerTile_(p.id, 0);
    const restore = withFixedRandom(g, [
      dieFaceValue(3), // tile 3 is a power tile
      poolIndexValue(g.ITEM_POOL_, index), poolIndexValue(g.ITEM_POOL_, index), poolIndexValue(g.ITEM_POOL_, index)
    ]);
    const result = g.roll_(p.id, NOW);
    restore();
    assert.equal(result.isPower, true);

    const feed = g.getFeed_(1).rows;
    g.ITEM_POOL_.forEach((maybeNamed) => {
      assert.ok(!feed[0].text.toLowerCase().includes(maybeNamed),
        `pickup feed text must not name "${maybeNamed}" (granted: ${item})`);
    });
  });
});

test('mineActionNotes_ never mentions the tile it is called with, for any tile', () => {
  const { globals: g } = createHarness();
  for (const tile of [1, 47, 99]) {
    const notes = g.mineActionNotes_('Ana', tile);
    assert.ok(!notes.text.includes(String(tile)), 'text must not contain the tile number');
    assert.ok(!notes.actorNote.includes(String(tile)), 'actorNote is PUBLIC — must not contain the tile number');
  }
});

test('arming a mine writes no tile number into any public field, only the trigger does', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const owner = enrollNamedPlayer(g, 'owner@example.com', NOW);
  const roller = enrollNamedPlayer(g, 'roller@example.com', NOW);
  g.addInventory_(owner.id, 'mine', 1);

  g.useItem_(owner.id, 'mine', { tile: 30 }, NOW);
  let feed = g.getFeed_(5).rows;
  feed.forEach((row) => {
    assert.ok(!row.text.includes('30'));
    assert.ok(!(row.actor_note || '').includes('30'));
  });

  // Now trigger it — only THIS action may mention the tile (and only as
  // the roller's own landing spot, which was already public).
  g.updatePlayerTile_(roller.id, 28);
  const restore = withFixedRandom(g, [dieFaceValue(2)]); // 28 + 2 = 30
  g.roll_(roller.id, NOW);
  restore();

  feed = g.getFeed_(5).rows;
  assert.ok(feed.some((row) => row.kind === 'mine' && row.text.includes('30')));
});
