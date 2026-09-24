import type { InputState } from '../input/input';
import { VEHICLE_SPECS } from '../profiles/types';
import { laneCenterY, roadWidthPx } from '../road/road';
import { homeLane, PED_RADIUS_PX, type Agent, type World } from '../sim/world';

// Game-layer rules that sit on top of the sim without changing it. DOM-free, so they
// run under vitest like the rest of src/sim.

const P = VEHICLE_SPECS.car;

export interface Bump {
  kind: 'vehicle' | 'pedestrian';
  agent?: Agent;
  /** Met an oncoming vehicle nose to nose. */
  headOn?: boolean;
}

/**
 * The sim keeps traffic out of the player, but nothing stops the player driving into
 * traffic. Resolve any overlap by pushing the player clear, and report what was hit
 * so the game can react. Airborne players pass over everything.
 */
export function resolvePlayerContacts(w: World, airborne: boolean): Bump[] {
  if (airborne) return [];
  const p = w.player;
  const hits: Bump[] = [];
  for (const a of w.agents) {
    const s = VEHICLE_SPECS[a.kind];
    const dx = a.x - p.x;
    const dy = a.y - p.y;
    const needX = (s.lengthPx + P.lengthPx) / 2;
    const needY = (s.widthPx + P.widthPx) / 2 - 1;
    if (Math.abs(dx) >= needX || Math.abs(dy) >= needY) continue;
    const penX = needX - Math.abs(dx);
    const penY = needY - Math.abs(dy);
    if (penY < penX) {
      // Mostly side by side: shove the player sideways, and scrub a little speed.
      p.y -= Math.sign(dy || 1) * (penY + 0.5);
      p.speed *= 0.97;
    } else if (dx > 0 && a.dir < 0) {
      // Head-on: both stop dead.
      p.x = a.x - needX - 0.5;
      p.speed = Math.min(p.speed, 0);
      a.speed = 0;
      hits.push({ kind: 'vehicle', agent: a, headOn: true });
      continue;
    } else if (dx > 0) {
      // Rear-ended someone: stop at their bumper and drop below their speed.
      p.x = a.x - needX - 0.5;
      p.speed = Math.min(p.speed, a.speed * 0.6);
    } else if (a.dir < 0) {
      // An oncoming vehicle already past us clipped the tail: no shove along the road.
      p.speed *= 0.8;
    } else {
      // Hit from behind: shunted forward.
      p.x = a.x + needX + 0.5;
      p.speed = Math.max(p.speed, a.speed * 0.8);
    }
    hits.push({ kind: 'vehicle', agent: a });
  }
  const rw = roadWidthPx(w.road);
  for (const ped of w.pedestrians) {
    if (ped.y < 0 || ped.y > rw) continue;
    if (Math.abs(ped.x - p.x) < P.lengthPx / 2 + PED_RADIUS_PX && Math.abs(ped.y - p.y) < P.widthPx / 2 + PED_RADIUS_PX) {
      // Nobody gets run over: an emergency stop instead.
      p.speed = Math.min(p.speed, 20);
      hits.push({ kind: 'pedestrian' });
    }
  }
  return hits;
}

export interface AutoInput extends InputState {
  jump: boolean;
}

/**
 * Drives the player for the attract mode and the autopilot setting: chase the next
 * fish, overtake slow traffic when the other lane is clear, brake for pedestrians.
 * `fishYpx` is the sim-space y of the fish to chase, if any; `fishHigh` asks for a jump.
 */
export function autopilot(w: World, fishYpx: number | null, fishDx: number, fishHigh: boolean): AutoInput {
  const p = w.player;
  const road = w.road;
  const lanes = Array.from({ length: road.laneCount }, (_, i) => laneCenterY(road, i));
  const nearestLane = (y: number) => lanes.reduce((b, l) => (Math.abs(l - y) < Math.abs(b - y) ? l : b), lanes[0]!);
  const twoWay = w.profile.twoWay;
  const keepLeft = laneCenterY(road, homeLane(road, 1));

  let wantSpeed = 250;
  /** Velocity along +x: oncoming traffic counts as negative. */
  const vel = (a: Agent) => a.speed * a.dir;
  // Nothing coming the other way in lane y for this many seconds of closing.
  const noOncoming = (y: number, sec: number) =>
    !w.agents.some(
      (a) => a.dir < 0 && Math.abs(a.y - y) < 40 && a.x > p.x - 60 && a.x - p.x < (p.speed + a.speed) * sec + 150,
    );
  // On a keep-left road only chase a fish in the oncoming lane when it is clear.
  let targetY = fishYpx ?? (twoWay ? keepLeft : nearestLane(p.y));
  if (twoWay && nearestLane(targetY) !== keepLeft && !noOncoming(nearestLane(targetY), 6)) targetY = keepLeft;

  const ahead = (y: number, range: number) => {
    let best: Agent | null = null;
    for (const a of w.agents) {
      const dx = a.x - p.x;
      if (dx <= 0 || dx > range || Math.abs(a.y - y) > 36) continue;
      if (!best || a.x < best.x) best = a;
    }
    return best;
  };
  const laneClear = (y: number) =>
    !w.agents.some((a) => Math.abs(a.y - y) < 40 && a.x > p.x - 90 && a.x < p.x + 220) &&
    (!twoWay || noOncoming(y, 6));

  const blocker = ahead(targetY, 240);
  if (blocker && vel(blocker) < wantSpeed) {
    const other = lanes.find((l) => l !== nearestLane(targetY) && laneClear(l));
    if (other !== undefined) targetY = other;
    else wantSpeed = Math.max(0, vel(blocker) - 10);
  }
  // Hold a gap to whoever is directly ahead: close it slowly, back off when tight.
  const current = ahead(p.y, 220);
  if (current) {
    const gap = current.x - p.x - (VEHICLE_SPECS[current.kind].lengthPx + P.lengthPx) / 2;
    wantSpeed = Math.min(wantSpeed, Math.max(0, vel(current) + (gap - 30) * 1.2));
  }
  // Out in the oncoming lane with something coming: get back in.
  if (twoWay && nearestLane(p.y) !== keepLeft && !noOncoming(nearestLane(p.y), 3)) targetY = keepLeft;

  const rw = roadWidthPx(road);
  for (const ped of w.pedestrians) {
    const dx = ped.x - p.x;
    if (dx > 0 && dx < 200 && ped.y > -10 && ped.y < rw + 10 && Math.abs(ped.y - p.y) < 60) wantSpeed = 0;
  }

  return {
    throttle: Math.max(-1, Math.min(1, (wantSpeed - p.speed) / 40)),
    steer: Math.max(-1, Math.min(1, (targetY - p.y) / 25)),
    jump: fishHigh && fishDx > 0 && fishDx < p.speed * 0.45 + 10,
  };
}

/** Six-speed box driven off road speed, so the rev counter and engine note make sense. */
const GEARS = [0, 20, 38, 58, 80, 112, 155];
const TOP_GEAR = GEARS.length - 1;
export function gearbox(kmh: number): { gear: number; rpm: number } {
  const v = Math.abs(kmh);
  let g = 1;
  while (g < TOP_GEAR && v >= GEARS[g]!) g++;
  const lo = GEARS[g - 1]!;
  const hi = GEARS[g]!;
  const frac = (v - lo) / (hi - lo);
  return { gear: g, rpm: 850 + frac * (g === 1 ? 5200 : 3400) + (g === 1 ? 0 : 1800) };
}
