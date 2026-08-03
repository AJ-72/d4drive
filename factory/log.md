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
