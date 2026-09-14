'use strict';

// Shared scenario builders for both the test suites and the preview server,
// so a bug found by clicking around in the browser is reproducible as a
// test with the exact same starting state, and vice versa.
//
// Everything here goes through the real Repo.gs/Engine.gs/Use.gs functions
// on a harness's `.globals` — never by poking the fake sheet's arrays
// directly — so a seed doubles as exercise of those functions too.
//
// Deliberately avoids roll_/serverRoll/the 'double' item: their outcome
// depends on Math.random() (via randomInt_, Random.gs), which has no
// injectable seam the way the item gacha's pickRandom_ does. Using them
// here would make seedMidSeason() build a different board every run,
// which is exactly what a shared fixture must not do. engine.test.js
// covers roll_ separately, with Math.random monkey-patched for that test.

const PLAYER_NAMES = ['Ana', 'Bo', 'Casper', 'Dee', 'Emi'];

// Each midSeason player's initial roll-landing tile — chosen to avoid
// every shortcut foot/top, setback head/tail, and power tile in
// DEFAULT_SEASON (Config.gs), so the "landed on N" feed entry below never
// implies an unresolved shortcut/setback/power landing that never
// happened. The scripted item uses further down (WINDBLOWN, JUMP, PULL)
// deliberately move some players again after this, same as a real game
// day would — read a player's actual tile back via getPlayer_ rather than
// assuming it still matches this array.
const REST_TILES = [8, 26, 40, 58, 75];
const DAY_START_OFFSET = 6; // -> a uniform "+6 today" delta per player

function makeEmail(name) {
  return name.toLowerCase() + '@example.com';
}

/** Fresh, just-set-up board: sheets exist, nobody has enrolled yet. */
function seedEmpty(harness) {
  harness.globals.setup();
  return { harness, players: [] };
}

/** One player enrolled but not yet named — the onboarding gate
 *  (Names.gs's needsName_, RenderOnboarding.gs). */
function seedOnboarding(harness, now) {
  const g = harness.globals;
  g.setup();
  const email = makeEmail('Newcomer');
  const enrolled = g.findOrEnrollPlayer_(email, now);
  return { harness, players: [{ id: enrolled.id, name: '', email }] };
}

/**
 * Five named players spread across the board, mixed bags, two armed
 * landmines, and a real feed history built by actually calling
 * useItem_/insertAction_ for jump/pull/wind/thunder/die/mine — so the
 * generated feed text is exactly what those code paths produce, not a
 * hand-written approximation of it.
 */
function seedMidSeason(harness, now) {
  const g = harness.globals;
  g.setup();

  const players = PLAYER_NAMES.map((name) => {
    const email = makeEmail(name);
    const enrolled = g.findOrEnrollPlayer_(email, now);
    g.setPlayerNameAndInitials_(enrolled.id, name, g.initialsFor_(name));
    g.addDice_(enrolled.id, 1);
    g.insertAction_({ kind: 'reset', text: name + ' joined the climb and got a starter die.', now });
    return { id: enrolled.id, name, email };
  });

  players.forEach((p, i) => {
    const restTile = REST_TILES[i];
    g.setTileAtDayStart_(p.id, Math.max(0, restTile - DAY_START_OFFSET));
    g.updatePlayerTile_(p.id, restTile);
    const face = (i % 6) + 1;
    g.insertAction_({
      actorId: p.id, kind: 'roll', text: p.name + ' rolled a ' + face + ', landed on ' + restTile + '.',
      actorNote: 'Rolled a ' + face, now
    });
  });

  const byName = {};
  players.forEach((p) => { byName[p.name] = p; });

  // Mixed bags, then spend most of them for real through useItem_ so the
  // feed carries authentic text for every non-random usable item.
  g.addInventory_(byName.Ana.id, 'wind', 1);
  g.useItem_(byName.Ana.id, 'wind', {}, now);

  g.addInventory_(byName.Bo.id, 'jump', 1);
  g.useItem_(byName.Bo.id, 'jump', {}, now);

  // Runs after Ana's WINDBLOWN above, which already moved both Casper and
  // Emi — validatePullTarget_ (Use.gs) is checked against their tiles AT
  // THIS POINT, not against REST_TILES, and still holds (Emi stays ahead
  // of Casper either way).
  g.addInventory_(byName.Casper.id, 'pull', 1);
  g.useItem_(byName.Casper.id, 'pull', { targetId: byName.Emi.id }, now);

  g.addInventory_(byName.Dee.id, 'thunder', 1);
  g.useItem_(byName.Dee.id, 'thunder', {}, now);

  g.addInventory_(byName.Emi.id, 'die', 1);
  g.useItem_(byName.Emi.id, 'die', {}, now);

  // A shield, held in reserve (never used) — the passive item, and the one
  // Views.gs privacy note ("you find out someone had a Shield when it
  // stops your hit") depends on it never showing up anywhere but its
  // owner's own bag.
  g.addInventory_(byName.Ana.id, 'shield', g.POWERUP_.shieldCharges);

  // Two armed, untriggered landmines (Repo.gs's placeMine_ + Use.gs's
  // mineActionNotes_ — reused here, not reimplemented, so the feed text
  // matches useItem_'s 'mine' branch exactly, tile number excluded).
  function armMine(owner, tile) {
    g.placeMine_(owner.id, tile, now);
    const notes = g.mineActionNotes_(owner.name, tile);
    g.insertAction_({ actorId: owner.id, kind: 'use', text: notes.text, actorNote: notes.actorNote, now });
  }
  armMine(byName.Bo, 65);
  armMine(byName.Dee, 90);

  return { harness, players, byName };
}

/**
 * midSeason plus one player already on the finish tile — for the
 * PULL/WINDBLOWN finisher-exclusion rules (Use.gs's validatePullTarget_ /
 * windTargets_: you can't target, or need to spare, someone at tile 100).
 */
function seedEndgame(harness, now) {
  const seeded = seedMidSeason(harness, now);
  const g = harness.globals;
  const finisher = seeded.byName.Emi;
  g.updatePlayerTile_(finisher.id, g.BOARD_SIZE_);
  g.insertAction_({
    actorId: finisher.id, kind: 'roll', text: finisher.name + ' rolled a 6, landed on 100. Finished!',
    actorNote: 'Finished the climb', now
  });
  return seeded;
}

module.exports = { makeEmail, seedEmpty, seedOnboarding, seedMidSeason, seedEndgame };
