# Benchmark Journey — How We Got from P0 Testing to an Engineering Report

> A chronological record of the P0 → P1 benchmark work: every experiment, every
> bug found, every correction, and every external review that reshaped the
> conclusions. Written so a future session (or future us) can retrace not just
> *what* we concluded, but *how* we got there — including the wrong turns.
>
> Last updated: 2026-08-02

---

## Why this document exists

The Engineering Report (in the separate paper repository, to be published)
states the *conclusions*. This document records the *process* — the sequence
of experiments, the dead ends, the statistics bugs, and the external critiques
that forced re-interpretation. The process is the harder thing to reconstruct
later, and it's where most of the methodological learning lives.

---

## Phase 0 — P0 platform testing (the starting point)

**Goal:** end-to-end-verify the existing app (three task types, Knowledge Vault,
export, stepped config bar, UX features) before adding anything new.

**Outcome:** T1–T7 all passed functionally, but surfaced **two bugs**:

1. **Export field-mixing bug.** When a user ran `document_extract` with the
   "four-field verdict (extract)" schema, `packExtractAsset` ran
   `summarizeStructuredData` over `{consensus, divergence, blindspots, verdict}`
   and stuffed the same semicolon-joined blob into both `consensus` and
   `verdict`. The exporter then re-emitted all four fields under a redundant
   "Structured Data" section. **Fix:** `packExtractAsset` now detects the
   four-field shape and splits values correctly; exporters skip the Structured
   Data section when it duplicates the verdict. Covered by 3 new regression
   tests (84 → 88 tests).
2. **Panel empty-response not retried.** `runPanel` only retried on *thrown*
   errors, so a model returning an empty stream completed as `ok:true` with
   empty text. **Fix:** an empty completion now triggers one retry within
   `PANEL_MAX_ATTEMPTS`.

Both shipped as v0.2.2. These bugs matter beyond P0: the empty-response retry
fix later turned out to be central to the benchmark story (Phase 3).

---

## Phase 1 — Benchmark v1: M1 / M2 / M3 (single-shot vs multi-step vs multi-model)

**Question (from MULTI_MODEL_REVIEW.md Hypothesis A):** does a structured
multi-step flow beat a single-shot answer?

**Harness built:** `scripts/benchmark.ts` drives the *real* engine
(`runMoaSynthesis` / `streamChat` / `parseJudgeResponse`) — not a re-implemented
fetch — so the pipeline under test is exactly what the app runs. Three modes:

- **M1** single-shot (1 call)
- **M2** single-model multi-step: extract → analyze → judge, one model (3 calls)
- **M3** multi-model Panel+Judge (4 calls)

**First corpus:** 1 case (grantham.txt, ~3.3k chars). First run looked clean:
all three modes succeeded, M3 produced 2.4× the output chars of M1/M2.

**Tentative conclusion (later overturned):** "M2 ≈ M1, M3 richer" — based on
character counts.

---

## Phase 2 — Corpus expansion (13 cases) + the reliability surprise

**Corpus grew to 13 cases:** 7 standard Chinese ASR docs, 3 large docs, 1
super-large, 1 multi-document. Sourced from the Grantham article series.

**Full run (13 cases × 3 modes = 104 API calls).** The surprise:

| Mode | Success rate |
|---|---|
| M1 single-shot | **46%** (6/13) — 7 cases returned *empty* |
| M2 / M3 | **92%** (12/13) |

M1 failed on 7/13 cases with completely empty responses (`raw len = 0`). This
reframed the finding: the story wasn't "M3 is richer" — it was
**"single-shot silently fails ~half the time; the pipeline is what makes it
reliable."** Wrote this up as the first SUMMARY.

---

## Phase 3 — External review #1 (ChatGPT): "your Q3 has a confound"

Shared the v1 results. ChatGPT's critique reshaped everything:

1. **Accepted:** "pipeline > single-shot" is well-supported.
2. **Rejected our M3-vs-M4 conclusion:** M3 and M4 differ along *two* axes
   (model count AND pipeline structure), so "M3 > M4" cannot be attributed to
   multi-model alone. The correct isolation is **M2 vs M3** (pipeline held
   constant) — and there, reliability is identical (92% = 92%).
3. **Proposed Benchmark v2:** add **M1R** (single + retry) and **M4** (single
   self-critique) to build a clean variable-isolation chain:
   `M1 → M1R → M2 → M3`, plus `M4` to test self-reflection.

**We accepted all three points** and revised the SUMMARY to "multi-model's
marginal value is UNPROVEN on quality" — a deliberate step back from the
over-strong earlier claim.

---

## Phase 4 — Benchmark v2: M1R + M4 (isolating retry and self-critique)

**Added two modes** to the harness. Incremental run mode (`npm run bench`
without `--full`) runs only the new modes and merges prior traces, avoiding a
full re-run.

**Run completed.** Then the critical moment: the auto-generated SUMMARY
reported "100% success" for every mode — which was implausible. Investigation
revealed a **statistics bug**.

---

## Phase 5 — The placeholder bug (the most important methodological moment)

**The bug:** `parseJudgeResponse` emits non-empty placeholder strings on
failure (`"(could not parse structured consensus)"`, `"(judge returned no
content)"`). A naive "non-empty = success" check counted these as success, so
every mode showed 100%.

**The fix:** introduced `isPlaceholder()` to exclude parse-fallback strings
from the success criterion, and `countReal()` for quality stats.

**Corrected results:**

| Mode | Real success rate |
|---|---|
| M1 single-shot | **31%** (4/13) |
| M1R single + retry | **38%** (5/13) |
| M2 single-model pipeline | **92%** (12/13) |
| M3 multi-model Panel+Judge | **92%** (12/13) |
| M4 single-model self-critique | **38%** (5/13) |

**Why this mattered more than the numbers:** catching and correcting our own
measurement bias became a core part of the report's credibility. We kept the
story in the Engineering Report (§5.3) deliberately — *"the most dangerous
failures are the ones that look like success."*

**The three questions answered:**
- **Q1 (M1→M1R):** retry alone adds only +8 pts (rescued 1 of 9 failures).
  Retry is insufficient.
- **Q2 (M1R→M2):** pipeline structure adds +54 pts. **Decomposition — not
  retry — is the real reliability driver.**
- **Q3 (M4 vs M3):** with the confound acknowledged, this only tells us our
  *naive* self-critique is insufficient — not that self-critique in general
  fails.

---

## Phase 6 — Quality benchmark: M2 vs M3 (the missing dimension)

v1/v2 measured *reliability* (does output come back?) and *richness* (chars).
Neither is *quality*. ChatGPT's framing: "92% means successfully returned
structured output, NOT 92% correct."

**Design:** for the 7 cases where both M2 and M3 produced real output, grade
them with **two independent LLM judges** (Gemini + KIMI K2.6) in a **blinded
A/B setup**. Position bias cancelled by per-case A/B reordering. Rubric:
accuracy / hallucination / coverage / overall / preference.

### 6a — First attempt failed: the extract-empty poison

The first grading pass (Gemini) returned bizarre results: nearly every output
scored 1/5 with "did not read the text." Investigation showed the M2/M3
*extract pre-stage* was returning empty (the same empty-response problem as
M1, but in the extract step) — poisoning the whole pipeline so Panel and Judge
correctly reported "cannot answer."

**Fix:** added `streamChatWithRetry` (4 attempts, 1.2s backoff) to the extract
step in M2/M3. Added a `--remediate` mode that re-runs only M2/M3 and
overwrites their traces in place.

### 6b — Remediation rounds

- Round 1 (2× retry): usable cases rose from 1/13 to ~5/13 — better but
  extract still failed often.
- Round 2 (4× retry, longer backoff): **7/13 cases** had both M2 and M3
  producing real analysis. Sufficient for quality grading.

### 6c — Dual-LLM blinded grading (the clean run)

Re-generated the grading pack from remediated traces. Both Gemini and KIMI
graded all 7 cases blinded.

| Metric | M2 | M3 | Δ |
|---|---|---|---|
| Factual accuracy | 3.14 | **4.14** | +1.00 |
| Coverage | 2.93 | **3.79** | +0.86 |
| Overall quality | 2.86 | **3.71** | +0.86 |
| Hallucination (count/14) | 3 | **2** | M3 fewer |
| Preference wins (of 14) | 6 | **8** | M3 wins |

**Strongest signal:** both judges agreed on preference in **7/7 cases (100%
inter-rater agreement)** — two architecturally different LLMs, grading
independently and blinded, picked the same winner every time.

---

## Phase 7 — Human anchor validation

LLM judges can share blind spots. To validate, a domain-knowledgeable human
graded **3 cases blindly** (deliberately chosen to include 2 cases where the
LLMs picked single-model M2 — the counter-intuitive choice).

**Result: 3/3 agreement with the LLM judges**, including both M2 wins. This
confirmed the LLM judges are not blindly pro-multi-model — they pick
single-model when it's actually better, and the human agrees.

---

## Phase 8 — External review #2 (ChatGPT): "evidence consistently favors"

Shared the quality results. ChatGPT's updated assessment:

1. **Withdrew** its earlier "Verdex value unproven" stance — two things are
   now experimentally supported (pipeline reliability; multi-model quality).
2. **Insisted on precise wording:** "evidence consistently favors" not "proves"
   — n=7, single domain.
3. **Caught a residual confound:** M3's Judge receives 2 analyses vs M2's 1,
   so "model count" and "Judge input richness" still co-vary. Recommended
   "largely isolates" over "isolates." **We accepted and reworded.**
4. **Strategic pivot:** the biggest insight wasn't any single number — it was
   that Verdex's validated value is **Execution** (reliability, decomposition,
   multi-model quality), not **Knowledge Representation** (IR/Skill, none of
   which we tested). Recommended repositioning toward "Reliable Execution."
5. **Recommended writing an Engineering Report** as the project's first "hard
   asset": a reproducible benchmark is harder to copy than architecture
   diagrams.

---

## Phase 9 — Engineering Report

Wrote the Engineering Report (+ CN), to be hosted in a separate paper
repository: a self-contained, reproducible report titled *"Structured Task
Decomposition Improves Reliability of LLM-Based Knowledge Analysis."*
Deliberately does NOT mention Verdex / Knowledge IR / Skill — it stands on the
experiment design alone. Includes the placeholder-bug story as a
methodological integrity marker.

---

## Artifacts produced (where each thing lives)

> **Reproducibility anchor:** the benchmark harness, corpus, and the v0.2.2
> bug fixes are all at repository commit `9301168`. The Engineering Report
> (separate paper repository) cites this commit as its reproduction baseline.

| Artifact | Location | Purpose |
|---|---|---|
| Benchmark harness (5 modes) | `scripts/benchmark.ts` | runs M1/M1R/M2/M3/M4 |
| Grading pack generator | `scripts/extract-grading.ts` | builds blinded A/B files |
| Corpus (13 cases) | `bench-samples/` | source docs + manifest |
| Run traces + reports | `bench-results/` (gitignored) | per-case + summary, full fidelity |
| Blind key | `bench-results/quality-grading-key.json` | A/B → mode mapping |
| Engineering Report | the Engineering Report (separate paper repository) (+CN) | the "hard asset" |
| Bug fixes (v0.2.2) | `src/services/assetPacker.ts`, `exporters/`, `moaEngine.ts` | P0 fixes + empty-retry |

---

## Key lessons (the process-level takeaways)

1. **Measurement bias is the silent killer.** The placeholder bug made every
   mode look 100% successful. Catching it required distrusting "too clean"
   results. Always sanity-check against plausibility.
2. **Isolate one variable at a time.** The M3-vs-M4 confound taught us to
   build chains (M1→M1R→M2→M3) where each step changes one thing. Without this,
   attribution is guesswork.
3. **External review catches overclaiming.** Both ChatGPT reviews forced us to
   step back from stronger-than-warranted conclusions. The final wording is
   much more defensible because of those critiques.
4. **The empty-response problem is systemic, not transient.** It appeared in
   M1 (single-shot), in the extract step (Phase 6a), and is the reason retry
   alone is insufficient. Decomposition is the structural cure.
5. **Reliability ≠ quality.** v1/v2 measured reliability; the quality gap only
   appeared under blinded grading. Different questions need different metrics.
6. **The process is the asset.** The report states conclusions; this document
   records how to reach them — which is what makes the work reproducible and
   the methodology transferable.

---

*Companion to the Engineering Report (in the separate paper repository). For
conclusions, read the report; for how we got there (and where we went wrong
first), read this.*
