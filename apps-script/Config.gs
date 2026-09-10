// Ladderboard — Google Sheets + Apps Script edition.
//
// This runs entirely inside Google Workspace: it's an Apps Script bound to a
// Sheet, deployed as a web app restricted to your Workspace domain. Identity
// comes from Session.getActiveUser() (no OAuth client of our own, nothing to
// register), and the Sheet is the database. See DEPLOY.md (repo root) for
// deployment steps, and README.md in this folder for how it all fits
// together.

// Set this to your Workspace domain. Anyone opening the deployed web app
// whose Google account email doesn't end in "@" + TEAM_DOMAIN is refused —
// this is the equivalent of the original app's `hd` claim check.
var TEAM_DOMAIN = 'example.com';

// The season's board and duration — edit and redeploy (clasp push) to run a
// different board. Not sheet-backed: this project has no build step, so "at
// build time" means "in source" here.
var DEFAULT_SEASON = {
  name: 'The Long Climb',
  totalDays: 30,
  // Shortcuts (ladders, foot->top) and setbacks (snakes, head->tail). Edit
  // these to reshape the board for a new season — validateSeason_
  // (Derive.gs) enforces that shortcuts climb, setbacks descend, and no
  // tile is ever two things at once (shortcut/setback/power-up/finish),
  // throwing at setup() with the offending tile number if violated.
  shortcuts: { 4: 22, 9: 31, 20: 39, 28: 55, 51: 72, 63: 81, 71: 91 },
  setbacks: { 17: 7, 44: 36, 54: 33, 62: 19, 87: 24, 93: 68, 98: 79 },
  power: [3, 6, 11, 12, 14, 25, 29, 34, 37, 41, 45, 48, 52, 57, 60, 66, 70, 74, 78, 83, 88, 95],
  showConnectors: true
};

// When the current season started. Edit and redeploy to start a new season —
// pair with "Start new season…" in the Sheet menu (see Code.gs), which wipes
// the player/action data this timestamp's game-day math depends on.
var SEASON_STARTED_AT_ = '2026-09-15T00:00:00Z';

// Power-up tuning. Validated by validatePowerup_ (Derive.gs), called from
// setup() — a bad ratio here should fail loudly at setup, not silently grant
// zero items on the first landing.
var POWERUP_ = {
  rollsPerLanding: 3,    // gacha draws performed per power-tile landing
  rollsPerPowerup: 3,    // draws consumed per item kept (floor(rollsPerLanding / rollsPerPowerup) items granted)
  jumpDistance: 5,       // JUMP: tiles moved forward
  windPushback: 3,       // WINDBLOWN: tiles every opponent is pushed back
  mineKnockback: 5,      // LANDMINE: tiles the victim is knocked back
  shieldCharges: 3,      // SHIELD: charges granted per pickup
  thunderDiceLoss: 1,    // THUNDER: dice lost per opponent (can go negative — see Repo.gs addDice_)
  pullMaxDistance: null  // PULL: cap on how far a target is dragged; null = all the way to your tile
};
