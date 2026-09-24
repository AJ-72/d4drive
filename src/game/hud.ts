import './hud.css';
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
  screenshot(): void;
  toggleMusic(): void;
  share(): void;
  settingsChanged(s: Settings): void;
  restart(switchCity: boolean): void;
}

export class Hud {
  readonly root = el('div', 'd4');
  private readonly hud = el('div', '');
  private readonly cityLabel = el('small');
  private readonly camButtons = new Map<CameraMode, HTMLButtonElement>();
  private readonly toasts = el('div', 'toasts');
  private readonly hint = el('div', 'hint glass');
  private readonly speedNum = el('b');
  private readonly ringVal: SVGCircleElement;
  private readonly stat: Record<string, HTMLElement> = {};
  private readonly fishNum = el('div', 'fishcount', '0');
  private readonly achNum = el('b');
  private readonly clock = el('span', 'clock');
  private readonly slider = el('input');
  private readonly ppBtn = el('button', 'pp', '⏸');
  private readonly intro = el('section', 'overlay');
  private readonly pause = el('section', 'overlay');
  private readonly finish = el('section', 'overlay');
  private readonly settingsDrawer = el('aside', 'drawer glass');
  private readonly helpDrawer = el('aside', 'drawer glass');
  private readonly achDrawer = el('aside', 'drawer glass');
  private readonly fps = el('div', 'fps glass');
  private readonly flashEl = el('div', 'flash');
  private readonly musicBtn: HTMLButtonElement;
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
    this.root.append(this.hud, this.intro, this.pause, this.finish, this.settingsDrawer, this.helpDrawer, this.achDrawer, this.fps, this.flashEl);
    host.appendChild(this.root);

    // --- top bar ---
    const badge = el('div', 'badge glass');
    badge.append(el('div', 'logo', '🐦'));
    const title = el('div');
    title.append(el('b', '', 'D4Drive'), this.cityLabel);
    badge.append(title);

    const cams = el('div', 'cams glass');
    for (const c of CAMERA_MODES) {
      const b = el('button', '', c.label);
      b.onclick = () => cb.camera(c.id);
      this.camButtons.set(c.id, b);
      cams.append(b);
    }

    const tools = el('div', 'tools glass');
    const tool = (icon: string, tip: string, fn: () => void) => {
      const b = el('button', '', icon);
      b.title = tip;
      b.setAttribute('aria-label', tip);
      b.onclick = fn;
      tools.append(b);
      return b;
    };
    tool('📸', 'Screenshot', () => cb.screenshot());
    this.musicBtn = tool('🎵', 'Music on/off', () => cb.toggleMusic());
    tool('🔗', 'Copy share link', () => cb.share());
    tool('⛶', 'Fullscreen', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.();
    });
    tool('⚙️', 'Settings', () => this.toggleDrawer(this.settingsDrawer));
    tool('？', 'Help', () => this.toggleDrawer(this.helpDrawer));

    // --- bottom-left gauge ---
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
    for (const [k, label] of [['rpm', 'RPM'], ['gear', 'Gear'], ['dist', 'Distance'], ['time', 'Time'], ['cam', 'Camera']]) {
      const v = el('b');
      this.stat[k!] = v;
      stats.append(el('span', '', label), v);
    }
    gauge.append(ring, stats);

    // --- bottom-right panel ---
    const panel = el('div', 'panel glass');
    const r1 = el('div', 'row');
    const ach = el('button', 'ach');
    ach.append(el('span', '', 'Achievements'), this.achNum);
    ach.onclick = () => this.toggleDrawer(this.achDrawer);
    r1.append(el('span', '', '<span style="font-size:22px">🐟</span>'), this.fishNum, ach);
    const r2 = el('div', 'row time');
    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.max = '24';
    this.slider.step = '0.05';
    this.slider.setAttribute('aria-label', 'Time of day');
    this.slider.oninput = () => cb.setHour(Number(this.slider.value));
    this.slider.onpointerdown = () => (this.sliderHeld = true);
    this.slider.onpointerup = () => (this.sliderHeld = false);
    this.ppBtn.onclick = () => cb.togglePause();
    this.ppBtn.title = 'Pause (P)';
    r2.append(el('span', '', '☀️'), this.slider, this.clock, this.ppBtn);
    panel.append(r1, r2);

    // --- touch controls (shown on coarse pointers only) ---
    const touch = el('div', 'touch');
    const left = el('div');
    const right = el('div');
    for (const [id, label, side] of [['left', '◀', left], ['right', '▶', left], ['jump', '⤒', right], ['brake', '▼', right], ['gas', '▲', right]] as const) {
      const b = el('button', '', label);
      b.setAttribute('aria-label', id);
      this.touchButtons.set(id, b);
      side.append(b);
    }
    touch.append(left, right);

    this.hint.innerHTML = '🐟 Fish ahead <span class="arr">➜</span>';
    this.hud.append(badge, cams, tools, this.toasts, this.hint, gauge, panel, touch);

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
  }

  private toggleDrawer(d: HTMLElement): void {
    const open = d.hidden;
    for (const x of [this.settingsDrawer, this.helpDrawer, this.achDrawer]) x.hidden = true;
    d.hidden = !open;
  }

  closeDrawers(): boolean {
    const any = [this.settingsDrawer, this.helpDrawer, this.achDrawer].some((d) => !d.hidden);
    for (const x of [this.settingsDrawer, this.helpDrawer, this.achDrawer]) x.hidden = true;
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
    card.append(chips, pick, cta, keys);
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
    this.helpDrawer.innerHTML = `<h3>How to play</h3><div class="keys" style="display:block;text-align:left">${KEYS_HTML}</div>
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
    this.cityLabel.innerHTML = `Live 3D · <span class="city-chip">${name}</span>`;
  }

  setCamera(mode: CameraMode): void {
    for (const [id, b] of this.camButtons) b.classList.toggle('on', id === mode);
    this.stat['cam']!.textContent = CAMERA_MODES.find((c) => c.id === mode)!.label;
  }

  setMusic(on: boolean): void {
    this.musicBtn.classList.toggle('dim', !on);
  }

  setPaused(p: boolean): void {
    this.pause.hidden = !p;
    this.ppBtn.textContent = p ? '▶' : '⏸';
  }

  update(d: { kmh: number; rpm: number; gear: number; distM: number; runSec: number; hour: number; fish: number; ach: number }): void {
    this.speedNum.textContent = String(Math.round(d.kmh));
    const c = Number(this.ringVal.dataset['c']);
    this.ringVal.setAttribute('stroke-dashoffset', String(c * (1 - Math.min(1, d.kmh / 110))));
    this.stat['rpm']!.textContent = `${Math.round(d.rpm / 10) * 10}`;
    this.stat['gear']!.textContent = `${d.gear}/5`;
    this.stat['dist']!.textContent = `${(d.distM / 1000).toFixed(2)} km`;
    this.stat['time']!.textContent = fmtTime(d.runSec);
    this.fishNum.textContent = String(d.fish);
    this.achNum.textContent = `${d.ach}/${ACHIEVEMENTS.length}`;
    this.clock.textContent = fmtClock(d.hour);
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
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
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

const KEYS_HTML = `<kbd>W</kbd><kbd>S</kbd> accelerate / brake &nbsp; <kbd>A</kbd><kbd>D</kbd> change lane &nbsp; <kbd>Space</kbd> jump &nbsp; <kbd>F</kbd> stunt<br>
<kbd>B</kbd> horn &nbsp; <kbd>H</kbd> pelican squawk &nbsp; <kbd>C</kbd> camera &nbsp; <kbd>T</kbd> switch city &nbsp; <kbd>N</kbd> skip 3 hours &nbsp; <kbd>P</kbd> pause &nbsp; <kbd>M</kbd> mute`;

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
