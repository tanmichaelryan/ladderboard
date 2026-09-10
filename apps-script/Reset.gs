// The daily reset. No trigger/cron: this runs lazily at the top of every
// doGet and every write, guarded by DailyGrants so concurrent callers can't
// double-grant. IMPORTANT: this function does NOT take the script lock
// itself — callers (Code.gs's entry points) must hold it. See withLock_ in
// Code.gs.

function joinNames_(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return names[0] + ' and ' + names[1];
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

/**
 * Runs the reset if the current game day hasn't been granted yet. Idempotent
 * — safe to call on every request.
 * @returns {{ day: number, justReset: boolean }}
 */
function ensureDailyReset_(now) {
  var day = computeGameDay_(now);

  if (alreadyGrantedForDay_(day)) {
    return { day: day, justReset: false };
  }

  var players = listPlayers_();
  var stunnedNames = [];
  var grantedCount = 0;

  players.forEach(function (player) {
    setTileAtDayStart_(player.id, player.tile);
    if (needsName_(player)) return; // hasn't onboarded yet - no dice to bank while unnamed
    if (player.stunnedForDay === day) {
      clearStunned_(player.id);
      stunnedNames.push(player.name);
    } else {
      addDice_(player.id, 1);
      grantedCount++;
    }
  });

  recordGrantForDay_(day);

  var text = 'Daily dice granted to ' + grantedCount + ' player' + (grantedCount === 1 ? '' : 's') + '.';
  if (stunnedNames.length > 0) {
    text += ' ' + joinNames_(stunnedNames) + ' ' + (stunnedNames.length > 1 ? 'were' : 'was') + ' stunned and got none.';
  }
  insertAction_({ kind: 'reset', text: text, now: now });

  return { day: day, justReset: true };
}
