import { startLoop } from './engine/loop';
import { createKeyboardInput } from './input/input';
import { SINGAPORE } from './profiles/singapore';
import { TRIVANDRUM } from './profiles/trivandrum';
import { validateProfile } from './profiles/validate';
import { SPIKE_ROAD } from './road/road';
import { render, VIEW_H, VIEW_W } from './render/renderer';
import { createPlayer, updatePlayer, type Player } from './sim/player';

// Validated at load, not lazily: a malformed profile must fail loudly at startup
// rather than produce subtly wrong traffic that nobody notices.
validateProfile(TRIVANDRUM);
validateProfile(SINGAPORE);

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app not found');

const canvas = document.createElement('canvas');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
app.appendChild(canvas);

const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2d context unavailable');

const road = SPIKE_ROAD;
const input = createKeyboardInput(window);
let player: Player = createPlayer(road);

const stop = startLoop(
  (dt) => {
    updatePlayer(player, input.sample(), road, dt);
  },
  () => {
    render(ctx, road, player);
  },
);

// Inspection hook for automated verification. NOT rendered, so it does not violate
// C3's "no numeric readout on screen" — the on-screen debug overlay is T15 and is
// a separate thing that must default to off.
interface D4Debug {
  player: () => Player;
  road: typeof road;
  press: (code: string, down: boolean) => void;
  teardown: () => void;
}
(window as unknown as { __d4: D4Debug }).__d4 = {
  player: () => player,
  road,
  press: (code, down) =>
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })),
  teardown: () => {
    stop();
    input.dispose();
    player = createPlayer(road);
  },
};
