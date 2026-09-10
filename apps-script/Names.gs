// Display-name validation. Players choose their own nickname on first visit
// instead of getting one derived from their email (see Engine.gs's
// findOrEnrollPlayer_) - a real name or email address must never be
// choosable, let alone the default.
//
// Board tokens show only initials, so two players with the same name are
// indistinguishable and impersonation is a live prank vector in a
// competitive team game - hence the uniqueness check.

var NAME_MIN_ = 2;
var NAME_MAX_ = 24;
var RESERVED_NAMES_ = ['system', 'admin', 'ladderboard', 'unnamed', 'nobody'];
var EMAIL_RE_ = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
var URLISH_RE_ = /(https?:|www\.)/i;
var ALLDIGIT_RE_ = /^\d+$/;
var CHARSET_RE_ = /^[\p{L}\p{N} '._!?-]+$/u;

/** '  jane   doe ' -> 'jane doe'. Never throws. */
function normalizeDisplayName_(raw) {
  return String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
}

/** True if the player hasn't chosen a nickname yet (fresh enrollment). */
function needsName_(player) {
  return !player || !normalizeDisplayName_(player.name);
}

/** Case-insensitive uniqueness check across all players. */
function nameTaken_(name, exceptPlayerId) {
  var needle = name.toLowerCase();
  return listPlayers_().some(function (p) {
    return p.id !== exceptPlayerId && normalizeDisplayName_(p.name).toLowerCase() === needle;
  });
}

/**
 * Validates and returns a clean display name, or throws
 * EngineError_('BAD_NAME', <message safe to show the player>).
 * @param {string} raw
 * @param {number} playerId  the player choosing this name (excluded from the uniqueness check)
 */
function validateDisplayName_(raw, playerId) {
  var name = normalizeDisplayName_(raw);

  if (name.length < NAME_MIN_ || name.length > NAME_MAX_) {
    throw EngineError_('BAD_NAME', 'Name must be ' + NAME_MIN_ + '-' + NAME_MAX_ + ' characters.');
  }
  if (name.indexOf('@') !== -1 || EMAIL_RE_.test(name)) {
    throw EngineError_('BAD_NAME', 'Name cannot look like an email address.');
  }
  if (URLISH_RE_.test(name)) {
    throw EngineError_('BAD_NAME', 'Name cannot contain a link.');
  }
  if (ALLDIGIT_RE_.test(name)) {
    // Also a correctness fix, not just a style rule: Sheets coerces an
    // all-digit cell to a JS number, and computeStandings_ (Derive.gs) calls
    // name.localeCompare(...), which throws on a number.
    throw EngineError_('BAD_NAME', 'Name cannot be all digits.');
  }
  if (!CHARSET_RE_.test(name)) {
    throw EngineError_('BAD_NAME', "Name can only use letters, numbers, spaces and ' . _ ! ? -");
  }
  if (RESERVED_NAMES_.indexOf(name.toLowerCase()) !== -1) {
    throw EngineError_('BAD_NAME', 'That name is reserved. Pick another.');
  }
  if (nameTaken_(name, playerId)) {
    throw EngineError_('BAD_NAME', 'Someone already goes by "' + name + '". Pick another.');
  }

  return name;
}
