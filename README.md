# Ladderboard

Season-long async snakes-and-ladders for a 5–20 person work team, running
entirely inside Google Workspace. Team members open a deployed web app,
sign in with their Workspace Google account, and roll once a day.

## How a season plays

- **100 tiles**, laid out with **shortcuts** (ladders) and **setbacks**
  (snakes), plus **22 power-up tiles**.
- Everyone gets **one free die per day** at the 00:00 UTC daily reset
  (unless stunned by an opponent — see below).
- A default season runs **30 days**. Board layout and season length are
  source constants, so a new season is "edit and redeploy," not a
  database migration.

**Eight power-ups**, picked up by landing on a power-up tile:

| Item | Effect |
|---|---|
| Extra die | One additional roll, usable any time |
| Double dice | Rolls immediately and doubles the result; costs one die |
| Jump | Move yourself forward a few tiles |
| Pull | Drag a target ahead of you to your tile |
| Windblown | Push every opponent back a few tiles |
| Thunder | Every opponent loses a die (can put them into debt) |
| Landmine | Arm a hidden trap on any tile ahead of you |
| Shield | Blocks the next incoming power-up aimed at you, then loses a charge |

**Bags are private.** What a player is carrying, how many dice they have,
and where their landmines are armed never render on anyone else's page.
You find out someone was holding a Shield only when it blocks your hit —
that's a deliberate design choice, not a missing feature.

## Why Apps Script

No OAuth client, no server of our own, no database to run. Identity comes
from `Session.getActiveUser()`, and the Google Sheet bound to the project
*is* the database. The trade-off: Apps Script has a 6-minute execution cap,
and Sheets is a weak datastore under concurrent writes, so every write goes
through a single script-wide lock rather than relying on the datastore for
atomicity. Fine for a team rolling once a day; don't expect it to scale
much past 20 players.

See [`apps-script/README.md`](apps-script/README.md) for the full
architecture writeup (access control, identity, the private-data
invariants, admin tasks).

## Repo map

- [`apps-script/`](apps-script/README.md) — the game itself: the Apps
  Script project bound to the Sheet.
- [`docs/design/`](docs/design/) — the original design handoff (historical
  reference, not app code — it specs an interaction model that changed
  before implementation; see the note at the top of that folder's README).
- [`DEPLOY.md`](DEPLOY.md) — step-by-step first-deploy checklist.

## Deploying

Start with [`DEPLOY.md`](DEPLOY.md). You'll need a Google Workspace domain
of your own — access is restricted to members of one domain, and there is
no public or unauthenticated view.

## License

[MIT](LICENSE)
