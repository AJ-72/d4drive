import { describe, expect, it } from 'vitest';
import { SINGAPORE } from '../profiles/singapore';
import { TRIVANDRUM } from '../profiles/trivandrum';
import { VEHICLE_SPECS } from '../profiles/types';
import { runHeadless } from './harness';
import type { World } from './world';

// PLAN.md T6 proof: "no vehicle ever overlaps another. In Singapore, gaps stay visibly
// uniform; in Trivandrum they collapse and stretch."

/** Smallest bumper-to-bumper gap between same-lane neighbours, over a whole run. */
const DRIVING = { throttle: 1, steer: 0 };

// Gap assertions run with the player DRIVING, not parked. A parked player blocks a
// lane outright, and until T8 adds lane changing there is no way past it, so a parked
// run measures a permanent jam rather than car-following. The parked case is tracked
// as an open structural question (no roadside exists on the road model).
function minGapOverRun(profile: typeof TRIVANDRUM, seconds: number): number {
  let worst = Infinity;
  runHeadless({
    seconds,
    profile,
    input: DRIVING,
    onStep: (w: World) => {
      const lanes = new Map<number, typeof w.agents>();
      for (const a of w.agents) {
        const list = lanes.get(a.lane) ?? [];
        list.push(a);
        lanes.set(a.lane, list);
      }
      for (const list of lanes.values()) {
        list.sort((p, q) => p.x - q.x);
        for (let i = 1; i < list.length; i++) {
          const f = list[i]!;
          const r = list[i - 1]!;
          // Mid-change a vehicle still carries its old lane number while already
          // beside the one it is pulling out round. Side by side is not "through".
          const dy = Math.abs(f.y - r.y) - (VEHICLE_SPECS[f.kind].widthPx + VEHICLE_SPECS[r.kind].widthPx) / 2;
          if (dy >= 0) continue;
          worst = Math.min(
            worst,
            f.x - r.x - (VEHICLE_SPECS[f.kind].lengthPx + VEHICLE_SPECS[r.kind].lengthPx) / 2,
          );
        }
      }
    },
  });
  return worst;
}

/**
 * Coefficient of variation of same-lane gaps, sampled across the WHOLE run.
 * A single end-of-run snapshot holds only a handful of same-lane pairs, and its
 * coefficient of variation is dominated by which vehicles happen to be alive.
 */
function gapSpread(profile: typeof TRIVANDRUM, seconds: number): number {
  const gaps: number[] = [];
  runHeadless({
    seconds,
    profile,
    input: DRIVING,
    onStep: (w) => {
      // Sample once a second rather than every step: consecutive frames are almost
      // identical and would weight long-lived pairs enormously.
      if (Math.round(w.time * 60) % 60 !== 0) return;
      const lanes = new Map<number, typeof w.agents>();
      for (const a of w.agents) {
        const list = lanes.get(a.lane) ?? [];
        list.push(a);
        lanes.set(a.lane, list);
      }
      for (const list of lanes.values()) {
        list.sort((p, q) => p.x - q.x);
        for (let i = 1; i < list.length; i++) {
          const f = list[i]!;
          const r = list[i - 1]!;
          gaps.push(
            f.x - r.x - (VEHICLE_SPECS[f.kind].lengthPx + VEHICLE_SPECS[r.kind].lengthPx) / 2,
          );
        }
      }
    },
  });
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const varc = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
  return Math.sqrt(varc) / mean;
}

describe('T6 — car following', () => {
  it('no vehicle ever passes through the one ahead, in either profile', () => {
    expect(minGapOverRun(TRIVANDRUM, 180)).toBeGreaterThan(-1);
    expect(minGapOverRun(SINGAPORE, 180)).toBeGreaterThan(-1);
  });

  it('Singapore holds a much larger minimum gap than Trivandrum', () => {
    const tvm = minGapOverRun(TRIVANDRUM, 180);
    const sg = minGapOverRun(SINGAPORE, 180);
    expect(sg).toBeGreaterThan(tvm);
    // The authored floors are 6px vs 34px. This is a behavioural difference visible
    // in a frozen frame, which TEST_PROTOCOL D-2 depends on.
    expect(sg).toBeGreaterThan(20);
  });

  it('Singapore gaps are uniform; Trivandrum gaps collapse and stretch', () => {
    expect(gapSpread(SINGAPORE, 180)).toBeLessThan(gapSpread(TRIVANDRUM, 180));
  });

  it('no vehicle ends up travelling backwards', () => {
    let minSpeed = Infinity;
    runHeadless({
      seconds: 180,
      profile: TRIVANDRUM,
      onStep: (w) => {
        for (const a of w.agents) minSpeed = Math.min(minSpeed, a.speed);
      },
    });
    expect(minSpeed).toBeGreaterThanOrEqual(0);
  });

  it('traffic reacts to the player rather than driving through them (A3)', () => {
    // Deliberately parked: this asserts only that nobody overlaps the player, which
    // must hold even in the jam that a parked player currently creates.
    const w = runHeadless({ seconds: 90, profile: SINGAPORE });
    const pLane = Math.round(w.player.y / w.road.laneWidthPx - 0.5);
    const behindPlayer = w.agents.filter((a) => a.lane === pLane && a.x < w.player.x);
    for (const a of behindPlayer) {
      const clearance = w.player.x - a.x - (VEHICLE_SPECS[a.kind].lengthPx + 46) / 2;
      expect(clearance).toBeGreaterThan(-1);
    }
  });
});
