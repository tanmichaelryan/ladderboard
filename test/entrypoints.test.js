'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');
const { enrollNamedPlayer, enrollReadyPlayer } = require('./support');
const { withFixedRandom, dieFaceValue } = require('./random-helpers');
const { isPublicName, invokePublic } = require('./rpc');

const NOW = new Date('2026-09-20T09:00:00Z');

// --- doGet / handleHtmlApp_ ------------------------------------------------

test('doGet before setup() tells an admin to run setup()', () => {
  const h = createHarness({ now: NOW });
  const out = h.globals.doGet();
  assert.match(out.getContent(), /Not set up yet/);
});

test('doGet refuses a caller outside TEAM_DOMAIN', () => {
  const h = createHarness({ now: NOW, activeUser: 'someone@other-company.com' });
  const g = h.globals;
  g.setup();
  const out = g.doGet();
  assert.match(out.getContent(), /only for example\.com/);
});

test('doGet auto-enrolls a first-time visitor and shows the onboarding gate', () => {
  const h = createHarness({ now: NOW, activeUser: 'first-timer@example.com' });
  const g = h.globals;
  g.setup();
  const out = g.doGet();
  assert.match(out.getContent(), /onboarding-name-input/);
  assert.ok(g.getPlayerByEmail_('first-timer@example.com'), 'the visit itself should have enrolled them');
});

test('doGet shows the full console for an already-named player', () => {
  const h = createHarness({ now: NOW, activeUser: 'named@example.com' });
  const g = h.globals;
  g.setup();
  enrollNamedPlayer(g, 'named@example.com', NOW);
  const out = g.doGet();
  assert.match(out.getContent(), /id="rename-input"/);
  assert.equal(out.getTitle(), g.DEFAULT_SEASON.name + ' — Ladderboard');
});

// --- console entry points -------------------------------------------------

test('serverRoll returns a narrowed projection, without itemsGranted (privacy — see Roll.gs header)', () => {
  const h = createHarness({ now: NOW, activeUser: 'a@example.com' });
  const g = h.globals;
  g.setup();
  enrollNamedPlayer(g, 'a@example.com', NOW);

  const restore = withFixedRandom(g, [dieFaceValue(4)]);
  const result = g.serverRoll();
  restore();

  assert.equal(result.value, 4);
  assert.ok(!('itemsGranted' in result), 'itemsGranted must never reach the client');
  assert.deepEqual(Object.keys(result).sort(), [
    'diceLeft', 'finished', 'from', 'isPower', 'landedOn', 'mineBlocked',
    'mineTriggered', 'moved', 'playerId', 'to', 'value', 'via'
  ].sort());
});

test('serverRoll silently returns null on an expected engine failure (no dice)', () => {
  const h = createHarness({ now: NOW, activeUser: 'a@example.com' });
  const g = h.globals;
  g.setup();
  // enrollReadyPlayer: serverRoll -> roll_ opens with ensureDailyReset_,
  // which would otherwise silently refill this to 1 on the very call being
  // tested — see support.js's comment.
  const p = enrollReadyPlayer(g, 'a@example.com', NOW);
  g.addDice_(p.id, -1);

  assert.equal(g.serverRoll(), null);
});

test('serverUseItem lets an EngineError propagate (not swallowed, unlike serverRoll)', () => {
  const h = createHarness({ now: NOW, activeUser: 'a@example.com' });
  const g = h.globals;
  g.setup();
  enrollNamedPlayer(g, 'a@example.com', NOW);

  assert.throws(() => g.serverUseItem('jump', {}), (err) => g.isEngineError_(err) && err.code === 'NO_ITEM');
});

test("serverUseItem('double') does not trip the lock-reentrancy guard — " +
  "confirms Use.gs's rule (call roll_ directly, never serverRoll) actually holds", () => {
  const h = createHarness({ now: NOW, activeUser: 'a@example.com' });
  const g = h.globals;
  g.setup();
  const p = enrollNamedPlayer(g, 'a@example.com', NOW);
  g.addInventory_(p.id, 'double', 1);

  // face 1 (doubled: tile 2), not face 3 (doubled: tile 6) — 6 is a power
  // tile, which would need gacha-draw values queued too.
  const restore = withFixedRandom(g, [dieFaceValue(1)]);
  assert.doesNotThrow(() => g.serverUseItem('double', {}));
  restore();
});

test('serverSetName grants a starter die only on the first (unnamed -> named) transition', () => {
  const h = createHarness({ now: NOW, activeUser: 'a@example.com' });
  const g = h.globals;
  g.setup();
  const enrolled = g.findOrEnrollPlayer_('a@example.com', NOW); // unnamed, 0 dice

  g.serverSetName('Rocket');
  assert.equal(g.getPlayer_(enrolled.id).name, 'Rocket');
  assert.equal(g.getDiceCount_(enrolled.id), 1, 'first naming grants a starter die');

  g.serverSetName('Rocketeer'); // a later rename
  assert.equal(g.getDiceCount_(enrolled.id), 1, 'a rename after the first is not a fresh starter bonus');
});

test('serverSetName rejects an unsuitable name and never partially applies it', () => {
  const h = createHarness({ now: NOW, activeUser: 'a@example.com' });
  const g = h.globals;
  g.setup();
  const enrolled = g.findOrEnrollPlayer_('a@example.com', NOW);

  assert.throws(() => g.serverSetName('a@evil.com'), (err) => g.isEngineError_(err) && err.code === 'BAD_NAME');
  assert.equal(g.getPlayer_(enrolled.id).name, '', 'a rejected name must not be partially written');
});

test('serverRefreshView returns fragments for every region refreshBoard_ splices back in', () => {
  const h = createHarness({ now: NOW, activeUser: 'a@example.com' });
  const g = h.globals;
  g.setup();
  enrollNamedPlayer(g, 'a@example.com', NOW);

  const data = g.serverRefreshView();
  assert.deepEqual(Object.keys(data).sort(),
    ['board', 'console', 'feed', 'header', 'standings', 'updatedAtIso', 'updatedAtText'].sort());
  assert.equal(typeof data.header, 'string');
});

// --- the LockService safety net --------------------------------------------

test('the fake script lock throws on re-entrant acquisition', () => {
  const { globals: g } = createHarness();
  assert.throws(
    () => g.withLock_(() => g.withLock_(() => {})),
    /re-entrant/
  );
});

// --- google.script.run visibility: the trailing-"_" privacy rule ----------
// developers.google.com/apps-script/guides/html/communication: a server
// function whose name ends in "_" is private and google.script.run cannot
// call it — the real platform fails this SILENTLY (no error on either
// side). invokePublic (rpc.js) reproduces the rule but throws instead, on
// purpose, so a mistake here is visible locally instead of only in prod.

test('isPublicName rejects any trailing-underscore name', () => {
  assert.equal(isPublicName('serverRoll'), true);
  assert.equal(isPublicName('serverRefreshView'), true);
  assert.equal(isPublicName('roll_'), false);
});

test('google.script.run cannot reach a private helper like roll_ — it ends in "_"', () => {
  const h = createHarness({ now: NOW, activeUser: 'a@example.com' });
  const g = h.globals;
  g.setup();
  enrollNamedPlayer(g, 'a@example.com', NOW);

  assert.throws(() => invokePublic(g, 'roll_', []), /private/);
});

test('google.script.run can reach every real console entry point', () => {
  const h = createHarness({ now: NOW, activeUser: 'a@example.com' });
  const g = h.globals;
  g.setup();
  enrollNamedPlayer(g, 'a@example.com', NOW);

  assert.doesNotThrow(() => invokePublic(g, 'serverSetName', ['Rocket']));
  const restore = withFixedRandom(g, [dieFaceValue(2)]);
  assert.doesNotThrow(() => invokePublic(g, 'serverRoll', []));
  restore();
  assert.doesNotThrow(() => invokePublic(g, 'serverRefreshView', []));
});
