# BRIEF.md — Step 1, The Interview

**Project:** D4Drive
**Date:** 2026-08-02
**Source:** interview with the user, 6 questions, answers recorded verbatim in intent below.

**Scope of this document:** the brief describes the **whole game vision**. The frozen
acceptance contract (`factory/CONTRACT.md`, Step 2) will cover **only the spike**. Freezing a
contract for the full game before the kill test is exactly what Step 0 forbids — the spike
exists to decide whether the full game should be built at all.

---

## 1. The one job

**Survive the commute, timed.**

The player drives a route from A to B through living traffic. Arriving without crashing is
success. A clock runs, and the time is the score you compare across cities — *"my Trivandrum
run took 3:40, my Singapore run took 2:10."*

The city's traffic culture is the difficulty *and* the texture. Every second of play is
spent inside the traffic AI, which is correct, because the traffic AI is the product.

> **Constraint that falls out of this — the timer vs. the kill test.**
> `KILL.md` defines a tester saying *"that one was slower"* as a **failure**: it means they
> perceived a number rather than a culture. Therefore **the timer is hidden during the blind
> test**, even though it ships in the real game. This is a protocol requirement, not a design
> preference, and it must not be quietly relaxed on test night.

## 2. Who plays it, and on what

**Desktop browser, keyboard (arrow keys / WASD). Mobile deferred, but not designed out.**

- Audience: casual players who would find "drive my own city" funny, recognisable, and
  worth sharing. Not sim-racing enthusiasts.
- Keyboard gives the precision that makes threading chaotic traffic feel like *skill* rather
  than luck — which matters, because if near-misses feel random the Trivandrum profile reads
  as "unfair" instead of "chaotic."
- Desktop-first also matches the test protocol: testers sit at the developer's laptop.
- **Input goes behind an abstraction from day one** so touch can be added later without
  rewriting movement. Small cost now; keeps mobile reachable.

## 3. Where the player drives — the USP

**v1: a curated city list. North star: search any real place.**

- **v1 (curated):** ~6–10 hand-authored cities — Trivandrum, Singapore, and others to be
  chosen — each with a hand-tuned culture profile and a few hand-built representative roads.
  The culture is authored with care, which is the entire point. No OSM, no data pipeline, no
  rate limits, no unknown-town problem.
- **The goal the project is aiming at:** type a real road anywhere and drive it, with the
  local culture reflected. This remains the destination, not a v1 feature.

> **Structural consequence — write this into the plan.**
> The **culture profile must be decoupled from road geometry from day one.** A profile is
> data about *how agents behave*; a road is data about *shape*. If profiles get baked into
> hand-built maps, the path to the north star requires rewriting both.
>
> **The named hard problem, deliberately out of v1:** *what profile does an unknown town
> get?* That is a research question, not a task. Curated cities sidestep it entirely.

## 4. Data that must persist

**Best time per city, in `localStorage`. Nothing else.**

- No accounts, no backend, no server, no cloud save.
- Therefore: no privacy policy, no GDPR surface, no auth, no abuse surface.
- One number per city is enough to give the timed loop meaning and to support the
  "my Trivandrum vs my Singapore" comparison that motivated the timer.

## 5. Explicitly out of scope for v1

- **Multiplayer** — no other human players, ever, in v1.
- **Accounts & backend** — consistent with `localStorage`.
- **Vehicle variety / upgrades / garage / progression** — one player car.
- **Sound & music — out *for now*.** The user's intent: audio may be added to the spike
  *once the spike is ready*, not never.

> **Audio vs. the blind test — pinned protocol.**
> **The first blind test runs silent.** Honking is such a strong Trivandrum tell that it
> could carry the test single-handedly and mask whether the *behavior* reads. Since the
> behavior is the thing under test, audio would contaminate the result.
> If the silent pass fails, adding honking and street noise is precisely what the one
> permitted exaggeration retry in `KILL.md` is for. Sequenced this way, audio *strengthens*
> the test instead of invalidating it.

Also out of scope for v1 (implied, stated for completeness): weather, day/night cycle,
police/traffic enforcement, damage models, and any real map data.

## 6. What "done" looks like — the spike, in observable terms

Three scenarios, confirmed by the user. These are drafted into `CONTRACT.md` verbatim and
frozen there.

- **S1 — It drives.** Run `npm run dev`, drive the road end to end with arrow keys, arrive,
  see an "Arrived" state.
- **S2 — It switches.** Press `T` mid-drive to change profile. Traffic behavior visibly
  changes within ~5 seconds. No page reload, no crash.
- **S3 — It reads.** Sit still and watch for 30 seconds on each profile. Trivandrum traffic
  weaves, cuts in, ignores lanes. Singapore traffic queues, holds lanes, waits.
  **Silent. No timer displayed.**

**And then the real gate, which no code can pass on its own:** 3–5 people, in person, blind,
asked only *"describe the difference between these two."* See `KILL.md`.

---

## Known gaps and risks, recorded rather than smoothed over

1. **No player fail-state in the spike.** The user chose the three scenarios without a crash
   ending. Consequence: "survive the commute" has no teeth in the spike, and testers may feel
   no stakes — which could *dampen* the perceived difference between profiles, since chaos
   without consequence is just visual noise. Note that vehicle-vs-vehicle collision logic is
   needed regardless for the AI to behave sanely; what's deferred is only *the player's run
   ending on impact.* **If S3 reads weakly in testing, adding the player fail-state is the
   first thing to try — before touching the profile parameters.**

2. **The profile schema is not yet designed.** `[STRUCTURAL]`, and the single most
   load-bearing decision in the project. It must be specified as literal TypeScript with
   named fields and units, never as prose or adjectives like `aggression: high`. Human
   checkpoint. See `DECISIONS.md` → Open.

3. **Small, friendly test sample.** Friends and family are generous. The blind protocol —
   don't reveal which profile is active, ask only an open question — is the mitigation.

4. **The timer is a double-edged feature.** It motivates replay but risks reducing a felt
   cultural difference to a number. Hidden during testing; watch for this in the real game too.
