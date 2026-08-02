# TEST_PROTOCOL.md — the blind session script

**Status:** ☑ **SIGNED** · Anand Jayaram · 2026-08-02 · §7 thresholds accepted as proposed,
including the WEAK PASS band.

`KILL.md` defines the pass condition. It does not define the *session* — what you say, in
what order, for how long, and what you write down. That gap is why five tester sessions
would otherwise produce five anecdotes instead of one comparable dataset.

**What is being decided:** whether traffic culture is legible as gameplay. Nothing else.
Not whether the game is fun, not whether the art is good, not whether they liked it.

**Runtime:** ~9 minutes per tester. **Testers:** 3–5, in person, one at a time.

---

## 1. The one rule

**You may not use the words "chaotic", "orderly", "disciplined", "India", "Trivandrum",
"Singapore", "traffic culture", "aggressive", or "realistic" before the tester does.**

If you say any of them first, that tester's data is void. Write VOID on the sheet and stop
scoring — do not try to salvage it. One nervous leading question is the single most likely
way this test produces a false pass, and a false pass costs the entire project's direction.

The developer running their own test is the highest-risk part of this protocol. **Read the
script. Do not improvise.** Silence after a question is not a problem to be filled.

---

## 2. Setup — verify before every tester, not just the first

- [ ] Sound **off** at the OS level (protocol D6 — the first pass is silent)
- [ ] No timer, score, or numeric readout on screen (C3)
- [ ] Debug overlay **off** — confirm by reload, not by memory (T15)
- [ ] Page **reloaded fresh** between testers (C5 exists to make this safe; use it anyway)
- [ ] Browser fullscreen, same seat, same screen, same lighting
- [ ] A printed or written scoring sheet per tester — not a memory of how it went
- [ ] You know which profile is A and which is B **for this tester** (see §3)

---

## 3. Alternation — mandatory

Whoever sees a profile second benefits from having something to compare it to, and reads it
as *"worse"* rather than *"different"*. Alternate:

| Tester | First (A) | Second (B) |
|---|---|---|
| 1 | Trivandrum | Singapore |
| 2 | Singapore | Trivandrum |
| 3 | Trivandrum | Singapore |
| 4 | Singapore | Trivandrum |
| 5 | Trivandrum | Singapore |

Never tell the tester which is which, or that the two are meant to be places at all.

---

## 4. The script — say these words

**Intro:**

> "I'm going to show you two versions of a driving game. Drive each one for about a minute
> and a half. Then I'll ask you one question. There are no wrong answers, and I'm not going
> to tell you what I'm looking for — that's on purpose."

**Phase 1 — drive A (90 seconds).** Arrow keys to drive. Say nothing while they play. If
they ask "what am I supposed to do?", answer only: *"Just drive to the end of the road."*
If they ask anything else, say: *"I'll explain after."*

**Phase 2 — drive B (90 seconds).** Reload, switch profile, same instruction. Say nothing.

**Q1 — the primary question. Ask it exactly like this:**

> **"Tell me about those two."**

Then stop talking. Wait through the silence — five seconds feels much longer than it is.
**Write down their first sentence verbatim.** Not a paraphrase. The first ten words carry
almost all of the signal.

If they only answer about gameplay preference ("the second was easier"), ask once:

> **"Anything else you noticed?"**

That is a neutral prompt and does not cost a scoring tier.

**Phase 3 — passive watch (30s each, A then B).** Take the keyboard. Park the car at the
roadside and let them watch. This phase is far more diagnostic than driving — a player
concentrating on their own car sees two vehicle-lengths ahead, not the traffic system.

> "Now just watch this one for thirty seconds. You're not driving."

**Q2, after both:**

> **"Same question — tell me about those two."**

Write it down verbatim.

---

## 5. The probe ladder — only if nothing has emerged

Do **not** climb this ladder if Q1 or Q2 already produced culture language. Each rung costs
a scoring tier, and that cost is the point: it records how much help they needed.

1. *(costs nothing)* "Anything else you noticed?"
2. *(→ Tier B)* "If you had to describe how the other drivers behaved, what would you say?"
3. *(→ Tier C)* "Did the two feel like different places to you?"

**Never ask** "which felt more chaotic?" or "which one felt Indian?". Those hand over the
answer and produce a result that means nothing.

---

## 6. Scoring — one sheet per tester

Record the **highest tier reached**, plus the verbatim quote that earned it.

| Tier | What it means | Example of what you'd hear |
|---|---|---|
| **A** | Culture language, **unprompted**, at Q1 or Q2 | "that one's a free-for-all", "nobody stays in their lane", "people just cut in front of you", "it felt like driving back home" |
| **B** | Culture language only after neutral probe (rung 2) | "…the drivers were more reckless, I guess" |
| **C** | Only after the leading probe (rung 3) | "now you mention it, yeah, different places" |
| **D** | **Speed or quantity only** | "that one was faster", "more cars in the second one" |
| **E** | No difference articulated | "they seemed the same" |
| **VOID** | You used a forbidden word first | — |

Also record, one line each:

- Did they **name a real place** unprompted? (bonus, not required)
- Which signal did they cite — **lane behavior**, **cutting in**, **pedestrians**,
  **vehicle types**, or **something we didn't predict**?
- Anything **surprising**. This earns its own line; it is usually where the real finding is.

> **Tier D is the designed failure mode.** The profiles were given near-identical mean speeds
> (170 vs 178) and spawn rates (130 vs 118) specifically so that "faster" and "more cars"
> would *not* be available as answers. A cluster of Tier D means the behavioral difference
> is not landing and something is leaking through as raw pace — that is a real finding, and
> a bad one.

---

## 7. The decision rule — NEEDS SIGN-OFF

`KILL.md` says testers must name the difference unprompted, but sets no count. Proposed:

- **PASS** — **3 or more of 5** reach **Tier A**. Proceed past the kill gate.
- **WEAK PASS** — 3+ reach **Tier A or B**, but fewer than 3 at A. The idea survives, but the
  signal needs strengthening before any further investment. Treat the exaggeration pass as
  *tuning*, not as the retry.
- **FAIL** — fewer than 3 reach Tier A or B, **or** 3+ land at Tier D.
  → Spend the **one permitted exaggeration retry** from `KILL.md`. Add honking. Add the
  player fail-state (`BRIEF.md` risk 1 — do this *before* touching profile numbers). Push
  lane discipline and gap acceptance to caricature. Re-test with **new testers** — the
  original five are now contaminated and cannot be reused.
- **FAIL AGAIN after the retry** → **stop.** The location-culture USP is abandoned, per the
  pre-committed condition. Shelve, or restart as a plain 2D driving game with a new brief.

**Do not re-test with the same people.** Once someone knows what the test is about, they
cannot un-know it, and every later response is a Tier C dressed as a Tier A.

---

## 8. After all sessions

Write `factory/TEST_RESULTS.md`: every verbatim first sentence, every tier, the tally, and
the verdict against §7 — **written before any tuning**, so the result cannot drift toward
whatever gets built next.

If the verdict is FAIL, write it down as FAIL. A test whose result is decided after seeing
the result is not a test.
