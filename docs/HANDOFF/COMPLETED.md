# Completed Features Checklist

> v0.2.2 · All ✅ Verified (88/88 tests · tsc 0 · build OK)
> Last updated: 2026-08-03

## Core Orchestration

| Module | File | Description |
|---|---|---|
| **Three-Stage Architecture (taskType)** | types/moa.ts, moaEngine.ts, useMoa.ts | document_extract / document_analysis / quick_qa |
| **Multi-Turn Memory (Sliding Window)** | services/memoryBuilder.ts | Independent history per Panel/Judge, sliding window of N turns |
| **Hierarchical Summary Memory** | services/summarizer.ts | Compresses early conversation via model when over limit (con.txt four categories) |
| **Document Input** | services/fileReader.ts | txt/md via browser file input |
| **Schema Extraction** | services/schemaValidator.ts | verdict/extract dual-mode + 3x rewrite loop |
| **Map-Reduce** | services/mapreduceStrategy.ts | Adaptive triggering (single-pass preferred) |
| **ASR Cleaning** | services/cleaner.ts | Fixes typos when attachments are loaded |
| **document_analysis** | hooks/useMoa.ts send | Extract → multi-model analysis → Judge synthesis |

## Stepped Config Bar (Refactored 2026-07-29)

| Feature | File | Description |
|---|---|---|
| 5-step guided flow | components/MoAConfigBar.tsx | ❶ Task → ❷ Document → ❸ Structure → ❹ Analysis → ❺ Options |
| Conditional display | same as above | Show/hide steps based on taskType |
| Advanced collapsible section | same as above | Collapsible role template + collision strategy |
| Removed simple/advanced modes | same as above | Replaced old mode toggle with advanced collapsible section |

## Knowledge Vault (All 5 Stages Complete)

| Stage | File | Description |
|---|---|---|
| **1. Standalone Repository** | components/VaultView.tsx + Sidebar.tsx | Dedicated sidebar entry + browse/search |
| **2. Multi-select Reference** | MoAConfigBar + useMoa.ts | referenceAssetIds + Panel injection |
| **3. AI Classification** | services/assetClassifier.ts | Auto/batch/manual classification + model selection |
| **4. AI Recommendation** | services/assetRecommender.ts + ChatInput.tsx | Real-time recommendation chips while typing |
| **5. Edit + Tracking** | VaultView.tsx + useMoa.ts | Edit name/description/tags + reference tracking |
| **Filter + Sort** | VaultView.tsx | Task type filtering + newest/oldest/name sort |

## Knowledge Asset

| Feature | File | Description |
|---|---|---|
| Type definitions | types/moa.ts | KnowledgeAsset + AssetCategory + AssetExportFormat |
| Packing | services/assetPacker.ts | packVerdictAsset / packExtractAsset / packFromTurn |
| 4 exporters | services/exporters/index.ts | Claude Skill / Markdown / JSON / Verdex Native |
| Export button | components/AssetExportButton.tsx | Export within conversation + save to asset |
| Persistence | configStore.ts + useMoa.ts | knowledgeAssets + assetCategories in config.json |
| Auto-save | MoAConfigBar.tsx | Toggle + auto-pack after send completes |

## UX Improvements

| Feature | File | Description |
|---|---|---|
| ⏱ Run timer | hooks/useElapsed.ts + components/TurnTimer.tsx | Ticks every second |
| 🛑 Stop button | httpClient.ts | streamChat adds externalSignal (AbortController) |
| 📊 Stage progress | components/MapReduceMessage.tsx | Map X/N + Reduce status |
| 📋 Copy as MD | services/jsonToMd.ts | Button next to extract/mapreduce results |

## Infrastructure

| Feature | File | Description |
|---|---|---|
| .env configuration | services/envConfig.ts | VITE_ prefix, dual Provider |
| Language filtering | services/templateFilter.ts | Show Chinese/English templates by language |
| Template management | SettingsModal.tsx | Schemas tab (Assets tab moved to Vault) |
| Help documentation | HelpModal.tsx | Three stages + configuration + core flow + applicable scenarios |
| Clear pre-shipped providers | config.template.json | providers=[] relies only on .env seeds |
| Welcome / empty state | App.tsx EmptyState | Icon + title, no sample noise |

## Engine Core (moaEngine.ts)

- Promise.all concurrent Panels (never rejects)
- Panel single retry (transient errors)
- Judge validation rewrite loop (extract mode, 3 times)
- Map-Reduce early branch
- Map-Reduce branch aborted check
- outputKind routing (verdict/extract)
- document_analysis: stage 1 extract → stage 2 Panel → stage 3 Judge
- **Empty-response retry** (v0.2.2): a panel returning an empty stream now triggers one retry (BUG #2 fix)

## P0 Bug Fixes (v0.2.2)

| Fix | File | Description |
|---|---|---|
| **Export field-mixing** | services/assetPacker.ts | `packExtractAsset` now detects the four-field verdict shape in extract data and splits values correctly (instead of joining all four into one blob); +3 regression tests |
| **Export redundant section** | services/exporters/index.ts | Markdown / Claude-Skill exporters skip the "Structured Data" section when it duplicates the four verdict fields; +1 regression test |
| **Panel empty-response retry** | services/moaEngine.ts | `runPanel` retries on empty completion (not just thrown errors) — addresses the systemic empty-response problem seen in benchmarks |

## P2 Execution-Understanding Fixes

| Fix | File | Description |
|---|---|---|
| **Extract prompt alignment** | scripts/benchmark.ts | Extract prompt aligned to production path (JSON, system msg, temp 0.3, maxTokens 8192); eliminated 6/13 empty responses |
| **Judge Expert-leak cleanup** | services/moaEngine.ts | `stripPanelMeta()` in parseJudgeResponse rewrites "Expert 1/2" → neutral prose; M3 leak 10/13 → 0/13 |
| **Judge prompt rewrite** | services/moaEngine.ts | Removed "expert" framing; renderPanelBlock uses "Analysis from <model>" headers |
| **Quality benchmark (clean)** | bench-results/ | 5-case blinded grading: M3 beats M2 (accuracy 4.6 vs 4.2, pref 9/10 vs 1/10) |

## Benchmark Harness (P1)

| Feature | File | Description |
|---|---|---|
| **5-mode benchmark** | scripts/benchmark.ts | M1 single-shot / M1R +retry / M2 single-model pipeline / M3 multi-model Panel+Judge / M4 single self-critique; drives the real engine |
| **Run modes** | same | `npm run bench` (incremental M1R+M4) / `--full` (all 5) / `--remediate` (re-run M2+M3 only) |
| **Corpus** | bench-samples/ | 13 cases (EN summary + 7 zh-TW ASR + 3 large + 1 super-large + 1 multi-doc); swappable for other domains |
| **Blinded grading pack** | scripts/extract-grading.ts | Generates per-case A/B files for LLM/human blinded grading; A/B→mode mapping kept in quality-grading-key.json |
| **Engineering Report** | separate paper repository (+CN) | Reproducible report: "Structured Task Decomposition Improves Reliability of LLM-Based Knowledge Analysis" |
| **Process archive** | docs/HANDOFF/BENCHMARK_JOURNEY.md (+CN) | Full chronological record of the P0→P1 work, including bugs found and external reviews |

## Protocol Adapter (httpClient.ts)

- OpenAI / Anthropic dual protocol
- SSE streaming + non-streaming fallback
- Base URL normalization
- External cancel signal (Stop button)
