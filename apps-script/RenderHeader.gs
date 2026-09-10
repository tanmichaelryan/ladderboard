// Region A - season header: name, day counter, progress bar, and the leader
// strip.

function renderHeader_(view) {
  var season = view.season, leaderText = view.leaderText;
  return html_`
    <div class="header-slab">
      <div class="header-top">
        <div style="display:flex; flex-direction:column; gap:2px;">
          <div class="mono header-eyebrow">Season 1</div>
          <div class="display header-title">${season.name}</div>
        </div>
        <div class="header-pills">
          <div class="mono pill pill--solid">DAY ${season.dayNum} / ${season.dayTotal}</div>
          <div class="mono pill pill--outline">${season.daysLeft} DAYS LEFT</div>
        </div>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${season.progressPct}%"></div>
      </div>
      <div class="leader-strip">
        <div class="mono leader-label">LEADING</div>
        <div class="leader-value">${leaderText}</div>
      </div>
    </div>
  `;
}
