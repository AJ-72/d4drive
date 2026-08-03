// The rest of the game reads ONLY this shape. Nothing else may read a KeyboardEvent.
// This is what keeps mobile reachable later (BRIEF §2) without rewriting movement.

export interface InputState {
  readonly throttle: number; // -1 (brake/reverse) .. 1
  readonly steer: number; // -1 (left) .. 1 (right)
}

export interface InputSource {
  sample(): InputState;
  dispose(): void;
}

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);

export function createKeyboardInput(target: Window): InputSource {
  const held = new Set<string>();

  const onDown = (e: KeyboardEvent) => {
    if (UP.has(e.code) || DOWN.has(e.code) || LEFT.has(e.code) || RIGHT.has(e.code)) {
      e.preventDefault(); // stop arrow keys scrolling the page
    }
    held.add(e.code);
  };
  const onUp = (e: KeyboardEvent) => held.delete(e.code);
  // A tab switch mid-keypress never delivers keyup, leaving the car stuck at
  // full throttle for the rest of the session. C4 backgrounds the tab.
  const onBlur = () => held.clear();

  target.addEventListener('keydown', onDown, { passive: false });
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);

  const any = (codes: Set<string>): boolean => {
    for (const c of held) if (codes.has(c)) return true;
    return false;
  };

  return {
    sample(): InputState {
      const throttle = (any(UP) ? 1 : 0) + (any(DOWN) ? -1 : 0);
      const steer = (any(RIGHT) ? 1 : 0) + (any(LEFT) ? -1 : 0);
      return { throttle, steer };
    },
    // T13 (restart) must remove these. Without dispose, repeated restarts stack
    // handlers and the car accelerates twice as fast on run three.
    dispose(): void {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
      held.clear();
    },
  };
}
