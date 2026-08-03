STEP: 5 (night shift) — T0-T8 done. HALTED on stop condition 5 + one open ruling.
NEXT_ARTIFACT: src/render/vehicles.ts (T9)
LAST_ACTION: T7-T8 committed bd018e2. 47 tests pass, tsc clean.
BLOCKED_ON: stop condition 5 only — four leaf tasks since last human contact.
            D9 RESOLVED 2026-08-03: straddles only, keep as built.
TASKS_DONE: 9/17
CONSECUTIVE_FAILURES: 0

RESOLVED THIS SESSION:
  The roadside blocker. User ordered "T8 first, verge only if still bad". T8 alone cut
  the jam 33 -> 21 but did not clear it; the verge takes it to 0. Road.shoulderPx = 26
  added (STRUCTURAL, user pre-approved). See DECISIONS D8.

C3 COUNTER READINGS (90-120s, player driving) — D-1 preview:
  signal                  Trivandrum   Singapore
  centreline straddles       ~200          0
  sub-length gap accepts      ~96          0
  cut-ins                     ~67        0-1
  lane changes               ~200        0-4
  worst 2D body overlap      3.8px      0.0px
  Every Trivandrum C3 bullet built so far fires; every Singapore "exactly zero" reads zero.

OPEN ISSUE — T16 dry run cannot run as written:
  requestAnimationFrame fires 0 times/sec while the Browser pane is hidden.
  MITIGATED: src/sim/harness.ts runs the whole sim headlessly and deterministically,
  so D-1 (counters) and D-3 (liveness) can move there. D-2 (6 screenshots) still needs
  the pane displayed, or becomes a manual user step.

PLAN DEFECTS FOUND SO FAR (4):
  T0  assumed an empty directory, but the pipeline creates factory/ before T0 runs
  T3  attack 6 could not detect the bug it targeted; replaced
  T6  proof "no vehicle overlaps another" is satisfied by the collision backstop alone,
      so it passed a car-following model that did nothing
  T2  Road had no roadside, which CONTRACT C3 requires

ARTIFACTS ON DISK:
  factory/{KILL,GROUND_TRUTH,BRIEF,PLAN,BACKLOG,DECISIONS,log,STATE}.md
  factory/CONTRACT.md       FROZEN
  factory/TEST_PROTOCOL.md  SIGNED
  factory/HANDOFF.md        SIGNED

GATES: T16 dry run blocks inviting testers | TEST_PROTOCOL needs people
