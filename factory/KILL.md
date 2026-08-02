# KILL.md — Step 0, The Kill Gate

**Project:** D4Drive — a 2D driving game where the player picks a real-world road, and
the traffic *culture* of that location drives the simulation. Trivandrum gives you autos,
buses, honking and improvised lanes; Singapore gives you disciplined, queued, silent traffic.

**Date:** 2026-08-02
**Signed off by:** user (via kill-gate interview)

---

## The riskiest assumption

**Culture is legible as gameplay.**

That "Trivandrum traffic" and "Singapore traffic" actually *feel* different when reduced to
2D AI behavior — and are not merely a stat tweak (aggression 0.8 vs 0.2) that a player
cannot perceive or does not care about.

If a player cannot feel the difference within roughly 30 seconds of driving, the USP
evaporates and what remains is a generic 2D driving game with a location picker.

Assumptions explicitly ranked *below* this one (real but secondary):
- Real road data (OSM) is usable and produces drivable tracks — a solvable engineering
  problem, and the spike deliberately avoids it.
- People want to drive *their own* road — a distribution/novelty question, only worth
  answering if the core reads.
- 2D driving is fun on its own merits — true enough of the genre to not be the risk here.

## The cheap test

**A two-city playable spike.**

- ONE hand-drawn straight road. No real map data at all, no OSM, no location picker.
- Two traffic profiles: `trivandrum` and `singapore`.
- A single toggle key to switch profiles live.
- Scope: 1–2 working sessions.

**Protocol:** show it to 3–5 people. Do *not* tell them which profile is active or what the
game is about. Ask one open question: *"Describe the difference between these two."*

**Pass condition:** testers name the difference *unprompted*, in terms recognisable as
traffic culture (e.g. "that one's chaotic / people cut in / nobody follows lanes" vs
"that one's orderly / they wait"). Recognising the specific cities is a bonus, not required.

**Fail condition:** testers describe it as "faster/slower", "more cars/fewer cars", or
cannot articulate a difference at all.

## The pre-committed stop condition

**Exaggerate once, then stop.** One retry budget, agreed in advance:

1. If the first spike fails, we are permitted exactly one exaggeration pass — crank both
   profiles to caricature. Trivandrum: constant honking, autos cutting diagonally across
   the road, jaywalkers stepping out, no lane adherence, buses stopping anywhere.
   Singapore: strict lanes, queued merges, silence, pedestrians only at crossings.
2. If testers *still* cannot name the difference unprompted after the exaggerated pass,
   **the location-culture USP is abandoned.** The project is either shelved or explicitly
   rebuilt as a plain 2D driving game — which is a different project and requires a new
   brief, not a quiet continuation of this one.

No second retry. No "one more tuning pass." The second failure means the model of the
problem is wrong, not the parameters.

---

## Foreman's note

This gate was answered substantively: the user named a falsifiable assumption, accepted a
cheap test that costs 1–2 sessions rather than the full build, and pre-committed to a stop
condition with a bounded retry. That is a real gate, not a performed one.

The one thing to watch: "exaggerate once" is the phrasing most likely to soften under
pressure at 2am. If the spike fails and the retry fails, the honest move is to stop and
say so — see `factory/STATE.md` and the stop conditions in the eventual `HANDOFF.md`.

**Consequence for the plan:** the spike is not a throwaway. It is the first milestone, and
the location picker / OSM ingestion must be planned *behind* it, not before it. Any plan
that builds the map pipeline first has inverted the risk order.
