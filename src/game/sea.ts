import * as THREE from 'three';
import type { Environment } from './environment';

// Gerstner-wave sea. Waves are evaluated in WORLD space, so the mesh can slide
// along with the player without the water appearing to move with it.

export const SEA_LEVEL = -1.6;
/** Scene z where the sand meets the water at rest. Foam gathers here. */
export const SHORELINE_Z = -26.2;
/** Street lamps on the promenade, which the sea reflects at night. */
export const PROMENADE_LAMP_Z = -12.2;
export const LAMP_SPACING = 30;

const GRID = 5; // metres per vertex; the mesh snaps to this so vertices never swim

const vertex = /* glsl */ `
uniform float uTime;
uniform float uAmp;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vFogDepth;

void wave(vec4 w, vec2 p, inout vec3 disp, inout vec3 tangent, inout vec3 binormal) {
  float steep = w.z * uAmp;
  float k = 6.2831853 / w.w;
  float c = sqrt(9.8 / k);
  vec2 d = normalize(w.xy);
  float f = k * (dot(d, p) - c * uTime);
  float a = steep / k;
  float s = sin(f);
  float co = cos(f);
  tangent += vec3(-d.x * d.x * steep * s, d.x * steep * co, -d.x * d.y * steep * s);
  binormal += vec3(-d.x * d.y * steep * s, d.y * steep * co, -d.y * d.y * steep * s);
  disp += vec3(d.x * a * co, a * s, d.y * a * co);
}

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec2 p = world.xz;
  vec3 disp = vec3(0.0);
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  // Swell rolls in toward the shore (+z), with a little cross-chop.
  wave(vec4(0.15, 1.0, 0.16, 22.0), p, disp, tangent, binormal);
  wave(vec4(-0.35, 1.0, 0.14, 13.0), p, disp, tangent, binormal);
  wave(vec4(0.55, 1.0, 0.12, 7.5), p, disp, tangent, binormal);
  wave(vec4(-0.1, 1.0, 0.09, 4.2), p, disp, tangent, binormal);
  world.xyz += disp;
  vCrest = disp.y / max(uAmp, 0.05);
  vNormal = normalize(cross(binormal, tangent));
  vWorld = world.xyz;
  vec4 mv = viewMatrix * world;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uShore;
uniform float uLampZ;
uniform float uLampSpacing;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vFogDepth;

void main() {
  vec2 p = vWorld.xz;
  // Detail normal: two layers of scrolling ripples on top of the swell.
  vec3 n = normalize(vNormal);
  vec2 rip = vec2(
    sin(p.x * 1.7 + uTime * 1.3) + sin(p.y * 2.3 - uTime * 1.1 + p.x * 0.6),
    cos(p.y * 1.9 + uTime * 0.9) + cos(p.x * 2.9 - uTime * 1.7 - p.y * 0.4)
  );
  rip += 0.5 * vec2(sin(p.x * 5.1 - uTime * 2.3), cos(p.y * 4.7 + uTime * 2.1));
  n = normalize(n + vec3(rip.x, 0.0, rip.y) * 0.045);

  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = max(dot(n, V), 0.0);
  // Capped below 1: at road height nearly every view of the sea is grazing, and a
  // perfect mirror there reads as a bright strip of sky, not as water.
  float fres = 0.03 + 0.62 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uHorizon, uZenith, clamp(R.y * 1.6, 0.0, 1.0));

  vec3 water = mix(uDeep, uShallow, clamp(vCrest * 0.6 + 0.35, 0.0, 1.0));
  // Light through the crests when looking toward the sun.
  float sss = pow(max(dot(V, -uSunDir), 0.0), 3.0) * clamp(vCrest + 0.3, 0.0, 1.5);
  water += uShallow * sss * 0.5 * (1.0 - uNight);
  water *= mix(1.0, 0.25, uNight);

  vec3 col = mix(water, sky, fres);

  float rs = max(dot(R, uSunDir), 0.0);
  col += uSunColor * (pow(rs, 400.0) * 8.0 + pow(rs, 60.0) * 0.35);

  // Street-lamp reflections: a warm glint toward the nearest promenade lamp.
  float lx = floor(vWorld.x / uLampSpacing + 0.5) * uLampSpacing;
  vec3 L = normalize(vec3(lx, 6.8, uLampZ) - vWorld);
  float lamp = pow(max(dot(R, L), 0.0), 90.0);
  col += vec3(1.0, 0.62, 0.28) * lamp * uNight * 2.2;

  // Whitecaps on the crests, and surf where the waves reach the sand.
  float crestFoam = smoothstep(0.55, 1.1, vCrest) * (0.5 + 0.5 * sin(p.x * 3.1 + p.y * 2.3 + uTime));
  float shore = smoothstep(uShore - 7.0, uShore + 0.5, vWorld.z);
  float surf = shore * (0.55 + 0.45 * sin(p.x * 0.9 + uTime * 1.8 + vCrest * 3.0));
  float foam = clamp(crestFoam * 0.45 + surf, 0.0, 1.0);
  vec3 foamCol = mix(vec3(0.92, 0.95, 0.97), uHorizon, 0.25) * mix(1.0, 0.18, uNight);
  col = mix(col, foamCol, foam);

  float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Sea {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    const g = new THREE.PlaneGeometry(1600, 900, 1600 / GRID, 900 / GRID);
    g.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 1 },
        uNight: { value: 0 },
        uSunDir: { value: new THREE.Vector3() },
        uSunColor: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uZenith: { value: new THREE.Color() },
        uDeep: { value: new THREE.Color('#0e4f63') },
        uShallow: { value: new THREE.Color('#35b8ac') },
        uFogColor: { value: new THREE.Color() },
        uFogDensity: { value: 0.003 },
        uShore: { value: SHORELINE_Z },
        uLampZ: { value: PROMENADE_LAMP_Z },
        uLampSpacing: { value: LAMP_SPACING },
      },
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.position.set(0, SEA_LEVEL, -20 - 450);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sea';
    scene.add(this.mesh);
  }

  update(time: number, focusX: number, env: Environment, fog: THREE.FogExp2, waveHeight: number): void {
    this.mesh.position.x = Math.round(focusX / GRID) * GRID;
    const u = this.mat.uniforms;
    u['uTime']!.value = time;
    u['uAmp']!.value = waveHeight;
    u['uNight']!.value = env.night;
    (u['uSunDir']!.value as THREE.Vector3).copy(env.sunDir).multiplyScalar(env.sunDir.y > -0.04 ? 1 : -1);
    (u['uSunColor']!.value as THREE.Color).copy(env.lightColor);
    (u['uHorizon']!.value as THREE.Color).copy(env.horizon);
    (u['uZenith']!.value as THREE.Color).copy(env.zenith);
    (u['uFogColor']!.value as THREE.Color).copy(fog.color);
    u['uFogDensity']!.value = fog.density;
  }
}
