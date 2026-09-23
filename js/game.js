/* GenScramble — the game rules. Pure state + transitions, no DOM.
   Tap a tray tile to send it to the first empty slot.
   Tap a filled slot to send the letter straight back to the tray.
   Fixing a wrong word is therefore return-a-letter, then place another one.
   There is no typing, no submit button and no keyboard anywhere in here. */

window.GSGame = (function () {

  function createGame(config) {
    var cfg = config || {};
    var words = (cfg.words || []).map(function (w) { return String(w).toUpperCase(); });
    return {
      words: words,
      index: 0,
      tray: [],
      answer: [],
      solved: 0,
      locked: false,
      status: "idle",              /* idle | playing | finished */
      scrambleSeed: cfg.scrambleSeed || GSScramble.makeSeed(),
      durationMs: cfg.durationMs || 180000,
      startedAt: null,
      finishedAt: null,
      timeUsedMs: null,
      completedAll: false,
      perWord: words.map(function () { return null; }) /* true | false | null */
    };
  }

  function currentTarget(g) {
    return g.words[g.index] || "";
  }

  function currentWord(g) {
    return g.answer.map(function (c) { return c === null ? "" : c; }).join("");
  }

  function isFull(g) {
    for (var i = 0; i < g.answer.length; i++) if (g.answer[i] === null) return false;
    return g.answer.length > 0;
  }

  function firstEmptySlot(g) {
    for (var i = 0; i < g.answer.length; i++) if (g.answer[i] === null) return i;
    return -1;
  }

  /* Lay out one word: empty slots sized to the target, tray scrambled. */
  function startWord(g, atIndex) {
    if (typeof atIndex === "number") g.index = atIndex;
    var target = currentTarget(g);
    g.answer = [];
    for (var i = 0; i < target.length; i++) g.answer.push(null);
    g.tray = GSScramble.scrambleWord(
      target,
      GSScramble.wordSeed(g.scrambleSeed, g.index, target)
    );
    g.locked = false;
    return g;
  }

  function start(g, at) {
    g.status = "playing";
    g.startedAt = typeof at === "number" ? at : Date.now();
    g.finishedAt = null;
    g.timeUsedMs = null;
    g.completedAll = false;
    g.solved = 0;
    g.index = 0;
    g.perWord = g.words.map(function () { return null; });
    startWord(g, 0);
    return g;
  }

  /* ---------- the one check that matters ---------- */

  function checkSolve(g) {
    if (!isFull(g)) return "incomplete";
    return currentWord(g) === currentTarget(g) ? "solved" : "wrong";
  }

  function settle(g, type) {
    var result = checkSolve(g);
    if (result === "solved") {
      g.locked = true;
      g.solved += 1;
      g.perWord[g.index] = true;
    }
    return { type: type, result: result, word: currentWord(g), target: currentTarget(g) };
  }

  function blocked(g) {
    return g.status !== "playing" || g.locked;
  }

  /* ---------- the only three inputs ---------- */

  /* Tap a tray tile -> first empty slot. */
  function applyTapTray(g, i) {
    if (blocked(g)) return { type: "ignored", result: null };
    if (i < 0 || i >= g.tray.length) return { type: "ignored", result: null };

    var slot = firstEmptySlot(g);
    if (slot === -1) return { type: "full", result: null };

    var letter = g.tray.splice(i, 1)[0];
    g.answer[slot] = letter;
    return settle(g, "move");
  }

  /* Tap a filled slot: that letter goes straight back to the tray. */
  function applyTapAnswer(g, i) {
    if (blocked(g)) return { type: "ignored", result: null };
    if (i < 0 || i >= g.answer.length) return { type: "ignored", result: null };
    if (g.answer[i] === null) return { type: "ignored", result: null };

    g.tray.push(g.answer[i]);
    g.answer[i] = null;
    return settle(g, "return");
  }

  /* Shuffle the tray ONLY. The answer row is never disturbed. */
  function shuffleTray(g) {
    if (blocked(g)) return { type: "ignored" };

    var before = g.tray.join("");
    var target = currentTarget(g);
    var out = GSScramble.shuffle(g.tray);
    var guard = 0;

    /* The tray must never happen to spell the answer. */
    while (out.join("") === target && guard < 10) {
      out = GSScramble.shuffle(g.tray);
      guard += 1;
    }
    if (out.join("") === target) out = swapTwo(out);

    /* Make sure a tap did something visible when the tray allows it. */
    guard = 0;
    while (out.join("") === before && out.length > 1 && guard < 10) {
      out = GSScramble.shuffle(g.tray);
      guard += 1;
    }
    if (out.join("") === before && out.length > 1) out = swapTwo(out);

    /* Last word on the target, AFTER the loop above. Both loops reshuffle from
       g.tray, so the second one can walk back onto the answer and nothing used
       to check again — for a word with few arrangements that is a live leak
       (LLM: about 1 shuffle in 80 left the tray spelling the answer). */
    if (out.join("") === target) out = swapTwo(out);

    g.tray = out;
    return { type: "shuffle" };
  }

  function swapTwo(letters) {
    var out = letters.slice();
    for (var i = 0; i < out.length; i++) {
      for (var j = i + 1; j < out.length; j++) {
        if (out[i] !== out[j]) {
          var tmp = out[i];
          out[i] = out[j];
          out[j] = tmp;
          return out;
        }
      }
    }
    return out;
  }

  /* ---------- advancing ---------- */

  function nextWord(g) {
    g.locked = false;
    if (g.index + 1 >= g.words.length) {
      return finish(g, true);
    }
    startWord(g, g.index + 1);
    return g;
  }

  function finish(g, completedAll, at) {
    g.status = "finished";
    g.locked = true;
    g.completedAll = !!completedAll;
    for (var i = 0; i < g.perWord.length; i++) if (g.perWord[i] === null) g.perWord[i] = false;
    g.finishedAt = typeof at === "number" ? at : Date.now();
    var used = g.finishedAt - g.startedAt;
    g.timeUsedMs = completedAll ? used : g.durationMs;
    return g;
  }

  function results(g) {
    return {
      solved: g.solved,
      total: g.words.length,
      timeUsedMs: g.timeUsedMs === null ? g.durationMs : g.timeUsedMs,
      completedAll: g.completedAll,
      words: g.words.map(function (w, i) {
        return { word: w, solved: g.perWord[i] === true };
      })
    };
  }

  return {
    createGame: createGame,
    start: start,
    startWord: startWord,
    nextWord: nextWord,
    finish: finish,
    checkSolve: checkSolve,
    applyTapTray: applyTapTray,
    applyTapAnswer: applyTapAnswer,
    shuffleTray: shuffleTray,
    currentTarget: currentTarget,
    currentWord: currentWord,
    isFull: isFull,
    firstEmptySlot: firstEmptySlot,
    results: results
  };
})();
