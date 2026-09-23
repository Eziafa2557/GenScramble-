/* GenScramble — every DOM write lives here.
   app.js decides what happened; ui.js decides what it looks like. */

window.GSUI = (function () {

  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  /* ---------- screens ---------- */

  var SCREENS = ["home", "create", "join", "waiting", "play", "results"];
  var current = "home";

  function showScreen(name) {
    if (SCREENS.indexOf(name) === -1) name = "home";
    current = name;
    SCREENS.forEach(function (s) {
      var node = $("screen-" + s);
      if (node) node.classList.toggle("is-active", s === name);
    });
    window.scrollTo(0, 0);
    /* The play screen must never raise the keyboard. */
    if (name === "play" && document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  }

  function currentScreen() { return current; }

  /* ---------- toast ---------- */

  var toastHandle = null;

  function toast(message, ms) {
    var node = $("toast");
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    if (toastHandle) window.clearTimeout(toastHandle);
    toastHandle = window.setTimeout(function () {
      node.hidden = true;
      toastHandle = null;
    }, ms || 2200);
  }

  /* ---------- clock ---------- */

  function setClock(remainingMs) {
    var node = $("clock");
    if (!node) return;
    node.textContent = GSTimer.formatClock(remainingMs);
    node.className = GSTimer.clockClass(remainingMs);
  }

  /* ---------- the board ---------- */

  /* A 20-letter word cannot sit on one phone-width line, and letting the flex
     row break wherever it runs out leaves a ragged 6/6/5/3. So the slots are
     split into balanced full lines here (7/7/6, never 8/8/4), and the CSS sizes
     every slot on the row to the longest of those lines. */
  function answerLines(length, perLine) {
    var max = perLine || 8;
    if (length <= max) return [length];

    var lines = Math.ceil(length / max);
    var base = Math.floor(length / lines);
    var extra = length % lines;
    var out = [];
    for (var i = 0; i < lines; i++) out.push(base + (i < extra ? 1 : 0));
    return out;
  }

  function renderBoard(game) {
    var target = GSGame.currentTarget(game);
    var nextWord = game.words[game.index + 1];

    var counter = $("word-counter");
    if (counter) counter.textContent = "WORD " + (game.index + 1) + " / " + game.words.length;

    var lengthLabel = $("word-length");
    if (lengthLabel) lengthLabel.textContent = target.length + (target.length === 1 ? " letter" : " letters");

    var fill = $("progress-fill");
    if (fill) fill.style.width = Math.round((game.solved / game.words.length) * 100) + "%";

    /* answer row — one flex line per balanced group of slots */
    var row = $("answer-row");
    if (row) {
      clear(row);
      var shape = answerLines(game.answer.length);
      row.style.setProperty("--line-slots", String(Math.max.apply(null, shape)));
      row.classList.toggle("is-long", shape.length > 1);

      var at = 0;
      shape.forEach(function (count) {
        var line = el("div", "answer-line");
        for (var n = 0; n < count; n++) {
          var i = at + n;
          var letter = game.answer[i];
          var slot = el("button", "slot", letter === null ? "" : letter);
          slot.type = "button";
          slot.setAttribute("data-i", String(i));
          if (letter !== null) slot.classList.add("is-filled");
          slot.setAttribute("aria-label", letter === null ? "Empty slot " + (i + 1) : "Letter " + letter + ", tap to return it");
          line.appendChild(slot);
        }
        at += count;
        row.appendChild(line);
      });
    }
    setWordCardLocked(game.locked === true);

    /* tray */
    var tray = $("tray");
    if (tray) {
      clear(tray);
      if (game.tray.length === 0) {
        tray.appendChild(el("div", "tray-empty", "Tray empty"));
      } else {
        game.tray.forEach(function (letter, i) {
          var tile = el("button", "tile", letter);
          tile.type = "button";
          tile.setAttribute("data-i", String(i));
          tile.setAttribute("aria-label", "Tile " + letter);
          tray.appendChild(tile);
        });
      }
    }

    /* next preview — length only, never letters */
    var preview = $("next-preview");
    if (preview) {
      preview.textContent = nextWord
        ? "NEXT · " + nextWord.length + " letters"
        : "LAST WORD";
    }

    /* compact words list — index + length + tick. Never the answer. */
    var list = $("words-list");
    if (list) {
      clear(list);
      game.words.forEach(function (word, i) {
        var chip = el("div", "word-chip");
        chip.appendChild(el("span", null, String(i + 1) + "·" + word.length));
        if (game.perWord[i] === true) {
          chip.classList.add("is-done");
          chip.appendChild(el("span", null, "✓"));
        } else if (i === game.index) {
          chip.classList.add("is-current");
        }
        list.appendChild(chip);
      });
    }
  }

  function setWordCardLocked(locked) {
    var card = document.querySelector(".word-card");
    if (card) card.classList.toggle("locked", !!locked);
  }

  function flashAnswer() {
    var row = $("answer-row");
    if (!row) return;
    row.classList.remove("shake");
    row.classList.add("flash");
    window.setTimeout(function () { row.classList.remove("flash"); }, 450);
  }

  function shakeAnswer() {
    var row = $("answer-row");
    if (!row) return;
    row.classList.remove("flash");
    row.classList.add("shake");
    window.setTimeout(function () { row.classList.remove("shake"); }, 360);
  }

  /* ---------- waiting room ---------- */

  function renderWaiting(room, me) {
    var code = $("room-code");
    if (code) code.textContent = room ? room.code : "----";

    var names = room ? Object.keys(room.players) : [];
    var count = names.length;

    var ready = $("ready-count");
    if (ready) ready.textContent = count + (count === 1 ? " player ready" : " players ready");

    var list = $("players-list");
    if (list) {
      clear(list);
      names.forEach(function (name) {
        var item = el("li");
        item.appendChild(el("span", null, name));
        if (room && room.hostName === name) item.appendChild(el("span", "tag", "host"));
        else if (name === me) item.appendChild(el("span", "tag", "you"));
        list.appendChild(item);
      });
    }

    var isHost = !!(room && me && room.hostName === me);
    var start = $("btn-start");
    var copy = $("waiting-copy");
    if (start) start.hidden = !isHost;
    if (copy) {
      copy.hidden = isHost;
      copy.textContent = "Waiting for the host to start…";
    }
  }

  /* ---------- results ---------- */

  function renderResults(view) {
    var title = $("result-title");
    if (title) title.textContent = view.title;

    var sub = $("result-sub");
    if (sub) sub.textContent = view.subtitle || "";

    var correct = $("stat-correct");
    if (correct) correct.textContent = view.solved + "/" + view.total;

    var time = $("stat-time");
    if (time) time.textContent = GSTimer.formatClock(view.timeUsedMs);

    var rankCard = $("rank-card");
    var rankList = $("rank-list");
    if (rankCard && rankList) {
      clear(rankList);
      if (view.ranked && view.ranked.length > 0) {
        rankCard.hidden = false;
        view.ranked.forEach(function (entry, i) {
          var item = el("li");
          if (view.me && entry.name === view.me) item.classList.add("is-me");
          item.appendChild(el("span", "pos", String(i + 1)));
          item.appendChild(el("span", "who", entry.name));
          item.appendChild(el("span", "pts", entry.solved + "/" + view.total + " · " + GSTimer.formatClock(entry.timeUsedMs)));
          rankList.appendChild(item);
        });
      } else {
        rankCard.hidden = true;
      }
    }

    var reveal = $("reveal-list");
    if (reveal) {
      clear(reveal);
      view.words.forEach(function (entry) {
        var item = el("li", entry.solved ? "hit" : "miss");
        item.appendChild(el("span", "mark", entry.solved ? "✓" : "✕"));
        item.appendChild(el("span", "word", entry.word));
        item.appendChild(el("span", "len", entry.word.length + " letters"));
        reveal.appendChild(item);
      });
    }
  }

  return {
    $: $,
    el: el,
    clear: clear,
    showScreen: showScreen,
    currentScreen: currentScreen,
    toast: toast,
    setClock: setClock,
    renderBoard: renderBoard,
    setWordCardLocked: setWordCardLocked,
    flashAnswer: flashAnswer,
    shakeAnswer: shakeAnswer,
    renderWaiting: renderWaiting,
    renderResults: renderResults
  };
})();
