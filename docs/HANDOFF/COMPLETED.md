# Completed Features Checklist

> v0.1.3 · All ✅ Verified (84/84 tests · tsc 0 · build OK)
> Last updated: 2026-07-29

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

## Protocol Adapter (httpClient.ts)

- OpenAI / Anthropic dual protocol
- SSE streaming + non-streaming fallback
- Base URL normalization
- External cancel signal (Stop button)
