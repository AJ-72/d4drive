# BACKLOG.md — deliberately not now

Ideas parked with a reason and a trigger. Nothing here enters `PLAN.md` without passing the
kill gate first. The backlog exists so that "later" is a recorded decision rather than a
thing that quietly happens at 2am.

---

## B1 — Night drive

**Added:** 2026-08-03, by the user, during Step 4 sign-off.

Drive the same roads after dark: headlights, streetlights, shopfront glow, reduced sight
distance.

**Why it's parked:** `BRIEF.md` §5 puts day/night cycle out of v1 scope, and this is
downstream of the kill gate. It changes nothing about whether traffic culture is legible —
which is the only question currently open.

**Why it's a genuinely good fit for this game, recorded so the reasoning isn't lost:**
night is *culturally specific* in exactly the way the USP trades on. Trivandrum at night
means unlit or half-lit vehicles, high-beam abuse, an auto with one working headlight,
shopfronts spilling light onto the carriageway. Singapore at night means uniform sodium
lighting, everyone lit, no change in discipline. That is more USP surface, not decoration —
it belongs in `TrafficProfile` as lighting/visibility fields, not in a render layer.

**Trigger:** after the kill gate passes, and after the curated-city set exists. It is a
*second* expression of the culture idea, so it is worth much more once the first one is
proven — and worth nothing if the first one fails.

**Watch for:** reduced sight distance interacts with gap acceptance and car-following. If
night is built before `TrafficProfile` is stable, it will want to reach into T6/T8 and
couple visibility to behaviour. Design the fields first.

---

## B2 — Player fail-state (crashing ends the run)

**Added:** 2026-08-02, from `BRIEF.md` risk 1.

Deferred by the user's own scenario choice, but **promoted ahead of everything else in this
backlog if C3 reads weakly in testing.** Chaos without consequence is visual noise. Add this
*before* touching any profile number.

---

## B3 — Audio

**Added:** 2026-08-02, protocol D6.

Honking, engine noise, street sound. Held back so the first blind test measures *behaviour*
rather than being carried by a single strong Trivandrum tell. Becomes available the moment
the silent pass is done — and is the first ammunition for the exaggeration retry if it fails.

---

## B4 — Real geometry for curated cities

**Added:** 2026-08-02, from `DECISIONS.md` D5 (the middle path that was deferred, not
discarded).

Hand-authored culture profiles, but real OSM road shapes for those specific cities — drive
the actual MG Road with a hand-tuned Trivandrum profile. Bounded data work, and it sidesteps
the unsolved "what profile does an unknown town get?" problem entirely.

---

## B5 — Mobile / touch

**Added:** 2026-08-02, `BRIEF.md` §2.

Kept reachable by A4's input abstraction, which is why `InputSource` exists in T4. Nothing
else is owed to it yet.

---

## The named hard problem — not a backlog item

**What culture profile does an *arbitrary* town get?** This is the gap between the curated
v1 and the north star, and it is a research question, not a task. It is recorded here so
that nobody schedules it as a sprint item.
