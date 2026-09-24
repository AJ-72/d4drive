import { describe, expect, it } from 'vitest';
import { assessSupport, optionalSummary, type Probe } from './support';

const FULL: Probe = {
  webgl2: true,
  floatTargets: true,
  canvas2d: true,
  pointerEvents: true,
  webAudio: true,
  fullscreen: true,
  clipboard: true,
  storage: true,
  mobile: false,
};

describe('browser support check', () => {
  it('a capable browser has nothing missing', () => {
    const a = assessSupport(FULL);
    expect(a.blocking).toEqual([]);
    expect(a.optional).toEqual([]);
    expect(optionalSummary(a)).toBe('');
  });

  it('no WebGL2 blocks the game, with phone-specific help on a phone', () => {
    const a = assessSupport({ ...FULL, webgl2: false, floatTargets: false, mobile: true });
    expect(a.blocking.map((m) => m.id)).toEqual(['webgl2']);
    expect(a.blocking[0]!.fix).toMatch(/Use graphics acceleration when available/);
    // Without WebGL2 the glow question does not arise: do not list it twice.
    expect(a.optional.map((m) => m.id)).not.toContain('bloom');
  });

  it('desktop help points at hardware acceleration and chrome://gpu', () => {
    const a = assessSupport({ ...FULL, webgl2: false });
    expect(a.blocking[0]!.fix).toMatch(/hardware \/ graphics acceleration/);
    expect(a.blocking[0]!.fix).toMatch(/chrome:\/\/gpu/);
  });

  it('canvas and pointer events are required too', () => {
    const a = assessSupport({ ...FULL, canvas2d: false, pointerEvents: false });
    expect(a.blocking.map((m) => m.id)).toEqual(['canvas2d', 'pointer']);
  });

  it('optional gaps let the game run and read as one line', () => {
    const a = assessSupport({ ...FULL, webAudio: false, fullscreen: false, clipboard: false, storage: false, floatTargets: false });
    expect(a.blocking).toEqual([]);
    expect(a.optional.map((m) => m.id).sort()).toEqual(['audio', 'bloom', 'clipboard', 'fullscreen', 'storage']);
    expect(optionalSummary(a)).toBe('Glow effect off · No sound · Progress is not saved · No full screen · Share link is shown, not copied');
  });
});
