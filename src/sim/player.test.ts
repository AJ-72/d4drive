import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../engine/loop';
import { SPIKE_ROAD } from '../road/road';
import { createPlayer, updatePlayer, PLAYER_MAX_SPEED } from './player';
import type { InputState } from '../input/input';

const IDLE: InputState = { throttle: 0, steer: 0 };
const GAS: InputState = { throttle: 1, steer: 0 };
const BRAKE: InputState = { throttle: -1, steer: 0 };
const LEFT: InputState = { throttle: 1, steer: -1 };

function run(input: InputState, seconds: number, p = createPlayer(SPIKE_ROAD)) {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) updatePlayer(p, input, SPIKE_ROAD, FIXED_DT);
  return p;
}

describe('T4 — player vehicle', () => {
  it('accelerates and travels forward under throttle', () => {
    const p = run(GAS, 1);
    expect(p.speed).toBeGreaterThan(0);
    expect(p.x).toBeGreaterThan(80);
  });

  it('coasts to a stop without reversing through zero', () => {
    const moving = run(GAS, 2);
    const coasted = run(IDLE, 30, moving);
    expect(coasted.speed).toBe(0);
  });

  it('cannot crab sideways while stationary', () => {
    const p = createPlayer(SPIKE_ROAD);
    const y0 = p.y;
    run({ throttle: 0, steer: -1 }, 1, p);
    expect(p.y).toBe(y0);
  });

  it('steers once moving', () => {
    const p = run(GAS, 1.5);
    const y0 = p.y;
    run(LEFT, 0.8, p);
    expect(p.y).toBeLessThan(y0);
  });

  it('never leaves the road surface, however hard it is steered', () => {
    const p = run(GAS, 3);
    run({ throttle: 1, steer: -1 }, 20, p);
    expect(p.y).toBeGreaterThanOrEqual(0);
    run({ throttle: 1, steer: 1 }, 40, p);
    expect(p.y).toBeLessThanOrEqual(SPIKE_ROAD.laneCount * SPIKE_ROAD.laneWidthPx);
  });

  it('is speed-limited in both directions', () => {
    const fwd = run(GAS, 60);
    expect(fwd.speed).toBeLessThanOrEqual(PLAYER_MAX_SPEED);
    const rev = run(BRAKE, 60);
    expect(rev.speed).toBeGreaterThanOrEqual(-PLAYER_MAX_SPEED * 0.25);
  });

  it('stops at the end of the road rather than driving past it', () => {
    const p = run(GAS, 400);
    expect(p.x).toBeLessThanOrEqual(SPIKE_ROAD.lengthPx);
  });
});
