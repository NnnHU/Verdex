# Roadmap Next

> All items are optional, with no blockers. Listed in priority order.
> Last updated: 2026-07-29

## 🔴 P0: Full-Platform Testing (in progress)

The user is end-to-end testing the existing platform. Issues surfaced during testing are fixed first.

Coverage scope:
- All three task types (document_extract/analysis/quick_qa)
- All Knowledge Vault features
- Export (Claude Skill/MD/JSON)
- Step-by-step flow in the config bar
- Experience features (timer/Stop/progress/copy as MD)

## 🔴 Strategic Direction: Validate Core Hypotheses

See [`../MULTI_MODEL_REVIEW.md`](../MULTI_MODEL_REVIEW.md)

Two hypotheses that must be validated:
1. Does a structured multi-step flow (extract→analyze→judge) produce better output than a single-shot answer?
2. Are the resulting knowledge assets reusable?

## 🟡 P1: Benchmark

- Collect 10-20 real cases
- Single-model vs single-model multi-step vs multi-model + Judge
- Save all intermediate artifacts (Trace Dump)
- Compare: coverage / hallucination rate / traceability

## 🟡 P2: Trace Dump

- Persist full Panel/Judge output
- Accumulate data for the IR Schema to emerge

## 🟢 P3: Consumer-Side Validation

- Take Claude Skill export to the extreme
- Validate "the Skills produced by Verdex are actually used by Claude"

## 🔵 Knowledge Vault Next Steps (design docs marked 🔜)

- Ad-hoc grouping (AI organizes across categories)
- Filter by source/time range
- Edit asset categories (currently done one-by-one via 📁)

## 🔵 Extensibility

- PDF/Word (requires a Rust crate)
- Session search
- IndexedDB to replace localStorage
- Dynamic threshold

## 🔵 Architecture Extensions (see the respective design docs)

- Python code execution (THREE_STAGE_ARCHITECTURE.md §9)
- MCP Server (KNOWLEDGE_ASSET_ARCHITECTURE.md)
- Lightweight version (KNOWLEDGE_ASSET_ARCHITECTURE.md §6)
- Inter-stage human review / dynamic model assignment / stage caching

## ⚪ Original Author's Audit Leftovers (intentionally kept)

- Anthropic system double-send (latent bug)
- DEFAULT_JUDGE_PROMPT fallback
- toggleSidebar/clearError not memoized
- SettingsModal double-mount

## ❌ Explicitly NOT Doing

- Knowledge IR Schema design (wait for data to emerge)
- Pulling in Graphify code (ideas already absorbed)
- Separating Synthesizer + Arbitrator (awaiting validation)
- Evidence→Inference→Claim→Decision chain (over-engineering)
