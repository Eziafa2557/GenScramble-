/* GenScramble — the game rules. Pure state + transitions, no DOM.
   Tap a tray tile to send it to the first empty slot.
   Tap a filled slot to send the letter straight back to the tray.
   Fixing a wrong word is therefore return-a-letter, then place another one.
   There is no typing, no submit button and no keyboard anywhere in here.

   Every word is in one of three states, held in perWord:
     null        never played yet
     "solved"    unscrambled
     "skipped"   abandoned — but STILL OPEN. A skipped word is not deleted and
                 never counts as solved. The skipped words form a stack in the
                 order they were skipped, and Back walks it one stage at a time,
                 most recent first; the traversal section below explains why that
                 stack is read off perWord instead of being kept alongside it. */

window.GSGame = (function () {

  /* The two ways a word can be finished with. A skipped word is still open. */
  var SOLVED = "solved";
  var SKIPPED = "skipped";

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
      perWord: words.map(function () { return null; }) /* null | "solved" | "skipped" */
    };
  }

  function wordState(g, i) {
    return g.perWord[i] === undefined ? null : g.perWord[i];
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
      g.perWord[g.index] = SOLVED;
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

  /* ---------- the skipped stack ----------

     Skipped words form a STACK in the order they were skipped — the oldest skip
     at the bottom, the one you just passed on at the top. Back walks DOWN it, one
     stage per tap, and never jumps to the start of the race: skipping words 3, 4
     and 5 and then pressing Back gives 5, then 4, then 3. Word 1 turns up on Back
     only once it really is the previous stage.

     The stack does not need to be stored. The board only ever reaches a NEW word
     by scanning forward, so a word can only be skipped when the board arrives at
     it for the first time — every word below it already resolved. Words therefore
     enter the stack in index order, which makes "one stage down the stack" simply
     "the nearest skipped word below the one on screen". That is why prevSkipped /
     nextSkipped can be scans instead of a cursor, and why there is no second copy
     of the skipped set to drift out of step with perWord. Suite 4 pins both halves
     of that reasoning: the ordering property is asserted as an invariant, and the
     walk is checked against the literal 3-4-5 sequence above.

       Back   one stage DOWN — the previous skip. Refused at the bottom.
       Skip   forward to the next unplayed word; when there is none left, one
              stage through the stack, down first and then up. */

  /* The nearest skipped-unsolved word below `i` — the previous stage of the
     stack. -1 when the board is already at the bottom. */
  function prevSkipped(g, i) {
    for (var j = i - 1; j >= 0; j--) if (g.perWord[j] === SKIPPED) return j;
    return -1;
  }

  /* The nearest skipped-unsolved word above `i` — one stage the other way. */
  function nextSkipped(g, i) {
    for (var j = i + 1; j < g.words.length; j++) if (g.perWord[j] === SKIPPED) return j;
    return -1;
  }

  /* The first word after `from` that has never been played. Scanning only
     forward is enough, because a word is only ever left behind once it is
     resolved, so the first unplayed word is always at or ahead of the word on
     screen — invariant `perWord[i] === null implies i >= index`. Stepping back
     through the stack and moving on again therefore cannot strand an unplayed
     word behind you. */
  function firstUnplayed(g, from) {
    for (var i = from + 1; i < g.words.length; i++) {
      if (g.perWord[i] === null) return i;
    }
    return -1;
  }

  /* The next word to play once nothing is unplayed: down the stack, then up it,
     then -1 — nothing skipped anywhere, so nothing is left at all. The "up" leg
     is what keeps a solved word from ending the race while skipped ones sit above
     the board, which is how words 2 and 3 in the 4-3-2 walk still get their turn. */
  function openFrom(g, i) {
    var back = prevSkipped(g, i);
    return back !== -1 ? back : nextSkipped(g, i);
  }

  /* Back is only worth offering when there is a stage below this one. */
  function canGoBack(g) {
    return !!g && prevSkipped(g, g.index) !== -1;
  }

  function nextWord(g) {
    g.locked = false;
    var ahead = firstUnplayed(g, g.index);
    if (ahead !== -1) { startWord(g, ahead); return g; }
    /* Nothing unplayed ahead: work back through what is still skipped. -1 here
       means no word is skipped anywhere either, so every word was solved — the
       only way the game reaches "completedAll". */
    var next = openFrom(g, g.index);
    if (next === -1) return finish(g, true);
    startWord(g, next);
    return g;
  }

  /* Give up on the current word and take the next open one, tray and all. The
     word is marked skipped — it does NOT count as solved, and it stays in the
     race so Back can return to it. Refuses while a correct word is locked,
     exactly like a tile tap.
     The skipped word is deliberately NOT returned, so the answer never leaves
     this file on the skip path. */
  function skipWord(g) {
    if (blocked(g)) return { type: "ignored" };

    var from = g.index;
    g.perWord[from] = SKIPPED;
    g.locked = false;

    /* Forward through the words you have not seen yet: that is the order of work
       — the word on screen, then later unplayed words, then leftover skipped. */
    var ahead = firstUnplayed(g, from);
    if (ahead !== -1) {
      startWord(g, ahead);
      return { type: "skip", finished: false, index: ahead };
    }

    /* Nothing unplayed left. Move one stage through the stack — down towards the
       oldest skip, or up towards the most recent one when the board is already at
       the bottom. Either way it is ONE stage, and the race only ends when there
       is no stage left at all, so a skip can never throw away a word that is
       still open: at worst it ends with this word as the only one left unsolved. */
    var next = openFrom(g, from);
    if (next === -1) {
      finish(g, false);
      return { type: "skip", finished: true };
    }
    startWord(g, next);
    return { type: "skip", finished: false, index: next };
  }

  /* Back one stage: the skipped word you just left, not the first skip of the
     race. The tray is rebuilt from the same seed, so the word looks exactly as
     it did the first time. */
  function backToSkipped(g) {
    if (blocked(g)) return { type: "ignored" };
    var at = prevSkipped(g, g.index);
    if (at === -1) return { type: "ignored" };
    startWord(g, at);
    return { type: "back", index: at };
  }

  function finish(g, completedAll, at) {
    g.status = "finished";
    g.locked = true;
    g.completedAll = !!completedAll;
    /* Untouched words stay null: they read as "not solved" everywhere, and they
       must not be mistaken for skipped words (Back is refused once finished). */
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
        return { word: w, solved: g.perWord[i] === SOLVED };
      })
    };
  }

  return {
    createGame: createGame,
    start: start,
    startWord: startWord,
    nextWord: nextWord,
    skipWord: skipWord,
    backToSkipped: backToSkipped,
    canGoBack: canGoBack,
    wordState: wordState,
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
