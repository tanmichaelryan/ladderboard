# Ladderboard — Google Sheets + Apps Script edition

Season-long async snakes-and-ladders for a work team, running entirely
inside Google Workspace: identity comes from `Session.getActiveUser()` (no
OAuth client of your own, nothing registered in GCP), and the Google Sheet
bound to this project is the database. Gameplay (rolls, item uses) writes to
that Sheet through the single web app deployed from this folder.

Trade-off: Apps Script has real limits — a 6-minute execution cap, and
Sheets is a much weaker datastore under concurrent writes than SQLite, which
is why every write goes through a script-wide lock (`withLock_` in
`Code.gs`) rather than relying on the datastore for atomicity. Fine for a
5–20 person team rolling once a day; don't expect it to scale past that.

## What's in here

Access control (`requireIdentity_` in `Code.gs`) checks the caller's Google
account against `TEAM_DOMAIN` (`Config.gs`), and the human-facing deployment
is *also* restricted to that Workspace domain at the infra level (see
`appsscript.json`). The pieces worth knowing about:

- **No OAuth, no cookies, no CSRF.** Identity comes from
  `Session.getActiveUser().getEmail()`, verified to end in `@` +
  `TEAM_DOMAIN` (`Code.gs`'s `requireIdentity_`).
- **No login/logout.** Everyone who can open the deployed web app is already
  a domain member; they're auto-enrolled as a player on first visit
  (`findOrEnrollPlayer_` in `Engine.gs`), with no separate login step.
- **No display name from Google, and no name is guessed for you.**
  `Session.getActiveUser()` only exposes an email, not a name. New players
  enroll with a blank name and must pick their own nickname before they can
  roll or appear on the board (`Names.gs`'s `needsName_`/`validateDisplayName_`,
  `Code.gs`'s `requireNamedPlayer_`, `RenderOnboarding.gs`). A real name or
  email can never be the default, or even a choosable one —
  `validateDisplayName_` rejects anything email- or URL-shaped, since board
  tokens show only initials and impersonation is a live prank vector in a
  competitive team game. Players change their nickname later via the
  "rename" control in the console.
- **The Sheet is the database.** `Sheets.gs` + `Repo.gs` provide the
  storage layer. Six tabs: `Players`, `Inventories`, `Dice`, `Actions`,
  `DailyGrants`, `Mines`. There's no `Season` tab — the board layout, season
  length, and power-up tuning are source constants (`DEFAULT_SEASON`/
  `SEASON_STARTED_AT_`/`POWERUP_` in `Config.gs`), not sheet state, so
  starting a season is "edit Config.gs and redeploy" rather than a seeded
  row. `Inventories`, `Dice`, and `Mines` are the private tabs: `Views.gs`'s
  `buildBaseView_` must never touch them (see the comment at its top). A
  mine row is soft-deleted (an empty `triggeredAt`/`triggeredBy` means
  live) rather than removed — see the comment on `Mines` in `Sheets.gs`.
- **`google.script.run` instead of form POSTs.** The console's Roll/Use/
  rename controls call server functions directly (`serverRoll`,
  `serverUseItem`, `serverSetName` in `Code.gs`) instead of submitting
  `<form method="post">` to HTTP routes — see `callServer_` in
  `RenderPage.gs`. Same reason CSRF tokens are gone: these calls are already
  scoped to the caller's authenticated session.

Game rules themselves — board geometry, shortcuts/setbacks, dice, the eight
power-up items (extra die, double dice, jump, pull, windblown, thunder,
landmine, shield), the daily reset, standings, the activity feed — live in
`Derive.gs`, `Roll.gs`, `Use.gs`, `Reset.gs`. `stun` and `warp` are retired
(replaced by `thunder` and `jump`) but stay labelled in `Theme.gs` so any
pre-existing inventory row still renders instead of going blank.

Landing on a power tile performs `POWERUP_.rollsPerLanding` gacha draws and
keeps every `rollsPerPowerup`-th one (`drawItems_` in `Roll.gs`) — the
default (3 and 3) grants exactly one item per landing, same as before this
was tunable. A landmine is armed on any tile 1–99 and is invisible to
everyone but its owner until it triggers — arming it, or walking over your
own, never appears in any Actions row with a tile number attached
(`mineActionNotes_` in `Use.gs`); only the trigger event does. Only a *roll*
landing ever resolves a power tile or a mine — PULL/JUMP/WINDBLOWN
displacement never does, which is what keeps one power-up from chaining
into another.

## Deploy it

See [`DEPLOY.md`](../DEPLOY.md) at the repo root for the full first-time
checklist (Sheet → Apps Script → Config → `setup()` → deploy → verification →
troubleshooting).

There is a single web app deployment: **Execute as: User accessing the web
app**, **Who has access: Anyone within your domain**. Apps Script enforces
that restriction at the infra level, on top of `requireIdentity_`'s
`TEAM_DOMAIN` check — see "What's in here" above.

## Updating after the first deploy

⚠️ Push your file changes, then **Deploy → Manage deployments → edit (✎) →
New version → Deploy**. Editing files alone doesn't update the live web app
URL until you deploy a new version — and creating a brand-new deployment
instead of editing the existing one mints a new URL and silently orphans
whatever points at the old one (e.g. a teammate's bookmark).

## Admin tasks

Use the **Ladderboard Admin** menu on the Sheet itself (appears after
`setup` has run once, or after reopening the Sheet):

- **Set up** — re-runs `setup()`.
- **List players** — shows every player's id, name, tile, email and stun
  status.
- **Grant item to player…** — grants a power-up item to a player by id or
  email, prompted interactively.
- **Reset all display names…** — blanks every player's nickname, forcing
  everyone to pick one again next visit. Useful if an older version of this
  code guessed names from email and you want everyone on a real nickname.
- **Start new season…** — wipes all player/action/dice/item/mine data so the
  spreadsheet can be reused for a new season. Update `SEASON_STARTED_AT_` in
  `Config.gs` and redeploy along with it — this menu item only clears rows, it
  doesn't touch source. Skipping the wipe leaves stale `DailyGrants` rows
  behind, which would make the new season's day 1 look already-granted and
  nobody would receive a die. Runs `ensureSheets_()` first, so this is also
  safe to run once right after adding a new tab (e.g. `Mines`) to
  `SHEET_SCHEMA_` on a spreadsheet from before that change.

## What's intentionally not here

No `node:test`-style automated tests — Apps Script doesn't run one. Instead,
`Tests.gs` holds a small `runTests()` you run from the editor's function
dropdown (View → Logs for PASS/FAIL/SKIP), covering the nickname validator,
the `getLastSeenAll_`/`getLastSeen_` equivalence a performance fix depends
on, and every power-up rule extracted as a pure function — the gacha draw
count, the ACTION_KINDS_/KIND_META_ and item-catalog coverage that keep the
feed and bag from throwing or rendering blank, PULL's distance/target rules,
WINDBLOWN/THUNDER's targeting exclusions, and the landmine tile-privacy
invariant (`mineActionNotes_` must never mention the tile it's called with).
The rest of the engine logic was checked against an ad hoc in-memory Sheets
emulator during development — dice, rolls, shortcuts/setbacks resolution, every power-up's
effect including the shield-block case and the mine soft-delete, the
idempotent daily reset, and both privacy invariants (a pickup's feed text
never names the item granted; another player's bag or mines never render in
your page). If you change game rules here, re-verify by hand against those
same invariants.
