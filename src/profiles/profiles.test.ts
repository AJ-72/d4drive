import { describe, expect, it } from 'vitest';
import { SINGAPORE } from './singapore';
import { TRIVANDRUM } from './trivandrum';
import { VEHICLE_KINDS, type TrafficProfile } from './types';
import { validateProfile } from './validate';
import { rollDesiredSpeed } from '../sim/speed';
import { createRng } from '../sim/rng';

// PLAN.md T3 done-conditions, written as attacks rather than confirmations.

describe('T3 attack 1 — fleetMix must sum to 1.0', () => {
  it('rejects a broken mix, naming the profile and the field', () => {
    const broken: TrafficProfile = {
      ...TRIVANDRUM,
      fleetMix: { ...TRIVANDRUM.fleetMix, car: 0.44 },
    };
    expect(() => validateProfile(broken)).toThrow(/trivandrum.*fleetMix/s);
  });

  it('accepts both shipped profiles', () => {
    expect(() => validateProfile(TRIVANDRUM)).not.toThrow();
    expect(() => validateProfile(SINGAPORE)).not.toThrow();
  });
});

describe('T3 attack 2 — unit-interval fields', () => {
  it('rejects laneDiscipline out of range, naming the field', () => {
    const broken: TrafficProfile = { ...TRIVANDRUM, laneDiscipline: 1.4 };
    expect(() => validateProfile(broken)).toThrow(/laneDiscipline/);
  });
});

describe('T3 attack 5 — no vehicle spawns stationary', () => {
  it('10,000 Trivandrum rolls never produce a speed at or below zero', () => {
    const rng = createRng(1234);
    let min = Infinity;
    for (let i = 0; i < 10_000; i++) {
      for (const kind of VEHICLE_KINDS) {
        min = Math.min(min, rollDesiredSpeed(TRIVANDRUM, kind, rng));
      }
    }
    expect(min).toBeGreaterThan(0);
    // floor = 0.35 * 170 * slowest speedFactor (bus, 0.78)
    expect(min).toBeGreaterThanOrEqual(0.35 * 170 * 0.78 - 1e-9);
  });
});

describe('T3 attack 6 — kind factor applied after the clamp', () => {
  // PLAN.md's version of this attack ("Singapore bus max below Singapore car min")
  // is not a valid test and was replaced. Two reasons, both fatal:
  //   1. Singapore is mean 178 / stdDev 12, so the clamp bounds [62.3, 338.2] are
  //      never reached — the clamp never engages, and the ordering it is meant to
  //      probe is unobservable there.
  //   2. Bus (mean 138.8) and car (mean 178) sit ~2.9 sigma apart, so over 10,000
  //      samples their tails overlap no matter which order the code uses.
  // The ordering is only observable where the clamp actually bites: Trivandrum.

  it('Trivandrum bus floor is the clamped draw times 0.78, not the clamp itself', () => {
    const rng = createRng(99);
    let busMin = Infinity;
    for (let i = 0; i < 20_000; i++) {
      busMin = Math.min(busMin, rollDesiredSpeed(TRIVANDRUM, 'bus', rng));
    }
    // Correct order (clamp, then factor): 0.35 * 170 * 0.78 = 46.41
    // Wrong order (factor, then clamp): the low tail clamps back up to 59.5
    expect(busMin).toBeCloseTo(0.35 * 170 * 0.78, 6);
    expect(busMin).toBeLessThan(0.35 * 170 - 1);
  });

  it('the kind factor scales the mean by exactly its speedFactor', () => {
    const rng = createRng(7);
    let busSum = 0;
    let carSum = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      busSum += rollDesiredSpeed(SINGAPORE, 'bus', rng);
      carSum += rollDesiredSpeed(SINGAPORE, 'car', rng);
    }
    expect(busSum / n / (carSum / n)).toBeCloseTo(0.78, 2);
  });

  it('Singapore buses are slow enough to force the queueing C3 requires', () => {
    // PLAN.md T3: fleetMix.bus 0.16 is load-bearing. The bus must be slower than
    // a car by much more than the fleet's own spread, or nothing ever queues.
    const busMean = SINGAPORE.desiredSpeed.mean * 0.78;
    const carMean = SINGAPORE.desiredSpeed.mean;
    expect(carMean - busMean).toBeGreaterThan(SINGAPORE.desiredSpeed.stdDev * 3);
    expect(SINGAPORE.fleetMix.bus).toBeGreaterThan(0.1);
  });
});

describe('C3 guard — the two profiles must not differ mainly by pace or density', () => {
  it('mean speeds stay within 10% of each other', () => {
    const a = TRIVANDRUM.desiredSpeed.mean;
    const b = SINGAPORE.desiredSpeed.mean;
    expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThan(0.1);
  });

  it('Trivandrum is the quieter road, but not an empty one', () => {
    // Was "within 20%". The player asked (2026-09-24) for fewer, calmer vehicles in
    // Trivandrum, on a two-way road where half of them are oncoming.
    const a = TRIVANDRUM.spawnRatePerMin;
    const b = SINGAPORE.spawnRatePerMin;
    expect(a).toBeLessThan(b);
    expect(a).toBeGreaterThan(b * 0.4);
  });

  it('the difference lives in variance and gap acceptance instead', () => {
    // 2x, not 3x: the calmer 2026-09-24 tuning narrowed Trivandrum's spread.
    expect(TRIVANDRUM.desiredSpeed.stdDev).toBeGreaterThan(
      SINGAPORE.desiredSpeed.stdDev * 2,
    );
    expect(TRIVANDRUM.minAcceptedGapFactor).toBeLessThan(1.0);
    expect(SINGAPORE.minAcceptedGapFactor).toBeGreaterThan(2.0);
  });

  it('Singapore never crosses the centreline', () => {
    expect(SINGAPORE.centerlineCrossPerMin).toBe(0);
  });
});
