# Roadmap Next

> Revised 2026-08-02 after P0 + P1 completion and external review. Priorities
> reshaped by benchmark findings — see [BENCHMARK_JOURNEY.md](./BENCHMARK_JOURNEY.md)
> for how the conclusions were reached, and the Engineering Report (in the
> separate paper repository, to be published) for the reproducible report.

---

## ✅ Completed

### P0 — Platform-wide testing (done, v0.2.2)
- T1–T7 functional tests all passed.
- Fixed 2 bugs found in testing: export field-mixing, panel empty-response retry.
- 88/88 tests passing.

### P1 — Execution Benchmark (done)
- 5-mode benchmark harness (M1/M1R/M2/M3/M4) on a 13-case corpus.
- **Reliability finding:** task decomposition lifts success 31%→92%; retry alone +8 pts; decomposition is the driver.
- **Quality finding:** multi-model Panel+Judge beats single-model pipeline on accuracy/coverage/overall/hallucination (blinded dual-LLM grading, 7/7 agreement, human-anchored 3/3).
- Outputs: `scripts/benchmark.ts`, the Engineering Report (separate paper repository), `docs/HANDOFF/BENCHMARK_JOURNEY.md`.

---

## 🔴 Strategic shift (from benchmark + external review)

The benchmark changed Verdex's validated value proposition. Everything we
proved is about **Execution** (reliability, decomposition, multi-model
quality) — nothing tested is about **Knowledge Representation** (IR / Skill).
The roadmap below reflects this: execution understanding next, knowledge
representation deferred until we know what's worth representing.

---

## 🟡 P2 — Execution Understanding (next)

Understand *why* the pipeline wins, not just *that* it wins.

- **Trace inspection:** analyze the remediated traces to characterize *when*
  each mode fails and *what* decomposition changes about the failure mode.
- **Failure taxonomy:** empty-response vs parse-failure vs refusal vs
  low-quality-but-valid — which does decomposition actually fix?
- **Extract-step robustness:** the extract pre-stage has a high empty-response
  rate (6/13 cases even with 4× retry). Investigate root cause (prompt
  structure? streaming? model behavior?) — this is both a research question
  and a product defect.
- **Judge-input confound resolution:** the one residual confound in M2 vs M3
  (M3's Judge gets 2 analyses, M2's gets 1). Run the isolating experiment:
  feed M2's Judge two copies of the same single-model analysis.

## 🟢 P3 — Real User Benchmark (validate perceived value)

The benchmark proved M3 > M2 on *objective* quality. The open question
(ChatGPT's framing): **do users perceive the +0.9 quality gap?** If not, the
commercial value of multi-model is zero regardless of benchmark scores.

- Recruit ~20 users for a between-subjects task study.
- Randomize M2 vs M3 output; measure: completion time, revisions needed,
  follow-up questions, copy/adopt behavior, stated preference.
- Metrics that map to commercial value, not just objective quality.
- Requires user recruitment (owner's capability) — design first, then assess
  feasibility.

## 🔵 P4 — Knowledge Representation (deferred)

Only after P2/P3 confirm *what* is worth persisting.

- Knowledge IR schema design (wait for execution-understanding data to emerge).
- Skill / MCP export hardening (consumer-side validation).
- The benchmark showed "what produces value"; this phase decides "what to
  save from that value."

## ⚪ Maintenance / known issues

- **Extract empty-response** (product defect): 6/13 benchmark cases had
  extract return empty even after 4× retry. Affects real users, not just
  benchmarks. Root-cause investigation belongs in P2 but a stopgap
  (non-streaming fallback? prompt rewrite?) may be warranted sooner.
- **Original author's audit leftovers** (intentionally kept): Anthropic system
  double-send, DEFAULT_JUDGE_PROMPT fallback, toggleSidebar/clearError not
  memoized, SettingsModal double-mount.

## ❌ Explicitly NOT doing (for now)

- Knowledge IR Schema design (wait for P2/P3 data).
- Pulling in Graphify code (ideas already absorbed).
- Separating Synthesizer + Arbitrator (awaiting validation).
- Evidence→Inference→Claim→Decision chain (over-engineering).
- Continuing architecture-theory discussion without data (the benchmark was
  the antidote to this — see MULTI_MODEL_REVIEW.md §8).
