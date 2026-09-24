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
// 240 m: the 3D game fades traffic in from the haze between 190 m and 235 m, so the
// spawn edge is never in view. At 1536px (154 m) vehicles appeared mid-road.
export const SIM_MARGIN_PX = 2400;
const DESPAWN_SLACK_PX = 320;

export interface Agent {
  readonly id: number;
  readonly kind: VehicleKind;
  /** +1 drives toward +x with the player; -1 is oncoming (two-way profiles only). */
  readonly dir: 1 | -1;
  /** Oncoming driver with high beams on. The game dazzles the player with it after dark. */
  highBeam: boolean;
  x: number;
  y: number;
  speed: number;
  /** Rolled at spawn. Re-rolled only when the active profile is swapped (T11). */
  desiredSpeed: number;
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
  /** World time until which this vehicle is stopped IN the roadway (C3 bullet 4). */
  roadsideStopUntil: number;
  nextRoadsideCheckAt: number;
}

export interface Pedestrian {
  readonly id: number;
  x: number;
  y: number;
  /** Side being walked toward. Outside the carriageway on both ends. */
  targetY: number;
  /** True when crossing away from a marked crossing (C3 bullet 5). */
  readonly jaywalking: boolean;
  /** World time until which they have frozen mid-road. */
  hesitateUntil: number;
  nextHesitateCheckAt: number;
}

/** Anything a driver must not drive into. Vehicles, the player, and pedestrians. */
interface Obstacle {
  x: number;
  /** Along the observer's heading: negative means it is driving toward the observer. */
  speed: number;
  halfLength: number;
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
  /** C3 Trivandrum bullet 4: stopped in the roadway while others flow around. */
  roadsideStops: number;
  /** C3 Trivandrum bullet 5: crossed away from a marked crossing. */
  jaywalks: number;
  pedestriansSpawned: number;
  /** Two-way roads: vehicles spawned driving toward the player. */
  oncomingSpawned: number;
  /** Two-way roads: pulled out into the oncoming lane to pass. */
  passes: number;
  /** Two-way roads: cut a pass short because something was coming. */
  passesAborted: number;
}

export interface World {
  readonly road: Road;
  profile: TrafficProfile;
  agents: Agent[];
  pedestrians: Pedestrian[];
  player: Player;
  /** Seconds of simulated time. */
  time: number;
  rng: Rng;
  counters: Counters;
  nextId: number;
  spawnAccumulator: number;
  pedAccumulator: number;
  /** T12: the player reached the end of the road. */
  arrived: boolean;
}

/** Keep left: +x traffic holds lane 0, oncoming traffic the far lane. */
export function homeLane(road: Road, dir: 1 | -1): number {
  return dir > 0 ? 0 : road.laneCount - 1;
}

/** Distance from `a` to `x` along a's heading. Negative means behind it. */
function aheadOf(a: Agent, x: number): number {
  return (x - a.x) * a.dir;
}

export function createWorld(road: Road, profile: TrafficProfile, seed?: number): World {
  const player = createPlayer(road);
  // On a keep-left road the player starts in the left lane, not facing oncoming traffic.
  if (profile.twoWay) player.y = laneCenterY(road, homeLane(road, 1));
  return {
    road,
    profile,
    agents: [],
    pedestrians: [],
    player,
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
      roadsideStops: 0,
      jaywalks: 0,
      pedestriansSpawned: 0,
      oncomingSpawned: 0,
      passes: 0,
      passesAborted: 0,
    },
    nextId: 1,
    spawnAccumulator: 0,
    pedAccumulator: 0,
    arrived: false,
  };
}

function clampAccel(accel: number, aMax: number, maxBrake: number): number {
  return accel > aMax ? aMax : accel < -maxBrake ? -maxBrake : accel;
}

/** Bumper-to-bumper clearance between two vehicles at the same x. */
function longitudinalGap(a: Agent, bx: number, bKind: VehicleKind): number {
  return Math.abs(a.x - bx) - (VEHICLE_SPECS[a.kind].lengthPx + VEHICLE_SPECS[bKind].lengthPx) / 2;
}

/** A new vehicle never appears nose to nose with one already heading at it. */
const HEAD_ON_SPAWN_CLEAR_PX = 400;
/** Two-way roads: share of spawns that are oncoming traffic. */
const ONCOMING_SHARE = 0.5;

function hasRoomAt(w: World, x: number, lane: number, kind: VehicleKind, dir: 1 | -1 = 1): boolean {
  // Clearance must be at least the gap this profile's drivers would choose to hold.
  // A fixed 12px let Singapore vehicles spawn closer than their own 34px following
  // distance, so the fleet started every life already too close and compressed below
  // the authored floor — which C3 reads as Singapore failing to keep its distance.
  const need = Math.max(w.profile.minFollowingDistancePx, 12);
  for (const a of w.agents) {
    if (!occupies(w, a, lane)) continue;
    const gap = longitudinalGap(a, x, kind);
    if (gap < (a.dir === dir ? need : HEAD_ON_SPAWN_CLEAR_PX)) return false;
  }
  return true;
}

/**
 * Entry speed: the desired speed, unless a vehicle close ahead is slower. Entering at
 * full speed a few metres behind a stopped queue left no room to brake — measured as
 * a Singapore bike stopping 11px short, below that city's 34px floor.
 */
function spawnSpeed(w: World, x: number, lane: number, kind: VehicleKind, dir: 1 | -1, desired: number): number {
  const p = w.profile;
  let speed = desired;
  for (const b of w.agents) {
    if (b.dir !== dir || !occupies(w, b, lane)) continue;
    if ((b.x - x) * dir <= 0) continue;
    const room = Math.max(0, longitudinalGap(b, x, kind) - p.minFollowingDistancePx);
    speed = Math.min(speed, b.speed + Math.sqrt(2 * p.comfortableDecelPx * room));
  }
  return speed;
}

function spawnOne(w: World): void {
  const { profile: p, rng } = w;
  const kind = weightedPick(p.fleetMix, VEHICLE_KINDS, rng);
  const desiredSpeed = rollDesiredSpeed(p, kind, rng);
  const firstLane = Math.min(w.road.laneCount - 1, Math.floor(rng() * w.road.laneCount));
  // Only two-way profiles draw these, so one-way traffic replays exactly as before.
  const dir: 1 | -1 = p.twoWay && rng() < ONCOMING_SHARE ? -1 : 1;
  const highBeam = dir < 0 && rng() < p.highBeamProbability;

  // HANDOFF A1: with-flow traffic moves +x. A vehicle slower than the player would never
  // enter view if spawned behind, and a faster one would never enter if spawned ahead —
  // so each spawns at the edge it can actually traverse. Oncoming traffic always
  // enters from ahead.
  const behind = dir > 0 && desiredSpeed >= w.player.speed;
  const x = behind ? w.player.x - SIM_MARGIN_PX : w.player.x + SIM_MARGIN_PX;

  if (x < 0 || x > w.road.lengthPx) return;

  // Try every lane before giving up. Dropping the spawn on the first blocked lane
  // biases the realised fleet against LONG vehicles: a 96px bus fails the clearance
  // check far more often than a 26px bike, and measurement showed buses landing at
  // 7.7% against an authored 11%. Singapore's bus share is load-bearing for C3's
  // queueing check (PLAN.md T3), so this bias is not cosmetic.
  // A keep-left road has one lane per direction, so there is nothing to try.
  const candidates = p.twoWay
    ? [homeLane(w.road, dir)]
    : Array.from({ length: w.road.laneCount }, (_, i) => (firstLane + i) % w.road.laneCount);
  let lane = -1;
  for (const candidate of candidates) {
    if (hasRoomAt(w, x, candidate, kind, dir)) {
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
    dir,
    highBeam,
    x,
    y: laneCenterY(w.road, lane),
    speed: spawnSpeed(w, x, lane, kind, dir, desiredSpeed),
    desiredSpeed,
    lane,
    targetLane: lane,
    driftPhase: rng() * Math.PI * 2,
    nextStraddleAt: w.time + nextStraddleDelay(p, rng),
    straddleUntil: -1,
    straddleLane: lane,
    nextOvertakeCheckAt: w.time + rng() * OVERTAKE_CHECK_SEC,
    ignoreLeaderUntil: -1,
    roadsideStopUntil: -1,
    nextRoadsideCheckAt: w.time + 1,
  });
  w.counters.spawned++;
  if (dir < 0) w.counters.oncomingSpawned++;
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

export const PED_RADIUS_PX = 7;
const PED_HESITATE_SEC = 1.1;
/** Lateral margin at which a driver starts reacting to someone near the kerb. */
const PED_LOOKOUT_PX = 14;
/** A pedestrian will not step off the kerb into a vehicle this close. */
const PED_KERB_LOOKAHEAD_PX = 150;
/**
 * Where pedestrians come from and go to, beyond the road edge. Spawning them right at
 * the kerb made people pop into existence in plain view. The 3D coast lays out the
 * sea railing ~6.8 m beyond the top edge and the building fronts ~9.5 m beyond the
 * bottom edge: people walk out of the buildings, and appear at the railing (where
 * the game fades them in, as there is nothing to hide behind on the sea side).
 */
export const PED_TOP_OFF_PX = 60;
export const PED_BOTTOM_OFF_PX = 150;

function spawnPedestrian(w: World): void {
  const { profile: p, rng } = w;
  const jaywalking = rng() < p.jaywalkProbability;

  let x: number;
  if (jaywalking) {
    x = w.player.x + (rng() * 2 - 1) * SIM_MARGIN_PX;
  } else {
    // Only crossings inside the simulated window are usable.
    const usable = w.road.crossingsPx.filter(
      (c) => Math.abs(c - w.player.x) <= SIM_MARGIN_PX,
    );
    const pick = usable[Math.floor(rng() * usable.length)];
    if (pick === undefined) return; // no marked crossing nearby; nobody crosses
    x = pick;
  }
  if (x < 0 || x > w.road.lengthPx) return;

  const fromTop = rng() < 0.5;
  const rw = roadWidthPx(w.road);
  w.pedestrians.push({
    id: w.nextId++,
    x,
    y: fromTop ? -PED_TOP_OFF_PX : rw + PED_BOTTOM_OFF_PX,
    targetY: fromTop ? rw + PED_BOTTOM_OFF_PX : -PED_TOP_OFF_PX,
    jaywalking,
    hesitateUntil: -1,
    nextHesitateCheckAt: w.time + 0.5,
  });
  w.counters.pedestriansSpawned++;
  if (jaywalking) w.counters.jaywalks++;
}

/**
 * The kerb line this pedestrian waits at before crossing (the verge's outer edge on
 * the side they start from), and whether stepping `dy` would take them over it.
 */
function stepsOffKerb(w: World, ped: Pedestrian, dy: number): boolean {
  const rw = roadWidthPx(w.road);
  const down = ped.targetY > ped.y;
  const kerb = down ? -w.road.shoulderPx : rw + w.road.shoulderPx;
  return down ? ped.y <= kerb && ped.y + dy > kerb : ped.y >= kerb && ped.y + dy < kerb;
}

/** Is a vehicle bearing down on this pedestrian's crossing point? */
function vehicleImminent(w: World, ped: Pedestrian): boolean {
  for (const a of w.agents) {
    const d = aheadOf(a, ped.x);
    if (d < 0 || d > PED_KERB_LOOKAHEAD_PX) continue;
    if (a.speed < 12) continue; // stopped or crawling: safe to step out
    return true;
  }
  return false;
}

function updatePedestrians(w: World, dt: number): void {
  const p = w.profile;
  const rw = roadWidthPx(w.road);
  const kept: Pedestrian[] = [];

  for (const ped of w.pedestrians) {
    const onRoad = ped.y > 0 && ped.y < rw;

    // Freezing mid-road while traffic flows around is a Trivandrum signature
    // (pedestrianHesitation 0.35 vs Singapore 0.05).
    if (onRoad && w.time >= ped.nextHesitateCheckAt) {
      ped.nextHesitateCheckAt = w.time + 1;
      if (w.rng() < p.pedestrianHesitation) {
        ped.hesitateUntil = w.time + PED_HESITATE_SEC;
      }
    }

    // Stepping off the kerb in front of a moving vehicle. Even in Trivandrum people
    // look before stepping out — without this, pedestrians walk into the side of
    // cars already alongside them and no amount of driver braking can help.
    // They walk up to the kerb freely and only stop there to look.
    const dy = Math.sign(ped.targetY - ped.y) * p.pedestrianSpeedPx * dt;
    const blocked = stepsOffKerb(w, ped, dy) && vehicleImminent(w, ped);

    if (w.time >= ped.hesitateUntil && !blocked) {
      ped.y += dy;
    }

    const arrived = Math.abs(ped.y - ped.targetY) < 4;
    const inWindow = Math.abs(ped.x - w.player.x) < SIM_MARGIN_PX + DESPAWN_SLACK_PX;
    if (!arrived && inWindow) kept.push(ped);
  }
  w.pedestrians = kept;
}

/** Roadside stops: a vehicle halts IN the roadway. Singapore's rate is 0. */
function updateRoadsideStops(w: World): void {
  const p = w.profile;
  if (p.roadsideStopPerMin <= 0) return;
  for (const a of w.agents) {
    if (w.time < a.nextRoadsideCheckAt || w.time < a.roadsideStopUntil) continue;
    a.nextRoadsideCheckAt = w.time + 1;
    if (w.rng() < p.roadsideStopPerMin / 60) {
      a.roadsideStopUntil = w.time + p.roadsideStopDurationSec;
      w.counters.roadsideStops++;
    }
  }
}

/**
 * T11: swap the active profile in place. Existing vehicles RE-READ it — they are not
 * destroyed and respawned. C2 requires visible change in traffic that is already on
 * screen; respawning would reset the whole scene and pass the check meaninglessly.
 */
export function setProfile(w: World, profile: TrafficProfile): void {
  w.profile = profile;
  // Oncoming traffic cannot exist on a one-way road. With-flow traffic stays; any of it
  // in the far lane of a keep-left road pulls back in as soon as there is room.
  if (!profile.twoWay) w.agents = w.agents.filter((a) => a.dir > 0);
  for (const a of w.agents) {
    // Re-roll against the new profile, preserving nothing but identity and position.
    a.desiredSpeed = rollDesiredSpeed(profile, a.kind, w.rng);
    a.nextStraddleAt = w.time + nextStraddleDelay(profile, w.rng);
    if (profile.centerlineCrossPerMin <= 0) {
      a.straddleUntil = -1; // stop riding the line immediately
    }
    if (profile.roadsideStopPerMin <= 0) {
      a.roadsideStopUntil = -1; // and start moving again
    }
  }
}

export function stepWorld(w: World, input: InputState, dt: number): void {
  w.time += dt;
  updatePlayer(w.player, input, w.road, dt);

  w.spawnAccumulator += (w.profile.spawnRatePerMin / 60) * dt;
  while (w.spawnAccumulator >= 1) {
    w.spawnAccumulator -= 1;
    spawnOne(w);
  }

  w.pedAccumulator += (w.profile.pedestrianRatePerMin / 60) * dt;
  while (w.pedAccumulator >= 1) {
    w.pedAccumulator -= 1;
    spawnPedestrian(w);
  }

  updateRoadsideStops(w);
  updateLateral(w, dt);
  updatePedestrians(w, dt);
  followAndMove(w, dt);

  despawn(w);

  // T12: arriving is sticky — reaching the end once ends the run.
  if (w.player.x >= w.road.lengthPx - 1) w.arrived = true;
}

const OVERTAKE_CHECK_SEC = 0.3;
const LATERAL_EASE_PER_SEC = 3;
/** Straddling the centreline of a keep-left road needs this long clear of oncoming. */
const STRADDLE_ONCOMING_SEC = 4;
/** Required oncoming clearance is the pass's own length in time, times this. */
const PASS_SAFETY = 1.4;
/** Extra oncoming clearance on top of the time-based requirement, px. */
const PASS_MARGIN_PX = 120;
/** A pass that would take longer than this is not attempted. */
const PASS_MAX_SEC = 7;
/** Not worth pulling out to gain less than this, px/sec. */
const PASS_MIN_GAIN_PX = 20;
/** Out in the oncoming lane with less time than this to impact: get back in NOW. */
const ABORT_TTC_SEC = 2.5;
/** Stopped this close to oncoming traffic, a passing driver gives up and pulls in. */
const FACE_OFF_PX = 150;
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
      // On a keep-left road the neighbour lane is the oncoming one: only ride the line
      // when nothing is coming for a good few seconds.
      const facing =
        pick !== undefined && p.twoWay && !oncomingClear(w, a, pick, a.speed * STRADDLE_ONCOMING_SEC);
      if (pick !== undefined && !alongside && !facing) {
        a.straddleLane = pick;
        a.straddleUntil = w.time + STRADDLE_MIN_SEC + rng() * STRADDLE_VAR_SEC;
        w.counters.centerlineStraddles++;
      }
      a.nextStraddleAt = w.time + nextStraddleDelay(p, rng);
    }

    // ---- T8: overtaking and gap acceptance -------------------------------------
    if (p.twoWay) {
      passOnTwoWay(w, a);
    } else if (w.time >= a.nextOvertakeCheckAt) {
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
            if (g.ahead < need || g.behind < rearNeed + closingAllowance(p, a, g.follower)) continue;

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
    const halfW = spec.widthPx / 2;

    // Eased, not a constant-rate slide: full lateral speed across the lane, then a
    // gentle settle onto the new line. The constant-rate slide started and stopped
    // dead, which read as vehicles jumping sideways.
    const vy = clampAccel((want - a.y) * LATERAL_EASE_PER_SEC, p.lateralSpeedPx, p.lateralSpeedPx);
    let nextY = a.y + vy * dt;
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
 * Extra rear gap for a follower that is closing fast. Without it, a vehicle pulling
 * out from a standstill in front of one doing full speed leaves it no room to brake
 * (measured: a Singapore bike stopped 1px short of a car). Aggressive drivers
 * discount it, so Trivandrum cut-ins still force the odd hard brake.
 */
function closingAllowance(p: TrafficProfile, a: Agent, follower: Agent | null): number {
  if (!follower) return 0;
  const closing = Math.max(0, follower.speed - a.speed);
  return (closing * closing) / (2 * p.comfortableDecelPx) * (1 - p.cutInAggression);
}

/** Nearest vehicle ahead of `a` in `lane` that is driving TOWARD it, the player included. */
function oncomingIn(w: World, a: Agent, lane: number): { gap: number; speed: number } | null {
  const half = VEHICLE_SPECS[a.kind].lengthPx / 2;
  let best: { gap: number; speed: number } | null = null;
  for (const b of w.agents) {
    if (b === a || b.dir === a.dir || !occupies(w, b, lane)) continue;
    const d = aheadOf(a, b.x);
    if (d <= 0) continue;
    const gap = d - half - VEHICLE_SPECS[b.kind].lengthPx / 2;
    if (!best || gap < best.gap) best = { gap, speed: b.speed };
  }
  // The player always drives +x, so it is oncoming for -x traffic.
  if (a.dir < 0 && playerLane(w) === lane) {
    const d = aheadOf(a, w.player.x);
    const gap = d - half - VEHICLE_SPECS.car.lengthPx / 2;
    if (d > 0 && (!best || gap < best.gap)) best = { gap, speed: Math.max(0, w.player.speed) };
  }
  return best;
}

function oncomingClear(w: World, a: Agent, lane: number, needPx: number): boolean {
  const on = oncomingIn(w, a, lane);
  return !on || on.gap > needPx;
}

/** Clearance ahead of and behind `a` in `lane`, counting only traffic going its way. */
function sameWayGap(
  w: World,
  a: Agent,
  lane: number,
): { ahead: number; behind: number; follower: Agent | null } {
  const half = VEHICLE_SPECS[a.kind].lengthPx / 2;
  let ahead = Number.POSITIVE_INFINITY;
  let behind = Number.POSITIVE_INFINITY;
  let follower: Agent | null = null;
  const consider = (d: number, otherHalf: number, who: Agent | null) => {
    const gap = Math.abs(d) - half - otherHalf;
    if (d >= 0) ahead = Math.min(ahead, gap);
    else if (gap < behind) {
      behind = gap;
      follower = who;
    }
  };
  for (const b of w.agents) {
    if (b === a || b.dir !== a.dir || !occupies(w, b, lane)) continue;
    consider(aheadOf(a, b.x), VEHICLE_SPECS[b.kind].lengthPx / 2, b);
  }
  if (a.dir > 0 && playerLane(w) === lane) consider(aheadOf(a, w.player.x), VEHICLE_SPECS.car.lengthPx / 2, null);
  return { ahead, behind, follower };
}

/** Free road in `lane` beyond position x (along a's heading), up to the next vehicle going a's way. */
function roomAhead(w: World, a: Agent, lane: number, x: number): number {
  const from = aheadOf(a, x);
  let room = Number.POSITIVE_INFINITY;
  for (const b of w.agents) {
    if (b === a || b.dir !== a.dir || !occupies(w, b, lane)) continue;
    const d = aheadOf(a, b.x) - from;
    if (d > 1) room = Math.min(room, d - VEHICLE_SPECS[b.kind].lengthPx / 2);
  }
  if (a.dir > 0 && playerLane(w) === lane) {
    const d = aheadOf(a, w.player.x) - from;
    if (d > 1) room = Math.min(room, d - VEHICLE_SPECS.car.lengthPx / 2);
  }
  return room;
}

/**
 * Overtaking on a keep-left road: the only way past is through the oncoming lane.
 * Drivers pull out only when the whole pass fits before anything coming arrives, and
 * pull back in as soon as there is room — or at once, cutting in, if something is
 * closing fast. The cut-in on the way back is where the surprises come from.
 */
function passOnTwoWay(w: World, a: Agent): void {
  const p = w.profile;
  const rng = w.rng;
  const spec = VEHICLE_SPECS[a.kind];
  const home = homeLane(w.road, a.dir);
  const passLane = home + a.dir;
  if (passLane < 0 || passLane >= w.road.laneCount) return;

  if (a.targetLane !== home) {
    // Out in the oncoming lane. Checked every step: a closing vehicle cannot wait 0.3s.
    const on = oncomingIn(w, a, a.targetLane);
    const ttc = on ? on.gap / Math.max(a.speed + on.speed, 1) : Number.POSITIVE_INFINITY;
    // Stopped nose to nose with something is urgent too: nobody else can move first.
    const faceOff = on !== null && on.gap < FACE_OFF_PX && a.speed < 5;
    const urgent = ttc < ABORT_TTC_SEC || faceOff;
    if (!urgent && w.time < a.nextOvertakeCheckAt) return;
    a.nextOvertakeCheckAt = w.time + OVERTAKE_CHECK_SEC;

    const g = sameWayGap(w, a, home);
    const aheadNeed = urgent ? 0 : p.followingDistance.mean;
    const rearNeed = urgent
      ? 0
      : (rng() < p.cutInAggression ? p.minFollowingDistancePx : p.followingDistance.mean) +
        closingAllowance(p, a, g.follower);
    if (g.ahead < aheadNeed || g.behind < rearNeed) return;

    a.targetLane = home;
    w.counters.laneChanges++;
    if (urgent) w.counters.passesAborted++;
    if (Math.min(g.ahead, g.behind) < spec.lengthPx) w.counters.subLengthGapAccepts++;
    if (g.follower && g.behind < p.followingDistance.mean) {
      w.counters.cutIns++;
      if (rng() > p.yieldProbability) g.follower.ignoreLeaderUntil = w.time + 0.6;
    }
    return;
  }

  if (w.time < a.nextOvertakeCheckAt) return;
  a.nextOvertakeCheckAt = w.time + OVERTAKE_CHECK_SEC;
  if (a.lane !== home || w.time < a.straddleUntil) return;

  const lead = leaderOf(w, a);
  // Never pull out round something that is itself driving at us.
  if (!lead || lead.speed < 0) return;
  const leadGap = aheadOf(a, lead.x) - spec.lengthPx / 2 - lead.halfLength;
  const blocked = lead.speed < a.desiredSpeed * 0.92 && leadGap < p.followingDistance.mean * 3;
  if (!blocked || rng() >= p.overtakeUrgency * OVERTAKE_CHECK_SEC) return;

  // How far the pass carries us relative to the leader: close the gap, clear its
  // length and our own, and leave room to pull back in ahead of it.
  const gain = a.desiredSpeed - lead.speed;
  if (gain < PASS_MIN_GAIN_PX) return;
  const passPx = leadGap + lead.halfLength * 2 + spec.lengthPx + p.followingDistance.mean * 2;
  const passSec = passPx / gain;
  if (passSec > PASS_MAX_SEC) return;

  const g = sameWayGap(w, a, passLane);
  if (g.ahead < passPx || g.behind < p.followingDistance.mean) return;
  // Only pass what there is room to pull in ahead of. Passing one vehicle in a queue
  // leaves nowhere to go but further down the oncoming lane.
  if (roomAhead(w, a, home, lead.x) < spec.lengthPx + p.followingDistance.mean * 2) return;
  const on = oncomingIn(w, a, passLane);
  if (on && on.gap < (a.desiredSpeed + on.speed) * passSec * PASS_SAFETY + PASS_MARGIN_PX) return;

  a.targetLane = passLane;
  w.counters.laneChanges++;
  w.counters.passes++;
}

/** Oncoming high beams within this distance ahead see the player flash. */
export const FLASH_RANGE_PX = 2400;
/** Not everyone dips when flashed. */
export const DIP_PROBABILITY = 0.7;

/**
 * The player flashes their headlights. Each oncoming driver ahead with high beams on
 * dips them, or does not. Returns how many did each.
 */
export function flashHeadlights(w: World): { dipped: number; ignored: number } {
  let dipped = 0;
  let ignored = 0;
  for (const a of w.agents) {
    if (a.dir > 0 || !a.highBeam) continue;
    const d = a.x - w.player.x;
    if (d <= 0 || d > FLASH_RANGE_PX) continue;
    if (w.rng() < DIP_PROBABILITY) {
      a.highBeam = false;
      dipped++;
    } else {
      ignored++;
    }
  }
  return { dipped, ignored };
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
export function leaderOf(w: World, a: Agent): Obstacle | null {
  let best: Obstacle | null = null;
  // Nearest by the obstacle's NEAR END, not its centre. By centre, a pedestrian level
  // with the middle of a stopped bus hid the bus's rear bumper, and the vehicle behind
  // drove 25px into it.
  let bestD = Number.POSITIVE_INFINITY;
  for (const b of w.agents) {
    // A vehicle mid-change occupies both lanes, so it must be seen from both.
    if (b === a) continue;
    const d = aheadOf(a, b.x);
    const half = VEHICLE_SPECS[b.kind].lengthPx / 2;
    if (d <= 0 || d - half >= bestD) continue;
    if (!(occupies(w, b, a.lane) || occupies(w, b, a.targetLane))) continue;
    // Oncoming traffic closes rather than leads: its speed counts against ours.
    best = { x: b.x, speed: b.dir === a.dir ? b.speed : -b.speed, halfLength: half };
    bestD = d - half;
  }
  // The player occupies a lane too. Without this, traffic drives straight through
  // the player and HANDOFF A3 ("AI reacts to the player") is silently unmet.
  const pLane = playerLane(w);
  const pD = aheadOf(a, w.player.x);
  const pHalf = VEHICLE_SPECS.car.lengthPx / 2;
  if (pLane !== null && occupies(w, a, pLane) && pD > 0 && pD - pHalf < bestD) {
    best = { x: w.player.x, speed: w.player.speed * a.dir, halfLength: pHalf };
    bestD = pD - pHalf;
  }

  // Pedestrians standing on the carriageway. Without this they are pure decoration
  // and get driven through — and a jaywalker nobody brakes for is not a jaywalker,
  // which would leave C3's bullet 5 technically present but meaningless.
  // The band is wider than the vehicle body on purpose. Reacting only once a
  // pedestrian already overlaps leaves no distance to brake in, and they get run
  // over — measured at 30px of penetration. Drivers watch the kerb, not the bumper.
  const halfW = VEHICLE_SPECS[a.kind].widthPx / 2 + PED_LOOKOUT_PX;
  for (const ped of w.pedestrians) {
    const d = aheadOf(a, ped.x);
    if (d <= 0 || d - PED_RADIUS_PX >= bestD) continue;
    if (Math.abs(ped.y - a.y) > halfW + PED_RADIUS_PX) continue;
    best = { x: ped.x, speed: 0, halfLength: PED_RADIUS_PX };
    bestD = d - PED_RADIUS_PX;
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
      const gap = aheadOf(a, lead.x) - spec.lengthPx / 2 - lead.halfLength;
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
        aheadOf(a, next.x) - spec.lengthPx / 2 - next.halfLength - 1;
      if (step > clearance) {
        step = Math.max(0, clearance);
        a.speed = Math.min(a.speed, Math.max(0, next.speed));
      }
    }
    a.x += step * a.dir;
  }
}

/** Fraction of live agents of each kind. Used by tests and the T15 overlay. */
export function fleetCensus(w: World): Record<VehicleKind, number> {
  const out = { car: 0, auto: 0, bus: 0, bike: 0 };
  for (const a of w.agents) out[a.kind]++;
  const n = w.agents.length || 1;
  return { car: out.car / n, auto: out.auto / n, bus: out.bus / n, bike: out.bike / n };
}
