# Deploying Ladderboard

A step-by-step checklist for the first deploy: the Google Sheet + Apps
Script game. Assumes nothing — follow it top to bottom.

For *why* things are structured this way (no OAuth, Sheets instead of a
database), see [apps-script/README.md](apps-script/README.md). This file is
the checklist; that one is the explanation.

## Part 1 — Create the Google Sheet

Create a new Google Sheet in your Workspace account. A shared team account
(not a single person's personal account) works well, so ownership doesn't
disappear when someone leaves.

## Part 2 — Get the code into Apps Script

In the Sheet: **Extensions → Apps Script**.

**Option A — clasp (recommended):**

1. `npm install -g @google/clasp`, then `clasp login`.
2. One-time: enable the Apps Script API at
   https://script.google.com/home/usersettings — `clasp push` fails with a
   permissions error until you do this. It's easy to miss since nothing in
   the CLI points at it.
3. In the Apps Script editor: ⚙️ **Project Settings** → copy the **Script
   ID**.
4. From this repo's `apps-script/` folder: `cp .clasp.json.example
   .clasp.json`, then paste the script ID in. (`.clasp.json` is gitignored
   — it identifies your specific script, not something to commit.)
5. `clasp push` from `apps-script/`.

**Option B — manual copy/paste:**

1. Delete the placeholder `Code.gs` the editor creates for you.
2. Create a new file for each `.gs` file in `apps-script/`, matching the
   name exactly, and paste its contents in.
3. In the editor: ⚙️ **Project Settings** → check "Show `appsscript.json`
   manifest file in editor" → paste in the contents of
   `apps-script/appsscript.json`.

## Part 3 — Configure

Edit these in the Apps Script editor (or locally + `clasp push`) before
deploying — all four ship with placeholder values:

| Setting | File | Ships as | Set it to |
|---|---|---|---|
| `TEAM_DOMAIN` | [Config.gs:13](apps-script/Config.gs#L13) | `'example.com'` | your Workspace domain |
| `SEASON_STARTED_AT_` | [Config.gs:30](apps-script/Config.gs#L30) | a placeholder date | when the season should start |
| `DEFAULT_SEASON` | [Config.gs:18](apps-script/Config.gs#L18) | 30-day / 100-tile default | optional — only if you want a different board |
| `timeZone` | [appsscript.json](apps-script/appsscript.json#L2) | `Etc/UTC` | see note below |

**On timezone:** the daily reset's game-day math
([Repo.gs:18-22](apps-script/Repo.gs#L18)) is pure UTC arithmetic against
`SEASON_STARTED_AT_` and does not read `timeZone` at all — the reset always
lands at **00:00 UTC**, regardless of what you set here. `timeZone` only
affects how dates render in logs. If your team is not near UTC, account for
this when picking `SEASON_STARTED_AT_` and when explaining to players when
their daily die shows up (00:00 UTC = 07:00 ICT, for example).

## Part 4 — Run setup

In the editor, select `setup` from the function dropdown next to ▶ Run, and
run it.

- First run prompts an OAuth consent screen (it needs to read/write this
  spreadsheet) — approve it.
- This validates the board layout in `DEFAULT_SEASON`, the power-up tuning
  in `POWERUP_`, and creates six sheet tabs from `SHEET_SCHEMA_`
  ([Sheets.gs:5](apps-script/Sheets.gs#L5)): `Players`, `Inventories`,
  `Dice`, `Actions`, `DailyGrants`, `Mines`. The default `Sheet1` tab is
  deleted.
- `Inventories`, `Dice`, and `Mines` are the private tabs — they hold what
  each player is carrying and where their landmines are armed, which
  nobody else's page should ever render (see `buildBaseView_` in
  `Views.gs`). Everything else is fine to glance at.
- **Don't hand-edit these tabs while the app is live.** All writes go
  through a script-wide lock (`withLock_`); a manual cell edit isn't
  covered by it and can race a concurrent roll.

After this, reopen the Sheet — a **Ladderboard Admin** menu appears with
the same setup action plus player/admin tools (see
[apps-script/README.md](apps-script/README.md#admin-tasks)).

## Part 5 — Deploy the web app

**Deploy → New deployment**:

- Type: **Web app**
- Execute as: **User accessing the web app**
- Who has access: **Anyone within [your domain]**

Deploy, and copy the `/exec` URL. Open it — first visit auto-enrolls you as
a player and prompts for a nickname. Share the URL with your team once
you're through Part 6's checks.

## Part 6 — Verify end to end

- [ ] Open the deployed URL → auto-enrolled → prompted for a nickname →
      pick one → roll once.
- [ ] The Sheet's `Players`/`Actions` tabs show your row/roll.
- [ ] Open the same URL signed into an account outside `TEAM_DOMAIN` (or an
      incognito window without your Workspace account) → confirm you get
      the "This board is only for `<domain>`" message, not the board.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Page says "Not set up yet" | `setup()` hasn't been run | Run it from the editor (Part 4) |
| "The board is busy — try again in a moment." | `withLock_`'s 30s lock timeout hit (rare — a human mid-roll) | Retry in a few seconds |
| "This board is only for `<domain>`. You are signed in as …" | `TEAM_DOMAIN` unset/wrong, or you're signed into the wrong account | Fix `TEAM_DOMAIN` (Part 3) and redeploy, or switch accounts |

## Updating after the first deploy

Editing files (via `clasp push` or the web editor) does **not** update the
live URL. To ship a change: **Deploy → Manage deployments → ✎ edit → New
version → Deploy**. Creating a brand-new deployment instead mints a new URL
and silently orphans whatever points at the old one (e.g. a teammate's
bookmark).

For day-to-day admin tasks (granting items, starting a new season, resetting
display names), see
[apps-script/README.md's "Admin tasks"](apps-script/README.md#admin-tasks).
