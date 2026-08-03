import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../engine/loop';
import { SINGAPORE } from '../profiles/singapore';
import { TRIVANDRUM } from '../profiles/trivandrum';
import { roadWidthPx, SPIKE_ROAD } from '../road/road';
import { runHeadless } from './harness';
import { createWorld, setProfile, stepWorld } from './world';

const DRIVING = { throttle: 1, steer: 0 };

describe('T10 — pedestrians', () => {
  it('both cities produce pedestrians', () => {
    const tvm = runHeadless({ seconds: 120, profile: TRIVANDRUM, input: DRIVING });
    const sg = runHeadless({ seconds: 120, profile: SINGAPORE, input: DRIVING });
    expect(tvm.counters.pedestriansSpawned).toBeGreaterThan(10);
    expect(sg.counters.pedestriansSpawned).toBeGreaterThan(10);
  });

  it('Trivandrum jaywalks constantly; Singapore almost never does', () => {
    const tvm = runHeadless({ seconds: 120, profile: TRIVANDRUM, input: DRIVING });
    const sg = runHeadless({ seconds: 120, profile: SINGAPORE, input: DRIVING });

    // Authored: jaywalkProbability 0.85 vs 0.02.
    const tvmRate = tvm.counters.jaywalks / tvm.counters.pedestriansSpawned;
    expect(tvmRate).toBeGreaterThan(0.6);
    expect(sg.counters.jaywalks / Math.max(sg.counters.pedestriansSpawned, 1)).toBeLessThan(0.15);
  });

  it('Singapore pedestrians cross only at marked crossings', () => {
    const w = runHeadless({ seconds: 150, profile: SINGAPORE, input: DRIVING });
    for (const ped of w.pedestrians) {
      if (ped.jaywalking) continue;
      const nearest = Math.min(...SPIKE_ROAD.crossingsPx.map((c) => Math.abs(c - ped.x)));
      expect(nearest).toBeLessThan(1);
    }
  });

  it('vehicles brake for pedestrians rather than driving through them', () => {
    // A pedestrian nobody brakes for is not a pedestrian — C3 bullet 5 would be
    // present in the counters and invisible on screen.
    let worstPenetration = 0;
    runHeadless({
      seconds: 150,
      profile: TRIVANDRUM,
      input: DRIVING,
      onStep: (w) => {
        const rw = roadWidthPx(w.road);
        for (const ped of w.pedestrians) {
          if (ped.y <= 0 || ped.y >= rw) continue;
          for (const a of w.agents) {
            const dx = Math.abs(a.x - ped.x) - 46 / 2 - 7;
            const dy = Math.abs(a.y - ped.y) - 22 / 2 - 7;
            if (dx < 0 && dy < 0) worstPenetration = Math.max(worstPenetration, -dx);
          }
        }
      },
    });
    expect(worstPenetration).toBeLessThan(20);
  });
});

describe('T10 — roadside stops (C3 bullet 4)', () => {
  it('Trivandrum vehicles stop in the roadway; Singapore never do', () => {
    const tvm = runHeadless({ seconds: 150, profile: TRIVANDRUM, input: DRIVING });
    const sg = runHeadless({ seconds: 150, profile: SINGAPORE, input: DRIVING });
    expect(tvm.counters.roadsideStops).toBeGreaterThan(0);
    expect(sg.counters.roadsideStops).toBe(0); // roadsideStopPerMin is 0.0
  });
});

describe('T11 — profile hot-swap (C2)', () => {
  it('existing traffic changes behaviour, and is not respawned', () => {
    const w = createWorld(SPIKE_ROAD, TRIVANDRUM);
    for (let i = 0; i < Math.round(60 / FIXED_DT); i++) {
      stepWorld(w, DRIVING, FIXED_DT);
    }
    const idsBefore = new Set(w.agents.map((a) => a.id));
    const spawnedBefore = w.counters.spawned;
    expect(idsBefore.size).toBeGreaterThan(3);

    setProfile(w, SINGAPORE);

    // C2: the vehicles on screen must change, not be replaced. Respawning would
    // reset the scene and pass the check while proving nothing.
    const survivors = w.agents.filter((a) => idsBefore.has(a.id)).length;
    expect(survivors).toBe(w.agents.length);
    expect(w.counters.spawned).toBe(spawnedBefore);
  });

  it('straddling stops immediately on switching to Singapore', () => {
    const w = createWorld(SPIKE_ROAD, TRIVANDRUM);
    for (let i = 0; i < Math.round(60 / FIXED_DT); i++) stepWorld(w, DRIVING, FIXED_DT);
    expect(w.counters.centerlineStraddles).toBeGreaterThan(0);

    setProfile(w, SINGAPORE);
    const before = w.counters.centerlineStraddles;
    for (let i = 0; i < Math.round(30 / FIXED_DT); i++) stepWorld(w, DRIVING, FIXED_DT);

    expect(w.counters.centerlineStraddles).toBe(before);
    expect(w.agents.every((a) => a.straddleUntil <= w.time)).toBe(true);
  });

  it('survives rapid repeated toggling (C2 asks for 10 in quick succession)', () => {
    const w = createWorld(SPIKE_ROAD, TRIVANDRUM);
    for (let i = 0; i < Math.round(30 / FIXED_DT); i++) stepWorld(w, DRIVING, FIXED_DT);
    for (let n = 0; n < 12; n++) {
      setProfile(w, n % 2 === 0 ? SINGAPORE : TRIVANDRUM);
      for (let i = 0; i < 6; i++) stepWorld(w, DRIVING, FIXED_DT);
    }
    expect(w.agents.length).toBeGreaterThan(0);
    expect(w.agents.every((a) => Number.isFinite(a.x) && Number.isFinite(a.y))).toBe(true);
    expect(w.agents.every((a) => a.speed >= 0)).toBe(true);
  });
});

describe('T12 — arrived state (C1)', () => {
  it('driving the length of the road sets arrived', () => {
    const w = createWorld(SPIKE_ROAD, TRIVANDRUM);
    const steps = Math.round(120 / FIXED_DT);
    for (let i = 0; i < steps && !w.arrived; i++) stepWorld(w, DRIVING, FIXED_DT);
    expect(w.arrived).toBe(true);
    expect(w.player.x).toBeGreaterThanOrEqual(SPIKE_ROAD.lengthPx - 1);
  });

  it('is not set part way along', () => {
    const w = createWorld(SPIKE_ROAD, TRIVANDRUM);
    for (let i = 0; i < Math.round(10 / FIXED_DT); i++) stepWorld(w, DRIVING, FIXED_DT);
    expect(w.player.x).toBeLessThan(SPIKE_ROAD.lengthPx);
    expect(w.arrived).toBe(false);
  });
});
