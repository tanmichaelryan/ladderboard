// The roll write path. Does NOT take the script lock itself; callers must
// hold it (see withLock_ in Code.gs).
//
// Privacy note: on a power-up pickup, granted item names are returned to
// the caller (so the console can tell the roller what they got) but are
// deliberately never written into actions.text/actorNote/targetNote — the
// only fields getFeed_/getLastSeen_ expose. Same structural defense as the
// original: even a future bug in Views.gs can't leak an item name, because
// the name was never persisted anywhere Views.gs touches.

var ITEM_POOL_ = ['die', 'double', 'jump', 'pull', 'wind', 'thunder', 'mine', 'shield'];

/**
 * PURE. Performs `n` independent draws from `pool`, keeping every `m`-th
 * one — `kept.length === Math.floor(n / m)`. `pick` is forwarded to
 * pickRandom_ (Random.gs) so this is fully deterministic under test.
 * @returns {{drawn: string[], kept: string[]}}
 */
function drawItems_(pool, n, m, pick) {
  var drawn = [];
  for (var i = 0; i < n; i++) drawn.push(pickRandom_(pool, pick));
  var kept = [];
  for (var j = m - 1; j < drawn.length; j += m) kept.push(drawn[j]);
  return { drawn: drawn, kept: kept };
}

/**
 * The single path that adds a power-up to a player's bag — used by both the
 * gacha below and grantItemAdmin (Code.gs), so shield's "count is charges,
 * not stacks" rule can't be forgotten by one of the two call sites.
 */
function grantItem_(playerId, item) {
  var count = item === 'shield' ? POWERUP_.shieldCharges : 1;
  addInventory_(playerId, item, count);
}

function stackNote_(tile) {
  var n = countPlayersOnTile_(tile);
  if (n < 2) return '';
  var words = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  var word = words[n] || String(n);
  return ' ' + word + ' of you are on that tile now.';
}

/**
 * @param {number} playerId
 * @param {Date} now
 * @param {{multiplier?: number, label?: string}} [opts] `multiplier` and
 *   `label` exist only for DOUBLE DICE (Use.gs): it calls this directly
 *   (never serverRoll — see the warning on that call site) with
 *   `{multiplier: 2, label: 'DOUBLE DICE'}` so the doubled move is a single
 *   roll/ladder/snake/pickup Action row instead of a second `use` row that
 *   would double-count in the feed and collide with mergeLastSeen_'s
 *   same-timestamp tie-break (Repo.gs).
 */
function roll_(playerId, now, opts) {
  opts = opts || {};
  var multiplier = opts.multiplier || 1;
  var label = opts.label || null;

  ensureDailyReset_(now);

  var player = getPlayer_(playerId);
  if (!player) throw EngineError_('UNKNOWN_PLAYER', 'Unknown player.');
  if (getDiceCount_(playerId) <= 0) {
    throw EngineError_('NO_DICE', 'No dice left today.');
  }

  var face = randomInt_(1, 6);
  var moved = face * multiplier;
  addDice_(playerId, -1);

  var layout = DEFAULT_SEASON;
  var landedOn = clampTile_(player.tile + moved);
  var resolved_ = resolveLanding_(landedOn, layout);
  var resolved = resolved_.tile, via = resolved_.via;
  var isPower = via === null && layout.power.indexOf(landedOn) !== -1;

  var itemsGranted = [];
  if (isPower) {
    // Fires unconditionally on a power landing — a mine on the same tile
    // (checked next) does not cancel this: the landing was still a roll
    // onto a power tile.
    var draw = drawItems_(ITEM_POOL_, POWERUP_.rollsPerLanding, POWERUP_.rollsPerPowerup);
    itemsGranted = draw.kept;
    itemsGranted.forEach(function (item) { grantItem_(playerId, item); });
  }

  // Only a roll landing ever resolves a mine — PULL/JUMP/WINDBLOWN
  // displacement (Use.gs) is inert, so this is the one place mines trigger.
  // liveMinesAt_ excludes the roller's own mines, so stepping on your own
  // trap is a guaranteed no-op, never something to branch on here.
  var mines = liveMinesAt_(resolved, playerId);
  var mineTriggered = mines.length > 0;
  var mineBlocked = false;
  var final = resolved;
  if (mineTriggered) {
    mineBlocked = consumeShieldIfPresent_(playerId);
    consumeMines_(mines, now, playerId);
    if (!mineBlocked) final = clampTile_(resolved - POWERUP_.mineKnockback);
  }

  // Single Players write, using the truly final tile — placed BEFORE the
  // feed text is built: stackNote_ below counts occupants via
  // countPlayersOnTile_, and doing that before this write undercounted by
  // exactly the mover (fixed bug, see Repo.gs).
  updatePlayerTile_(playerId, final);

  var rollPhrase = label
    ? 'used ' + label + ', rolled a ' + face + ' (moved ' + moved + ')'
    : 'rolled a ' + face;

  var kind = 'roll';
  var actorNote = 'Rolled a ' + face;
  var feedText;

  if (via === 'shortcut') {
    kind = 'ladder';
    actorNote = 'Took the shortcut from ' + landedOn;
    feedText = player.name + ' ' + rollPhrase + ', landed on ' + landedOn + ', took the shortcut. Climbed to ' + resolved + '.';
  } else if (via === 'setback') {
    kind = 'snake';
    actorNote = 'Hit a setback on ' + landedOn;
    feedText = player.name + ' ' + rollPhrase + ', landed on ' + landedOn + ', hit a setback. Slid to ' + resolved + '.';
  } else if (isPower) {
    kind = 'pickup';
    actorNote = 'Hit a power-up tile';
    // Static regardless of itemsGranted.length (always >= 1 under a valid
    // POWERUP_ config — see validatePowerup_): no count or name is ever
    // shown here, matching the privacy note at the top of this file.
    feedText = player.name + ' ' + rollPhrase + ', landed on ' + landedOn + ' — a power-up tile. Something went into their bag.';
  } else if (!mineTriggered) {
    feedText = player.name + ' ' + rollPhrase + ', landed on ' + resolved + '.' + stackNote_(resolved);
  } else {
    // A mine on a plain tile is its own separate Action row below — this
    // row just states the mechanical landing, not a tile the player ends
    // up staying on, so no stack note here.
    feedText = player.name + ' ' + rollPhrase + ', landed on ' + resolved + '.';
  }

  insertAction_({ actorId: playerId, kind: kind, text: feedText, actorNote: actorNote, now: now });

  if (mineTriggered) {
    // Only now — after the trigger — may the tile appear in an Actions row
    // (unlike placement's mineActionNotes_ in Use.gs, which never mentions
    // it). One row per distinct owner, so each owner's own targetNote
    // fires; almost always exactly one.
    var ownerIds = mines.map(function (m) { return m.ownerId; })
      .filter(function (id, i, all) { return all.indexOf(id) === i; });
    var mineText = mineBlocked
      ? player.name + ' stepped on a landmine — blocked by a Shield.'
      : player.name + ' stepped on a landmine and was knocked back from ' + resolved + ' to ' + final + '.';
    var mineActorNote = mineBlocked
      ? 'Blocked a landmine with a Shield'
      : 'Stepped on a landmine, knocked back to ' + final;
    ownerIds.forEach(function (ownerId) {
      insertAction_({
        actorId: playerId, targetId: ownerId, kind: 'mine', text: mineText, actorNote: mineActorNote,
        targetNote: mineBlocked ? 'Your landmine on ' + resolved + ' was blocked by a Shield' : 'Your landmine caught ' + player.name,
        now: now
      });
    });
  }

  return {
    from: player.tile, value: face, moved: moved, landedOn: landedOn, to: final, via: via,
    isPower: isPower, itemsGranted: itemsGranted, mineTriggered: mineTriggered, mineBlocked: mineBlocked,
    diceLeft: getDiceCount_(playerId), finished: final === BOARD_SIZE_
  };
}
