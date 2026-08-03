STEP: 5 (night shift) — T0-T4 done, structural sitting complete
NEXT_ARTIFACT: src/sim/traffic.ts (T5 spawning)
LAST_ACTION: T1-T4 committed ba0f2e8. 25 tests pass, tsc clean, invariants grep-verified.
BLOCKED_ON: user decision on the T16 verification route (see OPEN ISSUE). Not blocking T5-T15.
TASKS_DONE: 5/17
CONSECUTIVE_FAILURES: 0

OPEN ISSUE — T16 dry run cannot run as written:
  requestAnimationFrame fires 0 times/sec while the Browser pane is hidden
  (visibilityState "hidden"). The sim never steps, so no browser-observable check
  can be verified from this session. Screenshots fail for the same reason.
  PROPOSED: move D-1 (counters) and D-3 (liveness) to a headless Node harness using
  the seeded RNG, faster than real time. Stronger evidence than watching a browser.
  D-2 (6 screenshots) still needs the pane displayed, or becomes a manual user step.
  C1-C5 likewise need the pane open, or a human at the keyboard.

PLAN DEFECTS FOUND SO FAR (2):
  T0  assumed an empty directory, but the pipeline creates factory/ before T0 runs
  T3  attack 6 could not detect the bug it targeted; replaced with a Trivandrum-based
      check, since the clamp never engages for Singapore

ARTIFACTS ON DISK:
  factory/KILL.md           done   step 0
  factory/GROUND_TRUTH.md   done   step 0.5
  factory/BRIEF.md          done   step 1
  factory/CONTRACT.md       FROZEN step 2    C1-C5 — downstream must not edit
  factory/PLAN.md           done   step 3    T0-T16
  factory/TEST_PROTOCOL.md  SIGNED step 3+
  factory/HANDOFF.md        SIGNED step 4
  factory/BACKLOG.md        open   parked    B1 night drive, B2-B5
  factory/DECISIONS.md      open   running   D1-D7
  factory/log.md            open   step 5    T0, T0b, T1-T4
  factory/STATE.md          done   this file

GATES: T16 dry run blocks inviting testers | TEST_PROTOCOL needs people
NIGHT SHIFT SCOPE: T5-T15, all [LEAF]. Halt after 5 leaf tasks (stop condition 5).
