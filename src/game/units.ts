import { roadWidthPx, type Road } from '../road/road';

// The sim works in px along a flat strip. The 3D scene works in metres.
// A 46px car is ~4.6 m, so 10 px = 1 m.
export const PX_PER_M = 10;

export const m = (px: number): number => px / PX_PER_M;
export const kmh = (pxPerSec: number): number => (pxPerSec / PX_PER_M) * 3.6;

/**
 * Sim (x, y) -> scene (x, z). Traffic drives toward +x; sim y grows downward, which
 * in a +x-facing view is the driver's right, i.e. scene +z. The carriageway is
 * centred on z = 0 so the scenery can be laid out symmetrically around it.
 */
export function sceneZ(road: Road, yPx: number): number {
  return m(yPx) - m(roadWidthPx(road)) / 2;
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Deterministic PRNG for scenery, so the coast is the same on every visit. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
