// Page CSS, embedded as a string so RenderPage.gs can inline it in a
// <style> tag. Apps Script web apps don't serve arbitrary static files at a
// path, so inlining is the simplest way to ship CSS with the page.
//
// Plus a few small additions (marked below) for controls the original didn't
// need: the "rename" affordance (Session.getActiveUser() gives no display
// name) and the identity strip that replaces the login/logout auth bar
// (there's no login step here — Workspace domain access gates the whole
// deployment, see Config.gs).

var STYLE_CSS_ = `
:root {
  /* surfaces */
  --page-bg: #EDE4D4;
  --card: #FBF6EC;
  --tile-even: #FFFDF7;
  --tile-odd: #F7F1E4;
  --ink: #241F1A;
  --slab-inset: #332C25;
  --progress-track: #433B32;
  --dashed-border: #C9BCA6;
  --divider-dashed: #D8CCB8;
  --privacy-bg: #F4EDDF;
  --inline-code-bg: #E7DFCF;

  /* text */
  --text-primary: #241F1A;
  --text-secondary: #4A423A;
  --text-muted: #5C5349;
  --text-muted-2: #6E645A;
  --text-muted-3: #7A705F;
  --text-faint: #8E8378;
  --text-faintest: #A29683;
  --on-dark: #FBF6EC;
  --on-dark-2: #E4D9C4;
  --on-color: #FFF9EE;

  /* semantic */
  --gold: #C8A15E;
  --gold-strong: #B4791A;
  --gold-tint: #FBEFD2;
  --green: #2F7D4F;
  --green-tint: #DCF0E1;
  --green-tint-2: #E9F4EB;
  --red: #C0442E;
  --red-tint: #F9DED4;
  --red-tint-2: #FAEDE8;
  --red-tint-3: #F3E7E2;
  --purple: #7A34A8;
  --purple-dark: #5A2A80;
  --purple-tint: #F3EBFA;

  --shadow-hard: 4px 4px 0 rgba(36, 31, 26, 0.16);
}

* { box-sizing: border-box; }

html, body { margin: 0; padding: 0; background: var(--page-bg); }

body {
  font-family: 'Instrument Sans', system-ui, sans-serif;
  color: var(--text-primary);
  min-height: 100%;
}

a { color: var(--red); text-decoration: none; }
a:hover { color: #8F2F1F; text-decoration: underline; }

.mono { font-family: 'Space Mono', monospace; }
.display { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; }

.page {
  max-width: 1240px;
  margin: 0 auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  text-wrap: pretty;
}

/* ---------- Region A: season header ---------- */

.header-slab {
  background: var(--ink);
  color: var(--on-dark);
  border-radius: 12px;
  padding: 16px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-top {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
  justify-content: space-between;
}

.header-eyebrow {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--gold);
}

.header-title {
  font-size: 30px;
  line-height: 1.02;
  letter-spacing: -0.02em;
}

.header-pills { display: flex; gap: 6px; align-items: center; }

.pill {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  white-space: nowrap;
  border-radius: 999px;
  padding: 5px 10px;
}
.pill--solid { background: var(--on-dark); color: var(--ink); }
.pill--outline { border: 1px solid #5B534A; color: var(--on-dark-2); }

.progress-track {
  height: 6px;
  border-radius: 999px;
  background: var(--progress-track);
  overflow: hidden;
}
.progress-fill { height: 100%; background: var(--gold); border-radius: 999px; }

.leader-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--slab-inset);
  border-radius: 8px;
  padding: 8px 10px;
}
.leader-label { font-size: 10px; letter-spacing: 0.16em; color: var(--text-faintest); }
.leader-value { font-weight: 700; font-size: 15px; }

/* ---------- shared card treatment (board / standings / feed / console) ---------- */

.card {
  background: var(--card);
  border: 2px solid var(--ink);
  border-radius: 12px;
  box-shadow: var(--shadow-hard);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-header { display: flex; justify-content: space-between; align-items: baseline; }
.card-title { font-size: 15px; letter-spacing: -0.01em; }
.card-eyebrow { font-size: 10px; color: var(--text-muted-2); }

.regions-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; }

/* ---------- Region B: the board ---------- */

.board-card { flex: 1 1 360px; min-width: 296px; padding: 10px; }
.board-card .card-header { padding: 0 2px; }

.board-wrap { position: relative; }

.board-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 3px;
  aspect-ratio: 1 / 1;
}

.tile {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 4px;
  overflow: visible;
  border: 1px solid rgba(36, 31, 26, 0.10);
}
.tile--plain-even { background: var(--tile-even); }
.tile--plain-odd { background: var(--tile-odd); }
.tile--power { background: var(--gold-tint); }
.tile--shortcut-foot { background: var(--green-tint); border-color: rgba(47, 125, 79, 0.45); }
.tile--shortcut-top { background: var(--green-tint-2); }
.tile--setback-head { background: var(--red-tint); border-color: rgba(192, 68, 46, 0.45); }
.tile--setback-tail { background: var(--red-tint-2); }
.tile--finish { background: var(--ink); }

.tile-number {
  position: absolute; top: 1px; left: 3px;
  font-size: 8px; line-height: 1; color: var(--text-faint);
  z-index: 2;
}

.tile-glyph {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; line-height: 1;
}
.tile--power .tile-glyph { color: var(--gold-strong); }
.tile--shortcut-foot .tile-glyph { color: var(--green); }
.tile--setback-head .tile-glyph { color: var(--red); }
.tile--finish .tile-glyph { color: var(--gold); }

.tile-tokens {
  position: absolute; bottom: 1px; left: 0; right: 0;
  display: flex; justify-content: center; align-items: flex-end;
  z-index: 2;
}

.token {
  border-radius: 999px;
  color: var(--on-color);
  font-weight: 700;
  letter-spacing: -0.02em;
  display: flex; align-items: center; justify-content: center;
  flex: 0 0 auto;
  box-shadow: 0 1px 0 rgba(36, 31, 26, 0.35);
  border: 2px solid var(--on-dark);
  box-sizing: border-box;
  margin-left: -4px;
  background: var(--token-color, var(--text-faintest));
}
.token--stunned { border-style: dashed; border-color: var(--ink); filter: grayscale(0.55); }
.token--board { width: 17px; height: 17px; font-size: 8px; }
.token--start { width: 20px; height: 20px; font-size: 9px; }
.token--avatar { width: 30px; height: 30px; font-size: 12px; margin-left: 0; }
.token--feed { width: 26px; height: 26px; font-size: 11px; margin-left: 0; border: none; box-shadow: none; }
.token--console { width: 36px; height: 36px; font-size: 14px; margin-left: 0; }

.tile-more {
  font-size: 8px; font-weight: 700;
  background: var(--ink); color: var(--on-dark);
  border-radius: 999px; padding: 1px 3px; margin-left: 1px;
}

.connector-svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }

.conn-rail { stroke: var(--green); stroke-width: 0.07; stroke-linecap: round; opacity: 0.75; }
.conn-rung { stroke: var(--green); stroke-width: 0.05; stroke-linecap: round; opacity: 0.55; }

.conn-snake-body { fill: none; stroke: var(--red); stroke-width: 0.13; stroke-linecap: round; stroke-linejoin: round; opacity: 0.65; }
.conn-snake-head { fill: var(--red); opacity: 0.85; }
.conn-snake-eye { fill: var(--card); }

.conn--snake { animation: conn-slither 3.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes conn-slither {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  50% { transform: translate(0.03px, 0.02px) rotate(0.4deg); }
}
@media (prefers-reduced-motion: reduce) {
  .conn--snake { animation: none; }
}

/* ---------- roll animation: dice tumble + token hop overlay (Anim.gs) ---------- */

.roll-anim-layer { position: absolute; inset: 0; z-index: 6; pointer-events: none; }

.roll-die {
  position: absolute;
  width: 34px; height: 34px;
  background: var(--card);
  border: 2px solid var(--ink);
  border-radius: 8px;
  box-shadow: var(--shadow-hard);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  padding: 5px;
  gap: 2px;
  transform: translate(-50%, -50%);
}
.roll-die.is-tumbling { animation: roll-die-spin 0.5s linear infinite; }
@keyframes roll-die-spin {
  0% { transform: translate(-50%, -50%) rotate(0deg) scale(1); }
  50% { transform: translate(-50%, -50%) rotate(180deg) scale(1.12); }
  100% { transform: translate(-50%, -50%) rotate(360deg) scale(1); }
}
.roll-die.is-settled { animation: roll-die-pop 0.22s ease-out; }
@keyframes roll-die-pop {
  0% { transform: translate(-50%, -50%) scale(1.35); }
  100% { transform: translate(-50%, -50%) scale(1); }
}

.roll-pip { border-radius: 999px; background: var(--ink); visibility: hidden; }
.roll-die[data-face="1"] .roll-pip:nth-child(5),
.roll-die[data-face="2"] .roll-pip:nth-child(1),
.roll-die[data-face="2"] .roll-pip:nth-child(9),
.roll-die[data-face="3"] .roll-pip:nth-child(1),
.roll-die[data-face="3"] .roll-pip:nth-child(5),
.roll-die[data-face="3"] .roll-pip:nth-child(9),
.roll-die[data-face="4"] .roll-pip:nth-child(1),
.roll-die[data-face="4"] .roll-pip:nth-child(3),
.roll-die[data-face="4"] .roll-pip:nth-child(7),
.roll-die[data-face="4"] .roll-pip:nth-child(9),
.roll-die[data-face="5"] .roll-pip:nth-child(1),
.roll-die[data-face="5"] .roll-pip:nth-child(3),
.roll-die[data-face="5"] .roll-pip:nth-child(5),
.roll-die[data-face="5"] .roll-pip:nth-child(7),
.roll-die[data-face="5"] .roll-pip:nth-child(9),
.roll-die[data-face="6"] .roll-pip:nth-child(1),
.roll-die[data-face="6"] .roll-pip:nth-child(3),
.roll-die[data-face="6"] .roll-pip:nth-child(4),
.roll-die[data-face="6"] .roll-pip:nth-child(6),
.roll-die[data-face="6"] .roll-pip:nth-child(7),
.roll-die[data-face="6"] .roll-pip:nth-child(9) {
  visibility: visible;
}

.roll-hop-token {
  position: absolute;
  transform: translate(-50%, -50%);
  transition: left 0.11s ease-in-out, top 0.11s ease-in-out;
}
.roll-hop-token.is-arcing { transition: left 0.11s ease-in-out, top 0.11s cubic-bezier(.3,-0.4,.7,1.4); }

@media (prefers-reduced-motion: reduce) {
  .roll-die.is-tumbling, .roll-die.is-settled { animation: none; }
  .roll-hop-token, .roll-hop-token.is-arcing { transition: none; }
}

.start-rail {
  border: 2px dashed var(--dashed-border);
  border-radius: 8px;
  padding: 7px 9px;
  display: flex; align-items: center; gap: 9px;
  min-height: 34px;
  flex-wrap: wrap;
}
.start-rail-label { font-size: 9px; letter-spacing: 0.14em; color: var(--text-muted-2); flex: 0 0 auto; }
.start-rail-tokens { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }
.start-rail-note { font-size: 12px; color: var(--text-muted-2); font-style: italic; }

.legend { display: flex; flex-wrap: wrap; gap: 4px 10px; padding: 2px 2px 0; }
.legend-item { display: flex; align-items: center; gap: 5px; }
.legend-swatch { width: 11px; height: 11px; border-radius: 3px; border: 1px solid; }
.legend-shortcut { background: var(--green-tint); border-color: rgba(47, 125, 79, 0.5); }
.legend-setback { background: var(--red-tint); border-color: rgba(192, 68, 46, 0.5); }
.legend-power { background: var(--gold-tint); border-color: rgba(180, 121, 26, 0.5); }
.legend-finish { background: var(--ink); border-color: var(--ink); }
.legend-label { font-size: 9px; letter-spacing: 0.06em; color: var(--text-muted); white-space: nowrap; }

/* ---------- Region C: standings ---------- */

.standings-card { flex: 1 1 300px; min-width: 280px; }

.privacy-note {
  font-size: 11px; line-height: 1.35; color: var(--text-muted-3);
  background: var(--privacy-bg); border-radius: 7px; padding: 7px 9px; margin-top: -3px;
}
.privacy-note code {
  font-family: 'Space Mono', monospace; background: var(--inline-code-bg);
  padding: 1px 4px; border-radius: 3px;
}

.standings-list { display: flex; flex-direction: column; gap: 6px; }

.standings-row {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 9px; border-radius: 8px;
  background: var(--tile-even); border: 1px solid rgba(36, 31, 26, 0.10);
}
.standings-row--stunned { background: var(--red-tint-3); border-color: rgba(192, 68, 46, 0.35); }

.standings-rank { font-size: 13px; font-weight: 700; width: 20px; text-align: right; color: var(--text-faint); }

.standings-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.standings-name-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.standings-name { font-weight: 700; font-size: 14px; line-height: 1.1; }
.standings-badge {
  font-size: 8px; font-weight: 700; letter-spacing: 0.08em;
  background: var(--red); color: #FFF6F2; border-radius: 999px; padding: 2px 6px;
}
.standings-lastseen {
  font-size: 11px; line-height: 1.25; color: var(--text-muted-3);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.standings-right { text-align: right; flex: 0 0 auto; }
.standings-tile { font-size: 16px; font-weight: 700; line-height: 1; }
.standings-delta { font-size: 9px; letter-spacing: 0.02em; white-space: nowrap; color: var(--text-faint); }
.standings-delta--positive { color: var(--green); }

/* ---------- Region D: activity feed ---------- */

.feed-card { flex: 1 1 100%; }

.feed-empty {
  border: 2px dashed var(--dashed-border); border-radius: 10px;
  padding: 28px 14px; text-align: center;
  display: flex; flex-direction: column; gap: 4px;
}
.feed-empty-headline { font-size: 18px; }
.feed-empty-sub { font-size: 13px; color: var(--text-muted-2); }
.feed-empty-sub code {
  font-family: 'Space Mono', monospace; background: #EFE7D9;
  padding: 1px 5px; border-radius: 4px;
}

.feed-list { display: flex; flex-direction: column; gap: 5px; }

.feed-row {
  display: flex; gap: 9px; align-items: flex-start;
  padding: 9px 10px 9px 12px; border-radius: 8px;
  position: relative; overflow: hidden;
  background: var(--tile-even); border: 1px solid rgba(36, 31, 26, 0.09);
}
.feed-row--loud { background: var(--purple-tint); border-color: rgba(122, 52, 168, 0.28); }

.feed-rail { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--rail-color, var(--text-faint)); }

.feed-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.feed-text { font-size: 13px; line-height: 1.32; font-weight: 500; color: var(--text-primary); }
.feed-row--loud .feed-text { font-size: 14px; font-weight: 700; }
.feed-meta-row { display: flex; gap: 7px; align-items: center; }
.feed-kind { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: var(--kind-color, var(--text-faint)); }
.feed-time { font-size: 10px; color: var(--text-faint); }

.feed-footer {
  text-align: center; font-size: 10px; letter-spacing: 0.1em; color: var(--text-muted-2);
  border-top: 1px dashed var(--divider-dashed); padding-top: 9px;
}

/* ---------- console zone (bottom, inverted slab — distinct from the board zone above) ---------- */

.console-zone { display: flex; flex-direction: column; gap: 10px; margin-top: 6px; padding-top: 14px; border-top: 2px solid var(--ink); }

.console-card {
  display: flex; flex-direction: column; gap: 10px;
  background: var(--slab-inset); color: var(--on-dark); border-color: var(--ink);
}

.console-card .card-eyebrow { color: var(--text-faintest); }
.console-card .bag-label { color: var(--text-faintest); }
.console-card .bag-desc { color: var(--on-dark-2); }
.console-card .bag-row { border-top-color: rgba(251, 246, 236, 0.18); }
.console-card .feed-time { color: var(--on-dark-2); }
.console-card .rename-details summary { color: var(--text-faintest); }
.console-card .btn--primary { background: var(--on-dark); color: var(--ink); }
.console-card .onboarding-copy { color: var(--on-dark-2); }

.console-identity { display: flex; align-items: center; gap: 10px; }
.console-identity-body { display: flex; flex-direction: column; gap: 2px; }
.console-identity-name { font-size: 15px; font-weight: 700; }
.console-identity-meta { font-size: 11px; color: var(--text-faintest); }

.console-stunned-banner {
  font-size: 12px; color: var(--red-tint); background: rgba(192, 68, 46, 0.18);
  border: 1px solid rgba(192, 68, 46, 0.35); border-radius: 8px; padding: 7px 9px;
}

.console-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
.console-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.console-drawer-body { display: flex; flex-direction: column; gap: 10px; }
.console-toggle { display: inline-block; }

/* Docked to the bottom of the viewport at every width, not just mobile — the
   drawer keeps it compact, so nobody has to scroll past the board/standings/
   feed just to reach the roll button. */
.console-zone--dock {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
  margin: 0; padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  background: var(--page-bg); border-top: 2px solid var(--ink);
  max-height: 85vh; overflow: hidden;
}
.console-zone--dock > .console-card,
.console-zone--dock > #console-error {
  max-width: 1240px; margin: 0 auto;
}
.console-zone--dock .console-card { border-radius: 12px 12px 0 0; }
.console-zone--dock .console-drawer-body { display: none; }
.console-zone--dock.is-open .console-drawer-body {
  display: flex; max-height: 55vh; overflow-y: auto; -webkit-overflow-scrolling: touch;
}
.page { padding-bottom: calc(var(--console-dock-h, 120px) + 18px); }

.btn {
  font-family: 'Instrument Sans', sans-serif; font-size: 12px; font-weight: 700;
  border-radius: 6px; padding: 7px 12px; border: 1px solid var(--ink);
  cursor: pointer;
}
.btn--primary { background: var(--ink); color: var(--on-dark); }
.btn--secondary { background: var(--card); color: var(--ink); border-color: rgba(36, 31, 26, 0.25); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }

.inline-form { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0; }

select, input[type="number"], input[type="text"] {
  font-family: 'Instrument Sans', sans-serif; font-size: 12px;
  border: 1px solid rgba(36, 31, 26, 0.25); border-radius: 6px;
  padding: 6px 8px; background: var(--card); color: var(--ink);
}

.bag-label { font-size: 9px; letter-spacing: 0.12em; color: var(--text-faint); }
.bag-list { display: flex; flex-direction: column; gap: 5px; }
.bag-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px dashed #E2D8C6; flex-wrap: wrap; }
.bag-desc { font-size: 12px; color: var(--text-muted); flex: 1 1 200px; }

.chip {
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  border-radius: 5px; padding: 3px 7px;
  background: var(--chip-bg, var(--inline-code-bg)); color: var(--chip-fg, var(--text-primary));
  border: 1px solid var(--chip-fg, var(--text-primary));
}

.auth-bar { display: flex; justify-content: flex-end; }
.auth-bar .btn { padding: 6px 10px; font-size: 11px; }

/* ---------- footer ---------- */

.page-footer { text-align: center; font-size: 10px; color: var(--text-faint); padding-bottom: 8px; }

/* ---------- added for the Apps Script edition (not in the original design) ---------- */

.identity-strip { font-size: 11px; color: var(--text-muted-2); }

.rename-details { font-size: 11px; }
.rename-details summary { cursor: pointer; color: var(--text-muted-2); list-style: none; }
.rename-details summary::-webkit-details-marker { display: none; }
.rename-details summary::before { content: '✎ '; }
.rename-details[open] summary { margin-bottom: 6px; }

.console-error {
  font-size: 12px; color: var(--red); background: var(--red-tint-3);
  border: 1px solid rgba(192, 68, 46, 0.35); border-radius: 8px; padding: 7px 9px;
}

.onboarding-copy { font-size: 12px; color: var(--text-muted); line-height: 1.5; margin: 0 0 10px; }
`;
