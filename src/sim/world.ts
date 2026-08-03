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

/** Bumper-to-bumper clearance between two vehicles at the same x. */
function longitudinalGap(a: Agent, bx: number, bKind: VehicleKind): number {
  return Math.abs(a.x - bx) - (VEHICLE_SPECS[a.kind].lengthPx + VEHICLE_SPECS[bKind].lengthPx) / 2;
}

function hasRoomAt(w: World, x: number, lane: number, kind: VehicleKind): boolean {
  for (const a of w.agents) {
    if (a.lane !== lane) continue;
    if (longitudinalGap(a, x, kind) < 12) return false;
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

  // T5: agents hold their rolled speed. Car-following arrives in T6.
  for (const a of w.agents) {
    a.x += a.speed * dt;
  }

  despawn(w);
}

/** Fraction of live agents of each kind. Used by tests and the T15 overlay. */
export function fleetCensus(w: World): Record<VehicleKind, number> {
  const out = { car: 0, auto: 0, bus: 0, bike: 0 };
  for (const a of w.agents) out[a.kind]++;
  const n = w.agents.length || 1;
  return { car: out.car / n, auto: out.auto / n, bus: out.bus / n, bike: out.bike / n };
}
