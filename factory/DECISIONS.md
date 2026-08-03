# DECISIONS.md — running log

What was chosen, what was rejected, and the known cost. The plan says *what* to build;
this says *why*, so a choice is revisitable in a month rather than merely reversible.

---

## D1 — Validate the culture mechanic before building anything else
**Date:** 2026-08-02 · **Step:** 0

**Chosen:** A two-city playable spike on a hand-drawn straight road, tested blind on 3–5
people, before any map data or location picker exists.

**Rejected:**
- *Silent video A/B* — faster, but tests recognition rather than whether it's fun to drive in.
- *Prior-art search only* — tells us if others tried, not whether our version reads.
- *Skip the gate* — user did not take this option; the gate is real.

**Cost:** 1–2 sessions spent on code that is deliberately throwaway-shaped (fake road, no
map data). Accepted, because the alternative is discovering the USP doesn't land *after*
the OSM pipeline is built.

**Reversibility:** n/a — this is a sequencing decision. Its cost is already sunk once the
spike is built.

---

## D2 — TypeScript + HTML5 Canvas + Vite, no game engine
**Date:** 2026-08-02 · **Step:** 0.5 · **`[STRUCTURAL]`**

**Chosen:** Hand-rolled game loop on 2D canvas, TypeScript, Vite dev server.

**Rejected:**
- *Phaser 3* — batteries included, but the traffic AI is the product, and an engine's
  abstractions would be fought rather than used.
- *Godot 4* — better for a shipped game long-term; requires a ~100MB install and GDScript,
  and slows the path to a testable spike, which is the only thing that matters right now.
- *Python + Pygame* — Python isn't installed, and testers would need a runtime. Directly
  obstructs the in-person tester step.

**Cost:** We write our own game loop, collision, and spatial queries. Cheap for 2D top-down
traffic; expensive if the project later wants physics, 3D, or mobile-native.

**Reversibility:** Cheap now, expensive once traffic AI and rendering exist. Revisit only
if the spike passes AND the project commits to shipping broadly.

---

## D3 — In-person testing, so zero external accounts before the kill decision
**Date:** 2026-08-02 · **Step:** 0.5

**Chosen:** Testers sit at the developer's laptop; `npm run dev` on localhost is the whole
delivery mechanism.

**Rejected:** *Remote testers* — would have put a hosting account and deploy pipeline on the
critical path of the kill gate itself. *Public posting* — contaminates the "unprompted"
requirement, since commenters read each other's answers.

**Cost:** Sample is small and socially biased (friends/family are generous). Mitigated by
the blind protocol: don't say which profile is active, ask only "describe the difference."

**Reversibility:** Trivially reversible; adding a host later is a small task.

---

## D4 — One retry budget on the kill test, then a real stop
**Date:** 2026-08-02 · **Step:** 0

**Chosen:** If testers can't name the difference unprompted, one exaggeration pass is
permitted. If that also fails, the location-culture USP is abandoned.

**Rejected:** *Hard stop, no retry* — risks killing the idea on a weak first implementation
rather than a weak idea. *Pivot to map-first* — kept available as an option after the stop,
but not as a way to avoid stopping.

**Cost:** The retry is the clause most likely to soften under pressure. Guard: the retry is
*one* pass, defined in advance as caricature-level exaggeration, not open-ended tuning.

---

## D5 — Curated cities for v1; "search any real place" is the north star
**Date:** 2026-08-02 · **Step:** 1 · **`[STRUCTURAL]` in its consequence**

**Chosen:** ~6–10 hand-authored cities with hand-tuned culture profiles and hand-built
roads. Real-place search stays the project's stated destination.

**Rejected for v1:** *OSM search* — inherits a data pipeline, caching, rate limits, and the
unsolved question of what profile an unknown town gets. *Player's own location* — same, plus
privacy. *Curated + real geometry* — a reasonable middle path, deferred not discarded.

**Cost / consequence:** because the destination is real-place search, **culture profile must
be decoupled from road geometry from day one.** A profile describes agent behavior; a road
describes shape. Baking profiles into hand-built maps would make the north star a rewrite of
both. This constraint is cheap to honor now and expensive to retrofit.

**Reversibility:** the v1/north-star split is cheap. The coupling decision is not — it must
be right in the first structural task.

---

## D6 — Protocol: the first blind test runs silent, and the timer is hidden
**Date:** 2026-08-02 · **Step:** 1

**Chosen:** Audio and the on-screen timer are both absent from the first blind test, though
both belong in the shipped game.

**Why:** `KILL.md` counts *"that one was slower"* as a failure — a number perceived instead
of a culture. And honking is a strong enough Trivandrum tell to carry the test alone, masking
whether the *behavior* reads. Behavior is what's under test.

**Cost:** the spike is less impressive to show. Accepted — the spike is an instrument, not a
demo. If the silent pass fails, adding honking is what the single exaggeration retry is for,
which sequences audio as a *strengthening* of the test rather than a contamination of it.

**Guard:** this is the clause most likely to soften on test night ("just let them hear it").
It should not.

---

## D7 — A dry run gates the human test
**Date:** 2026-08-03 · **Step:** 3 (added by user request) · **Task:** T16

**Chosen:** Before any friend is invited, run an instrumented browser pass — counter
verification against the profile numbers, a frozen-frame classification test, and a liveness
check that every C3 bullet actually fires. Recorded in `factory/DRYRUN.md`.

**Rejected:** *Going straight to friends after the contract passes.* C1–C5 prove the spike is
a working instrument; they do not prove the required signals occur at usable rates. A build
where jaywalking silently never fires passes C1, C2, C4 and C5, and produces a meaningless
C3 session.

**Cost:** an extra gate before the thing everyone wants to do. Accepted because of the
asymmetry: a dry-run failure costs a rebuild, a session failure costs a **tester,
permanently** — `TEST_PROTOCOL.md` §7 forbids re-testing anyone who has seen the game.

**Explicit limit, recorded so it is not misread later:** the agent running the dry run
designed the profile numbers and knows which city is on screen. It cannot be blind and
cannot be surprised. **The dry run can only ever produce a FAIL that matters.** A pass means
"the instrument works", never "the idea works" — that verdict needs people, and only people.

---

## D8 — `Road` gains a shoulder (verge) — `[STRUCTURAL]`
**Date:** 2026-08-03 · **Task:** T7–T8 · **User-approved:** "do 2, then 1 if still bad"

**Chosen:** `Road.shoulderPx = 26`. The player may drive onto it; traffic never does.

**Why:** `CONTRACT.md` C3 says *"bring the car to a stop at the roadside"*, and no roadside
existed — the player could only stop inside a live lane. Measured over 150s parked:

| | population | jammed behind player |
|---|---|---|
| before T8, parked in lane | 58 → 96 | 33 |
| after T8, parked in lane | 57 → 79 | 21 |
| after verge, pulled over | 52 → 95 | **0** |

**Rejected:** *T8 alone* — tested first, on the user's instruction, precisely because it was
the cheaper experiment. It reduced the jam by roughly a third but did not remove it: on a
two-lane road at ~130 vehicles/min, a stopped vehicle still congests everything behind it.
That is realistic, and unusable for C3 — every tester's passive-observation phase would have
shown a jam caused by their own parked car, in *both* cities, making the two look far more
alike than they are.

**Cost:** edits a `[STRUCTURAL]` artifact given verbatim in `PLAN.md` T2. Contained: `Road`
gained one field, `updatePlayer` widened its clamp, and `playerLane()` returns `null` when
the player is clear of the carriageway. Nothing in `src/profiles/` was touched, so the
profile/geometry invariant still holds.

**Note:** the experiment was worth running even though it did not resolve the problem. It
established that the jam is not merely an artefact of missing lane changes, which is what
justified touching the structural artefact at all.

---

## D9 — "Zero centreline crossings" means zero *straddles*, not zero lane changes
**Date:** 2026-08-03 · **Task:** T7 · **RESOLVED 2026-08-03 — user ruled: keep as built**

C3 requires **zero** centreline crossings from Singapore. But Singapore has
`overtakeUrgency: 0.10`, and on a two-lane road *any* overtake crosses the one centreline
there is. Read literally, C3 forbids Singapore from ever changing lane — which would also
make C3's own "queueing behind a slower vehicle" bullet the only possible behaviour.

**Implemented reading:** the counter measures *deliberate straddling* — riding the line,
`centerlineCrossPerMin`, which is `0.0` for Singapore — and not clean, completed lane
changes. This matches C3's Trivandrum bullet, which pairs "crossing the lane centreline"
with "or straddling lanes" as one undisciplined-lane-keeping signal.

Measured over 90s: Singapore **0** straddles and 0–4 lane changes; Trivandrum ~200 straddles
and ~200 lane changes.

**Flagged rather than silently decided**, because it interprets a frozen check.

**User ruling (2026-08-03): straddles only — keep as built.** Singapore never rides the line,
but may still change lane to overtake roughly 0–4 times per 90s.

**Rejected: the literal reading** (`overtakeUrgency` → 0). It satisfies C3 on the strictest
reading with no interpretation needed, but it makes C3's other Singapore bullet — *"vehicles
queueing behind a slower vehicle rather than forcing past it"* — trivially true: they would
queue because passing is impossible, not because they are disciplined. A check that cannot
fail is the exact category the Step 6 review hunts for, and this one would have been
introduced deliberately.

**Rejected: unfreezing C3 to reword it.** More honest about intent, but it breaks the freeze
rule, which exists precisely so the builder cannot edit its own exam.

**Residual risk, accepted:** a tester's 30-second Singapore window could contain one of those
0–4 lane changes. Judged not to undermine "disciplined" — a single decisive move reads as
competent, where sitting on the line reads as sloppy. If T16's dry run shows Singapore lane
changes clustering, dropping `overtakeUrgency` to ~0.03 is the cheap mitigation.

---

## Open — not yet decided, must not be improvised

- ~~**The traffic-profile data shape.**~~ **RESOLVED 2026-08-02 in `PLAN.md` T3** — literal
  TypeScript, 18 named numeric fields with units, plus a load-time validator and two authored
  profiles. Still a human checkpoint before the builder proceeds past it.
  Notable within it: Trivandrum and Singapore are given *deliberately similar* spawn rates
  (130 vs 118) and mean speeds (170 vs 178), because C3 fails if the profiles differ mainly
  in speed or density. The cost is that the difference must come entirely from behavior —
  which is the point, and also the hardest part.
- **What a "city profile" is authored from** — hand-tuned by a human, or derived from data?
  Deferred until after the spike. The spike hand-tunes two profiles; that is not a commitment.
- **Whether real map data is ever used.** Sits entirely behind the kill gate.
