// Region C - standings: ranked player rows with tile, daily delta, and
// stun status. Never renders inventory (see Views.gs).

function standingsAvatar_(p) {
  return html_`<div class="token token--avatar${p.stunned ? ' token--stunned' : ''}" style="--token-color:${p.color}">${p.initials}</div>`;
}

function standingsRow_(p) {
  return html_`
    <div class="standings-row${p.stunned ? ' standings-row--stunned' : ''}">
      <div class="mono standings-rank">${p.tied ? 'T' : ''}${p.rank}</div>
      ${standingsAvatar_(p)}
      <div class="standings-body">
        <div class="standings-name-row">
          <div class="standings-name">${p.name}</div>
          ${p.stunned ? html_`<div class="mono standings-badge">STUNNED · NO DIE TOMORROW</div>` : ''}
        </div>
        <div class="standings-lastseen">${p.lastSeenText}</div>
      </div>
      <div class="standings-right">
        <div class="mono standings-tile">${p.tileDisplay}</div>
        <div class="mono standings-delta${p.deltaPositive ? ' standings-delta--positive' : ''}">${p.deltaText}</div>
      </div>
    </div>
  `;
}

function renderStandings_(view) {
  return html_`
    <div class="card standings-card">
      <div class="card-header">
        <div class="display card-title">Standings</div>
      </div>
      <div class="standings-list">
        ${view.standings.map(standingsRow_)}
      </div>
    </div>
  `;
}
