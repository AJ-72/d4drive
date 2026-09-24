// Two front-ends over one simulation.
//
// `?spike` serves the original top-down 2D view. It is the build CONTRACT.md C1-C3
// were written against — silent, no numeric readout — and is what the blind test
// must use. Everything else gets the 3D game. Dynamic imports keep three.js out of
// the spike bundle entirely.
//
// Before either loads, check the browser has what it needs (see support.ts). A
// failed check, or a crash while the game starts, shows a message instead of a
// blank page.
import { assessSupport, probeBrowser, setAssessment, showBlocked } from './support';

const spike = new URLSearchParams(location.search).has('spike');
const assessment = assessSupport(probeBrowser());
setAssessment(assessment);

// The 2D view needs only canvas drawing, not WebGL2 or the touch controls.
const blocking = spike ? assessment.blocking.filter((m) => m.id === 'canvas2d') : assessment.blocking;

if (blocking.length) {
  showBlocked(blocking, { spikeLink: !spike && !blocking.some((m) => m.id === 'canvas2d') });
} else {
  const load = spike ? import('./spike') : import('./game/main');
  load.catch((err: unknown) => {
    console.error(err);
    showBlocked(
      [
        {
          id: 'start',
          what: 'The game failed while starting.',
          fix: 'Reload the page. If it keeps happening, turn on graphics acceleration in your browser settings, or try another browser.',
        },
      ],
      { detail: err instanceof Error ? err.message : String(err), spikeLink: !spike, intro: 'Something went wrong:' },
    );
  });
}
