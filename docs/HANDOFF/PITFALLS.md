# ⚠️ Pitfalls (Never Step on These Again)

> 9 real pitfalls encountered + 2 architecture lessons. New sessions must read this first.
> Last updated: 2026-07-29

---

## Pitfall 1: React Hooks Rules — early return must come after all hooks

**Symptom**: Blank-screen crash.
**Root cause**: In `App.tsx`, the `if (!moa.loaded) return` was placed before `useEffect`, causing hooks count changes and crashing React.
**Rule**: All hooks must run unconditionally before any `if (...) return`.

---

## Pitfall 2: `%APPDATA%` does not expand in bash

**Symptom**: `cmd /c "...%APPDATA%..."` never finds the file (always NOT_FOUND).
**Root cause**: bash doesn't understand Windows cmd's `%VAR%` syntax.
**Correct**: Use the full path with forward slashes, or `echo $APPDATA`.

---

## Pitfall 3: Tauri 2 fs permissions use `fs:allow-appdata-*`

**Symptom**: fs silent write failure.
**Root cause**: The generic permission's default scope is empty.
**Config**: `fs:allow-appdata-read/write/meta`.

---

## Pitfall 4: Port 1420 in use

**Symptom**: `Port 1420 is already in use`.
**Handling**: `netstat -ano | grep ":1420" | grep LISTENING` → `cmd //c "taskkill /F /PID <pid>"`.
**Note**: In bash, `taskkill /F` must be invoked via `cmd //c`.

---

## Pitfall 5: After changing Vite env you must restart the dev server

**Symptom**: Changes to `.env` don't take effect.
**Root cause**: `import.meta.env` is injected at build time; HMR does not re-read `.env`.
**Correct**: Stop server → restart → refresh.

---

## Pitfall 6: outputMode conflated two dimensions (fixed)

**Symptom**: Users couldn't tell apart the relationship between Verdict/Extract/Map-Reduce.
**Fix**: Split into `taskType` (session level) + `outputKind` (engine-internal).

---

## Pitfall 7: Map-Reduce is a negative optimization for large models

**Symptom**: Running 7 documents through Map-Reduce is 4-5x slower than Extract.
**Root cause**: A single large-model call takes 36-47s, while the Reduce merge takes 119-187s.
**Fix**: Change the threshold to "single-pass first" (only triggered above 150k characters).
**See also**: `docs/ORCHESTRATION_ROADMAP.md` performance analysis + `scripts/perf-test.mjs`.

---

## Pitfall 8: cleanAttachment closure timing bug

**Symptom**: The "cleaned" marker never appears.
**Root cause**: The closure's sessions couldn't see the newly-added attachment from the recent addAttachments call.
**Fix**: Have cleanAttachment accept a sourceText parameter.

---

## Pitfall 9: Pre-seeded fake providers pollute the UI

**Symptom**: Empty fake models for Llama/Qwen/DeepSeek/Claude show up every time.
**Fix**: Set `providers=[]` in config.template.json; rely solely on the .env seed.

---

## Architecture Lesson 1: Template JSON missing new fields → blank screen

**Symptom**: After `localStorage.clear()`, a blank screen with `Cannot read properties of undefined (reading 'length')`.
**Root cause**: config.template.json lacked the `knowledgeAssets`/`assetCategories` fields, leaving them undefined after template spread.
**Fix**: Add a `?? []` fallback to the template branch of loadConfig.
**Lesson**: Every time you add a new field to ConfigFile, **you must sync the template fallback accordingly**.

---

## Architecture Lesson 2: React StrictMode double-call → duplicate Asset

**Symptom**: Saving once produces two identical Assets.
**Root cause**: In dev mode, the setSessions functional update is called twice.
**Fix**: Use `packedTurnsRef` (a `Set<turnId>`) as a dedup guard.
**Lesson**: Any side effect inside a setSessions/setXxx functional update (such as writing derived state) needs a dedup guard.
