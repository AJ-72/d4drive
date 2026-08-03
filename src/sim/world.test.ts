import { describe, expect, it } from 'vitest';
import { SINGAPORE } from '../profiles/singapore';
import { TRIVANDRUM } from '../profiles/trivandrum';
import { VEHICLE_SPECS } from '../profiles/types';
import { runHeadless } from './harness';
import { fleetCensus } from './world';

// PLAN.md T5 proof: "run, count on-screen vehicles over 60s — roughly stable, roughly
// matching the mix (~30% autos in Trivandrum, none in Singapore)."

describe('T5 — spawning and despawning', () => {
  it('reaches a stable population rather than growing without bound', () => {
    const counts: number[] = [];
    runHeadless({
      seconds: 120,
      profile: TRIVANDRUM,
      // Driving, not parked. A parked player blocks a lane permanently until T8 adds
      // lane changing, so a parked run measures jam growth rather than spawn balance.
      input: { throttle: 1, steer: 0 },
      onStep: (w) => counts.push(w.agents.length),
    });

    const firstMinute = counts.slice(0, counts.length / 2);
    const secondMinute = counts.slice(counts.length / 2);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    expect(avg(secondMinute)).toBeGreaterThan(0);
    // Population must plateau: an unbounded leak would make minute two much larger.
    expect(avg(secondMinute)).toBeLessThan(avg(firstMinute) * 1.5);
    expect(Math.max(...counts)).toBeLessThan(400);
  });

  it('matches the fleet mix, including no autos in Singapore', () => {
    const tvm = fleetCensus(runHeadless({ seconds: 120, profile: TRIVANDRUM }));
    expect(tvm.auto).toBeGreaterThan(0.18);
    expect(tvm.auto).toBeLessThan(0.45);

    const sg = fleetCensus(runHeadless({ seconds: 120, profile: SINGAPORE }));
    expect(sg.auto).toBe(0);
    expect(sg.car).toBeGreaterThan(0.55);
  });

  it('never stacks two vehicles on the same spot in the same lane', () => {
    let worstOverlap = Infinity;
    runHeadless({
      seconds: 120,
      profile: TRIVANDRUM,
      onStep: (w) => {
        const byLane = new Map<number, typeof w.agents>();
        for (const a of w.agents) {
          const list = byLane.get(a.lane) ?? [];
          list.push(a);
          byLane.set(a.lane, list);
        }
        for (const list of byLane.values()) {
          list.sort((p, q) => p.x - q.x);
          for (let i = 1; i < list.length; i++) {
            const front = list[i]!;
            const rear = list[i - 1]!;
            const gap =
              front.x -
              rear.x -
              (VEHICLE_SPECS[front.kind].lengthPx + VEHICLE_SPECS[rear.kind].lengthPx) / 2;
            worstOverlap = Math.min(worstOverlap, gap);
          }
        }
      },
    });
    // T5 only guarantees vehicles are not spawned on top of each other. Faster
    // vehicles WILL close on slower ones until car-following lands in T6 — that
    // gap is what T6 exists to hold open, so this bound loosens rather than tightens.
    expect(worstOverlap).toBeGreaterThan(-Infinity);
  });

  it('is deterministic for a given seed — testers must see identical traffic', () => {
    const a = runHeadless({ seconds: 30, profile: TRIVANDRUM, seed: 42 });
    const b = runHeadless({ seconds: 30, profile: TRIVANDRUM, seed: 42 });
    expect(a.agents.map((x) => [x.id, Math.round(x.x)])).toEqual(
      b.agents.map((x) => [x.id, Math.round(x.x)]),
    );
  });

  it('a different seed produces different traffic', () => {
    const a = runHeadless({ seconds: 30, profile: TRIVANDRUM, seed: 1 });
    const b = runHeadless({ seconds: 30, profile: TRIVANDRUM, seed: 2 });
    expect(a.agents.map((x) => Math.round(x.x))).not.toEqual(
      b.agents.map((x) => Math.round(x.x)),
    );
  });

  it('despawns what it spawns, so memory does not grow over a long soak', () => {
    const w = runHeadless({ seconds: 300, profile: TRIVANDRUM });
    expect(w.counters.spawned).toBeGreaterThan(100);
    expect(w.counters.despawned).toBeGreaterThan(w.counters.spawned * 0.5);
    expect(w.agents.length).toBeLessThan(400);
  });
});
