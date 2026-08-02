# HANDOFF.md — Step 4, The Work Order

**Signature:** ☑ **Anand Jayaram** · date: 2026-08-03
All §2 defaults accepted as written, including A1 (same-direction traffic) and A2 (seeded PRNG).

The night crew asks its questions *before* you go to bed. Every ambiguity the builder can
foresee is below, each with a proposed default. Strike out anything you disagree with; a
default you don't cross out is a default the builder will use without asking again.

---

## 1. The work

| # | Task | Kind | Contract check it serves |
|---|---|---|---|
| T0 | Scaffold (git init, Vite, `npm run dev`) | **GATE** | — |
| T1 | Fixed-timestep loop + canvas | ⛔ **STRUCTURAL** | C4 |
| T2 | Road model (pure geometry) | ⛔ **STRUCTURAL** | C1, C3 |
| T3 | `TrafficProfile` schema + 2 profiles + speed roll | ⛔ **STRUCTURAL** | C3 |
| T4 | Input abstraction + player vehicle | ⛔ **STRUCTURAL** | C1, C5 |
| T5 | Spawning from `fleetMix` | LEAF | C3 |
| T6 | Car-following (longitudinal) | LEAF | C3 |
| T7 | Lane discipline / centreline crossings | LEAF | C3 |
| T8 | Overtaking, gap acceptance, cutting in | LEAF | C3 |
| T9 | Vehicle kinds (render + physics factors) | LEAF | C3 |
| T10 | Pedestrians and jaywalking | LEAF | C3 |
| T11 | Profile hot-swap on `T` | LEAF | C2 |
| T12 | "Arrived" state | LEAF | C1 |
| T13 | Clean restart | LEAF | C5 |
| T14 | Soak stability | LEAF | C4 |
| T15 | Debug overlay, **off by default** | LEAF | C3 (measurement) |
| T16 | **Dry run** — instrumented browser pass, `DRYRUN.md` | ⛔ **GATE** | blocks inviting testers |

**The loop halts at T1, T2, T3 and T4 and waits for a human.** They are deliberately first.
A bad leaf costs one task; a bad structural decision costs every task after it.

Realistically: **T0–T4 is one supervised sitting.** The night shift is T5 onward.

---

## 2. Ambiguities, with defaults

Answer by exception. Silence = the default stands.

**A1 — Traffic direction. `[the one I'd most like you to read]`**
The road has 2 lanes (T2). Are they same-direction or opposing?
→ **Default: same direction (one-way).** All five C3 bullets are reachable without oncoming
traffic, and overtaking into oncoming risks Trivandrum reading as *"broken/unfair"* rather
than *"chaotic"* — a tester who feels cheated describes the game, not the city. **Oncoming
traffic is held in reserve as ammunition for the exaggeration retry**, where being alarming
is the entire objective.

**A2 — Random seeding.**
→ **Default: a seeded PRNG, fixed seed, and the *same* seed for both profiles.** Two
consequences, both wanted: every tester sees the same traffic, so five sessions are
comparable rather than five different games; and the difference between profiles cannot be
luck, because the random stream is identical. `Math.random()` would quietly destroy both.

**A3 — Do AI vehicles react to the player?**
→ **Default: yes.** The player is just another vehicle in car-following and gap acceptance.
If traffic ignores the player, Trivandrum never actually cuts *you* off, and the driving
phases of the test protocol produce nothing.

**A4 — Player collision consequence.**
→ **Default: physical blocking, no fail state.** Vehicles cannot pass through each other, but
a collision does not end the run. Matches the contract's explicit exclusion. (If C3 reads
weakly, `BRIEF.md` risk 1 says add the fail state *before* touching profile numbers.)

**A5 — Camera.**
→ **Default: follows the player, positioned ~1/3 from the left edge**, so more road is
visible ahead than behind. Pure leaf concern, no downstream dependency.

**A6 — Canvas size.**
→ **Default: 1280×720 logical, scaled to fit the window, `devicePixelRatio` aware.** Same on
every tester's session; do not make it responsive.

**A7 — Simulation extent.**
→ **Default: simulate a window of ±1.5 screen widths around the player**, spawn at the
edges, despawn beyond. Simulating all 12000px is wasteful; simulating only the visible area
makes traffic pop into existence in view, which reads as a bug.

**A8 — Art.**
→ **Default: no assets. Coloured rounded rectangles** sized from `VEHICLE_SPECS`, with
silhouettes distinct enough that a bus, an auto and a bike are told apart at a glance —
which C3's last Trivandrum bullet requires. Pedestrians are small circles.

**A9 — Test runner.**
→ **Default: Vitest.** T3's done-conditions require rolling 10,000 speeds; that needs a
runner. `npm i -D vitest`, no other testing dependencies.

**A10 — Git.**
→ **Default: work on `main`, one commit per task**, message `T<n>: <task name>`. No PRs, no
branches; this is a solo spike.

**A11 — Pedestrian/vehicle collision.**
→ **Default: no physical effect in the spike.** Pedestrians are visual and behavioural
signals. Modelling ped collisions is a rabbit hole and serves no contract check.

---

## 3. Stop conditions — verbatim

Halt and write `BLOCKED` in `STATE.md` when any is true:

1. **Two consecutive failures on the same task.** Not three attempts at a fix — the second
   failure means the model of the problem is wrong, and further attempts dig the hole deeper.
2. **The next task is `[STRUCTURAL]`.**
3. **Any contract check that was passing now fails.**
4. **The fix requires editing `CONTRACT.md`, deleting a check, or adding a dependency not in
   the plan.**
5. **Five leaf tasks completed since the last human contact.**

**On halt: stop cleanly, commit, and write what was tried and what the blocker is.
Do not attempt a workaround.** A halted loop at 2am costs a few hours; a loop that improvises
past a bad assumption costs the whole night and takes longer to untangle than to redo.

Each cycle: read `STATE.md` → pick next task → build → run the task's proof → **run the full
contract C1–C5, not just the current task's check** → write `factory/log.md` → repeat.
Regressions are the main thing that goes undetected overnight, which is why the full contract
runs every cycle.

Diary entry per cycle: task, what changed, proof result, contract result, and anything
surprising. **"Surprising" gets its own line** — it is usually where the real bug is.

### Project-specific stop conditions

6. **Do not widen the gap between the two profiles' `spawnRatePerMin` or `desiredSpeed.mean`.**
   They are near-identical on purpose (130/118, 170/178). If the profiles don't look
   different enough, the answer is behavioural parameters, never pace or density. Widening
   them is the exact failure C3 forbids, and it would look like progress.
7. **Do not make the debug overlay default to on**, however convenient. C3 forbids any
   numeric readout on screen during the blind test.
8. **Do not add audio.** Deferred by protocol (D6), not by oversight.

---

## 4. Morning review — in this order

1. **`factory/log.md`, every "surprising" line first.** Before any code, before the demo.
2. **Run C3 yourself, silent, no overlay.** It is the check the project rests on and the one
   most easily satisfied on paper while failing in the room.
3. **Then C4** — leave it alone 3 minutes. Overnight builds pass short tests and rot under
   soak; the blind test involves people *watching*.
4. **Then C1, C2, C5.**
5. **Grep the invariant:** `src/profiles/` must not import `src/road/`, and vice versa. One
   convenient import at 3am and the north star becomes a rewrite.
6. **Diff the two profile files against `PLAN.md` T3.** If any number moved, find out why
   before anything else — a tuned constant is how a passing C3 becomes meaningless.
7. **Last:** what was skipped, what is still broken.

**Lead the report with what failed and what was skipped.** A green summary at 7am is the
least trustworthy artifact in this pipeline.

---

## 5. What the night shift explicitly may NOT do

- Edit `CONTRACT.md`, or any file under `factory/` other than `STATE.md` and `log.md`
- Add npm dependencies beyond Vite, TypeScript and Vitest
- Start a structural task
- Decide anything listed in §2 differently from its default without asking
- Declare the spike "done" — that verdict is `TEST_PROTOCOL.md`'s, and it needs people
- **Invite, schedule, or run a session with a human tester.** T16's dry run must pass first,
  and the decision to spend a tester is the user's alone. Testers are non-renewable:
  `TEST_PROTOCOL.md` §7 forbids re-testing anyone who has seen the game.

---

## Sign-off

By signing, you accept the defaults in §2 as written, the stop conditions in §3, and that
the loop will halt at T1–T4 for your review rather than running to completion.

**Signed:** ______________________  **Date:** __________
