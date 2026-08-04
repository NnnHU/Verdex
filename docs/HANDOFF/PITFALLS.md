# ⚠️ Pitfalls (Never Step on These Again)

> 9 real pitfalls + 2 architecture lessons + 4 benchmark-era pitfalls. New sessions must read this first.
> Last updated: 2026-08-03

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

---

## Benchmark Pitfall 1: Empty extract response poisons the whole pipeline

**Symptom**: M2/M3 outputs read "cannot answer — extracted knowledge is empty"; graders score them 1/5.
**Root cause**: The extract pre-stage (`streamChat` directly, no retry) frequently returns an empty string on DeepSeek. That empty "extracted knowledge" is fed to Panel and Judge, who correctly report they cannot answer — but the *whole turn* looks like a model failure when really only the extract step failed.
**Fix**: `streamChatWithRetry` (4 attempts, 1.2s backoff) on the extract step. Usable-case rate rose from 1/13 to 7/13.
**Lesson**: An empty response *anywhere* in a multi-step pipeline silently degrades everything downstream. Every stage that feeds the next needs its own empty-response guard, not just the final call.

---

## Benchmark Pitfall 2: Parse placeholders counted as success (the most dangerous bug)

**Symptom**: The auto-generated benchmark SUMMARY reported "100% success" for every mode — implausibly clean.
**Root cause**: `parseJudgeResponse` emits non-empty placeholder strings on failure (`"(could not parse structured consensus)"`, `"(judge returned no content)"`). A naive "non-empty field = success" check counted these placeholders as success, hiding the real ~31% failure rate of single-shot mode.
**Fix**: Introduced `isPlaceholder()` to exclude parse-fallback strings; success requires *real* content, not just non-empty strings.
**Lesson**: *The most dangerous failures are the ones that look like success.* Always sanity-check "too clean" results against plausibility, and define success by content validity — not by structural non-emptiness. This bug would have made the entire benchmark worthless if not caught.

---

## Benchmark Pitfall 3: "Plain text, not JSON" triggers DeepSeek empty completions

**Symptom**: the extract step returned empty on 6/13 cases even with 4× retry.
**Root cause**: the benchmark's extract prompt said "Output plain text notes, not JSON" — asking a JSON-tuned model (DeepSeek) to suppress JSON triggered empty completions.
**Fix**: aligned the extract prompt to the production path (JSON output, system message, temp 0.3, maxTokens 8192). Usable-case rate rose 5/13 → 13/13.
**Lesson**: when a model is RLHF'd for a specific output format (JSON), asking it to suppress that format is a reliability risk. Test with the production prompt, not a divergent benchmark-only variant.

---

## Benchmark Pitfall 4: Judge leaks "Expert 1/2" panel meta-structure into final output

**Symptom**: M3 (multi-model) verdict contained "Expert 1 stresses... Expert 2 frames..." — leaking internal pipeline structure into user-facing output.
**Root cause**: DeepSeek's Judge, when given multiple analyses, persistently invents "Expert N" labels to organize them — even when explicitly told not to (3 rounds of prompt rewrites failed).
**Fix**: `stripPanelMeta()` in `parseJudgeResponse` — deterministic post-processing that rewrites "Expert 1/2" → "one analysis / another analysis". Not dependent on model compliance.
**Lesson**: when a model behavior is persistent despite prompt instructions, fix it at the engine layer (post-processing), not by arguing with the model. Negative prompt instructions ("don't do X") are unreliable.
