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
4. Race. Tap tiles, shuffle when you're stuck, **Skip** a word you don't know, and
   **Back to skipped** to return to the ones you passed on. First to unscramble the most wins.
5. **Results** — your score, the ranked room, all 20 words revealed.

### The controls (nothing else)

| Tap | Result |
| --- | --- |
| A tray tile | The letter flies to the first empty slot |
| A filled slot | The letter goes straight back to the tray |
| **Shuffle tray** | Reorders only the tray — the answer row is never disturbed |
| **Skip** | Abandons this word — it stays in the race — and deals the next open one |
| **Back to skipped** | Steps back one stage through the words you skipped, most recent first |

A correct word flashes green, locks for 200 ms and moves on.
A full-but-wrong word shakes red and **keeps your tiles** — nothing is wiped and nothing
auto-clears. To fix it, tap the slots you want to change (each letter drops back into the
tray) and place them again.

### Long words

A 20-letter term cannot fit one phone line, so the answer row breaks into **balanced lines** —
`EQUIVALENCEPRINCIPLE` lands as 7/7/6, never as a ragged wrap — and every slot on the row is
sized from the longest of those lines. Short words keep the full 44px slot; `LLM` sits on one
line as three ordinary slots. Slot **index order never changes**: index 0 is still the first
letter of the word, wherever it wrapped to, so tapping any slot returns exactly that letter.

### Skip, and going back to skipped

**Skip** sits with Shuffle tray and deals the next open word immediately, with a fresh tray —
the same move-on the board makes after a solve, minus the green flash. **Back to skipped**
walks back through the words you passed on, one stage per tap. Both are deliberately quieter
than Shuffle: no accent colour, because they are not the things you want to be tapping by
reflex.

- **A skipped word is abandoned, not solved.** It never adds to your score, and it is never
  deleted from the race.
- **Skipped words form a stack, and Back walks it most recent skip first.** Skip words 3, 4
  and 5, and Back gives you **5, then 4, then 3** — never word 1 just because word 1 was
  skipped earlier. Word 1 comes up only once it really is the previous stage. One tap is one
  stage in both directions, so nothing ever throws you back to the start of the race.
- **Back is on only while a skipped word is still open below the one on screen.** At the
  bottom of the stack it is off, and tapping it does nothing. The tray there is rebuilt from
  the same seed, so a word looks exactly as it did the first time.
- **Order of work: the word on screen → later unplayed words → the skipped ones.** A skip
  walks you forward through the words you have not seen yet; only once there are none left
  does it step through the stack. **Skip from a word you went back to moves forward again**,
  to the next word you have not finished.
- **You can always finish all 20.** Every word stays reachable, forwards and back, until the
  clock runs out.
- **The race ends** when every word has been solved, or when the clock runs out, or when a
  skip leaves nothing else open at all — which means the word you just skipped was the only
  one still unsolved. That last ending is a *non-finish*, exactly like the clock running out,
  so the time recorded is the full duration and it can never become a personal best.
- The word list under the board marks every word: **✓** solved, **↺** skipped and still open.
- Skip and Back are **disabled during the correct-word flash** and on results, so a fast thumb
  can't drop a word you just got right.
- Neither one reveals the answer — the word reappears only in the results reveal.
- Works the same in Solo and in a room. A room still reports **solved** only: a skip is not a
  solve and never reaches the database as one.

### Scoring

- **Correct count** first.
- **Time used** breaks ties (lower is better). If the clock runs out, time used is the full duration.
- Finishing all 20 freezes the clock at the moment you finish. Skipping the last one instead is a
  non-finish, so it is timed at the full duration.

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
├── js/config.js        the Firebase project config (window.GS_FIREBASE)
├── js/rooms.js         create / join / start / progress / ranked / live updates
├── js/ui.js            every DOM write
└── js/app.js           screen wiring + race lifecycle
```

Classic `<script src>` tags, no ES modules, so `file://` works.
Every module exposes itself on `window`: `GS_WORDS`, `GSStorage`, `GSScramble`,
`GSTimer`, `GSGame`, `GSRooms`, `GSUI`.

`index.html` also loads the Firebase **compat** SDK from gstatic, directly above
`js/rooms.js`:

```html
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-database-compat.js"></script>
<script src="js/config.js"></script>
```

Those are plain `<script>` tags — no `type="module"`, no bundler, no npm.

---

## Test it on an Android phone (Acode)

1. In Acode, create a folder named `genscramble`.
2. Create `css/` and `js/` inside it.
3. Paste each file at the path shown above, in this order:
   `index.html` → `css/styles.css` → `js/words.js` → `js/storage.js` →
   `js/scramble.js` → `js/timer.js` → `js/game.js` → `js/config.js` →
   `js/rooms.js` → `js/ui.js` → `js/app.js` → `README.md`.
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

## How rooms work

Rooms live in **Firebase Realtime Database** at `rooms/{CODE}`, so two phones with the
same 4-letter code play the same race. The databaseURL is
`https://genscramble-default-rtdb.europe-west1.firebasedatabase.app`.

- **Create** picks a code, checks nothing live is using it, then writes the room with a plain
  `set`. Two hosts picking the same code in the same instant is the one race left, and whoever
  writes second wins it.
- **Waiting room** subscribes to `rooms/{CODE}` (`GSRooms.subscribe`). When a player joins
  the list updates with no interaction; when the host starts, every waiting phone follows
  into the race automatically.
- **Progress** is written per player (`patchProgress`) when a race ends and when you leave
  mid-race, and the results screen re-reads the room to build the ranking.
- Going Home calls `GSRooms.unsubscribe`. Rooms untouched for **6 hours are ignored**.

**If Firebase is unavailable** — SDK blocked, offline, or `file://` — `rooms.js` falls back
to the original `localStorage` implementation (`genscramble.rooms`) with the identical
API, so Create, Join, Start and Solo all still work on one device. If two phones can't see
each other's rooms, check the browser console: the fallback is silent by design.

**If a room action fails**, the message tells you which of the three things went wrong, and
the raw error is always logged to the console as
`GenScramble rooms: createRoom failed <error>`:

| Message | What to do |
| --- | --- |
| `Permission denied. Check the database rules.` | The RTDB rules are not `read/write: true` |
| `Database not found. Check databaseURL in js/config.js.` | Wrong or missing `databaseURL` |
| `Could not find a free room code. Try again.` | 60 codes in a row were taken — vanishingly rare |
| `Network error. Check your connection.` | Nothing else matched: read the logged error |

The room shape:

```js
{
  code: "K7QP",
  createdAt: 1758500000000,
  hostName: "Ava",
  durationMs: 180000,
  status: "waiting",              // waiting | racing | done
  words: ["GENLAYER", ...],       // the same 20 for everyone
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

Two things the database does that the code accounts for: a `null` field is **deleted**
rather than stored, so `timeUsedMs: null` means "no result yet" by absence — and on the way
*in* those fields are stripped before the write (`withoutNulls`) rather than sent as nulls.
And a node whose keys are all `0,1,2…` comes back as an **array**, so `players` is normalised
on every read. A room is written with a plain `set` — no transaction.

A player's name is also their key under `players`, and Realtime Database keys may not
contain `. # $ / [ ]` — those are stripped from names as they are typed.

Every player gets the same 20 words in the same order but a **different tray scramble**,
because the tray is shuffled from `hash(room.scrambleSeed + ":" + wordIndex + ":" + word)`
mixed with that player's own seed. Same inputs, same board — reproducible.

### The rooms.js contract

`js/rooms.js` is the only file that touches room storage, and every function that touches
it returns a **Promise that resolves** — failures come back as `{ ok: false, error }`, so
callers check `res.ok` rather than catching:

```js
GSRooms.createRoom({ hostName, durationMs })   // -> { ok, room } | { ok:false, error }
GSRooms.joinRoom(code, name)                   // -> { ok, room } | { ok:false, error }
GSRooms.startRoom(code)                        // -> { ok, room }
GSRooms.patchProgress(code, name, patch)       // -> { ok, room, player }
GSRooms.getRoom(code)                          // -> room | null
GSRooms.subscribe(code, onRoom)                // -> live updates; onRoom(null) when gone
GSRooms.unsubscribe(code)
GSRooms.ranked(room)                           // -> sorted [{ name, solved, timeUsedMs }]  (sync)
GSRooms.playerSeed(room, name)                 // -> this player's tray seed              (sync)
GSGame.skipWord(game)                          // -> { type: "skip", finished }  (rules only)
GSGame.backToSkipped(game)                     // -> { type: "back", index } | { type: "ignored" }
GSGame.canGoBack(game)                         // -> true while a skipped word is open below the board
GSGame.wordState(game, i)                      // -> null | "solved" | "skipped"        (sync)
```

`patchProgress` carries **solved** — never anything about skips. `skipWord`, `backToSkipped` and
`canGoBack` live in `game.js` with the other rules, and neither move returns a word, so the
answer cannot travel either path at all.

Nothing else in the app reads room storage directly, so moving to Firestore, a socket
server or a GenLayer contract means rewriting this one file and keeping those signatures.

---

## The word bank

`js/words.js` holds the 20 GenLayer terms, uppercase and unspaced. Every one is playable:
`GS_WORDS_MIN` is **3** (`LLM`) and `GS_WORDS_MAX` is **20** (`EQUIVALENCEPRINCIPLE`), and
`GS_wordsInRange()` uppercases each entry, **strips everything that is not a letter** and
drops duplicates — so a multi-word term is stored as `INTELLIGENTCONTRACT`, a space can never
reach the board, and no race can draw the same target twice.

Because the bank is exactly 20 and a race takes 20, **every race uses the whole list** — the
difference between two races is the order and each player's tray scramble.

To add a term, append it to `window.GS_WORDS`:

```js
window.GS_WORDS = ["GENLAYER", "INTELLIGENTCONTRACT", "YOURNEWWORD"];
```

A word longer than 20 letters (or shorter than 3) is filtered out and silently never appears.
The longest term sets the widest answer row, so keep an eye on how it wraps.

---

## Limits (all deliberate)

- **Anyone with the URL can read and write the database** — the rules are open. Fine for a
  game with nothing valuable in it; tighten them before you put anything real here.
- A room code is the only access control. There are no accounts and no auth.
- Words are drawn fresh per race from a bank of 20 GenLayer terms, and a race takes all 20.
  No difficulty tiers yet.
- Landscape and desktop work, but the layout is tuned for a portrait phone.

## Next

- A GenLayer Intelligent Contract to record race results on-chain — the word bank is
  already GenLayer-flavoured for exactly that reason.
- Daily seeded challenge (one word list, everyone, same seed).
- Sound and haptics on solve.
- Auth (anonymous or Google) so names can't be taken by whoever types them first.
