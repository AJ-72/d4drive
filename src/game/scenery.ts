import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roadWidthPx, type Road } from '../road/road';
import { LAMP_SPACING, PROMENADE_LAMP_Z } from './sea';
import {
  bannerTexture,
  facadeTextures,
  glowTexture,
  grainTexture,
  pavingTexture,
  signTexture,
} from './textures';
import { m, mulberry } from './units';

// Cross-section, in scene metres from the road centreline (z = 0). Sea is at -z.
const SHOULDER = 2.6;
export const WALK_W = 4.4;
export const WALK_TOP = 0.2;
const CHUNK = 250; // metres per instanced batch, so off-screen scenery is culled

function paint(g: THREE.BufferGeometry, hex: string | THREE.Color): THREE.BufferGeometry {
  const c = typeof hex === 'string' ? new THREE.Color(hex) : hex;
  const n = g.attributes['position']!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Split instances into CHUNK-long batches along x so frustum culling can skip them. */
function chunked(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  matrices: THREE.Matrix4[],
  opts: { cast?: boolean; receive?: boolean; colors?: THREE.Color[] } = {},
): THREE.InstancedMesh[] {
  const groups = new Map<number, number[]>();
  matrices.forEach((mx, i) => {
    const k = Math.floor(mx.elements[12]! / CHUNK);
    const list = groups.get(k) ?? [];
    list.push(i);
    groups.set(k, list);
  });
  const out: THREE.InstancedMesh[] = [];
  for (const idx of groups.values()) {
    const im = new THREE.InstancedMesh(geo, mat, idx.length);
    idx.forEach((src, j) => {
      im.setMatrixAt(j, matrices[src]!);
      const col = opts.colors?.[src];
      if (col) im.setColorAt(j, col);
    });
    im.castShadow = opts.cast ?? false;
    im.receiveShadow = opts.receive ?? false;
    im.computeBoundingSphere();
    parent.add(im);
    out.push(im);
  }
  return out;
}

const tmpQ = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
function mat4(x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  tmpQ.setFromAxisAngle(up, rotY);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(sx, sy, sz));
}

function palmGeometry(seed: number): THREE.BufferGeometry {
  const rnd = mulberry(seed);
  const lean = 1.2 + rnd() * 1.4;
  const h = 7 + rnd() * 2.5;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.15, h * 0.35, 0),
    new THREE.Vector3(lean * 0.5, h * 0.7, 0),
    new THREE.Vector3(lean, h, 0),
  ]);
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.TubeGeometry(curve, 12, 0.19, 7, false);
  parts.push(paint(trunk, '#7b5d40'));
  const top = curve.getPoint(1);
  const leaves = 10;
  for (let i = 0; i < leaves; i++) {
    const len = 3.6 + rnd() * 1.4;
    const leaf = new THREE.PlaneGeometry(len, 1.0, 8, 2);
    const pos = leaf.attributes['position']!;
    for (let j = 0; j < pos.count; j++) {
      const x = pos.getX(j) + len / 2;
      const w = pos.getY(j);
      const taper = Math.max(0.05, 1 - x / (len * 1.05));
      const droop = 0.4 * x - (0.12 + rnd() * 0.002) * x * x;
      pos.setXYZ(j, x, droop - Math.abs(w) * 0.35, w * taper);
    }
    leaf.computeVertexNormals();
    leaf.rotateZ(0.15 + rnd() * 0.3);
    leaf.rotateY((i / leaves) * Math.PI * 2 + rnd() * 0.3);
    leaf.translate(top.x, top.y, top.z);
    const g = 0.36 + rnd() * 0.14;
    parts.push(paint(leaf, new THREE.Color().setHSL(0.3 + rnd() * 0.04, 0.55, g * 0.7)));
  }
  for (let i = 0; i < 4; i++) {
    const nut = new THREE.SphereGeometry(0.2, 6, 5);
    const a = (i / 4) * Math.PI * 2;
    nut.translate(top.x + Math.cos(a) * 0.3, top.y - 0.35, top.z + Math.sin(a) * 0.3);
    parts.push(paint(nut, '#5b4a22'));
  }
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  if (!merged) throw new Error('palm merge failed');
  return merged;
}

export interface Scenery {
  update(night: number, focusX: number, time: number): void;
}

export function buildScenery(scene: THREE.Scene, road: Road): Scenery {
  const root = new THREE.Group();
  root.name = 'scenery';
  scene.add(root);

  const L = m(road.lengthPx);
  const X0 = -250;
  const X1 = L + 400;
  const LEN = X1 - X0;
  const CX = (X0 + X1) / 2;
  const half = m(roadWidthPx(road)) / 2;
  const edge = half + SHOULDER;

  const flat = (w: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };

  // --- carriageway ---
  const asphaltTex = grainTexture(1, 120, 60);
  asphaltTex.repeat.set(LEN / 6, (half * 2) / 6);
  flat(LEN, half * 2, CX, 0.01, 0, new THREE.MeshStandardMaterial({ color: '#4a4f58', map: asphaltTex, roughness: 0.92 }));

  const gravelTex = grainTexture(2, 140, 90);
  gravelTex.repeat.set(LEN / 4, 1);
  const gravel = new THREE.MeshStandardMaterial({ color: '#7d705e', map: gravelTex, roughness: 1 });
  flat(LEN, SHOULDER, CX, 0.005, -half - SHOULDER / 2, gravel);
  flat(LEN, SHOULDER, CX, 0.005, half + SHOULDER / 2, gravel);

  const white = new THREE.MeshStandardMaterial({ color: '#e9e6dc', roughness: 0.6 });
  flat(LEN, 0.18, CX, 0.02, -half + 0.25, white);
  flat(LEN, 0.18, CX, 0.02, half - 0.25, white);

  // Dashed lane boundaries, from the same lane geometry the sim uses.
  const dashGeo = new THREE.PlaneGeometry(4.4, 0.16).rotateX(-Math.PI / 2);
  for (let lane = 0; lane < road.laneCount - 1; lane++) {
    const z = m((lane + 1) * road.laneWidthPx) - half;
    const mats: THREE.Matrix4[] = [];
    for (let x = X0; x < X1; x += 7.8) mats.push(mat4(x, 0.02, z));
    chunked(root, dashGeo, white, mats);
  }

  // Zebra crossings where pedestrians may legally cross.
  const zebraGeo = new THREE.PlaneGeometry(2.8, 0.9).rotateX(-Math.PI / 2);
  const zebra: THREE.Matrix4[] = [];
  for (const cx of road.crossingsPx) {
    for (let z = -half + 0.6; z < half - 0.4; z += 1.8) zebra.push(mat4(m(cx), 0.021, z));
  }
  chunked(root, zebraGeo, white, zebra);

  // --- pavements ---
  const paveTex = pavingTexture();
  paveTex.repeat.set(LEN / 3, WALK_W / 3);
  const paving = new THREE.MeshStandardMaterial({ color: '#d9d2c4', map: paveTex, roughness: 0.85 });
  for (const side of [-1, 1]) {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(LEN, WALK_TOP + 0.05, WALK_W), paving);
    walk.position.set(CX, WALK_TOP / 2 - 0.025, side * (edge + WALK_W / 2));
    walk.receiveShadow = true;
    root.add(walk);
  }

  // --- sea side: wall, sand ---
  const wallZ = -(edge + WALK_W);
  const stoneTex = grainTexture(4, 150, 70);
  stoneTex.repeat.set(LEN / 3, 1);
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(LEN, 1.6, 0.6),
    new THREE.MeshStandardMaterial({ color: '#8f877a', map: stoneTex, roughness: 0.95 }),
  );
  wall.position.set(CX, -0.6, wallZ - 0.3);
  wall.receiveShadow = true;
  root.add(wall);

  const sandTex = grainTexture(5, 200, 40);
  sandTex.repeat.set(LEN / 5, 14);
  const sandGeo = new THREE.PlaneGeometry(LEN, 70, 1, 14).rotateX(-Math.PI / 2);
  const sp = sandGeo.attributes['position']!;
  for (let i = 0; i < sp.count; i++) {
    const z = sp.getZ(i) + (wallZ - 0.6 - 35);
    sp.setY(i, -1.2 - Math.max(0, wallZ - 0.6 - z) / 24);
    sp.setZ(i, z);
  }
  sandGeo.computeVertexNormals();
  const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ color: '#e0c9a0', map: sandTex, roughness: 1 }));
  sand.position.x = CX;
  sand.receiveShadow = true;
  root.add(sand);

  // Railing along the promenade.
  const railMat = new THREE.MeshStandardMaterial({ color: '#eef1f2', roughness: 0.4, metalness: 0.3 });
  for (const h of [0.6, 1.05]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(LEN, 0.07, 0.07), railMat);
    rail.position.set(CX, WALK_TOP + h, wallZ + 0.25);
    rail.castShadow = true;
    root.add(rail);
  }
  const posts: THREE.Matrix4[] = [];
  for (let x = X0; x < X1; x += 2.5) posts.push(mat4(x, WALK_TOP + 0.55, wallZ + 0.25));
  chunked(root, new THREE.BoxGeometry(0.08, 1.1, 0.08), railMat, posts, { cast: true });

  // --- land side: ground and buildings ---
  const grassTex = grainTexture(6, 130, 70);
  grassTex.repeat.set(LEN / 8, 90);
  flat(LEN, 700, CX, -0.02, edge + WALK_W + 350, new THREE.MeshStandardMaterial({ color: '#6c7a45', map: grassTex, roughness: 1 }));

  const facade = facadeTextures();
  const buildingMat = new THREE.MeshStandardMaterial({
    map: facade.map,
    emissiveMap: facade.lit,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0,
    roughness: 0.85,
  });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const uv = boxGeo.attributes['uv']!;
  for (let i = 8; i < 16; i++) uv.setXY(i, 0.05, 0.05); // roof & floor faces: blank corner
  const roofGeo = new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const roofMat = new THREE.MeshStandardMaterial({ color: '#a8543a', roughness: 0.9, flatShading: true });
  const PASTEL = ['#f1d9a7', '#e9b7a1', '#b8d8c8', '#f4efe4', '#c9d6ea', '#f2c6cf', '#e8e0b0', '#d8c3a5', '#a9d3dc'];
  const bRnd = mulberry(42);
  const bMats: THREE.Matrix4[] = [];
  const bCols: THREE.Color[] = [];
  const roofs: THREE.Matrix4[] = [];
  for (let x = X0; x < X1; ) {
    const w = 8 + bRnd() * 9;
    const d = 9 + bRnd() * 7;
    const tower = bRnd() < 0.08;
    const h = tower ? 16 + bRnd() * 10 : 4.5 + bRnd() * 9;
    const cx = x + w / 2;
    const z = edge + WALK_W + 2.5 + d / 2 + bRnd() * 3;
    bMats.push(mat4(cx, 0, z, 0, w, h, d));
    bCols.push(new THREE.Color(PASTEL[Math.floor(bRnd() * PASTEL.length)]!));
    if (!tower && bRnd() < 0.55) {
      const k = 1 / Math.SQRT1_2 / 2;
      roofs.push(mat4(cx, h, z, 0, w * k * 1.08, 2 + bRnd() * 1.5, d * k * 1.08));
    }
    x += w + 1 + bRnd() * 5;
  }
  chunked(root, boxGeo, buildingMat, bMats, { cast: true, receive: true, colors: bCols });
  chunked(root, roofGeo, roofMat, roofs, { cast: true });

  // Hills far inland give the horizon a silhouette.
  const hillMat = new THREE.MeshStandardMaterial({ color: '#40573a', roughness: 1, flatShading: true });
  const hRnd = mulberry(8);
  const hills: THREE.Matrix4[] = [];
  for (let x = X0 - 400; x < X1 + 400; x += 180 + hRnd() * 160) {
    hills.push(mat4(x, -2, 520 + hRnd() * 260, hRnd() * 3, 150 + hRnd() * 160, 60 + hRnd() * 90, 120 + hRnd() * 100));
  }
  chunked(root, new THREE.ConeGeometry(1, 1, 7, 1).translate(0, 0.5, 0), hillMat, hills);

  // --- palms ---
  const palmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  const pRnd = mulberry(77);
  for (let variant = 0; variant < 3; variant++) {
    const geo = palmGeometry(100 + variant);
    const mats: THREE.Matrix4[] = [];
    for (let x = X0 + variant * 7; x < X1; x += 21 + pRnd() * 12) {
      if (pRnd() < 0.3) continue;
      // Sea side: on the promenade, leaning out over the water.
      mats.push(mat4(x, WALK_TOP, wallZ + 1.6 + pRnd(), Math.PI / 2 + (pRnd() - 0.5) * 1.2, 1, 0.9 + pRnd() * 0.3, 1));
      if (pRnd() < 0.35) {
        mats.push(mat4(x + 6, WALK_TOP, edge + WALK_W - 0.8, -Math.PI / 2 + (pRnd() - 0.5) * 1.4, 1, 0.8 + pRnd() * 0.3, 1));
      }
    }
    chunked(root, geo, palmMat, mats, { cast: true });
  }

  // --- street lamps ---
  const poleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.08, 0.13, 7, 8).translate(0, 3.5, 0),
    new THREE.BoxGeometry(0.08, 0.08, 1.6).translate(0, 6.9, 0.75),
  ]);
  const headGeo = new THREE.BoxGeometry(0.35, 0.12, 0.6).translate(0, 6.82, 1.45);
  if (!poleGeo) throw new Error('lamp merge failed');
  const poleMat = new THREE.MeshStandardMaterial({ color: '#2c3136', roughness: 0.5, metalness: 0.6 });
  const headMat = new THREE.MeshStandardMaterial({ color: '#fff4dd', emissive: '#ffb45e', emissiveIntensity: 0 });
  const lampMats: THREE.Matrix4[] = [];
  const lampHeads: THREE.Vector3[] = [];
  const landLampZ = edge + 0.6;
  for (let x = 0; x < X1; x += LAMP_SPACING) {
    lampMats.push(mat4(x, WALK_TOP, PROMENADE_LAMP_Z, 0));
    lampHeads.push(new THREE.Vector3(x, 6.75, PROMENADE_LAMP_Z + 1.45));
    const lx = x + LAMP_SPACING / 2;
    lampMats.push(mat4(lx, WALK_TOP, landLampZ, Math.PI));
    lampHeads.push(new THREE.Vector3(lx, 6.75, landLampZ - 1.45));
  }
  chunked(root, poleGeo, poleMat, lampMats, { cast: true });
  chunked(root, headGeo, headMat, lampMats);

  // Soft halos, which the bloom pass turns into glowing lamps at night.
  const haloGeo = new THREE.BufferGeometry().setFromPoints(lampHeads);
  const haloMat = new THREE.PointsMaterial({
    map: glowTexture(),
    color: '#ffb866',
    size: 3.2,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  });
  const halos = new THREE.Points(haloGeo, haloMat);
  root.add(halos);

  // A handful of real lights, re-seated each frame on the lamps nearest the player.
  // A fixed count keeps the shader from recompiling as lights come and go.
  const lampLights: THREE.PointLight[] = [];
  for (let i = 0; i < 6; i++) {
    const l = new THREE.PointLight('#ffb870', 0, 26, 1.6);
    lampLights.push(l);
    root.add(l);
  }

  // --- finish arch and kilometre signs ---
  const archMat = new THREE.MeshStandardMaterial({ color: '#d7263d', roughness: 0.5 });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), archMat);
    pillar.position.set(L, 4, side * (edge + 0.5));
    pillar.castShadow = true;
    root.add(pillar);
  }
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(edge * 2 + 1.6, 2.4),
    new THREE.MeshStandardMaterial({ map: bannerTexture('FINISH · ARRIVED'), side: THREE.DoubleSide }),
  );
  banner.rotation.y = -Math.PI / 2;
  banner.position.set(L, 7, 0);
  root.add(banner);

  const signPost = new THREE.MeshStandardMaterial({ color: '#9aa0a6', metalness: 0.5, roughness: 0.5 });
  for (let km = 1; km * 1000 < L; km++) {
    const x = km * 1000;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4), signPost);
    post.position.set(x, 1.2 + WALK_TOP, edge + 0.9);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.7),
      new THREE.MeshStandardMaterial({ map: signTexture(`${km} km`), side: THREE.DoubleSide }),
    );
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(x, 2.5 + WALK_TOP, edge + 0.9);
    root.add(post, sign);
  }

  // --- boats and gulls ---
  const boats: THREE.Group[] = [];
  const hullMat = new THREE.MeshStandardMaterial({ color: '#7a3b2a', roughness: 0.8 });
  const sailMat = new THREE.MeshStandardMaterial({ color: '#f3efe6', side: THREE.DoubleSide });
  const bR = mulberry(55);
  for (let x = 300; x < X1; x += 380 + bR() * 300) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 2.2), hullMat);
    const sailShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(3.6, 0), new THREE.Vector2(0, 7)]);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), sailMat);
    sail.position.set(-1.5, 0.6, 0);
    b.add(hull, sail);
    b.position.set(x, -1.4, -140 - bR() * 360);
    b.rotation.y = bR() * Math.PI;
    b.userData['phase'] = bR() * 10;
    boats.push(b);
    root.add(b);
  }

  const gulls: THREE.Group[] = [];
  const gullMat = new THREE.MeshStandardMaterial({ color: '#e9ecef', side: THREE.DoubleSide, roughness: 0.9 });
  const wingShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.5, 1.3), new THREE.Vector2(-0.3, 1.1)]);
  const wingGeo = new THREE.ShapeGeometry(wingShape).rotateX(Math.PI / 2);
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4).scale(2.2, 1, 1), gullMat);
    const l = new THREE.Mesh(wingGeo, gullMat);
    const r = new THREE.Mesh(wingGeo, gullMat);
    r.scale.z = -1;
    g.add(body, l, r);
    g.userData['wings'] = [l, r];
    g.userData['p'] = { a: bR() * 6.28, r: 20 + bR() * 50, h: 14 + bR() * 18, s: 0.15 + bR() * 0.2, lead: bR() * 120 - 20, z: -25 - bR() * 70 };
    gulls.push(g);
    root.add(g);
  }

  return {
    update(night, focusX, time) {
      headMat.emissiveIntensity = night * 3.5;
      buildingMat.emissiveIntensity = night * 0.6;
      haloMat.opacity = night * 0.85;

      // Seat the real lights on the lamps just ahead of the player.
      const firstSea = Math.floor((focusX - 20) / LAMP_SPACING);
      lampLights.forEach((l, i) => {
        const k = firstSea + Math.floor(i / 2);
        const idx = k * 2 + (i % 2);
        const head = lampHeads[Math.max(0, idx)];
        if (head) l.position.set(head.x, head.y - 0.3, head.z);
        l.intensity = night * 70;
      });

      for (const b of boats) {
        const ph = b.userData['phase'] as number;
        b.position.y = -1.4 + Math.sin(time * 0.9 + ph) * 0.25;
        b.rotation.z = Math.sin(time * 0.7 + ph) * 0.06;
      }
      for (const g of gulls) {
        const p = g.userData['p'] as { a: number; r: number; h: number; s: number; lead: number; z: number };
        const a = p.a + time * p.s;
        g.position.set(focusX + p.lead + Math.cos(a) * p.r, p.h + Math.sin(time * 0.5 + p.a) * 2, p.z + Math.sin(a) * p.r * 0.4);
        g.rotation.y = -a - Math.PI / 2;
        const [l, r] = g.userData['wings'] as [THREE.Mesh, THREE.Mesh];
        const flap = Math.sin(time * 6 + p.a * 3) * 0.5;
        l.rotation.x = flap;
        r.rotation.x = -flap;
      }
    },
  };
}
