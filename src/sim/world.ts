import {
  VEHICLE_KINDS,
  VEHICLE_SPECS,
  type TrafficProfile,
  type VehicleKind,
} from '../profiles/types';
import { laneBoundaryY, laneCenterY, roadWidthPx, type Road } from '../road/road';
import type { InputState } from '../input/input';
import { createRng, weightedPick, type Rng } from './rng';
import { rollDesiredSpeed } from './speed';
import { createPlayer, updatePlayer, type Player } from './player';

// The world holds no DOM and no canvas. Everything here runs in Node, which is what
// lets the sim be verified headlessly — requestAnimationFrame is paused whenever the
// browser pane is hidden, so a browser-only sim cannot be checked automatically.

// HANDOFF A7: simulate a window around the player, spawn at its edges, despawn beyond.
// Simulating the whole 12000px road is wasteful; simulating only the visible area makes
// traffic pop into existence in view, which reads as a bug.
export const SIM_MARGIN_PX = 1536; // 1.2 screen widths
const DESPAWN_SLACK_PX = 320;

export interface Agent {
  readonly id: number;
  readonly kind: VehicleKind;
  x: number;
  y: number;
  speed: number;
  /** Rolled once at spawn and never changed. */
  readonly desiredSpeed: number;
  /** Lane currently occupied. Equals targetLane except mid-change. */
  lane: number;
  /** Lane being moved into. T8 sets this; lane follows once the move completes. */
  targetLane: number;
  /** Phase offset so vehicles do not wander in unison. */
  driftPhase: number;
  /** World time of the next deliberate centreline straddle (T7). */
  nextStraddleAt: number;
  /** World time until which this vehicle sits on the lane boundary. */
  straddleUntil: number;
  /** Lane being straddled toward. */
  straddleLane: number;
  /** Rate-limits overtake decisions. */
  nextOvertakeCheckAt: number;
  /** A non-yielding driver ignores a cut-in until this time, then brakes hard (T8). */
  ignoreLeaderUntil: number;
}

export interface Counters {
  spawned: number;
  despawned: number;
  spawnsSkippedNoRoom: number;
  /** C3 Trivandrum bullet 1. Deliberate straddles, NOT clean lane changes. */
  centerlineStraddles: number;
  laneChanges: number;
  /** C3 Trivandrum bullet 2: took a gap shorter than its own length. */
  subLengthGapAccepts: number;
  /** C3 Trivandrum bullet 3: pulled in close enough to force the follower to brake. */
  cutIns: number;
}

export interface World {
  readonly road: Road;
  profile: TrafficProfile;
  agents: Agent[];
  player: Player;
  /** Seconds of simulated time. */
  time: number;
  rng: Rng;
  counters: Counters;
  nextId: number;
  spawnAccumulator: number;
}

export function createWorld(road: Road, profile: TrafficProfile, seed?: number): World {
  return {
    road,
    profile,
    agents: [],
    player: createPlayer(road),
    time: 0,
    rng: createRng(seed),
    counters: {
      spawned: 0,
      despawned: 0,
      spawnsSkippedNoRoom: 0,
      centerlineStraddles: 0,
      laneChanges: 0,
      subLengthGapAccepts: 0,
      cutIns: 0,
    },
    nextId: 1,
    spawnAccumulator: 0,
  };
}

function clampAccel(accel: number, aMax: number, maxBrake: number): number {
  return accel > aMax ? aMax : accel < -maxBrake ? -maxBrake : accel;
}

/** Bumper-to-bumper clearance between two vehicles at the same x. */
function longitudinalGap(a: Agent, bx: number, bKind: VehicleKind): number {
  return Math.abs(a.x - bx) - (VEHICLE_SPECS[a.kind].lengthPx + VEHICLE_SPECS[bKind].lengthPx) / 2;
}

function hasRoomAt(w: World, x: number, lane: number, kind: VehicleKind): boolean {
  // Clearance must be at least the gap this profile's drivers would choose to hold.
  // A fixed 12px let Singapore vehicles spawn closer than their own 34px following
  // distance, so the fleet started every life already too close and compressed below
  // the authored floor — which C3 reads as Singapore failing to keep its distance.
  const need = Math.max(w.profile.minFollowingDistancePx, 12);
  for (const a of w.agents) {
    if (a.lane !== lane) continue;
    if (longitudinalGap(a, x, kind) < need) return false;
  }
  return true;
}

function spawnOne(w: World): void {
  const { profile: p, rng } = w;
  const kind = weightedPick(p.fleetMix, VEHICLE_KINDS, rng);
  const desiredSpeed = rollDesiredSpeed(p, kind, rng);
  const firstLane = Math.min(w.road.laneCount - 1, Math.floor(rng() * w.road.laneCount));

  // HANDOFF A1: traffic is one-way (+x). A vehicle slower than the player would never
  // enter view if spawned behind, and a faster one would never enter if spawned ahead —
  // so each spawns at the edge it can actually traverse.
  const behind = desiredSpeed >= w.player.speed;
  const x = behind ? w.player.x - SIM_MARGIN_PX : w.player.x + SIM_MARGIN_PX;

  if (x < 0 || x > w.road.lengthPx) return;

  // Try every lane before giving up. Dropping the spawn on the first blocked lane
  // biases the realised fleet against LONG vehicles: a 96px bus fails the clearance
  // check far more often than a 26px bike, and measurement showed buses landing at
  // 7.7% against an authored 11%. Singapore's bus share is load-bearing for C3's
  // queueing check (PLAN.md T3), so this bias is not cosmetic.
  let lane = -1;
  for (let i = 0; i < w.road.laneCount; i++) {
    const candidate = (firstLane + i) % w.road.laneCount;
    if (hasRoomAt(w, x, candidate, kind)) {
      lane = candidate;
      break;
    }
  }
  // Never spawn on top of an existing vehicle. Stacked vehicles are one of the
  // failure modes C4 explicitly looks for after an unattended soak.
  if (lane < 0) {
    w.counters.spawnsSkippedNoRoom++;
    return;
  }

  w.agents.push({
    id: w.nextId++,
    kind,
    x,
    y: laneCenterY(w.road, lane),
    speed: desiredSpeed,
    desiredSpeed,
    lane,
    targetLane: lane,
    driftPhase: rng() * Math.PI * 2,
    nextStraddleAt: w.time + nextStraddleDelay(p, rng),
    straddleUntil: -1,
    straddleLane: lane,
    nextOvertakeCheckAt: w.time + rng() * OVERTAKE_CHECK_SEC,
    ignoreLeaderUntil: -1,
  });
  w.counters.spawned++;
}

function despawn(w: World): void {
  const lo = w.player.x - SIM_MARGIN_PX - DESPAWN_SLACK_PX;
  const hi = w.player.x + SIM_MARGIN_PX + DESPAWN_SLACK_PX;
  const kept: Agent[] = [];
  for (const a of w.agents) {
    if (a.x < lo || a.x > hi || a.x > w.road.lengthPx + DESPAWN_SLACK_PX) {
      w.counters.despawned++;
    } else {
      kept.push(a);
    }
  }
  w.agents = kept;
}

export function stepWorld(w: World, input: InputState, dt: number): void {
  w.time += dt;
  updatePlayer(w.player, input, w.road, dt);

  w.spawnAccumulator += (w.profile.spawnRatePerMin / 60) * dt;
  while (w.spawnAccumulator >= 1) {
    w.spawnAccumulator -= 1;
    spawnOne(w);
  }

  updateLateral(w, dt);
  followAndMove(w, dt);

  despawn(w);
}

const OVERTAKE_CHECK_SEC = 0.3;
const STRADDLE_MIN_SEC = 1.2;
const STRADDLE_VAR_SEC = 1.6;
const LANE_SETTLE_PX = 3;
const STRADDLE_CLEARANCE_PX = 10;

/** Exponential waiting time, so straddles are irregular rather than metronomic. */
function nextStraddleDelay(p: TrafficProfile, rng: Rng): number {
  if (p.centerlineCrossPerMin <= 0) return Number.POSITIVE_INFINITY;
  const meanSec = 60 / p.centerlineCrossPerMin;
  return -Math.log(1 - rng()) * meanSec;
}

function neighbourLanes(road: Road, lane: number): number[] {
  const out: number[] = [];
  if (lane > 0) out.push(lane - 1);
  if (lane < road.laneCount - 1) out.push(lane + 1);
  return out;
}

/**
 * True if `a` occupies `lane`. A vehicle occupies two lanes mid-change, and also
 * while straddling the boundary — without the straddle case, a Trivandrum vehicle
 * sitting on the centreline is invisible to the lane it is half in, and traffic
 * drives through it sideways (measured: 27.8px of true 2D overlap).
 */
function occupies(w: World, a: Agent, lane: number): boolean {
  if (a.lane === lane || a.targetLane === lane) return true;
  return w.time < a.straddleUntil && a.straddleLane === lane;
}

/** Clear distance ahead of / behind position x in a lane, ignoring `self`. */
function gapInLane(
  w: World,
  lane: number,
  x: number,
  kind: VehicleKind,
  self: Agent,
): { ahead: number; behind: number; follower: Agent | null } {
  let ahead = Number.POSITIVE_INFINITY;
  let behind = Number.POSITIVE_INFINITY;
  let follower: Agent | null = null;
  const half = VEHICLE_SPECS[kind].lengthPx / 2;
  for (const b of w.agents) {
    if (b === self || !occupies(w, b, lane)) continue;
    const bHalf = VEHICLE_SPECS[b.kind].lengthPx / 2;
    if (b.x >= x) ahead = Math.min(ahead, b.x - x - half - bHalf);
    else {
      const d = x - b.x - half - bHalf;
      if (d < behind) {
        behind = d;
        follower = b;
      }
    }
  }
  return { ahead, behind, follower };
}

/** Would moving `a` to `y` put its body inside another vehicle's? */
function laterallyClear(w: World, a: Agent, y: number): boolean {
  const spec = VEHICLE_SPECS[a.kind];
  for (const b of w.agents) {
    if (b === a) continue;
    const bSpec = VEHICLE_SPECS[b.kind];
    const dx = Math.abs(a.x - b.x) - (spec.lengthPx + bSpec.lengthPx) / 2;
    if (dx >= 0) continue; // not level with each other, lateral position is free
    const dy = Math.abs(y - b.y) - (spec.widthPx + bSpec.widthPx) / 2;
    if (dy < 0) {
      // Already overlapping? Then allow motion that increases separation, so a
      // vehicle can never be permanently pinned by a bad state.
      if (Math.abs(y - b.y) <= Math.abs(a.y - b.y)) return false;
    }
  }
  return true;
}

function updateLateral(w: World, dt: number): void {
  const p = w.profile;
  const rng = w.rng;

  for (const a of w.agents) {
    const spec = VEHICLE_SPECS[a.kind];

    // ---- T7: deliberate centreline straddling ----------------------------------
    // Singapore's centerlineCrossPerMin is 0, so nextStraddleAt is Infinity and this
    // never fires. C3 requires exactly zero for Singapore.
    if (w.time >= a.nextStraddleAt && a.lane === a.targetLane) {
      const options = neighbourLanes(w.road, a.lane);
      const pick = options[Math.floor(rng() * options.length)];
      // Do not drift onto the line while someone is alongside. Undisciplined is not
      // the same as intangible: without this check the straddler moves laterally into
      // a vehicle that is already level with it, and they overlap.
      const alongside =
        pick !== undefined &&
        (() => {
          const g = gapInLane(w, pick, a.x, a.kind, a);
          return g.ahead < STRADDLE_CLEARANCE_PX || g.behind < STRADDLE_CLEARANCE_PX;
        })();
      if (pick !== undefined && !alongside) {
        a.straddleLane = pick;
        a.straddleUntil = w.time + STRADDLE_MIN_SEC + rng() * STRADDLE_VAR_SEC;
        w.counters.centerlineStraddles++;
      }
      a.nextStraddleAt = w.time + nextStraddleDelay(p, rng);
    }

    // ---- T8: overtaking and gap acceptance -------------------------------------
    if (w.time >= a.nextOvertakeCheckAt) {
      a.nextOvertakeCheckAt = w.time + OVERTAKE_CHECK_SEC;
      const settled = a.lane === a.targetLane && w.time >= a.straddleUntil;
      if (settled) {
        const lead = leaderOf(w, a);
        const blocked =
          lead !== null &&
          lead.speed < a.desiredSpeed * 0.92 &&
          lead.x - a.x - spec.lengthPx < p.followingDistance.mean * 3;

        if (blocked && rng() < p.overtakeUrgency * OVERTAKE_CHECK_SEC) {
          const need = p.minAcceptedGapFactor * spec.lengthPx;
          // A driver diving into a gap cares about the space AHEAD; the space behind
          // is the other driver's problem. cutInAggression is the probability of
          // treating the rear gap that way — Trivandrum 0.70, Singapore 0.02.
          // Requiring the full comfortable gap at BOTH ends made cut-ins arithmetically
          // impossible for cars (rear >= 39px required, cut-in counted below 26px),
          // and left cutInAggression unused entirely.
          const rearNeed =
            rng() < p.cutInAggression ? p.minFollowingDistancePx : p.followingDistance.mean;
          for (const cand of neighbourLanes(w.road, a.lane)) {
            const g = gapInLane(w, cand, a.x, a.kind, a);
            if (g.ahead < need || g.behind < rearNeed) continue;

            a.targetLane = cand;
            w.counters.laneChanges++;
            // C3 bullet 2: a gap shorter than the vehicle itself. Only reachable
            // when minAcceptedGapFactor < 1.0, which is Trivandrum's 0.85.
            if (Math.min(g.ahead, g.behind) < spec.lengthPx) {
              w.counters.subLengthGapAccepts++;
            }
            // C3 bullet 3: pulled in close enough to force the follower to brake.
            if (g.follower && g.behind < p.followingDistance.mean) {
              w.counters.cutIns++;
              // A non-yielding driver does not react until it must, which turns a
              // merge into a forced brake. This is what yieldProbability buys.
              if (rng() > p.yieldProbability) {
                g.follower.ignoreLeaderUntil = w.time + 0.6;
              }
            }
            break;
          }
        }
      }
    }

    // ---- lateral motion --------------------------------------------------------
    const straddling = w.time < a.straddleUntil;
    const baseY = straddling
      ? laneBoundaryY(w.road, Math.min(a.lane, a.straddleLane))
      : laneCenterY(w.road, a.targetLane);

    // Idle wander. lateralDriftPx is 16 for Trivandrum, 2 for Singapore — visible
    // as restlessness in a frozen frame, which TEST_PROTOCOL D-2 leans on.
    const drift = Math.sin(w.time * 1.7 + a.driftPhase) * p.lateralDriftPx;
    const want = baseY + drift;
    const step = p.lateralSpeedPx * dt;
    const halfW = spec.widthPx / 2;

    let nextY = a.y + clampAccel(want - a.y, step, step);
    nextY = Math.max(halfW, Math.min(roadWidthPx(w.road) - halfW, nextY));

    // Lateral safety guard. The longitudinal backstop cannot help here: the
    // penetration is sideways, not forward. Without this, a straddling or
    // lane-changing vehicle slides into one that is level with it — measured at
    // 11.6px of body overlap in Trivandrum, and visible as cars merging into
    // one another rather than jostling.
    if (!laterallyClear(w, a, nextY)) {
      nextY = a.y; // hold station this step rather than move into someone
    }
    a.y = nextY;

    if (!straddling && Math.abs(a.y - laneCenterY(w.road, a.targetLane)) < LANE_SETTLE_PX) {
      a.lane = a.targetLane;
    }
  }
}

/**
 * The lane the player occupies, or null when the player is clear of the carriageway.
 * A player on the verge is not an obstacle — that is the whole point of the verge.
 */
export function playerLane(w: World): number | null {
  const halfW = VEHICLE_SPECS.car.widthPx / 2;
  if (w.player.y + halfW <= 0 || w.player.y - halfW >= roadWidthPx(w.road)) return null;
  const lane = Math.round(w.player.y / w.road.laneWidthPx - 0.5);
  return lane >= 0 && lane < w.road.laneCount ? lane : null;
}

/** The vehicle a given agent is following, or null if the lane ahead is clear. */
export function leaderOf(w: World, a: Agent): { x: number; speed: number; kind: VehicleKind } | null {
  let best: { x: number; speed: number; kind: VehicleKind } | null = null;
  for (const b of w.agents) {
    // A vehicle mid-change occupies both lanes, so it must be seen from both.
    if (b === a || b.x <= a.x) continue;
    if (!(occupies(w, b, a.lane) || occupies(w, b, a.targetLane))) continue;
    if (!best || b.x < best.x) best = { x: b.x, speed: b.speed, kind: b.kind };
  }
  // The player occupies a lane too. Without this, traffic drives straight through
  // the player and HANDOFF A3 ("AI reacts to the player") is silently unmet.
  const pLane = playerLane(w);
  if (pLane !== null && occupies(w, a, pLane) && w.player.x > a.x && (!best || w.player.x < best.x)) {
    best = { x: w.player.x, speed: w.player.speed, kind: 'car' };
  }
  return best;
}

/**
 * Time headway in seconds, derived from the profile rather than authored separately:
 * the distance a driver wants to keep, expressed as time at their preferred speed.
 * Trivandrum 26/170 = 0.15s. Singapore 58/178 = 0.33s. That ratio is the cultural
 * difference, and deriving it keeps it consistent with followingDistance by construction.
 */
export function timeHeadwaySec(p: TrafficProfile): number {
  return p.followingDistance.mean / p.desiredSpeed.mean;
}

function followAndMove(w: World, dt: number): void {
  const p = w.profile;
  const T = timeHeadwaySec(p);

  for (const a of w.agents) {
    const spec = VEHICLE_SPECS[a.kind];
    const aMax = p.maxAccelPx * spec.accelFactor;
    const b = p.comfortableDecelPx;
    const v = a.speed;
    const v0 = Math.max(a.desiredSpeed, 1);

    // Intelligent Driver Model. The previous hand-rolled rule braked on a fixed
    // headway threshold and could not stop in the distance it left itself: Singapore
    // began braking at a 57px gap but needed ~74px to stop from 176px/s, so every
    // queue packed down onto the collision backstop instead of holding station.
    // IDM derives the required gap from closing speed, so it brakes in time.
    let accel = aMax * (1 - Math.pow(v / v0, 4));

    // A driver who refused to yield to a cut-in has not reacted yet.
    const lead = w.time < a.ignoreLeaderUntil ? null : leaderOf(w, a);
    if (lead) {
      const gap = lead.x - a.x - (spec.lengthPx + VEHICLE_SPECS[lead.kind].lengthPx) / 2;
      const dv = v - lead.speed; // positive = closing
      const sStar =
        p.minFollowingDistancePx + Math.max(0, v * T + (v * dv) / (2 * Math.sqrt(aMax * b)));
      accel -= aMax * Math.pow(sStar / Math.max(gap, 1), 2);
    }

    // Emergency braking is allowed to exceed the comfortable rate — that is what
    // makes a Trivandrum cut-in read as a forced brake rather than a gentle ease-off.
    a.speed = Math.max(0, v + clampAccel(accel, aMax, b * 3) * dt);

    // Hard backstop: never let a vehicle pass through the one ahead. The behavioural
    // model above is what SHOULD prevent this; this is what guarantees it, and C4's
    // unattended soak is where the difference shows up.
    const next = leaderOf(w, a);
    let step = a.speed * dt;
    if (next) {
      const clearance =
        next.x - a.x - (spec.lengthPx + VEHICLE_SPECS[next.kind].lengthPx) / 2 - 1;
      if (step > clearance) {
        step = Math.max(0, clearance);
        a.speed = Math.min(a.speed, Math.max(0, next.speed));
      }
    }
    a.x += step;
  }
}

/** Fraction of live agents of each kind. Used by tests and the T15 overlay. */
export function fleetCensus(w: World): Record<VehicleKind, number> {
  const out = { car: 0, auto: 0, bus: 0, bike: 0 };
  for (const a of w.agents) out[a.kind]++;
  const n = w.agents.length || 1;
  return { car: out.car / n, auto: out.auto / n, bus: out.bus / n, bike: out.bike / n };
}
