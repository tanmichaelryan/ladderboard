// Engine glue: player enrollment and the daily-reset entry point that ties
// Repo.gs, Roll.gs, Use.gs and Reset.gs together.

/** Throws if the sheets haven't been set up yet. */
function ensureDailyReset(now) {
  if (!sheetsReady_()) throw EngineError_('NOT_SET_UP', 'Sheets not set up. Run setup() from the Apps Script editor.');
  return ensureDailyReset_(now || new Date());
}

/**
 * PRIVATE. The only function that returns a player's own bag/dice — callers
 * must have already established that `playerId` is the caller's own id
 * (i.e. looked up via their own Session.getActiveUser() email, never a
 * client-supplied id).
 */
function getBag_(playerId) {
  return { items: getInventory_(playerId), dice: getDiceCount_(playerId) };
}

/**
 * Finds or auto-enrolls a player from the caller's verified domain email.
 * New players start with NO name/initials - a real name can never be the
 * default. They pick their own nickname via the onboarding gate (Names.gs's
 * needsName_, RenderOnboarding.gs) before they can appear on the board or
 * roll.
 */
function findOrEnrollPlayer_(email, now) {
  var existing = getPlayerByEmail_(email);
  if (existing) return existing;
  return createPlayer_({
    email: email, name: '', initials: '',
    colorIndex: playerCount_(), now: now || new Date()
  });
}

function getPlayerColor_(player) {
  return nextPlayerColor_(player.colorIndex);
}
