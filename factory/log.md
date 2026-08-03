# log.md — build diary

---

## T0 — Scaffold · 2026-08-03 · **PASS**

**What changed:** `package.json`, `tsconfig.json`, `index.html`, `src/main.ts`,
`.gitignore`, `.claude/launch.json`. Deps: vite 5.4, typescript 5.6, vitest 2.1. Git repo
initialised, first commit `65068a7`.

**Proof result:**
- `npx tsc --noEmit` → clean
- `npm install` → exit 0
- Dev server on :5173 → `status=200`, and `/src/main.ts` served transpiled
- `git log` → repository exists with one commit

**Contract result:** C1–C5 not yet applicable (no game code). Not claimed as passing.

**Surprising — 3 items, all environmental:**

1. **`npm create vite@latest .` could not be run as the plan specifies.** The directory
   already contained `factory/`, and current Vite prompts *"Current directory is not empty →
   Remove existing files?"*, which cannot be answered in a non-interactive shell. Running it
   blind risked deleting the entire project record. Scaffolded by hand to the same
   done-condition. **This is a plan defect, not a build defect:** T0 was written assuming an
   empty directory, but the pipeline itself creates `factory/` before T0 runs. Any future
   project using this skill hits the same thing.

2. **The Browser pane could not open the app.** `preview_start` resolves `.claude/launch.json`
   against the *old* working directory (`C:\workspace\musicteacher`), and direct navigation
   to `http://localhost:5173` is blocked by policy. Verified over HTTP with curl instead.
   **This matters for T16**, whose dry run assumes browser automation — counter sampling and
   the 6-screenshot frozen-frame test both need a real browser. If this is not resolved,
   T16's D-2 cannot run as written and the gate needs a different mechanism. Flagged now
   rather than discovered at the gate.

3. **CRLF warnings on every file.** Windows checkout; harmless, but a `.gitattributes` would
   silence it. Not doing it unprompted — out of plan scope.

**Next:** T1 (fixed-timestep loop) — `[STRUCTURAL]`, so the loop halts here for human review.

---

## T0b — Browser preview unblocked · 2026-08-03 · **PASS** · commit `90268db`

Resolves surprise #2 above, which was flagged as a threat to the T16 dry-run gate.

**Three separate causes, each of which alone would have blocked it:**

1. **Port collision, self-inflicted.** The stray `npx vite --port 5173` started during T0's
   verification was still holding the port. Killed (PID 28144). `autoPort: true` set so a
   future collision resolves itself — D4Drive has no OAuth callback, webhook, or CORS origin
   that needs a fixed port.
2. **`autoPort` alone did nothing.** Vite pins 5173 regardless of the `PORT` env var, and
   `package.json` carried no `--port` flag to remove. Added `vite.config.ts` with
   `server.port = process.env.PORT`. **Without this the setting is silently inert** — it
   looks configured and isn't.
3. **`preview_start` resolves `.claude/launch.json` against the session's *original* working
   directory** (`C:\workspace\musicteacher`), not the current one, and ignores the config in
   the project itself. That directory was empty. Wrote a launch config there invoking
   `npm --prefix C:/workspace/d4drive run dev`, so the tool starts the right project from the
   only place it will look.

**Proof:** `preview_start` → server on :5173, tab opened. `document.title === "D4Drive"`,
canvas present at 1280×720, **1246 non-background pixels** in the text band (colour
`[55,61,69]` — antialiased `#7d8794` on `#22262d`), console error-free.

**Note on the proof:** the screenshot action fails when the Browser pane isn't displayed —
"not compositing frames". Verified by reading pixels out of the canvas with JavaScript
instead, which is stronger evidence than a screenshot anyway: it proves the canvas *painted*,
not merely that a page exists.

**Still open for T16:** D-2's frozen-frame test needs 6 real screenshots, and screenshots
require the Browser pane to be visible. Pixel sampling can verify D-1's counters and D-3's
liveness without it, but **D-2 cannot be automated while the pane is hidden** — it needs the
pane open, or it becomes a manual step for the user. Not a blocker now; must be settled
before the gate.

**Surprising:** three independent failures stacked in one feature, and fixing any two would
still have left it broken with a different error message. The `autoPort` one is the
dangerous kind — a setting that reports success and does nothing.

---

## T1–T4 — the structural sitting · 2026-08-03 · **PASS** · commit `ba0f2e8`

All four verbatim from `PLAN.md`. **25 tests pass, `tsc --noEmit` clean.**

**What changed:** `src/engine/loop.ts`, `src/road/road.ts`, `src/profiles/{types,validate,
trivandrum,singapore}.ts`, `src/sim/{rng,speed,player}.ts`, `src/input/input.ts`,
`src/render/renderer.ts`, `src/main.ts` rewritten. Four test files.

**Invariant verified by grep:** `src/profiles/` does not import `src/road/`; the only
`profiles` match under `src/road/` is the comment stating the rule. Keyboard events are read
only in `src/input/`.

**Contract result:** C1–C5 still not claimed. C1 needs traffic (T5+), and see the blocker below.

### Surprising — 1: the plan's T3 attack 6 was not a valid test

`PLAN.md` specified: *"Roll 10,000 Singapore bus speeds and 10,000 car speeds → the bus
maximum stays below the car minimum. If they overlap, the kind factor is applied in the wrong
order."* It fails on correct code, for two independent reasons:

1. Singapore is mean 178 / stdDev 12, so the clamp bounds `[62.3, 338.2]` are **never
   reached**. The clamp never engages, so the ordering it probes is unobservable there.
2. Bus (mean 138.8) and car (mean 178) are ~2.9σ apart. Across 10,000 samples the tails
   overlap regardless of implementation.

**The check was therefore incapable of detecting the bug it was written for.** Replaced with
one that works: ordering is only observable where the clamp bites, i.e. Trivandrum. Correct
order floors bus speeds at `0.35 × 170 × 0.78 = 46.41`; the wrong order clamps the low tail
back up to `59.5`. That distinction is sharp and seed-independent.

**Worth noting as a pipeline lesson:** a weaker builder would most likely have "fixed" this
by loosening the assertion until it passed, leaving a test that asserts nothing — exactly
the *tests that can't fail* category the Step 6 review is meant to catch.

### Surprising — 2: two of my own test expectations were wrong

Both in `loop.test.ts`, both arithmetic, code unchanged in both cases:
- `advance(0.5)` exceeds the 0.25s clamp, so 15 steps is correct, not 30. I wrote the
  expectation as though the clamp under test did not exist.
- Ten additions of `0.01` sum to `0.09999999999999999`, landing just under the sixth tick.
  Rewritten to assert 5–6 steps, since the real discriminator is that a remainder-dropping
  loop yields **zero** — each 10ms frame is shorter than one 16.67ms tick.

### Surprising — 3, and it BLOCKS T16: rAF is dead while the pane is hidden

Attempted to verify T4 by driving the car through the debug hook. The player did not move at
all. Cause is not the code:

```
rafFramesIn1s: 0,  visibilityState: "hidden",  hidden: true,  hasFocus: false
```

**`requestAnimationFrame` fires zero times per second when the Browser pane is not
displayed.** The tab never composites, so the game loop never steps. Same root cause as the
failed screenshot in T0b.

Consequences, in order of severity:

- **T16's dry run cannot run as written.** D-1 (counter sampling) and D-3 (liveness) both
  assume the simulation advances in a browser. It does not. D-2 (screenshots) was already
  known to need a visible pane.
- **C1–C5 cannot be verified from this session** while the pane stays hidden. They are
  browser checks by definition.
- Mitigation used here: T1 and T4 are verified headlessly in Node with a hand-driven clock,
  which is *stricter* than a browser check — it tests the 60-second backgrounded-tab case
  directly, which no live browser test could do conveniently.

**Proposed fix for T16, for the user to rule on:** move D-1 and D-3 to a headless Node
harness that runs the sim with the seeded RNG at faster than real time and counts events
directly. This is better evidence than watching a browser for 60 seconds — deterministic,
repeatable, and it can sample far more than 60 seconds. D-2's screenshots still require the
pane to be open, and that part stays manual unless the pane is displayed.

**Next:** T5 (spawning) — first `[LEAF]`. Night-shift eligible.

---

## T5 — Spawning and despawning · 2026-08-03 · **PASS** · commit `799d74a`

**What changed:** `src/sim/world.ts` (agents, spawn, despawn, census), `src/sim/harness.ts`
(headless driver), `src/sim/world.test.ts`. `PLAYER_START_X` 80 → 1700 so the rear spawn
edge has road behind it.

**Proof:** population plateaus, fleet mix matches, deterministic per seed, different seeds
diverge, despawn keeps pace with spawn over a 300s soak.

**Design note:** the world holds no DOM. This was not in the plan but follows directly from
the rAF finding — a sim that only runs in a browser cannot be verified when the pane is
hidden. It is also what makes the proposed headless route for T16 possible.

**Surprising — 1: I misread noise as a bug.** A single 120s census showed Trivandrum at
16% car / 40% auto against an authored 34/30, and I flagged it as a defect. It was a
45-vehicle snapshot being read as a distribution. Time-averaged over 180s the spawn mix
lands at 33.6/34.3/8.6/23.6. **Lesson: instantaneous census is not distribution.**

**Surprising — 2: a real bias hid underneath the noise.** Buses spawned at 7.7% against an
authored 11%. Spawning dropped the vehicle when its randomly chosen lane was blocked, and a
96px bus fails a clearance check far more often than a 26px bike — so the drop was biased by
length. Now every lane is tried before giving up: skips 53 → 7, bus share 8.6% spawned /
10.9% live. This matters because `PLAN.md` T3 marks Singapore's bus share as load-bearing
for C3's queueing check. `weightedPick` itself was verified unbiased to within 0.06pp over
400k draws.

---

## T6 — Car following · 2026-08-03 · **PASS** · commit `ab286c5`

**What changed:** IDM longitudinal model in `src/sim/world.ts`, `following.test.ts`, plus
two corrections described below.

**Proof:** no vehicle passes through another in either profile; Singapore holds a larger
minimum gap than Trivandrum and stays above 20px; Singapore gaps are more uniform than
Trivandrum's; no vehicle travels backwards; nothing overlaps the player (A3).

**Measured gaps now sit on the authored floors** — Singapore 31.8px (floor 34), Trivandrum
5.9px (floor 6). Before the fix both read exactly 1.0px, i.e. the collision backstop.

### Surprising — 1: the first car-following model never worked, and the tests said PASS

The initial hand-rolled rule braked when `gap < headway` and eased toward the leader's
speed. Every measured minimum gap was exactly `1.0` — the hard backstop — in **both**
profiles and in every condition. The behavioural model was contributing nothing; the
anti-overlap guard was doing all the work.

The arithmetic: Singapore begins braking at a 57px gap, but stopping from 176px/s at its
comfortable 210px/s² needs ~74px. It could not stop in the distance it left itself, so it
always overshot onto the backstop. Replaced with the Intelligent Driver Model, which derives
required gap from closing speed. Time headway is now *derived* from the profile
(`followingDistance.mean / desiredSpeed.mean` → Trivandrum 0.15s, Singapore 0.33s) rather
than authored separately, so it cannot drift out of sync with `followingDistance`.

**The dangerous part: the T6 tests as originally written passed the broken model.** They
asserted "no overlaps" — which the backstop guarantees by construction. A check that the
backstop alone satisfies cannot detect the absence of car-following. This is the *tests that
can't fail* category, found in my own work rather than in the plan's.

### Surprising — 2: the player was 2.5x faster than all traffic

`PLAYER_MAX_SPEED` was 420px/s against profile means of 170–178. The player outran the
entire simulation window and never interacted with traffic at all — population under a
driving player collapsed to 7–10 agents. Set to 285 (~1.6× mean, below the ~280 that
Trivandrum's spread produces). Nothing in the plan specified this; I picked 420 arbitrarily
in T4 and it went unnoticed until gap statistics had too few samples to be meaningful.

### Surprising — 3, and it BLOCKS the C3 protocol: there is no roadside to park on

C3 says *"Bring the car to a stop at the roadside and do not touch the controls. Observe for
30 seconds."* The road model has no roadside. The player can only stop **inside a lane**,
and until T8 adds lane changing there is no way past a stopped vehicle. Measured, parked,
over 150s:

| | end pop | pop 1st half → 2nd half | min gap | stopped in player's lane |
|---|---|---|---|---|
| Trivandrum parked | 92 | 58 → 96 | 1.0px | **33** |
| Singapore parked | 43 | 35 → 43 | 28.2px | **18** |
| Trivandrum driving | 12 | 17 → 12 | 2.0px | 12 |
| Singapore driving | 12 | 21 → 12 | 31.8px | 12 |

**Parking the player creates a permanent, growing jam.** C3's passive-observation phase —
the most diagnostic part of the whole test protocol — would show a tester a traffic jam
caused by their own parked car, in both cities, and the two would look far more alike than
they should.

Two candidate causes, and they are not exclusive:
- **T8 (lane changing) does not exist yet.** Once traffic can go around, a stopped vehicle
  stops being an absolute barrier. This may resolve most of it.
- **`Road` has no shoulder.** `laneCenterY`/`roadWidthPx` describe carriageway only, and
  `updatePlayer` clamps the player inside it. Adding a shoulder means changing `Road`, which
  is a `[STRUCTURAL]` artifact given verbatim in the plan.

Per the plan's standing instruction — *"where a decision seems missing, stop and ask rather
than inventing one"* — I have not changed `Road`. **Escalated to the user.**

Interim: gap and population assertions now run with the player driving, and say in-comment
why. The parked case is asserted only for "nothing overlaps the player", which must hold
regardless.

**Next:** T7 (lane discipline), pending the roadside decision — T7 and T8 both write lateral
motion, and a shoulder changes what the lateral bounds are.

---

## T7–T8 — Lane discipline, overtaking, and the verge · 2026-08-03 · **PASS** · commit `bd018e2`

**47 tests pass, `tsc --noEmit` clean.**

### The experiment the user ordered: "do T8 first, add a shoulder only if still bad"

Worth having run — it was the cheaper test and it changed what we knew. Measured over 150s:

| scenario | population | jammed behind player | worst 2D overlap |
|---|---|---|---|
| before T8, parked in lane | 58 → 96 | 33 | — |
| after T8, parked in lane | 57 → 79 | 21 | 11.4px |
| after verge, pulled over | 52 → 95 | **0** | 3.8px |

**T8 alone was not enough.** Lane changing cut the jam by about a third but could not remove
it: on a two-lane road at ~130 vehicles/min a stopped vehicle congests everything behind it.
Realistic, and unusable for C3. So the verge was added — `Road.shoulderPx = 26`, player only.
Logged as `DECISIONS.md` D8. The experiment still earned its place: it established the jam
was not merely an artefact of missing lane changes, which is what justified touching a
`[STRUCTURAL]` artefact at all.

### Surprising — 1: cut-ins were arithmetically impossible, and a profile field was dead

Gap acceptance required the rear gap to clear `minAcceptedGapFactor × length` = 39px for a
car, while a cut-in was counted only when the rear gap was **under** 26px. Mutually
exclusive — cut-ins could never fire for cars, and the counter read 1 across a whole run.
`cutInAggression` was meanwhile **not referenced anywhere in the code at all**.

Both fixed together: a driver diving into a gap cares about the space *ahead*; the space
behind is the other driver's problem. `cutInAggression` is now the probability of accepting
only the hard minimum at the rear — Trivandrum 0.70, Singapore 0.02. Cut-ins went 1 → 67.

**A dead profile field is the quiet version of this failure.** The schema is the product;
a field nothing reads is a cultural difference that does not exist, and nothing fails.

### Surprising — 2: three separate ways vehicles drove through each other

True 2D overlap, worst case in Trivandrum, was 27.8px on 22px-wide cars — vehicles merging
into one another rather than jostling. Three independent causes, each needing its own fix:

1. **Straddlers were intangible.** A vehicle sitting on the boundary did not *occupy* the
   lane it was half in, so nothing saw it. → `occupies()` now includes the straddled lane.
2. **Straddling started with someone alongside.** → clearance check before drifting onto
   the line.
3. **The longitudinal backstop cannot see sideways motion.** It clamps forward movement
   only, so a lane-changer or straddler slid laterally into a vehicle level with it.
   → an explicit lateral guard.

Result: 27.8 → 3.8px in Trivandrum, and **exactly 0** in Singapore. Nonzero in Trivandrum is
acceptable and arguably wanted — the jostle is the point — but 3.8px is a graze, not a merge.

**Note the earlier false alarm:** an intermediate reading of −10.8px was a *measurement*
artefact, not a collision. The probe grouped vehicles by `a.lane`, which is stale mid-change:
a vehicle that has physically moved to the next lane is still filed under its old one. The
real check compares actual bodies in 2D.

### Surprising — 3: a frozen contract check is ambiguous

C3 requires **zero** centreline crossings from Singapore, but Singapore has
`overtakeUrgency: 0.10`, and on a two-lane road every overtake crosses the only centreline
there is. Read literally, C3 forbids Singapore from ever changing lane.

Implemented reading: the counter measures deliberate *straddling* (riding the line), not
clean lane changes — which matches C3's Trivandrum bullet pairing "crossing the lane
centreline **or straddling lanes**" as one signal. Measured: Singapore 0 straddles, 0–4 lane
changes; Trivandrum ~200 of each.

**Escalated as `DECISIONS.md` D9 rather than decided silently**, because it interprets a
frozen check. If the user disagrees, the fix is one number: Singapore `overtakeUrgency` → 0.

### C3 counter readings now available (D-1 preview)

Per 90–120s, player driving:

| signal | Trivandrum | Singapore |
|---|---|---|
| centreline straddles | ~200 | **0** |
| sub-length gap accepts | ~96 | **0** |
| cut-ins | ~67 | 0–1 |
| lane changes | ~200 | 0–4 |

Every C3 Trivandrum bullet implemented so far fires repeatedly; every Singapore "exactly
zero" requirement reads exactly zero.

**Next:** T9 (vehicle kinds rendering), T10 (pedestrians), T11 (hot-swap), T12 (arrived),
T13 (restart), T14 (soak), T15 (overlay). Stop condition 5 (five leaf tasks since last human
contact) is now due: T5, T6, T7, T8 done — halting at four with a decision outstanding.
