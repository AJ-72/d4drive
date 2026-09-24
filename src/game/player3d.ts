import * as THREE from 'three';
import { VEHICLE_SPECS } from '../profiles/types';
import { box, LAMPS, wheel } from './traffic3d';
import { m } from './units';

const L = m(VEHICLE_SPECS.car.lengthPx);
const W = m(VEHICLE_SPECS.car.widthPx) * 0.92;

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });

const FEATHER = std('#f6f3ec', { roughness: 0.8 });
const BEAK = std('#f7c25c', { roughness: 0.45 });
const POUCH = std('#f5a45a', { roughness: 0.5 });
const HELMET = std('#ff5a4e', { roughness: 0.3, metalness: 0.1 });
const SCARF = std('#d7263d', { roughness: 0.7, side: THREE.DoubleSide });

export interface PlayerPose {
  x: number;
  z: number;
  /** Height above the road, from jumps. */
  lift: number;
  yaw: number;
  /** m/s along the road. */
  speed: number;
  /** 0..1: wings spread for a stunt. */
  wings: number;
  /** 0..1: beak open mid-squawk. */
  squawk: number;
  pitch: number;
  roll: number;
  night: number;
  time: number;
}

/**
 * A red convertible with a pelican at the wheel: white feathers, red helmet, and a red
 * scarf simulated as a Verlet chain so it streams behind at speed and flops when parked.
 */
export class PlayerCar {
  readonly group = new THREE.Group();
  /** Everything that pitches and rolls for stunts sits under this. */
  private readonly body = new THREE.Group();
  readonly pelican = new THREE.Group();
  private readonly wings: THREE.Group[] = [];
  private readonly jaw = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly neckAnchor = new THREE.Object3D();
  private readonly wheels: THREE.Mesh[] = [];
  private readonly headlight: THREE.SpotLight;
  private readonly scarf: Scarf;
  private readonly helmetGroup = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.group.add(this.body);
    this.buildCar();
    this.buildPelican();
    this.body.add(this.pelican);

    this.headlight = new THREE.SpotLight('#fff1d0', 0, 80, 0.55, 0.5, 1.4);
    this.headlight.position.set(L / 2, 0.8, 0);
    this.headlight.target.position.set(L / 2 + 25, 0, 0);
    this.body.add(this.headlight, this.headlight.target);

    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    scene.add(this.group);
    this.scarf = new Scarf(scene);
  }

  private buildCar(): void {
    const paint = std('#e0312b', { metalness: 0.45, roughness: 0.28 });
    const chrome = std('#dfe3e6', { metalness: 0.9, roughness: 0.2 });
    const leather = std('#6b3f2a', { roughness: 0.8 });
    const b = this.body;
    box(b, paint, L, 0.5, W, 0, 0.6, 0);
    box(b, paint, L * 0.34, 0.16, W * 0.94, L * 0.31, 0.92, 0);
    box(b, paint, L * 0.26, 0.2, W * 0.94, -L * 0.37, 0.94, 0);
    for (const s of [-1, 1]) box(b, paint, L * 0.42, 0.2, 0.1, -L * 0.04, 0.94, s * W * 0.46);
    const shield = box(b, std('#9fd3e6', { transparent: true, opacity: 0.45, roughness: 0.05 }), 0.04, 0.42, W * 0.86, L * 0.13, 1.2, 0);
    shield.rotation.z = -0.45;
    box(b, leather, 0.5, 0.18, W * 0.8, -L * 0.12, 0.92, 0);
    box(b, leather, 0.14, 0.55, W * 0.8, -L * 0.2, 1.15, 0);
    box(b, chrome, 0.12, 0.14, W * 1.02, L / 2 + 0.02, 0.45, 0);
    box(b, chrome, 0.12, 0.14, W * 1.02, -L / 2 - 0.02, 0.45, 0);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const w = wheel(b, 0.36, 0.26, sx * L * 0.31, sz * W * 0.46);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.02, 12).rotateX(Math.PI / 2), chrome);
        w.add(hub);
        this.wheels.push(w);
      }
    }
    for (const sz of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), LAMPS.head);
      lamp.position.set(L / 2 - 0.02, 0.75, sz * W * 0.32);
      b.add(lamp);
      box(b, LAMPS.tail, 0.05, 0.12, 0.3, -L / 2, 0.72, sz * W * 0.32);
    }
    const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 8, 20), std('#222'));
    wheelRim.position.set(L * 0.02, 1.2, W * 0.22);
    wheelRim.rotation.y = Math.PI / 2;
    wheelRim.rotation.x = 0.4;
    b.add(wheelRim);
  }

  private buildPelican(): void {
    const p = this.pelican;
    // Right-hand drive, as in India: the pelican sits on the right (+z).
    p.position.set(-L * 0.12, 0.95, W * 0.22);

    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), FEATHER);
    torso.scale.set(1.05, 1.0, 0.85);
    torso.position.set(-0.05, 0.42, 0);
    p.add(torso);

    const neckCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.1, 0.7, 0),
      new THREE.Vector3(0.28, 0.95, 0),
      new THREE.Vector3(0.12, 1.2, 0),
      new THREE.Vector3(0.22, 1.4, 0),
    ]);
    p.add(new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 16, 0.1, 8, false), FEATHER));
    this.neckAnchor.position.set(0.18, 0.95, 0);
    p.add(this.neckAnchor);

    const knot = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.06, 8, 16), SCARF);
    knot.position.copy(this.neckAnchor.position);
    knot.rotation.x = Math.PI / 2;
    p.add(knot);

    const h = this.head;
    h.position.set(0.24, 1.45, 0);
    p.add(h);
    h.add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 12), FEATHER));
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.205, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), HELMET);
    helmet.rotation.z = 0.25;
    helmet.position.y = 0.03;
    this.helmetGroup.add(helmet);
    h.add(this.helmetGroup);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 24, Math.PI), std('#ffffff'));
    stripe.rotation.y = Math.PI / 2;
    stripe.position.y = 0.04;
    this.helmetGroup.add(stripe);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), std('#1a0c08'));
      eye.position.set(0.1, 0.03, s * 0.14);
      h.add(eye);
    }
    // Upper beak: long and flat.
    const upper = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.85, 10).rotateZ(-Math.PI / 2), BEAK);
    upper.scale.set(1, 0.55, 1);
    upper.position.set(0.55, -0.02, 0);
    h.add(upper);
    // Lower beak and pouch hinge together, so the whole jaw drops on a squawk.
    this.jaw.position.set(0.12, -0.05, 0);
    h.add(this.jaw);
    const lower = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.8, 10).rotateZ(-Math.PI / 2), BEAK);
    lower.scale.set(1, 0.4, 1);
    lower.position.set(0.42, 0, 0);
    const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), POUCH);
    pouch.scale.set(1.5, 0.5, 0.5);
    pouch.position.set(0.3, -0.07, 0);
    this.jaw.add(lower, pouch);

    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.05, 0.6, s * 0.3);
      const wingMesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), FEATHER);
      wingMesh.scale.set(1.3, 0.28, 0.5);
      wingMesh.position.set(0.3, -0.05, s * 0.12);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), std('#2b2b2e', { roughness: 0.8 }));
      tip.scale.set(1.4, 0.3, 0.5);
      tip.position.set(0.72, -0.08, s * 0.14);
      pivot.add(wingMesh, tip);
      pivot.userData['side'] = s;
      this.wings.push(pivot);
      p.add(pivot);
    }
  }

  setHelmet(on: boolean): void {
    this.helmetGroup.visible = on;
  }

  setScarf(on: boolean): void {
    this.scarf.mesh.visible = on;
  }

  update(pose: PlayerPose, dt: number): void {
    this.group.position.set(pose.x, pose.lift, pose.z);
    this.group.rotation.set(0, pose.yaw, 0);
    this.body.rotation.set(pose.roll, 0, pose.pitch);

    const spin = (pose.speed * dt) / 0.36;
    for (const w of this.wheels) w.rotation.z -= spin;

    for (const wg of this.wings) {
      const s = wg.userData['side'] as number;
      // Rest: reaching for the wheel. Stunt: flung out wide and high.
      wg.rotation.set(s * (0.2 + pose.wings * 1.25), s * -0.2 * (1 - pose.wings), 0.35 * (1 - pose.wings) + pose.wings * 0.5);
    }
    this.jaw.rotation.z = -pose.squawk * 0.7;
    this.head.rotation.z = pose.squawk * 0.5 + Math.sin(pose.time * 7) * 0.03 * Math.min(1, pose.speed / 10);
    this.head.rotation.y = Math.sin(pose.time * 0.7) * 0.12;

    this.headlight.intensity = pose.night * 260;

    this.group.updateMatrixWorld(true);
    const anchor = this.neckAnchor.getWorldPosition(new THREE.Vector3());
    this.scarf.update(anchor, pose, dt);
  }
}

const SCARF_N = 11;
const SCARF_SEG = 0.13;

class Scarf {
  private readonly pts: THREE.Vector3[] = [];
  private readonly prev: THREE.Vector3[] = [];
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  readonly mesh: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < SCARF_N; i++) {
      this.pts.push(new THREE.Vector3(-i * SCARF_SEG, 2, 0));
      this.prev.push(new THREE.Vector3(-i * SCARF_SEG, 2, 0));
    }
    this.pos = new Float32Array(SCARF_N * 2 * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const idx: number[] = [];
    for (let i = 0; i < SCARF_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, SCARF);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    scene.add(this.mesh);
  }

  update(anchor: THREE.Vector3, pose: PlayerPose, dt: number): void {
    const h = Math.min(dt, 1 / 30);
    const flutter = Math.min(1, pose.speed / 12);
    // Teleport guard (restart, huge frame): re-seat the chain behind the anchor.
    if (this.pts[0]!.distanceTo(anchor) > 5) {
      this.pts.forEach((p, i) => p.set(anchor.x - i * SCARF_SEG, anchor.y, anchor.z));
      this.prev.forEach((p, i) => p.copy(this.pts[i]!));
    }
    for (let i = 1; i < SCARF_N; i++) {
      const p = this.pts[i]!;
      const q = this.prev[i]!;
      const vx = (p.x - q.x) * 0.9;
      const vy = (p.y - q.y) * 0.9;
      const vz = (p.z - q.z) * 0.9;
      q.copy(p);
      const wave = Math.sin(pose.time * 14 - i * 0.9) * flutter;
      p.x += vx;
      p.y += vy + (-7 + wave * 7 + flutter * 3) * h * h;
      p.z += vz + Math.cos(pose.time * 11 - i * 1.3) * flutter * 5 * h * h;
    }
    this.pts[0]!.copy(anchor);
    for (let k = 0; k < 4; k++) {
      for (let i = 1; i < SCARF_N; i++) {
        const a = this.pts[i - 1]!;
        const b = this.pts[i]!;
        const d = b.clone().sub(a);
        const len = d.length() || 1e-6;
        const corr = d.multiplyScalar((len - SCARF_SEG) / len);
        if (i === 1) b.sub(corr);
        else {
          a.addScaledVector(corr, 0.5);
          b.addScaledVector(corr, -0.5);
        }
      }
      // The scarf may not pass through the car.
      for (const p of this.pts) if (p.y < pose.lift + 1.0) p.y = pose.lift + 1.0;
    }
    const upV = new THREE.Vector3();
    for (let i = 0; i < SCARF_N; i++) {
      const p = this.pts[i]!;
      const dir = (i < SCARF_N - 1 ? this.pts[i + 1]! : p).clone().sub(this.pts[Math.max(0, i - 1)]!);
      upV.set(0, 1, 0).addScaledVector(dir.normalize(), -dir.y).normalize();
      const w = 0.09 * (1 - (i / SCARF_N) * 0.3);
      this.pos.set([p.x + upV.x * w, p.y + upV.y * w, p.z + upV.z * w, p.x - upV.x * w, p.y - upV.y * w, p.z - upV.z * w], i * 6);
    }
    this.geo.attributes['position']!.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
