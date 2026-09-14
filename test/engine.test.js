'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');
const { withFixedRandom, dieFaceValue, poolIndexValue } = require('./random-helpers');
const { enrollNamedPlayer, enrollReadyPlayer, toPlain } = require('./support');

const NOW = new Date('2026-09-20T09:00:00Z'); // day 6 of DEFAULT_SEASON (starts 2026-09-15)

function freshPlayer(g, email) {
  return enrollNamedPlayer(g, email, NOW);
}

// --- roll_ ------------------------------------------------------------

test('roll_ resolves a shortcut and never spends more than one die', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  // enrollReadyPlayer, not freshPlayer: roll_ itself opens with
  // ensureDailyReset_(now) (Roll.gs), so the FIRST roll_/useItem_ call in a
  // fresh harness would otherwise silently grant an extra day-1 die right
  // before the dice-count assertion below — see support.js's comment.
  const p = enrollReadyPlayer(g, 'a@example.com', NOW);

  const restore = withFixedRandom(g, [dieFaceValue(4)]); // p.tile(0) + 4 = tile 4, a shortcut foot -> 22
  const result = g.roll_(p.id, NOW);
  restore();

  assert.equal(result.landedOn, 4);
  assert.equal(result.via, 'shortcut');
  assert.equal(result.to, 22);
  assert.equal(g.getPlayer_(p.id).tile, 22);
  assert.equal(g.getDiceCount_(p.id), 0, 'exactly one die spent');
});

test('roll_ resolves a setback', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const p = freshPlayer(g, 'a@example.com');
  g.updatePlayerTile_(p.id, 11);

  const restore = withFixedRandom(g, [dieFaceValue(6)]); // 11 + 6 = 17, a setback head -> 7
  const result = g.roll_(p.id, NOW);
  restore();

  assert.equal(result.landedOn, 17);
  assert.equal(result.via, 'setback');
  assert.equal(result.to, 7);
});

test('roll_ onto a power tile grants exactly one item and never names it in the feed', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const p = freshPlayer(g, 'a@example.com');

  // tile 3 is a power tile in DEFAULT_SEASON. One value for the die face,
  // then POWERUP_.rollsPerLanding (3) gacha draws, all landing on 'die'
  // (index 0 of ITEM_POOL_) — floor(3/3) = 1 item kept.
  const restore = withFixedRandom(g, [
    dieFaceValue(3),
    poolIndexValue(g.ITEM_POOL_, 0), poolIndexValue(g.ITEM_POOL_, 0), poolIndexValue(g.ITEM_POOL_, 0)
  ]);
  const result = g.roll_(p.id, NOW);
  restore();

  assert.equal(result.isPower, true);
  assert.deepEqual(toPlain(result.itemsGranted), ['die']);
  assert.deepEqual(toPlain(g.getInventory_(p.id)), [{ item: 'die', count: 1 }]);

  const feed = g.getFeed_(10).rows;
  assert.ok(!feed[0].text.toLowerCase().includes('die'), 'pickup feed text must not name the granted item');
});

test('roll_ triggers a mine and knocks the roller back when unshielded', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const owner = freshPlayer(g, 'owner@example.com');
  const roller = freshPlayer(g, 'roller@example.com');
  g.placeMine_(owner.id, 8, NOW); // 8 is a plain tile — isolates the mine's own effect
  g.updatePlayerTile_(roller.id, 2);

  const restore = withFixedRandom(g, [dieFaceValue(6)]); // 2 + 6 = 8
  const result = g.roll_(roller.id, NOW);
  restore();

  assert.equal(result.landedOn, 8);
  assert.equal(result.mineTriggered, true);
  assert.equal(result.mineBlocked, false);
  assert.equal(result.to, 8 - g.POWERUP_.mineKnockback);
  assert.equal(g.getMinesForOwner_(owner.id).length, 0, 'the mine is consumed (soft-deleted)');
});

test('roll_ triggers a mine but a Shield blocks the knockback and is spent', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const owner = freshPlayer(g, 'owner@example.com');
  const roller = freshPlayer(g, 'roller@example.com');
  g.placeMine_(owner.id, 8, NOW);
  g.updatePlayerTile_(roller.id, 2);
  g.addInventory_(roller.id, 'shield', g.POWERUP_.shieldCharges);

  const restore = withFixedRandom(g, [dieFaceValue(6)]);
  const result = g.roll_(roller.id, NOW);
  restore();

  assert.equal(result.mineBlocked, true);
  assert.equal(result.to, 8, 'blocked knockback — stays on the landed tile');
  assert.equal(g.getInventoryCount_(roller.id, 'shield'), g.POWERUP_.shieldCharges - 1);
});

test('roll_ clamps at the finish tile and marks the player finished', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const p = freshPlayer(g, 'a@example.com');
  g.updatePlayerTile_(p.id, 98);

  const restore = withFixedRandom(g, [dieFaceValue(6)]); // 98 + 6 = 104 -> clamps to 100
  const result = g.roll_(p.id, NOW);
  restore();

  assert.equal(result.to, 100);
  assert.equal(result.finished, true);
});

test('roll_ throws EngineError_(NO_DICE) with zero dice, and does not touch the board', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const p = enrollReadyPlayer(g, 'a@example.com', NOW); // see the shortcut test above for why
  g.addDice_(p.id, -1); // back to 0

  assert.throws(() => g.roll_(p.id, NOW), (err) => g.isEngineError_(err) && err.code === 'NO_DICE');
  assert.equal(g.getPlayer_(p.id).tile, 0);
});

// --- useItem_ -----------------------------------------------------------

test("useItem_('die') grants a die and consumes the item", () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const p = enrollReadyPlayer(g, 'a@example.com', NOW); // see the shortcut test above for why
  g.addInventory_(p.id, 'die', 1);
  const before = g.getDiceCount_(p.id);

  g.useItem_(p.id, 'die', {}, NOW);

  assert.equal(g.getDiceCount_(p.id), before + 1);
  assert.equal(g.getInventoryCount_(p.id, 'die'), 0);
});

test("useItem_('jump') moves the actor forward and clamps at the finish", () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const p = freshPlayer(g, 'a@example.com');
  g.addInventory_(p.id, 'jump', 1);
  g.updatePlayerTile_(p.id, 97);

  g.useItem_(p.id, 'jump', {}, NOW);

  assert.equal(g.getPlayer_(p.id).tile, g.clampTile_(97 + g.POWERUP_.jumpDistance));
});

test("useItem_('double') spends a real die via roll_ directly and doubles the face", () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const p = enrollReadyPlayer(g, 'a@example.com', NOW); // 1 starter die; see the shortcut test above for why
  g.addInventory_(p.id, 'double', 1);

  // face 1 (doubled: tile 2) — deliberately NOT face 3 (doubled: tile 6),
  // which would land on a power tile and need gacha-draw values queued too.
  const restore = withFixedRandom(g, [dieFaceValue(1)]);
  const result = g.useItem_(p.id, 'double', {}, NOW);
  restore();

  assert.equal(result.roll.value, 1);
  assert.equal(result.roll.moved, 2);
  assert.equal(g.getInventoryCount_(p.id, 'double'), 0, 'the item itself is spent');
  assert.equal(g.getDiceCount_(p.id), 0, 'roll_ also spends the one real die it requires');
});

test("useItem_('double') fails without a real die, and the item is not spent " +
  '(validate-before-decrement — see Use.gs step 1 comment)', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const p = enrollReadyPlayer(g, 'a@example.com', NOW); // see the shortcut test above for why
  g.addDice_(p.id, -1); // 0 dice
  g.addInventory_(p.id, 'double', 1);

  assert.throws(() => g.useItem_(p.id, 'double', {}, NOW), (err) => g.isEngineError_(err) && err.code === 'NO_DICE');
  assert.equal(g.getInventoryCount_(p.id, 'double'), 1, 'item must survive a failed validation');
});

test("useItem_('pull') drags the target to the actor's tile by default (pullMaxDistance: null)", () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const actor = freshPlayer(g, 'actor@example.com');
  const target = freshPlayer(g, 'target@example.com');
  g.updatePlayerTile_(actor.id, 20);
  g.updatePlayerTile_(target.id, 90);
  g.addInventory_(actor.id, 'pull', 1);

  const result = g.useItem_(actor.id, 'pull', { targetId: target.id }, NOW);

  assert.equal(result.to, 20);
  assert.equal(g.getPlayer_(target.id).tile, 20);
});

test("useItem_('pull') respects pullMaxDistance when set", () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  g.POWERUP_.pullMaxDistance = 15;
  const actor = freshPlayer(g, 'actor@example.com');
  const target = freshPlayer(g, 'target@example.com');
  g.updatePlayerTile_(actor.id, 20);
  g.updatePlayerTile_(target.id, 90);
  g.addInventory_(actor.id, 'pull', 1);

  const result = g.useItem_(actor.id, 'pull', { targetId: target.id }, NOW);

  assert.equal(result.to, 75, 'capped: at most maxDistance behind the target\'s own tile');
});

test("useItem_('pull') is blocked by the target's Shield and consumes it, target stays put", () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const actor = freshPlayer(g, 'actor@example.com');
  const target = freshPlayer(g, 'target@example.com');
  g.updatePlayerTile_(actor.id, 20);
  g.updatePlayerTile_(target.id, 90);
  g.addInventory_(actor.id, 'pull', 1);
  g.addInventory_(target.id, 'shield', g.POWERUP_.shieldCharges);

  const result = g.useItem_(actor.id, 'pull', { targetId: target.id }, NOW);

  assert.equal(result.blocked, true);
  assert.equal(g.getPlayer_(target.id).tile, 90, 'blocked pull never moves the target');
  assert.equal(g.getInventoryCount_(target.id, 'shield'), g.POWERUP_.shieldCharges - 1);
});

test("useItem_('pull') rejects a target who has already finished or is not ahead", () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const actor = freshPlayer(g, 'actor@example.com');
  const finisher = freshPlayer(g, 'finisher@example.com');
  const behind = freshPlayer(g, 'behind@example.com');
  g.updatePlayerTile_(actor.id, 50);
  g.updatePlayerTile_(finisher.id, g.BOARD_SIZE_);
  g.updatePlayerTile_(behind.id, 10);
  g.addInventory_(actor.id, 'pull', 2);

  assert.throws(() => g.useItem_(actor.id, 'pull', { targetId: finisher.id }, NOW),
    (err) => g.isEngineError_(err) && err.code === 'BAD_TARGET');
  assert.throws(() => g.useItem_(actor.id, 'pull', { targetId: behind.id }, NOW),
    (err) => g.isEngineError_(err) && err.code === 'BAD_TARGET');
  assert.equal(g.getInventoryCount_(actor.id, 'pull'), 2, 'both rejections leave the item unspent');
});

test("useItem_('wind') pushes every opponent back except the actor, a finisher, or a Shield holder", () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const actor = freshPlayer(g, 'actor@example.com');
  const victim = freshPlayer(g, 'victim@example.com');
  const shielded = freshPlayer(g, 'shielded@example.com');
  const finisher = freshPlayer(g, 'finisher@example.com');
  g.updatePlayerTile_(actor.id, 50);
  g.updatePlayerTile_(victim.id, 40);
  g.updatePlayerTile_(shielded.id, 40);
  g.updatePlayerTile_(finisher.id, g.BOARD_SIZE_);
  g.addInventory_(actor.id, 'wind', 1);
  g.addInventory_(shielded.id, 'shield', g.POWERUP_.shieldCharges);

  const result = g.useItem_(actor.id, 'wind', {}, NOW);

  assert.equal(g.getPlayer_(actor.id).tile, 50, 'actor is never pushed by their own wind');
  assert.equal(g.getPlayer_(victim.id).tile, 40 - g.POWERUP_.windPushback);
  assert.equal(g.getPlayer_(shielded.id).tile, 40, 'shield blocks the push and is consumed instead');
  assert.equal(g.getInventoryCount_(shielded.id, 'shield'), g.POWERUP_.shieldCharges - 1);
  assert.equal(g.getPlayer_(finisher.id).tile, g.BOARD_SIZE_, 'a finisher is spared entirely');
  assert.deepEqual(toPlain(result.hit).sort(), ['victim']);
});

test("useItem_('thunder') takes a die from every opponent, unblocked can go negative (debt)", () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  // Only the first enrollment in a harness needs the "ready" variant —
  // ensureDailyReset_ is idempotent per game day, so it's already a no-op
  // by the time victim enrolls (see support.js's comment).
  const actor = enrollReadyPlayer(g, 'actor@example.com', NOW);
  const victim = enrollNamedPlayer(g, 'victim@example.com', NOW);
  g.addDice_(victim.id, -1); // victim now at 0 dice
  g.addInventory_(actor.id, 'thunder', 1);

  g.useItem_(actor.id, 'thunder', {}, NOW);

  assert.equal(g.getDiceCount_(victim.id), 0 - g.POWERUP_.thunderDiceLoss, 'no floor — can go into debt');
  assert.equal(g.getDiceCount_(actor.id), 1, 'the actor is never hit by their own thunder');
});

test("useItem_('mine') arms a live mine that never records its own tile number in the feed", () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const p = freshPlayer(g, 'a@example.com');
  g.addInventory_(p.id, 'mine', 1);

  g.useItem_(p.id, 'mine', { tile: 47 }, NOW);

  const mines = g.getMinesForOwner_(p.id);
  assert.equal(mines.length, 1);
  assert.equal(mines[0].tile, 47);
  const feed = g.getFeed_(1).rows;
  assert.ok(!feed[0].text.includes('47'));
  assert.ok(!feed[0].actor_note.includes('47'));
});

test('useItem_ rejects an item the player does not have, and an unusable (passive) item', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const p = freshPlayer(g, 'a@example.com');

  assert.throws(() => g.useItem_(p.id, 'jump', {}, NOW), (err) => g.isEngineError_(err) && err.code === 'NO_ITEM');

  g.addInventory_(p.id, 'shield', g.POWERUP_.shieldCharges);
  assert.throws(() => g.useItem_(p.id, 'shield', {}, NOW), (err) => g.isEngineError_(err) && err.code === 'NOT_USABLE');
});

// --- ensureDailyReset_ ----------------------------------------------------

test('ensureDailyReset_ is idempotent for the same game day', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const p = freshPlayer(g, 'a@example.com');
  g.addDice_(p.id, -1); // back to 0, so the grant is observable

  const first = g.ensureDailyReset_(NOW);
  assert.equal(first.justReset, true);
  assert.equal(g.getDiceCount_(p.id), 1);

  const second = g.ensureDailyReset_(NOW);
  assert.equal(second.justReset, false);
  assert.equal(g.getDiceCount_(p.id), 1, 'a second reset for the same day must not double-grant');
});

test('ensureDailyReset_ withholds a die from a stunned player and clears the stun', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const p = freshPlayer(g, 'a@example.com');
  g.addDice_(p.id, -1);
  const day = g.computeGameDay_(NOW);
  g.setStunnedForDay_(p.id, day);

  g.ensureDailyReset_(NOW);

  assert.equal(g.getDiceCount_(p.id), 0, 'stunned player gets no die this reset');
  assert.equal(g.getPlayer_(p.id).stunnedForDay, null, 'the stun clears once it has taken effect');
});

test('ensureDailyReset_ skips unnamed (unenrolled-by-nickname) players', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const unnamed = g.findOrEnrollPlayer_('fresh@example.com', NOW); // no addDice_ — mirrors real enrollment

  g.ensureDailyReset_(NOW);

  assert.equal(g.getDiceCount_(unnamed.id), 0, 'an unnamed player has no dice to bank');
});
