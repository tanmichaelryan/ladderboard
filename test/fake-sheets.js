'use strict';

// An in-memory stand-in for SpreadsheetApp.getActiveSpreadsheet() and the
// Sheet/Range methods Sheets.gs actually calls (confirmed by grep against
// apps-script/*.gs — see the harness README). The goal isn't to model the
// whole Sheets API, just the exact corner of it this app uses, faithfully
// enough that a bug here is a bug there too.
//
// Two behaviors are load-bearing, not incidental:
//
// 1. A blank cell reads back as '' (empty string), never null/undefined.
//    nullIfBlank_ (Sheets.gs) and every `!row.triggeredAt`-style liveness
//    check (Repo.gs) depend on this exact value, not just falsiness.
// 2. A cell written with an all-digit (or otherwise bare-numeric) STRING
//    reads back as a JS number, the same auto-detection real Sheets does
//    on write. Names.gs's ALLDIGIT_RE_ check exists specifically because a
//    name like "12345" would come back from a real sheet as the number
//    12345, and computeStandings_ (Derive.gs) calls name.localeCompare(...)
//    on it — which throws on a number. Skip this coercion here and that
//    whole failure mode goes untested.
//
// Documented divergence: real Sheets can also auto-parse date/time-shaped
// text into its internal date serial number. Nothing here does that — every
// timestamp this app writes is a full ISO string (toISOString()), which
// contains letters and multiple dashes/colons and so never matches the
// bare-numeric pattern below; it round-trips as plain text, same as real
// Sheets does for a string that shaped like that in practice (Sheets' date
// auto-detection is locale/format-dependent and ISO-8601-with-T is not one
// of the formats it recognizes). If a future column starts storing a
// Sheets-recognized date/time literal as a string, this fake will not
// reproduce the coercion — worth revisiting if that ever happens.

const NUMERIC_CELL_RE = /^-?\d+(\.\d+)?$/;

function coerceWrite(value) {
  if (typeof value === 'string' && value !== '' && NUMERIC_CELL_RE.test(value)) {
    return Number(value);
  }
  return value;
}

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }

  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const rowData = this.sheet.data[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = rowData[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }

  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      const rowIdx = this.row - 1 + r;
      if (!this.sheet.data[rowIdx]) this.sheet.data[rowIdx] = [];
      for (let c = 0; c < values[r].length; c++) {
        this.sheet.data[rowIdx][this.col - 1 + c] = coerceWrite(values[r][c]);
      }
    }
    return this;
  }

  setValue(value) {
    return this.setValues([[value]]);
  }

  clearContent() {
    for (let r = 0; r < this.numRows; r++) {
      const row = this.sheet.data[this.row - 1 + r];
      if (!row) continue;
      for (let c = 0; c < this.numCols; c++) row[this.col - 1 + c] = '';
    }
    return this;
  }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.data = []; // data[0] is row 1 (the header row once ensureSheets_ writes it)
  }

  getName() {
    return this.name;
  }

  getLastRow() {
    let last = this.data.length;
    while (last > 0 && this.data[last - 1].every((c) => c === '' || c == null)) last--;
    return last;
  }

  getLastColumn() {
    let max = 0;
    this.data.forEach((row) => { if (row.length > max) max = row.length; });
    return max;
  }

  getRange(row, col, numRows, numCols) {
    return new FakeRange(this, row, col, numRows || 1, numCols || 1);
  }

  appendRow(rowArray) {
    this.data.push(rowArray.map(coerceWrite));
    return this;
  }

  setFrozenRows(n) {
    this.frozenRows = n;
    return this;
  }
}

class FakeSpreadsheet {
  constructor() {
    this._sheets = new Map(); // Map preserves insertion order — matches getSheets()
  }

  getSheetByName(name) {
    return this._sheets.get(name) || null;
  }

  insertSheet(name) {
    if (this._sheets.has(name)) throw new Error('FakeSpreadsheet: sheet already exists: ' + name);
    const sheet = new FakeSheet(name);
    this._sheets.set(name, sheet);
    return sheet;
  }

  getSheets() {
    return Array.from(this._sheets.values());
  }

  deleteSheet(sheet) {
    this._sheets.delete(sheet.name);
  }
}

function createFakeSpreadsheet() {
  return new FakeSpreadsheet();
}

module.exports = { createFakeSpreadsheet };
