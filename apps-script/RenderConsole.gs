// The authenticated player's console: identity, roll, bag, use-item
// controls. Calls server-side Apps Script functions directly via
// google.script.run, which is already scoped to the caller's own
// authenticated session (see
// callServer_ in RenderPage.gs), so no CSRF token is needed here.
//
// Every onclick literal below embeds only our own fixed item-name strings
// and numeric player/tile ids (never free-text player input), so it's safe
// to splice into the JS call without extra escaping.

function rollControl_(view) {
  var me = view.me;
  var inDebt = me.dice < 0;
  var disabled = me.dice <= 0;
  return html_`
    <div class="inline-form">
      <button class="btn btn--primary" onclick="callServer_('serverRoll',[],this,LadderAnim.play)" ${disabled ? 'disabled' : ''}>
        Roll${disabled ? '' : ' (' + me.dice + ' die' + (me.dice === 1 ? '' : 's') + ' left)'}
      </button>
      ${inDebt
        ? html_`<span class="console-stunned-banner">THUNDER hit you: ${Math.abs(me.dice)} die${Math.abs(me.dice) === 1 ? '' : 's'} in debt. A daily grant has to clear it before you can roll again.</span>`
        : disabled ? html_`<span class="feed-time mono">No dice left today.</span>` : ''}
    </div>
  `;
}

/**
 * <option> list for a target-picking item control. `filter` narrows the
 * candidate pool beyond "not yourself" — e.g. PULL restricts to players
 * ahead of you. This is a UI convenience only; Use.gs re-validates the
 * target server-side regardless of what the client sends.
 */
function targetOptions_(view, filter) {
  return view.standings
    .filter(function (p) { return p.id !== view.me.id; })
    .filter(filter || function () { return true; })
    .map(function (p) { return html_`<option value="${p.id}">${p.name}</option>`; });
}

/**
 * Shared control for any item that targets one other player. Renders an
 * empty-state message instead of a blank control when `filter` leaves no
 * valid targets — e.g. the current leader has nobody ahead of them to PULL.
 */
function targetControl_(itemId, view, opts) {
  opts = opts || {};
  var targets = targetOptions_(view, opts.filter);
  if (targets.length === 0) {
    return html_`<span class="bag-desc" style="flex:0 0 auto; font-style:italic;">${opts.emptyText || 'No valid targets right now.'}</span>`;
  }
  var selectId = 'target-' + itemId;
  return html_`
    <select id="${selectId}" aria-label="Target">${targets}</select>
    <button class="btn btn--secondary" onclick="callServer_('serverUseItem',['${itemId}',{targetId:Number(document.getElementById('${selectId}').value)}],this)">Use</button>
  `;
}

/**
 * One entry per item in ITEM_POOL_ (Roll.gs) — every usable item needs a
 * real control, and every passive item (shield) needs its explanatory
 * label, so an item with no branch here is a bug, not a design choice.
 * Tests.gs's catalog-coverage group checks every pool item has an entry.
 */
var ITEM_CONTROLS_ = {
  die: function () {
    return html_`<button class="btn btn--secondary" onclick="callServer_('serverUseItem',['die',{}],this)">Use</button>`;
  },
  double: function () {
    return html_`<button class="btn btn--secondary" onclick="callServer_('serverUseItem',['double',{}],this)">Use</button>`;
  },
  jump: function () {
    return html_`<button class="btn btn--secondary" onclick="callServer_('serverUseItem',['jump',{}],this)">Use</button>`;
  },
  // Ahead-of-you is a UI convenience mirroring validatePullTarget_ (Use.gs)
  // — the server re-checks regardless of what this filter lets through.
  pull: function (view) {
    return targetControl_('pull', view, {
      filter: function (p) { return p.tile > view.me.tile; },
      emptyText: 'Nobody is ahead of you right now.'
    });
  },
  wind: function () {
    return html_`<button class="btn btn--secondary" onclick="callServer_('serverUseItem',['wind',{}],this)">Use</button>`;
  },
  thunder: function () {
    return html_`<button class="btn btn--secondary" onclick="callServer_('serverUseItem',['thunder',{}],this)">Use</button>`;
  },
  shield: function () {
    return html_`<span class="bag-desc" style="flex:0 0 auto; font-style:italic;">Passive - triggers automatically</span>`;
  },
  mine: function (view) {
    var suggested = Math.min(99, Math.max(1, view.me.tile + 1));
    return html_`
      <input type="number" id="mine-tile" min="1" max="99" value="${suggested}" aria-label="Tile to arm">
      <button class="btn btn--secondary" onclick="callServer_('serverUseItem',['mine',{tile:Number(document.getElementById('mine-tile').value)}],this)">Arm</button>
    `;
  }
};

/** Shield's count is charges, not stacked pickups of a one-shot item — say
 *  so, rather than the generic "×N" suffix every other item uses. */
function chipLabel_(item) {
  if (item.item === 'shield') {
    return item.label + ' · ' + item.count + (item.count === 1 ? ' charge' : ' charges');
  }
  return item.label + (item.count > 1 ? ' ×' + item.count : '');
}

function bagRow_(item, view) {
  var chip = html_`<div class="chip" style="--chip-fg:${item.fg}; --chip-bg:${item.bg}">${chipLabel_(item)}</div>`;
  var control = ITEM_CONTROLS_[item.item];
  var action = control ? control(view) : '';

  return html_`
    <div class="bag-row">
      ${chip}
      <div class="bag-desc">${item.desc}</div>
      ${action}
    </div>
  `;
}

/**
 * The player's own currently-armed (untriggered) landmines — sourced from
 * view.me.mines (buildPlayerView_ only, never buildBaseView_: see Views.gs's
 * privacy header). Nobody but the owner ever sees these tiles.
 */
function minesSection_(view) {
  var mines = view.me.mines;
  if (!mines || mines.length === 0) return '';
  return html_`
    <div class="mono bag-label">YOUR ARMED LANDMINES — ${mines.length}</div>
    <div class="bag-list">
      ${mines.map(function (m) { return html_`
        <div class="bag-row"><div class="bag-desc">Tile ${m.tile}</div></div>
      `; })}
    </div>
  `;
}

function renderConsole_(view) {
  var me = view.me;
  return html_`
    <div class="card console-card">
      <div class="card-header">
        <div>
          <div class="display card-title">Your controls</div>
        </div>
        <div class="mono card-eyebrow">${me.tied ? 'T' : ''}${me.rank == null ? '—' : me.rank} · tile ${me.tileDisplay}</div>
      </div>
      <div class="console-bar">
        <div class="console-identity">
          <div class="token token--console${me.stunned ? ' token--stunned' : ''}" style="--token-color:${me.color}">${me.initials}</div>
          <div class="console-identity-body">
            <div class="console-identity-name">${me.name}</div>
            <div class="mono console-identity-meta">${me.lastSeenText}</div>
          </div>
        </div>
        <div class="console-actions">
          ${rollControl_(view)}
        </div>
        <button type="button" class="btn btn--secondary console-toggle" aria-expanded="false" aria-controls="console-drawer" onclick="toggleConsole_(this)">Bag &amp; settings</button>
      </div>
      <div class="console-drawer-body" id="console-drawer">
        <details class="rename-details">
          <summary class="mono rename-summary">rename</summary>
          <div class="inline-form">
            <input type="text" id="rename-input" value="${me.name}" maxlength="60" aria-label="Display name">
            <button class="btn btn--secondary" onclick="callServer_('serverSetName',[document.getElementById('rename-input').value],this)">Save</button>
          </div>
        </details>
        ${me.stunned ? html_`
          <div class="console-stunned-banner">You are stunned — no free die at the next reset. Nothing else changes.</div>
        ` : ''}
        ${me.items.length === 0 ? html_`
          <div class="mono bag-label">YOUR BAG IS EMPTY</div>
        ` : html_`
          <div class="mono bag-label">YOUR BAG — ${me.items.length} ITEM${me.items.length === 1 ? '' : 'S'}</div>
          <div class="bag-list">
            ${me.items.map(function (item) { return bagRow_(item, view); })}
          </div>
        `}
        ${minesSection_(view)}
      </div>
    </div>
  `;
}
