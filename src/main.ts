// Two front-ends over one simulation.
//
// `?spike` serves the original top-down 2D view. It is the build CONTRACT.md C1-C3
// were written against — silent, no numeric readout — and is what the blind test
// must use. Everything else gets the 3D game. Dynamic imports keep three.js out of
// the spike bundle entirely.
if (new URLSearchParams(location.search).has('spike')) {
  void import('./spike');
} else {
  void import('./game/main');
}
