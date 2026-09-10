// Generic Sheet-as-table helpers. Small team, small data (a season is a few
// hundred action rows at most), so "read the whole sheet, mutate in place"
// is simple and fast enough — no need for a query layer.

var SHEET_SCHEMA_ = {
  Players: ['id', 'email', 'name', 'initials', 'colorIndex', 'tile', 'tileAtDayStart', 'stunnedForDay', 'createdAt'],
  // PRIVATE. Only Repo.gs functions named *Inventory*/*Dice*/*Mines* may
  // read these — buildBaseView_ in Views.gs must never touch them (see that
  // file's header comment for the full privacy boundary).
  Inventories: ['playerId', 'item', 'count'],
  Dice: ['playerId', 'count'],
  Actions: ['id', 'at', 'actorId', 'targetId', 'kind', 'text', 'actorNote', 'targetNote'],
  DailyGrants: ['day'],
  // Soft-deleted, never sheet.deleteRow'd: a live mine has an empty
  // triggeredAt/triggeredBy. Deleting would shift every _row below it, and
  // "consume every mine on this tile" is itself a multi-row operation that
  // would corrupt its own row numbers mid-loop (see readTable_'s _row).
  Mines: ['id', 'ownerId', 'tile', 'placedAt', 'triggeredAt', 'triggeredBy']
};

/** Creates any missing sheet with its header row. Idempotent. */
function ensureSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEET_SCHEMA_).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, SHEET_SCHEMA_[name].length).setValues([SHEET_SCHEMA_[name]]);
      sheet.setFrozenRows(1);
    }
  });
  // Apps Script always creates one default "Sheet1" — drop it once our own
  // sheets exist so it doesn't confuse anyone opening the spreadsheet.
  var stray = ss.getSheetByName('Sheet1');
  if (stray && ss.getSheets().length > 1) ss.deleteSheet(stray);
}

/** True once setup() has run. There's no dedicated config sheet to check
 *  (season/board are source constants — see Config.gs), so Players stands in
 *  as "has ensureSheets_ ever run". */
function sheetsReady_() {
  return !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Players');
}

function getSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" not found. Run setup() from the Apps Script editor first.');
  return sheet;
}

/** Reads a whole table. Each row object carries `_row`, its 1-based sheet row number. */
function readTable_(name) {
  var sheet = getSheet_(name);
  var lastRow = sheet.getLastRow();
  var headers = SHEET_SCHEMA_[name];
  var rows = [];
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var r = 0; r < values.length; r++) {
      var obj = { _row: r + 2 };
      for (var c = 0; c < headers.length; c++) obj[headers[c]] = values[r][c];
      rows.push(obj);
    }
  }
  return { sheet: sheet, headers: headers, rows: rows };
}

function appendRow_(name, obj) {
  // headers come from the constant SHEET_SCHEMA_, not the sheet itself, so
  // this doesn't need a readTable_ (a full getValues()) just to find them.
  var sheet = getSheet_(name);
  var headers = SHEET_SCHEMA_[name];
  var row = headers.map(function (h) { return obj[h] === undefined ? '' : obj[h]; });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function updateRow_(sheet, headers, rowNum, patch) {
  Object.keys(patch).forEach(function (key) {
    var colIdx = headers.indexOf(key);
    if (colIdx === -1) return;
    sheet.getRange(rowNum, colIdx + 1).setValue(patch[key]);
  });
}

/**
 * Bulk-writes one column for a scattered set of rows in a single Range
 * read + single Range write, instead of one setValue() per row. Used by
 * AoE power-ups (wind, thunder) that touch every opponent's row at once —
 * see updatePlayerTilesBulk_ in Repo.gs.
 * @param {Sheet} sheet
 * @param {string[]} headers
 * @param {string} colName
 * @param {Object<number, *>} rowNumToValue  1-based sheet row -> new value
 */
function setColumnValues_(sheet, headers, colName, rowNumToValue) {
  var colIdx = headers.indexOf(colName);
  if (colIdx === -1) return;
  var rowNums = Object.keys(rowNumToValue).map(Number);
  if (rowNums.length === 0) return;
  var minRow = Math.min.apply(null, rowNums);
  var maxRow = Math.max.apply(null, rowNums);
  var range = sheet.getRange(minRow, colIdx + 1, maxRow - minRow + 1, 1);
  var values = range.getValues();
  rowNums.forEach(function (rowNum) {
    values[rowNum - minRow][0] = rowNumToValue[rowNum];
  });
  range.setValues(values);
}

/** '' (Sheets' empty cell) <-> null, for nullable columns like stunnedForDay. */
function nullIfBlank_(value) {
  return value === '' ? null : value;
}
