import {
  VEHICLE_KINDS,
  VEHICLE_SPECS,
  type TrafficProfile,
  type VehicleKind,
} from '../profiles/types';
import { laneCenterY, type Road } from '../road/road';
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
  lane: number;
}

export interface Counters {
  spawned: number;
  despawned: number;
  spawnsSkippedNoRoom: number;
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
    counters: { spawned: 0, despawned: 0, spawnsSkippedNoRoom: 0 },
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

  followAndMove(w, dt);

  despawn(w);
}

/** The vehicle a given agent is following, or null if the lane ahead is clear. */
export function leaderOf(w: World, a: Agent): { x: number; speed: number; kind: VehicleKind } | null {
  let best: { x: number; speed: number; kind: VehicleKind } | null = null;
  for (const b of w.agents) {
    if (b === a || b.lane !== a.lane || b.x <= a.x) continue;
    if (!best || b.x < best.x) best = { x: b.x, speed: b.speed, kind: b.kind };
  }
  // The player occupies a lane too. Without this, traffic drives straight through
  // the player and HANDOFF A3 ("AI reacts to the player") is silently unmet.
  const pLane = Math.round(w.player.y / w.road.laneWidthPx - 0.5);
  if (pLane === a.lane && w.player.x > a.x && (!best || w.player.x < best.x)) {
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

    const lead = leaderOf(w, a);
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
