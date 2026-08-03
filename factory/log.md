# log.md — build diary

---

## T0 — Scaffold · 2026-08-03 · **PASS**

**What changed:** `package.json`, `tsconfig.json`, `index.html`, `src/main.ts`,
`.gitignore`, `.claude/launch.json`. Deps: vite 5.4, typescript 5.6, vitest 2.1. Git repo
initialised, first commit `65068a7`.

**Proof result:**
- `npx tsc --noEmit` → clean
- `npm install` → exit 0
- Dev server on :5173 → `status=200`, and `/src/main.ts` served transpiled
- `git log` → repository exists with one commit

**Contract result:** C1–C5 not yet applicable (no game code). Not claimed as passing.

**Surprising — 3 items, all environmental:**

1. **`npm create vite@latest .` could not be run as the plan specifies.** The directory
   already contained `factory/`, and current Vite prompts *"Current directory is not empty →
   Remove existing files?"*, which cannot be answered in a non-interactive shell. Running it
   blind risked deleting the entire project record. Scaffolded by hand to the same
   done-condition. **This is a plan defect, not a build defect:** T0 was written assuming an
   empty directory, but the pipeline itself creates `factory/` before T0 runs. Any future
   project using this skill hits the same thing.

2. **The Browser pane could not open the app.** `preview_start` resolves `.claude/launch.json`
   against the *old* working directory (`C:\workspace\musicteacher`), and direct navigation
   to `http://localhost:5173` is blocked by policy. Verified over HTTP with curl instead.
   **This matters for T16**, whose dry run assumes browser automation — counter sampling and
   the 6-screenshot frozen-frame test both need a real browser. If this is not resolved,
   T16's D-2 cannot run as written and the gate needs a different mechanism. Flagged now
   rather than discovered at the gate.

3. **CRLF warnings on every file.** Windows checkout; harmless, but a `.gitattributes` would
   silence it. Not doing it unprompted — out of plan scope.

**Next:** T1 (fixed-timestep loop) — `[STRUCTURAL]`, so the loop halts here for human review.

---

## T0b — Browser preview unblocked · 2026-08-03 · **PASS** · commit `90268db`

Resolves surprise #2 above, which was flagged as a threat to the T16 dry-run gate.

**Three separate causes, each of which alone would have blocked it:**

1. **Port collision, self-inflicted.** The stray `npx vite --port 5173` started during T0's
   verification was still holding the port. Killed (PID 28144). `autoPort: true` set so a
   future collision resolves itself — D4Drive has no OAuth callback, webhook, or CORS origin
   that needs a fixed port.
2. **`autoPort` alone did nothing.** Vite pins 5173 regardless of the `PORT` env var, and
   `package.json` carried no `--port` flag to remove. Added `vite.config.ts` with
   `server.port = process.env.PORT`. **Without this the setting is silently inert** — it
   looks configured and isn't.
3. **`preview_start` resolves `.claude/launch.json` against the session's *original* working
   directory** (`C:\workspace\musicteacher`), not the current one, and ignores the config in
   the project itself. That directory was empty. Wrote a launch config there invoking
   `npm --prefix C:/workspace/d4drive run dev`, so the tool starts the right project from the
   only place it will look.

**Proof:** `preview_start` → server on :5173, tab opened. `document.title === "D4Drive"`,
canvas present at 1280×720, **1246 non-background pixels** in the text band (colour
`[55,61,69]` — antialiased `#7d8794` on `#22262d`), console error-free.

**Note on the proof:** the screenshot action fails when the Browser pane isn't displayed —
"not compositing frames". Verified by reading pixels out of the canvas with JavaScript
instead, which is stronger evidence than a screenshot anyway: it proves the canvas *painted*,
not merely that a page exists.

**Still open for T16:** D-2's frozen-frame test needs 6 real screenshots, and screenshots
require the Browser pane to be visible. Pixel sampling can verify D-1's counters and D-3's
liveness without it, but **D-2 cannot be automated while the pane is hidden** — it needs the
pane open, or it becomes a manual step for the user. Not a blocker now; must be settled
before the gate.

**Surprising:** three independent failures stacked in one feature, and fixing any two would
still have left it broken with a different error message. The `autoPort` one is the
dangerous kind — a setting that reports success and does nothing.

---

## T1–T4 — the structural sitting · 2026-08-03 · **PASS** · commit `ba0f2e8`

All four verbatim from `PLAN.md`. **25 tests pass, `tsc --noEmit` clean.**

**What changed:** `src/engine/loop.ts`, `src/road/road.ts`, `src/profiles/{types,validate,
trivandrum,singapore}.ts`, `src/sim/{rng,speed,player}.ts`, `src/input/input.ts`,
`src/render/renderer.ts`, `src/main.ts` rewritten. Four test files.

**Invariant verified by grep:** `src/profiles/` does not import `src/road/`; the only
`profiles` match under `src/road/` is the comment stating the rule. Keyboard events are read
only in `src/input/`.

**Contract result:** C1–C5 still not claimed. C1 needs traffic (T5+), and see the blocker below.

### Surprising — 1: the plan's T3 attack 6 was not a valid test

`PLAN.md` specified: *"Roll 10,000 Singapore bus speeds and 10,000 car speeds → the bus
maximum stays below the car minimum. If they overlap, the kind factor is applied in the wrong
order."* It fails on correct code, for two independent reasons:

1. Singapore is mean 178 / stdDev 12, so the clamp bounds `[62.3, 338.2]` are **never
   reached**. The clamp never engages, so the ordering it probes is unobservable there.
2. Bus (mean 138.8) and car (mean 178) are ~2.9σ apart. Across 10,000 samples the tails
   overlap regardless of implementation.

**The check was therefore incapable of detecting the bug it was written for.** Replaced with
one that works: ordering is only observable where the clamp bites, i.e. Trivandrum. Correct
order floors bus speeds at `0.35 × 170 × 0.78 = 46.41`; the wrong order clamps the low tail
back up to `59.5`. That distinction is sharp and seed-independent.

**Worth noting as a pipeline lesson:** a weaker builder would most likely have "fixed" this
by loosening the assertion until it passed, leaving a test that asserts nothing — exactly
the *tests that can't fail* category the Step 6 review is meant to catch.

### Surprising — 2: two of my own test expectations were wrong

Both in `loop.test.ts`, both arithmetic, code unchanged in both cases:
- `advance(0.5)` exceeds the 0.25s clamp, so 15 steps is correct, not 30. I wrote the
  expectation as though the clamp under test did not exist.
- Ten additions of `0.01` sum to `0.09999999999999999`, landing just under the sixth tick.
  Rewritten to assert 5–6 steps, since the real discriminator is that a remainder-dropping
  loop yields **zero** — each 10ms frame is shorter than one 16.67ms tick.

### Surprising — 3, and it BLOCKS T16: rAF is dead while the pane is hidden

Attempted to verify T4 by driving the car through the debug hook. The player did not move at
all. Cause is not the code:

```
rafFramesIn1s: 0,  visibilityState: "hidden",  hidden: true,  hasFocus: false
```

**`requestAnimationFrame` fires zero times per second when the Browser pane is not
displayed.** The tab never composites, so the game loop never steps. Same root cause as the
failed screenshot in T0b.

Consequences, in order of severity:

- **T16's dry run cannot run as written.** D-1 (counter sampling) and D-3 (liveness) both
  assume the simulation advances in a browser. It does not. D-2 (screenshots) was already
  known to need a visible pane.
- **C1–C5 cannot be verified from this session** while the pane stays hidden. They are
  browser checks by definition.
- Mitigation used here: T1 and T4 are verified headlessly in Node with a hand-driven clock,
  which is *stricter* than a browser check — it tests the 60-second backgrounded-tab case
  directly, which no live browser test could do conveniently.

**Proposed fix for T16, for the user to rule on:** move D-1 and D-3 to a headless Node
harness that runs the sim with the seeded RNG at faster than real time and counts events
directly. This is better evidence than watching a browser for 60 seconds — deterministic,
repeatable, and it can sample far more than 60 seconds. D-2's screenshots still require the
pane to be open, and that part stays manual unless the pane is displayed.

**Next:** T5 (spawning) — first `[LEAF]`. Night-shift eligible.
