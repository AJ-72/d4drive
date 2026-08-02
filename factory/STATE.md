STEP: 4 complete (the work order) — awaiting signature before Step 5
NEXT_ARTIFACT: src/ (T0 scaffold) — no more factory docs until the build runs
LAST_ACTION: added T16 dry-run gate to PLAN.md + HANDOFF.md; logged D7
BLOCKED_ON: user signature on HANDOFF.md §5. Unsigned handoff = no night shift.
TASKS_DONE: 0/17
CONSECUTIVE_FAILURES: 0

ARTIFACTS ON DISK:
  factory/KILL.md           done   step 0    kill gate
  factory/GROUND_TRUTH.md   done   step 0.5  T0, zero accounts pre-kill-gate
  factory/BRIEF.md          done   step 1    the interview
  factory/CONTRACT.md       FROZEN step 2    C1-C5 — downstream must not edit
  factory/PLAN.md           done   step 3    T0-T16
  factory/TEST_PROTOCOL.md  SIGNED step 3+   blind session script + decision thresholds
  factory/HANDOFF.md        open   step 4    NEEDS SIGNATURE
  factory/DECISIONS.md      open   running   D1-D7
  factory/STATE.md          done   this file

GATES:
  T1,T2,T3,T4  structural — loop halts, human reviews. One supervised sitting.
  T16          dry run    — instrumented browser pass. BLOCKS INVITING TESTERS.
  TEST_PROTOCOL             the only thing that decides the kill gate. Needs people.

NIGHT SHIFT SCOPE: T5-T15 only. May not invite or run a human session.
GAP CLASS SEEN TWICE: prerequisites of VERIFICATION steps. Look here first for the next absence.
REMAINING: 5 night shift | 6 review | 7 evidence | 8 guide
