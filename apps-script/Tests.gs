// Lightweight assertions runnable only from the Apps Script editor - there
// is no node:test equivalent here. Select `runTests` from the function
// dropdown and check View > Logs for PASS/FAIL/SKIP lines after any change
// to Names.gs or Repo.gs's getLastSeenAll_.
//
// A few groups need setup() to have already run (they read the Players/
// Actions sheets); those are SKIPped, not FAILed, on a brand-new project.

function assert_(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertThrows_(fn, msg) {
  var threw = false;
  try { fn(); } catch (e) { threw = true; }
  assert_(threw, msg);
}

function runTests() {
  var failures = [];
  var hasSheets = sheetsReady_();

  function group(name, fn) {
    try {
      fn();
      Logger.log('PASS  %s', name);
    } catch (err) {
      failures.push(name);
      Logger.log('FAIL  %s: %s', name, err.message);
    }
  }
  function skip(name) {
    Logger.log('SKIP  %s (run setup() first)', name);
  }

  // --- pure, no Sheet required --------------------------------------------

  group('needsName_ / normalizeDisplayName_ on blank-ish input', function () {
    assert_(needsName_({ name: '' }) === true, 'empty string should need a name');
    assert_(needsName_({ name: '   ' }) === true, 'whitespace-only should need a name');
    assert_(needsName_(null) === true, 'missing player should need a name');
    assert_(needsName_({ name: 'Rocket' }) === false, 'named player should not need a name');
    assert_(normalizeDisplayName_('  jane   doe ') === 'jane doe', 'collapses whitespace');
  });

  group('initialsFor_ never returns ?? for a real name', function () {
    ['Rocket', 'Ana Lu', 'x!'].forEach(function (n) {
      assert_(initialsFor_(n) !== '??', 'initials for "' + n + '"');
    });
  });

  group('validateSeason_ accepts DEFAULT_SEASON', function () {
    validateSeason_(DEFAULT_SEASON); // throws on any violation
  });

  group('ladderPath_ rails are parallel and equidistant from the centerline', function () {
    var p = ladderPath_(4, 22);
    var r1 = p.rails[0], r2 = p.rails[1];
    var dx1 = r1.x2 - r1.x1, dy1 = r1.y2 - r1.y1;
    var dx2 = r2.x2 - r2.x1, dy2 = r2.y2 - r2.y1;
    // Parallel: direction vectors are scalar multiples (cross product ~ 0).
    assert_(Math.abs(dx1 * dy2 - dy1 * dx2) < 1e-9, 'rails should be parallel');
    var mid1 = tileCenter_(4), mid2 = tileCenter_(22);
    var distToCenter = function (rail, t, center) {
      var x = rail.x1 + (rail.x2 - rail.x1) * t, y = rail.y1 + (rail.y2 - rail.y1) * t;
      return Math.sqrt((x - center.x) * (x - center.x) + (y - center.y) * (y - center.y));
    };
    assert_(Math.abs(distToCenter(r1, 0, mid1) - distToCenter(r2, 0, mid1)) < 1e-9, 'rails equidistant from foot center');
    assert_(Math.abs(distToCenter(r1, 1, mid2) - distToCenter(r2, 1, mid2)) < 1e-9, 'rails equidistant from top center');
  });

  group('ladderPath_ rungs lie on both rails', function () {
    var p = ladderPath_(4, 22);
    var onSegment = function (px, py, seg) {
      // Cross product ~0 (collinear) and within the segment's bounding box.
      var cross = (seg.x2 - seg.x1) * (py - seg.y1) - (seg.y2 - seg.y1) * (px - seg.x1);
      var within = px >= Math.min(seg.x1, seg.x2) - 1e-6 && px <= Math.max(seg.x1, seg.x2) + 1e-6 &&
        py >= Math.min(seg.y1, seg.y2) - 1e-6 && py <= Math.max(seg.y1, seg.y2) + 1e-6;
      return Math.abs(cross) < 1e-6 && within;
    };
    p.rungs.forEach(function (rung) {
      assert_(onSegment(rung.x1, rung.y1, p.rails[0]), 'rung endpoint on rail 1');
      assert_(onSegment(rung.x2, rung.y2, p.rails[1]), 'rung endpoint on rail 2');
    });
  });

  group('snakePath_ starts and ends at the head/tail tile centers', function () {
    var p = snakePath_(17, 7);
    var head = tileCenter_(17), tail = tileCenter_(7);
    assert_(Math.abs(p.headX - head.x) < 1e-9 && Math.abs(p.headY - head.y) < 1e-9, 'path starts at head center');
    // The path string's final "Lx y" pair (space-separated, x carries the
    // command letter) should land on the tail center.
    var parts = p.d.trim().split(' ');
    var lastX = Number(parts[parts.length - 2].replace(/^[ML]/, ''));
    var lastY = Number(parts[parts.length - 1]);
    assert_(Math.abs(lastX - tail.x) < 1e-2 && Math.abs(lastY - tail.y) < 1e-2, 'path ends at tail center');
  });

  group('validateSeason_ rejects a tile that is two things at once', function () {
    // A self-contained literal layout, not derived from DEFAULT_SEASON, so
    // the conflict doesn't depend on the live season's actual tile numbers.
    var bad = { shortcuts: { 5: 17 }, setbacks: { 17: 7 }, power: [] };
    assertThrows_(function () { validateSeason_(bad); }, 'expected throw: tile 17 is both a shortcut top and a setback head');
  });

  group('validatePowerup_ accepts POWERUP_', function () {
    validatePowerup_(POWERUP_); // throws on any violation
  });

  group('validatePowerup_ rejects a ratio that grants zero items', function () {
    assertThrows_(function () { validatePowerup_(Object.assign({}, POWERUP_, { rollsPerLanding: 2, rollsPerPowerup: 3 })); }, 'expected throw: floor(2/3) < 1');
  });

  group('validatePowerup_ rejects negative/zero tunables', function () {
    assertThrows_(function () { validatePowerup_(Object.assign({}, POWERUP_, { jumpDistance: 0 })); }, 'jumpDistance');
    assertThrows_(function () { validatePowerup_(Object.assign({}, POWERUP_, { shieldCharges: 0 })); }, 'shieldCharges');
    assertThrows_(function () { validatePowerup_(Object.assign({}, POWERUP_, { windPushback: -1 })); }, 'windPushback');
    assertThrows_(function () { validatePowerup_(Object.assign({}, POWERUP_, { pullMaxDistance: 0 })); }, 'pullMaxDistance');
  });

  group('clampTile_ clamps to the board', function () {
    assert_(clampTile_(-3) === 0, 'negative clamps to 0');
    assert_(clampTile_(0) === 0, '0 stays 0');
    assert_(clampTile_(100) === 100, '100 stays 100');
    assert_(clampTile_(104) === 100, 'over 100 clamps to 100');
  });

  group('every ACTION_KINDS_ has a KIND_META_ entry', function () {
    // Views.gs's feed builder looks up KIND_META_[row.kind] unconditionally
    // — a kind without an entry here throws at render, not at write time.
    ACTION_KINDS_.forEach(function (kind) {
      assert_(!!KIND_META_[kind], 'missing KIND_META_ entry for kind "' + kind + '"');
    });
  });

  group('ITEM_POOL_/USABLE_ITEMS_/ITEM_META_ agree with each other', function () {
    ITEM_POOL_.forEach(function (item) {
      var meta = ITEM_META_[item];
      assert_(meta && meta.label && meta.fg && meta.bg && meta.desc, 'ITEM_META_ missing/incomplete entry for pool item "' + item + '"');
    });
    USABLE_ITEMS_.forEach(function (item) {
      assert_(ITEM_POOL_.indexOf(item) !== -1, '"' + item + '" is usable but not in ITEM_POOL_');
    });
    var passive = ITEM_POOL_.filter(function (item) { return USABLE_ITEMS_.indexOf(item) === -1; });
    assert_(passive.length === 1 && passive[0] === 'shield', 'expected exactly one passive pool item (shield), got: ' + passive.join(', '));
  });

  group('every pool item has an ITEM_CONTROLS_ entry (bagRow_ falls back to no button otherwise)', function () {
    ITEM_POOL_.forEach(function (item) {
      assert_(typeof ITEM_CONTROLS_[item] === 'function', 'missing ITEM_CONTROLS_ entry for "' + item + '"');
    });
  });

  group('drawItems_ keeps floor(n/m) items, all drawn from the pool', function () {
    var pool = ['a', 'b', 'c'];
    var firstOnly = function (arr) { return arr[0]; };
    var r1 = drawItems_(pool, 3, 3, firstOnly);
    assert_(r1.drawn.length === 3, 'drawn.length === n');
    assert_(r1.kept.length === 1, 'floor(3/3) === 1, got ' + r1.kept.length);
    assert_(r1.kept[0] === 'a', 'deterministic pick returns pool[0]');

    var r2 = drawItems_(pool, 7, 3, firstOnly);
    assert_(r2.kept.length === 2, 'floor(7/3) === 2, got ' + r2.kept.length);

    var r3 = drawItems_(pool, 2, 3, firstOnly);
    assert_(r3.kept.length === 0, 'floor(2/3) === 0, got ' + r3.kept.length);
  });

  group('pullDestination_ / validatePullTarget_', function () {
    assert_(pullDestination_(20, 90, null) === 20, 'uncapped: target lands exactly on the actor\'s tile');
    assert_(pullDestination_(20, 90, 15) === 75, 'capped: at most maxDistance behind the target\'s own tile');
    assert_(pullDestination_(20, 30, 15) === 20, 'capped: never pulled past the actor\'s own tile');

    assertThrows_(function () { validatePullTarget_(50, 40); }, 'expected throw: target is behind the actor');
    assertThrows_(function () { validatePullTarget_(50, 50); }, 'expected throw: target is not strictly ahead');
    assertThrows_(function () { validatePullTarget_(50, 100); }, 'expected throw: target has already finished');
    validatePullTarget_(50, 60); // does not throw
  });

  group('opponentsOf_ / windTargets_ exclude the actor, unnamed players, and (wind only) finishers', function () {
    var players = [
      { id: 1, name: 'Actor', tile: 50 },
      { id: 2, name: 'Behind', tile: 10 },
      { id: 3, name: '', tile: 20 },      // unnamed
      { id: 4, name: 'Finisher', tile: 100 }
    ];
    var opponents = opponentsOf_(players, 1);
    assert_(opponents.length === 2, 'opponentsOf_ excludes actor + unnamed, keeps the finisher: got ' + opponents.length);
    assert_(opponents.some(function (p) { return p.id === 4; }), 'opponentsOf_ still includes the finisher (THUNDER does not exempt them)');

    var windies = windTargets_(players, 1);
    assert_(windies.length === 1 && windies[0].id === 2, 'windTargets_ additionally excludes the finisher, got ' + windies.length);
  });

  group('mineTileValid_ accepts 1-99, rejects the edges and non-integers', function () {
    assert_(mineTileValid_(1) === true, 'tile 1 valid');
    assert_(mineTileValid_(99) === true, 'tile 99 valid');
    assert_(mineTileValid_(0) === false, 'tile 0 invalid (nobody stands there once rolling)');
    assert_(mineTileValid_(100) === false, 'tile 100 invalid (the finish)');
    assert_(mineTileValid_(50.5) === false, 'non-integer invalid');
    assert_(mineTileValid_(NaN) === false, 'NaN invalid');
  });

  group('mineActionNotes_ never mentions the tile (public actorNote privacy rule)', function () {
    var notes = mineActionNotes_('Ana', 47);
    assert_(notes.text.indexOf('47') === -1, 'text must not contain the tile number');
    assert_(notes.actorNote.indexOf('47') === -1, 'actorNote must not contain the tile number (it is PUBLIC — see Views.gs)');
  });

  group('mergeLastSeen_ tie-breaks same-timestamp rows by id', function () {
    // Simulates a roll that immediately triggers a landmine: both rows
    // share `at`, and the higher id (the later insertAction_ call, e.g. the
    // mine trigger) must win.
    var rows = [
      { id: 10, at: '2026-09-20T09:00:00Z', actorId: 1, actorNote: 'Rolled a 4', targetId: '', targetNote: '' },
      { id: 11, at: '2026-09-20T09:00:00Z', actorId: 1, actorNote: 'Stepped on a landmine', targetId: '', targetNote: '' }
    ];
    var merged = mergeLastSeen_(rows);
    assert_(merged[1].note === 'Stepped on a landmine', 'higher id should win a same-timestamp tie, got: ' + merged[1].note);
  });

  // --- need the Players sheet (validateDisplayName_ checks uniqueness) ----

  if (hasSheets) {
    group('validateDisplayName_ accepts reasonable names', function () {
      // Suffixed with the clock so this can't collide with a real player's
      // name and produce a false FAIL from the (correct) uniqueness rule.
      var tag = String(Date.now()).slice(-4);
      assert_(validateDisplayName_('Zz' + tag, -1) === 'Zz' + tag, 'plain name');
      assert_(validateDisplayName_('  Ana-Lu' + tag + '  ', -1) === 'Ana-Lu' + tag, 'trims + hyphen');
    });

    group('validateDisplayName_ rejects too short/too long', function () {
      assertThrows_(function () { validateDisplayName_('', -1); }, 'empty');
      assertThrows_(function () { validateDisplayName_('a', -1); }, '1 char');
      assertThrows_(function () { validateDisplayName_(new Array(30).join('x'), -1); }, '29 chars');
    });

    group('validateDisplayName_ rejects email/url/all-digit/reserved', function () {
      ['jane@corp.com', 'www.x.com', 'http://x.com', '12345', 'admin', 'System'].forEach(function (bad) {
        assertThrows_(function () { validateDisplayName_(bad, -1); }, '"' + bad + '"');
      });
    });

    group('getLastSeenAll_ agrees with getLastSeen_ for every player', function () {
      var all = getLastSeenAll_();
      listPlayers_().forEach(function (p) {
        var single = getLastSeen_(p.id);
        var bulk = all[p.id] || null;
        assert_((single === null) === (bulk === null), 'presence mismatch for player #' + p.id);
        if (single) {
          assert_(single.note === bulk.note && single.at === bulk.at, 'value mismatch for player #' + p.id);
        }
      });
    });
  } else {
    skip('validateDisplayName_ tests');
    skip('getLastSeenAll_ vs getLastSeen_');
  }

  Logger.log(failures.length === 0 ? 'ALL TESTS PASSED' : failures.length + ' FAILURE(S): ' + failures.join(', '));
}
