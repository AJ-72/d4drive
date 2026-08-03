import { describe, expect, it } from 'vitest';
import { laneAtY, laneBoundaryY, laneCenterY, SPIKE_ROAD } from './road';

// PLAN.md T2 done-conditions.

describe('T2 — lane geometry round-trips', () => {
  it('laneAtY inverts laneCenterY', () => {
    for (let lane = 0; lane < SPIKE_ROAD.laneCount; lane++) {
      expect(laneAtY(SPIKE_ROAD, laneCenterY(SPIKE_ROAD, lane))).toBeCloseTo(lane, 10);
    }
  });

  it('a boundary y gives a fractional .5 — this is what makes straddling detectable', () => {
    const y = laneBoundaryY(SPIKE_ROAD, 0);
    expect(laneAtY(SPIKE_ROAD, y) % 1).toBeCloseTo(0.5, 10);
  });
});
