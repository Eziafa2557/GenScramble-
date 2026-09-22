/* GenScramble — localStorage wrapper.
   Every access is guarded: private mode, a full quota, or a file:// origin
   that refuses storage must degrade to an in-memory store, never throw. */

window.GSStorage = (function () {
  var KEYS = {
    rooms: "genscramble.rooms",
    soloRuns: "genscramble.soloRuns",
    name: "genscramble.name"
  };

  var memory = {};
  var available = null;

  function canUseLocalStorage() {
    if (available !== null) return available;
    try {
      var probe = "__gs_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      available = true;
    } catch (err) {
      available = false;
    }
    return available;
  }

  function get(key, fallback) {
    try {
      var raw = canUseLocalStorage() ? window.localStorage.getItem(key) : memory[key];
      if (raw === null || raw === undefined) return fallback;
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  function set(key, value) {
    var raw = JSON.stringify(value);
    try {
      if (canUseLocalStorage()) {
        window.localStorage.setItem(key, raw);
        return true;
      }
    } catch (err) {
      /* quota or serialisation failure — fall through to memory */
    }
    memory[key] = raw;
    return false;
  }

  function remove(key) {
    try {
      if (canUseLocalStorage()) window.localStorage.removeItem(key);
    } catch (err) { /* ignore */ }
    delete memory[key];
  }

  /* ---------- rooms ---------- */

  function loadRooms() {
    var rooms = get(KEYS.rooms, {});
    return rooms && typeof rooms === "object" ? rooms : {};
  }

  function saveRooms(rooms) {
    return set(KEYS.rooms, rooms || {});
  }

  /* ---------- solo history (last 20 runs) ---------- */

  function loadSoloRuns() {
    var runs = get(KEYS.soloRuns, []);
    return Object.prototype.toString.call(runs) === "[object Array]" ? runs : [];
  }

  function addSoloRun(run) {
    var runs = loadSoloRuns();
    runs.unshift(run);
    runs = runs.slice(0, 20);
    set(KEYS.soloRuns, runs);
    return runs;
  }

  function clearSoloRuns() {
    remove(KEYS.soloRuns);
  }

  /* ---------- remembered name ---------- */

  function loadName() {
    var name = get(KEYS.name, "");
    return typeof name === "string" ? name : "";
  }

  function saveName(name) {
    return set(KEYS.name, String(name || ""));
  }

  return {
    KEYS: KEYS,
    available: canUseLocalStorage,
    get: get,
    set: set,
    remove: remove,
    loadRooms: loadRooms,
    saveRooms: saveRooms,
    loadSoloRuns: loadSoloRuns,
    addSoloRun: addSoloRun,
    clearSoloRuns: clearSoloRuns,
    loadName: loadName,
    saveName: saveName
  };
})();
