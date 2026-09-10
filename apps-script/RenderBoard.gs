// Region B - the board: the 10x10 tile grid, the shortcut/setback connector
// overlay, and player token placement.

function token_(t, sizeClass) {
  // t.id is always a plain number when present (never player-supplied
  // text), so raw_() here is safe — see grantItem_/targetControl_
  // (RenderConsole.gs) for the same numeric-id-bypasses-escaping pattern.
  var idAttr = t.id != null ? raw_(' data-player-id="' + t.id + '"') : '';
  return html_`<div class="token ${sizeClass}${t.stunned ? ' token--stunned' : ''}"${idAttr} style="--token-color:${t.color}">${t.initials}</div>`;
}

function renderTile_(t) {
  return html_`
    <div class="tile tile--${t.type}" data-tile="${t.n}">
      <div class="tile-number mono">${t.n}</div>
      <div class="tile-glyph">${t.glyph}</div>
      <div class="tile-tokens">
        ${t.tokens.map(function (p) { return token_(p, 'token--board'); })}
        ${t.moreCount > 0 ? html_`<div class="tile-more mono">+${t.moreCount}</div>` : ''}
      </div>
    </div>
  `;
}

// Rails + evenly-spaced rungs (ladderPath_, Derive.gs). `data-from`/`data-to`
// let the roll animation (Anim.gs) find the matching climb by tile number.
function renderLadder_(c) {
  return html_`
    <g class="conn conn--ladder" data-from="${c.from}" data-to="${c.to}">
      ${c.rails.map(function (r) { return html_`<line x1="${r.x1}" y1="${r.y1}" x2="${r.x2}" y2="${r.y2}" class="conn-rail"></line>`; })}
      ${c.rungs.map(function (r) { return html_`<line x1="${r.x1}" y1="${r.y1}" x2="${r.x2}" y2="${r.y2}" class="conn-rung"></line>`; })}
    </g>
  `;
}

// Sine-offset body (snakePath_, Derive.gs) as a single <path> so the roll
// animation can walk it exactly via getPointAtLength(), plus a head dot and
// two eyes oriented along the initial tangent. `data-from`/`data-to` mirror
// renderLadder_'s connector-lookup contract.
function renderSnake_(c, index) {
  var eyeSpread = 0.09;
  var rad = c.headAngle * Math.PI / 180;
  // Perpendicular to the head tangent, for eye placement either side of it.
  var ex = -Math.sin(rad) * eyeSpread, ey = Math.cos(rad) * eyeSpread;
  // Slight per-snake delay so multiple snakes don't slither in lockstep.
  var delay = (index * 0.37).toFixed(2) + 's';
  return html_`
    <g class="conn conn--snake" data-from="${c.from}" data-to="${c.to}" style="animation-delay:${delay}">
      <path d="${c.d}" class="conn-snake-body"></path>
      <circle cx="${c.headX}" cy="${c.headY}" r="0.16" class="conn-snake-head"></circle>
      <circle cx="${(c.headX + ex).toFixed(4)}" cy="${(c.headY + ey).toFixed(4)}" r="0.03" class="conn-snake-eye"></circle>
      <circle cx="${(c.headX - ex).toFixed(4)}" cy="${(c.headY - ey).toFixed(4)}" r="0.03" class="conn-snake-eye"></circle>
    </g>
  `;
}

function renderBoard_(view) {
  var tiles = view.board.tiles, connectors = view.board.connectors;
  var snakeIndex = 0;
  return html_`
    <div class="card board-card">
      <div class="card-header">
        <div class="display card-title">The Board</div>
        <div class="mono card-eyebrow">100 TILES</div>
      </div>
      <div class="board-wrap">
        <div class="board-grid">
          ${tiles.map(renderTile_)}
          <svg class="connector-svg" viewBox="0 0 10 10" preserveAspectRatio="none">
            ${connectors.map(function (c) {
              return c.kind === 'shortcut' ? renderLadder_(c) : renderSnake_(c, snakeIndex++);
            })}
          </svg>
        </div>
      </div>
      <div class="start-rail">
        <div class="mono start-rail-label">START</div>
        <div class="start-rail-tokens">
          ${view.startTokens.map(function (p) { return token_(p, 'token--start'); })}
        </div>
        <div class="start-rail-note">${view.startNote}</div>
      </div>
      <div class="legend">
        ${TILE_LEGEND_.map(function (l) { return html_`
          <div class="legend-item">
            <div class="legend-swatch ${l.className}"></div>
            <div class="mono legend-label">${l.label}</div>
          </div>
        `; })}
      </div>
    </div>
  `;
}
