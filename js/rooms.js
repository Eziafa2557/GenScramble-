/* GenScramble — rooms.
   Live rooms live in Firebase Realtime Database at rooms/{CODE}, so two phones can
   share one 4-letter code. The localStorage implementation is kept whole as a
   fallback: if the SDK never loads (offline, blocked CDN, file:// in Acode) the
   create -> join -> start -> progress -> ranked flow still works on one device and
   Solo is untouched.

   Contract for every function that touches storage: it returns a Promise, and it
   RESOLVES — a failure comes back as { ok: false, error }. The caller checks
   res.ok; it never needs a .catch() (though one does no harm). ranked() and
   playerSeed() are pure and stay synchronous.

   Only the classic callback API of the compat SDK is used (once/set/update/remove/
   transaction with callbacks), because that surface is identical on every 10.x
   compat build. */

window.GSRooms = (function () {

  var WORDS_PER_RACE = 20;
  var ROOT = "rooms";
  var MAX_AGE_MS = 6 * 60 * 60 * 1000;   /* rooms older than six hours are ignored */
  var CODE_ATTEMPTS = 60;

  var NETWORK_ERROR = "Network error. Check your connection.";
  var NOT_FOUND = "Room not found. Check the code.";

  function now() { return Date.now(); }

  function resolve(value) { return Promise.resolve(value); }

  function guard(promise, fallback) {
    return promise.then(null, function () { return fallback; });
  }

  /* ---------- codes and names ---------- */

  function normalizeCode(code) {
    return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  }

  /* A name doubles as its key under players{}, and a Realtime Database key may not
     contain . # $ / [ ] — so those are dropped here instead of failing at write
     time. Everything else (spaces, dashes, digits, accents) survives. Because the
     key is the name, ui.js and hostName comparisons keep working unchanged. */
  function normalizeName(name) {
    var clean = String(name || "").trim().replace(/\s+/g, " ");
    clean = clean.replace(/[.#$/\[\]]/g, "");
    return clean.slice(0, 14).trim();
  }

  /* ---------- firebase ---------- */

  var db = null;
  var triedFirebase = false;

  function firebaseDatabase() {
    if (triedFirebase) return db;
    triedFirebase = true;
    try {
      if (window.GS_FIREBASE && window.firebase && window.firebase.initializeApp) {
        if (!window.firebase.apps || window.firebase.apps.length === 0) {
          window.firebase.initializeApp(window.GS_FIREBASE);
        }
        db = window.firebase.database();
      }
    } catch (err) {
      db = null;                       /* no database -> the localStorage path takes over */
    }
    return db;
  }

  /* Promise wrappers over the classic callback API. */
  function readOnce(ref) {
    return new Promise(function (done, fail) {
      ref.once("value", function (snap) { done(snap); }, fail);
    });
  }

  function writeOnce(ref, value) {
    return new Promise(function (done, fail) {
      ref.set(value, function (err) { if (err) fail(err); else done(); });
    });
  }

  function updateOnce(ref, updates) {
    return new Promise(function (done, fail) {
      ref.update(updates, function (err) { if (err) fail(err); else done(); });
    });
  }

  function removeOnce(ref) {
    return new Promise(function (done, fail) {
      ref.remove(function (err) { if (err) fail(err); else done(); });
    });
  }

  function runTransaction(ref, apply) {
    return new Promise(function (done, fail) {
      ref.transaction(apply, function (err, committed) {
        if (err) fail(err); else done(!!committed);
      }, false);
    });
  }

  function roomRef(database, code) {
    return database.ref(ROOT + "/" + code);
  }

  function readRoom(database, code) {
    return readOnce(roomRef(database, code)).then(function (snap) {
      return normalizeRoom(snap.val());
    });
  }

  /* ---------- room shape ---------- */

  /* A Realtime Database object with keys 0,1,2… comes back as an array. */
  function arrayify(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];
    return Object.keys(value)
      .sort(function (a, b) { return Number(a) - Number(b); })
      .map(function (k) { return value[k]; })
      .filter(function (v) { return v !== null && v !== undefined; });
  }

  /* players{} is keyed by player name. A key like "__proto__" would otherwise hit
     the prototype setter, so the map is rebuilt on a null prototype. */
  function playersMap(raw) {
    var map = Object.create(null);
    if (!raw || typeof raw !== "object") return map;
    if (Array.isArray(raw)) {
      raw.forEach(function (p) {
        if (p && typeof p === "object" && p.name) map[normalizeName(p.name)] = p;
      });
      return map;
    }
    Object.keys(raw).forEach(function (key) { map[key] = raw[key]; });
    return map;
  }

  function normalizePlayer(raw, key) {
    var player = raw && typeof raw === "object" ? raw : {};
    player.name = typeof player.name === "string" && player.name ? player.name : key;
    player.solved = typeof player.solved === "number" ? player.solved : 0;
    /* Firebase deletes a key written as null, so a missing value means "no result yet". */
    player.timeUsedMs = typeof player.timeUsedMs === "number" ? player.timeUsedMs : null;
    player.finishedAt = typeof player.finishedAt === "number" ? player.finishedAt : null;
    return player;
  }

  /* Every read goes through here, so the rest of the app always sees the same
     shape whether the room came from Firebase or from localStorage. */
  function normalizeRoom(raw) {
    if (!raw || typeof raw !== "object") return null;
    var room = raw;

    room.code = normalizeCode(room.code);
    room.createdAt = typeof room.createdAt === "number" ? room.createdAt : 0;
    room.hostName = typeof room.hostName === "string" ? room.hostName : "";
    room.durationMs = typeof room.durationMs === "number" ? room.durationMs : 180000;
    room.status = room.status === "racing" || room.status === "done" ? room.status : "waiting";
    room.startedAt = typeof room.startedAt === "number" ? room.startedAt : null;
    room.scrambleSeed = typeof room.scrambleSeed === "number" ? room.scrambleSeed : 0;
    room.words = arrayify(room.words);

    var players = playersMap(room.players);
    Object.keys(players).forEach(function (key) {
      players[key] = normalizePlayer(players[key], key);
    });
    room.players = players;

    return room;
  }

  function isStale(room) {
    if (!room) return true;
    if (typeof room.createdAt !== "number" || room.createdAt <= 0) return true;
    return now() - room.createdAt > MAX_AGE_MS;
  }

  function newPlayer(name, scrambleSeed) {
    return {
      name: name,
      solved: 0,
      timeUsedMs: null,
      finishedAt: null,
      scrambleSeed: GSScramble.hashCode(scrambleSeed + ":" + name.toLowerCase()),
      joinedAt: now()
    };
  }

  function newRoom(code, name, durationMs, scrambleSeed, words) {
    var players = Object.create(null);
    players[name] = newPlayer(name, scrambleSeed);
    return {
      code: code,
      createdAt: now(),
      hostName: name,
      durationMs: durationMs,
      status: "waiting",
      words: words,
      scrambleSeed: scrambleSeed,
      startedAt: null,
      players: players
    };
  }

  /* ---------- create ---------- */

  /* Claim a code atomically: a room is only ours if the path was empty or holds an
     abandoned room. Anything else aborts the transaction and we try another code. */
  function claimRoom(database, name, durationMs, attempt) {
    var code = GSScramble.randomCode();
    var room = newRoom(
      code, name, durationMs,
      GSScramble.makeSeed(),
      GSScramble.pickWords(GS_wordsInRange(), WORDS_PER_RACE)
    );

    return runTransaction(roomRef(database, code), function (current) {
      if (current === null || current === undefined) return room;
      if (isStale(normalizeRoom(current))) return room;
      return undefined;                            /* taken — abort */
    }).then(function (committed) {
      if (committed) return room;
      if (attempt + 1 >= CODE_ATTEMPTS) throw new Error("no free code");
      return claimRoom(database, name, durationMs, attempt + 1);
    });
  }

  function createRoom(options) {
    var opts = options || {};
    var name = normalizeName(opts.hostName);
    if (!name) return resolve({ ok: false, error: "Enter a name first." });

    var durationMs = typeof opts.durationMs === "number" ? opts.durationMs : 180000;
    var database = firebaseDatabase();

    if (!database) {
      return resolve(localCreateRoom(name, durationMs));
    }

    return guard(
      claimRoom(database, name, durationMs, 0).then(function (room) {
        return { ok: true, room: room };
      }),
      { ok: false, error: NETWORK_ERROR }
    );
  }

  /* ---------- join ---------- */

  function joinRoom(code, rawName) {
    var key = normalizeCode(code);
    var name = normalizeName(rawName);

    if (key.length !== 4) return resolve({ ok: false, error: "Enter the 4-character room code." });
    if (!name) return resolve({ ok: false, error: "Enter a name first." });

    var database = firebaseDatabase();
    if (!database) return resolve(localJoinRoom(key, name));

    return guard(
      readRoom(database, key).then(function (room) {
        if (isStale(room)) return { ok: false, error: NOT_FOUND };
        if (room.status !== "waiting") return { ok: false, error: "That race has already started." };
        if (room.players[name]) return { ok: true, room: room };   /* rejoining is allowed */

        var player = newPlayer(name, room.scrambleSeed);
        return writeOnce(roomRef(database, key).child("players").child(name), player)
          .then(function () {
            room.players[name] = player;
            return { ok: true, room: room };
          });
      }),
      { ok: false, error: NETWORK_ERROR }
    );
  }

  /* ---------- leave ---------- */

  function leaveRoom(code, rawName) {
    var key = normalizeCode(code);
    var name = normalizeName(rawName);
    if (key.length !== 4) return resolve({ ok: false, error: "Room not found." });

    var database = firebaseDatabase();
    if (!database) return resolve(localLeaveRoom(key, name));

    return guard(
      readRoom(database, key).then(function (room) {
        var ref = roomRef(database, key);
        if (!room) return { ok: true };

        var remaining = Object.keys(room.players).filter(function (n) { return n !== name; });
        if (remaining.length === 0) {
          return removeOnce(ref).then(function () { return { ok: true }; });
        }

        var updates = {};
        updates["players/" + name] = null;           /* a null value deletes the child */
        if (room.hostName === name) updates.hostName = remaining[0];
        return updateOnce(ref, updates).then(function () { return { ok: true }; });
      }),
      { ok: false, error: NETWORK_ERROR }
    );
  }

  /* ---------- start ---------- */

  function startRoom(code, at) {
    var key = normalizeCode(code);
    var startedAt = typeof at === "number" ? at : now();
    var database = firebaseDatabase();
    if (!database) return resolve(localStartRoom(key, startedAt));

    return guard(
      readRoom(database, key).then(function (room) {
        if (!room) return { ok: false, error: "Room not found." };
        if (room.status === "racing") return { ok: true, room: room };

        var updates = { status: "racing", startedAt: startedAt };
        Object.keys(room.players).forEach(function (name) {
          updates["players/" + name + "/solved"] = 0;
          updates["players/" + name + "/timeUsedMs"] = null;
          updates["players/" + name + "/finishedAt"] = null;
        });

        return updateOnce(roomRef(database, key), updates).then(function () {
          room.status = "racing";
          room.startedAt = startedAt;
          Object.keys(room.players).forEach(function (name) {
            room.players[name].solved = 0;
            room.players[name].timeUsedMs = null;
            room.players[name].finishedAt = null;
          });
          return { ok: true, room: room };
        });
      }),
      { ok: false, error: NETWORK_ERROR }
    );
  }

  /* ---------- progress ---------- */

  function patchProgress(code, rawName, patch) {
    var key = normalizeCode(code);
    var name = normalizeName(rawName);
    if (key.length !== 4) return resolve({ ok: false, error: "Room not found." });

    var database = firebaseDatabase();
    if (!database) return resolve(localPatchProgress(key, name, patch));

    return guard(
      readRoom(database, key).then(function (room) {
        if (!room) return { ok: false, error: "Room not found." };
        var player = room.players[name];
        if (!player) return { ok: false, error: "You are not in this room." };

        var next = patch || {};
        var updates = {};
        if (typeof next.solved === "number") updates.solved = next.solved;

        /* null is meaningful here: Play Again wipes a player back to no result.
           Firebase deletes a null child, and normalizePlayer restores the null. */
        if ("timeUsedMs" in next) {
          updates.timeUsedMs = typeof next.timeUsedMs === "number" ? next.timeUsedMs : null;
        }
        if ("finishedAt" in next) {
          updates.finishedAt = typeof next.finishedAt === "number" ? next.finishedAt : null;
        }
        if (Object.keys(updates).length === 0) return { ok: true, room: room, player: player };

        return updateOnce(roomRef(database, key).child("players").child(name), updates)
          .then(function () {
            Object.keys(updates).forEach(function (field) { player[field] = updates[field]; });
            return { ok: true, room: room, player: player };
          });
      }),
      { ok: false, error: NETWORK_ERROR }
    );
  }

  /* ---------- read ---------- */

  function getRoom(code) {
    var key = normalizeCode(code);
    if (key.length !== 4) return resolve(null);

    var database = firebaseDatabase();
    if (!database) return resolve(localGetRoom(key));

    return guard(
      readRoom(database, key).then(function (room) {
        return isStale(room) ? null : room;
      }),
      null
    );
  }

  /* Every fresh waiting room, newest first. Kept for parity with the localStorage
     build; the UI itself joins by typed code. */
  function listRooms() {
    var database = firebaseDatabase();
    if (!database) return resolve(localListRooms());

    return guard(
      readOnce(database.ref(ROOT)).then(function (snap) {
        var raw = snap.val() || {};
        return Object.keys(raw)
          .map(function (code) { return normalizeRoom(raw[code]); })
          .filter(function (room) { return room && room.status === "waiting" && !isStale(room); })
          .sort(function (a, b) { return b.createdAt - a.createdAt; });
      }),
      []
    );
  }

  /* ---------- live updates ---------- */

  var subscriptions = {};

  function subscribe(code, onRoom) {
    var key = normalizeCode(code);
    if (key.length !== 4 || typeof onRoom !== "function") return;

    unsubscribe(key);
    var database = firebaseDatabase();

    if (database) {
      var ref = roomRef(database, key);
      var handler = ref.on("value", function (snap) {
        var room = normalizeRoom(snap.val());
        onRoom(isStale(room) ? null : room);
      }, function () {
        /* A failed read is not a deleted room: keep the last state and let the
           SDK reconnect on its own. Only a null value means "gone". */
      });
      subscriptions[key] = { off: function () { ref.off("value", handler); } };
      return;
    }

    var onStorage = function (event) {
      if (event && event.key && event.key !== GSStorage.KEYS.rooms) return;
      onRoom(localGetRoom(key));
    };
    window.addEventListener("storage", onStorage);
    subscriptions[key] = {
      off: function () { window.removeEventListener("storage", onStorage); }
    };
    onRoom(localGetRoom(key));      /* Firebase fires on subscribe; match that here */
  }

  function unsubscribe(code) {
    var key = normalizeCode(code);
    var sub = subscriptions[key];
    if (!sub) return;
    try { sub.off(); } catch (err) { /* already detached */ }
    delete subscriptions[key];
  }

  /* ---------- ranking (pure) ---------- */

  /* Finished players first (more solved, then faster, then who finished earlier);
     anyone still going is ranked on what they have so far. */
  function ranked(room) {
    if (!room || !room.players) return [];
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
    var player = room && room.players ? room.players[normalizeName(name)] : null;
    return player && typeof player.scrambleSeed === "number"
      ? player.scrambleSeed
      : GSScramble.makeSeed();
  }

  /* ---------- localStorage fallback ----------
     The same shape and the same contract, on one device. Used when the SDK is
     unavailable so Create / Join / Start and Solo keep working offline. */

  function localAllRooms() {
    var rooms = GSStorage.loadRooms();
    return rooms && typeof rooms === "object" ? rooms : {};
  }

  function localSaveAll(rooms) { GSStorage.saveRooms(rooms); }

  function localGetRoom(key) {
    var room = normalizeRoom(localAllRooms()[key]);
    return isStale(room) ? null : room;
  }

  function localCreateRoom(name, durationMs) {
    var rooms = localAllRooms();
    var code = GSScramble.randomCode();
    var guardCount = 0;
    while (rooms[code] && !isStale(normalizeRoom(rooms[code])) && guardCount < CODE_ATTEMPTS) {
      code = GSScramble.randomCode();
      guardCount += 1;
    }

    var room = newRoom(
      code, name, durationMs,
      GSScramble.makeSeed(),
      GSScramble.pickWords(GS_wordsInRange(), WORDS_PER_RACE)
    );
    rooms[code] = room;
    localSaveAll(rooms);
    return { ok: true, room: room };
  }

  function localJoinRoom(key, name) {
    var rooms = localAllRooms();
    var room = normalizeRoom(rooms[key]);
    if (isStale(room)) return { ok: false, error: NOT_FOUND };
    if (room.status !== "waiting") return { ok: false, error: "That race has already started." };

    if (!room.players[name]) room.players[name] = newPlayer(name, room.scrambleSeed);
    rooms[key] = room;
    localSaveAll(rooms);
    return { ok: true, room: room };
  }

  function localLeaveRoom(key, name) {
    var rooms = localAllRooms();
    var room = normalizeRoom(rooms[key]);
    if (!room) return { ok: false, error: "Room not found." };

    delete room.players[name];
    var remaining = Object.keys(room.players);

    if (remaining.length === 0) {
      delete rooms[key];
    } else {
      if (room.hostName === name) room.hostName = remaining[0];
      rooms[key] = room;
    }
    localSaveAll(rooms);
    return { ok: true };
  }

  function localStartRoom(key, startedAt) {
    var room = localGetRoom(key);
    if (!room) return { ok: false, error: "Room not found." };
    if (room.status === "racing") return { ok: true, room: room };

    room.status = "racing";
    room.startedAt = startedAt;
    Object.keys(room.players).forEach(function (name) {
      room.players[name].solved = 0;
      room.players[name].timeUsedMs = null;
      room.players[name].finishedAt = null;
    });

    var rooms = localAllRooms();
    rooms[key] = room;
    localSaveAll(rooms);
    return { ok: true, room: room };
  }

  function localPatchProgress(key, name, patch) {
    var room = localGetRoom(key);
    if (!room) return { ok: false, error: "Room not found." };

    var player = room.players[name];
    if (!player) return { ok: false, error: "You are not in this room." };

    var next = patch || {};
    if (typeof next.solved === "number") player.solved = next.solved;
    if ("timeUsedMs" in next) {
      player.timeUsedMs = typeof next.timeUsedMs === "number" ? next.timeUsedMs : null;
    }
    if ("finishedAt" in next) {
      player.finishedAt = typeof next.finishedAt === "number" ? next.finishedAt : null;
    }

    var rooms = localAllRooms();
    rooms[key] = room;
    localSaveAll(rooms);
    return { ok: true, room: room, player: player };
  }

  function localListRooms() {
    var rooms = localAllRooms();
    return Object.keys(rooms)
      .map(function (code) { return normalizeRoom(rooms[code]); })
      .filter(function (room) { return room && room.status === "waiting" && !isStale(room); })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
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
    subscribe: subscribe,
    unsubscribe: unsubscribe,

    ranked: ranked,
    playerSeed: playerSeed
  };
})();
