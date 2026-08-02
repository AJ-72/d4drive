# CONTRACT.md — Step 2, The Acceptance Contract

**Scope: the SPIKE only.** Not the full game. The spike exists to answer one question —
*is traffic culture legible as gameplay?* — and this contract describes what the spike must
observably do for that question to be askable.

**Status:** ☑ **SIGNED AND FROZEN** · signed by: Anand Jayaram · date: 2026-08-02
C4 and C5 accepted into the contract as full checks (no longer proposals).

---

## The freeze rule

**Nothing downstream may edit this file.** Not the planner, not the builder, not the night
shift, not the reviewer.

If a check turns out to be wrong, ambiguous, or impossible, that is a **stop-and-ask** — halt,
write `BLOCKED` in `STATE.md`, and bring it to the user. It is never an edit, never a
loosened threshold, never a deleted check.

A test the builder can rewrite is not a test. It is a mirror.

---

## C1 — It drives

**Run:**
```bash
npm run dev
```
Open the served URL. Drive from the start of the road to the end using the arrow keys.

**A human sees:**
- The page loads to a top-down 2D road with the player's car on it. No blank canvas, no
  console errors on load.
- Arrow keys (and WASD) move the car: accelerate, brake, steer. The car responds within one
  visible frame of the keypress.
- Other vehicles are present and moving on the road, independently of the player.
- Driving to the end of the road produces a visible **"Arrived"** state.

**Fails if:** the car does not respond to input, the road does not render, the run cannot be
completed, or the browser console shows an uncaught error at any point.

---

## C2 — It switches

**Run:** with C1's session still open and mid-drive, press `T`.

**A human sees:**
- The active profile changes. The currently visible traffic **visibly changes behavior within
  5 seconds** — not only newly spawned vehicles.
- **No page reload. No loss of the player's position or momentum. No crash.**
- Pressing `T` repeatedly (at least 10 times in quick succession) leaves the game running and
  responsive, with traffic in a coherent state — not frozen, not stacked, not off-road.

**Fails if:** the switch requires a reload, the player is reset, existing traffic keeps its
old behavior indefinitely, or rapid toggling breaks the simulation.

---

## C3 — It reads

**This is the check the whole project rests on.**

**Run:** start a fresh session. Bring the car to a stop at the roadside and do not touch the
controls. Observe for **30 seconds** on each profile.

**Conditions — non-negotiable, they are why this check is trustworthy:**
- **Silent.** No audio of any kind.
- **No timer, score, or numeric readout visible anywhere on screen.**

**A human sees — Trivandrum profile, within 30 seconds, at least three of:**
- a vehicle crossing the lane centerline or straddling lanes
- a vehicle overtaking into a gap smaller than it comfortably fits
- a vehicle cutting across the front of another, forcing it to slow
- a vehicle stopping in the roadway (not at an edge) while others flow around it
- a pedestrian crossing the road away from any designated crossing point
- vehicles of visibly different kinds (auto, bus, car) behaving differently from one another

**A human sees — Singapore profile, across the same 30 seconds, all of:**
- **zero** lane-centerline crossings
- vehicles queueing behind a slower vehicle rather than forcing past it
- consistent following distances that do not collapse to zero
- pedestrians crossing only at designated points, or not at all

**Fails if:** either profile fails its list, or the two 30-second observations are
distinguishable only by *speed* or *vehicle count*. Speed and density are not culture — if
that is the whole difference, the check has failed even if the lists technically pass.

---

## C4 — It survives being left alone

**Run:** start the game, do not touch the controls, leave it for **3 minutes**. Then drive.

**A human sees:** the simulation is still running and coherent — traffic still flowing, no
pile-up at the road edges, no vehicles stacked on one another, no vehicles driven off the
map, no console errors accumulated, and the car still responds to input.

**Why this is in the contract:** the blind test asks people to *watch*, and unattended
simulations degrade in ways that a 20-second developer test never reveals. If the sim falls
apart at minute two, the kill test measures decay rather than culture.

---

## C5 — It restarts clean

**Run:** complete or abandon a run, then start another without reloading the page. Then
reload the page and start again.

**A human sees:** a fresh run begins from the start of the road with traffic in a fresh
state. No leftover vehicles from the previous run, no accumulated slowdown after several
runs, identical behavior on the third run as on the first.

**Why this is in the contract:** five testers in a row will use one session. Drift across
runs would make tester #1 and tester #5 evaluate different games without anyone noticing.

---

## Explicitly NOT in this contract

Stated so their absence is a decision rather than an oversight:

- **A player fail-state (crashing ends the run).** Deferred by the user's own scenario
  choice. `BRIEF.md` records the consequence: if C3 reads weakly in testing, add the
  fail-state *before* touching profile parameters.
- **Timer, best times, `localStorage`.** They ship in the game, not the spike, and would
  actively harm C3.
- **Audio.** Deferred by protocol, not by preference — see `DECISIONS.md` D6.
- **Real map data, location picker, multiple cities.** All behind the kill gate.
- **Mobile / touch input.** Desktop only.

---

## The check that no code can pass

The contract above proves the spike is a *working instrument*. It does not prove the idea is
good. That verdict comes from `KILL.md`:

> 3–5 people, in person, blind, asked only: **"Describe the difference between these two."**
> Pass = they name it unprompted in terms recognisable as traffic culture.
> Fail = "faster/slower", "more cars", or nothing.
> One exaggeration retry permitted, then stop.

**A green contract is a prerequisite for the kill test, never a substitute for it.**
