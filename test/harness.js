'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { createFakeSpreadsheet } = require('./fake-sheets');
const { createFakePlatform } = require('./fake-platform');
const { makeClockedDate } = require('./clock');

const APPS_SCRIPT_DIR = path.join(__dirname, '..', 'apps-script');

function loadSource() {
  const files = fs.readdirSync(APPS_SCRIPT_DIR)
    .filter((f) => f.endsWith('.gs'))
    .sort(); // filename order — same bundling order the Apps Script editor/clasp use
  if (files.length === 0) {
    throw new Error('No .gs files found in ' + APPS_SCRIPT_DIR + ' — is apps-script/ missing?');
  }
  return files
    .map((f) => `// ---- ${f} ----\n` + fs.readFileSync(path.join(APPS_SCRIPT_DIR, f), 'utf8'))
    .join('\n\n');
}

// Read once per process. Every createHarness() call below gets its own vm
// context (its own global scope, its own fake sheet, its own clock) but
// reuses this same source text — one fixed bundle of files, same as a real
// Apps Script project, invoked as many times as tests need.
const SOURCE = loadSource();

/**
 * Boots one isolated instance of the whole apps-script/ bundle: its own vm
 * context standing in for Apps Script's single global scope (so load-order
 * and name-collision bugs would surface here the same way they would on the
 * real platform), its own in-memory spreadsheet, its own fake platform
 * (Session/LockService/HtmlService/Logger/Ui), and its own controllable
 * clock. Two harnesses never share state.
 *
 * @param {{now?: number|Date, activeUser?: string}} [options]
 *   `now` seeds the clock (defaults to the real wall clock — pass an
 *   explicit value in tests instead of relying on that, so a suite's
 *   result doesn't depend on which real-world day it happens to run on).
 *   `activeUser` seeds Session.getActiveUser().getEmail().
 */
function createHarness(options) {
  options = options || {};
  const spreadsheet = createFakeSpreadsheet();
  const platform = createFakePlatform();
  const nowMs = options.now instanceof Date ? options.now.getTime() : options.now;
  const ClockedDate = makeClockedDate(nowMs);

  const context = {
    Date: ClockedDate,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      getUi: platform.ui.api.getUi
    },
    Session: platform.Session,
    LockService: platform.LockService,
    HtmlService: platform.HtmlService,
    PropertiesService: platform.PropertiesService,
    Logger: platform.Logger
  };
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: 'apps-script-bundle.gs' });

  // vm.createContext gives the loaded code a working Math/Array/Object/...
  // (they're real intrinsics of the new realm), but never adds them as
  // visible OWN PROPERTIES of the sandbox object itself — `context.Math`
  // would otherwise be undefined from here on out, even though `Math`
  // resolves fine to code running inside the vm. Evaluating the bare
  // identifier inside the context returns the actual live object (objects
  // cross this boundary by reference), so assigning it back onto `context`
  // makes it reachable from the host too — e.g. so a test can do
  // `harness.globals.Math.random = () => ...` and have it affect the exact
  // Math object roll_/pickRandom_ (inside the vm) already call.
  context.Math = vm.runInContext('Math', context);

  if (options.activeUser) platform.setActiveUser(options.activeUser);

  return {
    globals: context,
    sheets: spreadsheet,
    ui: platform.ui,
    logs: platform.logs,
    lockIsHeld: platform.lockIsHeld,
    setActiveUser: platform.setActiveUser,
    setNow: ClockedDate.__setNow,
    advanceDays: ClockedDate.__advanceDays,
    now: ClockedDate.__now
  };
}

module.exports = { createHarness, APPS_SCRIPT_DIR };
