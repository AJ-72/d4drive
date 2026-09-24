import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../engine/loop';
import { SINGAPORE } from '../profiles/singapore';
import { TRIVANDRUM } from '../profiles/trivandrum';
import { VEHICLE_SPECS } from '../profiles/types';
import { COAST_ROAD, laneCenterY } from '../road/road';
import { createWorld, stepWorld } from '../sim/world';
import { autopilot, gearbox, resolvePlayerContacts } from './drive';

describe('resolvePlayerContacts', () => {
  it('stops a player who drives into the back of a vehicle, and reports the bump', () => {
    const w = createWorld(COAST_ROAD, SINGAPORE, 1);
    const y = laneCenterY(COAST_ROAD, 1);
    w.player.y = y;
    w.player.x = 5000;
    w.player.speed = 280;
    const a = { ...fakeAgent(), x: 5030, y, speed: 100 };
    w.agents.push(a);
    const hits = resolvePlayerContacts(w, false);
    expect(hits).toHaveLength(1);
    const need = (VEHICLE_SPECS.car.lengthPx + VEHICLE_SPECS[a.kind].lengthPx) / 2;
    expect(a.x - w.player.x).toBeGreaterThanOrEqual(need);
    expect(w.player.speed).toBeLessThanOrEqual(60);
  });

  it('lets an airborne player pass over traffic', () => {
    const w = createWorld(COAST_ROAD, SINGAPORE, 1);
    w.agents.push({ ...fakeAgent(), x: w.player.x + 5, y: w.player.y });
    expect(resolvePlayerContacts(w, true)).toHaveLength(0);
  });

  it('pushes a side-by-side overlap sideways rather than teleporting along the road', () => {
    const w = createWorld(COAST_ROAD, SINGAPORE, 1);
    const x0 = w.player.x;
    w.agents.push({ ...fakeAgent(), x: x0 + 2, y: w.player.y - 15 });
    resolvePlayerContacts(w, false);
    expect(w.player.x).toBe(x0);
    expect(resolvePlayerContacts(w, false)).toHaveLength(0);
  });
});

describe('autopilot', () => {
  it('drives the full 6 km coast road through Trivandrum traffic without getting stuck', () => {
    const w = createWorld(COAST_ROAD, TRIVANDRUM, 3);
    // Count bump EVENTS (the onset of a contact), not steps spent in contact.
    let bumps = 0;
    let touching = false;
    for (let t = 0; t < 1200 && !w.arrived; t += FIXED_DT) {
      const ap = autopilot(w, null, 0, false);
      stepWorld(w, ap, FIXED_DT);
      const now = resolvePlayerContacts(w, false).length > 0;
      if (now && !touching) bumps++;
      touching = now;
    }
    expect(w.arrived).toBe(true);
    // Trivandrum traffic cuts in on anyone, so some bumps are expected. Measured: 94.
    expect(bumps).toBeLessThan(150);
  });

  it('steers toward a fish in the other lane', () => {
    const w = createWorld(COAST_ROAD, SINGAPORE, 1);
    w.player.speed = 150;
    const other = laneCenterY(COAST_ROAD, 0);
    expect(Math.sign(autopilot(w, other, 300, false).steer)).toBe(Math.sign(other - w.player.y));
  });
});

describe('gearbox', () => {
  it('shifts up with speed and keeps revs in a sane band', () => {
    let lastGear = 1;
    for (let k = 0; k <= 105; k += 1) {
      const { gear, rpm } = gearbox(k);
      expect(gear).toBeGreaterThanOrEqual(lastGear);
      expect(rpm).toBeGreaterThanOrEqual(800);
      expect(rpm).toBeLessThanOrEqual(6200);
      lastGear = gear;
    }
    expect(lastGear).toBe(5);
  });
});

function fakeAgent() {
  return {
    id: 999,
    kind: 'car' as const,
    x: 0,
    y: 0,
    speed: 0,
    desiredSpeed: 0,
    lane: 1,
    targetLane: 1,
    driftPhase: 0,
    nextStraddleAt: Infinity,
    straddleUntil: -1,
    straddleLane: 1,
    nextOvertakeCheckAt: Infinity,
    ignoreLeaderUntil: -1,
    roadsideStopUntil: -1,
    nextRoadsideCheckAt: Infinity,
  };
}
