/* GenScramble — deterministic scrambling.
   Every player in a room gets the SAME 20 words but a DIFFERENT tray order,
   because the shuffle is seeded from (room.scrambleSeed + word index + word).
   Same inputs always produce the same tray, so a race is reproducible. */

window.GSScramble = (function () {

  /* ---------- deterministic RNG (mulberry32) ---------- */

  function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomInt(max) {
    return Math.floor(Math.random() * max);
  }

  /* Stable 32-bit string hash — used to turn a room seed into a tray seed. */
  function hashCode(str) {
    var h = 2166136261;
    var s = String(str);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function makeSeed() {
    return hashCode(String(Date.now()) + ":" + String(Math.random()));
  }

  /* ---------- shuffling ---------- */

  function shuffleWith(list, rng) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function shuffle(list) {
    return shuffleWith(list, makeRng(makeSeed()));
  }

  function sameOrder(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /* Force at least one letter to move, for words where a plain swap is
     impossible or useless (e.g. every letter identical). */
  function forceChange(letters, rng) {
    var n = letters.length;
    if (n < 2) return letters;
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        if (letters[i] !== letters[j]) {
          var out = letters.slice();
          var tmp = out[i];
          out[i] = out[j];
          out[j] = tmp;
          return out;
        }
      }
    }
    return letters;
  }

  /* Scramble one word. Never returns the target itself (10 tries, then a
     guaranteed swap) and never returns the target in order. */
  function scrambleWord(word, seed) {
    var target = String(word).toUpperCase();
    var letters = target.split("");
    var rng = makeRng((seed >>> 0) || hashCode(target));

    var attempt = letters;
    for (var i = 0; i < 10; i++) {
      attempt = shuffleWith(letters, rng);
      if (!sameOrder(attempt, letters)) return attempt;
    }
    return forceChange(letters, rng);
  }

  /* The tray seed for one word of one player's race. */
  function wordSeed(scrambleSeed, index, word) {
    return hashCode(String(scrambleSeed) + ":" + String(index) + ":" + String(word).toUpperCase());
  }

  /* ---------- picking the 20 ---------- */

  /* count distinct words, no replacement. */
  function pickWords(pool, count, rng) {
    var source = (pool || []).slice();
    var out = [];
    var pick = rng || Math.random;
    while (out.length < count && source.length > 0) {
      var i = Math.floor(pick() * source.length);
      out.push(source.splice(i, 1)[0]);
    }
    return out;
  }

  /* ---------- room codes ---------- */

  /* No I, O, 0 or 1 — a code is read off a phone screen and typed by hand. */
  var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function randomCode() {
    var out = "";
    for (var i = 0; i < 4; i++) out += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
    return out;
  }

  return {
    CODE_ALPHABET: CODE_ALPHABET,
    makeRng: makeRng,
    makeSeed: makeSeed,
    randomInt: randomInt,
    hashCode: hashCode,
    shuffle: shuffle,
    shuffleWith: shuffleWith,
    scrambleWord: scrambleWord,
    wordSeed: wordSeed,
    pickWords: pickWords,
    randomCode: randomCode
  };
})();
