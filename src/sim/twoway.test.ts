import { describe, expect, it } from 'vitest';
import { SINGAPORE } from '../profiles/singapore';
import { TRIVANDRUM } from '../profiles/trivandrum';
import { VEHICLE_SPECS } from '../profiles/types';
import { laneCenterY, SPIKE_ROAD } from '../road/road';
import { runHeadless } from './harness';
import { PLAYER_MAX_SPEED } from './player';
import { createWorld, flashHeadlights, homeLane, setProfile } from './world';

// The player's 2026-09-24 requests: Trivandrum as a two-lane, keep-left road with
// careful overtaking, oncoming high beams, and a faster car.

const DRIVING = { throttle: 1, steer: 0 };

describe('keep-left two-way road (Trivandrum)', () => {
  it('has oncoming traffic driving -x in the far lane; Singapore has none', () => {
    const tvm = runHeadless({ seconds: 60, profile: TRIVANDRUM, input: DRIVING });
    const sg = runHeadless({ seconds: 60, profile: SINGAPORE, input: DRIVING });
    expect(tvm.counters.oncomingSpawned).toBeGreaterThan(10);
    expect(sg.counters.oncomingSpawned).toBe(0);
    expect(sg.agents.every((a) => a.dir === 1)).toBe(true);
  });

  it('keeps left: traffic sits in its own lane almost all the time', () => {
    let own = 0;
    let total = 0;
    runHeadless({
      seconds: 90,
      profile: TRIVANDRUM,
      input: DRIVING,
      onStep: (w) => {
        for (const a of w.agents) {
          total++;
          if (a.targetLane === homeLane(w.road, a.dir)) own++;
        }
      },
    });
    expect(own / total).toBeGreaterThan(0.9);
  });

  it('overtakes through the oncoming lane, and gets back in', () => {
    const w = runHeadless({ seconds: 120, profile: TRIVANDRUM, input: DRIVING });
    expect(w.counters.passes).toBeGreaterThan(0);
    // Most passes finish normally; only a few are cut short by oncoming traffic.
    expect(w.counters.passesAborted).toBeLessThan(w.counters.passes);
  });

  it('never has two vehicles meet head-on', () => {
    let worst = 0;
    runHeadless({
      seconds: 150,
      profile: TRIVANDRUM,
      input: DRIVING,
      onStep: (w) => {
        const A = w.agents;
        for (let i = 0; i < A.length; i++) {
          for (let j = i + 1; j < A.length; j++) {
            const a = A[i]!;
            const b = A[j]!;
            if (a.dir === b.dir) continue;
            const sa = VEHICLE_SPECS[a.kind];
            const sb = VEHICLE_SPECS[b.kind];
            const dx = Math.abs(a.x - b.x) - (sa.lengthPx + sb.lengthPx) / 2;
            const dy = Math.abs(a.y - b.y) - (sa.widthPx + sb.widthPx) / 2;
            if (dx < 0 && dy < 0) worst = Math.max(worst, Math.min(-dx, -dy));
          }
        }
      },
    });
    expect(worst).toBe(0);
  });

  it('starts the player in the left lane on a keep-left road', () => {
    expect(createWorld(SPIKE_ROAD, TRIVANDRUM).player.y).toBe(laneCenterY(SPIKE_ROAD, 0));
    expect(createWorld(SPIKE_ROAD, SINGAPORE).player.y).toBe(laneCenterY(SPIKE_ROAD, 1));
  });

  it('drops oncoming traffic when switching to a one-way city', () => {
    const w = runHeadless({ seconds: 40, profile: TRIVANDRUM, input: DRIVING });
    expect(w.agents.some((a) => a.dir < 0)).toBe(true);
    setProfile(w, SINGAPORE);
    expect(w.agents.every((a) => a.dir > 0)).toBe(true);
  });
});

describe('high beams', () => {
  it('only oncoming drivers use them, and only in Trivandrum', () => {
    // 30 s: still mid-road. At the road's end nothing oncoming can spawn.
    const tvm = runHeadless({ seconds: 30, profile: TRIVANDRUM, input: DRIVING });
    const sg = runHeadless({ seconds: 30, profile: SINGAPORE, input: DRIVING });
    expect(tvm.agents.some((a) => a.highBeam)).toBe(true);
    expect(tvm.agents.filter((a) => a.highBeam).every((a) => a.dir < 0)).toBe(true);
    expect(sg.agents.some((a) => a.highBeam)).toBe(false);
  });

  it('flashing makes most drivers ahead dip them', () => {
    let dipped = 0;
    let ignored = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = runHeadless({ seconds: 30, profile: TRIVANDRUM, input: DRIVING, seed });
      const r = flashHeadlights(w);
      dipped += r.dipped;
      ignored += r.ignored;
      // Dipped means dipped: nobody ahead still has them on unless they ignored it.
      const ahead = w.agents.filter((a) => a.highBeam && a.x > w.player.x && a.dir < 0);
      expect(ahead.length).toBe(r.ignored);
    }
    expect(dipped).toBeGreaterThan(ignored);
  });
});

describe('player top speed', () => {
  it('is 150 km/h (10 px = 1 m)', () => {
    expect((PLAYER_MAX_SPEED / 10) * 3.6).toBeCloseTo(150, 0);
  });
});
