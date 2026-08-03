import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXED_DT, startLoop } from './loop';

// The browser cannot verify this: when the Browser pane is hidden, rAF is paused
// entirely (0 frames/sec) and the loop never steps. Driving the clock by hand is
// both possible here and stricter — it can test the backgrounded-tab case directly,
// which is exactly what C4 depends on.

let pending: FrameRequestCallback | null = null;
let clock = 0;

function installFakeFrames() {
  clock = 0;
  pending = null;
  vi.spyOn(performance, 'now').mockImplementation(() => clock * 1000);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
}

/** Advance the wall clock by `seconds` and deliver exactly one frame. */
function advance(seconds: number) {
  clock += seconds;
  const cb = pending;
  pending = null;
  cb?.(clock * 1000);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('T1 — fixed timestep', () => {
  it('steps a whole number of FIXED_DT slices and never a variable dt', () => {
    installFakeFrames();
    const dts: number[] = [];
    startLoop((dt) => dts.push(dt), () => {});

    // Deliberately under the 0.25s clamp, which the backgrounded-tab test covers.
    advance(0.2);

    expect(dts.length).toBe(Math.floor(0.2 / FIXED_DT));
    expect(new Set(dts)).toEqual(new Set([FIXED_DT]));
  });

  it('renders once per frame regardless of how many steps ran', () => {
    installFakeFrames();
    let renders = 0;
    startLoop(() => {}, () => renders++);

    advance(0.5);
    expect(renders).toBe(1);
  });

  it('CLAMPS a backgrounded tab to 0.25s — C4 fails without this', () => {
    installFakeFrames();
    let steps = 0;
    startLoop(() => steps++, () => {});

    // A tab backgrounded for 60 seconds. Unclamped this would run 3,600 steps in
    // one frame and the simulation would explode.
    advance(60);

    expect(steps).toBe(Math.floor(0.25 / FIXED_DT));
    expect(steps).toBeLessThan(20);
  });

  it('stop() halts stepping', () => {
    installFakeFrames();
    let steps = 0;
    const stop = startLoop(() => steps++, () => {});

    advance(0.2);
    const before = steps;
    stop();
    advance(0.2);

    expect(steps).toBe(before);
  });

  it('accumulator carries remainder across frames rather than dropping it', () => {
    installFakeFrames();
    let steps = 0;
    startLoop(() => steps++, () => {});

    // Ten frames of 10ms. Each frame alone is shorter than one 16.67ms tick, so a
    // loop that discarded its remainder each frame would run ZERO steps forever —
    // that is the failure this test exists to catch.
    // Not asserting exactly 6: ten additions of 0.01 sum to 0.09999999999999999,
    // landing just under the sixth tick. Float accumulation, inherent and harmless.
    for (let i = 0; i < 10; i++) advance(0.01);

    expect(steps).toBeGreaterThanOrEqual(5);
    expect(steps).toBeLessThanOrEqual(6);
  });
});
