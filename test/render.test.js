'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');
const { enrollNamedPlayer } = require('./support');
const { seedMidSeason, seedOnboarding } = require('./seed');

const NOW = new Date('2026-09-20T09:00:00Z');

// --- Html.gs: the templating primitives themselves -----------------------

test('esc_ escapes every HTML-special character', () => {
  const { globals: g } = createHarness();
  assert.equal(g.esc_(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(g.esc_(null), '');
  assert.equal(g.esc_(42), '42');
});

test('html_ auto-escapes interpolated values but passes raw_() through untouched', () => {
  const { globals: g } = createHarness();
  const out = String(g.html_`<div>${'<script>'}</div>${g.raw_('<b>ok</b>')}`);
  assert.equal(out, '<div>&lt;script&gt;</div><b>ok</b>');
});

// --- every render*_ function, exercised against a real seeded view -------

test('every render*_ function runs against a seeded midSeason view without throwing', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  const { players } = seedMidSeason(h, NOW);
  const view = g.buildPlayerView_(players[0].id, NOW);

  const header = String(g.renderHeader_(view));
  const board = String(g.renderBoard_(view));
  const standings = String(g.renderStandings_(view));
  const feed = String(g.renderFeed_(view));
  const consoleHtml = String(g.renderConsole_(view));
  const page = String(g.renderPage_(view));

  assert.ok(header.includes(g.DEFAULT_SEASON.name));
  assert.ok(board.includes('data-tile="1"'), 'board renders tile cells');
  players.forEach((p) => assert.ok(standings.includes(p.name), `standings should list ${p.name}`));
  assert.ok(feed.includes('NEWEST FIRST'));
  assert.ok(consoleHtml.includes(view.me.name));
  assert.ok(page.includes('<!DOCTYPE html>'));
  assert.ok(page.includes(header) && page.includes(board) && page.includes(standings) && page.includes(feed));
});

test('renderOnboarding_ is shown instead of renderConsole_ for a fresh, unnamed player', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  const { players } = seedOnboarding(h, NOW);
  const view = g.buildPlayerView_(players[0].id, NOW);

  assert.equal(view.me.needsName, true);
  const page = String(g.renderPage_(view));
  assert.ok(page.includes('onboarding-name-input'));
  assert.ok(!page.includes('id="rename-input"'), 'the named console should not also render');
});

test('renderFeed_ shows the empty state before anything has happened', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const view = g.buildBaseView_(NOW);
  const feed = String(g.renderFeed_(view));
  assert.ok(feed.includes('The season starts here.'));
});

test('esc_ escapes a hostile display name everywhere it is rendered', () => {
  const h = createHarness({ now: NOW });
  const g = h.globals;
  g.setup();
  const p = enrollNamedPlayer(g, 'a@example.com', NOW);
  // validateDisplayName_'s CHARSET_RE_ would reject this outright — bypass
  // it the way names.test.js does for the all-digit case, standing in for
  // a legacy/pre-validation row. Html.gs's header comment: names "come
  // from Google accounts... nothing here is trusted by default."
  g.setPlayerNameAndInitials_(p.id, '<b>Evil</b>', 'EV');

  const view = g.buildPlayerView_(p.id, NOW);
  const standingsHtml = String(g.renderStandings_(view));
  const consoleHtml = String(g.renderConsole_(view));

  assert.ok(!standingsHtml.includes('<b>Evil</b>'));
  assert.ok(standingsHtml.includes('&lt;b&gt;Evil&lt;/b&gt;'));
  assert.ok(!consoleHtml.includes('<b>Evil</b>'));
});

// --- the inlined client scripts (Time.gs, Anim.gs, RenderPage.gs) --------

test('the three inlined client scripts are syntactically valid JS', () => {
  const { globals: g } = createHarness();
  const scripts = {
    CLIENT_SCRIPT_: g.CLIENT_SCRIPT_,
    ANIM_CLIENT_SCRIPT_: g.ANIM_CLIENT_SCRIPT_,
    CONSOLE_CLIENT_SCRIPT_: g.CONSOLE_CLIENT_SCRIPT_
  };
  for (const [name, src] of Object.entries(scripts)) {
    assert.equal(typeof src, 'string', `${name} should be a string`);
    assert.doesNotThrow(() => new Function(src), `${name} has a syntax error`);
  }
});
