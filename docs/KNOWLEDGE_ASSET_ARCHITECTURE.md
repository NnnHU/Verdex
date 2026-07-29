# Knowledge Asset Architecture Design

> The design direction for upgrading Verdex from a "multi-model orchestration platform" to "The compiler for reusable AI knowledge".
> Distill the reasoning process into reusable, exportable, traceable knowledge assets; Skill is just one of the export formats.
>
> Document version: 0.1 (design discussion draft) · 2026-07-28 · Status: direction confirmed, implementation not yet started

---

## 0. Core Insight

### What we borrow is not book-to-skill, but the Skill abstraction

The most successful thing about book-to-skill is not "PDF → Skill", but:

```
Knowledge → Executable Skill
```

A Skill itself is not knowledge; it is:
```
Knowledge + When to use (description) + How to use (instruction) + How to load (on demand)
```

### What Verdex should do is something else

Not `Document → Skill`, but:

```
Evidence → Reasoning → Knowledge Asset
```

Verdex's asset pipeline:
```
Conversation / Document
    ↓
Reasoning (Extract → Multi-model Analysis → Judge)
    ↓
Knowledge Asset (persisted, reusable, exportable)
```

### Why not just build a Skill

In enterprises, more and more material **does not have a book at all**:
- Meeting minutes, design discussions, ADR, RFC
- Competitive analysis, industry reports, customer requirements

What these materials produce is not "a knowledge summary of a book", but **"conclusion assets from multiple people/models reasoning over evidence"** — that is, a **Reasoning Skill**.

---

## 1. Knowledge Asset: the core internal abstraction

**It is not called a Skill, it is called a Knowledge Asset (or Knowledge Module).**

The internal format is not bound by any external standard. Skill is just one of the export formats.

```
                Knowledge Asset (Verdex Native internal format)
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    Claude Skill    Copilot Skill    MCP Resource
         │              │              │
     Markdown          JSON           HTML
```

**Design principle**: the internal model is not constrained by external standards. Skill lives in the Exporter layer, not the internal storage.

---

## 2. Four-stage architecture (Stage 4 is new)

The existing three stages + the new Stage 4:

```
Stage 1: Extract (extract evidence)
Stage 2: Reasoning (multi-model reasoning)
Stage 3: Judge (synthesized verdict)
Stage 4: Knowledge Packaging (new)
  ├─ Metadata (name, description, triggers)
  ├─ Evidence (raw evidence index, traceable)
  ├─ Consensus (multi-model consensus)
  ├─ Divergences (preserved divergences) ← Verdex exclusive
  ├─ Blindspots (blind spots found by Judge) ← Verdex exclusive
  ├─ Decision Tree (decision tree / reasoning chain)
  ├─ Triggers (when to use this knowledge)
  └─ Source Trace (source trace)
       ↓ Package
  ↓ Exporter (export on demand)
  ├─ Claude Skill (SKILL.md + chapters/)
  ├─ Copilot Skill
  ├─ MCP Resource
  ├─ Markdown (human readable)
  ├─ JSON (machine readable)
  ├─ HTML
  └─ Verdex Native (internal reuse)
```

**All Stage 1-3 code is kept intact; Stage 4 is a newly added packaging layer.**

---

## 3. Verdex vs book-to-skill: the essential difference

| Dimension | book-to-skill | Verdex |
|---|---|---|
| **What it compiles** | A book (static, structurally stable) | The entire reasoning process (dynamic, multi-perspective) |
| **Who does the decomposition** | A single host AI | Multi-model Panel + Judge synthesis |
| **Skill characteristics** | Single-perspective framework distillation | Multi-model consensus + preserved divergences + blind spots |
| **Exclusive output** | — | Divergences + Blindspots |
| **Positioning** | Book → Skill Compiler | Reasoning → Knowledge Asset Compiler |
| **Asset reuse** | Leaves the tool after export | Reusable inside Verdex + exportable to the outside |

**Verdex's differentiated moat**: Divergences and Blindspots are things book-to-skill cannot provide — they are exclusive products of the multi-model architecture.

---

## 4. Positioning upgrade

| Stage | Positioning | User label |
|---|---|---|
| Original | Multi-model judge synthesis engine (MoA) | "Yet another chat client" |
| Current | Three-stage document intelligence orchestration platform | A made-up term users cannot search for |
| **Target** | **The compiler for reusable AI knowledge** | "Turn the reasoning process into reusable knowledge assets" |

**Multi-model is only the means (Stage 2); knowledge-assetization is the positioning and the moat (Stage 4).**

---

## 5. Two paths for Asset reuse

### A. Export to external tools (Exporter path)
- Export as a Claude Skill → query with `/my-research-asset` inside Claude Code
- Export as an MCP Resource → invoke inside Cursor/Copilot
- Export as Markdown → human reading / paste elsewhere

### B. Internal reuse within Verdex (Native path) — the long-term moat
- When analyzing a new document next time, invoke an existing Knowledge Asset as a reference
- The more Assets a user accumulates, the more valuable Verdex becomes (network effect)
- book-to-skill does not have this (the skill leaves the tool after generation)

**Recommendation: do A first (export, to ride the ecosystem dividend), then B (internal consumption, long-term stickiness).**

---

## 6. Future branch: the lite version (Knowledge Asset Consumer)

### Positioning distinction

| Version | Role | Analogy | Model | Scenario |
|---|---|---|---|---|
| **Verdex (desktop version)** | Knowledge Asset **factory** | The producer end of book-to-skill | Multi-model (Panel+Judge) | Has multi-model API access, wants to produce knowledge assets |
| **Lite version** | Knowledge Asset **consumer** | The consumer end of book-to-skill | Single model (e.g. a local model) | Only wants to query/use pre-packaged knowledge |

### What the lite version does

After the desktop version exports the Knowledge Assets it produced, the lite version **loads and queries them on demand**:

```
User inside the lite version:
  /grantham-investment-models mean reversion
    ↓
The lite version loads the corresponding Knowledge Asset (on demand, ~5K tokens)
    ↓
A single model answers from the Asset's real content (no fabrication)
```

### Technical characteristics of the lite version

- **Single model** (even a local model such as Ollama), no multi-model API needed
- **Lightweight** (Web version or a lightweight desktop build, no Tauri Rust backend needed)
- **On-demand loading** (loads only the part of the Asset the user queries, not the full thing)
- **Zero production cost** (does not call multiple models, only calls one model to answer)

### Relationship between the two versions

```
Verdex desktop version (producer end)
  ├─ Multi-model API calls (expensive, but high quality)
  ├─ Three-stage reasoning → Knowledge Asset
  ├─ Export standard formats (Claude Skill / Copilot Skill / MCP / Markdown)
  │
  └─ The exported Assets can be consumed by:
     ├─ Claude Code / Copilot CLI / Cursor (via the Agent Skills standard)
     ├─ Verdex lite version (via the Verdex Native format)
     └─ Any tool that supports the standard formats
```

**This is the "producer + consumer" model of book-to-skill, but Verdex's "producer end" is multi-model, so the Assets it produces are higher quality (containing consensus/divergences/blind spots).**

---

## 7. Distance from the existing code

The existing three stages (Stage 1-3) are complete. Stage 4 Packaging needs:

| Addition | Description |
|---|---|
| **Data structure** | The `KnowledgeAsset` type (metadata + evidence + consensus + divergences + blindspots + triggers + sources) |
| **Packaging service** | `services/assetPacker.ts` (packages the Judge output into a KnowledgeAsset) |
| **Exporters** | `services/exporters/` (claude-skill.ts / markdown.ts / json.ts / mcp-resource.ts) |
| **Management UI** | Knowledge Asset management interface (list/view/edit/export/delete) |
| **Persistence** | Assets stored in config.json or standalone files |
| **Internal reuse** | Panel references existing Assets (Stage 5) |

**Stage 1-3 is completely untouched; Stage 4 is purely additive. The change size is moderate.**

---

## 8. Implementation roadmap (recommended three steps)

### Step 1: Minimal validation (1-2 weeks)
- After document_analysis finishes, additionally export a standard SKILL.md to local disk
- Let the Judge generate the description in passing
- Validate that "Verdex output can be recognized by Claude"

### Step 2: Knowledge Asset abstraction (2-4 weeks)
- Design the KnowledgeAsset internal format
- Solidify consensus/divergences/blind spots into the Asset (this is Verdex-exclusive)
- Implement the Markdown / JSON / Claude Skill exporters

### Step 3: Repository + internal reuse (long term)
- Asset management inside Verdex (list/edit/delete/export)
- Panel references existing Assets
- Lite version prototype (single-model consumer end)

---

## 9. Design decision record

| Decision | Choice | Reason |
|---|---|---|
| Internal format | Knowledge Asset (not Skill) | Not bound by external standards; Skill is just an Exporter |
| Multi-model positioning | A means (Stage 2), not the ultimate value | The ultimate value is the Stage 4 Knowledge Asset |
| Relationship to book-to-skill | Borrow the Skill abstraction, do not do "book → Skill" | Verdex compiles the reasoning process, not a book |
| Differentiated moat | Divergences + Blindspots | A multi-model-exclusive output that book-to-skill cannot provide |
| Export first or internal reuse first | Export first (ride the ecosystem dividend), then internal reuse | Export can break out / go viral immediately |
| Lite version | As a future branch | A single-model consumer end, analogous to the consumer end of book-to-skill |

---

## 10. One-sentence positioning

> **book-to-skill compiles a book. Verdex compiles the entire reasoning process.**
>
> A book is just one of the inputs. In the future, meetings, RFCs, codebases, requirements, emails, papers, and conversations can all flow into the same pipeline to produce reusable, exportable, traceable Knowledge Assets. Skill is just one of the export formats.
>
> The future lite version (single-model consumer end) lets these Assets be used on demand inside any tool.

---

*Design document version 0.1 · 2026-07-28 · Direction confirmed, pending detailed design before moving to implementation*
