// The roll animation: a tumbling die that settles on the real face, then
// the roller's own board token hopping tile-by-tile to where it landed and,
// if a ladder/snake was hit, sliding along the drawn connector to its
// destination. Inlined into the page by RenderPage.gs, exposed as
// window.LadderAnim so it's addressable both from the console's Roll button
// (RenderConsole.gs) and by hand from the browser console when iterating on
// dev/preview.html — see that file's header comment.
//
// Deliberately decoupled from google.script.run: LadderAnim.play(result)
// takes the plain object serverRoll (Code.gs) returns and owns the
// eventual location.reload() itself, so it can be exercised against
// hand-written fixture objects with no server round-trip at all.
//
// Failure safety is the point of this file's structure, not an
// afterthought: every path — missing DOM, a null/no-op result, a bug in the
// animation math itself — funnels through done_(), which is guarded by a
// hard timeout. A broken animation must never strand the player looking at
// a stale board.

var ANIM_CLIENT_SCRIPT_ = `
var LadderAnim = (function () {
  var STEP_MS = 110;        // per-tile hop
  var TRAVERSE_MS = 600;    // ladder/snake slide
  var DIE_MIN_MS = 700;     // tumble floor, so a fast server reply never flashes past
  var DIE_SETTLE_MS = 260;
  var HARD_TIMEOUT_MS = 4000;

  function reducedMotion() {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  function tileEl(grid, n) { return grid.querySelector('[data-tile="' + n + '"]'); }

  function centerOf(el, originRect) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - originRect.left, y: r.top + r.height / 2 - originRect.top };
  }

  function place(el, pt) { el.style.left = pt.x + 'px'; el.style.top = pt.y + 'px'; }

  function showDie(layer, originRect, face, reduced) {
    var die = document.createElement('div');
    die.className = 'roll-die is-tumbling';
    die.style.left = (originRect.width / 2) + 'px';
    die.style.top = (originRect.height / 2) + 'px';
    for (var i = 0; i < 9; i++) die.appendChild(document.createElement('div')).className = 'roll-pip';
    layer.appendChild(die);
    return new Promise(function (resolve) {
      setTimeout(function () {
        die.classList.remove('is-tumbling');
        die.setAttribute('data-face', String(face));
        die.classList.add('is-settled');
        setTimeout(function () { die.remove(); resolve(); }, reduced ? 0 : DIE_SETTLE_MS);
      }, reduced ? 0 : DIE_MIN_MS);
    });
  }

  // Builds the pixel-center path (start point included) for a hop from
  // tokenEl's current position through each intervening tile up to
  // landedOn. Tile 0 (the start rail) has no grid cell, so the first point
  // is just wherever the token already visually is.
  function buildHopPath(grid, originRect, tokenEl, fromTile, landedOn) {
    var path = [centerOf(tokenEl, originRect)];
    var start = Math.max(fromTile, 0) + 1;
    for (var n = start; n <= landedOn; n++) {
      var el = tileEl(grid, n);
      if (el) path.push(centerOf(el, originRect));
    }
    return path;
  }

  function hopToken(layer, tokenEl, path, reduced) {
    var clone = document.createElement('div');
    clone.className = tokenEl.className + ' roll-hop-token';
    var color = tokenEl.style.getPropertyValue('--token-color');
    if (color) clone.style.setProperty('--token-color', color);
    clone.textContent = tokenEl.textContent;
    place(clone, path[0]);
    layer.appendChild(clone);
    tokenEl.style.visibility = 'hidden';

    var i = 1;
    return new Promise(function (resolve) {
      (function step() {
        if (i >= path.length) { resolve(clone); return; }
        place(clone, path[i++]);
        setTimeout(step, reduced ? 0 : STEP_MS);
      })();
    });
  }

  // Walks the matching overlay connector's own geometry (exact for a
  // snake's <path>, a rail-midline lerp for a ladder) so the token
  // literally rides the drawn shape. Falls back to a straight lerp between
  // tile centers if no connector matches to->landedOn exactly — this can
  // happen when a mine on the connector's destination tile knocks the
  // player further back than the ladder/snake itself would (Roll.gs), so
  // the connector's own data-to won't equal the roll result's final tile.
  function traverse(grid, originRect, svg, clone, fromTile, toTile, reduced) {
    // hopToken's CSS transition (left/top) would fight per-frame rAF
    // updates here — turn it off for the continuous slide.
    clone.style.transition = 'none';
    var group = svg && svg.querySelector('g[data-from="' + fromTile + '"][data-to="' + toTile + '"]');
    var duration = reduced ? 0 : TRAVERSE_MS;

    function runFrames(pointAt) {
      return new Promise(function (resolve) {
        var start = null;
        function frame(ts) {
          if (start === null) start = ts;
          var t = duration === 0 ? 1 : Math.min(1, (ts - start) / duration);
          place(clone, pointAt(t));
          if (t < 1) requestAnimationFrame(frame); else resolve();
        }
        requestAnimationFrame(frame);
      });
    }

    if (group) {
      var isSnake = group.classList.contains('conn--snake');
      var ctm = svg.getScreenCTM();
      function unitToPx(pt) {
        var svgPt = svg.createSVGPoint();
        svgPt.x = pt.x; svgPt.y = pt.y;
        var s = svgPt.matrixTransform(ctm);
        return { x: s.x - originRect.left, y: s.y - originRect.top };
      }
      if (isSnake && ctm) {
        var body = group.querySelector('.conn-snake-body');
        var total = body.getTotalLength();
        return runFrames(function (t) {
          var pt = body.getPointAtLength(t * total);
          return unitToPx(pt);
        });
      }
      if (!isSnake && ctm) {
        var rails = group.querySelectorAll('.conn-rail');
        if (rails.length >= 2) {
          var r1 = rails[0], r2 = rails[1];
          var ax = (parseFloat(r1.getAttribute('x1')) + parseFloat(r2.getAttribute('x1'))) / 2;
          var ay = (parseFloat(r1.getAttribute('y1')) + parseFloat(r2.getAttribute('y1'))) / 2;
          var bx = (parseFloat(r1.getAttribute('x2')) + parseFloat(r2.getAttribute('x2'))) / 2;
          var by = (parseFloat(r1.getAttribute('y2')) + parseFloat(r2.getAttribute('y2'))) / 2;
          return runFrames(function (t) {
            return unitToPx({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
          });
        }
      }
    }

    // Fallback: straight pixel-space lerp between the two tile elements.
    var a = tileEl(grid, fromTile), b = tileEl(grid, toTile);
    if (!a || !b) return Promise.resolve();
    var pa = centerOf(a, originRect), pb = centerOf(b, originRect);
    return runFrames(function (t) {
      return { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
    });
  }

  function play(result) {
    var settled = false;
    var reload = function () { try { location.reload(); } catch (e) {} };

    return new Promise(function (finish) {
      function done() {
        if (settled) return;
        settled = true;
        reload();
        finish();
      }
      var hardTimeout = setTimeout(done, HARD_TIMEOUT_MS);

      function skip(e) {
        // Click-to-skip: bail straight to the reload rather than waiting
        // out the sequence.
        done();
      }

      try {
        if (!result || result.playerId == null) { done(); return; }

        var grid = document.querySelector('.board-grid');
        var tokenEl = document.querySelector('[data-player-id="' + result.playerId + '"]');
        if (!grid || !tokenEl) { done(); return; }

        var reduced = reducedMotion();
        var originRect = grid.getBoundingClientRect();
        var layer = document.createElement('div');
        layer.className = 'roll-anim-layer';
        layer.style.pointerEvents = 'auto';
        layer.addEventListener('click', skip);
        grid.appendChild(layer);

        showDie(layer, originRect, result.value, reduced).then(function () {
          if (settled) return;
          var landedOn = result.landedOn;
          var path = buildHopPath(grid, originRect, tokenEl, result.from, landedOn);
          return hopToken(layer, tokenEl, path, reduced).then(function (clone) {
            if (settled) return;
            if (result.via && result.to !== landedOn) {
              var svg = grid.querySelector('.connector-svg');
              return traverse(grid, originRect, svg, clone, landedOn, result.to, reduced);
            }
          });
        }).then(function () {
          setTimeout(done, reduced ? 0 : 180);
        }).catch(function () {
          done();
        });
      } catch (e) {
        done();
      }
    });
  }

  return { play: play };
})();
`;
