import * as THREE from 'three';
import { glowTexture } from './textures';
import { mulberry } from './units';

// Fish hover over the lanes. Changing lane to scoop them up pulls the player through
// traffic, which is the point: the collectible is bait for engaging with the culture.

export interface FishSpot {
  x: number;
  z: number;
  y: number;
  golden: boolean;
  taken: boolean;
}

export const HIGH_FISH_Y = 2.7;
const LOW_FISH_Y = 1.15;

export function layFish(roadLengthM: number, laneZ: readonly number[], seed = 5): FishSpot[] {
  const rnd = mulberry(seed);
  const out: FishSpot[] = [];
  for (let x = 200; x < roadLengthM - 60; x += 32 + rnd() * 55) {
    const z = laneZ[Math.floor(rnd() * laneZ.length)]! + (rnd() - 0.5) * 2;
    const high = rnd() < 0.18;
    out.push({ x, z, y: high ? HIGH_FISH_Y : LOW_FISH_Y, golden: rnd() < 0.07, taken: false });
    // Sometimes a short school, so a clean line through traffic pays off.
    if (rnd() < 0.2) {
      for (let k = 1; k <= 3; k++) out.push({ x: x + k * 4, z, y: LOW_FISH_Y, golden: false, taken: false });
      x += 12;
    }
  }
  return out;
}

function fishGeometry(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.5, 16, 10).scale(1, 0.46, 0.24);
}

export class FishField {
  readonly spots: FishSpot[];
  private readonly meshes = new Map<FishSpot, THREE.Group>();
  private readonly pool: THREE.Group[] = [];
  private readonly goldPool: THREE.Group[] = [];
  private readonly root = new THREE.Group();
  private readonly silver = new THREE.MeshStandardMaterial({ color: '#9fc4d8', metalness: 0.7, roughness: 0.25, emissive: '#1d4a66', emissiveIntensity: 0.3 });
  private readonly gold = new THREE.MeshStandardMaterial({ color: '#ffd24a', metalness: 0.9, roughness: 0.2, emissive: '#ffb300', emissiveIntensity: 0.9 });
  private readonly geo = fishGeometry();
  private readonly tailGeo = new THREE.ConeGeometry(0.2, 0.3, 4).rotateZ(Math.PI / 2).scale(1, 1, 0.25);
  private readonly glow = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffcf5a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

  constructor(scene: THREE.Scene, spots: FishSpot[]) {
    this.spots = spots;
    scene.add(this.root);
  }

  private make(golden: boolean): THREE.Group {
    const g = new THREE.Group();
    const m = golden ? this.gold : this.silver;
    const body = new THREE.Mesh(this.geo, m);
    const tail = new THREE.Mesh(this.tailGeo, m);
    tail.position.x = -0.6;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: '#111' }));
    eye.position.set(0.3, 0.05, 0.1);
    g.add(body, tail, eye);
    if (golden) {
      const s = new THREE.Sprite(this.glow);
      s.scale.setScalar(2.2);
      g.add(s);
    }
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    return g;
  }

  /** Nearest untaken fish ahead within `range` metres. Drives the "fish ahead" hint. */
  nextAhead(px: number, range: number): FishSpot | null {
    let best: FishSpot | null = null;
    for (const f of this.spots) {
      if (f.taken || f.x < px + 3 || f.x > px + range) continue;
      if (!best || f.x < best.x) best = f;
    }
    return best;
  }

  /** Returns fish collected this frame. */
  update(px: number, pz: number, lift: number, time: number): FishSpot[] {
    const got: FishSpot[] = [];
    for (const f of this.spots) {
      const visible = !f.taken && f.x > px - 30 && f.x < px + 260;
      let mesh = this.meshes.get(f);
      if (visible && !mesh) {
        mesh = (f.golden ? this.goldPool : this.pool).pop() ?? this.make(f.golden);
        this.meshes.set(f, mesh);
        this.root.add(mesh);
      }
      if (!visible && mesh) {
        this.root.remove(mesh);
        (f.golden ? this.goldPool : this.pool).push(mesh);
        this.meshes.delete(f);
        continue;
      }
      if (!mesh) continue;
      mesh.position.set(f.x, f.y + Math.sin(time * 3 + f.x) * 0.15, f.z);
      mesh.rotation.y = time * 2 + f.x;
      mesh.rotation.z = Math.sin(time * 8 + f.x) * 0.2;

      const reach = f.y - (lift + 1.0);
      if (Math.abs(px - f.x) < 2.6 && Math.abs(pz - f.z) < 1.7 && reach < 1.0) {
        f.taken = true;
        got.push(f);
      }
    }
    return got;
  }

  reset(): void {
    for (const f of this.spots) f.taken = false;
  }
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  r: number;
  g: number;
  b: number;
  gravity: number;
}

/** One pool of additive points for sparkles, spray and dust. */
export class Particles {
  private readonly list: Particle[] = [];
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private static readonly MAX = 600;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(Particles.MAX * 3);
    this.col = new Float32Array(Particles.MAX * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const pts = new THREE.Points(
      this.geo,
      new THREE.PointsMaterial({
        size: 0.35,
        map: glowTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    pts.frustumCulled = false;
    scene.add(pts);
  }

  emit(n: number, at: THREE.Vector3, color: string, speed: number, gravity = -9, spread = 1): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < n && this.list.length < Particles.MAX; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const s = speed * (0.4 + Math.random() * 0.6);
      const k = Math.sqrt(1 - u * u);
      const max = 0.6 + Math.random() * 0.6;
      this.list.push({
        x: at.x + (Math.random() - 0.5) * spread,
        y: at.y,
        z: at.z + (Math.random() - 0.5) * spread,
        vx: Math.cos(a) * k * s,
        vy: Math.abs(u) * s,
        vz: Math.sin(a) * k * s,
        life: max,
        max,
        r: c.r,
        g: c.g,
        b: c.b,
        gravity,
      });
    }
  }

  update(dt: number): void {
    let j = 0;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i]!;
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      this.list[j++] = p;
    }
    this.list.length = j;
    for (let i = 0; i < Particles.MAX; i++) {
      const p = this.list[i];
      const f = p ? p.life / p.max : 0;
      this.pos[i * 3] = p ? p.x : 0;
      this.pos[i * 3 + 1] = p ? p.y : -999;
      this.pos[i * 3 + 2] = p ? p.z : 0;
      this.col[i * 3] = p ? p.r * f : 0;
      this.col[i * 3 + 1] = p ? p.g * f : 0;
      this.col[i * 3 + 2] = p ? p.b * f : 0;
    }
    this.geo.attributes['position']!.needsUpdate = true;
    this.geo.attributes['color']!.needsUpdate = true;
  }
}
