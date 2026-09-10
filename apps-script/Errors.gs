// Expected, user-facing engine failures (no dice left, unknown item,
// invalid target). A factory instead of a subclass, to sidestep any
// `class extends Error` transpilation quirks in the Apps Script runtime.

function EngineError_(code, message) {
  var err = new Error(message);
  err.name = 'EngineError';
  err.code = code;
  return err;
}

function isEngineError_(err) {
  return !!err && err.name === 'EngineError';
}
