# Handoff: Ladderboard

> **Note on what actually shipped:** this handoff specs a Slack-bot
> interaction model (`/roll`, `/use`, `/bag`, a read-only web page with "not
> a single button on it"). The implementation in [`../../apps-script/`](../../apps-script/)
> has no Slack integration — it's a Google Apps Script web app where players
> roll and use items via in-page controls (`google.script.run`, see
> `apps-script/RenderConsole.gs`). The **visual design below is still
> authoritative** (board layout, colors, typography, the standings/feed
> regions, the privacy rules around inventories); only the "Slack is the
> button" interaction model described here did not carry over.

## Overview

Ladderboard is a season-long, async snakes-and-ladders game for a distributed 5–20 person work team. All *actions* happen through a Slack bot (`/roll`, `/use`, `/bag`). This handoff covers the **public web board** — a single read-only, unauthenticated page where the team watches the season unfold — plus the four Slack bot messages that carry the action experience.

The web page is the product's personality. Slack is the button.

**Hard constraints baked into these designs:**
- The page has **no login, no accounts, no interactive controls**. It is a scoreboard, not a console. There is not a single button on it that does anything.
- The page is **read-only and may be a few minutes stale**. It renders from a JSON blob (or Sheet) the bot writes. No websockets, no polling UI, no "live" indicator beyond a passive "updated 2 min ago" stamp.
- **Bags are private.** The board never reveals what any player is holding. This is a deliberate reversal of an earlier spec: seeing that someone holds a Pull would let opponents plan around it. You learn a Shield existed only when it blocks your hit.
- **Mobile-first.** The 100-tile board must be readable at 375px wide with no pinch-zoom.

## About the Design Files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, **not production code to copy directly**. They are authored as streaming "Design Components" with all styling inline, which is an authoring convention of the design tool, not a recommendation for your codebase.

Your task is to **recreate these designs in the target codebase's existing environment** (React, Vue, Svelte, Rails views, whatever is already there) using its established patterns, component library, and styling approach. If no environment exists yet, pick the framework that best fits — this page is static enough that a server-rendered template or a small static-site build is entirely reasonable; it does not need a SPA.

Read the HTML for exact values, but implement idiomatically.

## Fidelity

**High-fidelity.** Colors, typography, spacing, and layout are final. Recreate the UI to match, using your codebase's existing primitives where they exist. Two caveats:

- Player colors are authored in `oklch()`. Hex equivalents are listed under Design Tokens; use whichever your stack supports.
- The connector lines (shortcut/setback links drawn over the grid) are an SVG overlay with a `0 0 10 10` viewBox mapped to the tile grid. That math is described below and is worth porting carefully.

---

## Screens / Views

### 1. Board page (the entire product)

**File:** `Ladderboard.dc.html`

**Purpose:** A team member opens this once or twice a day, scans for their own name, sees who moved and who got hit, and closes it. Target dwell time: 20 seconds.

**Page shell**
- Background `#EDE4D4`, text `#241F1A`, font `'Instrument Sans'`.
- `max-width: 1240px`, centered, `padding: 14px`, vertical flex, `gap: 14px`.
- `text-wrap: pretty` on the root.

**Responsive strategy: there is no breakpoint.** The three content regions live in one `display: flex; flex-wrap: wrap; gap: 14px` row. The board is `flex: 1 1 360px; min-width: 296px`, standings is `flex: 1 1 300px; min-width: 280px`, and the feed is `flex: 1 1 100%`. Below ~700px the board and standings can no longer sit side by side and stack naturally; above it they pair up and the feed spans full width. Do not write media queries for this — the wrap does the work, and it degrades correctly at every intermediate width.

---

#### Region A — Season header

Dark slab: background `#241F1A`, color `#FBF6EC`, `border-radius: 12px`, `padding: 16px 16px 14px`, flex column `gap: 12px`.

Top row (`flex-wrap: wrap`, `justify-content: space-between`, `align-items: flex-end`):
- Eyebrow: "SEASON 1" — Space Mono, 10px, `letter-spacing: 0.18em`, uppercase, `#C8A15E`.
- Title: season name — Bricolage Grotesque 800, 30px, `line-height: 1.02`, `letter-spacing: -0.02em`. Default copy: "The Long Climb".
- Two pills, Space Mono 11px/700, `letter-spacing: 0.06em`, `white-space: nowrap`, `border-radius: 999px`, `padding: 5px 10px`:
  - "DAY 12 / 30" — solid `#FBF6EC` bg, `#241F1A` text.
  - "18 DAYS LEFT" — transparent, `1px solid #5B534A`, `#E4D9C4` text.

Progress bar: 6px tall, `border-radius: 999px`, track `#433B32`, fill `#C8A15E` at `width: 40%` (day 12/30 ≈ 40%; drops to 3% in the empty state so it reads as "started" rather than "broken").

Leader strip: background `#332C25`, `border-radius: 8px`, `padding: 8px 10px`, flex row `gap: 10px`. Label "LEADING" in Space Mono 10px `letter-spacing: 0.16em` `#A29683`; value in 15px/700 — "Priya · tile 47". In the empty state the whole value becomes "Nobody has rolled yet."

---

#### Region B — The board

Card: `#FBF6EC`, `2px solid #241F1A`, `border-radius: 12px`, `box-shadow: 4px 4px 0 rgba(36,31,26,0.16)`, `padding: 10px`, flex column `gap: 8px`. (This card treatment — cream fill, hard black border, hard offset shadow, no blur — is the primary surface style and repeats on standings and feed.)

Header row: "The Board" (Bricolage 800, 15px) left, "100 TILES" (Space Mono 10px, `#6E645A`) right.

**Grid:** `display: grid; grid-template-columns: repeat(10, 1fr); gap: 3px; aspect-ratio: 1 / 1`, `position: relative` (the SVG overlay absolutely positions into it).

**Boustrophedon ordering.** Tile 1 is bottom-left; tile 100 is top-left. Emit rows from row index 9 down to 0. For row `r`, the base numbers are `r*10 + 1 … r*10 + 10`; **reverse that array when `r` is odd**. This yields the standard serpentine board in normal DOM order, so no grid-placement math is needed.

**Tile:** `position: relative`, `aspect-ratio: 1/1`, `border-radius: 4px`, `overflow: visible`. Default border `1px solid rgba(36,31,26,0.10)`. Base fill alternates by row for a subtle checker: even row `#FFFDF7`, odd row `#F7F1E4`.

Number label: absolutely positioned `top: 1px; left: 3px`, Space Mono 8px, `line-height: 1`, `#8E8378`. It sits in the corner so it never fights the tokens, which sit bottom-center.

Glyph: absolutely positioned, `inset: 0`, flex-centered, 10px, `line-height: 1`.

**Tile types** (mutually exclusive — see Game Rules; no tile is ever two things at once):

| Type | Fill | Border | Glyph | Glyph color |
|---|---|---|---|---|
| Plain (even row) | `#FFFDF7` | `rgba(36,31,26,0.10)` | — | — |
| Plain (odd row) | `#F7F1E4` | `rgba(36,31,26,0.10)` | — | — |
| Power-up | `#FBEFD2` | default | `◆` | `#B4791A` |
| Shortcut foot | `#DCF0E1` | `rgba(47,125,79,0.45)` | `▲` | `#2F7D4F` |
| Shortcut top | `#E9F4EB` | default | — | — |
| Setback head | `#F9DED4` | `rgba(192,68,46,0.45)` | `▼` | `#C0442E` |
| Setback tail | `#FAEDE8` | default | — | — |
| Finish (100) | `#241F1A` | default | `★` | `#C8A15E` |

Note the deliberate asymmetry: **feet and heads are loud** (saturated fill, tinted border, a glyph) because those are the tiles that *do* something when you land on them. **Tops and tails are quiet** (pale tint, no glyph) because they are only destinations. At 375px this is what keeps the board from turning into confetti.

**Connector overlay:** an `<svg viewBox="0 0 10 10" preserveAspectRatio="none">` absolutely positioned at `inset: 0`, `width/height: 100%`, `pointer-events: none`. One `<line>` per shortcut and setback, `stroke-width: 0.09`, `stroke-linecap: round`, `opacity: 0.5`. Shortcuts `#2F7D4F` with `stroke-dasharray="0.28 0.16"`; setbacks `#C0442E` solid.

Tile center for tile `n`, in viewBox units:
```js
const idx = n - 1;
const row = Math.floor(idx / 10);
const c   = idx % 10;
const col = row % 2 === 0 ? c : 9 - c;
return { x: col + 0.5, y: 9 - row + 0.5 };
```
This ignores the 3px grid gap, which is visually negligible at these stroke widths. The overlay is behind a `showConnectors` flag — see Open Questions.

**Player tokens on tiles:** absolutely positioned strip at `bottom: 1px; left: 0; right: 0`, `display: flex; justify-content: center; align-items: flex-end`. Tokens are 17px circles with `margin-left: -4px` so they fan and overlap slightly. **A maximum of two tokens render per tile**; any remainder collapses into a `+n` pill (Space Mono 8px/700, `#241F1A` bg, `#FBF6EC` text, `border-radius: 999px`, `padding: 1px 3px`, `margin-left: 1px`). This cap is the thing that keeps a 33px tile legible when four people pile up — do not raise it without retesting at 375px.

**Start rail** (below the grid, always present): `2px dashed #C9BCA6`, `border-radius: 8px`, `padding: 7px 9px`, `min-height: 34px`, flex row `gap: 9px`. Label "START" (Space Mono 9px, `letter-spacing: 0.14em`, `#6E645A`), then a wrapping token row (20px tokens in the empty state), then an italic 12px `#6E645A` note: "All 8 players at the start line." / "Everyone is on the board."

**Legend:** wrapping flex, `gap: 4px 10px`. Each item is an 11px `border-radius: 3px` swatch + a Space Mono 9px `#5C5349` `white-space: nowrap` label. Four entries: SHORTCUT, SETBACK, POWER-UP, FINISH.

---

#### Region C — Standings

Same card treatment, `padding: 12px`, flex column `gap: 10px`.

Header: "Standings" (Bricolage 800, 15px) / "BAGS ARE PRIVATE" (Space Mono 10px, `#6E645A`).

Privacy note directly below: 11px, `line-height: 1.35`, `#7A705F`, background `#F4EDDF`, `border-radius: 7px`, `padding: 7px 9px`, `margin-top: -3px`. Copy: "Nobody can see what anyone is holding. You find out someone had a Shield when it stops your hit. Check your own bag in Slack with `/bag`." The inline `/bag` is Space Mono on `#E7DFCF`, `padding: 1px 4px`, `border-radius: 3px`. This note is load-bearing: without it the absence of inventory reads as missing data rather than a rule.

**Row:** flex, `align-items: center`, `gap: 9px`, `padding: 8px 9px`, `border-radius: 8px`, background `#FFFDF7`, border `1px solid rgba(36,31,26,0.10)`. Stunned rows: background `#F3E7E2`, border `1px solid rgba(192,68,46,0.35)`.

- **Rank:** Space Mono 13px/700, `width: 20px`, right-aligned, `#8E8378`. Ties get a `T` prefix ("T2") and share the same number; the next distinct tile resumes at the positional index, so T2/T2/T2 is followed by 5.
- **Avatar:** 30px circle, player color fill, `#FFF9EE` initials in Space Mono 12px/700, `border: 2px solid rgba(36,31,26,0.18)`, `box-sizing: border-box`. Stunned: `2px dashed #241F1A` + `filter: grayscale(0.5)`.
- **Name:** 14px/700, `line-height: 1.1`.
- **Status badge** (only when stunned): Space Mono 8px/700, `letter-spacing: 0.08em`, `#C0442E` bg, `#FFF6F2` text, `border-radius: 999px`, `padding: 2px 6px`. Copy: "STUNNED · NO DIE TOMORROW".
- **Last-seen line:** 11px, `line-height: 1.25`, `#7A705F`, single line with `text-overflow: ellipsis`. This replaced the public inventory chips. Examples: "Pulled back 6 by Dev, 2h ago", "Hit a power-up tile, 4h ago", "Took the shortcut from 20, 6h ago". Never names an item.
- **Right column, right-aligned:** tile number in Space Mono 16px/700 `line-height: 1`, and beneath it the daily delta in Space Mono 9px, `white-space: nowrap` — `#2F7D4F` when positive ("+6 today"), `#8E8378` when zero ("0 today") or on day one ("day 1").

Sort: `tile` descending, then name A–Z as a stable tiebreak.

---

#### Region D — Activity feed

Same card treatment, full width, `padding: 12px`, flex column `gap: 10px`. Header: "Activity" / "NEWEST FIRST" (or "NO ACTIONS YET").

This region gets real weight — it is the reason anyone opens the page twice. It is never a sidebar.

**Entry:** flex, `align-items: flex-start`, `gap: 9px`, `padding: 9px 10px 9px 12px`, `border-radius: 8px`, `position: relative`, `overflow: hidden`, background `#FFFDF7`, border `1px solid rgba(36,31,26,0.09)`. Entries are separated by a `gap: 5px` flex column, not dividers.

- **Type rail:** absolutely positioned `left: 0; top: 0; bottom: 0`, `width: 4px`, colored by entry type. This is the primary type signal — it is unmissable when scanning and costs no vertical space.
- **Avatar:** 26px circle, player color, Space Mono 11px/700 initials. System entries (daily reset) use `#D8CCB8` fill, `#5C5349` text, and a `◷` glyph instead of initials.
- **Text:** 13px, `line-height: 1.32`, weight 500, `#241F1A`.
- **Meta row:** type label (Space Mono 9px/700, `letter-spacing: 0.1em`, rail color) + relative timestamp (Space Mono 10px, `#8E8378`), `gap: 7px`.

**Five entry types** (plus system reset):

| Type | Label | Rail color | Treatment |
|---|---|---|---|
| roll | ROLL | `#6E645A` | Default |
| ladder | SHORTCUT | `#2F7D4F` | Default |
| snake | SETBACK | `#C0442E` | Default |
| pickup | PICKUP | `#B4791A` | Default |
| use | POWER-UP | `#7A34A8` | **Loud**: background `#F3EBFA`, border `rgba(122,52,168,0.28)`, text 14px/700 |
| reset | RESET | `#8E8378` | Default, system avatar |

Only the `use` variant escalates. Everything else differs by rail color and label alone. Given that a player can burn three or four power-ups in a row, a louder treatment on more types would make the feed unreadable — the restraint is intentional.

Footer when there are more than 50 entries: centered Space Mono 10px, `letter-spacing: 0.1em`, `#6E645A`, `border-top: 1px dashed #D8CCB8`, `padding-top: 9px`. Copy: "SHOWING LAST 50 OF 214 ACTIONS".

Page footer: centered Space Mono 10px `#8E8378` — "READ-ONLY BOARD · ACT IN SLACK · UPDATED 2 MIN AGO".

---

### 2. Board page — day-one empty state

Same component, `emptyState` flag on. First impression for the whole team on launch day, so it must look deliberate rather than unpopulated.

- All players sit at tile 0; the **start rail** below the grid holds every token at 20px, wrapping.
- **The board itself is fully drawn** — shortcuts, setbacks and power-up tiles are the content on day one. Nothing is greyed out or skeletonized.
- Header: "DAY 1 / 30", "29 DAYS LEFT", progress fill 3%, leader slot reads "Nobody has rolled yet."
- Standings render all players with tile `—` and delta "day 1", ranks tied.
- Feed replaces its list with a bordered empty block: `2px dashed #C9BCA6`, `border-radius: 10px`, `padding: 28px 14px`, centered. Headline "The season starts here." (Bricolage 800, 18px), subline 13px `#6E645A` — "Type `/roll` in #ladderboard to open Day 1."
- Feed meta reads "NO ACTIONS YET"; the "last 50" footer is suppressed.

**Loading state (not mocked, please implement):** the board should skeleton in rather than pop — render the grid and tile types immediately (they are static per season and can ship in the initial payload), then fill tokens, standings and feed when data resolves. The grid is the slowest thing to paint and the least dynamic; treating it as chrome rather than data is the right call.

---

### 3. Slack bot messages

**File:** `Ladderboard Slack Cards.dc.html`

These are mocks of Slack Block Kit messages, drawn in the product's visual language so the two surfaces feel like one product. **Implement them as real Block Kit payloads** — do not try to reproduce this styling in Slack, which cannot do it. What transfers is the *content structure, hierarchy and copy*, not the borders and fills.

Shared frame in the mock: white card, `2px solid #241F1A`, `border-radius: 12px`, `4px 4px 0` shadow, `padding: 13px 14px`. App avatar is a 34px `border-radius: 8px` `#241F1A` square with a `#C8A15E` Bricolage "L". Header row: "Ladderboard" 14px/700, an "APP" chip (`#E3E3E6` bg, `#4A4A50`), and a timestamp.

**Card 1 — Roll result (in-channel).** Headline "Michael rolled a 5." (Bricolage 800, 19px). Body names the outcome. Movement strip: `#FBF6EC` bg, `1px solid rgba(36,31,26,0.14)`, `border-radius: 8px`, `padding: 8px 10px` — a 26px die chip (`#241F1A`, `border-radius: 6px`, white numeral), then `36` → `41` in Space Mono 15px/700 (destination tinted by outcome: `#B4791A` power-up, `#C0442E` setback, `#2F7D4F` shortcut), then a right-aligned outcome chip ("POWER-UP TILE"). Actions: "View the board" (primary, `#241F1A`) + "Roll again (1 die left)" (secondary).
  - **Privacy note:** the channel post says a power-up tile was hit. It **names the item to the roller only** — the item name in the body copy is fine here because this message is the roller's own result, but if your Block Kit implementation posts this in-channel, move the item name into an ephemeral follow-up. The channel must not learn what anyone holds.

**Card 2 — Power-up used (in-channel).** The loud one. Headline "Dev used PULL on Priya." at 22px in `#5A2A80`. Die slot shows `⚡` on `#7A34A8`. Movement `53 → 47` with the destination in `#C0442E`; outcome chip "DRAGGED BACK 6". Single action: "Watch it on the board". Public and celebratory for the actor — the effect is visible on the board anyway, so there is nothing to hide.

**Card 3 — You got hit (DM).** Calm, not gloating; it arrives while they are asleep. Headline "Sam stunned you." Body leads with the consequence and immediately bounds it: "You will not get your free die at tomorrow's reset. Nothing else changes — you keep your tile and your bag." Then a "YOU STILL HAVE" list of item chips with one-line descriptions — this is a DM, so naming items is safe. Actions: "Use a die now" (primary) + "Open the board".

**Card 4 — Inventory (ephemeral).** The **only** surface in the entire product that names what a player holds. Headline "Your bag — tile 41, rank T2." Body opens with "Only you can see this." Lists chips with counts and one-line effect descriptions, then a `/use pull @priya` command hint and an "Only visible to you" footnote.

**Item chip** (Slack cards only): Space Mono 10px/700, `letter-spacing: 0.06em`, `border-radius: 5px`, `padding: 3px 7px`, `1px solid <fg>33`. Colors under Design Tokens.

---

## Interactions & Behavior

**The web page has none.** No click handlers, no navigation, no hover states, no forms, no filters, no tooltips. Every element is static. If you find yourself adding a button, re-read the scope.

The only behaviors to implement:
- **Responsive reflow** via flex-wrap, as described. No media queries needed.
- **Feed cap** at 50 entries with a static count line. If you want an expand control, that is a scope change — ask first.
- **Staleness stamp** in the footer, computed from the payload's write timestamp.
- **Relative timestamps** ("2h ago", "Yesterday"). Compute server-side or at render; there is no live ticking.
- **Loading**: grid paints first, data fills in. No spinner.

Slack side owns everything interactive: `/roll`, `/use <item> @target`, `/bag`. The bot holds all game rules and is the only write path.

---

## State Management

The page is a **pure function of one JSON document**. There is no client state, no store, no fetching beyond the initial load. Suggested shape:

```json
{
  "updatedAt": "2026-09-04T11:04:00Z",
  "season": {
    "name": "The Long Climb",
    "day": 12,
    "totalDays": 30,
    "daysLeft": 18,
    "shortcuts": { "4": 22, "9": 31, "20": 39, "28": 55, "51": 72, "63": 81, "71": 91 },
    "setbacks":  { "17": 7, "44": 36, "54": 33, "62": 19, "87": 24, "93": 68, "98": 79 },
    "powerUpTiles": [3,6,11,12,14,25,29,34,37,41,45,48,52,57,60,66,70,74,78,83,88,95]
  },
  "players": [
    { "id": "priya", "name": "Priya", "initials": "PR", "color": "oklch(0.60 0.17 25)",
      "tile": 47, "delta": 6, "stunned": false,
      "lastSeen": "Pulled back 6 by Dev, 2h ago" }
  ],
  "feed": [
    { "t": "2h ago", "who": "dev", "kind": "use",
      "text": "Dev used PULL on Priya. Priya fell from 53 to 47." }
  ]
}
```

**The payload must not contain inventories.** Enforce privacy at the serialization boundary, not in the view — if items are in the JSON, they are public, because the page is public and anyone can read its source. `lastSeen` strings are pre-rendered by the bot so the page never has to reason about game events.

Ranks, tie detection, tile fills, connector geometry and token stacking are all derived at render from the above.

---

## Game Rules That Shape the UI

- Everyone receives one free die at the daily reset, unless stunned.
- Power-ups are acquired **only** by landing on a power-up tile.
- Power-ups can be used any time, in any quantity, as long as the player holds them. **Bursts of three or four in a row are possible and the feed must handle that gracefully** — this is why only one entry type escalates visually.
- Board is 100 tiles. 22 are power-up tiles (in the 20–25 band the brief calls for), so players acquire something roughly every few days.
- **No tile is ever two things at once.** Shortcut feet, shortcut tops, setback heads, setback tails and power-up tiles are mutually exclusive sets. Validate this when authoring a season layout — an overlap makes the tile's meaning ambiguous and the resolution order arbitrary. The current layout was re-cut to satisfy this (tile 38 was previously both a shortcut top and a setback landing).
- **Naming:** the game does not use the words "snake" or "ladder" anywhere in the UI. Ladders are **shortcuts**, snakes are **setbacks**. Keep this consistent in bot copy too.

**Item effects:**

| Item | Effect |
|---|---|
| Extra die | One additional roll, usable any time |
| Stun | Target gets no free die on their next daily grant |
| Pull | Drag a target back 4–8 tiles |
| Warp | Move yourself to any tile within 10 of your current position |
| Shield | Blocks the next incoming power-up aimed at you, then is consumed |

---

## Design Tokens

**Surfaces**
| Token | Hex | Use |
|---|---|---|
| Page background | `#EDE4D4` | Body |
| Card | `#FBF6EC` | All three region cards |
| Tile, even row | `#FFFDF7` | Also standings/feed row fill |
| Tile, odd row | `#F7F1E4` | Checker alternate |
| Ink | `#241F1A` | Text, borders, header slab |
| Header slab inset | `#332C25` | Leader strip |
| Progress track | `#433B32` | |
| Dashed border | `#C9BCA6` | Start rail, empty state |
| Divider dashed | `#D8CCB8` | Feed footer, card 4 rows |
| Privacy note bg | `#F4EDDF` | |
| Inline code bg | `#E7DFCF` | |

**Text**
| Token | Hex |
|---|---|
| Primary | `#241F1A` |
| Body secondary | `#4A423A` |
| Muted | `#5C5349` |
| Muted 2 | `#6E645A` |
| Muted 3 | `#7A705F` |
| Faint | `#8E8378` |
| Faintest | `#A29683` |
| On dark | `#FBF6EC` / `#E4D9C4` |
| On color | `#FFF9EE` |

**Semantic**
| Token | Hex | Tint |
|---|---|---|
| Gold (season, power-up) | `#C8A15E` / `#B4791A` | `#FBEFD2` |
| Green (shortcut) | `#2F7D4F` | `#DCF0E1` / `#E9F4EB` |
| Red (setback, stun) | `#C0442E` | `#F9DED4` / `#FAEDE8` / `#F3E7E2` |
| Purple (power-up use) | `#7A34A8` / `#5A2A80` | `#F3EBFA` / `#F0E4FA` |

**Item chip colors (Slack cards only)**
| Item | fg | bg |
|---|---|---|
| Extra die | `#2F5B7D` | `#DDEAF3` |
| Stun | `#8A2E6A` | `#F5DFEE` |
| Pull | `#B0451F` | `#FAE0D3` |
| Warp | `#5A3FA0` | `#E6E0F7` |
| Shield | `#2F7D4F` | `#DDF0E2` |

**Player colors.** Authored in oklch at a fixed lightness/chroma band so all eight read at equal weight against cream and none dominates. Approximate hex in parentheses.

| Player | oklch | ≈ hex |
|---|---|---|
| Priya | `oklch(0.60 0.17 25)` | `#C4553F` |
| Michael | `oklch(0.55 0.16 255)` | `#4470B8` |
| Dev | `oklch(0.55 0.15 150)` | `#2C8259` |
| Ana | `oklch(0.60 0.17 350)` | `#C2508A` |
| Tom | `oklch(0.60 0.16 65)` | `#9C6B1E` |
| Luis | `oklch(0.55 0.13 115)` | `#6B7A22` |
| Jenny | `oklch(0.55 0.17 310)` | `#8B4CB8` |
| Sam | `oklch(0.58 0.13 195)` | `#1D7F91` |

To extend past 8 players, keep L and C fixed and walk the hue wheel in even steps. **Colour is never the only identity signal** — initials are always present on every token, which is what makes 20 players workable.

**Typography**
| Role | Family | Sizes |
|---|---|---|
| Display | Bricolage Grotesque 800 | 30 / 22 / 19 / 18 / 17 / 15 |
| Body | Instrument Sans 400–700 | 15 / 14 / 13 / 12 / 11 |
| Numeric & label | Space Mono 400/700 | 16 / 15 / 13 / 11 / 10 / 9 / 8 |

Space Mono carries every number and every uppercase micro-label; it is the spine of the whole design. Tracking on uppercase mono labels runs `0.06em`–`0.2em`, looser as the size drops.

**Spacing:** 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 22, 28 px. Card gaps 14px, intra-card gaps 8–10px, list gaps 5–6px.

**Radius:** 3 (swatch) / 4 (tile, small chip) / 5–6 (item chip, die, button) / 7–8 (rows, insets) / 10–12 (cards) / 999 (pills, tokens).

**Shadow:** exactly one — `4px 4px 0 rgba(36,31,26,0.16)`. Hard offset, zero blur. No other elevation exists in this design; tokens get a `0 1px 0 rgba(36,31,26,0.35)` hairline only.

---

## Assets

**None.** No images, no icon library, no SVG illustrations. Every mark in the design is either a typographic glyph (`◆ ▲ ▼ ★ ⚡ ◷ →`) or a CSS shape. Avatars are initials on colored circles — if you later add real Slack profile images, keep the initials as the fallback and keep the status ring, since identity must not depend on the image loading.

Fonts load from Google Fonts: Bricolage Grotesque (600, 800), Instrument Sans (400, 500, 600, 700), Space Mono (400, 700). Self-host these in production.

---

## Files

| File | Contents |
|---|---|
| `Ladderboard.dc.html` | The board page — all four regions, both populated and empty states. The primary reference. |
| `Ladderboard Slack Cards.dc.html` | The four bot messages. |
| `Ladderboard Handoff.dc.html` | Presentation canvas showing the above at 375px, 375px empty, 1180px desktop, and the Slack set. Reference only — not a screen. |
| `support.js` | Runtime for the design-tool format. **Not part of the design.** Do not port it. |

Each design file has a small logic class at the bottom holding the sample data and the derived-value computation (tile typing, rank/tie logic, connector geometry, token stacking). That logic is the clearest specification of the rules and is worth reading before you start.

The board page exposes three flags used to produce the states: `emptyState` (day-one), `showConnectors` (see below), `seasonName`.

---

## Open Questions

1. **Connector lines.** They are on by default but genuinely debatable at 375px — tile fill plus the ▲/▼ glyph already carries the shortcut/setback read, and the lines are the noisiest element on the board. Toggle `showConnectors` and judge for yourself. If you ship them off, keep the flag; on desktop they help.
2. **Shield** was added during design, not requested in the original brief. It exists so being targeted is not purely passive. Cut it if the game should be more brutal — it touches the item chips in Slack cards 3 and 4 only, since the board no longer shows items at all.
3. **No same-target-twice-in-a-row rule.** Unlimited power-up use plus no targeting limit means one player can be hit repeatedly. The feed handles the bursts visually, but the game may not handle them socially. Worth watching in week one.
4. **Feed pagination.** Currently capped at 50 with a static count. Whether that needs a real expand depends on how loud the team turns out to be.
5. **Season length.** 100 tiles at one die/day and an average roll of 3.5 is roughly a 30-day season. Change board size to change season length; the grid is hardcoded at 10×10 and would need work to become variable.
