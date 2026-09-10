// Pure board/game math: tile typing (shortcut/setback/power-up), the daily
// move resolution, and standings/rank derivation. No I/O.

var BOARD_SIZE_ = 100;

/** Clamps any displacement (roll, pull, jump, wind, mine knockback) onto
 *  the board. Every mover uses this — nothing writes a raw tile number. */
function clampTile_(n) {
  return Math.min(BOARD_SIZE_, Math.max(0, n));
}

function tileCenter_(n) {
  var idx = n - 1;
  var row = Math.floor(idx / 10);
  var c = idx % 10;
  var col = row % 2 === 0 ? c : 9 - c;
  return { x: col + 0.5, y: 9 - row + 0.5 };
}

function boustrophedonOrder_() {
  var order = [];
  for (var row = 9; row >= 0; row--) {
    var base = row * 10;
    var nums = [];
    for (var c = 0; c < 10; c++) nums.push(base + c + 1);
    if (row % 2 === 1) nums.reverse();
    order = order.concat(nums);
  }
  return order;
}

/** "No tile is ever two things at once." Throws on the first violation. */
function validateSeason_(layout) {
  var feet = Object.keys(layout.shortcuts).map(Number);
  var tops = Object.keys(layout.shortcuts).map(function (k) { return layout.shortcuts[k]; });
  var heads = Object.keys(layout.setbacks).map(Number);
  var tails = Object.keys(layout.setbacks).map(function (k) { return layout.setbacks[k]; });
  var power = layout.power;

  Object.keys(layout.shortcuts).forEach(function (foot) {
    var top = layout.shortcuts[foot];
    if (!(top > Number(foot))) {
      throw new Error('Season layout invalid: shortcut ' + foot + '->' + top + ' does not climb (top must be > foot).');
    }
  });
  Object.keys(layout.setbacks).forEach(function (head) {
    var tail = layout.setbacks[head];
    if (!(tail < Number(head))) {
      throw new Error('Season layout invalid: setback ' + head + '->' + tail + ' does not slide down (tail must be < head).');
    }
  });

  var sets = [
    ['shortcut foot', feet], ['shortcut top', tops],
    ['setback head', heads], ['setback tail', tails],
    ['power-up', power]
  ];

  var seen = {};
  sets.forEach(function (pair) {
    var label = pair[0], tiles = pair[1];
    tiles.forEach(function (n) {
      if (n === BOARD_SIZE_) {
        throw new Error('Season layout invalid: tile 100 (finish) cannot also be a ' + label + ' tile.');
      }
      var prior = seen[n];
      if (prior && prior !== label) {
        throw new Error('Season layout invalid: tile ' + n + ' is both a ' + prior + ' tile and a ' + label + ' tile. No tile is ever two things at once.');
      }
      seen[n] = label;
    });
  });
}

/** Fails loudly at setup() if POWERUP_ (Config.gs) is misconfigured — in
 *  particular, a rollsPerLanding/rollsPerPowerup ratio below 1 would grant
 *  zero items on every landing while the feed still says "went into their
 *  bag." */
function validatePowerup_(cfg) {
  if (!(cfg.rollsPerLanding >= 1)) throw new Error('POWERUP_ invalid: rollsPerLanding must be >= 1.');
  if (!(cfg.rollsPerPowerup >= 1)) throw new Error('POWERUP_ invalid: rollsPerPowerup must be >= 1.');
  if (Math.floor(cfg.rollsPerLanding / cfg.rollsPerPowerup) < 1) {
    throw new Error('POWERUP_ invalid: rollsPerLanding/rollsPerPowerup grants zero items (floor(' + cfg.rollsPerLanding + '/' + cfg.rollsPerPowerup + ') < 1).');
  }
  if (!(cfg.jumpDistance >= 1)) throw new Error('POWERUP_ invalid: jumpDistance must be >= 1.');
  if (!(cfg.shieldCharges >= 1)) throw new Error('POWERUP_ invalid: shieldCharges must be >= 1.');
  if (!(cfg.windPushback >= 0)) throw new Error('POWERUP_ invalid: windPushback must be >= 0.');
  if (!(cfg.mineKnockback >= 0)) throw new Error('POWERUP_ invalid: mineKnockback must be >= 0.');
  if (!(cfg.thunderDiceLoss >= 0)) throw new Error('POWERUP_ invalid: thunderDiceLoss must be >= 0.');
  if (cfg.pullMaxDistance !== null && !(cfg.pullMaxDistance >= 1)) {
    throw new Error('POWERUP_ invalid: pullMaxDistance must be null or >= 1.');
  }
}

var GLYPH_ = { power: '◆', 'shortcut-foot': '▲', 'setback-head': '▼', finish: '★' };

function classifyTile_(n, layout) {
  var isFoot = layout.shortcuts[n] !== undefined;
  var isTop = Object.keys(layout.shortcuts).some(function (k) { return layout.shortcuts[k] === n; });
  var isHead = layout.setbacks[n] !== undefined;
  var isTail = Object.keys(layout.setbacks).some(function (k) { return layout.setbacks[k] === n; });
  var isPower = layout.power.indexOf(n) !== -1;
  var finish = n === BOARD_SIZE_;
  var row = Math.floor((n - 1) / 10);
  var rowEven = row % 2 === 0;

  var type;
  if (finish) type = 'finish';
  else if (isPower) type = 'power';
  else if (isFoot) type = 'shortcut-foot';
  else if (isTop) type = 'shortcut-top';
  else if (isHead) type = 'setback-head';
  else if (isTail) type = 'setback-tail';
  else type = rowEven ? 'plain-even' : 'plain-odd';

  return { type: type, glyph: GLYPH_[type] || '' };
}

function resolveLanding_(n, layout) {
  if (layout.shortcuts[n] !== undefined) return { tile: layout.shortcuts[n], via: 'shortcut' };
  if (layout.setbacks[n] !== undefined) return { tile: layout.setbacks[n], via: 'setback' };
  return { tile: n, via: null };
}

// Half-width (in board units, same space as tileCenter_) between a ladder's
// two rails.
var LADDER_RAIL_HALF_W_ = 0.16;

/**
 * PURE. A ladder from `foot` to `top`: two parallel rails offset
 * perpendicular to the foot->top line, plus evenly-spaced rungs between
 * them. Rung count scales with length so short and long ladders both read
 * as a ladder rather than a hatched bar or a single rung.
 */
function ladderPath_(foot, top) {
  var a = tileCenter_(foot), b = tileCenter_(top);
  var dx = b.x - a.x, dy = b.y - a.y;
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  var ux = dx / len, uy = dy / len;
  var px = -uy * LADDER_RAIL_HALF_W_, py = ux * LADDER_RAIL_HALF_W_;

  var rails = [
    { x1: a.x + px, y1: a.y + py, x2: b.x + px, y2: b.y + py },
    { x1: a.x - px, y1: a.y - py, x2: b.x - px, y2: b.y - py }
  ];

  var rungCount = Math.max(2, Math.round(len / 0.62));
  var rungs = [];
  for (var i = 0; i < rungCount; i++) {
    // Interior placements only (never right at the foot/top) so rungs read
    // as crossbars between the rails, not endcaps.
    var t = (i + 1) / (rungCount + 1);
    var cx = a.x + dx * t, cy = a.y + dy * t;
    rungs.push({ x1: cx + px, y1: cy + py, x2: cx - px, y2: cy - py });
  }

  return { kind: 'shortcut', from: foot, to: top, rails: rails, rungs: rungs };
}

var SNAKE_AMP_ = 0.22;
var SNAKE_SAMPLES_ = 24;

/**
 * PURE. A snake from `head` to `tail`: a sine-offset polyline sampled along
 * the head->tail line, plus the initial tangent angle (degrees) at the head
 * so the rendered head/eyes can be oriented to face the direction of travel.
 */
function snakePath_(head, tail) {
  var a = tileCenter_(head), b = tileCenter_(tail);
  var dx = b.x - a.x, dy = b.y - a.y;
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  var ux = dx / len, uy = dy / len;
  var px = -uy, py = ux;
  var waves = Math.max(1.5, len / 2.2);

  var points = [];
  for (var i = 0; i <= SNAKE_SAMPLES_; i++) {
    var t = i / SNAKE_SAMPLES_;
    var offset = SNAKE_AMP_ * Math.sin(t * waves * 2 * Math.PI);
    points.push({ x: a.x + dx * t + px * offset, y: a.y + dy * t + py * offset });
  }

  var d = points.map(function (p, i) {
    return (i === 0 ? 'M' : 'L') + p.x.toFixed(4) + ' ' + p.y.toFixed(4);
  }).join(' ');

  // Tangent at the head end, from the first two sampled points.
  var headAngle = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x) * 180 / Math.PI;

  return {
    kind: 'setback', from: head, to: tail, d: d,
    headX: points[0].x, headY: points[0].y, headAngle: headAngle
  };
}

function buildConnectors_(layout, show) {
  if (!show) return [];
  var connectors = [];
  Object.keys(layout.shortcuts).forEach(function (foot) {
    connectors.push(ladderPath_(Number(foot), layout.shortcuts[foot]));
  });
  Object.keys(layout.setbacks).forEach(function (head) {
    connectors.push(snakePath_(Number(head), layout.setbacks[head]));
  });
  return connectors;
}

var TOKEN_CAP_ = 2;

function stackTokens_(playersHere) {
  return {
    shown: playersHere.slice(0, TOKEN_CAP_),
    moreCount: Math.max(0, playersHere.length - TOKEN_CAP_)
  };
}

/** @param {Map<number, any[]>} byTile */
function buildBoard_(layout, byTile, options) {
  options = options || {};
  var showConnectors = options.showConnectors !== false;
  var tiles = boustrophedonOrder_().map(function (n) {
    var ct = classifyTile_(n, layout);
    var here = byTile.get(n) || [];
    var st = stackTokens_(here);
    return { n: n, type: ct.type, glyph: ct.glyph, tokens: st.shown, moreCount: st.moreCount };
  });
  return { tiles: tiles, connectors: buildConnectors_(layout, showConnectors) };
}

/** Sort: tile descending, then name A-Z. Ties share a rank. */
function computeStandings_(players) {
  var sorted = players.slice().sort(function (a, b) { return b.tile - a.tile || a.name.localeCompare(b.name); });
  var tileCounts = {};
  sorted.forEach(function (p) { tileCounts[p.tile] = (tileCounts[p.tile] || 0) + 1; });

  var lastTile = null, lastRank = 0;
  return sorted.map(function (player, i) {
    var rank = player.tile === lastTile ? lastRank : i + 1;
    lastTile = player.tile;
    lastRank = rank;
    return { player: player, rank: rank, tied: tileCounts[player.tile] > 1 };
  });
}

// Fixed lightness/chroma band from the design's reference colors; hue walks
// the golden angle so any number of players stays well-separated.
var PLAYER_COLOR_L_ = 0.58;
var PLAYER_COLOR_C_ = 0.15;
var GOLDEN_ANGLE_ = 137.508;
var HUE_OFFSET_ = 25;

function nextPlayerColor_(index) {
  var hue = (HUE_OFFSET_ + index * GOLDEN_ANGLE_) % 360;
  return 'oklch(' + PLAYER_COLOR_L_ + ' ' + PLAYER_COLOR_C_ + ' ' + hue.toFixed(1) + ')';
}

function initialsFor_(name) {
  var parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
