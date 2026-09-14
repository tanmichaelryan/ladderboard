// The full page. No auth bar: there is no login/logout step — Workspace
// domain access gates the whole deployment (see Config.gs and README.md).
// The client script adds callServer_, the google.script.run wrapper the
// console's buttons call instead of submitting a <form>.

function renderPage_(view) {
  return html_`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${view.season.name} — Ladderboard</title>
<base target="_top">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Instrument+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>${raw_(STYLE_CSS_)}</style>
</head>
<body>
<div class="page">
  ${view.me ? html_`<div class="auth-bar mono identity-strip">${view.me.email}</div>` : ''}

  <div id="region-header">${renderHeader_(view)}</div>

  <div class="regions-row">
    <div id="region-board">${renderBoard_(view)}</div>
    <div id="region-standings">${renderStandings_(view)}</div>
    <div id="region-feed">${renderFeed_(view)}</div>
  </div>

  ${view.me ? html_`
    <section class="console-zone${view.me.needsName ? '' : ' console-zone--dock'}">
      <div id="console-body">
        <div id="console-error" class="console-error" hidden></div>
        ${view.me.needsName ? renderOnboarding_(view) : renderConsole_(view)}
      </div>
    </section>
  ` : ''}

  <div class="mono page-footer">
    UPDATED <span id="updated-at" data-at="${view.updatedAtIso}">${absoluteUtc_(view.updatedAtIso)}</span>
  </div>
</div>
<script>${raw_(CLIENT_SCRIPT_)}</script>
${view.me ? html_`<script>${raw_(ANIM_CLIENT_SCRIPT_)}</script><script>${raw_(CONSOLE_CLIENT_SCRIPT_)}</script>` : ''}
</body>
</html>`;
}

// Wraps google.script.run so every console control uses the same pattern:
// disable the button, call the named server function with args, and either
// refresh the board (success) or surface the error inline (failure) and
// re-enable the button. Server functions run as the caller's own
// authenticated session — see Code.gs — so there's no CSRF token to pass,
// unlike the original's form-based POSTs.
//
// The optional 4th arg `onSuccess` hands the server's return value to a
// caller-supplied handler instead of refreshing immediately — used only by
// the Roll button (RenderConsole.gs), whose handler is LadderAnim.play
// (Anim.gs): it animates the result and refreshes itself once done. Every
// other control omits it and keeps today's immediate-refresh behavior.
//
// refreshBoard_ re-renders in place via another google.script.run call
// rather than navigating: HtmlService serves the page inside a sandboxed
// googleusercontent.com iframe, so both location.reload() (refetches the
// iframe's cached snapshot, not a real doGet()) and top.location.reload()
// (a same-origin-only Location method — cross-origin callers may only set
// .href or call .replace(), so this throws instead of navigating) fail to
// get fresh data. Swapping the DOM avoids the cross-origin iframe problem
// entirely and is also just a better experience (no white flash).
var CONSOLE_CLIENT_SCRIPT_ = [
  'function refreshBoard_() {',
  '  google.script.run',
  '    .withSuccessHandler(function (data) {',
  '      var regions = {',
  '        "region-header": data.header, "region-board": data.board,',
  '        "region-standings": data.standings, "region-feed": data.feed,',
  '        "console-body": data.console',
  '      };',
  '      Object.keys(regions).forEach(function (id) {',
  '        var el = document.getElementById(id);',
  '        if (el && regions[id] != null) el.innerHTML = regions[id];',
  '      });',
  '      var at = document.getElementById("updated-at");',
  '      if (at) { at.textContent = data.updatedAtText; at.setAttribute("data-at", data.updatedAtIso); }',
  '      if (window.resyncDock_) window.resyncDock_();',
  '    })',
  '    .withFailureHandler(function (err) {',
  '      // location.reload() is a no-op here (HtmlService serves this inside a',
  '      // sandboxed cross-origin iframe — see the comment above this function),',
  '      // so surface the error and undo whatever the caller disabled instead of',
  '      // leaving the console silently stuck.',
  '      var errBox = document.getElementById("console-error");',
  '      if (errBox) { errBox.textContent = (err && err.message) || String(err); errBox.hidden = false; }',
  '      var body = document.getElementById("console-body");',
  '      if (body) {',
  '        var disabled = body.querySelectorAll("button:disabled");',
  '        for (var i = 0; i < disabled.length; i++) disabled[i].disabled = false;',
  '      }',
  '    })',
  '    .serverRefreshView();',
  '}',
  '',
  'function callServer_(fnName, args, btn, onSuccess) {',
  '  var errBox = document.getElementById("console-error");',
  '  if (errBox) errBox.hidden = true;',
  '  if (btn) btn.disabled = true;',
  '  google.script.run',
  '    .withSuccessHandler(function (result) {',
  '      if (onSuccess) { onSuccess(result); return; }',
  '      refreshBoard_();',
  '    })',
  '    .withFailureHandler(function (err) {',
  '      if (btn) btn.disabled = false;',
  '      if (errBox) { errBox.textContent = (err && err.message) || String(err); errBox.hidden = false; }',
  '    })[fnName].apply(null, args || []);',
  '}',
  '',
  '// Drives the mobile bottom-docked console: expands/collapses the bag &',
  '// settings drawer, remembers open/closed across the location.reload()',
  '// every callServer_ action triggers, and keeps .page bottom padding in',
  '// sync with the docked bar\'s real height so the footer is never hidden',
  '// under it.',
  '(function () {',
  '  var DOCK_KEY = "consoleDockOpen";',
  '  var dock = document.querySelector(".console-zone--dock");',
  '  if (!dock) return;',
  '',
  '  function setOpen(open) {',
  '    dock.classList.toggle("is-open", open);',
  '    var toggle = dock.querySelector(".console-toggle");',
  '    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");',
  '    try { sessionStorage.setItem(DOCK_KEY, open ? "1" : "0"); } catch (e) {}',
  '  }',
  '',
  '  window.toggleConsole_ = function (btn) {',
  '    setOpen(!dock.classList.contains("is-open"));',
  '  };',
  '',
  '  function syncDockHeight() {',
  '    document.documentElement.style.setProperty("--console-dock-h", dock.offsetHeight + "px");',
  '  }',
  '',
  '  // refreshBoard_ (above) replaces #console-body wholesale, which drops a',
  '  // freshly-rendered .console-toggle back to its default aria-expanded="false"',
  '  // and can change the drawer\'s real height — reapply the still-current',
  '  // open/closed state and remeasure rather than letting either go stale.',
  '  window.resyncDock_ = function () {',
  '    setOpen(dock.classList.contains("is-open"));',
  '    syncDockHeight();',
  '  };',
  '',
  '  var restoredOpen = false;',
  '  try { restoredOpen = sessionStorage.getItem(DOCK_KEY) === "1"; } catch (e) {}',
  '  setOpen(restoredOpen);',
  '  syncDockHeight();',
  '  window.addEventListener("resize", syncDockHeight);',
  '})();'
].join('\n');
