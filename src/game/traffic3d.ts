import * as THREE from 'three';
import { VEHICLE_SPECS, type VehicleKind } from '../profiles/types';
import { roadWidthPx, type Road } from '../road/road';
import {
  PED_BOTTOM_OFF_PX,
  PED_TOP_OFF_PX,
  SIM_MARGIN_PX,
  type Agent,
  type Pedestrian,
  type World,
} from '../sim/world';
import { WALK_TOP, WALK_W } from './scenery';
import { lerp, m, sceneZ, smoothstep } from './units';

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
  /** Oncoming high beams: bright enough after dark to bloom across the screen. */
  high: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6de', emissiveIntensity: 0.4 }),
};

// Traffic enters and leaves at the edge of the sim window. Fade it in and out of the
// haze well inside that edge, so no vehicle ever appears or vanishes in plain view.
const FADE_FAR_M = m(SIM_MARGIN_PX) - 5;
const FADE_NEAR_M = FADE_FAR_M - 45;
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
  heads: THREE.Mesh[];
  /** Every mesh, with the material it shows when fully faded in. */
  meshes: { mesh: THREE.Mesh; base: THREE.Material }[];
  /** Per-mesh transparent copies, used only while fading. Shared materials stay opaque. */
  fades: Map<THREE.Mesh, THREE.MeshStandardMaterial>;
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
  const heads: THREE.Mesh[] = [];
  const pick = <T,>(arr: readonly T[]): T => arr[id % arr.length]!;
  let wheelR = 0.34;

  if (kind === 'car') {
    const paint = mat(pick(CAR_COLOURS), { metalness: 0.35, roughness: 0.35 });
    box(g, paint, L, 0.62, W * 0.92, 0, 0.62, 0);
    box(g, GLASS, L * 0.5, 0.55, W * 0.82, -0.15, 1.2, 0);
    box(g, paint, L * 0.46, 0.08, W * 0.84, -0.18, 1.5, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheels.push(wheel(g, 0.34, 0.24, sx * L * 0.32, sz * W * 0.42));
    for (const sz of [-1, 1]) {
      heads.push(box(g, LAMPS.head, 0.06, 0.14, 0.34, L / 2, 0.72, sz * W * 0.3));
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
    heads.push(box(g, LAMPS.head, 0.06, 0.16, 0.2, L * 0.47, 0.95, 0));
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
      heads.push(box(g, LAMPS.head, 0.06, 0.2, 0.36, L / 2, 0.8, sz * W * 0.34));
      tails.push(box(g, LAMPS.tail, 0.06, 0.26, 0.26, -L / 2, 0.9, sz * W * 0.38));
    }
    wheelR = 0.5;
  } else {
    const paint = mat(pick(['#c0392b', '#1d1f22', '#2e5c8a', '#6d6f73']), { metalness: 0.4, roughness: 0.4 });
    box(g, paint, L * 0.55, 0.32, W * 0.3, 0, 0.72, 0);
    box(g, paint, L * 0.3, 0.3, W * 0.4, L * 0.05, 0.95, 0);
    box(g, mat('#2b2b2b'), 0.08, 0.5, W * 0.9, L * 0.32, 1.05, 0);
    for (const x of [L * 0.34, -L * 0.34]) wheels.push(wheel(g, 0.33, 0.1, x, 0));
    heads.push(box(g, LAMPS.head, 0.06, 0.14, 0.14, L * 0.4, 1.0, 0));
    tails.push(box(g, LAMPS.tail, 0.05, 0.08, 0.14, -L * 0.42, 0.9, 0));
    rider(g, -L * 0.05, 0.95, pick(SHIRTS), pick(['#f5f6fa', '#1d1f22', '#eb3b5a', '#f7b731']), pick(SKIN));
    wheelR = 0.33;
  }
  // Roll about the vehicle's own length axis, after the yaw: a bike leans into its
  // turn whichever way it is facing.
  g.rotation.order = 'YXZ';
  const meshes: Built['meshes'] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push({ mesh: o, base: o.material as THREE.Material });
  });
  return { group: g, wheels, wheelR, tails, heads, meshes, fades: new Map() };
}

/** Show a vehicle at `opacity`, swapping to private transparent copies only while < 1. */
function applyOpacity(b: Built, opacity: number): void {
  b.group.visible = opacity > 0.01;
  const fading = opacity < 0.995;
  for (const entry of b.meshes) {
    // Lamps swap between shared materials (tail/brake, head/high), so read it live.
    if (b.tails.includes(entry.mesh) || b.heads.includes(entry.mesh)) {
      entry.base = (entry.mesh.userData['lamp'] as THREE.Material | undefined) ?? entry.base;
    }
    if (!fading) {
      entry.mesh.material = entry.base;
      entry.mesh.castShadow = true;
      continue;
    }
    let f = b.fades.get(entry.mesh);
    if (!f) {
      f = (entry.base as THREE.MeshStandardMaterial).clone();
      b.fades.set(entry.mesh, f);
    }
    // Copied every frame: lamp brightness follows the time of day.
    f.copy(entry.base as THREE.MeshStandardMaterial);
    f.transparent = true;
    f.opacity = opacity;
    entry.mesh.material = f;
    entry.mesh.castShadow = false;
  }
}

interface Tracked {
  built: Built;
  kind: VehicleKind;
  dir: 1 | -1;
  /** Sim position at the previous and the latest step, for interpolating frames. */
  prevX: number;
  prevY: number;
  x: number;
  y: number;
  lastSpeed: number;
  /** Heading relative to the direction of travel. */
  yaw: number;
  seen: boolean;
}

interface PedMesh {
  group: THREE.Group;
  legs: THREE.Object3D[];
  /** This person's own materials, so each can fade on its own. */
  mats: THREE.MeshStandardMaterial[];
  lastY: number;
  seen: boolean;
}

/**
 * How visible a pedestrian is at sim y. They start and finish off the road: at the
 * sea railing, where there is nothing to hide behind, so they fade in and out over
 * the first/last 30px; and inside the building row, which hides them — the fade
 * there only covers the gaps between buildings.
 */
function pedOpacity(road: Road, y: number): number {
  const seaEnd = -PED_TOP_OFF_PX;
  const landEnd = roadWidthPx(road) + PED_BOTTOM_OFF_PX;
  return smoothstep(seaEnd, seaEnd + 30, y) * (1 - smoothstep(landEnd - 40, landEnd - 5, y));
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
    LAMPS.high.emissiveIntensity = 0.4 + night * 40;
  }

  /**
   * Place every vehicle for this frame. The sim steps at a fixed 60 Hz while the
   * screen refreshes at its own rate; drawing the last step's position as-is made
   * traffic judder. `alpha` is how far this frame sits between the last two steps.
   */
  render(road: Road, alpha: number, playerXm: number): void {
    const endM = m(road.lengthPx);
    for (const t of this.tracked.values()) {
      const x = m(lerp(t.prevX, t.x, alpha));
      t.built.group.position.set(x, 0, sceneZ(road, lerp(t.prevY, t.y, alpha)));
      const far = 1 - smoothstep(FADE_NEAR_M, FADE_FAR_M, Math.abs(x - playerXm));
      // Traffic also leaves the sim just past the end of the road.
      const end = 1 - smoothstep(endM, endM + 25, x);
      applyOpacity(t.built, far * end);
    }
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
      t = { built, kind: a.kind, dir: a.dir, prevX: a.x, prevY: a.y, x: a.x, y: a.y, lastSpeed: a.speed, yaw: 0, seen: true };
      this.tracked.set(a.id, t);
      // Placed now, so a vehicle never shows for a frame at a pooled mesh's old spot.
      built.group.position.set(m(a.x), 0, sceneZ(road, a.y));
    }
    t.seen = true;
    t.prevX = t.x;
    t.prevY = t.y;
    const g = t.built.group;

    // Heading from actual motion, so weaving and cut-ins read as steering. Eased
    // gently: a lane change reads as a steer, not a snap.
    if (dt > 0) {
      const dz = m(a.y - t.y);
      const dx = Math.max(m(a.speed) * dt, 1e-3);
      const target = -a.dir * Math.atan2(dz, dx);
      t.yaw += (target - t.yaw) * Math.min(1, dt * 5);
    }
    t.x = a.x;
    t.y = a.y;
    // Oncoming traffic faces -x.
    g.rotation.y = (a.dir < 0 ? Math.PI : 0) + t.yaw;
    if (a.kind === 'bike') g.rotation.x = t.yaw * 1.5; // lean into the turn

    const spin = (m(a.speed) * dt) / t.built.wheelR;
    for (const w of t.built.wheels) w.rotation.z -= spin;

    const braking = dt > 0 && (a.speed - t.lastSpeed) / dt < -60;
    for (const tl of t.built.tails) tl.userData['lamp'] = braking || a.speed < 5 ? LAMPS.brake : LAMPS.tail;
    for (const hl of t.built.heads) hl.userData['lamp'] = a.highBeam ? LAMPS.high : LAMPS.head;

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
    const edge = m(roadWidthPx(road)) / 2 + m(road.shoulderPx);
    const onWalk = Math.abs(z) >= edge && Math.abs(z) <= edge + WALK_W;
    pm.group.position.set(m(p.x), onWalk ? WALK_TOP : 0.02, z);
    const opacity = pedOpacity(road, p.y);
    pm.group.visible = opacity > 0.01;
    const fading = opacity < 0.995;
    for (const mm of pm.mats) {
      if (mm.transparent !== fading) {
        mm.transparent = fading;
        mm.needsUpdate = true;
      }
      mm.opacity = opacity;
    }
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
    const shirt = mat(SHIRTS[n % SHIRTS.length]!).clone();
    const skin = mat(SKIN[n % SKIN.length]!).clone();
    const mundu = mat(n % 3 === 0 ? '#f4efe4' : '#34495e').clone();
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
    return { group: g, legs, mats: [shirt, skin, mundu], lastY: 0, seen: true };
  }
}
