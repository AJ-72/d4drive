import type { InputState } from '../input/input';
import { VEHICLE_SPECS } from '../profiles/types';
import { laneCenterY, roadWidthPx, type Road } from '../road/road';
import { clamp } from './rng';

export interface Player {
  x: number;
  y: number;
  /** px/sec along the road. */
  speed: number;
}

const SPEC = VEHICLE_SPECS.car;

export const PLAYER_MAX_SPEED = 420; // px/sec
const ACCEL = 300; // px/sec^2
const BRAKE = 520; // px/sec^2
const DRAG = 70; // px/sec^2, applied when coasting
const STEER_PX_PER_SEC = 240; // lateral speed at full steer

// Far enough along the road that the traffic spawn window (SIM_MARGIN_PX) has road
// behind the player to spawn into. Starting at x=0 would put the rear spawn edge at
// negative x, and no traffic would ever approach from behind.
export const PLAYER_START_X = 1700;

export function createPlayer(road: Road): Player {
  return { x: PLAYER_START_X, y: laneCenterY(road, road.laneCount - 1), speed: 0 };
}

export function updatePlayer(p: Player, input: InputState, road: Road, dt: number): void {
  if (input.throttle > 0) {
    p.speed += ACCEL * input.throttle * dt;
  } else if (input.throttle < 0) {
    p.speed += BRAKE * input.throttle * dt;
  } else {
    // Coast toward zero without crossing it and reversing.
    const drop = DRAG * dt;
    p.speed = p.speed > 0 ? Math.max(0, p.speed - drop) : Math.min(0, p.speed + drop);
  }
  p.speed = clamp(p.speed, -PLAYER_MAX_SPEED * 0.25, PLAYER_MAX_SPEED);

  // Steering authority scales with speed: a stationary car cannot crab sideways.
  const authority = clamp(Math.abs(p.speed) / (PLAYER_MAX_SPEED * 0.35), 0, 1);
  p.y += input.steer * STEER_PX_PER_SEC * authority * dt;

  const halfW = SPEC.widthPx / 2;
  p.y = clamp(p.y, halfW, roadWidthPx(road) - halfW);
  p.x = clamp(p.x + p.speed * dt, 0, road.lengthPx);
}
