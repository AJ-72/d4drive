import * as THREE from 'three';
import { VEHICLE_SPECS, type VehicleKind } from '../profiles/types';
import type { Road } from '../road/road';
import type { Agent, Pedestrian, World } from '../sim/world';
import { m, sceneZ } from './units';

// Mirrors the sim's agents and pedestrians as 3D meshes. Read-only with respect to
// the sim: it never writes to an Agent, so the traffic AI behaves exactly as in
// the 2D spike.

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 14).rotateX(Math.PI / 2);
const matCache = new Map<string, THREE.MeshStandardMaterial>();

function mat(color: string, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const key = color + JSON.stringify(opts);
  let mm = matCache.get(key);
  if (!mm) {
    mm = new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...opts });
    matCache.set(key, mm);
  }
  return mm;
}

// Shared lamp materials. Their intensity is driven by time of day and braking.
export const LAMPS = {
  head: new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff1c4', emissiveIntensity: 0.2 }),
  tail: new THREE.MeshStandardMaterial({ color: '#5a0d0d', emissive: '#ff2a1a', emissiveIntensity: 0.3 }),
  brake: new THREE.MeshStandardMaterial({ color: '#8a1010', emissive: '#ff2a1a', emissiveIntensity: 3 }),
};
const GLASS = mat('#1c2a36', { roughness: 0.15, metalness: 0.4 });
const TYRE = mat('#1a1a1c', { roughness: 0.9 });
const SKIN = ['#8d5a3b', '#6b4127', '#b07a52', '#c99a74', '#e4c1a1'];

export function box(
  parent: THREE.Object3D,
  material: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const b = new THREE.Mesh(unitBox, material);
  b.scale.set(sx, sy, sz);
  b.position.set(x, y, z);
  b.castShadow = true;
  parent.add(b);
  return b;
}

export function wheel(parent: THREE.Object3D, r: number, w: number, x: number, z: number): THREE.Mesh {
  const wh = new THREE.Mesh(wheelGeo, TYRE);
  wh.scale.set(r, r, w);
  wh.position.set(x, r, z);
  wh.castShadow = true;
  parent.add(wh);
  return wh;
}

function rider(parent: THREE.Object3D, x: number, y: number, shirt: string, helmet: string | null, skin: string): void {
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 4, 8), mat(shirt));
  torso.position.set(x, y + 0.35, 0);
  torso.rotation.z = -0.25;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(helmet ?? skin));
  head.position.set(x + 0.12, y + 0.85, 0);
  parent.add(torso, head);
}

interface Built {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  wheelR: number;
  tails: THREE.Mesh[];
}

const CAR_COLOURS = ['#e9ecef', '#b9bec4', '#c0392b', '#2e5c8a', '#1d1f22', '#7b2d3b', '#d4a13a', '#3f7d5a'];
const SHIRTS = ['#3867d6', '#eb3b5a', '#20bf6b', '#f7b731', '#f5f6fa', '#8854d0', '#4b6584'];

function build(kind: VehicleKind, id: number): Built {
  const spec = VEHICLE_SPECS[kind];
  const L = m(spec.lengthPx);
  const W = m(spec.widthPx);
  const g = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const tails: THREE.Mesh[] = [];
  const pick = <T,>(arr: readonly T[]): T => arr[id % arr.length]!;
  let wheelR = 0.34;

  if (kind === 'car') {
    const paint = mat(pick(CAR_COLOURS), { metalness: 0.35, roughness: 0.35 });
    box(g, paint, L, 0.62, W * 0.92, 0, 0.62, 0);
    box(g, GLASS, L * 0.5, 0.55, W * 0.82, -0.15, 1.2, 0);
    box(g, paint, L * 0.46, 0.08, W * 0.84, -0.18, 1.5, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheels.push(wheel(g, 0.34, 0.24, sx * L * 0.32, sz * W * 0.42));
    for (const sz of [-1, 1]) {
      box(g, LAMPS.head, 0.06, 0.14, 0.34, L / 2, 0.72, sz * W * 0.3);
      tails.push(box(g, LAMPS.tail, 0.06, 0.14, 0.34, -L / 2, 0.75, sz * W * 0.3));
    }
  } else if (kind === 'auto') {
    // Kerala auto-rickshaw: black tub, yellow canopy, single front wheel.
    const black = mat('#1d1f22', { roughness: 0.5 });
    const yellow = mat('#f2c230', { roughness: 0.45 });
    box(g, black, L * 0.62, 0.55, W * 0.86, -L * 0.14, 0.6, 0);
    box(g, black, L * 0.32, 0.9, W * 0.42, L * 0.3, 0.8, 0);
    box(g, GLASS, 0.05, 0.5, W * 0.4, L * 0.46, 1.45, 0);
    box(g, yellow, L * 0.86, 0.14, W * 0.94, -L * 0.04, 1.9, 0);
    box(g, yellow, L * 0.5, 0.75, 0.05, -L * 0.2, 1.48, W * 0.47);
    box(g, yellow, L * 0.5, 0.75, 0.05, -L * 0.2, 1.48, -W * 0.47);
    box(g, yellow, 0.05, 0.9, W * 0.94, -L * 0.45, 1.4, 0);
    wheels.push(wheel(g, 0.28, 0.16, L * 0.36, 0));
    for (const sz of [-1, 1]) wheels.push(wheel(g, 0.28, 0.16, -L * 0.3, sz * W * 0.4));
    box(g, LAMPS.head, 0.06, 0.16, 0.2, L * 0.47, 0.95, 0);
    for (const sz of [-1, 1]) tails.push(box(g, LAMPS.tail, 0.05, 0.1, 0.16, -L * 0.45, 0.6, sz * W * 0.32));
    rider(g, L * 0.1, 0.7, pick(SHIRTS), null, pick(SKIN));
    wheelR = 0.28;
  } else if (kind === 'bus') {
    // KSRTC-style: red body, cream window band.
    const red = mat('#b8322a', { roughness: 0.45 });
    const cream = mat('#efe3c2', { roughness: 0.5 });
    box(g, red, L, 1.5, W, 0, 1.2, 0);
    box(g, GLASS, L * 0.96, 0.8, W * 1.01, 0, 2.3, 0);
    box(g, cream, L, 0.3, W, 0, 2.85, 0);
    box(g, red, L * 0.98, 0.12, W * 0.96, 0, 3.05, 0);
    box(g, GLASS, 0.05, 1.2, W * 0.9, L / 2, 2.1, 0);
    box(g, mat('#1a1a1a', { emissive: '#ffb000', emissiveIntensity: 1.2 }), 0.06, 0.28, W * 0.6, L / 2 + 0.01, 2.8, 0);
    for (const x of [L * 0.35, -L * 0.25, -L * 0.38]) for (const sz of [-1, 1]) wheels.push(wheel(g, 0.5, 0.3, x, sz * W * 0.42));
    for (const sz of [-1, 1]) {
      box(g, LAMPS.head, 0.06, 0.2, 0.36, L / 2, 0.8, sz * W * 0.34);
      tails.push(box(g, LAMPS.tail, 0.06, 0.26, 0.26, -L / 2, 0.9, sz * W * 0.38));
    }
    wheelR = 0.5;
  } else {
    const paint = mat(pick(['#c0392b', '#1d1f22', '#2e5c8a', '#6d6f73']), { metalness: 0.4, roughness: 0.4 });
    box(g, paint, L * 0.55, 0.32, W * 0.3, 0, 0.72, 0);
    box(g, paint, L * 0.3, 0.3, W * 0.4, L * 0.05, 0.95, 0);
    box(g, mat('#2b2b2b'), 0.08, 0.5, W * 0.9, L * 0.32, 1.05, 0);
    for (const x of [L * 0.34, -L * 0.34]) wheels.push(wheel(g, 0.33, 0.1, x, 0));
    box(g, LAMPS.head, 0.06, 0.14, 0.14, L * 0.4, 1.0, 0);
    tails.push(box(g, LAMPS.tail, 0.05, 0.08, 0.14, -L * 0.42, 0.9, 0));
    rider(g, -L * 0.05, 0.95, pick(SHIRTS), pick(['#f5f6fa', '#1d1f22', '#eb3b5a', '#f7b731']), pick(SKIN));
    wheelR = 0.33;
  }
  return { group: g, wheels, wheelR, tails };
}

interface Tracked {
  built: Built;
  kind: VehicleKind;
  lastY: number;
  lastSpeed: number;
  yaw: number;
  seen: boolean;
}

interface PedMesh {
  group: THREE.Group;
  legs: THREE.Object3D[];
  lastY: number;
  seen: boolean;
}

export class Traffic3D {
  private readonly root = new THREE.Group();
  private readonly tracked = new Map<number, Tracked>();
  private readonly pool = new Map<VehicleKind, Built[]>();
  private readonly peds = new Map<number, PedMesh>();
  private readonly pedPool: PedMesh[] = [];
  private pedSerial = 0;

  constructor(scene: THREE.Scene) {
    this.root.name = 'traffic';
    scene.add(this.root);
  }

  setNight(night: number): void {
    LAMPS.head.emissiveIntensity = 0.2 + night * 4;
    LAMPS.tail.emissiveIntensity = 0.3 + night * 1.5;
  }

  sync(world: World, dt: number): void {
    const road = world.road;
    for (const t of this.tracked.values()) t.seen = false;
    for (const a of world.agents) this.syncAgent(a, road, dt);
    for (const [id, t] of this.tracked) {
      if (t.seen) continue;
      this.root.remove(t.built.group);
      const list = this.pool.get(t.kind) ?? [];
      list.push(t.built);
      this.pool.set(t.kind, list);
      this.tracked.delete(id);
    }

    for (const p of this.peds.values()) p.seen = false;
    for (const ped of world.pedestrians) this.syncPed(ped, road, world.time);
    for (const [id, pm] of this.peds) {
      if (pm.seen) continue;
      this.root.remove(pm.group);
      this.pedPool.push(pm);
      this.peds.delete(id);
    }
  }

  private syncAgent(a: Agent, road: Road, dt: number): void {
    let t = this.tracked.get(a.id);
    if (!t) {
      const built = this.pool.get(a.kind)?.pop() ?? build(a.kind, a.id);
      this.root.add(built.group);
      t = { built, kind: a.kind, lastY: a.y, lastSpeed: a.speed, yaw: 0, seen: true };
      this.tracked.set(a.id, t);
    }
    t.seen = true;
    const g = t.built.group;
    g.position.set(m(a.x), 0, sceneZ(road, a.y));

    // Heading from actual motion, so weaving and cut-ins read as steering.
    if (dt > 0) {
      const dz = m(a.y - t.lastY);
      const dx = Math.max(m(a.speed) * dt, 1e-3);
      const target = -Math.atan2(dz, dx);
      t.yaw += (target - t.yaw) * Math.min(1, dt * 8);
    }
    g.rotation.y = t.yaw;
    if (a.kind === 'bike') g.rotation.x = t.yaw * 1.5; // lean into the turn

    const spin = (m(a.speed) * dt) / t.built.wheelR;
    for (const w of t.built.wheels) w.rotation.z -= spin;

    const braking = dt > 0 && (a.speed - t.lastSpeed) / dt < -60;
    for (const tl of t.built.tails) tl.material = braking || a.speed < 5 ? LAMPS.brake : LAMPS.tail;

    t.lastY = a.y;
    t.lastSpeed = a.speed;
  }

  private syncPed(p: Pedestrian, road: Road, time: number): void {
    let pm = this.peds.get(p.id);
    if (!pm) {
      pm = this.pedPool.pop() ?? this.buildPed(this.pedSerial++);
      pm.lastY = p.y;
      this.peds.set(p.id, pm);
      this.root.add(pm.group);
    }
    pm.seen = true;
    // Pedestrians on the carriageway stand on it; on the kerb they stand on the pavement.
    const z = sceneZ(road, p.y);
    pm.group.position.set(m(p.x), 0.02, z);
    const dy = p.y - pm.lastY;
    const moving = Math.abs(dy) > 0.01;
    if (moving) pm.group.rotation.y = dy > 0 ? -Math.PI / 2 : Math.PI / 2;
    const swing = moving ? Math.sin(time * 9 + pm.group.id) * 0.5 : 0;
    pm.legs[0]!.rotation.z = swing;
    pm.legs[1]!.rotation.z = -swing;
    pm.lastY = p.y;
  }

  private buildPed(n: number): PedMesh {
    const g = new THREE.Group();
    const shirt = mat(SHIRTS[n % SHIRTS.length]!);
    const skin = mat(SKIN[n % SKIN.length]!);
    const mundu = mat(n % 3 === 0 ? '#f4efe4' : '#34495e');
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 8), shirt);
    body.position.y = 1.15;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skin);
    head.position.y = 1.72;
    const legs: THREE.Object3D[] = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.8, s * 0.1);
      const leg = new THREE.Mesh(unitBox, mundu);
      leg.scale.set(0.14, 0.8, 0.14);
      leg.position.y = -0.4;
      leg.castShadow = true;
      pivot.add(leg);
      g.add(pivot);
      legs.push(pivot);
    }
    g.add(body, head);
    return { group: g, legs, lastY: 0, seen: true };
  }
}
