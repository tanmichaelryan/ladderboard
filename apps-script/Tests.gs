// Post-deploy smoke check for the two things that only exist on a REAL
// Google Sheet, not the local test/ harness's in-memory one: whether
// validateDisplayName_'s uniqueness check (Names.gs) sees this
// spreadsheet's actual Players rows, and whether getLastSeenAll_'s
// single-read optimization (Repo.gs) agrees with getLastSeen_'s per-player
// reads against this spreadsheet's actual Actions rows. Everything else
// this file used to cover — every pure function in Derive.gs/Names.gs/
// Roll.gs/Use.gs/Theme.gs, and the engine/render/entry-point behavior that
// needs a Sheet but not necessarily THIS one — now runs locally and much
// faster via `npm test` (see test/ at the repo root, and its README-style
// comments in test/harness.js for how that works). Run this from the Apps
// Script editor (select `runTests` from the function dropdown, check
// View > Logs for PASS/FAIL/SKIP) after any deploy that touches Names.gs
// or Repo.gs's getLastSeenAll_ — it is the one check that can only run
// against the real spreadsheet.

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

  if (hasSheets) {
    group('validateDisplayName_ accepts reasonable names (reads real Players for uniqueness)', function () {
      // Suffixed with the clock so this can't collide with a real player's
      // name and produce a false FAIL from the (correct) uniqueness rule.
      var tag = String(Date.now()).slice(-4);
      assert_(validateDisplayName_('Zz' + tag, -1) === 'Zz' + tag, 'plain name');
      assert_(validateDisplayName_('  Ana-Lu' + tag + '  ', -1) === 'Ana-Lu' + tag, 'trims + hyphen');
    });

    group('getLastSeenAll_ agrees with getLastSeen_ for every real player', function () {
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
    skip('validateDisplayName_ accepts reasonable names');
    skip('getLastSeenAll_ vs getLastSeen_');
  }

  Logger.log(failures.length === 0 ? 'ALL TESTS PASSED' : failures.length + ' FAILURE(S): ' + failures.join(', '));
}
