# Verdex Handoff Document

> Written for a **brand-new session with zero context**. Read this file + consult the sub-documents as needed, and you can take over development.
> v0.1.3 · 2026-07-29 · Core features + Knowledge Vault + stepped config bar all complete

---

## What Is Verdex

A fully local, serverless **knowledge refinement engine** (Tauri 2.0 + React 18 + TS + Tailwind v4).

### Three Task Types (Core Mainline)

| Task | What It Does | Flow |
|---|---|---|
| 📄 **Document Extraction** | Document → structured JSON | Document → [cleaning] → Schema extraction → JSON |
| 📊 **Document Analysis** | Extract first, then deep analysis | Stage 1 extraction → Stage 2 multi-model analysis → Stage 3 Judge synthesis |
| 💬 **Quick Q&A** | Multiple models answer a question | Question → parallel Panel → Judge four-section verdict |

### Knowledge Vault (Standalone Knowledge Repository)

An independent sidebar entry for asset management: browse / search / categorize / reference / export / edit.

### Config Bar (Stepped)

A 5-step guided flow: ❶ Task → ❷ Document → ❸ Extraction structure → ❹ Analysis config → ❺ Options. Conditionally displayed based on taskType.

## Current Status (2026-07-29)

**All core features + Knowledge Vault 5 stages + stepped config bar are fully complete. 84/84 tests passing. tsc zero errors. Build successful.**

### Urgent Todo: P0 Platform-Wide Testing

The user is currently running P0 testing (end-to-end verification of all three tasks + Vault + export + config). **Fix any issues found in testing first — do not add new features.**

### Next Steps After P0 Testing (by MULTI_MODEL_REVIEW.md priority)

1. P1: Build a Benchmark (single-model vs multi-model comparison)
2. P2: Trace Dump (persist intermediate artifacts)
3. P3: Consumer validation (actual Claude Skill usage)
4. Not doing: IR Schema design (wait for data to emerge), Graphify code integration

## Key Concepts

| Concept | Description |
|---|---|
| **taskType** | Session-level routing (document_extract/document_analysis/quick_qa) |
| **outputKind** | Engine-internal (verdict/extract), used by JudgeSpec and parseJudgeResponse |
| **Panel (experts)** | Multiple models analyzing in parallel |
| **Judge (verdict)** | The model that synthesizes Panel results |
| **Schema (extraction structure)** | The target JSON structure template for document extraction |
| **KnowledgeAsset** | Persisted knowledge asset (contains consensus/divergences/blindspots/verdict) |
| **Map-Reduce** | Auto-chunks large documents for parallelism (single-pass preferred, only triggers for very large docs) |

## Technical Principles

- **No third-party AI frameworks** (LangChain/AutoGen) — pure native TS Promise.all scheduling
- **Fully local**: API requests are sent directly from the user's device, nothing is uploaded
- **OpenAI-compatible**: Supports any OpenAI-compatible API + Anthropic native protocol
- **.env seed**: Auto-populates Providers on first launch (when config.json does not exist)
- **Single-model fallback**: Hide multi-model config when only 1 Provider is available

## Document Index

| Document | Purpose |
|---|---|
| [COMPLETED.md](./COMPLETED.md) | Completed feature list (modules + file locations) |
| [ROADMAP-NEXT.md](./ROADMAP-NEXT.md) | Next-step plan (by priority) |
| [PITFALLS.md](./PITFALLS.md) | ⚠️ Pitfalls encountered (9 in total — never step into them again) |
| [../MULTI_MODEL_REVIEW.md](../MULTI_MODEL_REVIEW.md) | Six-model architecture review (includes priorities + Graphify assessment) |
| [../KNOWLEDGE_VAULT_DESIGN.md](../KNOWLEDGE_VAULT_DESIGN.md) | Knowledge Vault design (all 5 stages complete) |
| [../KNOWLEDGE_ASSET_ARCHITECTURE.md](../KNOWLEDGE_ASSET_ARCHITECTURE.md) | Knowledge Asset strategic direction + lite-version branch |
| [../THREE_STAGE_ARCHITECTURE.md](../THREE_STAGE_ARCHITECTURE.md) | Three-stage architecture + future extensions (Python, etc.) |
| [../ORCHESTRATION_ROADMAP.md](../ORCHESTRATION_ROADMAP.md) | Orchestration roadmap (complete) |

## Quick Onboarding

### Code Reading Order
1. `src/types/moa.ts` — Data structures (single source of truth)
2. `src/components/MoAConfigBar.tsx` — Stepped config bar (taskType routing)
3. `src/hooks/useMoa.ts` — State machine (send function is the core)
4. `src/services/moaEngine.ts` — Scheduling logic
5. `src/components/VaultView.tsx` — Knowledge Vault
6. `docs/MULTI_MODEL_REVIEW.md` — Architecture review and next steps

### Verification Environment
```bash
cd C:\Users\k\Documents\project\no\lufei\Verdex
# Node path (nvm):
export PATH="/c/Users/k/AppData/Roaming/nvm/v24.13.1:/c/Program Files/nodejs:/c/Users/k/AppData/Roaming/npm:$PATH"
npm install && npx tsc --noEmit && npm test && npm run dev
```

### .env Configuration
```
VITE_VERDEX_PROVIDER_*    = First model (e.g. deepseek-v4-flash)
VITE_VERDEX_PROVIDER2_*   = Second model (e.g. deepseek-v4-pro, for multi-model)
VITE_VERDEX_REQUEST_TIMEOUT_MS = 360000
VITE_VERDEX_MAPREDUCE_FORCE = auto
```

### config.json Location
`%APPDATA%\com.verdex.app\config.json` (access it with a forward-slash path — see PITFALLS.md pitfall 2).

## Core Metrics
- **84/84 tests passing**
- **tsc zero errors**
- **Build successful**
- **Pushed to GitHub** (up to commit `bb33693`, subsequent commits pending push)

## File Structure
```
src/
├── components/   ChatInput, MoAConfigBar (stepped), SettingsModal, HelpModal,
│                 JudgeMessage, MapReduceMessage, JsonCardRenderer,
│                 TurnTimer, PanelCollapseGroup, Sidebar, UserMessage,
│                 VaultView, AssetExportButton
├── hooks/        useMoa, useElapsed
├── services/     moaEngine, httpClient, configStore, envConfig,
│                 memoryBuilder, summarizer, fileReader, cleaner,
│                 schemaValidator, mapreduceStrategy, jsonToMd,
│                 templateFilter, assetPacker, assetClassifier,
│                 assetRecommender, exporters/
├── types/        moa.ts (single source of truth)
└── i18n/         en.json, zh.json
```
