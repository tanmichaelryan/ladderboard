// Region D - activity feed: the newest-first list of rolls, moves, pickups
// and power-up uses, capped at 50 entries.

function feedAvatar_(f) {
  if (f.isSystem) {
    return html_`<div class="token token--feed" style="--token-color:#D8CCB8; color:#5C5349;">◷</div>`;
  }
  return html_`<div class="token token--feed" style="--token-color:${f.avatarColor}">${f.avatarInitials}</div>`;
}

function feedEntry_(f) {
  return html_`
    <div class="feed-row${f.loud ? ' feed-row--loud' : ''}">
      <div class="feed-rail" style="--rail-color:${f.railColor}"></div>
      ${feedAvatar_(f)}
      <div class="feed-body">
        <div class="feed-text">${f.text}</div>
        <div class="feed-meta-row">
          <div class="mono feed-kind" style="--kind-color:${f.railColor}">${f.kindLabel}</div>
          <div class="mono feed-time" data-at="${f.atIso}">${absoluteUtc_(f.atIso)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderFeed_(view) {
  var feed = view.feed;
  return html_`
    <div class="card feed-card">
      <div class="card-header">
        <div class="display card-title">Activity</div>
        <div class="mono card-eyebrow">${feed.meta}</div>
      </div>

      ${feed.emptyState ? html_`
        <div class="feed-empty">
          <div class="display feed-empty-headline">The season starts here.</div>
          <div class="feed-empty-sub">Roll above to open Day 1.</div>
        </div>
      ` : ''}

      <div class="feed-list">
        ${feed.entries.map(feedEntry_)}
      </div>

      ${feed.hasMore ? html_`
        <div class="mono feed-footer">SHOWING LAST ${feed.shownCount} OF ${feed.totalCount} ACTIONS</div>
      ` : ''}
    </div>
  `;
}
