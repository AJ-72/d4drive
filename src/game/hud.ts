import './hud.css';
import { supports } from '../support';
import { ACHIEVEMENTS } from './achievements';

export const CAMERA_MODES = [
  { id: 'orbit', label: 'Free orbit' },
  { id: 'chase', label: 'Chase' },
  { id: 'side', label: 'Side track' },
  { id: 'cine', label: 'Cinematic' },
  { id: 'pelican', label: 'Pelican view' },
] as const;
export type CameraMode = (typeof CAMERA_MODES)[number]['id'];

export interface Settings {
  autopilot: boolean;
  timeFlows: boolean;
  hoursPerMin: number;
  clouds: number;
  waves: number;
  fog: number;
  quality: 0 | 1 | 2 | 3;
  bloom: boolean;
  bloomStrength: number;
  exposure: number;
  fps: boolean;
  helmet: boolean;
  scarf: boolean;
  volume: number;
  music: boolean;
  musicVolume: number;
}

export const DEFAULT_SETTINGS: Settings = {
  autopilot: false,
  timeFlows: true,
  hoursPerMin: 0.5,
  clouds: 0.45,
  waves: 1,
  fog: 1,
  quality: 2,
  bloom: true,
  bloomStrength: 0.55,
  exposure: 1,
  fps: false,
  helmet: true,
  scarf: true,
  volume: 0.8,
  music: true,
  musicVolume: 0.5,
};

export const QUALITY_NAMES = ['Smooth', 'Balanced', 'Pretty', 'Ultra'] as const;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const INTRO_ART = `
<svg class="intro-art" viewBox="0 0 300 170" aria-hidden="true">
  <line class="road" x1="0" y1="160" x2="300" y2="160" stroke="rgba(255,255,255,0.5)" stroke-width="3"/>
  <g class="bob">
    <path d="M40 128 Q44 104 80 102 L112 100 Q128 80 168 82 L190 100 L246 104 Q266 108 264 130 Z" fill="#e0312b"/>
    <path d="M150 84 L176 72" stroke="#9fd3e6" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="128" cy="78" rx="30" ry="24" fill="#f6f3ec"/>
    <path d="M140 62 C 158 44, 136 28, 152 14" stroke="#f6f3ec" stroke-width="13" fill="none" stroke-linecap="round"/>
    <circle cx="154" cy="16" r="12" fill="#f6f3ec"/>
    <path d="M143 12 A 12 12 0 0 1 166 10 Z" fill="#ff5a4e"/>
    <path d="M162 16 L236 30 L164 26 Z" fill="#f7c25c"/>
    <path d="M164 26 Q200 50 232 32 L236 30 Z" fill="#f5a45a"/>
    <circle cx="157" cy="15" r="2.4" fill="#1a0c08"/>
    <path d="M140 58 C 110 50, 88 66, 58 56" stroke="#d7263d" stroke-width="7" fill="none" stroke-linecap="round"/>
  </g>
  <g class="wheel"><circle cx="86" cy="132" r="22" fill="#1a1a1c"/><circle cx="86" cy="132" r="10" fill="#dfe3e6"/><path d="M86 122 V142 M76 132 H96" stroke="#9aa" stroke-width="2"/></g>
  <g class="wheel"><circle cx="222" cy="132" r="22" fill="#1a1a1c"/><circle cx="222" cy="132" r="10" fill="#dfe3e6"/><path d="M222 122 V142 M212 132 H232" stroke="#9aa" stroke-width="2"/></g>
</svg>`;

export interface HudCallbacks {
  start(muted: boolean, city: number): void;
  camera(mode: CameraMode): void;
  setHour(h: number): void;
  togglePause(): void;
  /** The menu opened (pause) or closed (resume). */
  menu(open: boolean): void;
  screenshot(): void;
  toggleMusic(): void;
  share(): void;
  settingsChanged(s: Settings): void;
  restart(switchCity: boolean): void;
}

export class Hud {
  readonly root = el('div', 'd4');
  private readonly hud = el('div', '');
  private readonly cityLabel = el('span', 'city-chip');
  private readonly camButtons = new Map<CameraMode, HTMLButtonElement>();
  private readonly camBtn = el('button');
  private camMode: CameraMode = 'chase';
  private readonly speedTop = el('b');
  private readonly moreBtn = el('button');
  private readonly menu = el('aside', 'menu glass');
  private readonly menuStats = el('div', 'menu-stats');
  private readonly toasts = el('div', 'toasts');
  private readonly hint = el('div', 'hint glass');
  private readonly speedNum = el('b');
  private readonly ringVal: SVGCircleElement;
  private readonly stat: Record<string, HTMLElement> = {};
  private readonly fishNum = el('div', 'fishcount', '0');
  private readonly achNum = el('b');
  private readonly clock = el('span', 'clock');
  private readonly slider = el('input');
  private readonly intro = el('section', 'overlay');
  private readonly pause = el('section', 'overlay');
  private readonly finish = el('section', 'overlay');
  private readonly settingsDrawer = el('aside', 'drawer glass');
  private readonly helpDrawer = el('aside', 'drawer glass');
  private readonly achDrawer = el('aside', 'drawer glass');
  private readonly fps = el('div', 'fps glass');
  private readonly flashEl = el('div', 'flash');
  /** Oncoming high-beam dazzle, drawn over the whole view. */
  private readonly glareEl = el('div', 'glare');
  private musicBtn!: HTMLButtonElement;
  private sliderHeld = false;
  private introCity = 0;
  readonly touchButtons = new Map<string, HTMLButtonElement>();

  constructor(
    host: HTMLElement,
    private readonly cb: HudCallbacks,
    private settings: Settings,
    cityNames: readonly string[],
    initialCity = 0,
  ) {
    this.introCity = initialCity;
    this.hud.id = 'hud';
    this.hud.classList.add('off');
    this.root.append(this.glareEl, this.hud, this.menu, this.intro, this.pause, this.finish, this.settingsDrawer, this.helpDrawer, this.achDrawer, this.fps, this.flashEl);
    host.appendChild(this.root);

    // --- top bar: only what a driver needs at a glance ---
    // Everything else lives in the menu, which pauses the game while it is open.
    const top = el('div', 'topbar');
    const menuBtn = el('button', 'ico-btn glass', '☰');
    menuBtn.setAttribute('aria-label', 'Menu (pauses)');
    menuBtn.title = 'Menu (pauses)';
    menuBtn.onclick = () => this.setMenu(this.menu.hidden);
    this.camBtn.className = 'cam-btn glass';
    this.camBtn.title = 'Change camera (C)';
    this.camBtn.onclick = () => {
      const i = CAMERA_MODES.findIndex((c) => c.id === this.camMode);
      cb.camera(CAMERA_MODES[(i + 1) % CAMERA_MODES.length]!.id);
    };
    const speed = el('div', 'speed-top');
    speed.append(this.speedTop, el('small', '', 'km/h'));
    const fish = el('button', 'fish-chip glass');
    fish.title = 'Fish caught';
    fish.append(el('span', '', '🐟'), this.fishNum);
    fish.onclick = () => this.setMenu(true);
    top.append(menuBtn, this.camBtn, speed, fish);

    // --- menu: cameras, time of day, tools, achievements, trip stats ---
    this.buildMenu();

    // --- bottom-left gauge (big screens only) ---
    const gauge = el('div', 'gauge glass');
    const R = 46;
    const C = 2 * Math.PI * R;
    const ring = el('div', 'ring');
    ring.innerHTML = `<svg viewBox="0 0 108 108"><defs><linearGradient id="speedGrad" x1="0" x2="1"><stop offset="0" stop-color="#3fd0c9"/><stop offset="0.6" stop-color="#ffb347"/><stop offset="1" stop-color="#ff5a4e"/></linearGradient></defs>
      <circle class="track" cx="54" cy="54" r="${R}" fill="none" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C * 0.75} ${C}"/>
      <circle class="val" cx="54" cy="54" r="${R}" fill="none" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C * 0.75} ${C}" stroke-dashoffset="${C * 0.75}"/></svg>`;
    this.ringVal = ring.querySelector('.val') as SVGCircleElement;
    this.ringVal.dataset['c'] = String(C * 0.75);
    const num = el('div', 'num');
    const inner = el('div');
    inner.append(this.speedNum, el('small', '', 'KM/H'));
    num.append(inner);
    ring.append(num);
    const stats = el('div', 'stats');
    for (const [k, label] of [['rpm', 'RPM'], ['gear', 'Gear'], ['dist', 'Distance'], ['time', 'Time']]) {
      const v = el('b');
      this.stat[k!] = v;
      stats.append(el('span', '', label), v);
    }
    gauge.append(ring, stats);

    // --- touch controls (shown on coarse pointers only) ---
    // Four big pads: steer on the left thumb, brake and gas on the right. The rarer
    // actions sit behind one "+" button, so they cannot be hit by accident.
    const touch = el('div', 'touch');
    const pad = (id: string, icon: string, label: string, name: string) => {
      const b = el('button', `pad t-${id}`, `<span class="i">${icon}</span><small>${label}</small>`);
      b.setAttribute('aria-label', name);
      this.touchButtons.set(id, b);
      return b;
    };
    const leftPads = el('div', 'pads');
    leftPads.append(pad('left', '◀', 'Left', 'Steer left'), pad('right', '▶', 'Right', 'Steer right'));
    const rightSide = el('div', 'right-side');
    const extras = el('div', 'extras-row glass');
    extras.hidden = true;
    for (const [id, icon, label, name] of [
      ['cruise', '⏩', 'Cruise', 'Cruise (hold the gas)'],
      ['flash', '💡', 'Lights', 'Flash headlights'],
      ['horn', '📯', 'Horn', 'Horn'],
      ['jump', '⤒', 'Jump', 'Jump'],
      ['stunt', '★', 'Stunt', 'Stunt'],
    ] as const) {
      const b = el('button', `extra t-${id}`, `<span class="i">${icon}</span><small>${label}</small>`);
      b.setAttribute('aria-label', name);
      this.touchButtons.set(id, b);
      // Close the row once the action has fired (the game acts on pointerdown).
      b.addEventListener('pointerup', () => window.setTimeout(() => (extras.hidden = true), 120));
      extras.append(b);
    }
    this.moreBtn.className = 'more glass';
    this.moreBtn.innerHTML = '＋';
    this.moreBtn.setAttribute('aria-label', 'More: cruise, lights, horn, jump, stunt');
    this.moreBtn.onclick = () => (extras.hidden = !extras.hidden);
    const rightPads = el('div', 'pads');
    rightPads.append(pad('brake', '▼', 'Brake', 'Brake'), pad('gas', '▲', 'Gas', 'Accelerate'));
    rightSide.append(extras, this.moreBtn, rightPads);
    touch.append(leftPads, rightSide);

    this.hint.innerHTML = '🐟 Fish ahead <span class="arr">➜</span>';
    this.hud.append(top, this.toasts, this.hint, gauge, touch);

    this.buildIntro(cityNames);
    this.buildPause();
    this.buildSettings();
    this.buildHelp();
    this.fps.hidden = !settings.fps;
    this.settingsDrawer.hidden = true;
    this.helpDrawer.hidden = true;
    this.achDrawer.hidden = true;
    this.pause.hidden = true;
    this.finish.hidden = true;
    this.menu.hidden = true;
  }

  private buildMenu(): void {
    const m = this.menu;
    const head = el('div', 'menu-head');
    const title = el('div');
    title.append(el('b', '', 'Paused'), this.cityLabel);
    const resume = el('button', 'btn-primary', 'Drive ▶');
    resume.onclick = () => this.setMenu(false);
    head.append(title, resume);
    m.append(head);

    m.append(el('h4', '', 'Camera'));
    const cams = el('div', 'menu-cams');
    for (const c of CAMERA_MODES) {
      const b = el('button', '', c.label);
      b.onclick = () => this.cb.camera(c.id);
      this.camButtons.set(c.id, b);
      cams.append(b);
    }
    m.append(cams);

    m.append(el('h4', '', 'Time of day'));
    const time = el('div', 'menu-time');
    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.max = '24';
    this.slider.step = '0.05';
    this.slider.setAttribute('aria-label', 'Time of day');
    this.slider.oninput = () => this.cb.setHour(Number(this.slider.value));
    this.slider.onpointerdown = () => (this.sliderHeld = true);
    this.slider.onpointerup = () => (this.sliderHeld = false);
    time.append(el('span', '', '☀️'), this.slider, this.clock);
    m.append(time);

    m.append(el('h4', '', 'This drive'));
    m.append(this.menuStats);

    const grid = el('div', 'menu-tools');
    const tool = (icon: string, label: string, fn: () => void) => {
      const b = el('button', '', `<span>${icon}</span><small>${label}</small>`);
      b.onclick = fn;
      grid.append(b);
      return b;
    };
    // Tools that open a panel close the menu (and so resume) first: the panels
    // sit where the menu is.
    const thenOpen = (d: HTMLElement) => () => {
      this.setMenu(false);
      this.toggleDrawer(d);
    };
    tool('🏆', 'Achievements', thenOpen(this.achDrawer)).append(this.achNum);
    tool('⚙️', 'Settings', thenOpen(this.settingsDrawer));
    tool('？', 'Help', thenOpen(this.helpDrawer));
    this.musicBtn = tool('🎵', 'Music', () => this.cb.toggleMusic());
    tool('📸', 'Photo', () => {
      this.setMenu(false);
      this.cb.screenshot();
    });
    tool('🔗', 'Share', () => this.cb.share());
    if (supports('fullscreen')) {
      tool('⛶', 'Full screen', () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
      });
    }
    m.append(grid);
  }

  /** Open or close the menu. The game pauses while it is open. */
  setMenu(open: boolean): void {
    if (this.menu.hidden === !open) return;
    this.menu.hidden = !open;
    if (open) for (const x of [this.settingsDrawer, this.helpDrawer, this.achDrawer]) x.hidden = true;
    this.cb.menu(open);
  }

  get menuOpen(): boolean {
    return !this.menu.hidden;
  }

  private toggleDrawer(d: HTMLElement): void {
    const open = d.hidden;
    for (const x of [this.settingsDrawer, this.helpDrawer, this.achDrawer]) x.hidden = true;
    d.hidden = !open;
  }

  closeDrawers(): boolean {
    const any = [this.settingsDrawer, this.helpDrawer, this.achDrawer].some((d) => !d.hidden) || this.menuOpen;
    for (const x of [this.settingsDrawer, this.helpDrawer, this.achDrawer]) x.hidden = true;
    this.setMenu(false);
    return any;
  }

  private buildIntro(cityNames: readonly string[]): void {
    const card = el('div', 'card glass');
    card.innerHTML = `${INTRO_ART}<h1>D4Drive</h1>
      <p class="sub">A pelican in a red helmet and scarf drives a convertible along the sea front,<br>
      through real traffic culture — catching fish on the way. Dusk, stars, waves and street lamps,<br>
      all generated live. No image files.</p>`;
    const chips = el('div', 'chips');
    for (const c of ['Procedural models', 'Traffic-culture AI', 'Verlet scarf', 'Gerstner waves', 'Day/night cycle', 'Synth audio + generative music', 'Fish-catching']) {
      chips.append(el('span', 'chip', c));
    }
    const pick = el('div', 'city-pick');
    const btns: HTMLButtonElement[] = [];
    cityNames.forEach((n, i) => {
      const b = el('button', i === this.introCity ? 'on' : '', n);
      b.onclick = () => {
        this.introCity = i;
        btns.forEach((x, j) => x.classList.toggle('on', j === i));
      };
      btns.push(b);
      pick.append(b);
    });
    const cta = el('div', 'cta');
    const go = el('button', 'btn-primary', 'Start driving ▶');
    const mute = el('button', 'btn-ghost', 'Start muted');
    go.onclick = () => this.cb.start(false, this.introCity);
    mute.onclick = () => this.cb.start(true, this.introCity);
    cta.append(go, mute);
    const keys = el('div', 'keys', KEYS_HTML);
    card.append(chips, pick, cta, keys, el('div', 'touch-help', TOUCH_HTML));
    this.intro.append(card);
  }

  private buildPause(): void {
    const card = el('div', 'card glass');
    card.innerHTML = '<h1>Paused</h1><p class="sub">Press <kbd>P</kbd> to toggle</p>';
    const b = el('button', 'btn-primary', 'Keep driving ▶');
    b.onclick = () => this.cb.togglePause();
    card.append(b);
    this.pause.append(card);
  }

  private buildHelp(): void {
    this.helpDrawer.innerHTML = `<h3>How to play</h3><div class="touch-help" style="text-align:left">${TOUCH_HTML}</div><div class="keys" style="display:block;text-align:left">${KEYS_HTML}</div>
      <p style="font-size:12.5px;color:var(--muted);line-height:1.5">Drive the 6 km sea front to the finish arch. Traffic follows the
      city's driving culture — press <kbd>T</kbd> to feel the difference. Bumping into traffic slows you down. Click the pelican or
      the sea for a surprise.</p>`;
  }

  private buildSettings(): void {
    const d = this.settingsDrawer;
    const s = this.settings;
    const head = el('h3', '', '⚙️ Settings');
    const x = el('button', 'x', '×');
    x.onclick = () => (d.hidden = true);
    head.append(x);
    d.append(head);
    const section = (t: string) => d.append(el('h4', '', t));
    const check = (label: string, key: keyof Settings) => {
      const l = el('label', '', label);
      const i = el('input');
      i.type = 'checkbox';
      i.checked = s[key] as boolean;
      i.onchange = () => {
        (s[key] as boolean) = i.checked;
        this.cb.settingsChanged(s);
      };
      l.append(i);
      d.append(l);
    };
    const range = (label: string, key: keyof Settings, min: number, max: number, step: number) => {
      const l = el('label', '', label);
      const i = el('input');
      i.type = 'range';
      i.min = String(min);
      i.max = String(max);
      i.step = String(step);
      i.value = String(s[key]);
      i.oninput = () => {
        (s[key] as number) = Number(i.value);
        this.cb.settingsChanged(s);
      };
      l.append(i);
      d.append(l);
    };
    section('Driving');
    check('Autopilot (chases fish)', 'autopilot');
    section('Time & weather');
    check('Time flows', 'timeFlows');
    range('Speed (hours / min)', 'hoursPerMin', 0.1, 6, 0.1);
    range('Cloud cover', 'clouds', 0, 1, 0.05);
    range('Wave height', 'waves', 0, 2, 0.05);
    range('Haze', 'fog', 0, 2.5, 0.05);
    section('Graphics');
    const ql = el('label', '', 'Quality');
    const sel = el('select');
    QUALITY_NAMES.forEach((n, i) => sel.append(new Option(n, String(i), false, i === s.quality)));
    sel.onchange = () => {
      s.quality = Number(sel.value) as Settings['quality'];
      this.cb.settingsChanged(s);
    };
    ql.append(sel);
    d.append(ql);
    check('Bloom', 'bloom');
    range('Bloom strength', 'bloomStrength', 0, 1.5, 0.05);
    range('Exposure', 'exposure', 0.4, 1.8, 0.05);
    check('Show FPS', 'fps');
    section('Pelican');
    check('Helmet', 'helmet');
    check('Scarf', 'scarf');
    section('Sound');
    range('Master volume', 'volume', 0, 1, 0.05);
    check('Generative music', 'music');
    range('Music volume', 'musicVolume', 0, 1, 0.05);
  }

  showGame(): void {
    this.intro.classList.add('fade');
    window.setTimeout(() => (this.intro.hidden = true), 600);
    this.hud.classList.remove('off');
  }

  setCity(name: string): void {
    this.cityLabel.textContent = name;
  }

  setCamera(mode: CameraMode): void {
    this.camMode = mode;
    for (const [id, b] of this.camButtons) b.classList.toggle('on', id === mode);
    this.camBtn.innerHTML = `🎥 <span>${CAMERA_MODES.find((c) => c.id === mode)!.label}</span>`;
  }

  setCruise(on: boolean): void {
    this.touchButtons.get('cruise')?.classList.toggle('on', on);
    // The extras row is usually closed: show cruise on the "+" as well.
    this.moreBtn.classList.toggle('on', on);
    this.moreBtn.innerHTML = on ? '⏩' : '＋';
  }

  setMusic(on: boolean): void {
    this.musicBtn.classList.toggle('dim', !on);
  }

  setPaused(p: boolean): void {
    this.pause.hidden = !p;
  }

  update(d: { kmh: number; rpm: number; gear: number; distM: number; runSec: number; hour: number; fish: number; ach: number }): void {
    this.speedNum.textContent = String(Math.round(d.kmh));
    this.speedTop.textContent = String(Math.round(d.kmh));
    const c = Number(this.ringVal.dataset['c']);
    this.ringVal.setAttribute('stroke-dashoffset', String(c * (1 - Math.min(1, d.kmh / 150))));
    this.stat['rpm']!.textContent = `${Math.round(d.rpm / 10) * 10}`;
    this.stat['gear']!.textContent = `${d.gear}/6`;
    this.stat['dist']!.textContent = `${(d.distM / 1000).toFixed(2)} km`;
    this.stat['time']!.textContent = fmtTime(d.runSec);
    this.fishNum.textContent = String(d.fish);
    this.achNum.textContent = `${d.ach}/${ACHIEVEMENTS.length}`;
    this.clock.textContent = fmtClock(d.hour);
    if (this.menuOpen) {
      this.menuStats.innerHTML =
        `<div><b>${(d.distM / 1000).toFixed(2)} km</b><span>Distance</span></div>` +
        `<div><b>${fmtTime(d.runSec)}</b><span>Time</span></div>` +
        `<div><b>${d.fish}</b><span>Fish</span></div>`;
    }
    if (!this.sliderHeld) this.slider.value = String(d.hour);
  }

  fishHint(dir: -1 | 0 | 1 | null, metres: number): void {
    this.hint.classList.toggle('show', dir !== null);
    if (dir === null) return;
    const arr = this.hint.querySelector('.arr') as HTMLElement;
    arr.style.transform = `rotate(${dir * 45}deg)`;
    this.hint.firstChild!.textContent = `🐟 Fish ahead · ${Math.round(metres)} m `;
  }

  toast(icon: string, title: string, sub = '', ms = 2600): void {
    const t = el('div', 'toast glass');
    t.append(el('div', 'ic', icon));
    const txt = el('div');
    txt.append(el('b', '', title));
    if (sub) txt.append(el('small', '', sub));
    t.append(txt);
    this.toasts.append(t);
    // One message at a time: a stack of three covered the road ahead.
    while (this.toasts.children.length > 1) this.toasts.firstChild?.remove();
    window.setTimeout(() => {
      t.classList.add('out');
      window.setTimeout(() => t.remove(), 400);
    }, ms);
  }

  floatText(text: string, x: number, y: number): void {
    const f = el('div', 'float-text', text);
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    this.hud.append(f);
    window.setTimeout(() => f.remove(), 950);
  }

  /**
   * High-beam glare: a white bloom centred on the oncoming lights, and a wash over
   * the whole view as it gets worse. `amount` 0..1.
   */
  setGlare(amount: number, x: number, y: number): void {
    const a = Math.max(0, Math.min(1, amount));
    if (a < 0.01) {
      if (this.glareEl.style.opacity !== '0') this.glareEl.style.opacity = '0';
      return;
    }
    this.glareEl.style.opacity = '1';
    this.glareEl.style.background =
      `radial-gradient(circle at ${x.toFixed(0)}px ${y.toFixed(0)}px, ` +
      `rgba(255,255,248,${(0.95 * a).toFixed(3)}) 0, ` +
      `rgba(255,250,232,${(0.75 * a).toFixed(3)}) ${(6 + 14 * a).toFixed(1)}%, ` +
      `rgba(255,246,220,${(0.45 * a * a).toFixed(3)}) ${(30 + 40 * a).toFixed(1)}%, ` +
      `rgba(255,246,220,${(0.3 * a * a).toFixed(3)}) 100%)`;
  }

  flash(): void {
    this.flashEl.classList.remove('go');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('go');
  }

  setFps(v: number | null): void {
    this.fps.hidden = v === null;
    if (v !== null) this.fps.textContent = `${Math.round(v)} fps`;
  }

  renderAchievements(unlocked: ReadonlySet<string>): void {
    const d = this.achDrawer;
    d.innerHTML = '';
    const head = el('h3', '', `🏆 Achievements ${unlocked.size}/${ACHIEVEMENTS.length}`);
    const x = el('button', 'x', '×');
    x.onclick = () => (d.hidden = true);
    head.append(x);
    d.append(head);
    for (const a of ACHIEVEMENTS) {
      const it = el('div', `ach-item${unlocked.has(a.id) ? ' got' : ''}`);
      it.append(el('div', 'ic', a.icon));
      const t = el('div');
      t.append(el('b', '', a.title), el('small', '', a.desc));
      it.append(t);
      d.append(it);
    }
  }

  showFinish(d: { city: string; runSec: number; best: number | null; newBest: boolean; fish: number; crashes: number }): void {
    this.finish.innerHTML = '';
    const card = el('div', 'card glass');
    card.innerHTML = `<div style="font-size:44px">🏁</div><h1>Arrived!</h1>
      <p class="sub">You survived the ${d.city} commute.</p>
      <div class="big-stats"><div><b>${fmtTime(d.runSec)}</b><span>Time</span></div>
      <div><b>${d.fish}</b><span>Fish</span></div><div><b>${d.crashes}</b><span>Bumps</span></div></div>
      <p class="best">${d.newBest ? '★ New best time for ' + d.city + '!' : d.best !== null ? `Best ${d.city} time: ${fmtTime(d.best)}` : ''}</p>`;
    const cta = el('div', 'cta');
    const again = el('button', 'btn-primary', 'Drive again ▶');
    const other = el('button', 'btn-ghost', 'Try the other city');
    again.onclick = () => this.cb.restart(false);
    other.onclick = () => this.cb.restart(true);
    cta.append(again, other);
    card.append(cta);
    this.finish.append(card);
    this.finish.hidden = false;
  }

  hideFinish(): void {
    this.finish.hidden = true;
  }
}

const TOUCH_HTML = `<b>On a phone:</b> ◀ ▶ steer with your left thumb, ▼ brake and ▲ gas with your right.<br>
＋ opens cruise, lights, horn, jump and stunt. ⏩ Cruise holds the gas for you.<br>
☰ opens the menu and pauses. 🎥 changes the camera.`;

const KEYS_HTML = `<kbd>W</kbd><kbd>S</kbd> accelerate / brake &nbsp; <kbd>A</kbd><kbd>D</kbd> change lane &nbsp; <kbd>Space</kbd> jump &nbsp; <kbd>F</kbd> stunt<br>
<kbd>B</kbd> horn &nbsp; <kbd>L</kbd> flash lights &nbsp; <kbd>H</kbd> pelican squawk &nbsp; <kbd>C</kbd> camera &nbsp; <kbd>T</kbd> switch city &nbsp; <kbd>N</kbd> skip 3 hours &nbsp; <kbd>P</kbd> pause &nbsp; <kbd>M</kbd> mute`;

export function fmtTime(sec: number): string {
  const s = Math.max(0, sec);
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

export function fmtClock(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
