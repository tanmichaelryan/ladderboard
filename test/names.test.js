'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');

// Names.gs — display-name validation. The uniqueness check needs a live
// Players sheet (nameTaken_ reads listPlayers_()), which the harness
// provides for free, so — unlike the old editor-only Tests.gs — this suite
// no longer needs a "skip if not set up" branch.

test('needsName_ / normalizeDisplayName_ on blank-ish input', () => {
  const { globals: g } = createHarness();
  assert.equal(g.needsName_({ name: '' }), true);
  assert.equal(g.needsName_({ name: '   ' }), true);
  assert.equal(g.needsName_(null), true);
  assert.equal(g.needsName_({ name: 'Rocket' }), false);
  assert.equal(g.normalizeDisplayName_('  jane   doe '), 'jane doe');
});

test('initialsFor_ never returns ?? for a real name', () => {
  const { globals: g } = createHarness();
  for (const n of ['Rocket', 'Ana Lu', 'x!']) {
    assert.notEqual(g.initialsFor_(n), '??');
  }
});

test('validateDisplayName_ accepts reasonable names', () => {
  const { globals: g } = createHarness();
  g.setup();
  assert.equal(g.validateDisplayName_('Zz', -1), 'Zz');
  assert.equal(g.validateDisplayName_('  Ana-Lu  ', -1), 'Ana-Lu');
});

test('validateDisplayName_ rejects too short/too long', () => {
  const { globals: g } = createHarness();
  g.setup();
  assert.throws(() => g.validateDisplayName_('', -1));
  assert.throws(() => g.validateDisplayName_('a', -1));
  assert.throws(() => g.validateDisplayName_(new Array(30).join('x'), -1));
});

test('validateDisplayName_ rejects email/url/all-digit/reserved', () => {
  const { globals: g } = createHarness();
  g.setup();
  for (const bad of ['jane@corp.com', 'www.x.com', 'http://x.com', '12345', 'admin', 'System']) {
    // Predicate, not the host `Error` constructor: validateDisplayName_'s
    // throw is built inside the harness's own vm realm (EngineError_ calls
    // `new Error(...)` there), so `instanceof` against this file's Error
    // never matches — isEngineError_ is a plain property check instead,
    // realm-agnostic on purpose (see Errors.gs).
    assert.throws(() => g.validateDisplayName_(bad, -1), (err) => g.isEngineError_(err), `expected throw for "${bad}"`);
  }
});

test('validateDisplayName_ enforces case-insensitive uniqueness across players', () => {
  const h = createHarness({ now: new Date('2026-09-20T00:00:00Z') });
  const g = h.globals;
  g.setup();
  const p1 = g.findOrEnrollPlayer_('one@example.com', h.now());
  g.setPlayerNameAndInitials_(p1.id, 'Rocket', g.initialsFor_('Rocket'));

  const p2 = g.findOrEnrollPlayer_('two@example.com', h.now());
  assert.throws(() => g.validateDisplayName_('rocket', p2.id), /already goes by/);
  // A player renaming themselves back to their own current name must not
  // collide with themselves — exceptPlayerId excludes their own row.
  assert.doesNotThrow(() => g.validateDisplayName_('Rocket', p1.id));
});

test('validateDisplayName_ rejects an all-digit name — a real sheet would coerce it to a ' +
  'number on read, and computeStandings_ calls name.localeCompare(...) on it', () => {
  const { globals: g, sheets } = createHarness();
  g.setup();
  assert.throws(() => g.validateDisplayName_('12345', -1), /all digits/);

  // Confirm the fake sheet actually reproduces the coercion this rule
  // exists to guard against — otherwise this test would pass for the
  // wrong reason. Bypass validation entirely (the way a legacy row might
  // have gotten in before this rule existed) and read it back raw.
  const player = g.createPlayer_({ email: 'legacy@example.com', name: '12345', initials: '12', colorIndex: 0, now: new Date() });
  const table = sheets.getSheetByName('Players');
  const nameCol = g.SHEET_SCHEMA_.Players.indexOf('name');
  const raw = table.getRange(player._row, nameCol + 1, 1, 1).getValues()[0][0];
  assert.equal(typeof raw, 'number', 'an all-digit cell should read back as a number, matching real Sheets');
});
