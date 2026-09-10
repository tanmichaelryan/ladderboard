// Builds the data the board page renders: buildBaseView_ for the shared
// board/standings/feed state, buildPlayerView_ wraps it with the signed-in
// player's own console.
//
// buildBaseView_ must never call getInventory_/getDiceCount_/getMinesForOwner_
// or any other *Inventory*/*Dice*/*Mines* function — that's the privacy
// boundary ("nobody can see what anyone else is holding, or where their
// mines are"). buildPlayerView_ is the only place `me`'s own bag/mines are
// attached, and only for the session's own playerId.
//
// import getInventory_, getDiceCount_, getMinesForOwner_ from Repo.gs into this file  <- forbidden, do not add

function buildBaseView_(now) {
  var layout = DEFAULT_SEASON;
  var day = computeGameDay_(now);
  var allPlayers = listPlayers_();
  // Unnamed players (fresh enrollments that haven't picked a nickname yet -
  // see Names.gs/needsName_) never appear on the board: they're at tile 0
  // with no actions (requireNamedPlayer_ in Code.gs blocks them from
  // rolling), so nothing is lost, and it keeps the start rail from filling
  // with blank tokens.
  var players = allPlayers.filter(function (p) { return !needsName_(p); });
  var feedPage = getFeed_(50, allPlayers);
  var feedRows = feedPage.rows, feedTotal = feedPage.total;

  var emptyState = feedTotal === 0;

  var richPlayers = players.map(function (p) {
    return Object.assign({}, p, { color: nextPlayerColor_(p.colorIndex), stunned: p.stunnedForDay !== null });
  });

  // --- board -----------------------------------------------------------
  var byTile = new Map();
  richPlayers.forEach(function (p) {
    var list = byTile.get(p.tile) || [];
    list.push({ id: p.id, initials: p.initials, color: p.color, stunned: p.stunned });
    byTile.set(p.tile, list);
  });
  var board = buildBoard_(layout, byTile, { showConnectors: layout.showConnectors });

  // --- standings ---------------------------------------------------------
  var lastSeen = getLastSeenAll_(); // one Actions read for every player, not one per player
  var ranked = computeStandings_(richPlayers);
  var standings = ranked.map(function (entry) {
    var player = entry.player, rank = entry.rank, tied = entry.tied;
    var delta = emptyState ? null : player.tile - player.tileAtDayStart;
    var seen = lastSeen[player.id];
    return {
      id: player.id, rank: rank, tied: tied, name: player.name, initials: player.initials,
      color: player.color, stunned: player.stunned,
      tile: player.tile, // public — already on the board; needed for PULL's "targets ahead of you" filter
      tileDisplay: player.tile === 0 ? '—' : String(player.tile),
      deltaText: emptyState ? 'day 1' : delta > 0 ? '+' + delta + ' today' : delta < 0 ? '−' + Math.abs(delta) + ' today' : '0 today',
      deltaPositive: !emptyState && delta > 0,
      lastSeenText: seen ? seen.note : 'Has not rolled yet.'
    };
  });

  // --- leader --------------------------------------------------------
  var leaderText = emptyState || standings.length === 0
    ? 'Nobody has rolled yet.'
    : standings[0].name + ' · tile ' + standings[0].tileDisplay;

  // --- start rail -------------------------------------------------------
  var atStart = richPlayers.filter(function (p) { return p.tile === 0; });
  var startNote;
  if (richPlayers.length === 0) startNote = 'Nobody has joined yet.';
  else if (atStart.length === richPlayers.length) startNote = 'All ' + richPlayers.length + ' players at the start line.';
  else if (atStart.length === 0) startNote = 'Everyone is on the board.';
  else startNote = atStart.length + ' still at the start line.';
  // Carries id too, unlike most other token_ call sites — a roll animation
  // (Anim.gs) starting from tile 0 needs to find and hop *this* token, not
  // a board tile's, since tile 0 has no grid cell of its own.
  var startTokens = atStart.map(function (p) { return { id: p.id, initials: p.initials, color: p.color, stunned: p.stunned }; });

  // --- feed --------------------------------------------------------------
  var feed = feedRows.map(function (row) {
    var meta = KIND_META_[row.kind];
    var isSystem = row.actor_id === null;
    return {
      kind: row.kind, kindLabel: meta.label, railColor: meta.railColor,
      loud: row.kind === 'use', isSystem: isSystem,
      avatarInitials: isSystem ? '◷' : row.actor_initials,
      avatarColor: isSystem ? null : nextPlayerColor_(row.actor_color_index),
      text: row.text, atIso: row.at
    };
  });

  return {
    updatedAtIso: now.toISOString(),
    season: {
      name: layout.name, dayNum: day, dayTotal: layout.totalDays,
      daysLeft: Math.max(0, layout.totalDays - day),
      progressPct: Math.min(100, Math.max(3, Math.round((day / layout.totalDays) * 100)))
    },
    leaderText: leaderText,
    board: { tiles: board.tiles, connectors: board.connectors },
    startTokens: startTokens, startNote: startNote, standings: standings,
    feed: {
      entries: feed, emptyState: emptyState,
      meta: emptyState ? 'NO ACTIONS YET' : 'NEWEST FIRST',
      hasMore: feedTotal > feed.length, shownCount: feed.length, totalCount: feedTotal
    }
  };
}

/** @param {number} sessionPlayerId  from the verified Session identity only */
function buildPlayerView_(sessionPlayerId, now) {
  var baseView = buildBaseView_(now);
  var player = getPlayer_(sessionPlayerId);
  if (!player) return Object.assign({}, baseView, { me: null });

  var bag = getBag_(sessionPlayerId);
  var mines = getMinesForOwner_(sessionPlayerId); // OWN live mines only — never in buildBaseView_
  var seen = getLastSeen_(sessionPlayerId);
  var rank = baseView.standings.find(function (s) { return s.id === player.id; });

  var me = {
    id: player.id, name: player.name, initials: player.initials,
    color: nextPlayerColor_(player.colorIndex), tile: player.tile,
    tileDisplay: player.tile === 0 ? '—' : String(player.tile),
    rank: rank ? rank.rank : null, tied: rank ? rank.tied : false,
    stunned: player.stunnedForDay !== null, dice: bag.dice, email: player.email,
    needsName: needsName_(player),
    items: bag.items.map(function (row) { return Object.assign({ item: row.item, count: row.count }, ITEM_META_[row.item]); }),
    mines: mines,
    lastSeenText: seen ? seen.note : 'Has not rolled yet.'
  };

  return Object.assign({}, baseView, { me: me });
}
