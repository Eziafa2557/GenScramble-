/* GenScramble — rooms.
   v1 keeps rooms in localStorage so the whole flow (create -> join -> start ->
   progress -> ranked results) is real and testable on one device. The public
   surface below is written so it can be swapped for Firebase or a socket server
   without touching ui.js or app.js: every function is (code, data) -> result. */

window.GSRooms = (function () {

  var WORDS_PER_RACE = 20;

  function now() { return Date.now(); }

  function normalizeCode(code) {
    return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  }

  function normalizeName(name) {
    var clean = String(name || "").trim().replace(/\s+/g, " ");
    return clean.slice(0, 14);
  }

  function allRooms() {
    return GSStorage.loadRooms();
  }

  function saveAll(rooms) {
    GSStorage.saveRooms(rooms);
  }

  function getRoom(code) {
    var rooms = allRooms();
    return rooms[normalizeCode(code)] || null;
  }

  function persist(room) {
    var rooms = allRooms();
    rooms[room.code] = room;
    saveAll(rooms);
    return room;
  }

  /* Newest first, waiting rooms only — the "open rooms" list. */
  function listRooms() {
    var rooms = allRooms();
    return Object.keys(rooms)
      .map(function (code) { return rooms[code]; })
      .filter(function (room) { return room && room.status === "waiting"; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  function freshCode(rooms) {
    var code = GSScramble.randomCode();
    var guard = 0;
    while (rooms[code] && guard < 60) {
      code = GSScramble.randomCode();
      guard += 1;
    }
    return code;
  }

  /* ---------- create ---------- */

  function createRoom(options) {
    var opts = options || {};
    var name = normalizeName(opts.hostName);
    if (!name) return { ok: false, error: "Enter a name first." };

    var rooms = allRooms();
    var code = freshCode(rooms);
    var scrambleSeed = GSScramble.makeSeed();

    var room = {
      code: code,
      createdAt: now(),
      hostName: name,
      durationMs: opts.durationMs || 180000,
      status: "waiting",          /* waiting | racing | done */
      words: GSScramble.pickWords(GS_wordsInRange(), WORDS_PER_RACE),
      scrambleSeed: scrambleSeed,
      startedAt: null,
      players: {}
    };

    room.players[name] = {
      name: name,
      solved: 0,
      timeUsedMs: null,
      finishedAt: null,
      scrambleSeed: GSScramble.hashCode(scrambleSeed + ":" + name.toLowerCase()),
      joinedAt: now()
    };

    rooms[code] = room;
    saveAll(rooms);
    return { ok: true, room: room };
  }

  /* ---------- join ---------- */

  function joinRoom(code, rawName) {
    var key = normalizeCode(code);
    var name = normalizeName(rawName);

    if (key.length !== 4) return { ok: false, error: "Enter the 4-character room code." };
    if (!name) return { ok: false, error: "Enter a name first." };

    var rooms = allRooms();
    var room = rooms[key];
    if (!room) return { ok: false, error: "Room not found. Check the code." };
    if (room.status !== "waiting") return { ok: false, error: "That race has already started." };

    if (!room.players[name]) {
      room.players[name] = {
        name: name,
        solved: 0,
        timeUsedMs: null,
        finishedAt: null,
        scrambleSeed: GSScramble.hashCode(room.scrambleSeed + ":" + name.toLowerCase()),
        joinedAt: now()
      };
    }

    rooms[key] = room;
    saveAll(rooms);
    return { ok: true, room: room };
  }

  function leaveRoom(code, name) {
    var key = normalizeCode(code);
    var rooms = allRooms();
    var room = rooms[key];
    if (!room) return { ok: false, error: "Room not found." };

    delete room.players[normalizeName(name)];

    if (Object.keys(room.players).length === 0) {
      delete rooms[key];
    } else {
      if (room.hostName === normalizeName(name)) {
        room.hostName = Object.keys(room.players)[0];
      }
      rooms[key] = room;
    }
    saveAll(rooms);
    return { ok: true };
  }

  /* ---------- start ---------- */

  function startRoom(code, at) {
    var key = normalizeCode(code);
    var room = getRoom(key);
    if (!room) return { ok: false, error: "Room not found." };
    if (room.status === "racing") return { ok: true, room: room };

    room.status = "racing";
    room.startedAt = typeof at === "number" ? at : now();
    Object.keys(room.players).forEach(function (name) {
      room.players[name].solved = 0;
      room.players[name].timeUsedMs = null;
      room.players[name].finishedAt = null;
    });
    persist(room);
    return { ok: true, room: room };
  }

  /* ---------- progress + results ---------- */

  function patchProgress(code, name, patch) {
    var key = normalizeCode(code);
    var room = getRoom(key);
    if (!room) return { ok: false, error: "Room not found." };

    var player = room.players[normalizeName(name)];
    if (!player) return { ok: false, error: "You are not in this room." };

    var next = patch || {};
    if (typeof next.solved === "number") player.solved = next.solved;

    /* null is meaningful here: Play Again wipes a player back to no result. */
    if (next.timeUsedMs === null) player.timeUsedMs = null;
    else if (typeof next.timeUsedMs === "number") player.timeUsedMs = next.timeUsedMs;

    if (next.finishedAt === null) player.finishedAt = null;
    else if (typeof next.finishedAt === "number") player.finishedAt = next.finishedAt;

    persist(room);
    return { ok: true, room: room, player: player };
  }

  /* Finished players first (more solved, then faster, then who finished
     earlier); anyone still going is ranked on what they have so far. */
  function ranked(room) {
    if (!room) return [];
    var list = Object.keys(room.players).map(function (name) {
      var p = room.players[name];
      return {
        name: p.name,
        solved: p.solved,
        finishedAt: p.finishedAt,
        timeUsedMs: p.timeUsedMs === null ? room.durationMs : p.timeUsedMs
      };
    });

    list.sort(function (a, b) {
      if (b.solved !== a.solved) return b.solved - a.solved;
      var aDone = a.finishedAt !== null;
      var bDone = b.finishedAt !== null;
      if (aDone !== bDone) return aDone ? -1 : 1;
      if (a.timeUsedMs !== b.timeUsedMs) return a.timeUsedMs - b.timeUsedMs;
      return (a.finishedAt || 0) - (b.finishedAt || 0);
    });

    return list;
  }

  function playerSeed(room, name) {
    var player = room && room.players[normalizeName(name)];
    return player ? player.scrambleSeed : GSScramble.makeSeed();
  }

  return {
    WORDS_PER_RACE: WORDS_PER_RACE,
    normalizeCode: normalizeCode,
    normalizeName: normalizeName,
    createRoom: createRoom,
    joinRoom: joinRoom,
    leaveRoom: leaveRoom,
    startRoom: startRoom,
    patchProgress: patchProgress,
    getRoom: getRoom,
    listRooms: listRooms,
    ranked: ranked,
    playerSeed: playerSeed
  };
})();
