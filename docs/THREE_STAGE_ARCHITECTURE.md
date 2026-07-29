# Verdex Three-Stage Fusion Architecture Design Requirements

> Fuse the two disjoint pipelines of "document extraction" and "multi-model analysis" into one clear three-stage pipeline.
> Based on architecture discussions between the user and AI (2026-07-24), this replaces the current confusing `outputMode` (Verdict/Extract/Map-Reduce) design.
>
> Document version: 1.0 · 2026-07-24 · Status: Design pending review

---

## 0. Why Refactor

### Current Problems

The current Verdex has two disjoint pipelines:

- **Pipeline A (Document Extraction)**: document → Extract Judge (extract by schema) → structured JSON
- **Pipeline B (Multi-Model Analysis)**: question → Panel (multi-model parallel) → Judge (four-part Verdict)

They are toggled via `outputMode` (Verdict/Extract/Map-Reduce), but this design has three fundamental problems:

1. **Config confusion**: The three dropdowns (judge prompt / output / structure) are always all shown, and users don't know which to use when. There are actual conditional dependencies (Verdict doesn't use Schema, Extract doesn't use the judge prompt), but the UI doesn't reflect this.
2. **Capability silos**: You can only do "extract OR analyze", not "extract then analyze". Users can't do "extract knowledge from documents → multi-model analyze that knowledge".
3. **No single-model fallback**: When there's only one Provider, meaningless configs like Panel/Judge/roles are still shown.

### Core Insight

The user's actual need is **analysis of complex, large-scale data**, which naturally splits into two steps:
1. **Data processing** (input side): extract / refine / structure raw documents
2. **Data analysis** (logic side): multiple models each reason over the processed data, Judge synthesizes

These two steps are not "either-or", but a "A first, then B" pipeline.

---

## 1. Two Orchestration Paradigms (Industry Comparison)

### Paradigm 1: Multiple Models Intervene During Data Processing

```
Doc 1 → Model A extract ─┐
Doc 2 → Model A extract  ├→ Judge synthesizes all results
Doc 3 → Model A extract ─┘
```
- Each subtask can be handled by a different model
- Suits: subtasks requiring different specialties (R1 for math, V3 for text)

### Paradigm 2: Efficient Model Preprocesses + Multiple Models Only at Analysis ⭐ (Verdex picks this)

```
Document → Efficient model (V3) uniformly splits/refines/structures → clean structured data
                                                                       ↓
                                                             Multiple models each analyze → Judge synthesizes
```
- Standardized data processing (one model, one standard — fast and consistent)
- Diversified analysis (multi-perspective reasoning)
- Suits: Verdex's scenario (document → knowledge → analysis)

### Verdex's Choice: Paradigm 2

Reasons:
- Data processing is "grunt work" (read the full text, fix typos, extract by schema) — one efficient model does it fast and consistently
- Analysis is "reasoning work" (is this strategy sound? will the bubble burst?) — multiple models each reasoning is more valuable
- The split data is refined enough (70k-word original → 5k-word structured knowledge) that the analysis models don't need to read the original

---

## 2. Three-Stage Fusion Architecture

### Overall Flow

```
┌──────────────────────────────────────────────────────┐
│ Stage 1: Data Processing                             │
│   📎 Document → [clean] → structured extraction      │
│       (Extract/Map-Reduce)                           │
│   Model: auto-select an efficient model (first        │
│       Provider or specified via .env)                │
│   Output: structured knowledge units (JSON)          │
│   Config: Schema, clean toggle, Map-Reduce trigger   │
├──────────────────────────────────────────────────────┤
│ Stage 2: Multi-Model Analysis                        │
│   Stage 1 output → Panel parallel analysis →         │
│       individual insights                            │
│   Model: user-selected multiple Providers            │
│   Output: multiple analysis results                  │
│   Config: Panel selection, role template             │
│   ⚠️ Auto-skipped when only one model is available   │
├──────────────────────────────────────────────────────┤
│ Stage 3: Judge Synthesis                             │
│   All Stage 2 insights → Judge summarizes →          │
│       final conclusion                               │
│   Model: user-selected Judge Provider                │
│   Output: four-part Verdict (consensus / dissent /   │
│       blind spots / verdict) or structured JSON      │
│   Config: Judge model, synthesis method              │
│       (judge prompt)                                 │
└──────────────────────────────────────────────────────┘
```

### Detailed Design of Each Stage

#### Stage 1: Data Processing

- **Input**: user-uploaded documents (📎 attachments) + user question
- **Processing**:
  - If cleaning is on: ASR cleaning first (fix typos)
  - If a single pass suffices: Extract single-pass extraction (by Schema)
  - If over threshold: Map-Reduce (extract each in parallel → Reduce merge)
- **Output**: structured JSON (e.g. mental-model library)
- **Model**: auto-select the first Provider (or `VITE_VERDEX_DATA_MODEL` from .env)
- **Config items**: Schema selection, clean toggle
- **Not needed**: Panel, judge prompt, roles

#### Stage 2: Multi-Model Analysis

- **Input**: Stage 1's structured output (+ user question)
- **Processing**: each Panel model independently analyzes this structured data and gives an insight
- **Output**: multiple analysis results (one per model)
- **Model**: user-selected multiple Providers (≥2 to be meaningful)
- **Config items**: Panel selection, role template (critical / first-principles / devil's advocate)
- **Auto-skip condition**: skip when available Provider count < 2
- **Not needed**: Schema, cleaning (already handled in Stage 1)

#### Stage 3: Judge Synthesis

- **Input**: all Panel analysis results from Stage 2
- **Processing**: Judge synthesizes into consensus / dissent / blind spots / verdict
- **Output**: four-part Verdict (`verdict`) or structured JSON (`extract`)
- **Model**: user-selected Judge Provider
- **Config items**: Judge model, judge prompt
- **If Stage 2 is skipped**: Judge synthesizes directly on Stage 1's output (single-model mode)

---

## 3. Single-Model Automatic Fallback

### Core Rule

```
Available Provider count == 1 (e.g. only DeepSeek V3):
  Stage 1: V3 processes documents → structured data
  Stage 2: skipped (only one model — Panel parallel is meaningless)
  Stage 3: V3 synthesizes directly (or use Stage 1 output as the final result)
  → UI shows only: Schema, clean
  → Hidden: Panel selection, judge prompt, role template

Available Provider count ≥ 2 (e.g. V3 + R1 + Qwen):
  Stage 1: V3 (efficient) processes documents → structured data
  Stage 2: V3/R1/Qwen each analyze → multi-perspective insights
  Stage 3: Judge (V3 or R1) synthesizes → final conclusion
  → UI shows all options
```

### Fallback Config Bar (Single-Model)

```
┌──────────────────────────────────────┐
│ 📎 Document  Schema: [Mental-Model ▼]│
│ □ Clean  □ Memory                    │
│ Model: DeepSeek V3                   │
└──────────────────────────────────────┘
```
Clean — no Panel/Judge/judge prompt (a single model needs no multi-model scheduling).

### Full Config Bar (Multi-Model)

```
┌──────────────────────────────────────────────────┐
│ 📎 Document  Schema: [Mental-Model ▼]  □ Clean   │
│ Data Processing Model: [DeepSeek V3 ▼]           │
│ Panel: [V3 ✓] [R1 ✓] [Qwen ✓]  Roles: [optional] │
│ Judge: [DeepSeek V3 ▼]  Judge Prompt: [Default ▼]│
│ □ Memory                                         │
└──────────────────────────────────────────────────┘
```

---

## 4. Task Type (Top-Level Routing)

The user first picks "what to do", and the system auto-configures the three stages:

| Task Type | Stage 1 | Stage 2 | Stage 3 | Suitable Scenario |
|---|---|---|---|---|
| **Document Extraction** | ✅ Extract | Skip | Skip (Stage 1 output is final) | Just need structured JSON |
| **Document Analysis** | ✅ Extract | ✅ Multi-model analysis (when ≥2 models) | ✅ Judge synthesis | Extract first, then deep analysis |
| **Quick Q&A** | Skip | ✅ Panel parallel | ✅ Judge synthesis | No document needed, just ask |

### Routing Logic

```
taskType = "document_extract":
  Stage 1 → structured JSON (final output)
  Stage 2/3 skipped

taskType = "document_analysis":
  Stage 1 → structured JSON (intermediate output)
  Stage 2 → multi-model analysis (skipped on single model; Stage 1 output goes straight to Stage 3)
  Stage 3 → Judge synthesis (final output)

taskType = "quick_qa":
  Stage 1 skipped
  Stage 2 → Panel parallel (single model answers directly)
  Stage 3 → Judge synthesis
```

---

## 5. Relationship to Existing Capabilities (No Rewrite)

The three-stage architecture does **not replace** existing capabilities; it **reorganizes the call order**:

| Existing Capability | Position in the Three Stages |
|---|---|
| Extract (schema extraction) | Core of Stage 1 |
| Map-Reduce (multi-document parallel) | Extension of Stage 1 (when there are many docs) |
| ASR cleaning | Pre-step of Stage 1 |
| Panel (multi-model parallel) | Stage 2 |
| Judge (four-part Verdict) | Stage 3 |
| Judge prompt | Config of Stage 3 |
| Role template | Config of Stage 2 |
| Multi-turn memory | Cross-stage (each stage carries history) |
| Hierarchical summary (1b) | Cross-stage |

**The underlying API calls don't change** (`streamChat` / `runSingleJudge` / `runMapReduce` are all kept); what changes is "who calls whom, and when".

---

## 6. Redesigned Config Items

### Replacing outputMode

The current `outputMode: "verdict" | "extract" | "mapreduce"` is replaced with:

```ts
taskType: "document_extract" | "document_analysis" | "quick_qa"
```

### MoASessionConfig Refactor

```ts
interface MoASessionConfig {
  taskType: "document_extract" | "document_analysis" | "quick_qa";

  // Stage 1 config (document extraction)
  extractSchemaId: string | null;       // which schema to use
  cleanAttachments: boolean;             // ASR cleaning
  // Map-Reduce auto-triggers (reuse shouldMapReduce)

  // Stage 2 config (multi-model analysis)
  panelIds: string[];                    // which models participate in analysis
  panelRoles: Record<string, string>;    // role of each Panel

  // Stage 3 config (Judge synthesis)
  judgeIds: string[];                    // Judge model
  judgePromptId: string | null;          // synthesis method

  // Cross-stage
  memoryEnabled: boolean;
}
```

### UI Dynamic Display Rule

```
Single-model (providers.length === 1):
  Show only taskType + Stage 1 config (Schema/clean)
  Hide Panel/Judge/judge prompt/roles

Multi-model (providers.length >= 2):
  taskType = document_extract: show Stage 1 config
  taskType = document_analysis: show all three stages' config
  taskType = quick_qa: show Stage 2/3 config, hide Stage 1
```

---

## 7. Backward Compatibility

### Old Session Migration

```ts
// outputMode → taskType mapping
"verdict"    → "quick_qa"        // original four-part verdict = quick Q&A
"extract"    → "document_extract" // original schema extraction = document extraction
"mapreduce"  → "document_extract" // Map-Reduce is a sub-mode of document extraction (auto-triggered)
```

This mapping is done inside `normalizeSessionConfig`, so old sessions get a seamless upgrade.

### Map-Reduce Is No Longer a taskType

Map-Reduce is demoted to "an automatic optimization of the document-extraction task when there are many documents" (reusing `shouldMapReduce`), and is no longer a mode the user explicitly selects.

---

## 8. Implementation Plan (Step by Step)

### Step 1: Type-Layer Refactor
- `taskType` replaces `outputMode`
- `MoASessionConfig` reorganized by the three stages
- Backward-compatibility mapping

### Step 2: UI Refactor (MoAConfigBar)
- Top-level `taskType` selection (Document Extraction / Document Analysis / Quick Q&A)
- Dynamically show/hide config items by model count + taskType
- Minimal config bar for single-model mode

### Step 3: Engine Routing Refactor (runMoaSynthesis)
- Route to the three stages by taskType
- Data passing between stages (Stage 1 output → Stage 2 input)
- Auto-skip Stage 2 in single-model mode

### Step 4: Complete Pipeline for the Document-Analysis Task ✅ Done (2026-07-24)
- Stage 1 (extract) → Stage 2 (Panel analyzes the extracted results) → Stage 3 (Judge synthesis)
- This is a new capability (previously couldn't "extract then analyze")
- Verified empirically: V3+R1 dual model — V3 first extracts the mental-model library JSON → R1/V3 each analyze → four-part Verdict

### Step 4b: Config Simplification (Let Users Get Started Immediately) ✅ Done (2026-07-24)

**Problem**: "Task", "Structure", and "Judge Prompt" are shown simultaneously, and users don't know how they relate or which to use when.

**Root cause**: "Structure" (Schema) and "Judge Prompt" are **mutually exclusive** — document tasks use Structure, Q&A tasks use Judge Prompt. But the UI doesn't reflect this exclusivity, which confuses users.

**Solution: strictly mutually-exclusive display by task + make labels self-explanatory**

| Task | Config Shown | Config Hidden |
|---|---|---|
| 📄 Document Extraction | Extraction Structure (Schema) | Judge Prompt, Panel, Roles |
| 📊 Document Analysis | Extraction Structure + Synthesis Method | — |
| 💬 Quick Q&A | Synthesis Method (Judge Prompt) | Extraction Structure, Clean |

**Label renames** (so users understand at a glance):
- "Structure" → **"Extraction Structure"** (clarify it's used in the extraction stage)
- "Judge Prompt" → **"Synthesis Method"** (clarify it's used in the synthesis stage)
- The two never appear together in non-document_analysis tasks

**Single-model fallback**: with only 1 Provider, only 2 tasks are shown (Document Extraction / Quick Q&A), and all multi-model config is hidden.

### Step 5: Testing + Verification + Doc Update

---

## 9. Not Doing (Deferred)

- Manual review between stages (user checks Stage 1 output before deciding whether to enter Stage 2)
- Dynamic model assignment in Stage 2 (auto-select model based on subtask type)
- Caching between stages (cache Stage 1 results; changing the question doesn't re-extract)
- Custom task types (users build their own pipeline templates)
- **Python code execution (Code Interpreter)**: a code sandbox like kimi/ChatGPT, for precise numerical computation, data analysis, and visualization. See "Future Extension" below.

### Future Extension: Python Code Execution

**Background**: kimi and other Code Interpreters use Python to implement precise computation, data visualization, and JSON serialization validation. Verdex is currently pure front-end LLM orchestration with no code execution capability.

**Why not add it now**:
1. Verdex's core value is multi-model orchestration (Panel+Judge+Map-Reduce), not code execution — different positioning
2. Adding a Python sandbox to the front end is very heavy: Pyodide (WASM, ~10MB+) or invoking Python from the Tauri Rust side (requires the user to install Python)
3. The current scenario (document → structured JSON) doesn't need precise computation — extracting mental models / causal chains is "understanding + organization", not "arithmetic"
4. The existing lightweight validation (`validateExtract`) is enough — it checks JSON structural validity without needing Python

**When it would be needed**:
- Precise computation after extracting financial data from documents (growth rates, ratios, rollups)
- Generating charts (mental-model relationship graphs, data-trend plots)
- Statistical analysis on extracted JSON ("the most frequent model across 7 documents")
- Ensuring JSON is 100% syntactically valid (strict validation via Python `json.load`)

**How to add it, if needed** (two options):

| Option | Implementation | Pros | Cons |
|---|---|---|---|
| **A. Execute on Tauri Rust side** | LLM generates Python code → Tauri Rust subprocess calls Python → returns result | Full capability (pandas/numpy/matplotlib all available) | User must install Python; secure sandbox (against malicious code); cross-platform compatibility |
| **B. Pyodide (WASM)** | Front end loads Pyodide → runs Python in the browser/WASM | No Python install needed for user; safe (sandbox isolation) | Large bundle size (~10MB); slow to load; some libs unsupported; limited performance |

**Recommended: Option A (Tauri Rust side)** — full capability, and Verdex already has a Tauri Rust backend (fs/http plugins are registered), so adding a subprocess call is a natural extension.

**Implementation notes** (Option A):
1. On the Rust side, add `tauri-plugin-shell` or a custom command (`invoke("run_python", { code })`)
2. Secure sandbox: restrict importable libraries, forbid file-system/network access, kill on timeout
3. Front end: LLM generates Python code → calls Rust to execute → result is injected back into the LLM (similar to Code Interpreter's generate→execute→feedback loop)
4. New task type: `data_analysis` (extract → compute → visualize)

---

## 10. Design Decision Record

| Decision | Choice | Rationale |
|---|---|---|
| Orchestration paradigm | Paradigm 2 (efficient preprocessing + multiple models at analysis) | Standardized data processing, diversified analysis |
| When multiple models intervene | Analysis stage (Stage 2) | Data processing is grunt work → single model; analysis is reasoning work → multiple models |
| Single-model behavior | Auto-skip the multi-model stage | A single model running in parallel is meaningless |
| taskType replaces outputMode | Yes | outputMode mixed two dimensions (output form vs. processing method) |
| Map-Reduce positioning | Auto-optimization of document extraction (not a standalone mode) | Users don't need to manually pick Map-Reduce |
| Three stages reuse existing capabilities | Yes | No rewrite — just reorganize the call order |

---

*Design requirements document version 1.0 · 2026-07-24 · Pending approval before moving to implementation*
