// Minimal auto-escaping HTML templating. Player names come from Google
// accounts and feed text is composed from player-chosen data, so nothing
// here is trusted by default.

var ESCAPE_MAP_ = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc_(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ESCAPE_MAP_[ch]; });
}

function raw_(value) {
  return { __raw__: true, toString: function () { return String(value); } };
}

function isRaw_(value) {
  return value != null && typeof value === 'object' && value.__raw__ === true;
}

function stringifyValue_(value) {
  if (isRaw_(value)) return String(value);
  if (Array.isArray(value)) return value.map(stringifyValue_).join('');
  return esc_(value);
}

/** Tagged template: html`<div>${name}</div>` escapes `name` automatically. */
function html_(strings) {
  var values = Array.prototype.slice.call(arguments, 1);
  var out = strings[0];
  for (var i = 0; i < values.length; i++) {
    out += stringifyValue_(values[i]) + strings[i + 1];
  }
  return raw_(out);
}
