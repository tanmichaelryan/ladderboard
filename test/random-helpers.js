'use strict';

// roll_'s die face (Random.gs's randomInt_) and the item gacha's draws
// (pickRandom_'s default picker) both go through Math.random() with no
// injectable seam of their own — unlike drawItems_, which accepts an
// explicit `pick` override. To make a specific roll_/useItem_('double')
// outcome deterministic in a test, monkey-patch the harness's OWN Math
// object (each createHarness() call gets its own vm-context Math, so this
// never leaks between tests) with a fixed queue of return values.

/**
 * @param {object} globals  a harness's `.globals`
 * @param {number[]} values  consumed in order, one per Math.random() call
 * @returns {() => void} restores the real Math.random
 */
function withFixedRandom(globals, values) {
  const queue = values.slice();
  const real = globals.Math.random;
  globals.Math.random = () => {
    if (queue.length === 0) {
      throw new Error('withFixedRandom: Math.random() called more times than values were queued — ' +
        'add another value or the test is under-specified.');
    }
    return queue.shift();
  };
  return () => { globals.Math.random = real; };
}

/**
 * The Math.random() return value that makes randomInt_(1, 6) produce
 * `face`. Uses the middle of the target bucket, not its lower edge —
 * randomInt_'s floor(r * 6) is exact at a bucket's lower edge only when
 * that fraction happens to be exactly representable in binary (e.g. 3/6),
 * and isn't for others (1/6 * 6 evaluates to 0.9999999999999999 in IEEE
 * double, not 1 — which would floor into the WRONG bucket). The midpoint
 * has enough margin either side to absorb that error.
 */
function dieFaceValue(face) {
  if (!Number.isInteger(face) || face < 1 || face > 6) throw new Error('dieFaceValue: face must be 1-6, got ' + face);
  return (face - 1 + 0.5) / 6;
}

/** Same bucket-midpoint reasoning as dieFaceValue, for pickRandom_'s default
 *  picker: the Math.random() value that makes it choose `pool[index]`. */
function poolIndexValue(pool, index) {
  if (index < 0 || index >= pool.length) throw new Error('poolIndexValue: index out of range for pool of length ' + pool.length);
  return (index + 0.5) / pool.length;
}

module.exports = { withFixedRandom, dieFaceValue, poolIndexValue };
