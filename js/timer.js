/* GenScramble — race clock.
   Runs off Date.now() against a stored startedAt, so backgrounding the tab,
   locking the phone or a throttled interval can never buy extra time.
   visibilitychange deliberately does NOT pause. */

window.GSTimer = (function () {

  function create(options) {
    var opts = options || {};
    var durationMs = opts.durationMs || 180000;
    var onTick = opts.onTick || function () {};
    var onExpire = opts.onExpire || function () {};

    var startedAt = null;
    var stopped = false;
    var handle = null;

    function elapsed() {
      if (startedAt === null) return 0;
      return Date.now() - startedAt;
    }

    function remaining() {
      var left = durationMs - elapsed();
      return left > 0 ? left : 0;
    }

    function expired() {
      return startedAt !== null && elapsed() >= durationMs;
    }

    function tick() {
      if (stopped || startedAt === null) return;
      var left = remaining();
      onTick(left, durationMs);
      if (left <= 0) {
        stop();
        onExpire();
      }
    }

    function start(at) {
      startedAt = typeof at === "number" ? at : Date.now();
      stopped = false;
      if (handle !== null) window.clearInterval(handle);
      handle = window.setInterval(tick, 250);
      tick();
    }

    function stop() {
      stopped = true;
      if (handle !== null) {
        window.clearInterval(handle);
        handle = null;
      }
    }

    function reset() {
      stop();
      startedAt = null;
    }

    return {
      start: start,
      stop: stop,
      reset: reset,
      tick: tick,
      elapsed: elapsed,
      remaining: remaining,
      expired: expired,
      startedAt: function () { return startedAt; },
      durationMs: function () { return durationMs; },
      isRunning: function () { return handle !== null && !stopped; }
    };
  }

  /* 95000 -> "1:35" */
  function formatClock(ms) {
    var total = Math.max(0, Math.ceil(ms / 1000));
    var mins = Math.floor(total / 60);
    var secs = total % 60;
    return mins + ":" + (secs < 10 ? "0" : "") + secs;
  }

  /* Yellow by default, amber under 30s, red under 10s. */
  function clockClass(ms) {
    if (ms < 10000) return "clock danger";
    if (ms < 30000) return "clock warn";
    return "clock";
  }

  return {
    create: create,
    formatClock: formatClock,
    clockClass: clockClass
  };
})();
