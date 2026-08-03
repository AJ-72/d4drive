// HANDOFF A2: a seeded PRNG, fixed seed, and the SAME seed for both profiles.
// Two consequences, both wanted:
//   - every tester sees the same traffic, so five sessions are comparable
//   - the difference between profiles cannot be luck, because the stream is identical
// Math.random() would quietly destroy both, and nothing would look wrong.

export type Rng = () => number;

export const DEFAULT_SEED = 0x044d_2f1e;

/** mulberry32 — small, fast, adequate for a traffic sim. Deterministic given the seed. */
export function createRng(seed: number = DEFAULT_SEED): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Box-Muller. Returns one normally distributed sample. */
export function gaussian(mean: number, stdDev: number, rng: Rng): number {
  // rng() can return exactly 0, and Math.log(0) is -Infinity.
  const u = 1 - rng();
  const v = rng();
  const mag = Math.sqrt(-2 * Math.log(u));
  return mean + stdDev * mag * Math.cos(2 * Math.PI * v);
}

/** Pick a key from a weighted map. Weights are assumed to sum to 1 (validated elsewhere). */
export function weightedPick<K extends string>(
  weights: Readonly<Record<K, number>>,
  keys: readonly K[],
  rng: Rng,
): K {
  let r = rng();
  for (const k of keys) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  // Floating-point residue: fall back to the last non-zero-weight key.
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = keys[i]!;
    if (weights[k] > 0) return k;
  }
  throw new Error('weightedPick: all weights are zero');
}
