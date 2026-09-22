/* GenScramble — app wiring.
   Screens, taps and the race lifecycle. All game rules live in game.js,
   all rooms in rooms.js, all DOM in ui.js, all timing in timer.js. */

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
    solveHandle: null
  };

  var DEFAULT_DURATION = 180000;

  /* ================= navigation ================= */

  function go(name) {
    if (name === "home") resetToHome();
    GSUI.showScreen(name);
  }

  function resetToHome() {
    stopTimer();
    cancelSolveTimer();
    S.raceOver = true;
    S.game = null;
    S.roomCode = null;
    S.mode = "solo";
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
  function endRace(completedAll) {
    if (S.raceOver) return;
    S.raceOver = true;
    cancelSolveTimer();
    stopTimer();

    var g = S.game;
    if (g.status !== "finished") GSGame.finish(g, completedAll);

    var res = GSGame.results(g);

    if (S.mode === "room" && S.roomCode) {
      GSRooms.patchProgress(S.roomCode, S.me, {
        solved: res.solved,
        timeUsedMs: res.timeUsedMs,
        finishedAt: g.finishedAt
      });
    } else {
      GSStorage.addSoloRun({
        solved: res.solved,
        total: res.total,
        timeUsedMs: res.timeUsedMs,
        completedAll: res.completedAll,
        at: g.finishedAt
      });
    }

    renderResults(res, g);
    GSUI.showScreen("results");
  }

  function renderResults(res, g) {
    var room = S.mode === "room" && S.roomCode ? GSRooms.getRoom(S.roomCode) : null;

    var subtitle = res.solved + " of " + res.total + " unscrambled in " +
      GSTimer.formatClock(res.timeUsedMs) + ".";

    if (!room) {
      var best = bestSoloTime();
      if (best !== null && res.timeUsedMs <= best) subtitle += " New personal best.";
      else if (best !== null) subtitle += " Best: " + GSTimer.formatClock(best) + ".";
    }

    GSUI.renderResults({
      title: res.completedAll ? "You unscrambled all " + res.total : "Timer ended. Score locked.",
      subtitle: subtitle,
      solved: res.solved,
      total: res.total,
      timeUsedMs: res.timeUsedMs,
      words: res.words,
      ranked: room ? GSRooms.ranked(room) : null,
      me: S.me
    });
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

    if (S.mode === "room" && S.roomCode) {
      GSRooms.patchProgress(S.roomCode, S.me, { solved: 0, timeUsedMs: null, finishedAt: null });
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

  /* ================= waiting room ================= */

  function enterWaiting(room) {
    S.mode = "room";
    S.roomCode = room.code;
    GSUI.renderWaiting(room, S.me);
    GSUI.showScreen("waiting");
  }

  function refreshWaiting() {
    if (GSUI.currentScreen() !== "waiting" || !S.roomCode) return;
    GSUI.renderWaiting(GSRooms.getRoom(S.roomCode), S.me);
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
      var name = GSRooms.normalizeName($("create-name").value);
      var res = GSRooms.createRoom({ hostName: name, durationMs: S.createDurationMs });
      if (!res.ok) { showError("create-error", res.error); return; }
      showError("create-error", "");
      S.me = name;
      GSStorage.saveName(name);
      enterWaiting(res.room);
    });

    /* join */
    $("join-code").addEventListener("input", function () {
      this.value = GSRooms.normalizeCode(this.value);
    });

    $("btn-join").addEventListener("click", function () {
      var code = GSRooms.normalizeCode($("join-code").value);
      var name = GSRooms.normalizeName($("join-name").value);
      var res = GSRooms.joinRoom(code, name);
      if (!res.ok) { showError("join-error", res.error); return; }
      showError("join-error", "");
      S.me = name;
      GSStorage.saveName(name);
      enterWaiting(res.room);
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
      var res = GSRooms.startRoom(S.roomCode);
      if (!res.ok) { GSUI.toast(res.error); return; }
      beginRoomRace(res.room);
    });

    $("btn-waiting-leave").addEventListener("click", function () {
      GSRooms.leaveRoom(S.roomCode || "", S.me);
      go("home");
    });

    /* play */
    $("btn-play-leave").addEventListener("click", function () {
      var leaving = window.confirm("Leave this race? Your progress will be lost.");
      if (!leaving) return;
      if (S.mode === "room" && S.roomCode) {
        GSRooms.patchProgress(S.roomCode, S.me, { solved: S.game ? S.game.solved : 0 });
      }
      go("home");
    });

    $("btn-shuffle").addEventListener("click", onShuffle);
    $("tray").addEventListener("click", onTrayTap);
    $("answer-row").addEventListener("click", onAnswerTap);

    /* results */
    $("btn-again").addEventListener("click", playAgain);
    $("btn-results-home").addEventListener("click", function () { go("home"); });

    /* another tab joined — keep the waiting room honest on one device */
    window.addEventListener("storage", function (event) {
      if (event.key === GSStorage.KEYS.rooms) refreshWaiting();
    });

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
