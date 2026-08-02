# GROUND_TRUTH.md — Step 0.5

Assume the user has nothing. Everything below is either **verified by a command that
returned**, or **confirmed by the user**, or **flagged as not yet confirmed**.

**Date:** 2026-08-02
**Machine:** Windows 11 Pro (10.0.26200), PowerShell + Git Bash available
**Repo:** `C:\workspace\d4drive` — empty, **not yet a git repository**

---

## Verified present (commands run 2026-08-02)

| Requirement | Command | Result |
|---|---|---|
| Node runtime | `node -v` | **v24.18.0** ✅ |
| Package manager | `npm -v` | **11.16.0** ✅ |
| Version control | `git --version` | **2.55.0.windows.3** ✅ |
| Git identity | `git config --global user.name/.email` | **Anand Jayaram / anandj82@gmail.com** ✅ |

## Verified absent (and confirmed not needed for the spike)

| Thing | Status | Consequence |
|---|---|---|
| Python | not installed | Not needed — stack is TypeScript |
| Rust/cargo | not installed | Not needed |
| Godot | not installed | Not needed — considered and rejected, see DECISIONS |

## Confirmed by user

- **Stack:** TypeScript + HTML5 Canvas + Vite. No game engine. Chosen because the traffic AI
  *is* the product, and an engine's abstractions would be fought rather than used.
- **Testers:** 3–5 friends/family, **in person**, on the user's own laptop.

## Consequences of the tester answer — the important one

Because testing is **in person on the developer's machine**, the spike needs **no hosting,
no deploy, no accounts, and no domain.** `npm run dev` on localhost is the entire delivery
mechanism for the kill test.

This is worth stating explicitly because the alternative answer (remote testers) would have
silently added a hosting account, a deploy pipeline, and a build-output task to the critical
path of the *kill gate itself* — i.e. work that must exist before the idea can be validated.
It does not. **Total external accounts required to reach the kill decision: zero.**

## Accounts required

**For the spike (Step 0's cheap test): none.**

For anything after a passing spike, these become live questions and are *deliberately
deferred* — they sit behind the kill gate and must not be set up before it:

- **GitHub** — for remote backup / eventual hosting. Not required to build or test.
  Free tier is sufficient. No card.
- **Static host** (Netlify / Vercel / GitHub Pages) — only if the game is ever shared
  remotely. Not required for in-person testing. Free tier sufficient, no card.

## Free-tier limits with operational consequences (post-spike)

Flagged now because they become **tasks**, not footnotes, the moment real map data enters:

- **OpenStreetMap Overpass API** — free, no API key, but heavily rate-limited and subject to
  fair-use blocking. Sustained querying from a game client will get an IP throttled. A real
  location-picker feature needs caching and a descriptive `User-Agent`; this is a task.
- **Nominatim (place-name → coordinates)** — free, no key, but the usage policy forbids
  heavy automated use and requires a valid `User-Agent`. Same story: cache or self-host.
- Neither of these is touched by the spike. That is intentional.

## One-way / `[STRUCTURAL]` choices being made now

- `[STRUCTURAL]` **TypeScript + Canvas, no engine.** Reversible early, expensive after the
  traffic AI and rendering are written. Accepted knowingly; see `factory/DECISIONS.md`.
- `[STRUCTURAL]` **The traffic-profile data shape.** Not yet designed. This is the single
  most load-bearing decision in the project — every agent behavior, every city, and the
  entire USP route through it. It must be given as literal code in the plan, never described
  in prose, and it is a human checkpoint.

## Human dependencies

- **3–5 in-person testers**, needed *after* the spike is built and *before* any further
  work is justified. This is the only human dependency, and it gates the kill decision.
  It is blocked by other people's availability, not by code — so it should be scheduled
  the moment the spike compiles, not after.

---

## T0 — the first task in the plan. Blocks everything.

**Done-condition = commands that return, not intentions.**

```bash
node -v                 # expect v24.x
npm -v                  # expect 11.x
git --version           # expect 2.5x
cd /c/workspace/d4drive
git init                # repo does not exist yet — this is real work, not a check
npm create vite@latest . -- --template vanilla-ts
npm install
npm run dev             # expect: local URL served, opens to a page in the browser
```

**T0 passes when:** `npm run dev` serves a page at localhost that renders in a browser, and
`git status` reports a repository on an initial branch. Nothing else. No game code.

---

## Foreman's note

The class of gap this step exists to catch is **absences** — things the plan silently assumes.
The one this pass actually caught: had testing been remote, the kill test would have depended
on a deploy pipeline that no one had listed, discovered only when it was time to run the test.
Watch for that same class again — the next absence is likely to be another *prerequisite of a
verification step* rather than a prerequisite of a build step.
