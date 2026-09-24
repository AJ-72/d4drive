import { startLoop } from './engine/loop';
import { createKeyboardInput } from './input/input';
import { SINGAPORE } from './profiles/singapore';
import { TRIVANDRUM } from './profiles/trivandrum';
import { validateProfile } from './profiles/validate';
import { SPIKE_ROAD } from './road/road';
import { render, VIEW_H, VIEW_W } from './render/renderer';
import { createWorld, setProfile, stepWorld, type World } from './sim/world';

// Validated at load, not lazily: a malformed profile must fail loudly at startup
// rather than produce subtly wrong traffic that nobody notices.
validateProfile(TRIVANDRUM);
validateProfile(SINGAPORE);

const PROFILES = [TRIVANDRUM, SINGAPORE] as const;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app not found');

const canvas = document.createElement('canvas');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
app.appendChild(canvas);

const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2d context unavailable');

let profileIndex = 0;
let world: World = createWorld(SPIKE_ROAD, PROFILES[profileIndex]!);
const input = createKeyboardInput(window);

// T11: `T` swaps the active profile in place. Existing traffic re-reads it.
const onKey = (e: KeyboardEvent) => {
  if (e.code !== 'KeyT') return;
  profileIndex = (profileIndex + 1) % PROFILES.length;
  setProfile(world, PROFILES[profileIndex]!);
};
window.addEventListener('keydown', onKey);

const stop = startLoop(
  (dt) => stepWorld(world, input.sample(), dt),
  () => render(ctx, world),
);

// Inspection hook for automated verification. NOT rendered, so it does not violate
// C3's "no numeric readout on screen" — the on-screen debug overlay is T15 and is
// a separate thing that must default to off.
interface D4Debug {
  world: () => World;
  press: (code: string, down: boolean) => void;
  teardown: () => void;
}
(window as unknown as { __d4: D4Debug }).__d4 = {
  world: () => world,
  press: (code, down) =>
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })),
  teardown: () => {
    stop();
    input.dispose();
    window.removeEventListener('keydown', onKey);
    world = createWorld(SPIKE_ROAD, PROFILES[profileIndex]!);
  },
};
