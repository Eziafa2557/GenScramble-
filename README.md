# GenScramble

A timed GenLayer word race. **You unscramble 20 words by tapping letter tiles — never by typing.**
There is no text input and no submit button on the play screen, so the keyboard never opens mid-race.

Vanilla HTML + CSS + JavaScript. No React, no Next, no Vite, no npm, no build step.
Open `index.html` and it runs — from a phone, from a file, from any static host.

---

## Play

1. **Solo run** — 20 words, 3:00. Beat your own time.
2. **Create Room** — you get a 4-character code. Everyone who joins gets **the same 20 words**.
3. **Join Room** — type the code and a name, then wait for the host to start.
4. Race. Tap tiles. First to unscramble the most wins.
5. **Results** — your score, the ranked room, all 20 words revealed.

### The controls (nothing else)

| Tap | Result |
| --- | --- |
| A tray tile | The letter flies to the first empty slot |
| A filled slot | The letter goes straight back to the tray |
| **Shuffle tray** | Reorders only the tray — the answer row is never disturbed |

A correct word flashes green, locks for 200 ms and moves on.
A full-but-wrong word shakes red and **keeps your tiles** — nothing is wiped and nothing
auto-clears. To fix it, tap the slots you want to change (each letter drops back into the
tray) and place them again.

### Scoring

- **Correct count** first.
- **Time used** breaks ties (lower is better). If the clock runs out, time used is the full duration.
- Finishing all 20 freezes the clock at the moment you finish.

---

## Files

```
genscramble/
├── index.html          all six screens, plain <script src> tags
├── css/styles.css      dark-only theme, 430px column, safe-area aware
├── js/words.js         the word bank (window.GS_WORDS)
├── js/storage.js       guarded localStorage + in-memory fallback
├── js/scramble.js      seeded shuffle, word picking, room codes
├── js/timer.js         wall-clock race timer
├── js/game.js          the rules: taps, checks, scoring (no DOM)
├── js/rooms.js         create / join / start / progress / ranked
├── js/ui.js            every DOM write
└── js/app.js           screen wiring + race lifecycle
```

Classic `<script src>` tags, no ES modules, so `file://` works.
Every module exposes itself on `window`: `GS_WORDS`, `GSStorage`, `GSScramble`,
`GSTimer`, `GSGame`, `GSRooms`, `GSUI`.

---

## Test it on an Android phone (Acode)

1. In Acode, create a folder named `genscramble`.
2. Create `css/` and `js/` inside it.
3. Paste each file at the path shown above, in this order:
   `index.html` → `css/styles.css` → `js/words.js` → `js/storage.js` →
   `js/scramble.js` → `js/timer.js` → `js/game.js` → `js/rooms.js` →
   `js/ui.js` → `js/app.js` → `README.md`.
4. Open `index.html` → Preview (or "Open in browser").
5. Landscape is not needed. Portrait on a ~400px wide screen is the target.

Everything is relative-path based, so previewing from a nested folder works too.

---

## Deploy to Vercel (static, zero config)

Either:

- **Drag and drop** the whole `genscramble` folder onto <https://vercel.com/new>, or
- **CLI**, from inside the folder:

```bash
cd genscramble
npx vercel --prod
```

No framework preset, no build command, no output directory, no environment variables.
If you'd rather serve it under a path on an existing site, drop the folder in as
`/genscramble/` — every path inside is relative.

---

## How rooms work in v1

Rooms are real, but they live in **`localStorage` under `genscramble.rooms`** on the device
that created them. That makes the entire flow — create, join, start, progress, ranked
results — genuinely testable on one phone (open a second browser tab to see a player join).

The room shape:

```js
{
  code: "K7QP",
  createdAt: 1758500000000,
  hostName: "Ava",
  durationMs: 180000,
  status: "waiting",              // waiting | racing | done
  words: ["INVARIANT", ...],      // the same 20 for everyone
  scrambleSeed: 1234567890,       // one seed → per-player trays
  startedAt: null,
  players: {
    "Ava": {
      name: "Ava",
      solved: 0,
      timeUsedMs: null,
      finishedAt: null,
      scrambleSeed: 987654321,    // Ava's own tray order
      joinedAt: 1758500000000
    }
  }
}
```

Every player gets the same 20 words in the same order but a **different tray scramble**,
because the tray is shuffled from `hash(room.scrambleSeed + ":" + wordIndex + ":" + word)`
mixed with that player's own seed. Same inputs, same board — reproducible.

### Swapping rooms for a real backend

`js/rooms.js` is the only file that touches room storage. Its public functions are all
`(code, data) → result`, so replacing the localStorage body with `fetch()` calls should
not require a single change in `ui.js` or `app.js`:

```js
GSRooms.createRoom({ hostName, durationMs })   // -> { ok, room } | { ok:false, error }
GSRooms.joinRoom(code, name)                   // -> { ok, room } | { ok:false, error }
GSRooms.startRoom(code)                        // -> { ok, room }
GSRooms.patchProgress(code, name, patch)       // -> { ok, room, player }
GSRooms.getRoom(code)                          // -> room | null
GSRooms.ranked(room)                           // -> sorted [{ name, solved, timeUsedMs }]
GSRooms.playerSeed(room, name)                 // -> this player's tray seed
```

A Firebase or WebSocket implementation must keep those five signatures and the room shape
above. Nothing else in the app reads storage directly.

---

## Adding words

Edit `js/words.js` and append an uppercase term to `window.GS_WORDS`.
Words outside **5–12 letters** are filtered out automatically by `GS_wordsInRange()`,
so a stray short word will never reach the board.

```js
window.GS_WORDS = ["INVARIANT", "ADJUDICATION", "YOURNEWWORD"];
```

---

## v1 limits (all deliberate)

- **Rooms are per-device.** Real-time play across two phones needs a backend — see above.
- One race at a time; only one player's progress is written per device.
- Words are drawn fresh per race from a bank of 48 GenLayer terms. No difficulty tiers yet.
- Landscape and desktop work, but the layout is tuned for a portrait phone.

## v2 roadmap

- Firebase (or a small socket server) behind the same `rooms.js` contract for real multiplayer.
- A GenLayer Intelligent Contract to record race results on-chain — the word bank is already
  GenLayer-flavoured for exactly that reason.
- Daily seeded challenge (one word list, everyone, same seed).
- Sound and haptics on solve.
