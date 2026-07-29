# Knowledge Vault Design Document

> Verdex's knowledge asset management system — upgrading Knowledge Assets from "ephemeral by-products of a session" into "an independent, manageable, intelligent knowledge repository."
>
> Document version: 0.1 (design discussion draft) · 2026-07-29 · Status: direction confirmed, phased implementation

---

## 0. Why We Need Knowledge Vault

### Current Problems

Verdex's current Knowledge Assets are **by-products that live inside sessions**:
- Buried in Settings → 📦 Assets tab (mixed in with Provider/Schema)
- Only list + delete is possible; the content is invisible
- No categorization, search, or organization
- Users don't know what's in there, or when they should reference it

### Core Contradiction

Knowledge Assets are Verdex's **core value output** ("The compiler for reusable AI knowledge"), yet in the UI they're treated as a secondary settings item.

### Direction

Promote Knowledge Asset management to a **first-class citizen** of Verdex — an independent, fully-featured Knowledge Vault, with its own entry point, interface, category system, search capabilities, and AI-assisted management.

---

## 1. Position in the Verdex Architecture

```
┌─ Verdex ──────────────────────────────────────────────┐
│                                                        │
│  Sidebar:                                              │
│  ├─ 💬 Sessions (chat / analysis / extract — existing) │
│  ├─ 📚 Knowledge Vault (Knowledge Vault — new module)  │
│  │   ├─ Asset browsing (list / cards / category sidebar)│
│  │   ├─ Asset detail (full content / sources / metadata)│
│  │   ├─ Category management (AI auto-categorization + manual)│
│  │   ├─ Search / filter (full-text / category / tags)  │
│  │   ├─ AI usage suggestions (recommend assets for the current question)│
│  │   ├─ Ad-hoc grouping (organize relevant assets for a specific question)│
│  │   ├─ Export (Claude Skill/MD/JSON/MCP)             │
│  │   └─ Reference management (which sessions use which assets)│
│  └─ ⚙️ Settings (Provider/Schema/templates — trimmed)  │
│                                                        │
│  Remove 📦 Assets tab from Settings → move to Knowledge Vault│
└────────────────────────────────────────────────────────┘
```

The Knowledge Vault is **bidirectional**:
- **Check-in**: session output → auto/manual ingest into the vault
- **Check-out**: vault assets → reference in new sessions / export to external tools

---

## 2. Core Feature Design

### 2.1 Dedicated Entry Point and Interface

Add a "📚 Knowledge Vault" button to the sidebar; clicking it switches to the vault main view:

```
┌──────────────────────────────────────────────────────┐
│ 📚 Knowledge Vault                 [Search] [Filter▼] │
├──────────┬───────────────────────────────────────────┤
│ Category │ Asset list                                 │
│          │                                           │
│ All (12) │ ┌─────────────────────────────────────┐  │
│ ├ Investing(5)│ │ Grantham Investment Model   [Investing][Analysis]│  │
│ ├ Tech(3)│ │ Multi-model analysis investment strategy asset... │  │
│ ├ Mgmt(2)│ │ 🎯 Consensus: Mean reversion... 📎 3 sources │  │
│ ├ Market(2)│ │ [View] [Reference] [Export] [Delete]│  │
│ └ Uncat. │ └─────────────────────────────────────┘  │
│          │ ┌─────────────────────────────────────┐  │
│ + New    │ │ AI Bubble Analysis Framework  [Tech][Market]│  │
│          │ │ ...                                 │  │
│          │ └─────────────────────────────────────┘  │
├──────────┴───────────────────────────────────────────┤
│ 💡 AI suggestion: For "analyze a new-energy report", recommend referencing [Investing] [Market]│
└──────────────────────────────────────────────────────┘
```

Asset cards can be expanded to view the full content (consensus/divergences/blindspots/verdict/sources/metadata).

### 2.2 Auto-Categorization (AI Categorization)

When adding an asset, AI categorizes it automatically:

```
New Asset created
  ↓
Call model: "Which category does this knowledge asset belong to?"
  Input:  asset.name + asset.description + asset.consensus (first 200 chars)
  Output: category name (e.g. "Investing" / "Tech" / "Management")
  ↓
Match existing category → assign; no match → AI creates new category
```

- Categories **don't need to be predefined** — the AI creates them automatically based on content
- Users can **rename / merge / delete** categories
- A single asset can belong to **multiple categories** (tagging system, not a tree)

### 2.3 AI Usage Suggestions

Recommend relevant assets when analyzing a new question:

```
User asks: "Analyze the investment value of this new-energy research report"
  ↓
Search the vault: match name / description / consensus / tags
  ↓
Recommend: "Grantham Investment Model" (matches "Investing")
           "AI Bubble Analysis Framework" (matches "new-tech evaluation")
  ↓
User checks with one click → injected into Panel context
```

The first version uses keyword matching; once we've accumulated more data we'll upgrade to semantic recommendation.

### 2.4 Ad-Hoc Extraction Groups 🔜 Later

> Keyword-based recommendation (§2.3) is already implemented and covers most recommendation scenarios. Ad-hoc grouping (the AI cross-categorizing related assets) is left as an enhancement for later.

The AI temporarily organizes a set of related assets from the vault (without changing permanent categories):

```
User: "I want to analyze the new-energy industry"
  ↓
AI ad-hoc group:
  ├─ Investing: Grantham Investment Model, Valuation Framework
  ├─ Market:    AI Bubble Analysis, New-Energy Trends
  └─ Tech:      Battery Technology Evaluation
```

Ad-hoc groups are disposable, unless the user chooses "save as permanent group."

### 2.5 Search and Filter

| Dimension | Description |
|---|---|
| Full-text search | name/description/consensus/divergences/blindspots/verdict |
| By category | Click the category tree on the left to filter |
| By tags | User-defined tags |
| By source | Original document name | 🔜 Later |
| By time | Creation time range | 🔜 Later (currently only supports sort by newest/oldest/name)|
| By task type | extract/analysis/quick_qa |

### 2.6 Multi-Select Reference + Panel Injection

Add a multi-select "Reference assets" control to the config bar:

```
Reference assets: [✓ Grantham Investment Model] [✓ AI Bubble Framework] [ Valuation Model]
```

The content of the selected Assets is formatted and injected into the Panel system prompt.

### 2.7 Asset Editing

Editable: name / description / categories / tags / consensus / divergences / blindspots / verdict. Not supported: editing structuredData (JSON is not suitable for manual editing).

### 2.8 Reference Management

The vault can show which sessions reference each Asset.

---

## 3. Data Model Changes

```ts
// KnowledgeAsset extension
interface KnowledgeAsset {
  // ... existing fields ...
  categories: string[];      // category id list (multi-category)
  tags?: string[];           // user-defined tags
  lastUsedAt?: number;       // last time referenced
  useCount?: number;         // number of times referenced
}

// New
interface AssetCategory {
  id: string;
  name: string;
  color?: string;
  isAuto: boolean;           // AI-created vs user-created
}

// ConfigFile extension
interface ConfigFile {
  knowledgeAssets: KnowledgeAsset[];
  assetCategories: AssetCategory[];  // new
}

// MoASessionConfig extension
interface MoASessionConfig {
  referenceAssetIds: string[];  // multi-select reference (replaces singular)
}
```

---

## 4. UI Component Structure

```
src/components/
├── KnowledgeVault/              ← new directory
│   ├── VaultView.tsx            ← vault main view
│   ├── AssetCard.tsx            ← asset card (expand/collapse)
│   ├── AssetDetail.tsx          ← asset detail
│   ├── CategoryTree.tsx         ← category sidebar
│   ├── AssetSearch.tsx          ← search / filter
│   ├── AISuggestion.tsx         ← AI usage suggestions
│   └── AssetEditor.tsx          ← asset editor
├── Sidebar.tsx                  ← add "📚 Knowledge Vault" entry
└── SettingsModal.tsx            ← remove 📦 Assets tab
```

---

## 5. Implementation Roadmap (5 Phases)

### Phase 1: Standalone Vault + Browsing (1-2 days)
- Sidebar entry point
- VaultView main view
- AssetCard expand/collapse
- Remove Assets tab from Settings
- Simple search

### Phase 2: Multi-Select Reference + Panel Injection (1-2 days)
- referenceAssetIds multi-select
- Reference picker in the config bar
- Inject Asset context on send

### Phase 3: AI Auto-Categorization (2-3 days)
- Persist AssetCategory
- Category service classifyAsset
- Category sidebar + filtering

### Phase 4: AI Suggestions + Ad-Hoc Groups (3-5 days)
- Keyword matching recommendation
- AISuggestion bar
- Ad-hoc groups

### Phase 5: Editing + Reference Management (2-3 days)
- AssetEditor
- Reference tracking
- Export enhancements

---

## 6. Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Standalone entry point | ✅ First-class citizen in the sidebar | Assets are the core value |
| Category system | Tagging system (multi-category) | Flexible |
| Category creation | AI auto + manual adjustment | Doesn't require users to predefine |
| AI suggestions | Keyword first, then semantic | Phased |
| Ad-hoc groups | Ephemeral | Doesn't pollute permanent categories |
| Reference | Multi-select | Usually need to reference several |
| Settings Assets tab | Remove | Moved to the vault |

---

## 7. One-Line Positioning

> **Knowledge Vault is the core of Verdex's knowledge asset management — turning the output of each analysis from "disposable" into "categorizable, searchable, referenceable, and exportable persistent knowledge assets." Verdex is upgraded from an "analysis tool" into a "knowledge factory."**

---

*Design document version 0.1 · 2026-07-29 · 5-phase incremental implementation*
