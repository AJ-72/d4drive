import { describe, expect, it } from 'vitest';
import { SINGAPORE } from '../profiles/singapore';
import { TRIVANDRUM } from '../profiles/trivandrum';
import { runHeadless } from './harness';

/**
 * C3's override clause: the two profiles must be distinguishable by BEHAVIOUR, and
 * "fails if the two observations are distinguishable only by speed or vehicle count".
 *
 * `profiles.test.ts` guards the AUTHORED numbers. That is not sufficient, and this
 * file exists because of a real escape: authored pedestrian rates are 26 vs 22 —
 * 15% apart, inside any sane band — while the simulation actually produced 29 vs 11,
 * because disciplined pedestrians could only cross at marked points and long stretches
 * of road had none. The authored guard passed the whole time the bug was live.
 *
 * These tests count what the simulation REALISES, which is what a tester sees.
 */

const DRIVING = { throttle: 1, steer: 0 };
const SECONDS = 120;

/** Neither value may exceed the other by more than this factor. */
const MAX_RATIO = 1.6;

function ratio(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return lo === 0 ? Number.POSITIVE_INFINITY : hi / lo;
}

describe('C3 guard — realised densities, not just authored rates', () => {
  it('pedestrian counts stay comparable between the two cities', () => {
    const tvm = runHeadless({ seconds: SECONDS, profile: TRIVANDRUM, input: DRIVING });
    const sg = runHeadless({ seconds: SECONDS, profile: SINGAPORE, input: DRIVING });

    expect(tvm.counters.pedestriansSpawned).toBeGreaterThan(15);
    expect(sg.counters.pedestriansSpawned).toBeGreaterThan(15);
    expect(
      ratio(tvm.counters.pedestriansSpawned, sg.counters.pedestriansSpawned),
    ).toBeLessThan(MAX_RATIO);
  });

  it('vehicle populations: Trivandrum quieter, never empty', () => {
    const sample = (profile: typeof TRIVANDRUM) => {
      const counts: number[] = [];
      runHeadless({
        seconds: SECONDS,
        profile,
        input: DRIVING,
        onStep: (w) => {
          // Skip the warm-up: population climbs from zero at t=0 in both cities.
          if (w.time > 30) counts.push(w.agents.length);
        },
      });
      return counts.reduce((a, b) => a + b, 0) / counts.length;
    };
    // Was "within MAX_RATIO". The player asked (2026-09-24) for fewer vehicles in
    // Trivandrum. Keep it the quieter road, but still a busy one.
    const tvm = sample(TRIVANDRUM);
    const sg = sample(SINGAPORE);
    expect(tvm).toBeLessThan(sg);
    expect(ratio(tvm, sg)).toBeLessThan(2.5);
  });

  it('mean vehicle speeds stay comparable — the difference must be behavioural', () => {
    const meanSpeed = (profile: typeof TRIVANDRUM) => {
      let sum = 0;
      let n = 0;
      runHeadless({
        seconds: SECONDS,
        profile,
        input: DRIVING,
        onStep: (w) => {
          if (w.time <= 30) return;
          for (const a of w.agents) {
            sum += a.speed;
            n++;
          }
        },
      });
      return sum / Math.max(n, 1);
    };
    // Tighter than MAX_RATIO: speed is the single most likely thing a tester
    // reaches for ("that one was faster"), and C3 counts that answer as a failure.
    expect(ratio(meanSpeed(TRIVANDRUM), meanSpeed(SINGAPORE))).toBeLessThan(1.35);
  });
});
