// The use-item write path. Does NOT take the script lock itself; callers
// must hold it (see withLock_ in Code.gs).
//
// Shield is never actively used: its effect (blocks the next incoming
// power-up aimed at you, then loses a charge) is passive, checked here
// whenever PULL, WINDBLOWN, THUNDER or a LANDMINE targets a player.
// USABLE_ITEMS_ is what the console's per-item controls are allowed to
// submit — shield and any retired item (stun, warp) are deliberately
// excluded. 'mine' joins this list once the Mines sheet exists (Repo.gs).

var USABLE_ITEMS_ = ['die', 'double', 'jump', 'pull', 'wind', 'thunder', 'mine'];

function consumeShieldIfPresent_(targetId) {
  if (getInventoryCount_(targetId, 'shield') > 0) {
    addInventory_(targetId, 'shield', -1);
    return true;
  }
  return false;
}

/**
 * PURE. PULL only ever targets a player strictly ahead of the actor, and
 * never one who has already finished (tile 100) — otherwise the season's
 * leader/winner is always the optimal target for whoever is losing hardest.
 */
function validatePullTarget_(actorTile, targetTile) {
  if (targetTile === BOARD_SIZE_) {
    throw EngineError_('BAD_TARGET', 'You cannot target a player who has already finished.');
  }
  if (!(targetTile > actorTile)) {
    throw EngineError_('BAD_TARGET', 'You can only PULL a target ahead of you.');
  }
}

/**
 * PURE. Where PULL lands its target: your own tile, or as close to it as
 * pullMaxDistance (POWERUP_, Config.gs) allows when that cap is set.
 */
function pullDestination_(actorTile, targetTile, maxDistance) {
  if (maxDistance == null) return actorTile;
  return Math.max(actorTile, targetTile - maxDistance);
}

/**
 * PURE. WINDBLOWN/THUNDER hit every opponent except the actor — never a
 * fresh, unnamed enrollment (buildBaseView_ hides those from the board for
 * the same reason: there's no real name to show in the feed).
 */
function opponentsOf_(players, actorId) {
  return players.filter(function (p) { return p.id !== actorId && !needsName_(p); });
}

/**
 * PURE. WINDBLOWN additionally spares anyone who has already finished (tile
 * 100) — without this, pushing the season's winner off the finish line is
 * the default outcome of every wind, not an edge case.
 */
function windTargets_(players, actorId) {
  return opponentsOf_(players, actorId).filter(function (p) { return p.tile !== BOARD_SIZE_; });
}

/**
 * PURE. LANDMINE may be armed on any tile strictly between the start (0)
 * and the finish (BOARD_SIZE_) — never on 0 (nobody stands there once
 * they've rolled) or on the finish tile itself.
 */
function mineTileValid_(tile) {
  return Number.isInteger(tile) && tile >= 1 && tile <= BOARD_SIZE_ - 1;
}

/**
 * PURE. The public text/actorNote for arming a mine. Deliberately never
 * mentions `tile` — actorNote is PUBLIC (surfaced in every standings row
 * via getLastSeenAll_, not just the feed), so a numbered tile here would
 * leak the trap's location to the whole board the moment the owner's own
 * row refreshes. `tile` is accepted only so Tests.gs can assert it never
 * appears in the output.
 */
function mineActionNotes_(ownerName, tile) {
  return {
    text: ownerName + ' armed a landmine.',
    actorNote: 'Armed a landmine'
  };
}

function useItem_(playerId, item, args, now) {
  args = args || {};
  ensureDailyReset_(now);

  // --- 1. validate ---------------------------------------------------------
  // Every check that can throw runs BEFORE the item is spent (the
  // addInventory_ decrement below). There is no transaction to roll back,
  // so an item that fails validation after being decremented is simply
  // gone — this was a real bug (an out-of-range WARP ate the item and
  // threw) and every new item this function grows makes it more likely to
  // recur, so the ordering is now structural, not incidental.
  if (USABLE_ITEMS_.indexOf(item) === -1) {
    throw EngineError_('NOT_USABLE', item + ' cannot be used directly.');
  }
  var actor = getPlayer_(playerId);
  if (!actor) throw EngineError_('UNKNOWN_PLAYER', 'Unknown player.');
  if (getInventoryCount_(playerId, item) <= 0) {
    throw EngineError_('NO_ITEM', 'You do not have a ' + item + ' to use.');
  }

  var target = null;

  if (item === 'double') {
    // DOUBLE DICE spends a real die via roll_ (below), on top of the item
    // itself — that budget must be checked now, before the item is
    // decremented, or a player with 0 dice loses the item for nothing (the
    // same bug class as the old WARP validate-after-decrement order).
    if (getDiceCount_(playerId) <= 0) {
      throw EngineError_('NO_DICE', 'No dice left today.');
    }
  } else if (item === 'pull') {
    target = args.targetId ? getPlayer_(args.targetId) : null;
    if (!target) throw EngineError_('BAD_TARGET', 'Choose who to target.');
    if (target.id === actor.id) throw EngineError_('BAD_TARGET', 'You cannot target yourself.');
    validatePullTarget_(actor.tile, target.tile);
  } else if (item === 'mine') {
    if (!mineTileValid_(args.tile)) {
      throw EngineError_('BAD_TARGET', 'A landmine must be armed on a tile between 1 and 99.');
    }
  }

  // --- 2. decrement ----------------------------------------------------------
  addInventory_(playerId, item, -1);

  // --- 3. apply + 4. insert action -------------------------------------------
  if (item === 'die') {
    addDice_(playerId, 1);
    insertAction_({
      actorId: playerId, kind: 'use', text: actor.name + ' used an EXTRA DIE.',
      actorNote: 'Spent an extra die', now: now
    });
    return { item: item, diceLeft: getInventoryCount_(playerId, 'die') };
  }

  if (item === 'jump') {
    var to = clampTile_(actor.tile + POWERUP_.jumpDistance);
    // A JUMP resolves nothing at its destination — no power tile, no mine —
    // same rule as the old WARP it replaces: only a roll landing does.
    updatePlayerTile_(playerId, to);
    insertAction_({
      actorId: playerId, kind: 'use',
      text: actor.name + ' used JUMP. Moved from ' + actor.tile + ' to ' + to + '.',
      actorNote: 'Jumped to ' + to, now: now
    });
    return { item: item, from: actor.tile, to: to };
  }

  if (item === 'double') {
    // Calls roll_ directly, never serverRoll — serverRoll wraps withLock_,
    // and its inner `finally { lock.releaseLock() }` would drop the lock
    // this call is already running under (see Code.gs's serverUseItem).
    var result = roll_(playerId, now, { multiplier: 2, label: 'DOUBLE DICE' });
    return { item: item, roll: result };
  }

  if (item === 'mine') {
    placeMine_(playerId, args.tile, now);
    var notes = mineActionNotes_(actor.name, args.tile);
    insertAction_({ actorId: playerId, kind: 'use', text: notes.text, actorNote: notes.actorNote, now: now });
    return { item: item, tile: args.tile };
  }

  if (item === 'pull') {
    var blocked = consumeShieldIfPresent_(target.id);
    if (blocked) {
      insertAction_({
        actorId: playerId, targetId: target.id, kind: 'use',
        text: actor.name + ' used PULL on ' + target.name + ' — blocked by a Shield.',
        actorNote: 'Pull on ' + target.name + ' blocked by a Shield',
        targetNote: "Blocked " + actor.name + "'s PULL with a Shield", now: now
      });
      return { item: item, blocked: true, target: target.name };
    }
    var dest = clampTile_(pullDestination_(actor.tile, target.tile, POWERUP_.pullMaxDistance));
    updatePlayerTile_(target.id, dest);
    insertAction_({
      actorId: playerId, targetId: target.id, kind: 'use',
      text: actor.name + ' used PULL on ' + target.name + '. ' + target.name + ' fell from ' + target.tile + ' to ' + dest + '.',
      actorNote: 'Pulled ' + target.name + ' back ' + (target.tile - dest),
      targetNote: 'Pulled back ' + (target.tile - dest) + ' by ' + actor.name, now: now
    });
    return { item: item, blocked: false, target: target.name, amount: target.tile - dest, to: dest };
  }

  if (item === 'wind') {
    var windHit = [], windBlocked = [], windTileMap = {};
    windTargets_(listPlayers_(), playerId).forEach(function (p) {
      if (consumeShieldIfPresent_(p.id)) { windBlocked.push(p.name); return; }
      windTileMap[p.id] = clampTile_(p.tile - POWERUP_.windPushback);
      windHit.push(p.name);
    });
    updatePlayerTilesBulk_(windTileMap);
    insertAction_({
      actorId: playerId, kind: 'use',
      text: actor.name + ' used WINDBLOWN.' +
        (windHit.length ? ' Pushed back: ' + joinNames_(windHit) + '.' : '') +
        (windBlocked.length ? ' Blocked by Shield: ' + joinNames_(windBlocked) + '.' : ''),
      actorNote: 'Used WINDBLOWN', now: now
    });
    return { item: item, hit: windHit, blocked: windBlocked };
  }

  // thunder
  var thunderHit = [], thunderBlocked = [];
  opponentsOf_(listPlayers_(), playerId).forEach(function (p) {
    if (consumeShieldIfPresent_(p.id)) { thunderBlocked.push(p.name); return; }
    addDice_(p.id, -POWERUP_.thunderDiceLoss);
    thunderHit.push(p.name);
  });
  insertAction_({
    actorId: playerId, kind: 'use',
    text: actor.name + ' used THUNDER.' +
      (thunderHit.length ? ' Lost a die: ' + joinNames_(thunderHit) + '.' : '') +
      (thunderBlocked.length ? ' Blocked by Shield: ' + joinNames_(thunderBlocked) + '.' : ''),
    actorNote: 'Used THUNDER', now: now
  });
  return { item: item, hit: thunderHit, blocked: thunderBlocked };
}
