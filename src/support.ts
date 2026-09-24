// Browser features the game depends on, checked before anything heavy loads.
//
// A phone whose Chrome had graphics acceleration off got a blank page: three.js
// throws while creating its WebGL2 context, the module fails to load, and nothing
// tells the player why. Required features now stop the game with a message that
// says what is missing and how to turn it on; optional ones only switch a feature
// off and say so once.

/** What the browser offers. Gathered by probeBrowser(); plain data so it can be tested. */
export interface Probe {
  webgl2: boolean;
  /** Can a WebGL2 framebuffer hold half-float colour? The bloom pass renders into one. */
  floatTargets: boolean;
  canvas2d: boolean;
  pointerEvents: boolean;
  webAudio: boolean;
  fullscreen: boolean;
  clipboard: boolean;
  storage: boolean;
  /** Android / iOS etc: shapes the "how to fix" text. */
  mobile: boolean;
}

export interface Missing {
  id: string;
  /** What the player loses, in one line. */
  what: string;
  /** How to get it back, if anything can be done. */
  fix: string;
}

export interface Assessment {
  /** Any of these: the game cannot start. */
  blocking: Missing[];
  /** The game runs without these. */
  optional: Missing[];
}

const GPU_FIX_DESKTOP =
  'In your browser settings, turn on hardware / graphics acceleration and restart the browser. ' +
  'In Chrome, chrome://gpu shows whether WebGL2 is "Hardware accelerated". Updating your graphics driver can also help.';
const GPU_FIX_MOBILE =
  'In Chrome, open Settings → System and turn on "Use graphics acceleration when available", then restart Chrome. ' +
  'chrome://gpu shows whether WebGL2 is "Hardware accelerated". Battery saver can also turn it off.';

export function assessSupport(p: Probe): Assessment {
  const blocking: Missing[] = [];
  const optional: Missing[] = [];

  if (!p.webgl2) {
    blocking.push({ id: 'webgl2', what: 'WebGL2 (3D graphics) is turned off or not supported.', fix: p.mobile ? GPU_FIX_MOBILE : GPU_FIX_DESKTOP });
  }
  if (!p.canvas2d) {
    blocking.push({ id: 'canvas2d', what: 'Canvas drawing is blocked. Every texture in the game is painted on a canvas.', fix: 'Turn off canvas-blocking privacy settings or extensions for this site.' });
  }
  if (!p.pointerEvents) {
    blocking.push({ id: 'pointer', what: 'Pointer events are not supported, so the touch and mouse controls cannot work.', fix: 'Update your browser to a current version.' });
  }

  if (p.webgl2 && !p.floatTargets) {
    optional.push({ id: 'bloom', what: 'Glow effect off', fix: 'This graphics chip cannot render the glow effect.' });
  }
  if (!p.webAudio) optional.push({ id: 'audio', what: 'No sound', fix: 'This browser has no Web Audio.' });
  if (!p.storage) optional.push({ id: 'storage', what: 'Progress is not saved', fix: 'Site storage is blocked (private mode or settings).' });
  if (!p.fullscreen) optional.push({ id: 'fullscreen', what: 'No full screen', fix: 'This browser does not allow full screen here.' });
  if (!p.clipboard) optional.push({ id: 'clipboard', what: 'Share link is shown, not copied', fix: 'This browser does not allow copying from the page.' });

  return { blocking, optional };
}

let current: Assessment = { blocking: [], optional: [] };
/** The check made at startup, for the game to read without probing again. */
export function setAssessment(a: Assessment): void {
  current = a;
}
export function getAssessment(): Assessment {
  return current;
}
/** False when the startup check found this optional feature missing. */
export const supports = (id: string): boolean => !current.optional.some((m) => m.id === id);

/** One short line for a toast, e.g. "No sound · No full screen". Empty when nothing is missing. */
export function optionalSummary(a: Assessment): string {
  return a.optional.map((m) => m.what).join(' · ');
}

export function probeBrowser(): Probe {
  let webgl2 = false;
  let floatTargets = false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl) {
      webgl2 = true;
      floatTargets = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
      // Hand the context straight back: phones allow only a few at once.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webgl2 = false;
  }

  let canvas2d = false;
  try {
    canvas2d = !!document.createElement('canvas').getContext('2d');
  } catch {
    canvas2d = false;
  }

  let storage = false;
  try {
    localStorage.setItem('d4drive.__probe', '1');
    localStorage.removeItem('d4drive.__probe');
    storage = true;
  } catch {
    storage = false;
  }

  const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
  return {
    webgl2,
    floatTargets,
    canvas2d,
    pointerEvents: typeof window.PointerEvent === 'function',
    webAudio: typeof (w.AudioContext ?? w.webkitAudioContext) === 'function',
    fullscreen: !!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function',
    clipboard: typeof navigator.clipboard?.writeText === 'function',
    storage,
    mobile: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent),
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Replace the page with a plain message. Deliberately independent of the game's
 * HUD and CSS: it must work when nothing else has loaded.
 */
export function showBlocked(items: Missing[], opts: { detail?: string; spikeLink?: boolean; intro?: string } = {}): void {
  const app = document.querySelector<HTMLElement>('#app') ?? document.body;
  const list = items
    .map((m) => `<li><b>${esc(m.what)}</b><br><span>${esc(m.fix)}</span></li>`)
    .join('');
  const spike = opts.spikeLink
    ? `<p>You can still watch the traffic in the simple 2D view: <a href="?spike">open the 2D version</a>.</p>`
    : '';
  const detail = opts.detail ? `<p class="d">Details: ${esc(opts.detail)}</p>` : '';
  app.innerHTML = `<div class="blocked" role="alert">
    <div class="logo">🐦</div>
    <h1>D4Drive cannot start</h1>
    <p>${esc(opts.intro ?? 'This browser is missing something the game needs:')}</p>
    <ul>${list}</ul>
    ${spike}${detail}
    <button type="button" onclick="location.reload()">Try again</button>
  </div>`;
  const style = document.createElement('style');
  style.textContent = `
    .blocked { box-sizing: border-box; max-width: 460px; margin: 24px 16px; padding: 22px 20px; border-radius: 16px;
      background: #1d2028; color: #f4f1ea; font: 15px/1.5 system-ui, sans-serif; box-shadow: 0 8px 30px rgba(0,0,0,.4); }
    .blocked .logo { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; font-size: 24px;
      background: linear-gradient(135deg, #ff5a4e, #ffb347); }
    .blocked h1 { font-size: 22px; margin: 12px 0 4px; }
    .blocked ul { padding-left: 18px; }
    .blocked li { margin: 10px 0; }
    .blocked li span { color: rgba(244,241,234,.7); font-size: 14px; }
    .blocked a { color: #ffb347; }
    .blocked .d { font-size: 12px; color: rgba(244,241,234,.5); word-break: break-word; }
    .blocked button { margin-top: 6px; padding: 10px 20px; border: 0; border-radius: 12px; font: inherit; font-weight: 700;
      background: linear-gradient(135deg, #ffb347, #ff7a45); color: #2b1606; }`;
  document.head.append(style);
}
