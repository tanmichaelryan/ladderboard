// Randomness, isolated behind two small functions so power-up logic can be
// tested with an injected `pick` instead of the real Math.random(). Before
// this file, three call sites called Math.random() directly (a d6 roll, the
// item gacha, and PULL's old 4-8 distance) with no test seam at all.

/** Integer in [min, max], inclusive. */
function randomInt_(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Picks one element of `arr` uniformly at random. `pick` is injectable so
 * tests can make this deterministic — e.g. `pickRandom_(pool, function (a) {
 * return a[0]; })` — without touching Math.random() at all.
 */
function pickRandom_(arr, pick) {
  pick = pick || function (a) { return a[Math.floor(Math.random() * a.length)]; };
  return pick(arr);
}
