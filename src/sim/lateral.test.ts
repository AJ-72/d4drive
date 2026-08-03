import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../engine/loop';
import { SINGAPORE } from '../profiles/singapore';
import { TRIVANDRUM } from '../profiles/trivandrum';
import { VEHICLE_SPECS, type TrafficProfile } from '../profiles/types';
import { laneCenterY, SPIKE_ROAD } from '../road/road';
import { runHeadless } from './harness';
import { createWorld, playerLane, stepWorld, type World } from './world';

const DRIVING = { throttle: 1, steer: 0 };

/** Worst true 2D body overlap across a run, in px. Zero means nothing ever touched. */
function worstOverlap(profile: TrafficProfile, seconds: number, input = DRIVING): number {
  let worst = 0;
  runHeadless({
    seconds,
    profile,
    input,
    onStep: (w) => {
      const A = w.agents;
      for (let i = 0; i < A.length; i++) {
        for (let j = i + 1; j < A.length; j++) {
          const a = A[i]!;
          const b = A[j]!;
          const dx =
            Math.abs(a.x - b.x) -
            (VEHICLE_SPECS[a.kind].lengthPx + VEHICLE_SPECS[b.kind].lengthPx) / 2;
          if (dx >= 0) continue;
          const dy =
            Math.abs(a.y - b.y) -
            (VEHICLE_SPECS[a.kind].widthPx + VEHICLE_SPECS[b.kind].widthPx) / 2;
          if (dy < 0) worst = Math.max(worst, Math.min(-dx, -dy));
        }
      }
    },
  });
  return worst;
}

/** Mean |y - lane centre| across the run: how far off-centre this fleet drives. */
function meanLaneDeviation(profile: TrafficProfile, seconds: number): number {
  let sum = 0;
  let n = 0;
  runHeadless({
    seconds,
    profile,
    input: DRIVING,
    onStep: (w) => {
      for (const a of w.agents) {
        sum += Math.abs(a.y - laneCenterY(w.road, a.lane));
        n++;
      }
    },
  });
  return sum / Math.max(n, 1);
}

describe('T7 — lane discipline', () => {
  it('Singapore never straddles the centreline; C3 requires exactly zero', () => {
    const w = runHeadless({ seconds: 90, profile: SINGAPORE, input: DRIVING });
    expect(w.counters.centerlineStraddles).toBe(0);
  });

  it('Trivandrum straddles repeatedly', () => {
    const w = runHeadless({ seconds: 90, profile: TRIVANDRUM, input: DRIVING });
    expect(w.counters.centerlineStraddles).toBeGreaterThan(10);
  });

  it('Trivandrum drives visibly further off-centre than Singapore', () => {
    const tvm = meanLaneDeviation(TRIVANDRUM, 90);
    const sg = meanLaneDeviation(SINGAPORE, 90);
    // The authored drift amplitudes are 16px vs 2px. This is a frozen-frame signal,
    // which TEST_PROTOCOL D-2 depends on — it must be visible without motion.
    expect(tvm).toBeGreaterThan(sg * 3);
    expect(sg).toBeLessThan(6);
  });
});

describe('T8 — overtaking and gap acceptance', () => {
  it('Trivandrum takes gaps shorter than the vehicle itself; Singapore never does', () => {
    const tvm = runHeadless({ seconds: 90, profile: TRIVANDRUM, input: DRIVING });
    const sg = runHeadless({ seconds: 90, profile: SINGAPORE, input: DRIVING });
    // Only reachable when minAcceptedGapFactor < 1.0 — Trivandrum 0.85, Singapore 2.2.
    expect(tvm.counters.subLengthGapAccepts).toBeGreaterThan(0);
    expect(sg.counters.subLengthGapAccepts).toBe(0);
  });

  it('Trivandrum cuts in; Singapore essentially does not', () => {
    const tvm = runHeadless({ seconds: 120, profile: TRIVANDRUM, input: DRIVING });
    const sg = runHeadless({ seconds: 120, profile: SINGAPORE, input: DRIVING });
    expect(tvm.counters.cutIns).toBeGreaterThan(0);
    expect(sg.counters.cutIns).toBeLessThan(tvm.counters.cutIns / 4);
  });

  it('Singapore queues behind slow vehicles rather than forcing past', () => {
    const sg = runHeadless({ seconds: 120, profile: SINGAPORE, input: DRIVING });
    const tvm = runHeadless({ seconds: 120, profile: TRIVANDRUM, input: DRIVING });
    expect(sg.counters.laneChanges).toBeLessThan(tvm.counters.laneChanges / 3);
  });
});

describe('collision integrity', () => {
  it('Singapore vehicles never touch at all', () => {
    expect(worstOverlap(SINGAPORE, 120)).toBe(0);
  });

  it('Trivandrum vehicles graze at worst, never merge into one another', () => {
    // Nonzero is acceptable here and arguably wanted — the jostle is the point —
    // but it must stay far below a vehicle width (22px for a car).
    expect(worstOverlap(TRIVANDRUM, 120)).toBeLessThan(8);
  });
});

describe('C3 protocol — the roadside must actually work', () => {
  function pullOver(profile: TrafficProfile): World {
    const w = createWorld(SPIKE_ROAD, profile);
    const phases = [
      { secs: 6, throttle: 1, steer: 1 },
      { secs: 4, throttle: -1, steer: 1 },
      { secs: 120, throttle: 0, steer: 0 },
    ];
    for (const ph of phases) {
      for (let i = 0; i < Math.round(ph.secs / FIXED_DT); i++) {
        stepWorld(w, { throttle: ph.throttle, steer: ph.steer }, FIXED_DT);
      }
    }
    return w;
  }

  it('a player on the verge occupies no lane, in either city', () => {
    expect(playerLane(pullOver(TRIVANDRUM))).toBeNull();
    expect(playerLane(pullOver(SINGAPORE))).toBeNull();
  });

  it('and therefore causes no jam — C3 observes traffic, not its own blockage', () => {
    for (const profile of [TRIVANDRUM, SINGAPORE]) {
      const w = pullOver(profile);
      const stopped = w.agents.filter((a) => a.speed < 5).length;
      expect(stopped).toBe(0);
    }
  });

  it('stopping IN a lane still jams, which is why the verge exists', () => {
    const w = runHeadless({ seconds: 120, profile: TRIVANDRUM });
    expect(playerLane(w)).not.toBeNull();
    expect(w.agents.filter((a) => a.speed < 5).length).toBeGreaterThan(0);
  });
});
