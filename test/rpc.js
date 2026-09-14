'use strict';

// Mirrors google.script.run's real visibility rule, confirmed against
// Google's docs: a top-level server function whose name ends in "_" is
// private — its name is never sent to the client, and google.script.run
// cannot call it. (developers.google.com/apps-script/guides/html/communication)
//
// Real Apps Script fails this SILENTLY: the client-side call just never
// resolves, with no error on either side. That's actively unhelpful for
// local development, so this harness diverges on purpose — invokePublic
// throws a clear, named error instead, so a preview click or a test
// surfaces exactly what production would swallow without a trace.
//
// This is also how the harness caught a real bug before it was committed:
// Code.gs once defined `serverRefreshView_` (trailing underscore) and
// RenderPage.gs's client script called it via
// `google.script.run...serverRefreshView_()` — a call the real platform
// would silently drop, which is exactly why the Roll button could get
// stuck disabled forever after a successful roll. Renamed to
// `serverRefreshView` (Code.gs) to fix it — see entrypoints.test.js's
// "google.script.run can reach every real console entry point" case.

function isPublicName(name) {
  return typeof name === 'string' && name.length > 0 && !name.endsWith('_');
}

/**
 * @param {object} globals  a harness's `.globals` (the vm context)
 * @param {string} name
 * @param {any[]} [args]
 */
function invokePublic(globals, name, args) {
  if (!isPublicName(name)) {
    throw new Error(
      'google.script.run cannot call "' + name + '" — server functions ending in "_" are ' +
      'private and their names are never sent to the client (this fails silently on the real ' +
      'platform; this harness throws instead so the mistake is visible locally).'
    );
  }
  const fn = globals[name];
  if (typeof fn !== 'function') {
    throw new Error('google.script.run: no top-level function named "' + name + '".');
  }
  return fn.apply(null, args || []);
}

module.exports = { isPublicName, invokePublic };
