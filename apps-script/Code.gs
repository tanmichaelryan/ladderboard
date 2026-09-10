// Entry points: the web app (doGet), the functions the page's buttons call
// via google.script.run, and the admin menu/setup helpers (Sheet menu:
// "Ladderboard Admin").
//
// Concurrency: Roll.gs/Use.gs/Reset.gs do NOT lock themselves (unlike the
// original's one-SQLite-transaction-per-call). Every public entry point
// below wraps its engine calls in withLock_ instead, so exactly one
// roll/use/reset/enroll runs at a time — the Sheets equivalent of the
// original's db.transaction().

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('The board is busy — try again in a moment.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function emailDomain_(email) {
  var parts = String(email).split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : '';
}

/** Verified caller identity, or throws a message safe to show the player. */
function requireIdentity_() {
  var email = Session.getActiveUser().getEmail();
  if (!email) {
    throw new Error('Could not verify your Google identity. Open this page while signed into your work Google account.');
  }
  if (emailDomain_(email) !== TEAM_DOMAIN.toLowerCase()) {
    throw new Error('This board is only for ' + TEAM_DOMAIN + '. You are signed in as ' + email + '.');
  }
  return email;
}

/** Verified caller's own player row, refusing an unnamed player. Used by
 *  every console action except serverSetName, which is the escape hatch
 *  unnamed players use to stop being unnamed. */
function requireNamedPlayer_() {
  var email = requireIdentity_();
  var player = getPlayerByEmail_(email);
  if (!player) throw new Error('Not enrolled yet — reload the page first.');
  if (needsName_(player)) throw new Error('Pick a display name before you play.');
  return player;
}

// --- web app -----------------------------------------------------------

function doGet() {
  return handleHtmlApp_();
}

function handleHtmlApp_() {
  if (!sheetsReady_()) {
    return HtmlService.createHtmlOutput(
      '<p>Not set up yet. An admin needs to open this spreadsheet, go to ' +
      'Extensions &gt; Apps Script, and run <code>setup()</code> once (see README.md).</p>'
    ).setTitle('Ladderboard — setup needed');
  }

  var email;
  try {
    email = requireIdentity_();
  } catch (err) {
    return HtmlService.createHtmlOutput('<p>' + esc_(err.message) + '</p>').setTitle('Ladderboard');
  }

  try {
    var player;
    withLock_(function () {
      ensureDailyReset(new Date());
      player = findOrEnrollPlayer_(email, new Date());
    });
    var view = buildPlayerView_(player.id, new Date());
    return HtmlService.createHtmlOutput(String(renderPage_(view)))
      .setTitle(view.season.name + ' — Ladderboard')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (err) {
    return HtmlService.createHtmlOutput('<pre>' + esc_(String((err && err.message) || err)) + '</pre>');
  }
}

// --- console actions (called via google.script.run — see RenderPage.gs) ----

// Returns a narrowed projection of roll_'s result — enough for the client
// (Anim.gs) to animate the hop and, if `via` is set, the ladder/snake
// traversal — or null when the roll was a no-op (no dice left, a swallowed
// race). `itemsGranted` is deliberately dropped: the animation doesn't need
// it, and the feed never names granted items — see the privacy note at the
// top of Roll.gs. Keep that boundary here too.
function serverRoll() {
  return withLock_(function () {
    var player = requireNamedPlayer_();
    var result = null;
    try {
      result = roll_(player.id, new Date());
    } catch (err) {
      if (!isEngineError_(err)) throw err; // expected failures (no dice left, race) are silent, same as the original
    }
    if (!result) return null;
    return {
      playerId: player.id, from: result.from, value: result.value, moved: result.moved,
      landedOn: result.landedOn, to: result.to, via: result.via, isPower: result.isPower,
      mineTriggered: result.mineTriggered, mineBlocked: result.mineBlocked,
      diceLeft: result.diceLeft, finished: result.finished
    };
  });
}

function serverUseItem(item, args) {
  return withLock_(function () {
    var player = requireNamedPlayer_();
    var cleanArgs = {};
    if (args && args.targetId !== undefined && args.targetId !== null) cleanArgs.targetId = Number(args.targetId);
    if (args && args.toTile !== undefined && args.toTile !== null) cleanArgs.toTile = Number(args.toTile);
    if (args && args.tile !== undefined && args.tile !== null) cleanArgs.tile = Number(args.tile);
    // Unlike serverRoll, EngineErrors are NOT swallowed here: callServer_'s
    // withFailureHandler (RenderPage.gs) already renders err.message into
    // #console-error, and an item use has real, correctable failure modes a
    // player needs to see (wrong target, tile out of range, no dice for a
    // DOUBLE) — silently reloading the page would look like nothing
    // happened and, worse, the item is already spent (see useItem_'s
    // validate-before-decrement ordering in Use.gs).
    useItem_(player.id, item, cleanArgs, new Date());
    return true;
  });
}

function serverSetName(name) {
  return withLock_(function () {
    var email = requireIdentity_();
    var player = getPlayerByEmail_(email);
    if (!player) throw new Error('Not enrolled yet — reload the page first.');
    var wasUnnamed = needsName_(player); // Names.gs - only a fresh unnamed->named transition earns the starter die below, not a later rename
    var clean = validateDisplayName_(name, player.id); // Names.gs - throws EngineError_('BAD_NAME', ...) on anything unsuitable for the public board
    setPlayerNameAndInitials_(player.id, clean, initialsFor_(clean));
    if (wasUnnamed) {
      addDice_(player.id, 1); // Repo.gs - one free roll so a new player has something to do right away
      insertAction_({ kind: 'reset', text: clean + ' joined the climb and got a starter die.', now: new Date() });
    }
    return true;
  });
}

// --- admin: setup + the Sheet menu -----------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Ladderboard Admin')
    .addItem('Set up', 'setup')
    .addItem('List players', 'listPlayersAdmin')
    .addItem('Grant item to player…', 'grantItemAdmin')
    .addSeparator()
    .addItem('Reset all display names…', 'resetAllNamesAdmin')
    .addItem('Start new season…', 'startNewSeasonAdmin')
    .addToUi();
}

/**
 * One-time cutover helper: blanks every player's display name, forcing
 * everyone to pick a nickname again next visit (see Names.gs's needsName_).
 * Run this once, before the first public Pages publish, so nobody's
 * email-derived name (from before this change) leaks onto the public board.
 */
function resetAllNamesAdmin() {
  var ui = SpreadsheetApp.getUi();
  var players = listPlayers_();
  var resp = ui.alert(
    'Reset all display names?',
    'This blanks the display name for all ' + players.length + ' player(s). Everyone will be ' +
    'asked to pick a nickname next time they open the board. This cannot be undone from this menu.',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;
  withLock_(function () {
    players.forEach(function (p) { setPlayerNameAndInitials_(p.id, '', ''); });
  });
  ui.alert('Done. ' + players.length + ' player(s) will be asked to pick a nickname.');
}

/** Dev helper: blanks the CALLER's own display name, so the onboarding gate
 *  can be tested without touching other players. Run from the Apps Script
 *  editor while signed in as yourself. Harmless to leave in place - it can
 *  only ever affect the account running it. */
function debugClearMyName() {
  var email = requireIdentity_();
  var player = getPlayerByEmail_(email);
  if (!player) throw new Error('Not enrolled yet — open the web app once first.');
  setPlayerNameAndInitials_(player.id, '', '');
  Logger.log('Cleared display name for player #%s (%s).', player.id, email);
}

/** Run once from the Apps Script editor (or the Sheet menu) to get started. */
function setup() {
  validateSeason_(DEFAULT_SEASON); // fail loudly here, not at first render, if the layout in Config.gs is broken
  validatePowerup_(POWERUP_); // same convention for the power-up tuning
  ensureSheets_();
  Logger.log('Set up "%s" (%s days), started %s.', DEFAULT_SEASON.name, DEFAULT_SEASON.totalDays, SEASON_STARTED_AT_);
  Logger.log('Players enroll automatically the first time they open the web app.');
}

/**
 * Wipes all player/action data so a new season can start clean. Required,
 * not optional, before reusing this spreadsheet for a new season: DailyGrants
 * otherwise still holds every day number the old season already granted, so
 * the new season's day 1 would look "already granted" and nobody would ever
 * receive a die.
 *
 * Does NOT touch SEASON_STARTED_AT_ (Config.gs) — that's source, update it
 * and redeploy (clasp push) separately.
 */
function startNewSeasonAdmin() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    'Start new season?',
    'This permanently deletes all players, dice, items, the action feed, and daily-grant ' +
    'history from this spreadsheet. It does NOT update the season start date — set ' +
    'SEASON_STARTED_AT_ in Config.gs and redeploy first (or right after). This cannot be undone.',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;
  withLock_(function () {
    // A sheet added to SHEET_SCHEMA_ after this spreadsheet's last setup()
    // (e.g. Mines) won't exist yet — ensureSheets_ is idempotent and must
    // run before getSheet_ below, or this throws instead of clearing.
    ensureSheets_();
    Object.keys(SHEET_SCHEMA_).forEach(function (name) {
      var sheet = getSheet_(name);
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    });
  });
  ui.alert('Done. All player and action data cleared. Update SEASON_STARTED_AT_ and redeploy if you have not already.');
}

function listPlayersAdmin() {
  var ui = SpreadsheetApp.getUi();
  var players = listPlayers_();
  if (players.length === 0) {
    ui.alert('No players have opened the board yet.');
    return;
  }
  var lines = players.map(function (p) {
    return '#' + p.id + '  ' + p.name + '  tile ' + p.tile + '  ' + p.email + (p.stunnedForDay ? '  [stunned]' : '');
  });
  ui.alert('Players (' + players.length + ')', lines.join('\n'), ui.ButtonSet.OK);
}

function grantItemAdmin() {
  var ui = SpreadsheetApp.getUi();

  var idResp = ui.prompt('Grant item — 1/3', 'Player id or email:', ui.ButtonSet.OK_CANCEL);
  if (idResp.getSelectedButton() !== ui.Button.OK) return;
  var idOrEmail = idResp.getResponseText().trim();

  // Built from ITEM_POOL_ (Roll.gs) rather than hardcoded, so this prompt
  // can't list a retired item or omit a new one.
  var itemResp = ui.prompt('Grant item — 2/3', 'Item (' + ITEM_POOL_.join(', ') + '):', ui.ButtonSet.OK_CANCEL);
  if (itemResp.getSelectedButton() !== ui.Button.OK) return;
  var item = itemResp.getResponseText().trim();
  if (ITEM_POOL_.indexOf(item) === -1) {
    ui.alert('Unknown item "' + item + '". Must be one of: ' + ITEM_POOL_.join(', ') + '.');
    return;
  }

  var countResp = ui.prompt('Grant item — 3/3', 'Count (default 1):', ui.ButtonSet.OK_CANCEL);
  if (countResp.getSelectedButton() !== ui.Button.OK) return;
  var count = Number(countResp.getResponseText()) || 1;

  var player = /^\d+$/.test(idOrEmail) ? getPlayer_(Number(idOrEmail)) : getPlayerByEmail_(idOrEmail);
  if (!player) {
    ui.alert('No player matching "' + idOrEmail + '".');
    return;
  }
  // grantItem_ (Roll.gs), not addInventory_ directly — it knows shield's
  // count means charges, not stacked pickups (POWERUP_.shieldCharges each).
  withLock_(function () { for (var i = 0; i < count; i++) grantItem_(player.id, item); });
  ui.alert('Granted ' + count + ' × ' + item + ' to ' + player.name + '.');
}
