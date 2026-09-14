'use strict';

/**
 * Enrolls + names a player via the real engine functions, with one starter
 * die — the same shape findOrEnrollPlayer_ (Engine.gs) + serverSetName's
 * "wasUnnamed" bonus (Code.gs) produce for a real new player. Shared by
 * every suite that just needs "a player who can roll," so each one isn't
 * reinventing this setup slightly differently.
 */
function enrollNamedPlayer(g, email, now) {
  const enrolled = g.findOrEnrollPlayer_(email, now);
  const name = email.split('@')[0];
  g.setPlayerNameAndInitials_(enrolled.id, name, g.initialsFor_(name));
  g.addDice_(enrolled.id, 1);
  return g.getPlayer_(enrolled.id);
}

/**
 * Same as enrollNamedPlayer, but first fast-forwards through the day's
 * lazy reset (ensureDailyReset_) — exactly what a real page load already
 * does before anyone can roll (Code.gs's handleHtmlApp_ always resets
 * before enrolling). Skip this and the FIRST roll_/useItem_ call in a test
 * triggers that same reset internally (both open with
 * `ensureDailyReset_(now);`), silently granting the player an extra,
 * unaccounted-for die right when a test is trying to pin down an exact
 * count. Use this instead of enrollNamedPlayer in any test that asserts
 * dice counts around a roll_/useItem_ call — but NOT in a test that is
 * itself exercising ensureDailyReset_'s own behavior (idempotency, the
 * stun path, ...), which needs to control that call precisely.
 */
function enrollReadyPlayer(g, email, now) {
  g.ensureDailyReset_(now);
  return enrollNamedPlayer(g, email, now);
}

/**
 * Round-trips a value through JSON so it becomes a plain, host-realm
 * structure. Needed before `assert.deepEqual`-ing an object/array a vm
 * function returned against a literal written in a test file: they're
 * built in different vm realms (harness.js's createHarness() runs the
 * whole apps-script/ bundle in its own vm.createContext), so even a
 * structurally-identical object/array fails strict deepEqual — it checks
 * [[Prototype]] identity too, and Object.prototype/Array.prototype differ
 * across realms. (Primitives, and values already compared via `.equal`,
 * are never affected — only whole-object/array deepEqual is.)
 */
function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { enrollNamedPlayer, enrollReadyPlayer, toPlain };
