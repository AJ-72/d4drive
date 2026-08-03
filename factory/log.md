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
