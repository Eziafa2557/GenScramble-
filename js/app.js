/* GenScramble — app wiring.
   Screens, taps and the race lifecycle. All game rules live in game.js,
   all rooms in rooms.js, all DOM in ui.js, all timing in timer.js.

   Room calls are asynchronous now (Firebase Realtime Database), so Create, Join,
   Start, Leave, patchProgress and getRoom all go through .then(). GSRooms promises
   always RESOLVE, so the rule is "check res.ok"; .catch() is only a last-resort
   guard against an unexpected throw. The tile game itself is untouched. */

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var S = {
    mode: "solo",        /* solo | room */
    roomCode: null,
    me: "",
    game: null,
    timer: null,
    durationMs: 180000,
    createDurationMs: 180000,
    raceOver: true,
    solveHandle: null,
    raceStartedKey: null, /* "<code>:<startedAt>" — the Start button and the live room both land here */
    endReason: ""         /* words | skipped | timer — only chooses the results title */
  };

  var DEFAULT_DURATION = 180000;

  function warn(where, err) {
    if (window.console && window.console.warn) window.console.warn("GenScramble: " + where, err);
  }

  /* ================= navigation ================= */

  function go(name) {
    if (name === "home") resetToHome();
    GSUI.showScreen(name);
  }

  function resetToHome() {
    stopTimer();
    cancelSolveTimer();
    leaveRoomChannel();
    S.raceOver = true;
    S.game = null;
    S.roomCode = null;
    S.mode = "solo";
    S.raceStartedKey = null;
  }

  function leaveRoomChannel() {
    if (S.roomCode) GSRooms.unsubscribe(S.roomCode);
  }

  /* ================= race lifecycle ================= */

  function cancelSolveTimer() {
    if (S.solveHandle !== null) {
      window.clearTimeout(S.solveHandle);
      S.solveHandle = null;
    }
  }

  function stopTimer() {
    if (S.timer) {
      S.timer.stop();
      S.timer = null;
    }
  }

  function startTimer() {
    stopTimer();
    S.timer = GSTimer.create({
      durationMs: S.game.durationMs,
      onTick: function (remaining) { GSUI.setClock(remaining); },
      onExpire: function () { endRace(false); }
    });
    S.timer.start(S.game.startedAt);
  }

  function startSolo() {
    S.mode = "solo";
    S.roomCode = null;
    S.me = GSStorage.loadName() || "You";
    S.durationMs = DEFAULT_DURATION;
    S.raceStartedKey = null;
    S.game = GSGame.createGame({
      words: GSScramble.pickWords(GS_wordsInRange(), GSRooms.WORDS_PER_RACE),
      durationMs: S.durationMs
    });
    GSGame.start(S.game);
    GSUI.renderBoard(S.game);
    GSUI.setClock(S.game.durationMs);
    S.raceOver = false;
    startTimer();
    GSUI.showScreen("play");
  }

  function beginRoomRace(room) {
    /* The host's Start button and the live room update both reach this, and the
       order depends on the network — so the first one wins and the other is a no-op. */
    var key = room.code + ":" + room.startedAt;
    if (S.raceStartedKey === key) return;
    S.raceStartedKey = key;

    S.mode = "room";
    S.roomCode = room.code;
    S.durationMs = room.durationMs;
    S.game = GSGame.createGame({
      words: room.words,
      durationMs: room.durationMs,
      scrambleSeed: GSRooms.playerSeed(room, S.me)
    });
    GSGame.start(S.game);
    GSUI.renderBoard(S.game);
    GSUI.setClock(S.game.durationMs);
    S.raceOver = false;
    startTimer();
    GSUI.showScreen("play");
  }

  /* Fires once, whether the player finished all 20 or the clock ran out. */
  function endRace(completedAll, reason) {
    if (S.raceOver) return;
    S.raceOver = true;
    S.endReason = reason || (completedAll ? "words" : "timer");
    cancelSolveTimer();
    stopTimer();
    GSUI.setSkipEnabled(false);   /* nothing left to skip or to go back to */
    GSUI.setBackEnabled(false);

    var g = S.game;
    if (g.status !== "finished") GSGame.finish(g, completedAll);

    var res = GSGame.results(g);

    if (S.mode === "room" && S.roomCode) {
      GSRooms.patchProgress(S.roomCode, S.me, {
        solved: res.solved,
        timeUsedMs: res.timeUsedMs,
        finishedAt: g.finishedAt
      }).catch(function (err) { warn("patchProgress", err); });
    } else {
      GSStorage.addSoloRun({
        solved: res.solved,
        total: res.total,
        timeUsedMs: res.timeUsedMs,
        completedAll: res.completedAll,
        at: g.finishedAt
      });
    }

    renderResults(res);
    GSUI.showScreen("results");
  }

  function resultSubtitle(res, isRoom) {
    var text = res.solved + " of " + res.total + " unscrambled in " +
      GSTimer.formatClock(res.timeUsedMs) + ".";

    if (!isRoom) {
      var best = bestSoloTime();
      /* Only a run that unscrambled all 20 can BE a personal best — bestSoloTime
         stores nothing else. A clock-out or a skip-to-the-end is timed at the full
         duration, so without this gate a best recorded right at the wire would
         hand "New personal best." to every run after it. */
      if (best !== null && res.completedAll && res.timeUsedMs <= best) {
        text += " New personal best.";
      } else if (best !== null) {
        text += " Best: " + GSTimer.formatClock(best) + ".";
      }
    }
    return text;
  }

  /* Three ways to stop, and the copy has to name the right one: the clock ran
     out, every word was solved, or the player skipped their way to the end. */
  function resultTitle(res) {
    if (res.completedAll) return "You unscrambled all " + res.total;
    if (S.endReason === "skipped") return "Out of words. Score locked.";
    return "Timer ended. Score locked.";
  }

  function renderResults(res) {
    var isRoom = S.mode === "room" && !!S.roomCode;

    var view = {
      title: resultTitle(res),
      subtitle: resultSubtitle(res, isRoom),
      solved: res.solved,
      total: res.total,
      timeUsedMs: res.timeUsedMs,
      words: res.words,
      ranked: null,
      me: S.me
    };

    /* Paint the score at once; the ranking lands as soon as the room does. */
    GSUI.renderResults(view);
    if (!isRoom) return;

    var code = S.roomCode;
    GSRooms.getRoom(code).then(function (room) {
      if (!room || GSUI.currentScreen() !== "results") return;
      view.ranked = GSRooms.ranked(room);
      GSUI.renderResults(view);
    }).catch(function (err) { warn("results ranking", err); });
  }

  function bestSoloTime() {
    var runs = GSStorage.loadSoloRuns();
    var best = null;
    runs.forEach(function (run) {
      if (run.completedAll && typeof run.timeUsedMs === "number") {
        if (best === null || run.timeUsedMs < best) best = run.timeUsedMs;
      }
    });
    return best;
  }

  function playAgain() {
    if (!S.game) { go("home"); return; }
    cancelSolveTimer();

    var game = GSGame.createGame({
      words: S.game.words,
      durationMs: S.game.durationMs,
      scrambleSeed: S.game.scrambleSeed      /* same trays — beat your own time */
    });
    S.game = game;
    GSGame.start(game);
    S.raceStartedKey = null;

    if (S.mode === "room" && S.roomCode) {
      GSRooms.patchProgress(S.roomCode, S.me, { solved: 0, timeUsedMs: null, finishedAt: null })
        .catch(function (err) { warn("patchProgress", err); });
    }

    GSUI.renderBoard(game);
    GSUI.setClock(game.durationMs);
    S.raceOver = false;
    startTimer();
    GSUI.showScreen("play");
  }

  /* ================= taps ================= */

  function handleResult(res) {
    if (!res || res.type === "ignored") return;

    if (res.result === "solved") {
      GSUI.renderBoard(S.game);
      GSUI.flashAnswer();
      S.solveHandle = window.setTimeout(function () {
        S.solveHandle = null;
        GSGame.nextWord(S.game);
        if (S.game.status === "finished") {
          endRace(true);
          return;
        }
        GSUI.renderBoard(S.game);
      }, 200);
      return;
    }

    if (res.result === "wrong") {
      GSUI.renderBoard(S.game);
      GSUI.shakeAnswer();
      return;
    }

    GSUI.renderBoard(S.game);
  }

  function onTrayTap(event) {
    var btn = event.target.closest ? event.target.closest("button[data-i]") : null;
    if (!btn) return;
    var i = parseInt(btn.getAttribute("data-i"), 10);
    if (isNaN(i)) return;
    handleResult(GSGame.applyTapTray(S.game, i));
  }

  function onAnswerTap(event) {
    var btn = event.target.closest ? event.target.closest("button[data-i]") : null;
    if (!btn) return;
    var i = parseInt(btn.getAttribute("data-i"), 10);
    if (isNaN(i)) return;
    handleResult(GSGame.applyTapAnswer(S.game, i));
  }

  function onShuffle() {
    if (!S.game || S.raceOver) return;
    GSGame.shuffleTray(S.game);
    GSUI.renderBoard(S.game);
  }

  /* Abandon this word and take the next open one. No flash, no toast, no answer —
     the board simply moves on. The rules live in GSGame.skipWord; this only wires
     it. A skipped word stays in the race, so a skip ends the race only when it
     leaves nothing else open — either every other word was solved, or this was
     the only skipped word and there are no unplayed words left. */
  function onSkip() {
    if (!S.game || S.raceOver) return;

    var res = GSGame.skipWord(S.game);
    if (!res || res.type === "ignored") return;   /* mid-flash, or already finished */

    if (S.game.status === "finished") {           /* nothing left to play */
      endRace(false, "skipped");
      return;
    }
    GSUI.renderBoard(S.game);
  }

  /* Go back one stage through the skipped words — the one you just left, not the
     first skip of the race. Same guard as Skip: refused mid-flash, and a no-op at
     the bottom of the stack. */
  function onBack() {
    if (!S.game || S.raceOver) return;

    var res = GSGame.backToSkipped(S.game);
    if (!res || res.type === "ignored") return;

    GSUI.renderBoard(S.game);
  }

  /* ================= waiting room ================= */

  function enterWaiting(room) {
    S.mode = "room";
    S.roomCode = room.code;
    GSUI.renderWaiting(room, S.me);
    GSUI.showScreen("waiting");
    GSRooms.subscribe(room.code, onRoomUpdate);
  }

  /* The room changed on the server: another player joined, or the host started. */
  function onRoomUpdate(room) {
    if (!room) {
      /* Deleted because everyone left, or older than six hours. */
      if (GSUI.currentScreen() === "waiting") {
        GSRooms.unsubscribe(S.roomCode);
        S.roomCode = null;
        S.mode = "solo";
        S.raceOver = true;
        GSUI.toast("That room is gone.");
        go("home");
      }
      return;
    }

    /* Only the waiting room follows the server. The play and results screens are
       driven locally, so a late update must not restart anything. */
    if (GSUI.currentScreen() !== "waiting") return;

    GSUI.renderWaiting(room, S.me);
    if (room.status === "racing") beginRoomRace(room);
  }

  function showError(id, message) {
    var node = $(id);
    if (!node) return;
    node.textContent = message || "";
    node.hidden = !message;
  }

  /* ================= events ================= */

  function bind() {
    /* static navigation buttons */
    var goButtons = document.querySelectorAll("[data-go]");
    for (var i = 0; i < goButtons.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          go(btn.getAttribute("data-go"));
        });
      })(goButtons[i]);
    }

    /* home */
    $("btn-solo").addEventListener("click", startSolo);

    /* create */
    var durationWrap = $("create-duration");
    durationWrap.addEventListener("click", function (event) {
      var btn = event.target.closest ? event.target.closest(".seg-btn") : null;
      if (!btn) return;
      var buttons = durationWrap.querySelectorAll(".seg-btn");
      for (var k = 0; k < buttons.length; k++) buttons[k].classList.remove("is-on");
      btn.classList.add("is-on");
      S.createDurationMs = parseInt(btn.getAttribute("data-ms"), 10) || DEFAULT_DURATION;
    });

    $("btn-create").addEventListener("click", function () {
      var btn = $("btn-create");
      var name = GSRooms.normalizeName($("create-name").value);
      btn.disabled = true;
      GSRooms.createRoom({ hostName: name, durationMs: S.createDurationMs })
        .then(function (res) {
          btn.disabled = false;
          if (!res || !res.ok) {
            showError("create-error", (res && res.error) || "Could not create the room.");
            return;
          }
          showError("create-error", "");
          S.me = res.room.hostName;
          GSStorage.saveName(S.me);
          enterWaiting(res.room);
        })
        .catch(function (err) {
          btn.disabled = false;
          warn("createRoom", err);
          showError("create-error", "Could not create the room. Check your connection.");
        });
    });

    /* join */
    $("join-code").addEventListener("input", function () {
      this.value = GSRooms.normalizeCode(this.value);
    });

    $("btn-join").addEventListener("click", function () {
      var btn = $("btn-join");
      var code = GSRooms.normalizeCode($("join-code").value);
      var name = GSRooms.normalizeName($("join-name").value);
      btn.disabled = true;
      GSRooms.joinRoom(code, name)
        .then(function (res) {
          btn.disabled = false;
          if (!res || !res.ok) {
            showError("join-error", (res && res.error) || "Could not join the room.");
            return;
          }
          showError("join-error", "");
          S.me = name;
          GSStorage.saveName(name);
          enterWaiting(res.room);
        })
        .catch(function (err) {
          btn.disabled = false;
          warn("joinRoom", err);
          showError("join-error", "Could not join the room. Check your connection.");
        });
    });

    /* waiting room */
    $("btn-copy").addEventListener("click", function () {
      var code = S.roomCode || "";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(
          function () { GSUI.toast("Code " + code + " copied"); },
          function () { GSUI.toast("Room code: " + code); }
        );
      } else {
        GSUI.toast("Room code: " + code);
      }
    });

    $("btn-start").addEventListener("click", function () {
      var btn = $("btn-start");
      btn.disabled = true;
      GSRooms.startRoom(S.roomCode)
        .then(function (res) {
          btn.disabled = false;
          if (!res || !res.ok) {
            GSUI.toast((res && res.error) || "Could not start the race.");
            return;
          }
          beginRoomRace(res.room);
        })
        .catch(function (err) {
          btn.disabled = false;
          warn("startRoom", err);
          GSUI.toast("Could not start the race. Check your connection.");
        });
    });

    $("btn-waiting-leave").addEventListener("click", function () {
      var code = S.roomCode || "";
      var me = S.me;
      go("home");                     /* leaves the channel */
      GSRooms.leaveRoom(code, me).catch(function (err) { warn("leaveRoom", err); });
    });

    /* play */
    $("btn-play-leave").addEventListener("click", function () {
      var leaving = window.confirm("Leave this race? Your progress will be lost.");
      if (!leaving) return;
      if (S.mode === "room" && S.roomCode) {
        GSRooms.patchProgress(S.roomCode, S.me, { solved: S.game ? S.game.solved : 0 })
          .catch(function (err) { warn("patchProgress", err); });
      }
      go("home");
    });

    $("btn-shuffle").addEventListener("click", onShuffle);
    $("btn-skip").addEventListener("click", onSkip);
    $("btn-back").addEventListener("click", onBack);
    $("tray").addEventListener("click", onTrayTap);
    $("answer-row").addEventListener("click", onAnswerTap);

    /* results */
    $("btn-again").addEventListener("click", playAgain);
    $("btn-results-home").addEventListener("click", function () { go("home"); });

    /* Never let a stray keypress drag up a keyboard on the play screen. */
    document.addEventListener("keydown", function (event) {
      if (GSUI.currentScreen() === "play" && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
      }
    });
  }

  function prefill() {
    var name = GSStorage.loadName();
    if (name) {
      $("create-name").value = name;
      $("join-name").value = name;
    }
    var buttons = $("create-duration").querySelectorAll(".seg-btn");
    for (var i = 0; i < buttons.length; i++) {
      if (parseInt(buttons[i].getAttribute("data-ms"), 10) === DEFAULT_DURATION) {
        buttons[i].classList.add("is-on");
      }
    }
    S.createDurationMs = DEFAULT_DURATION;
  }

  function init() {
    prefill();
    bind();
    GSUI.setClock(DEFAULT_DURATION);
    GSUI.showScreen("home");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
