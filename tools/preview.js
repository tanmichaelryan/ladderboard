#!/usr/bin/env node
'use strict';

// Local browser preview of the real doGet()/render pipeline — no clasp
// push, no deployment. See apps-script/README.md and the harness under
// test/ for the fidelity rules this all rests on.
//
// Two HTTP servers, deliberately not one:
//   :3001 /app   — the "deployed web app": doGet().getContent(), with a
//                  google.script.run shim injected so the page's own
//                  buttons work unmodified.
//   :3000 /      — a dev shell embedding :3001/app in an <iframe>, with
//                  controls (switch identity, advance the clock, reload a
//                  seed scenario) that a real deployment has no equivalent
//                  of.
//
// The two ports matter: localhost:3000 and localhost:3001 are different
// origins, so the iframe is a GENUINELY cross-origin embed — reproducing
// the one HtmlService sandbox property that has actually caused bugs here
// (see RenderPage.gs's comment on why a plain location.reload() and
// top.location.reload() both fail inside the real sandboxed iframe).
//
// Known divergence from production: the real sandboxed iframe's
// location.reload() re-fetches a CACHED googleusercontent.com snapshot,
// not a fresh doGet(). Here, :3001/app has no cache — a reload always
// re-runs doGet() for real. That means callServer_'s `location.reload()`
// fallback (RenderPage.gs) can mask a bug locally that would still show
// stale data in production — watch this console's logs, not just whether
// the page "looks right" after a failure.

const http = require('http');
const { createHarness } = require('../test/harness');
const { invokePublic } = require('../test/rpc');
const seed = require('../test/seed');

const APP_PORT = 3001;
const SHELL_PORT = 3000;

const SCENARIOS = {
  empty: (h) => seed.seedEmpty(h),
  onboarding: (h, now) => seed.seedOnboarding(h, now),
  midSeason: (h, now) => seed.seedMidSeason(h, now),
  endgame: (h, now) => seed.seedEndgame(h, now)
};

const state = { scenario: null, harness: null, players: [], activeUser: null };

function resetScenario(name) {
  if (!SCENARIOS[name]) throw new Error('Unknown scenario "' + name + '". Known: ' + Object.keys(SCENARIOS).join(', '));
  const now = new Date();
  const h = createHarness({ now });
  const built = SCENARIOS[name](h, now);
  state.scenario = name;
  state.harness = h;
  state.players = built.players || [];
  state.activeUser = state.players.length ? state.players[0].email : 'you@example.com';
  console.log('[preview] scenario reset to "%s" — signed in as %s', name, state.activeUser);
}

resetScenario('midSeason');

// --- small helpers ---------------------------------------------------------

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html) });
  res.end(html);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

// --- :3001 — the "deployed web app" ----------------------------------------

// Reproduces google.script.run's real chainable API (withSuccessHandler /
// withFailureHandler / withUserObject, then a call for the actual server
// function name) against the /run endpoint below. A Proxy is the only way
// to accept an ARBITRARY function name as a property access, the way real
// google.script.run does.
const RPC_SHIM = `
<script>
(function () {
  function makeRunner(successHandler, failureHandler) {
    return new Proxy({}, {
      get: function (_target, prop) {
        if (prop === 'withSuccessHandler') return function (fn) { return makeRunner(fn, failureHandler); };
        if (prop === 'withFailureHandler') return function (fn) { return makeRunner(successHandler, fn); };
        if (prop === 'withUserObject') return function () { return makeRunner(successHandler, failureHandler); };
        if (typeof prop !== 'string') return undefined;
        return function () {
          var args = Array.prototype.slice.call(arguments);
          fetch('/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fn: prop, args: args })
          })
            .then(function (res) { return res.json(); })
            .then(function (payload) {
              if (payload.ok) {
                if (successHandler) successHandler(payload.result);
              } else {
                // See preview.js's header comment: a failure here can be
                // masked by callServer_'s own location.reload() fallback,
                // which (only in THIS local preview) happens to refetch
                // real data anyway. Logged loudly so it isn't missed.
                console.error('[preview] google.script.run.' + prop + '() failed:', payload.error && payload.error.message);
                if (failureHandler) failureHandler(payload.error);
              }
            })
            .catch(function (err) {
              console.error('[preview] /run request itself failed:', err);
              if (failureHandler) failureHandler({ message: String(err) });
            });
        };
      }
    });
  }
  window.google = { script: { run: makeRunner(null, null) } };
})();
</script>
</body>`;

const appServer = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/app') {
      state.harness.setActiveUser(state.activeUser);
      const output = state.harness.globals.doGet();
      const html = output.getContent().replace('</body>', RPC_SHIM);
      sendHtml(res, 200, html);
      return;
    }
    if (req.method === 'POST' && req.url === '/run') {
      const body = await readJsonBody(req);
      state.harness.setActiveUser(state.activeUser);
      try {
        const result = invokePublic(state.harness.globals, body.fn, body.args);
        sendJson(res, 200, { ok: true, result: result === undefined ? null : result });
      } catch (err) {
        console.error('[preview] %s threw:', body.fn, err.message);
        sendJson(res, 200, { ok: false, error: { message: (err && err.message) || String(err) } });
      }
      return;
    }
    sendHtml(res, 404, '<p>Not found. Try <a href="/app">/app</a>.</p>');
  } catch (err) {
    sendHtml(res, 500, '<pre>' + String((err && err.stack) || err) + '</pre>');
  }
});

// --- :3000 — the dev shell ---------------------------------------------

function shellHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Ladderboard preview</title>
<style>
  html, body { margin: 0; height: 100%; font: 13px/1.4 -apple-system, sans-serif; background: #f4f1ec; }
  #bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 12px; background: #2b2620; color: #eee; }
  #bar label { display: flex; gap: 4px; align-items: center; }
  #bar select, #bar button, #bar input { font: inherit; padding: 3px 6px; }
  #bar button { cursor: pointer; }
  #status { margin-left: auto; opacity: 0.75; }
  iframe { display: block; width: 100%; height: calc(100% - 40px); border: 0; }
</style>
</head>
<body>
<div id="bar">
  <label>Scenario
    <select id="scenario">
      <option value="empty">empty</option>
      <option value="onboarding">onboarding</option>
      <option value="midSeason">midSeason</option>
      <option value="endgame">endgame</option>
    </select>
  </label>
  <button id="reload-scenario">Reload scenario</button>

  <label>Sign in as
    <select id="identity"></select>
  </label>

  <button id="advance-day">Advance 1 day</button>
  <button id="reload-frame">Reload frame</button>
  <span id="status"></span>
</div>
<iframe id="app-frame" src="http://localhost:${APP_PORT}/app"></iframe>
<script>
  var frame = document.getElementById('app-frame');
  var status = document.getElementById('status');
  var scenarioSel = document.getElementById('scenario');
  var identitySel = document.getElementById('identity');

  function reloadFrame() {
    // Cache-bust: some browsers no-op a same-URL src reassignment.
    frame.src = 'http://localhost:${APP_PORT}/app?t=' + Date.now();
  }

  function refreshState() {
    return fetch('/state').then(function (r) { return r.json(); }).then(function (s) {
      scenarioSel.value = s.scenario;
      identitySel.innerHTML = '';
      s.players.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.email;
        opt.textContent = (p.name || '(unnamed)') + ' <' + p.email + '>';
        if (p.email === s.activeUser) opt.selected = true;
        identitySel.appendChild(opt);
      });
      status.textContent = 'scenario: ' + s.scenario + ' · signed in as ' + s.activeUser;
    });
  }

  function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  }

  document.getElementById('reload-scenario').addEventListener('click', function () {
    post('/control/scenario', { scenario: scenarioSel.value })
      .then(refreshState).then(reloadFrame);
  });
  identitySel.addEventListener('change', function () {
    post('/control/active-user', { email: identitySel.value }).then(reloadFrame);
  });
  document.getElementById('advance-day').addEventListener('click', function () {
    post('/control/advance-day').then(reloadFrame);
  });
  document.getElementById('reload-frame').addEventListener('click', reloadFrame);

  refreshState();
</script>
</body>
</html>`;
}

const shellServer = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      sendHtml(res, 200, shellHtml());
      return;
    }
    if (req.method === 'GET' && req.url === '/state') {
      sendJson(res, 200, { scenario: state.scenario, activeUser: state.activeUser, players: state.players });
      return;
    }
    if (req.method === 'POST' && req.url === '/control/scenario') {
      const body = await readJsonBody(req);
      resetScenario(body.scenario);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === 'POST' && req.url === '/control/active-user') {
      const body = await readJsonBody(req);
      state.activeUser = body.email;
      console.log('[preview] signed in as %s', state.activeUser);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === 'POST' && req.url === '/control/advance-day') {
      state.harness.advanceDays(1);
      console.log('[preview] clock advanced 1 day -> %s', state.harness.now().toISOString());
      sendJson(res, 200, { ok: true });
      return;
    }
    sendHtml(res, 404, '<p>Not found.</p>');
  } catch (err) {
    sendHtml(res, 500, '<pre>' + String((err && err.stack) || err) + '</pre>');
  }
});

appServer.listen(APP_PORT, () => {
  shellServer.listen(SHELL_PORT, () => {
    console.log('Ladderboard preview running:');
    console.log('  Dev shell (open this): http://localhost:%d/', SHELL_PORT);
    console.log('  App directly:          http://localhost:%d/app', APP_PORT);
  });
});
