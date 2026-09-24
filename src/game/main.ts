import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FIXED_DT, startLoop } from '../engine/loop';
import { createKeyboardInput, type InputState } from '../input/input';
import { SINGAPORE } from '../profiles/singapore';
import { TRIVANDRUM } from '../profiles/trivandrum';
import { validateProfile } from '../profiles/validate';
import { COAST_ROAD, laneCenterY } from '../road/road';
import { createWorld, setProfile, stepWorld, type World } from '../sim/world';
import { ACHIEVEMENTS, emptyStats, type Stats } from './achievements';
import { GameAudio } from './audio';
import { autopilot, gearbox, resolvePlayerContacts } from './drive';
import { Environment } from './environment';
import { FishField, HIGH_FISH_Y, layFish, Particles } from './fish';
import { CAMERA_MODES, DEFAULT_SETTINGS, Hud, type CameraMode, type Settings } from './hud';
import { PlayerCar } from './player3d';
import { buildScenery } from './scenery';
import { Sea } from './sea';
import { Traffic3D } from './traffic3d';
import { clamp01, kmh, lerp, m, PX_PER_M, sceneZ } from './units';

validateProfile(TRIVANDRUM);
validateProfile(SINGAPORE);
const PROFILES = [TRIVANDRUM, SINGAPORE] as const;
const ROAD = COAST_ROAD;
const ROAD_M = m(ROAD.lengthPx);

// ---------- persistence (per-browser conveniences only; every access guarded) ----------
const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`d4drive.${key}`);
      return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
    } catch {
      return fallback;
    }
  },
  getNum(key: string): number | null {
    try {
      const v = localStorage.getItem(`d4drive.${key}`);
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  },
  set(key: string, v: unknown): void {
    try {
      localStorage.setItem(`d4drive.${key}`, typeof v === 'string' ? v : JSON.stringify(v));
    } catch {
      /* private mode: progress simply isn't kept */
    }
  },
};

const settings: Settings = store.get('settings', { ...DEFAULT_SETTINGS });
const progress = store.get('progress', { stats: emptyStats(), unlocked: [] as string[] });
const stats: Stats = { ...emptyStats(), ...progress.stats, arrived: false };
const unlocked = new Set<string>(progress.unlocked);
const saveProgress = () => store.set('progress', { stats, unlocked: [...unlocked] });

// ---------- URL state (share links) ----------
const params = new URLSearchParams(location.search);
let profileIndex = Math.max(0, PROFILES.findIndex((p) => p.id === params.get('city')));
let hour = params.has('t') ? Number(params.get('t')) % 24 : 17.3;
const requestedCam: CameraMode = CAMERA_MODES.find((c) => c.id === params.get('cam'))?.id ?? 'chase';
let camMode: CameraMode = requestedCam;

// ---------- renderer ----------
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app not found');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.domElement.className = 'game';
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.45, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const env = new Environment(scene);
const sea = new Sea(scene);
const scenery = buildScenery(scene, ROAD);
const traffic = new Traffic3D(scene);
const car = new PlayerCar(scene);
const laneZ = Array.from({ length: ROAD.laneCount }, (_, i) => sceneZ(ROAD, laneCenterY(ROAD, i)));
const fish = new FishField(scene, layFish(ROAD_M, laneZ));
const particles = new Particles(scene);
const audio = new GameAudio();

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.49;
orbit.minDistance = 4;
orbit.maxDistance = 60;
orbit.enabled = false;

// ---------- game state ----------
let world: World = freshWorld();
let started = false;
let paused = false;
let runSec = 0;
let runFish = 0;
let runCrashes = 0;
let finished = false;
let lift = 0;
let vy = 0;
let rollT = -1; // barrel-roll progress 0..1 while airborne, -1 when idle
let wheelieT = 0;
let squawkT = 0;
let shake = 0;
let yaw = 0;
let lastPlayerY = world.player.y;
let hourTarget: number | null = null;
let lastBumpAt = -10;
let achCheckAt = 0;
let cineShot = 0;
let cineAt = 0;
let simTime = 0;
/** Set when the car teleports (restart), so the camera cuts instead of sweeping 6 km. */
let snapCamera = false;

function freshWorld(): World {
  const w = createWorld(ROAD, PROFILES[profileIndex]!);
  // Pre-warm so the road is already alive when the player first looks at it.
  const idle: InputState = { throttle: 0, steer: 0 };
  for (let i = 0; i < 20 / FIXED_DT; i++) stepWorld(w, idle, FIXED_DT);
  return w;
}

// ---------- HUD ----------
const hud = new Hud(
  document.body,
  {
    start(muted, city) {
      if (started) return;
      (document.activeElement as HTMLElement | null)?.blur();
      started = true;
      audio.muted = muted;
      audio.start();
      applySettings();
      if (city !== profileIndex) profileIndex = city;
      restartRun();
      hud.showGame();
      setCamera(requestedCam);
      hud.toast('🐦', "Let's go!", 'W/S throttle · A/D change lane · Space jump · F stunt');
    },
    camera: (mode) => setCamera(mode),
    setHour(h) {
      hour = h;
      hourTarget = null;
    },
    togglePause: () => togglePause(),
    screenshot: () => (screenshotPending = true),
    toggleMusic() {
      settings.music = !settings.music;
      applySettings();
      hud.toast('🎵', settings.music ? 'Music on' : 'Music off');
    },
    share() {
      const u = new URL(location.href);
      u.search = '';
      u.searchParams.set('city', PROFILES[profileIndex]!.id);
      u.searchParams.set('t', hour.toFixed(2));
      u.searchParams.set('cam', camMode);
      void navigator.clipboard?.writeText(u.toString()).then(
        () => hud.toast('🔗', 'Share link copied', 'Opens at this time of day, city and camera'),
        () => hud.toast('🔗', 'Could not copy', u.toString(), 6000),
      );
    },
    settingsChanged: () => applySettings(),
    restart(switchCity) {
      if (switchCity) profileIndex = (profileIndex + 1) % PROFILES.length;
      restartRun();
    },
  },
  settings,
  PROFILES.map((p) => p.displayName),
  profileIndex,
);
hud.setCity(PROFILES[profileIndex]!.displayName);
hud.setCamera(camMode);
hud.renderAchievements(unlocked);

function restartRun(): void {
  world = freshWorld();
  fish.reset();
  runSec = 0;
  runFish = 0;
  runCrashes = 0;
  finished = false;
  stats.arrived = false;
  lift = vy = 0;
  rollT = -1;
  lastPlayerY = world.player.y;
  snapCamera = true;
  hud.hideFinish();
  hud.setCity(PROFILES[profileIndex]!.displayName);
}

function setCamera(mode: CameraMode): void {
  camMode = mode;
  orbit.enabled = mode === 'orbit';
  if (mode === 'orbit') orbit.target.copy(car.group.position).add(new THREE.Vector3(0, 1, 0));
  cineAt = 0;
  hud.setCamera(mode);
}

function togglePause(): void {
  if (!started || finished) return;
  paused = !paused;
  hud.setPaused(paused);
  if (paused) audio.drive(850, 0, 0, simTime);
}

function applySettings(): void {
  store.set('settings', settings);
  const dpr = window.devicePixelRatio || 1;
  const ratio = [0.75, 1, Math.min(dpr, 1.5), Math.min(dpr, 2)][settings.quality]!;
  renderer.setPixelRatio(ratio);
  env.setShadowSize([0, 1024, 2048, 4096][settings.quality]!);
  bloom.enabled = settings.bloom && settings.quality > 0;
  bloom.strength = settings.bloomStrength;
  car.setHelmet(settings.helmet);
  car.setScarf(settings.scarf);
  audio.volume = settings.volume;
  audio.musicOn = settings.music;
  audio.musicVolume = settings.musicVolume;
  audio.applyLevels();
  hud.setMusic(settings.music);
  resize();
}

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- input ----------
const keyboard = createKeyboardInput(window);
const touch = { gas: false, brake: false, left: false, right: false, cruise: false };
// Tap actions fire once on press; held controls stay down until the finger lifts.
const TAP: Record<string, () => void> = {
  jump: () => void jump(),
  stunt: () => stunt(),
  horn: () => honk(),
  cruise: () => {
    touch.cruise = !touch.cruise;
    hud.setCruise(touch.cruise);
    if (started) hud.toast('⏩', touch.cruise ? 'Cruise on' : 'Cruise off', touch.cruise ? 'Gas held for you · ▼ still brakes' : '');
  },
};
for (const [id, b] of hud.touchButtons) {
  const set = (v: boolean) => {
    b.classList.toggle('held', v);
    const tap = TAP[id];
    if (tap) {
      if (v) tap();
      return;
    }
    touch[id as 'gas' | 'brake' | 'left' | 'right'] = v;
  };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    set(true);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => set(false));
  // A long press would otherwise open the browser's context menu mid-drive.
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}

function honk(): void {
  if (!started) return;
  audio.horn();
  stats.horns++;
}

function jump(): boolean {
  if (!started || paused || finished || lift > 0.001) return false;
  vy = 9.5;
  lift = 0.001;
  stats.jumps++;
  audio.jump();
  particles.emit(14, car.group.position.clone().setY(0.2), '#c9b89a', 3, -4, 2);
  return true;
}

function stunt(): void {
  if (!started || paused || finished) return;
  if (lift > 0.3 && rollT < 0) {
    rollT = 0;
  } else if (lift <= 0.001 && wheelieT <= 0) {
    wheelieT = 1.2;
    stats.stunts++;
    hud.toast('🤸', 'Look, no wings!', 'Wheelie with wings spread');
  }
}

function squawk(): void {
  squawkT = 0.6;
  stats.squawks++;
  audio.squawk();
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      jump();
      break;
    case 'KeyF':
      stunt();
      break;
    case 'KeyB':
      honk();
      break;
    case 'KeyH':
      if (started) squawk();
      break;
    case 'KeyC': {
      if (!started) break;
      const i = CAMERA_MODES.findIndex((c) => c.id === camMode);
      setCamera(CAMERA_MODES[(i + 1) % CAMERA_MODES.length]!.id);
      break;
    }
    case 'KeyN':
      hourTarget = (hourTarget ?? hour) + 3;
      hud.toast('⏩', 'Fast-forward 3 hours');
      break;
    case 'KeyP':
      togglePause();
      break;
    case 'KeyM':
      audio.muted = !audio.muted;
      audio.applyLevels();
      hud.toast(audio.muted ? '🔇' : '🔊', audio.muted ? 'Muted' : 'Sound on');
      break;
    case 'KeyT':
      if (!started || finished) break;
      // Same hot-swap as the spike: existing traffic re-reads the new profile.
      profileIndex = (profileIndex + 1) % PROFILES.length;
      setProfile(world, PROFILES[profileIndex]!);
      stats.citySwitches++;
      hud.setCity(PROFILES[profileIndex]!.displayName);
      hud.toast('🌏', `Now driving in ${PROFILES[profileIndex]!.displayName}`, 'Watch how the traffic changes');
      break;
    case 'Escape':
      if (!hud.closeDrawers() && started) togglePause();
      break;
  }
});

// Click the pelican, the car or the sea.
const ray = new THREE.Raycaster();
let downAt: { x: number; y: number } | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => (downAt = { x: e.clientX, y: e.clientY }));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || !started) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 6) return;
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.intersectObject(car.pelican, true).length) {
    squawk();
    hud.toast('🐦', 'SQUAWK!', 'The pelican has opinions');
    return;
  }
  if (ray.intersectObject(car.group, true).length) {
    audio.horn(true);
    stats.horns++;
    return;
  }
  const hit = ray.intersectObject(sea.mesh, false)[0];
  if (hit) {
    audio.splash();
    particles.emit(40, hit.point, '#bfe9ff', 7, -12, 1.5);
    hud.floatText('splash!', e.clientX, e.clientY);
  }
});

function sampleInput(): InputState & { jump: boolean } {
  const k = keyboard.sample();
  const manual = {
    // Braking always wins over cruise, so the brake button still works with it on.
    // The touch brake stops the car; it does not reverse (the sim reverses on a held -1).
    throttle: touch.brake
      ? world.player.speed > 0.5 ? -1 : 0
      : Math.max(-1, Math.min(1, k.throttle + (touch.gas || touch.cruise ? 1 : 0))),
    steer: Math.max(-1, Math.min(1, k.steer + (touch.right ? 1 : 0) - (touch.left ? 1 : 0))),
  };
  // Parked at the finish: brake to a stop, but never into reverse (the sim reverses on -1).
  if (finished) return { throttle: world.player.speed > 1 ? -1 : 0, steer: 0, jump: false };
  const auto = !started || settings.autopilot;
  if (!auto) return { ...manual, jump: false };
  const px = m(world.player.x);
  const f = fish.nextAhead(px, 90);
  const ap = autopilot(
    world,
    f ? (f.z + m(ROAD.laneCount * ROAD.laneWidthPx) / 2) * PX_PER_M : null,
    f ? (f.x - px) * PX_PER_M : 0,
    !!f && f.y >= HIGH_FISH_Y,
  );
  // Any key the player presses overrides the autopilot on that axis.
  return {
    throttle: manual.throttle !== 0 ? manual.throttle : ap.throttle,
    steer: manual.steer !== 0 ? manual.steer : ap.steer,
    jump: ap.jump,
  };
}

// ---------- fixed-step simulation ----------
function step(dt: number): void {
  if (paused) return;
  simTime += dt;
  const raw = sampleInput();
  if (raw.jump && started) jump();
  // The spike's player accelerates at ~3 g, tuned so a 2D tester reaches traffic fast.
  // Scale throttle here (not in the sim) for a car-like 0-100 km/h in about 5 s.
  const input: InputState = {
    steer: raw.steer,
    throttle: raw.throttle > 0 ? raw.throttle * 0.3 * (1 - 0.5 * clamp01(world.player.speed / 285)) : raw.throttle,
  };
  const before = world.player.x;
  stepWorld(world, input, dt);
  const p = world.player;

  // Jumps.
  if (lift > 0) {
    vy -= 24 * dt;
    lift += vy * dt;
    if (rollT >= 0) rollT = Math.min(1, rollT + dt * 2.4);
    if (lift <= 0) {
      lift = 0;
      vy = 0;
      audio.land();
      particles.emit(18, car.group.position.clone().setY(0.2), '#c9b89a', 4, -6, 2.5);
      if (rollT >= 1) {
        stats.stunts++;
        hud.toast('🌀', 'Barrel roll!', 'Stunt landed');
      } else if (rollT >= 0) {
        shake = 0.5;
        hud.toast('😵', 'Wobbly landing');
      }
      rollT = -1;
    }
  }
  wheelieT = Math.max(0, wheelieT - dt);
  squawkT = Math.max(0, squawkT - dt);

  // Contacts with traffic and pedestrians.
  const bumps = resolvePlayerContacts(world, lift > 0.6);
  if (bumps.length && simTime - lastBumpAt > 0.8 && started) {
    lastBumpAt = simTime;
    const ped = bumps.some((b) => b.kind === 'pedestrian');
    if (ped) {
      hud.toast('🚶', 'Watch out!', 'Pedestrians have right of way');
      audio.horn();
    } else {
      runCrashes++;
      stats.crashes++;
      shake = 0.6;
      audio.crash();
      particles.emit(24, car.group.position.clone().setY(1), '#ffcf7a', 6, -9, 1);
      hud.toast('💥', 'Bump!', 'Traffic here does not wait for you');
    }
  }

  traffic.sync(world, dt);

  // Heading from lateral motion, as for the traffic.
  const dxM = Math.max(m(p.speed) * dt, 1e-3);
  const target = -Math.atan2(m(p.y - lastPlayerY), dxM);
  yaw += (target - yaw) * Math.min(1, dt * 8);
  lastPlayerY = p.y;

  // Fish.
  const got = fish.update(m(p.x), sceneZ(ROAD, p.y), lift, simTime);
  for (const f of got) {
    if (!started) {
      f.taken = false;
      continue;
    }
    const n = f.golden ? 5 : 1;
    runFish += n;
    stats.fish += n;
    if (f.golden) stats.goldFish++;
    audio.pickup(f.golden);
    squawkT = 0.35;
    particles.emit(f.golden ? 50 : 22, new THREE.Vector3(f.x, f.y, f.z), f.golden ? '#ffd24a' : '#bfe9ff', 4, -3, 0.6);
    const sp = new THREE.Vector3(f.x, f.y + 0.6, f.z).project(camera);
    hud.floatText(`+${n}`, (sp.x * 0.5 + 0.5) * window.innerWidth, (-sp.y * 0.5 + 0.5) * window.innerHeight);
  }

  if (started && !finished) {
    const dist = m(p.x - before);
    stats.distanceM += Math.max(0, dist);
    if (env.night > 0.6) stats.nightDriveM += Math.max(0, dist);
    stats.topKmh = Math.max(stats.topKmh, kmh(p.speed));
    if (p.speed > 1 || runSec > 0) runSec += dt;
  }

  if (world.arrived && started && !finished) {
    finished = true;
    stats.arrived = true;
    const key = `best.${PROFILES[profileIndex]!.id}`;
    const prev = store.getNum(key);
    const newBest = prev === null || runSec < prev;
    if (newBest) store.set(key, String(runSec));
    audio.achievement();
    hud.showFinish({
      city: PROFILES[profileIndex]!.displayName,
      runSec,
      best: newBest ? runSec : prev,
      newBest: newBest && prev !== null,
      fish: runFish,
      crashes: runCrashes,
    });
  }

  if (started && simTime >= achCheckAt) {
    achCheckAt = simTime + 0.25;
    for (const a of ACHIEVEMENTS) {
      if (unlocked.has(a.id) || !a.test(stats)) continue;
      unlocked.add(a.id);
      audio.achievement();
      hud.toast(a.icon, `Achievement: ${a.title}`, a.desc, 3600);
      hud.renderAchievements(unlocked);
    }
    saveProgress();
  }
}

// ---------- per-frame rendering ----------
const focus = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const lastCarPos = new THREE.Vector3();
let lastFrame = performance.now();
let fpsAvg = 60;
let screenshotPending = false;

function updateCamera(dt: number): void {
  const pos = car.group.position;
  const k = 1 - Math.exp(-dt * 5);
  const speedK = clamp01(world.player.speed / 285);
  let fov = 55;

  if (camMode === 'orbit') {
    // Carry the orbit along with the car so the player can drive while orbiting.
    const d = pos.clone().sub(lastCarPos);
    camera.position.add(d);
    orbit.target.add(d);
    orbit.update();
  } else if (camMode === 'chase') {
    camTarget.set(pos.x - 9 - speedK * 2, pos.y + 3.4, pos.z * 0.7);
    lookTarget.set(pos.x + 10, pos.y + 1.2, pos.z * 0.85);
    fov = 55 + speedK * 12;
  } else if (camMode === 'side') {
    // On the verge, in front of the kerbside palms and lamps, looking out to sea.
    camTarget.set(pos.x + 1, 1.8 + pos.y * 0.5, pos.z + 7);
    lookTarget.set(pos.x + 2, pos.y + 1.2, pos.z);
    fov = 58;
  } else if (camMode === 'pelican') {
    const head = new THREE.Vector3(0.6, 2.55, 0.42).applyMatrix4(car.group.matrixWorld);
    camTarget.copy(head);
    lookTarget.set(head.x + 30, head.y - 1.5, head.z + Math.sin(yaw) * -20);
    fov = 72;
  } else {
    // Cinematic: a rotating set of shots, each held for a few seconds.
    cineAt -= dt;
    if (cineAt <= 0) {
      cineShot = (cineShot + 1) % 4;
      cineAt = 6;
      if (cineShot === 2) camTarget.set(pos.x + 45, 1.4, 13.5); // roadside fly-by, placed ahead
    }
    if (cineShot === 0) {
      camTarget.set(pos.x + 7, 1.1, pos.z - 4.5);
      lookTarget.set(pos.x, 1.4, pos.z);
    } else if (cineShot === 1) {
      camTarget.set(pos.x - 14, 9, pos.z + 10);
      lookTarget.set(pos.x + 8, 1, pos.z);
    } else if (cineShot === 2) {
      lookTarget.set(pos.x, 1.2, pos.z);
      fov = 40;
    } else {
      camTarget.set(pos.x - 6, 5, -42);
      lookTarget.set(pos.x + 4, 2, pos.z);
      fov = 45;
    }
  }

  if (camMode !== 'orbit') {
    const snap = snapCamera || camMode === 'pelican' || (camMode === 'cine' && cineShot === 2);
    if (snap) camera.position.copy(camTarget);
    else camera.position.lerp(camTarget, k);
    camera.lookAt(lookTarget);
  }
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * shake * 0.5;
    shake = Math.max(0, shake - dt * 1.5);
  }
  if (camMode === 'orbit' && snapCamera) {
    camera.position.set(pos.x - 10, 5, pos.z + 8);
    orbit.target.copy(pos);
  }
  snapCamera = false;
  // A tall (portrait) screen shows less road side to side; widen the view to compensate.
  if (camera.aspect < 1) fov = Math.min(95, fov / Math.sqrt(camera.aspect));
  camera.fov = lerp(camera.fov, fov, k);
  camera.updateProjectionMatrix();
  lastCarPos.copy(pos);
}

function render(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  fpsAvg = lerp(fpsAvg, 1 / Math.max(dt, 1e-3), 0.05);

  if (!paused) {
    if (hourTarget !== null) {
      const stepH = Math.min(hourTarget - hour, dt * 4);
      hour += stepH;
      if (hourTarget - hour < 1e-3) hourTarget = null;
    } else if (settings.timeFlows) {
      hour += (settings.hoursPerMin / 60) * dt;
    }
    if (hour >= 24) {
      hour -= 24;
      if (hourTarget !== null) hourTarget -= 24;
    }
  }

  const p = world.player;
  const x = m(p.x);
  const z = sceneZ(ROAD, p.y);
  const roll = rollT >= 0 ? rollT * Math.PI * 2 : 0;
  const wheelie = wheelieT > 0 ? Math.sin((wheelieT / 1.2) * Math.PI) : 0;
  car.update(
    {
      x,
      z,
      lift,
      yaw,
      speed: m(p.speed),
      wings: Math.max(wheelie, rollT >= 0 ? 1 : 0),
      squawk: squawkT > 0 ? Math.sin((squawkT / 0.6) * Math.PI) : 0,
      pitch: wheelie * 0.2 + (lift > 0 ? vy * 0.012 : 0),
      roll,
      night: env.night,
      time: simTime,
    },
    paused ? 0 : dt,
  );

  focus.set(x, 0, z);
  updateCamera(dt);
  env.update(hour, camera, focus, settings.clouds);
  (scene.fog as THREE.FogExp2).density *= settings.fog;
  sea.update(simTime, x, env, scene.fog as THREE.FogExp2, settings.waves);
  scenery.update(env.night, x, simTime);
  traffic.setNight(env.night);
  if (!paused) particles.update(dt);
  renderer.toneMappingExposure = settings.exposure * lerp(1, 1.5, env.night);
  // By day only true HDR (lamps, sun glints) should bloom; at night let more glow.
  bloom.threshold = lerp(1.0, 0.7, env.night);

  const speedKmh = kmh(p.speed);
  const gb = gearbox(speedKmh);
  const inp = keyboard.sample();
  audio.night = env.night;
  if (!paused) audio.drive(gb.rpm, started ? inp.throttle : 0.3, m(p.speed), simTime);

  if (started) {
    hud.update({ kmh: Math.abs(speedKmh), rpm: gb.rpm, gear: gb.gear, distM: Math.max(0, x - m(1700)), runSec, hour, fish: runFish, ach: unlocked.size });
    const next = fish.nextAhead(x, 60);
    const dz = next ? next.z - z : 0;
    hud.fishHint(next && !finished ? (Math.abs(dz) < 1.5 ? 0 : dz > 0 ? 1 : -1) : null, next ? next.x - x : 0);
  }
  hud.setFps(settings.fps ? fpsAvg : null);

  if (bloom.enabled) composer.render();
  else renderer.render(scene, camera);

  if (screenshotPending) {
    screenshotPending = false;
    const a = document.createElement('a');
    a.href = renderer.domElement.toDataURL('image/png');
    a.download = `d4drive-${Date.now()}.png`;
    a.click();
    hud.flash();
    hud.toast('📸', 'Screenshot saved');
  }
}

applySettings();
setCamera('cine');
hud.update({ kmh: 0, rpm: 850, gear: 1, distM: 0, runSec: 0, hour, fish: 0, ach: unlocked.size });
const stop = startLoop(step, render);

// Inspection hook for automated verification, as in the spike.
(window as unknown as { __d4: unknown }).__d4 = {
  world: () => world,
  scene,
  bloom,
  renderer,
  camera,
  state: () => ({ started, paused, finished, hour, camMode, lift, runSec, runFish, runCrashes, profile: PROFILES[profileIndex]!.id, stats, unlocked: [...unlocked] }),
  /** Advance the sim and draw one frame by hand: rAF stops while the pane is hidden. */
  frame: (seconds = 0) => {
    for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) step(FIXED_DT);
    render();
  },
  press: (code: string, down: boolean) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })),
  teardown: () => {
    stop();
    keyboard.dispose();
    audio.dispose();
  },
};
