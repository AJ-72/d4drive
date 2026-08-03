import { FIXED_DT } from '../engine/loop';
import type { InputState } from '../input/input';
import type { TrafficProfile } from '../profiles/types';
import { SPIKE_ROAD, type Road } from '../road/road';
import { createWorld, stepWorld, type World } from './world';

// A headless driver for the simulation. This exists because requestAnimationFrame is
// paused whenever the browser pane is hidden, so the sim cannot be observed there
// automatically. Running it here is deterministic (seeded RNG), repeatable, and can
// cover far more simulated time than a human could sit and watch.

export const PARKED: InputState = { throttle: 0, steer: 0 };

export interface RunOptions {
  seconds: number;
  profile: TrafficProfile;
  road?: Road;
  seed?: number;
  input?: InputState;
  /** Called after every fixed step, for sampling. */
  onStep?: (w: World) => void;
}

export function runHeadless(opts: RunOptions): World {
  const w = createWorld(opts.road ?? SPIKE_ROAD, opts.profile, opts.seed);
  const steps = Math.round(opts.seconds / FIXED_DT);
  const input = opts.input ?? PARKED;
  for (let i = 0; i < steps; i++) {
    stepWorld(w, input, FIXED_DT);
    opts.onStep?.(w);
  }
  return w;
}
