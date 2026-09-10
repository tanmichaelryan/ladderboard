// Presentation metadata: feed entry-kind labels and rail colors.
//
// ACTION_KINDS_ is every `kind` value any insertAction_ call can write.
// Views.gs:73 looks up KIND_META_[row.kind] unconditionally, so a kind
// without an entry here throws at feed render — Tests.gs's coverage group
// checks every one of these has a match.
var ACTION_KINDS_ = ['roll', 'ladder', 'snake', 'pickup', 'use', 'reset', 'mine'];

var KIND_META_ = {
  roll: { label: 'ROLL', railColor: '#6E645A' },
  ladder: { label: 'SHORTCUT', railColor: '#2F7D4F' },
  snake: { label: 'SETBACK', railColor: '#C0442E' },
  pickup: { label: 'PICKUP', railColor: '#B4791A' },
  use: { label: 'POWER-UP', railColor: '#7A34A8' },
  reset: { label: 'RESET', railColor: '#8E8378' },
  mine: { label: 'LANDMINE', railColor: '#946B2D' }
};

// Single source of truth for every power-up item: label/colors/description
// for the bag chip, plus which pool(s) it belongs to. ITEM_POOL_ (Roll.gs's
// gacha) and USABLE_ITEMS_ (Use.gs's console dispatch) are meant to be
// *derived* from `inPool`/`usable` here so the three lists can't drift out
// of sync — see Tests.gs's catalog-consistency group, and the TODO at each
// call site for exactly when that derivation lands.
//
// stun/warp are RETIRED, not deleted — this project's existing convention
// (KIND_META_'s ladder/snake above, Config.gs's emptied shortcuts/setbacks)
// is to keep an old identifier labelled rather than let a stale Inventories
// row render as a blank, buttonless chip (Views.gs assigns
// ITEM_META_[row.item] with no existence check, which is a silent no-op on
// a miss, not a throw).
// Descriptions are static literals, not templated from POWERUP_ (Config.gs)
// — matching the existing style (the old `pull` entry hardcoded "4-8 tiles"
// as prose rather than reading Use.gs's amount) and avoiding a load-order
// dependency: Apps Script has no import graph, so this file executing
// before Config.gs would otherwise read `POWERUP_` as undefined.
var ITEM_CATALOG_ = {
  die: { label: 'EXTRA DIE', fg: '#2F5B7D', bg: '#DDEAF3', desc: 'One extra roll, usable any time.', usable: true, inPool: true },
  double: { label: 'DOUBLE DICE', fg: '#1F6E5C', bg: '#DCF0EA', desc: 'Rolls immediately and doubles the result. Costs one die.', usable: true, inPool: true },
  jump: { label: 'JUMP', fg: '#5A3FA0', bg: '#E6E0F7', desc: 'Move yourself forward a few tiles.', usable: true, inPool: true },
  pull: { label: 'PULL', fg: '#B0451F', bg: '#FAE0D3', desc: 'Drag a target ahead of you to your tile.', usable: true, inPool: true },
  wind: { label: 'WINDBLOWN', fg: '#2F6E8A', bg: '#DCEEF5', desc: 'Push every opponent back a few tiles.', usable: true, inPool: true },
  thunder: { label: 'THUNDER', fg: '#8A2E6A', bg: '#F5DFEE', desc: 'Every opponent loses a die. Can put them into debt.', usable: true, inPool: true },
  mine: { label: 'LANDMINE', fg: '#946B2D', bg: '#F3E6CC', desc: 'Arm a hidden trap on any tile ahead of you.', usable: true, inPool: true },
  shield: { label: 'SHIELD', fg: '#2F7D4F', bg: '#DDF0E2', desc: 'Blocks the next incoming power-up aimed at you, then loses a charge.', usable: false, inPool: true },
  stun: { label: 'STUN (retired)', fg: '#8A8074', bg: '#EDE8E0', desc: 'Retired — replaced by THUNDER.', usable: false, inPool: false },
  warp: { label: 'WARP (retired)', fg: '#8A8074', bg: '#EDE8E0', desc: 'Retired — replaced by JUMP.', usable: false, inPool: false }
};

var ITEM_META_ = ITEM_CATALOG_; // legacy name — Views.gs/RenderConsole.gs read chip metadata through this

var TILE_LEGEND_ = [
  { label: 'SHORTCUT', className: 'legend-shortcut' },
  { label: 'SETBACK', className: 'legend-setback' },
  { label: 'POWER-UP', className: 'legend-power' },
  { label: 'FINISH', className: 'legend-finish' }
];
