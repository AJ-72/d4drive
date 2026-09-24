import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { cloudTexture } from './textures';
import { lerp, mulberry, smoothstep } from './units';

/**
 * Sun direction for an hour of the day. The sea lies to the west (scene -z), so the
 * sun rises over the town and sets over the water, a little ahead of the driver.
 */
export function sunDirection(hour: number, out: THREE.Vector3): THREE.Vector3 {
  const th = ((hour - 6) / 12) * Math.PI;
  return out.set(0.35, Math.sin(th), Math.cos(th)).normalize();
}

// Horizon colour keyed by sun elevation. Used for fog and for what the sea reflects.
const HORIZON: [number, THREE.Color][] = [
  [-0.35, new THREE.Color('#070b18')],
  [-0.12, new THREE.Color('#1b1d3a')],
  [-0.02, new THREE.Color('#6b4f73')],
  [0.05, new THREE.Color('#e58a5a')],
  [0.16, new THREE.Color('#f2c08f')],
  [0.4, new THREE.Color('#b9d2e6')],
  [1.0, new THREE.Color('#a9c8e8')],
];

function ramp(stops: [number, THREE.Color][], e: number, out: THREE.Color): THREE.Color {
  const first = stops[0]!;
  if (e <= first[0]) return out.copy(first[1]);
  for (let i = 1; i < stops.length; i++) {
    const [e1, c1] = stops[i]!;
    const [e0, c0] = stops[i - 1]!;
    if (e <= e1) return out.copy(c0).lerp(c1, (e - e0) / (e1 - e0));
  }
  return out.copy(stops[stops.length - 1]![1]);
}

export class Environment {
  readonly sunDir = new THREE.Vector3();
  readonly horizon = new THREE.Color();
  readonly zenith = new THREE.Color();
  readonly lightColor = new THREE.Color();
  /** 0 by day, 1 in full night. Everything that glows reads this. */
  night = 0;

  private readonly sky = new Sky();
  private readonly light: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly stars: THREE.Points;
  private readonly moon: THREE.Mesh;
  private readonly clouds: THREE.Sprite[] = [];
  private readonly cloudMat: THREE.SpriteMaterial;
  private readonly fog: THREE.FogExp2;

  constructor(scene: THREE.Scene) {
    this.sky.scale.setScalar(2500);
    const u = this.sky.material.uniforms;
    u['turbidity']!.value = 6;
    u['rayleigh']!.value = 1.6;
    u['mieCoefficient']!.value = 0.006;
    u['mieDirectionalG']!.value = 0.86;
    // The stock sky writes raw HDR, far over 1.0 across the whole halo round the sun.
    // With bloom on, that smeared over the frame and whited out every sea-facing view.
    // Keep the scattered light just under the bloom threshold (1.0) and give only the
    // sun disc headroom, so the disc glows and the sky around it does not.
    const mat = this.sky.material;
    mat.fragmentShader = mat.fragmentShader.replace(
      'vec3 texColor = ( Lin + L0 ) * 0.04 + sundiscColor + vec3( 0.0, 0.0003, 0.00075 );',
      'vec3 texColor = min( ( Lin + L0 ) * 0.02, vec3( 0.92 ) ) + min( sundiscColor * 0.002, vec3( 4.0 ) ) + vec3( 0.0, 0.0003, 0.00075 );',
    );
    if (!mat.fragmentShader.includes('vec3( 0.92 )')) throw new Error('Sky shader changed; HDR clamp not applied');
    scene.add(this.sky);

    this.fog = new THREE.FogExp2(0xffffff, 0.0026);
    scene.fog = this.fog;

    this.light = new THREE.DirectionalLight(0xffffff, 2);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    const sc = this.light.shadow.camera;
    sc.left = -70;
    sc.right = 70;
    sc.top = 70;
    sc.bottom = -70;
    sc.near = 1;
    sc.far = 400;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.04;
    scene.add(this.light, this.light.target);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a3b2a, 0.8);
    scene.add(this.hemi);

    this.stars = makeStars();
    scene.add(this.stars);

    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(28, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xf4f1e0, fog: false }),
    );
    scene.add(this.moon);

    this.cloudMat = new THREE.SpriteMaterial({
      map: cloudTexture(),
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const rnd = mulberry(21);
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(this.cloudMat);
      const w = 260 + rnd() * 320;
      s.scale.set(w, w * 0.4, 1);
      s.userData['offset'] = new THREE.Vector3(rnd() * 3200 - 1600, 180 + rnd() * 220, -1400 + rnd() * 1900);
      this.clouds.push(s);
      scene.add(s);
    }
  }

  get shadowsEnabled(): boolean {
    return this.light.castShadow;
  }

  /** 0 turns shadows off; otherwise the shadow-map edge in texels. */
  setShadowSize(size: number): void {
    this.light.castShadow = size > 0;
    if (size > 0 && this.light.shadow.mapSize.x !== size) {
      this.light.shadow.mapSize.set(size, size);
      this.light.shadow.map?.dispose();
      this.light.shadow.map = null;
    }
  }

  update(hour: number, camera: THREE.Camera, focus: THREE.Vector3, cloudCover: number): void {
    const dir = sunDirection(hour, this.sunDir);
    const e = dir.y;
    this.night = smoothstep(0.02, -0.16, e);

    const u = this.sky.material.uniforms;
    (u['sunPosition']!.value as THREE.Vector3).copy(dir);
    this.sky.position.copy(camera.position);

    ramp(HORIZON, e, this.horizon);
    this.zenith.copy(this.horizon).lerp(new THREE.Color('#0d1a3a'), 0.5 + this.night * 0.3);
    this.fog.color.copy(this.horizon);
    this.fog.density = lerp(0.0022, 0.0034, this.night);

    // One directional light: the sun by day, the moon by night. Two would cost a
    // second shadow map for a moon nobody looks at.
    const sunUp = e > -0.04;
    const warm = smoothstep(0.35, 0.02, e);
    if (sunUp) {
      this.lightColor.set('#fff3e0').lerp(new THREE.Color('#ff9a55'), warm);
      this.light.intensity = 3.2 * smoothstep(-0.04, 0.22, e) + 0.15;
      this.light.position.copy(focus).addScaledVector(dir, 200);
    } else {
      this.lightColor.set('#8ea8ff');
      this.light.intensity = 0.45 * this.night;
      this.light.position.copy(focus).addScaledVector(dir, -200);
    }
    this.light.color.copy(this.lightColor);
    this.light.target.position.copy(focus);

    this.hemi.intensity = lerp(1.0, 0.35, this.night);
    this.hemi.color.copy(this.horizon).lerp(new THREE.Color('#9ec3ff'), 0.4);
    this.hemi.groundColor.set('#4a3b2a').lerp(new THREE.Color('#10121c'), this.night);

    const starMat = this.stars.material as THREE.PointsMaterial;
    starMat.opacity = this.night;
    this.stars.visible = this.night > 0.01;
    this.stars.position.copy(camera.position);

    this.moon.position.copy(camera.position).addScaledVector(dir, -1400);
    this.moon.visible = -dir.y > -0.08;

    const cloudTint = new THREE.Color('#ffffff').lerp(new THREE.Color('#ffb48a'), warm * (1 - this.night));
    cloudTint.lerp(new THREE.Color('#2a2f48'), this.night);
    this.cloudMat.color.copy(cloudTint);
    this.cloudMat.opacity = 0.35 + cloudCover * 0.6;
    const shown = Math.round(this.clouds.length * (0.25 + cloudCover * 0.75));
    this.clouds.forEach((s, i) => {
      const off = s.userData['offset'] as THREE.Vector3;
      // Wrap along x so the sky never runs out on a 6 km drive.
      const span = 3200;
      const x = ((((off.x - camera.position.x * 0.3) % span) + span) % span) - span / 2;
      s.position.set(camera.position.x + x, off.y, off.z);
      s.visible = i < shown;
    });
  }
}

function makeStars(): THREE.Points {
  const rnd = mulberry(99);
  const pos: number[] = [];
  const col: number[] = [];
  const R = 1600;
  const push = (v: THREE.Vector3, b: number) => {
    pos.push(v.x * R, v.y * R, v.z * R);
    col.push(b, b, b * (0.9 + rnd() * 0.2));
  };
  for (let i = 0; i < 2600; i++) {
    const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 1.1 - 0.1, rnd() * 2 - 1).normalize();
    push(v, 0.4 + rnd() * 0.6);
  }
  // A faint Milky Way band: dense dim stars along a tilted great circle.
  const axis = new THREE.Vector3(0.3, 0.5, 0.8).normalize();
  const basis = new THREE.Vector3(1, 0, 0).cross(axis).normalize();
  for (let i = 0; i < 3500; i++) {
    const a = rnd() * Math.PI * 2;
    const v = basis.clone().applyAxisAngle(axis, a);
    v.addScaledVector(axis, (rnd() + rnd() - 1) * 0.12).normalize();
    if (v.y < -0.05) continue;
    push(v, 0.18 + rnd() * 0.3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.8,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  return p;
}
