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

  ${renderHeader_(view)}

  <div class="regions-row">
    ${renderBoard_(view)}
    ${renderStandings_(view)}
    ${renderFeed_(view)}
  </div>

  ${view.me ? html_`
    <section class="console-zone${view.me.needsName ? '' : ' console-zone--dock'}">
      <div id="console-error" class="console-error" hidden></div>
      ${view.me.needsName ? renderOnboarding_(view) : renderConsole_(view)}
    </section>
  ` : ''}

  <div class="mono page-footer">
    UPDATED <span data-at="${view.updatedAtIso}">${absoluteUtc_(view.updatedAtIso)}</span>
  </div>
</div>
<script>${raw_(CLIENT_SCRIPT_)}</script>
${view.me ? html_`<script>${raw_(ANIM_CLIENT_SCRIPT_)}</script><script>${raw_(CONSOLE_CLIENT_SCRIPT_)}</script>` : ''}
</body>
</html>`;
}

// Wraps google.script.run so every console control uses the same pattern:
// disable the button, call the named server function with args, and either
// reload (success) or surface the error inline (failure) and re-enable the
// button. Server functions run as the caller's own authenticated session —
// see Code.gs — so there's no CSRF token to pass, unlike the original's
// form-based POSTs.
//
// The optional 4th arg `onSuccess` hands the server's return value to a
// caller-supplied handler instead of reloading immediately — used only by
// the Roll button (RenderConsole.gs), whose handler is LadderAnim.play
// (Anim.gs): it animates the result and reloads itself once done. Every
// other control omits it and keeps today's immediate-reload behavior.
var CONSOLE_CLIENT_SCRIPT_ = [
  'function callServer_(fnName, args, btn, onSuccess) {',
  '  var errBox = document.getElementById("console-error");',
  '  if (errBox) errBox.hidden = true;',
  '  if (btn) btn.disabled = true;',
  '  google.script.run',
  '    .withSuccessHandler(function (result) { if (onSuccess) onSuccess(result); else location.reload(); })',
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
  '  var restoredOpen = false;',
  '  try { restoredOpen = sessionStorage.getItem(DOCK_KEY) === "1"; } catch (e) {}',
  '  setOpen(restoredOpen);',
  '  syncDockHeight();',
  '  window.addEventListener("resize", syncDockHeight);',
  '})();'
].join('\n');
