STEP: 5 (night shift) — T0 done, HALTED at first structural checkpoint
NEXT_ARTIFACT: src/engine/loop.ts (T1)
LAST_ACTION: T0 scaffold complete, commit 65068a7, dev server verified on :5173
BLOCKED_ON: STOP CONDITION 2 — next task T1 is [STRUCTURAL]. Awaiting human review.
TASKS_DONE: 1/17
CONSECUTIVE_FAILURES: 0

OPEN ISSUE FOR T16: browser automation unavailable in this session (preview_start resolves
  to the old cwd; localhost:5173 blocked by policy). T16's D-2 frozen-frame test needs a
  real browser. Resolve before reaching the dry-run gate. See log.md T0 surprise #2.

ARTIFACTS ON DISK:
  factory/KILL.md           done   step 0
  factory/GROUND_TRUTH.md   done   step 0.5
  factory/BRIEF.md          done   step 1
  factory/CONTRACT.md       FROZEN step 2    C1-C5 — downstream must not edit
  factory/PLAN.md           done   step 3    T0-T16
  factory/TEST_PROTOCOL.md  SIGNED step 3+
  factory/HANDOFF.md        SIGNED step 4    defaults A1-A11 accepted
  factory/BACKLOG.md        open   parked    B1 night drive, B2-B5
  factory/DECISIONS.md      open   running   D1-D7
  factory/log.md            open   step 5    T0 logged
  factory/STATE.md          done   this file

GATES: T1,T2,T3,T4 structural | T16 dry run blocks inviting testers | TEST_PROTOCOL needs people
