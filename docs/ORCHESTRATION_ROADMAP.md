# Verdex Orchestration Platform Roadmap (Completed)

> The roadmap and architecture document for upgrading Verdex from a "single-turn MoA synthesis engine" into a "three-stage document-intelligence orchestration platform." **All features are complete and verified (65/65 tests, pushed to GitHub).**
>
> - **Architecture**: three-stage fusion (taskType: document_extract / document_analysis / quick_qa)
> - **Core capabilities**: multi-turn memory + document input + schema extraction + Map-Reduce + ASR cleaning + multi-model analysis
> - **For the three-stage architecture, see**: [`THREE_STAGE_ARCHITECTURE.md`](./THREE_STAGE_ARCHITECTURE.md)
> - **Document version**: 2.0 · 2026-07-24
> - **Baseline commit**: `1591da9`

---

## 0. Conclusions First

### TL;DR

| Dimension | Conclusion |
|---|---|
| **Status** | ✅ **All complete.** 5-stage roadmap + three-stage architecture refactor + experience trio + full document_analysis pipeline. 65/65 tests pass, pushed to GitHub. |
| **Core capabilities** | ① Multi-turn memory (sliding window + summarization) ② Document input ③ Custom schema extraction + validation ④ Map-Reduce ⑤ ASR cleaning ⑥ Three-stage fusion architecture (taskType) ⑦ document_analysis (extract first → multi-model analysis → Judge synthesis) |
| **Architecture** | taskType (document_extract/document_analysis/quick_qa) replaces the old outputMode; outputKind (verdict/extract) decouples the engine internally; automatic single-model fallback. See [`THREE_STAGE_ARCHITECTURE.md`](./THREE_STAGE_ARCHITECTURE.md). |
| **JSON structure** | Custom schema (route A); the four-section verdict is demoted to a default template. |
| **Format strategy** | JSON throughout the pipeline; a "copy as MD" button (MD is not persisted). |
| **Map-Reduce positioning** | Demoted to a "single-call-first" fallback (real benchmarks show a large model's single call is far faster than Map-Reduce). See the performance analysis below. |
| **Recommended path** | 5 incremental stages: 1 memory → 2 document input → 3 schema extraction → 4 Map-Reduce → 5 ASR cleaning. Each stage is independently usable. |

### One-line recommendation

> Verdex has been upgraded from a "single-turn MoA synthesis tool" into a **three-stage document-intelligence orchestration platform**: document → extract structured knowledge → multi-model deep analysis → Judge synthesis verdict. It supports multi-turn memory, ASR cleaning, Map-Reduce, custom schemas, and single-model fallback. All features are complete and verified.

### Progress overview (updated 2026-07-24)

| Stage | Status | Verification |
|---|---|---|
| 1a Multi-turn memory (sliding window) | ✅ Complete | tsc 0 / 36 tests / real recall of three pieces of info |
| 1b Hierarchical summarization memory | ✅ Complete | tsc 0 / 63 tests / con.txt four categories + session-level persistence |
| 2 Document input (txt/md) | ✅ Complete | tsc 0 / 44 tests / real 7-document synthesis |
| **3 Custom schema extraction** | ✅ Complete | tsc 0 / 54 tests / dual-mode Judge + validation loop |
| 4 Adaptive Map-Reduce | ✅ Complete | tsc 0 / 63 tests / form A multi-document Map→Reduce |
| 5 ASR data cleaning (optional) | ✅ Complete | tsc 0 / 65 tests / clean on attachment load + session-level toggle |
| **Three-stage architecture refactor** | ✅ Complete | taskType replaces outputMode + full document_analysis pipeline + config simplification |

**All complete**: 5-stage roadmap + three-stage architecture refactor + experience trio + full document_analysis pipeline.
- For the three-stage architecture, see [`THREE_STAGE_ARCHITECTURE.md`](./THREE_STAGE_ARCHITECTURE.md)
- The Map-Reduce threshold has been corrected to "single-call-first" based on real benchmarks (see the performance analysis below)
- For detailed progress and implementation details, see section 4 of [HANDOFF.md](./HANDOFF/README.md)

---

## 1. Three orchestration capabilities × Verdex fit

For each item: what it is, Verdex's current state, the integration points (line numbers), what needs to change, and why it's needed.

### Capability A · Multi-turn context memory

**What it is**: Each Panel / Judge can see its own historical turn answers in a new round, so follow-up questions don't require re-explaining from scratch.

**Verdex's current state**: **Completely absent.** Each turn only receives the current prompt.

**Integration points (precisely located)**:
- `src/hooks/useMoa.ts:601-608` — already flattens history `session.messages` into a `history` string, but **only feeds it to the input-limit checker `checkInputLimits`, never passes it to the engine**. The code computes the history then throws it away.
- `src/hooks/useMoa.ts:762-767` — when constructing `SynthesisRequest`, the `prompt:` field is the history injection point.
- `src/services/moaEngine.ts:214-218` — the Panel messages array (system + single user).
- `src/services/moaEngine.ts:439-448` — the Judge messages array.
- `src/types/moa.ts:149-166` — the `SynthesisRequest` type needs a history field added.

**What needs to change**:
1. Add `panelHistory?: Record<providerId, ChatMessage[]>` and `judgeHistory?` to `SynthesisRequest`.
2. The engine's `callPanelOnce` / `runSingleJudge` should inject history before the current user message.
3. The state machine `send` should rebuild each panel's own history from `session.messages` by providerId (**per-Panel independent memory**, not mixed).
4. When over the limit, make one model call for summarization compression (not a simple truncation).

**Why it's needed**: This is a basic skill of an orchestration platform; without memory, analyzing multiple documents across turns loses context every turn.

### Capability B · Custom schema extraction + validation loop

**What it is**: The user provides/selects a JSON Schema → the Judge fills it per schema → validate → if non-compliant, have the model rewrite, until valid or the cap is reached. This is the engineering of the spirit behind kimi2's "fix special characters," and the watershed between a "toy" and a "tool."

**Verdex's current state**: **Partially present, but not a closed loop.**
- Panels have transient-error retries (`moaEngine.ts:199-289`, retry once on 5xx/429, no retry on 401/403) — network-layer retry, not content-layer validation.
- `parseJudgeResponse` (`moaEngine.ts:346-402`) can fault-tolerantly parse JSON — but this is a **passive fallback**: on detecting an error it just fills placeholders, **it does not ask the model to rewrite**.

**Integration points**:
- `src/services/moaEngine.ts:346` `parseJudgeResponse` upgraded to return `{ok, data, errors}`.
- New `src/services/schemaValidator.ts`: `validateAgainstSchema(text, schema)`.
- `src/services/moaEngine.ts:424-481` `runSingleJudge` adds a validate-rewrite loop (cap **3 times**).
- `src/types/moa.ts:149-166` `SynthesisRequest` adds `outputSchema?: object`.

**Why it's needed**: The platform must produce "JSON that can go into a database." The probability the model writes a complex schema correctly on the first try is low; without a closed loop, only manual firefighting can save it.

### Capability C · Adaptive Map-Reduce chunking

**What it is**: When input is large, automatically split into chunks → parallel Map extraction → Reduce merge; when small, send it whole. The user perceives nothing.

**Verdex's current state**: **Completely absent.** Panel fan-out is "ask multiple models the same question," not "split one large document across multiple processing units."

**Integration points**:
- `src/types/moa.ts:107` `MoaMode = "simple" | "advanced"` → extend to include `"mapreduce"`.
- `MoASessionConfig` (`moa.ts:116-134`) adds `chunkSize?`, `mapPromptId?`, `reducePromptId?`, `overlap?`.
- `Turn` (`moa.ts:241-249`) adds `mapOutputs?`.
- `MoaCallbacks` (`moa.ts:284-300`) adds `onMapStage?` / `onReduceStage?`.
- `src/services/moaEngine.ts:494` `runMoaSynthesis` adds a third branch: chunk → `Promise.all` Map → Reduce.
- UI: `src/components/MoAConfigBar.tsx:117-144` mode 2→3 states; `setMode` (`94-105`) adds a branch.
- Document input: `ChatMessage.content` (`moa.ts:29`) is currently a plain string; multiple files need a new mechanism (see §4).

**Why it's needed**: Future documents will be "uncertain in scale, all must be supported." Large documents **must be chunked** or they will definitely crash.

**Adaptive rules**:
```
Input arrives → estimate total tokens
  ├─ ≤ 60% of a single model's context → send whole (Map-Reduce degenerates to a single call, no waste)
  └─ > 60% → auto-chunk (chunkSize + overlap) → parallel Map → Reduce merge
```

---

## 2. Data reality vs. mode selection

> Explains "Map-Reduce is unnecessary for small documents, but necessary for the platform" — these are not contradictory.

**Grantham sample** (used for the first regression test): 7 txt files totaling **74,343 characters (~46K tokens)**, the largest single file 12K characters. Any single file fits comfortably in an 8K context; all 7 fit easily in 64K-128K. The hard part isn't chunking — it's ASR typos + spoken-style → strict JSON + cross-file synthesis.

**Platform need**: Future documents will be "uncertain in scale, all must be supported" — long reports/PDFs/codebases of tens of thousands to hundreds of thousands of characters per file will inevitably appear, and **must be chunked**.

**Conclusion**: Map-Reduce is a platform-level hard requirement, but it must auto-degrade for small documents. The Grantham sample takes the whole-package path without waste; large documents take the chunking path without crashing. **One codebase, two paths, invisible to the user.**

---

## 3. Three fusion-depth trade-offs (why we chose native upgrade)

| Dimension | Native upgrade of Verdex | Leave Verdex alone + external script |
|---|---|---|
| Capability completeness | Highest: memory/validation/chunking/dual-output all built in | Medium: a script can do it, but is disconnected from UI/session/templates |
| Reuse of Verdex infrastructure | Full reuse (Provider CRUD / dual-protocol / sessions / templates / i18n / themes) | Can only reuse ideas; code rewritten |
| Change surface | Large: six layers | Small: zero changes to Verdex |
| Long-term maintenance | One place | Two places (prone to drift) |
| Suited for | Productization, long-term use | One-off tasks, quick validation |

**Decision: native upgrade.** Reason: we want a "platform," not a "script." A native upgrade is a larger change, but it reuses all of Verdex's infrastructure, so long-term maintenance cost is actually lower than a dual-track approach.

---

## 4. Document input: an underestimated hard nut

> A prerequisite question beyond the three capability types: **Verdex currently has no entry point for "feeding in documents."**

**Current state**: `ChatMessage.content` is a plain string (`moa.ts:29`), `SynthesisRequest.prompt` is a single string (`moa.ts:151`), and the UI `ChatInput.tsx` has no concept of attachments. Verdex can currently only "ask questions," not "read documents."

**Integration plan (two layers)**:
1. **Data layer**: add `attachments?: Attachment[]` to `ChatSession` (`{id, name, text, chars, source}`). Read txt/md directly; parse PDF/Word on the Tauri Rust side (`src-tauri` already has an fs plugin).
2. **Injection layer**: the Map-Reduce engine pulls text from `session.attachments` as Map input; non-Map-Reduce modes can optionally "splice the document into the prompt."

**Stage constraint**: **The first version supports only txt/md**; PDF/Word is deferred to later stages (needs Rust crates such as `pdf-extract`/`docx`, adding build complexity).

---

## 5. Recommended path: 5 incremental stages

Each stage is independently usable, verifiable, and rollback-able. Strictly in order; later stages depend on earlier ones.

### Stage 1 · Multi-turn context memory (unlocks usability)
- **Goal**: follow-up questions no longer lose context. A standing HANDOFF task.
- **Changes**: all of capability A.
- **Deliverable**: a Verdex that can hold multi-turn conversations.
- **Effort**: medium.

### Stage 2 · Document input entry point (unlocks data sources)
- **Goal**: be able to add txt/md documents to a session.
- **Changes**: §4 data layer + ChatInput attachment UI.
- **Deliverable**: a Verdex that can read documents (first version splices into the prompt).
- **Effort**: medium-small. PDF/Word later.

### Stage 3 · Custom schema extraction + validation loop (unlocks structured output)
- **Goal**: stably produce legal JSON per the user's schema.
- **Changes**: all of capability B + schema template management + MD export rendering.
- **Deliverable**: a Verdex that stably produces structured JSON.
- **Effort**: medium (schema validation + Judge rewrite loop cap of 3 + template CRUD + renderer).
- **Empirical basis (measured 2026-07-23)**: during Stage 2 testing, the output for the 7 Grantham documents was one big block of Markdown text ("### 1. ... ### 2. ..."), **not** the nested structure like `grantham_models.json`'s `{thinking models:[...], causal chains:[...]}`. To produce structured data that can go into a database or be consumed by programs, Stage 3 is the only path. **Stage 3 must come before Stage 4** — because the Map stage of Map-Reduce depends on Stage 3 to define "what schema each document is extracted into."

### Stage 4 · Adaptive Map-Reduce (unlocks scale)
- **Goal**: large documents auto-chunk and extract in parallel; small documents go whole.
- **Changes**: all of capability C + chunking strategy.
- **Deliverable**: a general orchestration platform that can handle documents of any scale.
- **Effort**: large (engine third branch + new callbacks + new Turn structure + UI three-state + chunking algorithm).
- **Empirical basis (measured 2026-07-23)**: during Stage 2 testing, 7 documents (~74K characters) stuffed into a single call — the default 60s timeout was insufficient (Panel failed), had to be raised to 180s to get through. **20+ documents would completely crash.** The current "stuff everything in one call" architecture (the Stage 2 usage) doesn't scale; Stage 4's Map-Reduce (extract each separately → parallel → Reduce merge) is the only correct answer. The data structure is already in place: `session.attachments` serves as the corpus source, and the Map stage reads directly from it.

#### The architectural essence of Stage 4: Map-Reduce = subagent / fan-out orchestration

Stage 4 isn't just "chunking documents"; its structural essence is one of the core patterns of LLM orchestration. Mapped against industry terminology:

```
Orchestrator (runMoaSynthesis)
  │ ① Decomposition (Task Decomposition): N documents → N subtasks
  ├─ subagent 1: extract doc 1 → JSON1   ┐
  ├─ subagent 2: extract doc 2 → JSON2   │  Fan-out
  ├─ ... (N in parallel)                  │  Promise.all fires simultaneously
  └─ subagent N: extract doc N → JSONN   ┘
  │ ② Aggregation (Aggregation / Reduce)
  ▼
Reduce: merge JSON1..N → one final JSON (cross-document dedup + induction)
```

| Verdex implementation | Industry term | Notes |
|---|---|---|
| `runMapReduce` top-level orchestration | **Orchestrator** | Main flow of decomposition, dispatch, and aggregation |
| Splitting the corpus into N pieces each processed | **Task Decomposition** | Breaking a large task into parallelizable small tasks |
| One Map call per document | **Subagent / Worker** | A unit that independently completes a subtask |
| `Promise.all(attachments.map(...))` | **Fan-out / Scatter** | Dispatching all subtasks in parallel (not serial) |
| Map calls firing at once | **Worker Pool** | A group of workers doing work in parallel |
| Merging all Map JSON | **Reduce / Aggregator** | Aggregating sub-results into the final output |

**Key facts (verified by measurement)**:
- **It's parallel, not serial** — `Promise.all` makes the Map calls for all N documents **fire simultaneously**. The user sees ✓ appear one after another because each file's size / response time differs slightly, but the calls are issued at the same time. Serial would take N× the time; parallel takes only the time of the slowest file.
- **Verdex's subagents are the simplest form**: parallel calls of the same model (e.g., DeepSeek V3); subtasks don't communicate and use fixed instructions (the schema). This differs from a "true multi-agent system" (AutoGen/CrewAI) — where each subagent can be a different model, can communicate with others, and makes autonomous decisions. Verdex suits "batch document extraction," this kind of homogeneous parallel task.

**The reuse value of this structure**: Map-Reduce's "decompose → parallel → aggregate" skeleton isn't limited to document extraction. The same structure applies to batch translation, batch summarization, batch sentiment analysis, parallel retrieval-then-synthesis — any scenario where "a large task can be split into homogeneous subtasks." Swap the "Map instructions" and "Reduce instructions" inside `runMapReduce`, and it becomes a new orchestration application.

#### Map-Reduce performance bottleneck analysis (why it's still slow even though it's parallel)

Measured on 7 Grantham documents, Map-Reduce takes about 2-3 minutes total. Although Map is **parallel**, the whole thing is still slow — the bottlenecks come from four layers:

**Total-time composition**:
| Stage | Parallelizable? | Typical time | Share |
|---|---|---|---|
| Map (N-file extraction) | ✅ parallel | 30-60s | ~30% |
| **Reduce (merge)** | ❌ **must be serial** | **120-180s** | **~60%** |
| Network/scheduling overhead | — | 10-20s | ~10% |

**Bottleneck 1 · The serial nature of Reduce (biggest bottleneck)**
Reduce has to read in the full Map JSON of all N files at once (each hundreds of lines = tens of thousands of tokens of input) + cross-document compare/dedup/induct + output one large JSON. This is a **single serial call, not parallelizable** — merging by nature requires all sub-results first before it can merge. This is an **inherent property** of the Map-Reduce paradigm; no implementation can bypass it.

**Bottleneck 2 · Map dragged down by the "slowest file"**
`Promise.all` is parallel, but **waits for all to finish** before Reduce. If 1 of N files is slow, the whole thing is stuck on that file:
```
7 files fire in parallel (t=0)
  6 files finish in 12-20s ✓
  the 7th finishes in 45s ✓  ← the Map stage as a whole = 45s (the longest, not the average)
```
The slow file's cause: dense document info + long generated JSON (a spoken podcast transcript needs "read + structure," which is heavier than summarization).

**Bottleneck 3 · Each Map call itself isn't light**
It's not a "quick summary"; it's **structured extraction** — identifying/refining/organizing nested JSON from a 10K-character spoken transcript per the schema. 15-30s per file is normal.

**Bottleneck 4 · API gateway + network**
SiliconFlow is a transit gateway, and going through a proxy (10808) adds latency. N files in parallel = N concurrent requests through the proxy, possibly contending for bandwidth.

#### Map-Reduce vs single-call Extract: real API benchmarks (2026-07-24)

**Test method**: `scripts/perf-test.mjs`, calling SiliconFlow's DeepSeek-V3 directly (not via UI, excluding rendering overhead), comparing "single-call Extract (all documents concatenated, one call)" vs "Map-Reduce (parallel Map per file → one Reduce merge)." Three document combinations, same schema (thinking-model library) + same question.

**Test data** (real API timings):

| Combination | Characters | Single-call Extract | Map-Reduce (Map + Reduce = total) | Which is faster |
|---|---|---|---|---|
| C: 5 files × ~10K | 53K | **36.0s** | Map 34.3s + Reduce 119.1s = **153.4s** | Single call 4.3× faster |
| D: 7 files × ~10K | 74K | **46.7s** | Map 31.2s + Reduce 186.9s = **218.2s** | Single call 4.7× faster |
| F: 3 files × ~30K | 97K | **34.2s** | (interrupted; single call already proven fast enough) | — |

**Key findings**:

1. **Single-call Extract is far stronger than expected**: DeepSeek V3 does structured extraction on 74K characters in only **47s** (the earlier UI measurement of 150s was rendering/streaming overhead, not the model itself). 97K characters takes only **34s**. **Large model + large context = a single call is sufficient for extraction within 100K characters.**

2. **Map-Reduce is actually 4-5× slower**: Map is fast in parallel (30-34s), but **Reduce is the bottleneck** (119-187s) — the "merge N JSONs with dedup and induction" task is itself much heavier than "read the whole text once and extract." Reduce slowness isn't a technical issue; it's a task-complexity issue.

3. **Conclusion: for a large-context model like DeepSeek V3, within 100K characters single-call Extract is both faster and better — Map-Reduce is a negative optimization.**

**⚠️ Applicability boundary of the conclusion (important) — strongly model-dependent**:

The above conclusion **holds only for "large-context large models."** Switch models and the conclusion can flip:

| Model type | Context | Single-call Extract | Map-Reduce | Which to use |
|---|---|---|---|---|
| **Large model (V3/R1/72B)** | 64K-128K tokens | ✅ fast (47s/70K) | ❌ slow (Reduce heavy) | **Single call** (within 100K chars) |
| **Small model (7B/14B/Air)** | 8K-32K tokens | ❌ won't fit / timeout | ✅ per-file small calls work | **Map-Reduce** (must chunk) |
| **Ultra-large corpus (50+ files / millions of chars)** | any | ❌ no model fits it | ✅ only choice | **Map-Reduce** (fallback) |

**So**: Map-Reduce's value is in "small models handling large corpora" or "corpora exceeding any single model's context." Using a large model like V3 for under 100K characters, the single call wins decisively.

**Impact on the threshold**: The current auto rule (file count ≥4 or >80K → Map-Reduce) is too aggressive for V3 (forcing C/D onto the 4-5× slower Map-Reduce). It should change to **Map-Reduce only when a single call truly can't hold it** (threshold raised substantially, or judged by the actual context of the model in use). To be tuned dynamically per model capability.

**Impact on tree Reduce**: ~~tree Reduce is the most valuable optimization~~ **Canceled.** Tree Reduce optimizes "Reduce is too slow," but the fundamental problem is "Map-Reduce as a whole is worse than a single call (for large models)." Optimizing Reduce only gets 153s→~90s, still far slower than the 36s single call. **The premise doesn't hold; no tree Reduce.**

**Retained positioning of Map-Reduce**: demoted from "core capability" to "**extreme-scenario fallback + small-model-scenario necessity.**" Code retained, not triggered by default (for large models), used only for ultra-large corpora or small models.

### Stage 5 · ASR / data-cleaning preprocessing (unlocks data quality, optional)
- **Goal**: clean dirty data before extracting.
- **Changes**: an optional "normalization Panel" preprocessing step.
- **Deliverable**: a Verdex robust to noisy data.
- **Effort**: small. Can be turned off for clean data.

### Stage effort overview

| Stage | Change layers | File count | Risk | Independently usable |
|---|---|---|---|---|
| 1 memory | types/engine/state machine/UI | ~5 | low | ✅ |
| 2 document input | types/UI/Tauri | ~4 | low | ✅ |
| 3 schema extraction | engine/new tool/UI/i18n | ~5 | medium | ✅ |
| 4 Map-Reduce | types/engine/state machine/UI/i18n | ~8 | high | ✅ |
| 5 cleaning | engine/templates | ~2 | low | ✅ |

---

## 6. JSON output structure decision: do A directly, no B transition

### Background: A vs B

| Dimension | B fixed four sections | A custom schema |
|---|---|---|
| Output structure | Always consensus/divergence/blindspots/verdict 4 fields | Arbitrary nesting, user supplies template |
| Can it produce nesting like grantham_models.json | ❌ only 4 text buckets | ✅ per template |
| Essential role | Synthesizer (multi-perspective compressed into a summary) | Extractor (raw material → fixed structure) |
| DB-storable / programmatically consumable | weak | strong |
| Needs a validation loop | no | **must** |
| User threshold | zero | medium (must select/write a schema) |
| Stage 3 effort | small | medium |
| Typical scenario | "which of several models is right" | "extract a document into structured data" |

### Decision: choose A, no B transition

Reasons:
1. The platform must produce arbitrary nested structures like `grantham_models.json` → **B can't.**
2. → The core path must be A.
3. But **B is a special case of A** (set the template to four sections + skip validation, and A produces the four-section verdict). So choosing A **loses none** of Verdex's current capability.
4. A "B transition" has no value for current users: the typical task is document extraction, not open-ended debate; preset templates can remove A's threshold.
5. → **The four-section verdict is demoted to A's first preset schema template**, inheriting the existing `parseJudgeResponse` + four-section prompt code, at zero extra cost.

**In one line**: do A directly; keep the four-section verdict as A's default template — neither build it separately, delete it, nor transition through it.

---

## 7. Preset schema templates

**Principle**: cover the most likely task types, not the more the better. First batch ships 2; the rest are listed as extensible.

| Template | What it solves | Status | Structure skeleton (illustrative) |
|---|---|---|---|
| **Four-section verdict** | Multi-model synthesis/debate (inherited from Verdex) | First-version deliverable (default) | `{consensus, divergence, blindspots, verdict}` |
| **Thinking-model library** | Extract methodology (Grantham-type) | First-version deliverable | `{models:[{name, definition, key data{}, application rules}], causal chains:[...], trading models:[...]}` |
| Key-points list | Most general, extract key points | Extensible later | `{topic, points:[{point, basis, source}], to-do:[...]}` |
| Table extraction | research-report financial tables / comparison tables | Extensible later | `{title, columns:[fields], rows:[{field:value}]}` |
| Entity-relationship | biographies/news/case files | Extensible later | `{entities:[{name, type, attributes{}}], relations:[{subject, relation, object}]}` |

**Design constraints**:
1. **Templates are editable**: users can rename fields and add fields. Reuse Verdex's existing TemplatesModal CRUD pattern.
2. **Users can build brand-new templates**: not limited to presets.
3. **Storage location**: a new `extractSchemas` domain in `config.json` (alongside `roleTemplates`/`judgePrompts`), single source of truth; synced across three places — the `ConfigFile` type + `config.template.json` + `normalizeConfigShape`.
4. **First version ships only the first 2**, to avoid a Stage 3 effort explosion.

---

## 8. MD export rendering: a layered strategy

> User requirement: JSON throughout the pipeline; MD is only derived from JSON at the export point, **MD is not persisted.**

### Layered architecture

```
When exporting MD
   │
   ▼
Layer 1: general structure-adaptive renderer (default)
  Auto-converts JSON structure to MD: object → heading hierarchy / array → list or table / leaf → key-value
  Covers ~90% of scenarios; zero cost, zero latency, offline-capable
   │ can handle → output MD directly ✅
   │ outside default scope / renders poorly
   ▼
Layer 2: AI targeted rendering (fallback)
  Feed JSON + export intent to the model, generate targeted MD
   │
   ▼ output MD ✅
```

### Why layering
1. The default renderer covers 90%, zero cost and offline-capable — rule-based structures (four-section, thinking-model library) are fully sufficient.
2. The AI fallback handles the long tail — large amounts of free-text layout, special formats (two-column, nested tables) that general rules do poorly.
3. Fits the "save calls" principle — AI isn't called on every export; only when the default can't handle it.

### Hard constraints on the AI fallback (must follow)
**Most dangerous point**: AI rendering may conveniently "polish" or drop fields, causing MD and JSON to diverge.

→ **Constraints**:
1. The AI-fallback prompt must explicitly say "**change only layout, not content, don't drop fields, strictly based on the given JSON**."
2. After rendering do a **field-coverage validation**: every key in the JSON must have a corresponding presence in the MD; otherwise treat it as a rendering failure, fall back to the general renderer or error out.
3. AI only touches format, not content, with validation as the gatekeeper.

### Implementation locations
- General renderer: new `src/services/mdRenderer.ts` (pure function, JSON→MD).
- AI fallback: reuse the existing `streamChat`, add a `renderMdWithAI(json, intent)`.
- Trigger point: called when the user clicks the "Export MD" button; the result downloads directly, **not written back to config.json, not into the session history**.

---

## 9. ASR / data-cleaning strategy

The ASR noise in the Grantham sample (the name Grantham written 4 ways, 208→2008, Kistone→Keystone) is a real problem.

| Option | Approach | Pros | Cons |
|---|---|---|---|
| Clean during orchestration | Add an "entity normalization" Panel up front | Integrated | Adds complexity |
| Clean separately first, then orchestrate | One dedicated call to fix typos, store the clean version | Clear and reviewable | One extra manual step |
| Don't clean, power through | Feed the raw text directly | Fastest | Names don't match up during cross-file synthesis |

**Recommendation**: in Stage 5, do "clean during orchestration" as an **optional** front Panel (turned off for clean data). Reason: a general platform can't assume clean input, but also can't force cleaning — making it a toggle is the most flexible. The Grantham sample validates this step.

---

## 10. Risk list and open questions

### Risks
| Risk | Level | Mitigation |
|---|---|---|
| Engine complexity rises (three branches + validation loop + chunking) | high | Stage by stage; add Vitest tests per stage |
| UI bloat (mode 2→3 states + attachments + templates + cleaning toggle) | medium | Incremental; advanced options collapsed |
| PDF/Word parsing introduces Rust crates | medium | First version txt/md only |
| Summarization compression adds one more API call | low | Configurable toggle + cache |
| AI fallback rendering changes content | medium | "Change only layout" constraint + field-coverage validation |

### Open questions (decided)
1. ✅ Stage order: 1→2→3→4→5
2. ✅ PDF/Word: first version txt/md only
3. ✅ Judge rewrite cap: 3 times
4. ✅ JSON structure: do A directly; four-section as default template
5. ✅ Format: JSON in the middle, MD at the exit; MD not persisted

---

## 11. Appendix: Verdex key integration points cheat sheet

> Line numbers based on baseline commit `1591da9`.

| Capability | File | Lines | What to change |
|---|---|---|---|
| **A memory** | `types/moa.ts` | 149-166 | `SynthesisRequest` adds `panelHistory?`/`judgeHistory?` |
| | `hooks/useMoa.ts` | 601-608 | history-flatten logic changed to rebuild per providerId and pass into the engine |
| | `hooks/useMoa.ts` | 762-767 | inject history at the `SynthesisRequest` construction site |
| | `services/moaEngine.ts` | 214-218 | Panel messages inject history |
| | `services/moaEngine.ts` | 439-448 | Judge messages inject history |
| **B schema** | `services/moaEngine.ts` | 346-402 | `parseJudgeResponse` upgraded to return `{ok,data,errors}` |
| | `services/moaEngine.ts` | 424-481 | `runSingleJudge` adds validate-rewrite loop (cap 3) |
| | new file `services/schemaValidator.ts` | — | new schema validation tool |
| | `types/moa.ts` | 149-166 | `SynthesisRequest` adds `outputSchema?` |
| | `services/configStore.ts` + `config.template.json` | 33-44 / full | add the `extractSchemas` domain |
| | `components/SettingsModal.tsx` | 383, 456-479, 507 | add a schema-templates tab |
| **C Map-Reduce** | `types/moa.ts` | 107 | `MoaMode` adds `"mapreduce"` |
| | `types/moa.ts` | 116-134 | `MoASessionConfig` adds chunk/map/reduce fields |
| | `types/moa.ts` | 241-249 | `Turn` adds `mapOutputs?` |
| | `types/moa.ts` | 284-300 | `MoaCallbacks` adds `onMapStage?`/`onReduceStage?` |
| | `services/moaEngine.ts` | 494-573 | `runMoaSynthesis` adds third branch |
| | `components/MoAConfigBar.tsx` | 94-105, 117-144 | mode three-state + setMode branch |
| **Document input** | `types/moa.ts` | 29, 259-270 | `ChatSession` adds attachments |
| | `components/ChatInput.tsx` | — | attachment button + list |
| | `src-tauri/src/lib.rs` | — | file-reading plugin (txt/md first version) |
| **MD rendering** | new file `services/mdRenderer.ts` | — | general JSON→MD adaptive renderer |
| | `services/moaEngine.ts` or new file | — | `renderMdWithAI` fallback + field-coverage validation |
| **General** | `i18n/en.json` `zh.json` | full | add new strings in pairs, keep mirrored |

---

## 12. One-line summary

> Verdex is a good car, but it has only one gear. Give it a gearbox (multi-turn memory), ABS (custom schema + validation loop), a turbo (Map-Reduce parallelism), and a fuel cap (document input), and it upgrades from a "single-turn multi-model synthesis tool" into a general orchestration platform of "any document → structured output." **JSON: do A directly, four-section as default template, JSON in the middle and MD at the exit**; changes are controllable, in 5 incremental stages, each independently usable. The Grantham sample serves as the first regression test.

---

*Evaluation document version 1.0 · 2026-07-23 · baseline commit `1591da9` · for progress see HANDOFF.md*
