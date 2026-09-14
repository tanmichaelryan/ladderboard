'use strict';

// A controllable stand-in for the global `Date` constructor. Every engine
// function in apps-script/ already takes `now` explicitly (roll_, useItem_,
// ensureDailyReset_, ...), but Code.gs's entry points (doGet, serverRoll,
// serverSetName, ...) construct `new Date()` themselves. Injecting this in
// place of Date is the one seam that lets tests and the preview server
// advance the clock — e.g. to cross a day boundary and exercise
// ensureDailyReset_ — without touching a single .gs line.
//
// Implemented as a plain function (not `class X extends Date`) so it works
// regardless of vm-context realm quirks: `new ClockedDate(...)` just
// constructs and returns a real Date from the outer realm, which is enough
// — nothing in this app ever checks `x instanceof Date`, only calls
// instance methods (getTime, toISOString, ...) that don't care which
// context's Date built the object.
function makeClockedDate(initialMs) {
  let currentMs = initialMs == null ? Date.now() : initialMs;

  function ClockedDate(...args) {
    if (!new.target) {
      // Date() called without `new` — not used anywhere in this codebase;
      // handled for completeness, matching real Date()'s string return.
      return new Date(currentMs).toString();
    }
    return args.length === 0 ? new Date(currentMs) : new Date(...args);
  }

  ClockedDate.now = () => currentMs;
  ClockedDate.parse = Date.parse.bind(Date);
  ClockedDate.UTC = Date.UTC.bind(Date);
  ClockedDate.prototype = Date.prototype;

  ClockedDate.__setNow = (d) => { currentMs = d instanceof Date ? d.getTime() : new Date(d).getTime(); };
  ClockedDate.__advanceDays = (n) => { currentMs += n * 24 * 60 * 60 * 1000; };
  ClockedDate.__now = () => new Date(currentMs);

  return ClockedDate;
}

module.exports = { makeClockedDate };
