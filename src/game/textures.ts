import * as THREE from 'three';
import { mulberry } from './units';

// Every texture is painted on a canvas at load. No image files ship with the game.

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Speckled grey, tinted by the material colour. Used for asphalt, gravel, sand. */
export function grainTexture(seed: number, base: number, spread: number, size = 256): THREE.CanvasTexture {
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const rnd = mulberry(seed);
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, base + (rnd() - 0.5) * spread + (rnd() < 0.02 ? 40 : 0)));
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/** Square paving slabs for the promenade and pavements. */
export function pavingTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rnd = mulberry(7);
  ctx.fillStyle = '#b9b2a6';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const v = 190 + Math.floor((rnd() - 0.5) * 30);
      ctx.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
      ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    }
  }
  return toTexture(c);
}

/**
 * Facade with a window grid. `lit` paints only the windows that glow at night and is
 * used as the emissive map, so buildings light up irregularly after dusk.
 * The bottom-left corner is left blank: roof and floor faces are UV-mapped there.
 */
export function facadeTextures(): { map: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  const W = 256;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const [lc, lctx] = canvas(W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  lctx.fillStyle = '#000000';
  lctx.fillRect(0, 0, W, H);
  const rnd = mulberry(11);
  const cols = 6;
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = 16 + col * 38;
      const y = 14 + r * 40;
      if (y + 26 > H - 20 && x < 40) continue;
      ctx.fillStyle = '#5b6770';
      ctx.fillRect(x, y, 22, 26);
      ctx.fillStyle = '#8a969e';
      ctx.fillRect(x, y, 22, 4);
      if (rnd() < 0.55) {
        const warm = rnd() < 0.8;
        lctx.fillStyle = warm ? '#ffcf7a' : '#bfe3ff';
        lctx.fillRect(x, y, 22, 26);
      }
    }
  }
  // Shop-front band along the bottom.
  ctx.fillStyle = '#39424a';
  ctx.fillRect(40, H - 18, W - 56, 18);
  lctx.fillStyle = '#ffd98f';
  lctx.fillRect(40, H - 18, W - 56, 18);
  return { map: toTexture(c, false), lit: toTexture(lc, false) };
}

/** Soft cloud puff: several overlapping radial blobs. */
export function cloudTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 128);
  const rnd = mulberry(3);
  for (let i = 0; i < 14; i++) {
    const x = 50 + rnd() * 156;
    const y = 50 + rnd() * 40;
    const r = 18 + rnd() * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 128);
  }
  return toTexture(c, false);
}

/** Round soft dot for glows, sparkles and stars. */
export function glowTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

/** Chequered finish banner. */
export function bannerTexture(text: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 96);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 32; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
      ctx.fillRect(x * 16, y * 16, 16, 16);
      ctx.fillRect(x * 16, 64 + y * 16, 16, 16);
    }
  }
  ctx.fillStyle = '#d7263d';
  ctx.fillRect(0, 32, 512, 32);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 49);
  return toTexture(c, false);
}

/** Roadside kilometre sign. */
export function signTexture(text: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 64);
  ctx.fillStyle = '#1f6f4a';
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 120, 56);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 34);
  return toTexture(c, false);
}
