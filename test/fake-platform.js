'use strict';

// Stand-ins for every non-Sheets Apps Script global the app touches at
// runtime. Confirmed by grep against apps-script/*.gs: only Code.gs and
// Views.gs/Config.gs/Engine.gs reach outside Sheets.gs's SpreadsheetApp
// surface, and only for Session, LockService, HtmlService, Logger,
// PropertiesService (Config.gs's getTeamDomain_), and
// SpreadsheetApp.getUi() (the admin menu).

/**
 * Formats Logger.log's printf-lite %s/%d substitutions well enough for the
 * calls this codebase actually makes (Code.gs's setup()/listPlayersAdmin,
 * Tests.gs's PASS/FAIL lines) — not a general printf implementation.
 */
function formatLog(args) {
  if (args.length <= 1) return args.length ? String(args[0]) : '';
  const [fmt, ...rest] = args;
  let i = 0;
  return String(fmt).replace(/%[sd]/g, () => (i < rest.length ? String(rest[i++]) : ''));
}

function createLogger() {
  const lines = [];
  return {
    api: {
      log(...args) {
        lines.push(formatLog(args));
      }
    },
    lines
  };
}

/**
 * getScriptLock().tryLock() throws if the lock is already held instead of
 * (real Apps Script's behavior) silently succeeding again for the same
 * execution. This is a deliberate divergence, stricter than the real
 * platform: Use.gs's comment on the 'double' item explains that `useItem_`
 * must call roll_ directly rather than serverRoll, because serverRoll's own
 * `finally { releaseLock() }` would drop the *outer* withLock_'s lock out
 * from under it the moment the inner call finished — a real but easy-to-miss
 * hazard that a single-threaded "always succeeds" fake would never surface.
 * Throwing here turns that comment into an assertion: any code path that
 * nests withLock_ calls fails loudly, in a fake, instead of only in a real
 * concurrent deployment.
 */
function createLockService() {
  let held = false;
  return {
    api: {
      getScriptLock() {
        return {
          tryLock(_timeoutMs) {
            if (held) {
              throw new Error(
                'FakeLock: re-entrant getScriptLock().tryLock() — the script lock is already ' +
                'held by an outer withLock_ call. See Use.gs\'s comment on why the \'double\' item ' +
                'calls roll_ directly instead of serverRoll.'
              );
            }
            held = true;
            return true;
          },
          releaseLock() {
            held = false;
          }
        };
      }
    },
    isHeld: () => held
  };
}

function createHtmlService() {
  return {
    api: {
      createHtmlOutput(content) {
        const output = {
          _content: content,
          _title: null,
          _meta: [],
          setTitle(t) { output._title = t; return output; },
          addMetaTag(name, value) { output._meta.push({ name, value }); return output; },
          getContent() { return output._content; },
          getTitle() { return output._title; }
        };
        return output;
      }
    }
  };
}

/**
 * Stand-in for PropertiesService.getScriptProperties() — an in-memory map,
 * empty by default so getTeamDomain_() (Config.gs) falls back to its
 * 'example.com' default the same way a fresh deployment with no Script
 * Properties set would. Tests that care about a real domain check call
 * setProperty('TEAM_DOMAIN', ...) directly.
 */
function createPropertiesService() {
  const store = new Map();
  const scriptProperties = {
    getProperty(key) { return store.has(key) ? store.get(key) : null; },
    setProperty(key, value) { store.set(key, String(value)); return scriptProperties; },
    deleteProperty(key) { store.delete(key); return scriptProperties; }
  };
  return {
    api: {
      getScriptProperties() { return scriptProperties; }
    }
  };
}

function createSession() {
  let email = null;
  return {
    api: {
      getActiveUser() {
        return { getEmail: () => (email == null ? '' : email) };
      }
    },
    setActiveUser: (e) => { email = e; }
  };
}

/**
 * Minimal Ui for the Sheet menu / admin prompts (onOpen, listPlayersAdmin,
 * grantItemAdmin, resetAllNamesAdmin, startNewSeasonAdmin). Not exercised by
 * the main test suites (those cover the web app + console entry points),
 * but present so admin functions don't throw ReferenceErrors if a test or
 * the preview's future admin panel calls them. Responses are canned via
 * queues so a test can script a confirmation dialog's answers.
 */
function createUi() {
  const promptQueue = [];
  const alertQueue = [];
  const alerts = [];
  const Button = { OK: 'OK', CANCEL: 'CANCEL', YES: 'YES', NO: 'NO', CLOSE: 'CLOSE' };
  const ButtonSet = { OK: 'OK', OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO' };
  return {
    api: {
      getUi() {
        return {
          Button,
          ButtonSet,
          alert(...args) {
            alerts.push(args);
            return alertQueue.length ? alertQueue.shift() : Button.OK;
          },
          prompt(_title, _message, _buttonSet) {
            const resp = promptQueue.length ? promptQueue.shift() : { button: Button.CANCEL, text: '' };
            return {
              getSelectedButton: () => resp.button,
              getResponseText: () => resp.text
            };
          },
          createMenu(_name) {
            const menu = {
              addItem: () => menu,
              addSeparator: () => menu,
              addToUi: () => {}
            };
            return menu;
          }
        };
      }
    },
    alerts,
    queueAlert: (button) => alertQueue.push(button),
    queuePrompt: (button, text) => promptQueue.push({ button, text })
  };
}

function createFakePlatform() {
  const logger = createLogger();
  const lock = createLockService();
  const html = createHtmlService();
  const session = createSession();
  const ui = createUi();
  const properties = createPropertiesService();

  return {
    Logger: logger.api,
    LockService: lock.api,
    HtmlService: html.api,
    Session: session.api,
    PropertiesService: properties.api,
    ui,
    logs: logger.lines,
    lockIsHeld: lock.isHeld,
    setActiveUser: session.setActiveUser
  };
}

module.exports = { createFakePlatform };
