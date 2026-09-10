// Domain-specific data accessors, built on Sheets.gs's generic table helpers.
// Nothing here decides game rules — Roll.gs/Use.gs/Reset.gs compose these.
//
// PRIVATE table access lives in the functions whose names say Inventory or
// Dice. Views.gs's buildBaseView_ must never call them — see the note in
// Sheets.gs.

var DAY_MS_ = 24 * 60 * 60 * 1000;

function normalizePlayer_(row) {
  return {
    id: row.id, email: row.email, name: row.name, initials: row.initials,
    colorIndex: row.colorIndex, tile: row.tile, tileAtDayStart: row.tileAtDayStart,
    stunnedForDay: nullIfBlank_(row.stunnedForDay), createdAt: row.createdAt, _row: row._row
  };
}

/** Game-day number for `now`, clamped to [1, totalDays]. Pure — SEASON_STARTED_AT_
 *  and DEFAULT_SEASON.totalDays are source constants (see Config.gs), not sheet state. */
function computeGameDay_(now) {
  var elapsedDays = Math.floor((now.getTime() - new Date(SEASON_STARTED_AT_).getTime()) / DAY_MS_);
  return Math.min(DEFAULT_SEASON.totalDays, Math.max(1, elapsedDays + 1));
}

function getPlayer_(id) {
  var t = readTable_('Players');
  var row = t.rows.find(function (r) { return r.id === id; });
  return row ? normalizePlayer_(row) : null;
}

function getPlayerByEmail_(email) {
  var needle = String(email).toLowerCase();
  var t = readTable_('Players');
  var row = t.rows.find(function (r) { return String(r.email).toLowerCase() === needle; });
  return row ? normalizePlayer_(row) : null;
}

function listPlayers_() {
  var t = readTable_('Players');
  return t.rows.map(normalizePlayer_).sort(function (a, b) { return a.id - b.id; });
}

function playerCount_() {
  return readTable_('Players').rows.length;
}

/** Creates the player row + a zeroed dice row on first visit. */
function createPlayer_(args) {
  var t = readTable_('Players');
  var maxId = t.rows.reduce(function (m, r) { return Math.max(m, r.id || 0); }, 0);
  var id = maxId + 1;
  appendRow_('Players', {
    id: id, email: args.email, name: args.name, initials: args.initials,
    colorIndex: args.colorIndex, tile: 0, tileAtDayStart: 0, stunnedForDay: '',
    createdAt: args.now.toISOString()
  });
  appendRow_('Dice', { playerId: id, count: 0 });
  return getPlayer_(id);
}

function countPlayersOnTile_(tile) {
  return readTable_('Players').rows.filter(function (r) { return r.tile === tile; }).length;
}

/**
 * PRIVATE. Shared by the Dice/Inventories accessors below — both sheets are
 * "count per key(s)" with the same read-or-create-then-clamp-add shape.
 * `match` finds the row for this key; `create` is the row to append if none
 * exists yet. `floor` defaults to 0 (Inventories can never go negative);
 * pass `null` to allow a negative count.
 */
function addCount_(sheetName, match, create, delta, floor) {
  if (floor === undefined) floor = 0;
  var t = readTable_(sheetName);
  var row = t.rows.find(match);
  if (!row) {
    appendRow_(sheetName, Object.assign({ count: 0 }, create));
    t = readTable_(sheetName);
    row = t.rows.find(match);
  }
  var next = row.count + delta;
  if (floor !== null) next = Math.max(floor, next);
  updateRow_(t.sheet, t.headers, row._row, { count: next });
}

function getDiceCount_(playerId) {
  var t = readTable_('Dice');
  var row = t.rows.find(function (r) { return r.playerId === playerId; });
  return row ? row.count : 0;
}

/**
 * No floor: THUNDER can drive a player's count negative (a debt they must
 * roll off before their next real roll — see Use.gs), so this must not
 * clamp at 0 the way Inventories does. Every other caller only ever passes
 * a positive delta, or a negative one already guarded by a NO_DICE check
 * upstream (roll_ in Roll.gs), so this is safe in practice.
 */
function addDice_(playerId, delta) {
  addCount_('Dice',
    function (r) { return r.playerId === playerId; },
    { playerId: playerId }, delta, null);
}

/** PRIVATE table access. */
function getInventoryCount_(playerId, item) {
  var t = readTable_('Inventories');
  var row = t.rows.find(function (r) { return r.playerId === playerId && r.item === item; });
  return row ? row.count : 0;
}

/** PRIVATE table access. */
function getInventory_(playerId) {
  return readTable_('Inventories').rows
    .filter(function (r) { return r.playerId === playerId && r.count > 0; })
    .map(function (r) { return { item: r.item, count: r.count }; });
}

/** PRIVATE table access. */
function addInventory_(playerId, item, delta) {
  addCount_('Inventories',
    function (r) { return r.playerId === playerId && r.item === item; },
    { playerId: playerId, item: item }, delta);
}

/**
 * PRIVATE. Live (untriggered) mines belonging to `ownerId` — surfaced only
 * in that owner's own console drawer (buildPlayerView_ in Views.gs), never
 * in buildBaseView_.
 */
function getMinesForOwner_(ownerId) {
  return readTable_('Mines').rows
    .filter(function (r) { return r.ownerId === ownerId && !r.triggeredAt; })
    .map(function (r) { return { id: r.id, tile: r.tile, placedAt: r.placedAt }; });
}

/**
 * PRIVATE. Arms a new mine. Stacking is allowed — even from the same owner,
 * even on a tile that already holds one — refusing a second mine on an
 * occupied tile would leak an existing mine's location through the
 * rejection itself.
 */
function placeMine_(ownerId, tile, now) {
  var t = readTable_('Mines');
  var maxId = t.rows.reduce(function (m, r) { return Math.max(m, r.id || 0); }, 0);
  appendRow_('Mines', {
    id: maxId + 1, ownerId: ownerId, tile: tile, placedAt: now.toISOString(),
    triggeredAt: '', triggeredBy: ''
  });
}

/**
 * PRIVATE. Live mines sitting on `tile`, excluding `excludeOwnerId`'s own —
 * you can never trigger a mine you placed yourself (Roll.gs passes the
 * roller's own id here, so their mine is simply never "live" against them).
 */
function liveMinesAt_(tile, excludeOwnerId) {
  return readTable_('Mines').rows.filter(function (r) {
    return r.tile === tile && !r.triggeredAt && r.ownerId !== excludeOwnerId;
  });
}

/**
 * PRIVATE. Soft-deletes the given mines (marks them triggered) instead of
 * sheet.deleteRow — see the Mines entry in SHEET_SCHEMA_ (Sheets.gs) for
 * why. Re-reads the table itself rather than trusting the `_row` on the
 * mine objects passed in, since those may have been read before other
 * writes landed in this same roll_ call.
 */
function consumeMines_(mines, now, triggeredBy) {
  var t = readTable_('Mines');
  var byId = {};
  t.rows.forEach(function (r) { byId[r.id] = r; });
  mines.forEach(function (m) {
    var row = byId[m.id];
    if (!row) return;
    updateRow_(t.sheet, t.headers, row._row, { triggeredAt: now.toISOString(), triggeredBy: triggeredBy });
  });
}

function updatePlayerTile_(playerId, tile) {
  var t = readTable_('Players');
  var row = t.rows.find(function (r) { return r.id === playerId; });
  updateRow_(t.sheet, t.headers, row._row, { tile: tile });
}

/**
 * Bulk version of updatePlayerTile_ for AoE effects (WINDBLOWN) that move
 * many players in one operation — one sheet read + one column write instead
 * of one round trip per player (see setColumnValues_ in Sheets.gs).
 * @param {Object<number, number>} tileByPlayerId
 */
function updatePlayerTilesBulk_(tileByPlayerId) {
  var t = readTable_('Players');
  var rowNumToValue = {};
  t.rows.forEach(function (r) {
    if (Object.prototype.hasOwnProperty.call(tileByPlayerId, r.id)) {
      rowNumToValue[r._row] = tileByPlayerId[r.id];
    }
  });
  setColumnValues_(t.sheet, t.headers, 'tile', rowNumToValue);
}

function setTileAtDayStart_(playerId, tile) {
  var t = readTable_('Players');
  var row = t.rows.find(function (r) { return r.id === playerId; });
  updateRow_(t.sheet, t.headers, row._row, { tileAtDayStart: tile });
}

function setStunnedForDay_(playerId, day) {
  var t = readTable_('Players');
  var row = t.rows.find(function (r) { return r.id === playerId; });
  updateRow_(t.sheet, t.headers, row._row, { stunnedForDay: day });
}

function clearStunned_(playerId) {
  var t = readTable_('Players');
  var row = t.rows.find(function (r) { return r.id === playerId; });
  updateRow_(t.sheet, t.headers, row._row, { stunnedForDay: '' });
}

function setPlayerNameAndInitials_(playerId, name, initials) {
  var t = readTable_('Players');
  var row = t.rows.find(function (r) { return r.id === playerId; });
  updateRow_(t.sheet, t.headers, row._row, { name: name, initials: initials });
}

function insertAction_(args) {
  var t = readTable_('Actions');
  var maxId = t.rows.reduce(function (m, r) { return Math.max(m, r.id || 0); }, 0);
  appendRow_('Actions', {
    id: maxId + 1, at: args.now.toISOString(),
    actorId: args.actorId != null ? args.actorId : '',
    targetId: args.targetId != null ? args.targetId : '',
    kind: args.kind, text: args.text,
    actorNote: args.actorNote != null ? args.actorNote : '',
    targetNote: args.targetNote != null ? args.targetNote : ''
  });
}

/**
 * Most recent "last seen" fragment for a player, as either actor or target,
 * joined with when it happened. Null if the player has never appeared.
 * Tie-broken by row id (higher wins) when two rows share a timestamp — e.g.
 * a roll that immediately triggers a landmine writes both in the same
 * instant. Must agree with mergeLastSeen_'s tie-break below (Tests.gs's
 * equivalence group checks this).
 */
function getLastSeen_(playerId) {
  var rows = readTable_('Actions').rows;
  var candidates = [];
  rows.forEach(function (r) {
    if (r.actorId === playerId && r.actorNote) candidates.push({ note: r.actorNote, at: r.at, id: r.id });
    if (r.targetId === playerId && r.targetNote) candidates.push({ note: r.targetNote, at: r.at, id: r.id });
  });
  if (candidates.length === 0) return null;
  candidates.sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id; });
  return candidates[0];
}

/**
 * PURE. Reduces raw Actions rows into "most recent note per player", tie-
 * broken by row id (higher id wins) when two rows share a timestamp — see
 * getLastSeen_'s comment above. Separated from getLastSeenAll_ so Tests.gs
 * can exercise the tie-break with a literal fixture, no Sheet required.
 * @param {Array<{actorId:number, actorNote:string, targetId:number, targetNote:string, at:string, id:number}>} rows
 * @returns {Object<number, {note:string, at:string}>} keyed by playerId
 */
function mergeLastSeen_(rows) {
  var byPlayer = {};
  function consider(playerId, note, at, id) {
    if (!playerId || !note) return;
    var current = byPlayer[playerId];
    if (!current || at > current.at || (at === current.at && id > current.id)) {
      byPlayer[playerId] = { note: note, at: at, id: id };
    }
  }
  rows.forEach(function (r) {
    consider(r.actorId, r.actorNote, r.at, r.id);
    consider(r.targetId, r.targetNote, r.at, r.id);
  });
  var result = {};
  Object.keys(byPlayer).forEach(function (playerId) {
    result[playerId] = { note: byPlayer[playerId].note, at: byPlayer[playerId].at };
  });
  return result;
}

/**
 * Like getLastSeen_, but for every player in one Actions read instead of
 * one full-sheet read per player. buildBaseView_ needs a "last seen" per
 * standings row, and getLastSeen_ alone would make that O(players) full
 * sheet reads.
 * @returns {Object<number, {note:string, at:string}>} keyed by playerId
 */
function getLastSeenAll_() {
  return mergeLastSeen_(readTable_('Actions').rows);
}

/**
 * Most recent `limit` feed entries, newest first, plus the true total count.
 * @param {Array} [players] pass the caller's already-loaded listPlayers_()
 *   result to skip a redundant Players read; defaults to loading it here.
 */
function getFeed_(limit, players) {
  var playersById = {};
  (players || listPlayers_()).forEach(function (p) { playersById[p.id] = p; });

  var rows = readTable_('Actions').rows
    .sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : (b.id - a.id); });

  var total = rows.length;
  var page = rows.slice(0, limit).map(function (r) {
    var actor = playersById[r.actorId] || null;
    return {
      id: r.id, at: r.at, actor_id: r.actorId || null, target_id: r.targetId || null,
      kind: r.kind, text: r.text, actor_note: r.actorNote || null, target_note: r.targetNote || null,
      actor_name: actor ? actor.name : null, actor_initials: actor ? actor.initials : null,
      actor_color_index: actor ? actor.colorIndex : null
    };
  });
  return { rows: page, total: total };
}

function alreadyGrantedForDay_(day) {
  return readTable_('DailyGrants').rows.some(function (r) { return r.day === day; });
}

function recordGrantForDay_(day) {
  if (alreadyGrantedForDay_(day)) return;
  appendRow_('DailyGrants', { day: day });
}
