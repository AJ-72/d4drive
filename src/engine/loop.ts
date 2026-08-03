export const FIXED_DT = 1 / 60; // seconds. Simulation step. Never varies.

export function startLoop(
  step: (dt: number) => void,
  render: (alpha: number) => void,
): () => void {
  let last = performance.now() / 1000;
  let accumulator = 0;
  let running = true;

  const frame = () => {
    if (!running) return;
    const now = performance.now() / 1000;
    // Clamp: a backgrounded tab produces a huge delta. Without this clamp the
    // accumulator runs hundreds of steps at once and the sim explodes.
    // C4 (3-minute unattended soak) fails without it.
    const frameTime = Math.min(now - last, 0.25);
    last = now;
    accumulator += frameTime;

    while (accumulator >= FIXED_DT) {
      step(FIXED_DT);
      accumulator -= FIXED_DT;
    }
    render(accumulator / FIXED_DT);
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
  return () => {
    running = false;
  };
}
