STEP: 5 (night shift) — T0-T6 done. HALTED for a structural decision.
NEXT_ARTIFACT: src/sim/lateral.ts (T7) — blocked, see below
LAST_ACTION: T6 committed ab286c5. 36 tests pass, tsc clean.
BLOCKED_ON: STOP CONDITION — "where a decision seems missing, stop and ask".
  C3 requires parking at the roadside; the Road model has no roadside. Fixing it
  means changing Road, which is [STRUCTURAL] and given verbatim in PLAN.md T2.
TASKS_DONE: 7/17
CONSECUTIVE_FAILURES: 0

BLOCKER DETAIL — no roadside to park on:
  C3: "Bring the car to a stop at the roadside ... observe for 30 seconds."
  The player can only stop INSIDE a lane. Measured over 150s parked:
    Trivandrum  pop 58 -> 96, 33 vehicles stopped dead in the player's lane
    Singapore   pop 35 -> 43, 18 vehicles stopped dead in the player's lane
  C3's passive-observation phase would show a tester a jam caused by their own
  parked car, in BOTH cities, making the two look more alike than they are.
  Candidate causes, not exclusive:
    (a) T8 lane changing does not exist yet - traffic cannot go around anything
    (b) Road has no shoulder; updatePlayer clamps the player inside the carriageway
  Did NOT change Road unilaterally. Needs a ruling before T7/T8, since both write
  lateral motion and a shoulder changes the lateral bounds.

OPEN ISSUE — T16 dry run cannot run as written:
  requestAnimationFrame fires 0 times/sec while the Browser pane is hidden.
  PROPOSED: D-1 (counters) and D-3 (liveness) move to the headless harness that now
  exists (src/sim/harness.ts). D-2 (6 screenshots) still needs the pane displayed.

PLAN DEFECTS FOUND SO FAR (3):
  T0  assumed an empty directory, but the pipeline creates factory/ before T0 runs
  T3  attack 6 could not detect the bug it targeted; replaced
  T6  proof "no vehicle overlaps another" is satisfied by the collision backstop
      alone, so it passed a car-following model that did nothing

ARTIFACTS ON DISK:
  factory/{KILL,GROUND_TRUTH,BRIEF,PLAN,BACKLOG,DECISIONS,log,STATE}.md
  factory/CONTRACT.md       FROZEN
  factory/TEST_PROTOCOL.md  SIGNED
  factory/HANDOFF.md        SIGNED

GATES: T16 dry run blocks inviting testers | TEST_PROTOCOL needs people
