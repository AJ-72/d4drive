# PLAN.md — Step 3, The Blueprint

**Target:** the spike defined in `factory/CONTRACT.md` (frozen). Nothing beyond it.
**Stack:** TypeScript + HTML5 Canvas + Vite, no game engine (D2).
**Tasks:** 17 (T0–T16). **Checkpoints:** 5 — T1, T2, T3, T4 (structural, front-loaded) and
T16 (the dry run, which gates inviting human testers).

---

## Standing instruction to the builder

> **Where this plan gives exact code, use it verbatim.** Do not "improve" a schema, rename a
> field, or drop a constraint that looks unused — several are load-bearing for tasks that
> come later, and the plan says which.
>
> **Where a decision seems missing, stop and ask.** Do not invent one. An invented schema is
> the single most expensive failure available to you: it is cheap to write, it looks correct,
> and it silently breaks every task after it.
>
> **`CONTRACT.md` is frozen.** If a contract check appears wrong, ambiguous, or impossible,
> halt and write `BLOCKED` in `STATE.md`. Never edit it, never loosen a threshold, never
> delete a check.

---

## The one invariant everything else protects

**A traffic profile describes how agents behave. A road describes shape. Neither knows the
other exists.**

Concretely, and checkable by grep:

- Nothing in `src/profiles/` may import from `src/road/`.
- Nothing in `src/road/` may import from `src/profiles/`.
- Only `src/sim/` imports both and composes them.

**Why:** the project's north star (D5) is *type any real road and drive it, with local
culture applied.* That requires attaching an arbitrary profile to arbitrary geometry. If
profiles get baked into hand-built roads, reaching the north star means rewriting both.
This costs nothing to honor now.

**This is a review item.** It is the kind of rule violated by accident, in a hurry, by one
convenient import.

---

# T0 — Scaffold `[GATE — blocks everything]`

From `GROUND_TRUTH.md`. No game code.

```bash
cd /c/workspace/d4drive
git init
npm create vite@latest . -- --template vanilla-ts
npm install
npm run dev
```

**Done when:** `npm run dev` serves a page that renders in a browser, and `git status`
reports a repository. Commit as `T0: scaffold`.

---

# T1 — Game loop and canvas `[STRUCTURAL]` ⛔ CHECKPOINT

A fixed-timestep simulation with decoupled rendering. **Use this shape verbatim:**

```ts
// src/engine/loop.ts
export const FIXED_DT = 1 / 60; // seconds. Simulation step. Never varies.

export function startLoop(
  step: (dt: number) => void,
  render: (alpha: number) => void,
): () => void {
  let last = performance.now() / 1000;
  let accumulator = 0;
  let running = true;

  const frame = () => {
    if (!running) return;
    const now = performance.now() / 1000;
    // Clamp: a backgrounded tab produces a huge delta. Without this clamp the
    // accumulator runs hundreds of steps at once and the sim explodes.
    // C4 (3-minute unattended soak) fails without it.
    const frameTime = Math.min(now - last, 0.25);
    last = now;
    accumulator += frameTime;

    while (accumulator >= FIXED_DT) {
      step(FIXED_DT);
      accumulator -= FIXED_DT;
    }
    render(accumulator / FIXED_DT);
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
  return () => { running = false; };
}
```

**Load-bearing details, and what breaks without them:**
- **`FIXED_DT` fixed, never `deltaTime` from the frame.** Variable timestep makes agent
  behavior frame-rate dependent, which means the blind test shows different traffic on a
  fast laptop than a slow one — and C3 becomes unreproducible.
- **The 0.25s clamp.** Without it, C4 fails the moment a tab is backgrounded.
- **The returned stop function.** T13 (restart) needs to tear a session down.

**Done — as an attack:** open the page, switch to another tab for 60 seconds, come back.
Traffic must be in a sane state, not teleported or piled up. Then throttle the browser to
6× CPU slowdown in devtools; vehicle *speeds over ground* must be unchanged, only smoothness.

---

# T2 — Road model `[STRUCTURAL]` ⛔ CHECKPOINT

The road is pure geometry. **Verbatim:**

```ts
// src/road/road.ts
// A road is a straight strip for the spike. The centerline runs along +x.
// Lanes are indexed 0..laneCount-1 from the top edge (-y) downward.
// This module must NOT import anything from src/profiles/.

export interface Road {
  readonly lengthPx: number;
  readonly laneCount: number;
  readonly laneWidthPx: number;
  /** Positions along the road (x, in px) where pedestrians may legally cross. */
  readonly crossingsPx: readonly number[];
}

export const SPIKE_ROAD: Road = {
  lengthPx: 12000,
  laneCount: 2,
  laneWidthPx: 90,
  crossingsPx: [3000, 6000, 9000],
};

/** World-space y of the centre of a lane. Lane 0 is topmost. */
export function laneCenterY(road: Road, lane: number): number {
  return (lane + 0.5) * road.laneWidthPx;
}

/** World-space y of the boundary between lane and lane+1. */
export function laneBoundaryY(road: Road, lane: number): number {
  return (lane + 1) * road.laneWidthPx;
}

/** Which lane a given y falls in. Fractional part = position within the lane. */
export function laneAtY(road: Road, y: number): number {
  return y / road.laneWidthPx - 0.5;
}

export const roadWidthPx = (road: Road): number => road.laneCount * road.laneWidthPx;
```

**Load-bearing:** `laneAtY` returning a **fractional** lane is what makes "crossing the
centerline" detectable in T7 and countable in T15. An integer-only version cannot express
straddling, and C3's first Trivandrum bullet becomes unimplementable.

**Done — as an attack:** `grep -r "profiles" src/road/` returns nothing. Unit-check that
`laneAtY(road, laneCenterY(road, 1)) === 1` and that a y on the boundary gives `.5`.

---

# T3 — The traffic profile schema `[STRUCTURAL]` ⛔ CHECKPOINT

**The most load-bearing task in the project.** Every agent behavior, every city, and the
entire USP route through this type. Use it **verbatim** — do not rename fields, do not drop
fields that look unused in early tasks, do not replace numbers with adjectives.

```ts
// src/profiles/types.ts
// Describes HOW AGENTS BEHAVE. Knows nothing about road geometry.
// Must NOT import anything from src/road/.

export type VehicleKind = 'car' | 'auto' | 'bus' | 'bike';

/** Physical facts about a vehicle kind. Same in every city — a bus is long everywhere. */
export interface VehicleSpec {
  readonly lengthPx: number;
  readonly widthPx: number;
  /** Multiplier applied to the profile's desired speed. */
  readonly speedFactor: number;
  /** Multiplier applied to the profile's max acceleration. */
  readonly accelFactor: number;
}

export const VEHICLE_SPECS: Readonly<Record<VehicleKind, VehicleSpec>> = {
  car:  { lengthPx: 46, widthPx: 22, speedFactor: 1.00, accelFactor: 1.00 },
  auto: { lengthPx: 34, widthPx: 20, speedFactor: 0.85, accelFactor: 1.15 },
  bus:  { lengthPx: 96, widthPx: 28, speedFactor: 0.78, accelFactor: 0.55 },
  bike: { lengthPx: 26, widthPx: 12, speedFactor: 1.05, accelFactor: 1.35 },
};

export interface Range { readonly mean: number; readonly stdDev: number }

export interface TrafficProfile {
  readonly id: string;
  readonly displayName: string;

  // ---- fleet composition. Values MUST sum to 1.0 (validated at load). ----
  readonly fleetMix: Readonly<Record<VehicleKind, number>>;
  /** Vehicles spawned per minute across the whole road. */
  readonly spawnRatePerMin: number;

  // ---- longitudinal: car-following ----
  /** px/sec. */
  readonly desiredSpeed: Range;
  /** px, bumper-to-bumper, at desired speed. */
  readonly followingDistance: Range;
  /** px. Hard floor; agents never intentionally close below this. */
  readonly minFollowingDistancePx: number;
  /** px/sec^2, positive magnitude. */
  readonly comfortableDecelPx: number;
  /** px/sec^2. */
  readonly maxAccelPx: number;

  // ---- lateral: lane discipline ----
  /** 0..1. 1 = never leaves lane centre. 0 = lane markings are decorative. */
  readonly laneDiscipline: number;
  /** px. Amplitude of idle wander around the lane centre. */
  readonly lateralDriftPx: number;
  /** Deliberate centreline crossings per vehicle per minute. C3 counts these. */
  readonly centerlineCrossPerMin: number;
  /** px/sec. How fast a vehicle moves sideways when changing lane. */
  readonly lateralSpeedPx: number;

  // ---- gap acceptance, overtaking, cutting in ----
  /** 0..1. Probability per second of attempting an overtake while blocked. */
  readonly overtakeUrgency: number;
  /** Multiple of own vehicle length. <1.0 means accepting gaps it does not fit in. */
  readonly minAcceptedGapFactor: number;
  /** 0..1. Probability an overtake ends by cutting in front rather than clearing fully. */
  readonly cutInAggression: number;
  /** 0..1. Probability of yielding when someone cuts in ahead. */
  readonly yieldProbability: number;

  // ---- pedestrians ----
  /** Pedestrians spawned per minute across the whole road. */
  readonly pedestrianRatePerMin: number;
  /** 0..1. Probability a pedestrian crosses away from a designated crossing. */
  readonly jaywalkProbability: number;
  /** px/sec. */
  readonly pedestrianSpeedPx: number;
  /** 0..1. Probability per second of stopping mid-road to wait for a gap. */
  readonly pedestrianHesitation: number;

  // ---- roadside disorder ----
  /** 0..1. Probability per vehicle per minute of stopping IN the roadway. */
  readonly roadsideStopPerMin: number;
  /** seconds. How long such a stop lasts. */
  readonly roadsideStopDurationSec: number;
}
```

Validation — **also verbatim**, and called at load, not lazily:

```ts
// src/profiles/validate.ts
import type { TrafficProfile, VehicleKind } from './types';

export function validateProfile(p: TrafficProfile): void {
  const kinds: VehicleKind[] = ['car', 'auto', 'bus', 'bike'];
  const sum = kinds.reduce((a, k) => a + (p.fleetMix[k] ?? 0), 0);
  if (Math.abs(sum - 1) > 1e-6) {
    throw new Error(`Profile "${p.id}": fleetMix sums to ${sum}, must be 1.0`);
  }
  const unit: (keyof TrafficProfile)[] = [
    'laneDiscipline', 'overtakeUrgency', 'cutInAggression', 'yieldProbability',
    'jaywalkProbability', 'pedestrianHesitation',
  ];
  for (const f of unit) {
    const v = p[f] as unknown as number;
    if (!(v >= 0 && v <= 1)) throw new Error(`Profile "${p.id}": ${String(f)}=${v}, must be 0..1`);
  }
  if (p.minFollowingDistancePx <= 0) throw new Error(`Profile "${p.id}": minFollowingDistancePx must be > 0`);
  if (p.spawnRatePerMin <= 0) throw new Error(`Profile "${p.id}": spawnRatePerMin must be > 0`);
}
```

**The two profiles — verbatim. These numbers are the product.**

```ts
// src/profiles/trivandrum.ts
import type { TrafficProfile } from './types';

export const TRIVANDRUM: TrafficProfile = {
  id: 'trivandrum',
  displayName: 'Trivandrum',
  fleetMix: { car: 0.34, auto: 0.30, bus: 0.11, bike: 0.25 },
  spawnRatePerMin: 130,
  desiredSpeed: { mean: 170, stdDev: 55 },
  followingDistance: { mean: 26, stdDev: 14 },
  minFollowingDistancePx: 6,
  comfortableDecelPx: 340,
  maxAccelPx: 260,
  laneDiscipline: 0.18,
  lateralDriftPx: 16,
  centerlineCrossPerMin: 7.0,
  lateralSpeedPx: 70,
  overtakeUrgency: 0.55,
  minAcceptedGapFactor: 0.85,   // < 1.0: takes gaps it does not fit in
  cutInAggression: 0.70,
  yieldProbability: 0.25,
  pedestrianRatePerMin: 26,
  jaywalkProbability: 0.85,
  pedestrianSpeedPx: 42,
  pedestrianHesitation: 0.35,
  roadsideStopPerMin: 0.9,
  roadsideStopDurationSec: 4.5,
};
```

```ts
// src/profiles/singapore.ts
import type { TrafficProfile } from './types';

export const SINGAPORE: TrafficProfile = {
  id: 'singapore',
  displayName: 'Singapore',
  fleetMix: { car: 0.72, auto: 0.00, bus: 0.16, bike: 0.12 },
  spawnRatePerMin: 118,          // deliberately close to Trivandrum's 130 — see below
  desiredSpeed: { mean: 178, stdDev: 12 },
  followingDistance: { mean: 58, stdDev: 8 },
  minFollowingDistancePx: 34,
  comfortableDecelPx: 210,
  maxAccelPx: 190,
  laneDiscipline: 0.97,
  lateralDriftPx: 2,
  centerlineCrossPerMin: 0.0,    // C3 requires exactly zero
  lateralSpeedPx: 34,
  overtakeUrgency: 0.10,
  minAcceptedGapFactor: 2.20,
  cutInAggression: 0.02,
  yieldProbability: 0.92,
  pedestrianRatePerMin: 22,
  jaywalkProbability: 0.02,
  pedestrianSpeedPx: 46,
  pedestrianHesitation: 0.05,
  roadsideStopPerMin: 0.0,
  roadsideStopDurationSec: 0,
};
```

**Speed composition — verbatim. Two sources of spread, and the order matters.**

A vehicle's desired speed comes from the profile *and* from its kind. The plan previously
left the combination unstated, which is a decision disguised as a task: a builder would pick
one of three plausible readings (multiply the draw, scale the mean before drawing, or cap at
the factor) and each produces materially different traffic. It is resolved here.

```ts
// src/sim/speed.ts
import { VEHICLE_SPECS, type TrafficProfile, type VehicleKind } from '../profiles/types';

/** Called ONCE per vehicle, at spawn. A vehicle's desired speed does not change over its life. */
export function rollDesiredSpeed(p: TrafficProfile, kind: VehicleKind, rng: () => number): number {
  const raw = gaussian(p.desiredSpeed.mean, p.desiredSpeed.stdDev, rng);
  // Clamp BEFORE applying the kind factor.
  // Trivandrum is mean 170 / stdDev 55: the lower tail reaches zero and negative.
  // Without this clamp a vehicle spawns permanently stationary in a live lane —
  // which looks like an intentional roadside stop and corrupts what C3 measures.
  const clamped = clamp(raw, 0.35 * p.desiredSpeed.mean, 1.9 * p.desiredSpeed.mean);
  // Kind factor applied LAST, so a bus is reliably slower than a car that drew the
  // same number. Applying it before the clamp would let a bus clamp back up to car speed.
  return clamped * VEHICLE_SPECS[kind].speedFactor;
}
```

Resulting desired speeds at each profile's mean draw:

| | car | auto | bus | bike |
|---|---|---|---|---|
| **Trivandrum** (mean 170, sd 55) | 170 | 145 | 133 | 179 |
| **Singapore** (mean 178, sd 12) | 178 | — | 139 | 187 |

**Load-bearing details, and what breaks without them:**

- **`fleetMix.bus: 0.16` for Singapore is not arbitrary — do not round it to zero.**
  A Singapore bus lands at ~139 against cars at ~178: a 39 px/s deficit, more than 3× the
  entire `stdDev`. Buses therefore *block* cars, and with `overtakeUrgency: 0.10` and
  `minAcceptedGapFactor: 2.20` the blocked car queues instead of passing. That queue is the
  only thing that makes C3's bullet "vehicles queueing behind a slower vehicle rather than
  forcing past it" observable. Remove the buses and there is nothing slow enough to queue
  behind, and the check becomes untestable while appearing to pass.
- **`spawnRatePerMin` 130 vs 118, and `desiredSpeed.mean` 170 vs 178 — nearly equal, and
  that is deliberate.** C3 fails if the two profiles differ mainly in *speed or density*.
  Making Singapore sparse and fast would be the easy way to fake a difference, and it is
  precisely the failure the contract forbids. **Do not "fix" these to be further apart.**
- **`desiredSpeed.stdDev` 55 vs 12.** Variance, not mean, is what reads as disorder.
- **`minAcceptedGapFactor` below 1.0 for Trivandrum.** This is what produces "overtaking
  into a gap it doesn't fit in" — C3 bullet 2. A value ≥ 1.0 makes it unreachable.
- **`centerlineCrossPerMin: 0.0` for Singapore.** C3 requires *zero* crossings. Any nonzero
  value fails the check.
- **`fleetMix.auto: 0.00` for Singapore.** C3's "vehicle kinds behave differently" bullet
  leans on autos being a Trivandrum signature.

**Done — as an attack, not a confirmation:**
1. Change `fleetMix.car` in `trivandrum.ts` to `0.44` and reload → app throws at startup with
   a message naming `trivandrum` and `fleetMix`. Revert.
2. Set `laneDiscipline: 1.4` → throws naming the field. Revert.
3. Delete any field from either profile → `npx tsc --noEmit` fails. Restore.
4. `grep -r "road" src/profiles/` returns no import of road geometry.
5. Roll 10,000 Trivandrum speeds through `rollDesiredSpeed` → **zero** results at or below
   zero, and the minimum is at or above `0.35 * 170 * min(speedFactor)`. The unclamped
   version fails this; that is the point of the check.
6. Roll 10,000 Singapore bus speeds and 10,000 Singapore car speeds → the bus distribution's
   maximum stays below the car distribution's minimum. If they overlap, the kind factor is
   being applied in the wrong order.

---

# T4 — Input abstraction and player vehicle `[STRUCTURAL]` ⛔ CHECKPOINT

```ts
// src/input/input.ts
// The rest of the game reads ONLY this shape. Nothing else may read a KeyboardEvent.
// This is what keeps mobile reachable later (BRIEF §2) without rewriting movement.
export interface InputState {
  readonly throttle: number; // -1 (brake/reverse) .. 1
  readonly steer: number;    // -1 (left) .. 1 (right)
}
export interface InputSource {
  sample(): InputState;
  dispose(): void;
}
export function createKeyboardInput(target: Window): InputSource { /* Arrow keys + WASD */ }
```

**Load-bearing:** `dispose()` exists because T13 (restart) must remove listeners. Without it,
repeated restarts stack keyboard handlers and the car accelerates twice as fast on run three
— which C5 catches only if you actually restart three times.

**Done — as an attack:** `grep -r "addEventListener('key" src/ --include=*.ts` matches only
`src/input/`. Restart the session 5 times, then verify the car's top speed is unchanged.

---

## Leaf tasks — safe for the loop, unattended

Each is independently visible and testable. Each ends with a commit.

**T5 `[LEAF]` — Spawning.** Spawn vehicles from `fleetMix` at `spawnRatePerMin`, despawn off
the ends. *Proof:* run, count on-screen vehicles over 60s — roughly stable, roughly matching
the mix (~30% autos in Trivandrum, none in Singapore).

**T6 `[LEAF]` — Car-following.** Longitudinal control toward `desiredSpeed`, respecting
`followingDistance` and `minFollowingDistancePx`, braking at up to `comfortableDecelPx`.
*Proof:* no vehicle ever overlaps another. In Singapore, gaps stay visibly uniform; in
Trivandrum they collapse and stretch.

**T7 `[LEAF]` — Lane discipline.** Idle wander by `lateralDriftPx`, deliberate centreline
crossings at `centerlineCrossPerMin`, lateral motion at `lateralSpeedPx`. *Proof:* watch 30s
of Singapore — zero vehicles touch a lane boundary. Watch 30s of Trivandrum — several straddle.

**T8 `[LEAF]` — Overtaking and cutting in.** `overtakeUrgency`, `minAcceptedGapFactor`,
`cutInAggression`, `yieldProbability`. *Proof:* in Trivandrum, observe a vehicle pull into a
gap smaller than itself and force the follower to brake. In Singapore, observe a vehicle sit
behind a slower one for 10+ seconds without attempting to pass.

**T9 `[LEAF]` — Vehicle kinds.** Render each kind distinctly (size from `VEHICLE_SPECS`,
distinct silhouette/colour) and apply `speedFactor` / `accelFactor`. *Proof:* buses are
visibly longest and slowest to accelerate; autos appear only in Trivandrum.

**T10 `[LEAF]` — Pedestrians.** Spawn at `pedestrianRatePerMin`; cross at `crossingsPx`
unless `jaywalkProbability` fires; `pedestrianHesitation` can stall them mid-road. *Proof:*
Trivandrum shows people crossing anywhere and pausing in traffic; Singapore shows crossings
only at marked points.

**T11 `[LEAF]` — Profile hot-swap (C2).** `T` swaps the active profile. **Existing agents
re-read the profile**; they are not destroyed and respawned, and the player is untouched.
*Proof:* the C2 check, including 10 rapid presses.

**T12 `[LEAF]` — Arrived state (C1).** Reaching `lengthPx` shows "Arrived".

**T13 `[LEAF]` — Clean restart (C5).** Tear down and rebuild a session: loop stopped, input
disposed, agents cleared. *Proof:* the C5 check — run three times in one page session, then
reload and run again; behavior identical.

**T14 `[LEAF]` — Soak stability (C4).** *Proof:* the C4 check — 3 minutes untouched, plus 60s
backgrounded. No pile-ups, no console errors, responsive afterwards.

**T15 `[LEAF]` — Instrumentation, OFF by default.** A debug overlay (toggle `` ` ``) counting
per 30s: centreline crossings, sub-length gap acceptances, cut-ins, roadside stops, jaywalks.
This is how C3 gets *measured* rather than argued about.
**Hard requirement: default off, and off on every fresh load.** C3 forbids any numeric readout
on screen during the blind test. A debug overlay that defaults on silently fails C3 while
looking like a helpful feature. *Proof:* fresh load shows no overlay; `` ` `` reveals it;
reload hides it again.

---

---

# T16 — The dry run `[GATE — blocks inviting testers]` ⛔ CHECKPOINT

**Runs after T15. Produces `factory/DRYRUN.md`. No friend may be invited until it passes.**

## What this is, and what it is emphatically not

**Not a substitute for the blind test.** The agent running this designed the profile numbers
and knows which city is on screen. It cannot be surprised, cannot be blind, and its opinion
that "Trivandrum feels chaotic" is worth nothing — it is reading its own homework.
`TEST_PROTOCOL.md` remains the only thing that decides the kill gate.

**What it is: a pre-flight check on the instrument.** Its job is to catch the builds that
would waste a tester — where jaywalking never fires, where Singapore has one stray
centreline crossing, where the overlay was left on, where traffic silently dies at minute
two. Those failures are invisible in a 20-second developer check and fatal in the room.

**Why the gate is worth the time:** `TEST_PROTOCOL.md` §7 forbids re-testing the same
people. Testers are a **non-renewable resource** — five friends, used once. Burning three of
them on a build where a required signal never fires does not produce a FAIL, it produces
*noise*, and noise is indistinguishable from a real negative. The dry run exists to make
sure the five sessions measure the idea rather than a bug.

## D-1 — Counter verification (the primary check)

Drive the browser to `npm run dev`, enable the debug overlay (T15), and sample **60 seconds
per profile**, normalised per vehicle-minute. Expected values follow directly from T3:

| Signal | Trivandrum | Singapore |
|---|---|---|
| Centreline crossings /veh/min | ~7.0 (±30%) | **exactly 0** |
| Sub-length gap acceptances | > 0, recurring | **exactly 0** |
| Cut-ins /veh/min | > 0, recurring | ~0 (≤ 0.05) |
| Roadside stops /veh/min | ~0.9 (±40%) | **exactly 0** |
| Jaywalks /min | ~22 (±30%) | ≤ 1 |
| Autos present | ~30% of fleet | **exactly 0** |

**Any "exactly 0" cell that is nonzero fails the gate.** C3 requires zero centreline
crossings from Singapore, and a single one during a tester's 30 seconds breaks the check.

## D-2 — The frozen-frame test

Capture **6 screenshots** — 3 per profile, at least 10 seconds apart, player parked, overlay
off. For each, record whether the profile is identifiable from the still image alone.

**Why this specific check:** C3's signals split into those visible in a frozen frame (lane
straddling, vehicle-kind variety, a pedestrian mid-road) and those only visible in motion
(cut-ins, patient queueing). A nervous tester glancing at someone else's laptop gets far
closer to the frozen-frame condition than to sustained observation. **If a still frame is
ambiguous, the difference is too subtle to survive a real session**, and the fix is more
lane straddling — not more speed.

**Pass:** 5 of 6 stills correctly classifiable by their static content, with the deciding
feature named for each.

## D-3 — Liveness of every C3 bullet

Confirm each of C3's six Trivandrum bullets and four Singapore bullets is observed **at
least once** in a 3-minute window. A bullet that never fires makes C3 unpassable, and it is
better to learn that from a script than from a friend's puzzled silence.

## D-4 — Narration (recorded, weighted at zero)

Write a plain description of each profile as if seeing it fresh. **Evidentiary weight: none.**
It is filed only so that, after the real sessions, we can compare what the builder *expected*
testers to notice with what they actually said. A large divergence is itself a finding.

## Also verified, because they are cheap and fatal

- Overlay **off** after a fresh reload (C3 forbids on-screen numerics)
- No audio (D6)
- No timer or score anywhere on screen
- Console clean after 3 minutes (C4)
- Three consecutive runs in one session behave identically (C5)

## Gate

**PASS** → `DRYRUN.md` records the numbers, the 6 stills, and an explicit
*"cleared to invite testers"*.
**FAIL** → fix and re-run the dry run. **Do not invite anyone.** A dry-run failure is a
build defect and costs a rebuild; a session failure costs a tester permanently.

---

## Audit — decisions that were disguised as tasks, now resolved

Caught while writing this plan, resolved here rather than left for the builder to invent:

1. *"Traffic behaves aggressively"* → resolved into 18 named numeric fields with units in T3.
2. *"Switch profile"* — destroy-and-respawn, or re-read? → **re-read** (T11). Respawning
   would reset the visible scene and make C2's "existing traffic changes within 5s" pass
   trivially and meaninglessly.
3. *"Vehicles behave differently by type"* — profile data or physical fact? → **physical**
   (`VEHICLE_SPECS`, T3), because a bus is long in every city. Only the *mix* is cultural.
4. *"Pedestrians jaywalk"* — where do they legally cross? → `crossingsPx` on the road (T2),
   because it is geometry, not culture.
5. *Speed/density as the difference* → explicitly forbidden, with the near-equal numbers and
   a "do not fix these" note in T3.

## Not decided — do not improvise

- Visual style beyond "distinguishable silhouettes". If it becomes blocking, ask.
- Whether the road scrolls or the camera follows. Builder's choice; it is a `[LEAF]` concern
  with no downstream dependency.
